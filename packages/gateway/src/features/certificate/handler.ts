/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * OpenCRVS is also distributed under the terms of the Civil Registration
 * & Healthcare Disclaimer located at http://opencrvs.org/license.
 *
 * Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.
 */

import { Request, ResponseToolkit } from '@hapi/hapi'
import fetch from 'node-fetch'
import { viewDeclaration } from '@gateway/workflow'
import { getAuthHeader } from '@opencrvs/commons/http'
import { getTransformerForCountry } from './transformers'

/**
 * Generate certificate via certificate-service DIRECTLY
 *
 * Flow:
 * 1. Fetch FHIR bundle from /records/{id}/view
 * 2. Transform FHIR to certificate DTO
 * 3. Call certificate-service API directly
 * 4. Return PDF
 *
 * POST /certificate/generate
 * Body: { compositionId: string, eventType: "birth" | "death" | "marriage" }
 */
export async function generateCertificateHandler(
  request: Request,
  h: ResponseToolkit
) {
  try {
    const { format } = request.query as { format?: string }
    const requestedFormat = format?.toLowerCase()

    const { compositionId, eventType } = request.payload as {
      compositionId: string
      eventType: 'birth' | 'death' | 'marriage'
    }

    const authHeader = getAuthHeader(request)
    const CERTIFICATE_SERVICE_URL = process.env.CERTIFICATE_SERVICE_URL || 'http://localhost:3890'

    console.log(`[Certificate] Generating ${eventType} certificate for ${compositionId}`)

    // Step 1: Fetch FHIR bundle from workflow service
    let bundle
    try {
      bundle = await viewDeclaration(compositionId, authHeader)
    } catch (error: any) {
      console.error('[Certificate] Failed to fetch FHIR bundle:', error.message)
      return h
        .response({
          error: 'Failed to fetch registration data',
          message: error.message || 'Could not fetch record'
        })
        .code(404)
    }

    // Step 2: Transform FHIR → Certificate DTO using country-specific transformer
    const countryCode = process.env.COUNTRY_CODE || 'ATG'
    const transformer = getTransformerForCountry(countryCode)
    const certificateRequest = transformer(bundle, eventType)

    console.log(
      `[Certificate] Using transformer for ${countryCode}, calling certificate-service with template: ${certificateRequest.templateName}`
    )

    // Step 3: Call certificate-service API
    const certResponse = await fetch(`${CERTIFICATE_SERVICE_URL}/api/certificates/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(certificateRequest)
    })

    if (!certResponse.ok) {
      const errorText = await certResponse.text()
      console.error('[Certificate] Certificate-service error:', errorText)
      return h
        .response({
          error: 'Failed to generate certificate',
          message: `Certificate-service error: ${certResponse.status}`
        })
        .code(certResponse.status)
    }

    const certData = await certResponse.json()

    // Step 4: Extract desired format and return
    if (requestedFormat === 'jpg') {
      const normalizePage = (page: any, index: number) => ({
        pageNumber: page?.pageNumber ?? page?.page ?? index + 1,
        filename:
          page?.filename ||
          `certificate-${compositionId}-page-${(page?.pageNumber ?? index + 1)
            .toString()
            .padStart(2, '0')}.jpg`,
        contentType: page?.contentType || 'image/jpeg',
        sizeBytes: page?.sizeBytes,
        base64: page?.base64
      })

      const jpgPages =
        Array.isArray(certData.jpgPages) && certData.jpgPages.length > 0
          ? certData.jpgPages
              .filter((page: any) => page?.base64)
              .map((page: any, index: number) => normalizePage(page, index))
          : []

      if (jpgPages.length > 0) {
        console.log(
          `[Certificate] Successfully generated ${jpgPages.length} JPG preview page(s)`
        )
        return h
          .response({ pages: jpgPages })
          .type('application/json')
      }

      if (certData.jpg?.base64) {
        console.log(
          '[Certificate] JPG preview requested but multi-page data missing, returning single-page preview'
        )
        return h
          .response({
            pages: [normalizePage(certData.jpg, 0)]
          })
          .type('application/json')
      }

      console.warn(
        '[Certificate] JPG preview requested but not available, falling back to PDF response'
      )
    }

    if (!certData.pdf || !certData.pdf.base64) {
      console.error('[Certificate] No PDF in response')
      return h
        .response({
          error: 'Invalid certificate response',
          message: 'Certificate-service did not return PDF data'
        })
        .code(500)
    }

    const pdfBuffer = Buffer.from(certData.pdf.base64, 'base64')
    console.log(`[Certificate] Successfully generated PDF (${pdfBuffer.length} bytes)`)

    return h
      .response(pdfBuffer)
      .type('application/pdf')
      .header(
        'Content-Disposition',
        `inline; filename="certificate-${compositionId}.pdf"`
      )
  } catch (error: any) {
    console.error('[Certificate] Error:', error)
    return h
      .response({
        error: 'Failed to generate certificate',
        message: error.message
      })
      .code(500)
  }
}
