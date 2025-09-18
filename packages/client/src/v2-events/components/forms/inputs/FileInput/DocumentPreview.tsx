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

// TOPPAN MIGRATION NOTE - V2 Events Document Preview with PDF Support:
// This file has been enhanced to support PDF document previews in the v2 events system.
//
// Key changes made by Kevin Tsang:
// 1. Added feature flag check for ENHANCED_DOCUMENT_VIEWER support
// 2. Implemented PDF detection based on filename extension
// 3. Added browser-native PDF rendering with embed element for v2 events
// 4. Enhanced security validation for PDF URLs using full URL resolution
// 5. Conditional zoom/rotate controls (hidden for PDFs, shown for images)
// 6. Added graceful error handling and loading states for PDF display
//
// Migration requirements for new OpenCRVS releases:
// - Verify that window.config.FEATURES pattern remains available
// - Check if FileFieldValue and FileFieldValueWithOption interfaces remain compatible
// - Ensure getFullUrl function from file upload hooks continues to work
// - Test that browser PDF support remains reliable in v2 events context
// - Validate that security validation patterns work with new URL schemes
//
// Dependencies: v2-events file upload system, window.config feature flags
// Related: Works with v2-events FileInput components for complete PDF workflow

import * as React from 'react'
import { useState } from 'react'
import styled from 'styled-components'
import { FileFieldValue } from '@opencrvs/commons/client'
import { AppBar } from '@opencrvs/components/lib/AppBar'
import { Button } from '@opencrvs/components/lib/Button'
import { DividerVertical } from '@opencrvs/components/lib/Divider'
import PanControls from '@opencrvs/components/lib/DocumentViewer/components/PanControls'
import PanViewer from '@opencrvs/components/lib/DocumentViewer/components/PanViewer'
import { Icon } from '@opencrvs/components/lib/Icon'
import { Stack } from '@opencrvs/components/lib/Stack'
import { FileFieldValueWithOption } from '@opencrvs/commons/client'
import { getFullUrl } from '@client/v2-events/features/files/useFileUpload'

const ViewerWrapper = styled.div`
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  background: ${({ theme }) => theme.colors.white};
`

const ViewerContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  & img {
    max-height: 80vh;
    max-width: 80vw;
    width: auto;
  }
`

const PDFContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;

  & embed {
    width: 100%;
    height: 100%;
    border: none;
  }
`

const PDFError = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px;
  text-align: center;

  & a {
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: underline;
  }
`

const PDFLoading = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.grey600};
`

interface IProps {
  previewImage:
    | NonNullable<FileFieldValue>
    | NonNullable<FileFieldValueWithOption>
  disableDelete?: boolean
  title?: string
  goBack: () => void
  onDelete: (image: FileFieldValue) => void
  id?: string
}

// Helper to check if enhanced document viewer is enabled
function isEnhancedDocumentViewerEnabled(): boolean {
  return window.config?.FEATURES?.ENHANCED_DOCUMENT_VIEWER === true
}

// Helper to check if file is PDF
function isPDFFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.pdf')
}

// Security: Validate PDF URLs for v2-events
function isValidPdfUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false
  }
  
  try {
    const urlObj = new URL(url)
    return (
      (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') &&
      url.toLowerCase().endsWith('.pdf')
    )
  } catch {
    return false
  }
}

export function DocumentPreview({
  previewImage,
  title,
  goBack,
  onDelete,
  disableDelete,
  id
}: IProps) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [pdfError, setPdfError] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const isPDF = isPDFFile(previewImage.filename)
  const showPDF = isEnhancedDocumentViewerEnabled() && isPDF
  const pdfUrl = getFullUrl(previewImage.filename)
  const isValidPdf = isValidPdfUrl(pdfUrl)

  function zoomIn() {
    setZoom((prevState) => prevState + 0.2)
  }
  function zoomOut() {
    setZoom((prevState) => (prevState >= 1 ? prevState - 0.2 : prevState))
  }
  function rotateLeft() {
    setRotation((prevState) => (prevState - 90) % 360)
  }

  const handlePdfError = () => {
    setPdfError(true)
    setPdfLoading(false)
  }

  const handlePdfLoad = () => {
    setPdfLoading(false)
    setPdfError(false)
  }

  const handlePdfLoadStart = () => {
    setPdfLoading(true)
    setPdfError(false)
  }

  return (
    <ViewerWrapper id={id ?? 'preview_image_field'}>
      <AppBar
        desktopLeft={<Icon name="Paperclip" size="large" />}
        desktopRight={
          <Stack gap={8}>
            {!showPDF && (
              <PanControls
                rotateLeft={rotateLeft}
                zoomIn={zoomIn}
                zoomOut={zoomOut}
              />
            )}
            {!disableDelete && (
              <>
                <DividerVertical />
                <Button
                  id="preview_delete"
                  type="icon"
                  onClick={() => onDelete(previewImage)}
                >
                  <Icon color="red" name="Trash" />
                </Button>
              </>
            )}
            <DividerVertical />
            <Button
              aria-label="Go close"
              id="preview_close"
              size="medium"
              type="icon"
              onClick={goBack}
            >
              <Icon name="X" size="medium" />
            </Button>
          </Stack>
        }
        desktopTitle={title}
        mobileLeft={<Icon name="Paperclip" size="large" />}
        mobileRight={
          <Stack gap={8}>
            {!showPDF && (
              <PanControls
                rotateLeft={rotateLeft}
                zoomIn={zoomIn}
                zoomOut={zoomOut}
              />
            )}
            {!disableDelete && (
              <Button
                id="preview_delete"
                type="icon"
                onClick={() => onDelete(previewImage)}
              >
                <Icon color="red" name="Trash" />
              </Button>
            )}
            <Button
              aria-label="Go back"
              id="preview_close"
              size="medium"
              type="icon"
              onClick={goBack}
            >
              <Icon name="X" size="medium" />
            </Button>
          </Stack>
        }
        mobileTitle={title}
      />

      <ViewerContainer>
        {showPDF ? (
          <PDFContainer>
            {!isValidPdf ? (
              <PDFError>
                <div>⚠️</div>
                <div>Invalid PDF file or URL</div>
                <div>Please upload a valid PDF document</div>
              </PDFError>
            ) : pdfError ? (
              <PDFError>
                <div>📄</div>
                <div>Unable to preview PDF in browser</div>
                <a
                  download="document.pdf"
                  href={pdfUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                  onClick={(e) => {
                    // Security: Additional validation before download
                    if (!isValidPdfUrl(pdfUrl)) {
                      e.preventDefault()
                    }
                  }}
                >
                  Download PDF to view
                </a>
              </PDFError>
            ) : pdfLoading ? (
              <PDFLoading>
                <div>📄</div>
                <div>Loading PDF...</div>
              </PDFLoading>
            ) : (
              <embed
                src={pdfUrl}
                type="application/pdf"
                onLoad={handlePdfLoad}
                onError={handlePdfError}
                onLoadStart={handlePdfLoadStart}
              />
            )}
          </PDFContainer>
        ) : (
          <PanViewer
            key={Math.random()}
            id="document_image"
            image={getFullUrl(previewImage.filename)}
            rotation={rotation}
            zoom={zoom}
          />
        )}
      </ViewerContainer>
    </ViewerWrapper>
  )
}
