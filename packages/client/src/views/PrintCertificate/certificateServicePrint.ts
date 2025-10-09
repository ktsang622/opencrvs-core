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

import { IPrintableDeclaration } from '@client/declarations'
import { EventType } from '@client/utils/gateway'
import { isMobileDevice } from '@client/utils/commonUtils'

/**
 * Print certificate using Toppan certificate-service
 *
 * This function:
 * 1. Calls gateway certificate endpoint to generate PDF via certificate-service
 * 2. Downloads the PDF blob
 * 3. Opens print dialog or downloads file (depending on device)
 */
export async function printViaCertificateService(
  declaration: IPrintableDeclaration,
  authToken: string
): Promise<void> {
  const compositionId = declaration.id
  const eventType = mapEventType(declaration.event)

  try {
    // Call gateway certificate endpoint
    const response = await fetch(
      `${window.config.API_GATEWAY_URL}/certificate/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          compositionId,
          eventType
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Certificate generation failed: ${response.status} ${errorText}`
      )
    }

    // Get PDF blob
    const pdfBlob = await response.blob()

    // Create object URL for the PDF
    const pdfUrl = URL.createObjectURL(pdfBlob)

    if (isMobileDevice()) {
      // On mobile, download the PDF
      const link = document.createElement('a')
      link.href = pdfUrl
      link.download = `certificate-${compositionId}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      // On desktop, open PDF in new window and trigger print dialog
      const printWindow = window.open(pdfUrl, '_blank')
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print()
        })
      }
    }

    // Clean up object URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(pdfUrl)
    }, 1000)
  } catch (error) {
    console.error('Error printing via certificate-service:', error)
    throw error
  }
}

/**
 * Get preview image/PDF from certificate-service for display in review page
 *
 * Returns a URL that can be used in <img> or <iframe> to show the certificate preview
 */
export async function getCertificatePreviewUrl(
  declaration: IPrintableDeclaration,
  authToken: string
): Promise<string | null> {
  const compositionId = declaration.id
  const eventType = mapEventType(declaration.event)

  try {
    const response = await fetch(
      `${window.config.API_GATEWAY_URL}/certificate/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          compositionId,
          eventType
        })
      }
    )

    if (!response.ok) {
      console.error('Failed to get certificate preview:', response.status)
      return null
    }

    const pdfBlob = await response.blob()
    return URL.createObjectURL(pdfBlob)
  } catch (error) {
    console.error('Error getting certificate preview:', error)
    return null
  }
}

function mapEventType(event: EventType): 'birth' | 'death' | 'marriage' {
  switch (event) {
    case EventType.Birth:
      return 'birth'
    case EventType.Death:
      return 'death'
    case EventType.Marriage:
      return 'marriage'
    default:
      return 'birth'
  }
}
