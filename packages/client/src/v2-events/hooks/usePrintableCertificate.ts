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

import { Location } from '@events/service/locations/locations'
import {
  EventDocument,
  getCurrentEventState,
  isMinioUrl,
  User,
  CertificateTemplateConfig,
  LanguageConfig
} from '@opencrvs/commons/client'

import {
  addFontsToSvg,
  compileSvg,
  printAndDownloadPdf,
  svgToPdfTemplate
} from '@client/v2-events/features/events/actions/print-certificate/pdfUtils'
import { fetchImageAsBase64 } from '@client/utils/imageUtils'
import { config } from '@client/config'
import { getToken } from '@client/utils/authUtils'
import { useState, useEffect, useRef, useCallback } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function replaceMinioUrlWithBase64(template: Record<string, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function recursiveTransform(obj: any) {
    if (typeof obj !== 'object' || obj === null) {
      return obj
    }

    const transformedObject = Array.isArray(obj) ? [...obj] : { ...obj }

    for (const key in obj) {
      const value = obj[key]
      if (typeof value === 'string' && isMinioUrl(value)) {
        transformedObject[key] = await fetchImageAsBase64(value)
      } else if (typeof value === 'object') {
        transformedObject[key] = await recursiveTransform(value)
      } else {
        transformedObject[key] = value
      }
    }

    return transformedObject
  }
  return recursiveTransform(template)
}

/**
 * Print certificate using certificate-service for v2-events
 */
async function printViaCertificateService(
  eventId: string,
  authToken: string
): Promise<void> {
  try {
    const gatewayUrl = window.config.API_GATEWAY_URL.replace(/\/$/, '')
    const response = await fetch(
      `${gatewayUrl}/certificate/generate?format=jpg`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          compositionId: eventId,
          eventType: 'birth' // TODO: Derive from event type
        })
      }
    )

    if (!response.ok) {
      throw new Error(`Certificate generation failed: ${response.status}`)
    }

    const pdfBlob = await response.blob()
    const pdfUrl = URL.createObjectURL(pdfBlob)

    // Download PDF
    const link = document.createElement('a')
    link.href = pdfUrl
    link.download = `certificate-${eventId}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000)
  } catch (error) {
    console.error('Error printing via certificate-service:', error)
    throw error
  }
}

/**
 * Get PDF preview URL from certificate-service for v2-events
 */
interface CertificatePreviewPage {
  pageNumber: number
  url: string
  contentType: string
}

interface CertificatePreview {
  pages: CertificatePreviewPage[]
}

function base64ToObjectUrl(base64: string, contentType: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: contentType })
  return URL.createObjectURL(blob)
}

async function getCertificatePreviewUrl(
  eventId: string,
  authToken: string
): Promise<CertificatePreview | null> {
  try {
    const gatewayUrl = window.config.API_GATEWAY_URL.replace(/\/$/, '')
    const response = await fetch(
      `${gatewayUrl}/certificate/generate?format=jpg`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          compositionId: eventId,
          eventType: 'birth' // TODO: Derive from event type
        })
      }
    )

    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    const pages = Array.isArray(payload?.pages) ? payload.pages : []
    if (!pages.length) {
      return null
    }

    const previewPages: CertificatePreviewPage[] = pages
      .filter((page: any) => typeof page?.base64 === 'string')
      .map((page: any, index: number) => {
        const contentType = page?.contentType || 'image/jpeg'
        return {
          pageNumber: page?.pageNumber ?? index + 1,
          contentType,
          url: base64ToObjectUrl(page.base64, contentType)
        }
      })

    if (!previewPages.length) {
      return null
    }

    return { pages: previewPages }
  } catch (error) {
    console.error('Error getting certificate preview:', error)
    return null
  }
}

export const usePrintableCertificate = ({
  event,
  locations,
  users,
  certificateConfig,
  language,
  useCertificateService
}: {
  event: EventDocument
  locations: Location[]
  users: User[]
  certificateConfig?: CertificateTemplateConfig
  language?: LanguageConfig
  useCertificateService?: boolean
}) => {
  const currentState = getCurrentEventState(event)
  const modifiedState = {
    ...currentState,
    // Temporarily add `modifiedAt` to the last action's data to display
    // the current certification date in the certificate preview on the review page.
    modifiedAt: new Date().toISOString()
    // Since 'modifiedDate' represents the last action's 'createdAt' date, and when
    // we actually print certificate, in this particular case, last action is PRINT_CERTIFICATE
  }

  // Check if certificate-service is enabled (passed as parameter or from config)
  const shouldUseCertificateService = useCertificateService ?? config.FEATURES?.USE_CERTIFICATE_SERVICE ?? false

  // State for PDF preview URL
  const [certificatePreview, setCertificatePreview] = useState<CertificatePreview | null>(null)
  const [isLoadingPdf, setIsLoadingPdf] = useState(false)

  // Track if we've already fetched the preview to avoid duplicate calls
  const previewFetchedRef = useRef<string | null>(null)
  const previewCacheRef = useRef<CertificatePreview | null>(null)

  const revokePreview = useCallback((preview: CertificatePreview | null) => {
    if (!preview) return
    preview.pages.forEach((page) => {
      try {
        URL.revokeObjectURL(page.url)
      } catch (error) {
        console.warn('Failed to revoke preview URL', error)
      }
    })
  }, [])

  const updatePreview = useCallback(
    (next: CertificatePreview | null) => {
      if (previewCacheRef.current) {
        revokePreview(previewCacheRef.current)
      }
      previewCacheRef.current = next
      setCertificatePreview(next)
    },
    [revokePreview]
  )

  // Fetch PDF preview if using certificate-service
  // NOTE: Only fetch once per event ID to avoid duplicate certificate generation
  useEffect(() => {
    if (!shouldUseCertificateService) {
      previewFetchedRef.current = null
      updatePreview(null)
      return
    }

    if (!event?.id) {
      previewFetchedRef.current = null
      updatePreview(null)
      return
    }

    if (previewFetchedRef.current === event.id) {
      return
    }

    previewFetchedRef.current = event.id
    setIsLoadingPdf(true)
    const authToken = getToken()
    let cancelled = false

    getCertificatePreviewUrl(event.id, authToken)
      .then((preview) => {
        if (!cancelled) {
          if (preview) {
            updatePreview(preview)
          } else {
            previewFetchedRef.current = null
            updatePreview(null)
          }
          setIsLoadingPdf(false)
        } else if (preview) {
          revokePreview(preview)
        }
      })
      .catch((error) => {
        console.error('Failed to load PDF preview:', error)
        previewFetchedRef.current = null
        if (!cancelled) {
          updatePreview(null)
          setIsLoadingPdf(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [shouldUseCertificateService, event.id, updatePreview, revokePreview])

  useEffect(() => {
    return () => {
      revokePreview(previewCacheRef.current)
      previewCacheRef.current = null
    }
  }, [revokePreview])

  if (!language || !certificateConfig) {
    return {
      svgCode: null,
      certificatePreview: null,
      useCertificateService: false,
      isLoadingPdf: false
    }
  }

  const certificateFonts = certificateConfig.fonts ?? {}

  // Skip SVG generation if using certificate-service
  const svgWithoutFonts = shouldUseCertificateService ? '' : compileSvg({
    templateString: certificateConfig.svg,
    $state: modifiedState,
    $declaration: currentState.declaration,
    locations,
    users,
    language
  })

  const svgCode = shouldUseCertificateService ? null : addFontsToSvg(svgWithoutFonts, certificateFonts)

  const handleCertify = async (updatedEvent: EventDocument) => {
    // If using certificate-service, use new flow
    if (shouldUseCertificateService) {
      try {
        const authToken = getToken()
        await printViaCertificateService(updatedEvent.id, authToken)
      } catch (error) {
        console.error('Failed to print certificate via certificate-service:', error)
        throw error
      }
      return
    }

    // Original SVG-based flow
    const currentEventState = getCurrentEventState(updatedEvent)
    const base64ReplacedTemplate = await replaceMinioUrlWithBase64(
      currentEventState.declaration
    )

    const compiledSvg = compileSvg({
      templateString: certificateConfig.svg,
      $state: currentEventState,
      $declaration: {
        ...base64ReplacedTemplate,
        preview: false
      },
      locations,
      users,
      language
    })

    const compiledSvgWithFonts = addFontsToSvg(compiledSvg, certificateFonts)
    const pdfTemplate = svgToPdfTemplate(compiledSvgWithFonts, certificateFonts)
    printAndDownloadPdf(pdfTemplate, event.id)
  }
  return {
    svgCode,
    handleCertify,
    certificatePreview,
    useCertificateService: shouldUseCertificateService,
    isLoadingPdf
  }
}
