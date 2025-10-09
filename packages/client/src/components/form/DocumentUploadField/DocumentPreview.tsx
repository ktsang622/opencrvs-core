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

// TOPPAN MIGRATION NOTE - Document Preview with PDF Support:
// This file has been enhanced to support PDF document previews alongside images.
//
// Key changes made by Kevin Tsang:
// 1. Added PDF detection logic for IFileValue and IAttachmentValue types
// 2. Implemented browser-native PDF rendering with embed element
// 3. Added security validation for PDF data URLs to prevent XSS
// 4. Enhanced UI with PDF-specific error handling and loading states
// 5. Conditional zoom/rotate controls (hidden for PDFs, shown for images)
// 6. Added graceful fallback download option for unsupported PDF viewers
//
// Migration requirements for new OpenCRVS releases:
// - Verify that IFileValue and IAttachmentValue interfaces remain compatible
// - Check if new document upload patterns conflict with PDF detection
// - Ensure security validation patterns don't break with new data formats
// - Test that browser PDF support remains reliable across target browsers
// - Validate that zoom/rotate controls work with new PanViewer implementations
//
// Dependencies: @opencrvs/components PanViewer/PanControls, styled-components
// Related: Works with DocumentUploader components for complete PDF workflow

import * as React from 'react'
import styled from 'styled-components'
import { IFileValue, IAttachmentValue } from '@client/forms'
import { AppBar } from '@opencrvs/components/lib/AppBar'
import { Stack } from '@opencrvs/components/lib/Stack'
import { Button } from '@opencrvs/components/lib/Button'
import { Icon } from '@opencrvs/components/lib/Icon'
import { DividerVertical } from '@opencrvs/components/lib/Divider'
import PanControls from '@opencrvs/components/lib/DocumentViewer/components/PanControls'
import PanViewer from '@opencrvs/components/lib/DocumentViewer/components/PanViewer'
import { useState } from 'react'

// Helper function to detect if file is PDF
function isPdfFile(file: IFileValue | IAttachmentValue): boolean {
  // Check the type property first
  if (file.type === 'application/pdf') {
    return true
  }

  // Check for PDF data URL prefix
  if (file.data && file.data.startsWith('data:application/pdf')) {
    return true
  }

  // Check file extension in URI (for IAttachmentValue)
  if ('uri' in file && file.uri && file.uri.toLowerCase().endsWith('.pdf')) {
    return true
  }

  // Check name property (for IAttachmentValue)
  if ('name' in file && file.name && file.name.toLowerCase().endsWith('.pdf')) {
    return true
  }

  return false
}

// Security: Validate PDF data URLs
function isValidPdfData(data: string): boolean {
  if (!data || typeof data !== 'string') {
    return false
  }

  // Allow base64-encoded PDF data URLs
  if (data.startsWith('data:application/pdf;base64,')) {
    return data.length > 30
  }

  // Allow http(s) and blob URLs while blocking other protocols
  const allowedProtocols = ['http:', 'https:', 'blob:']
  try {
    const baseOrigin =
      typeof window !== 'undefined' && window.location
        ? window.location.origin
        : 'http://localhost'
    const url = new URL(data, baseOrigin)
    return allowedProtocols.includes(url.protocol)
  } catch {
    return false
  }
}

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
  previewImage: IFileValue | IAttachmentValue
  disableDelete?: boolean
  title?: string
  goBack: () => void
  onDelete: (image: IFileValue | IAttachmentValue) => void
  id?: string
}

export const DocumentPreview = ({
  previewImage,
  title,
  goBack,
  onDelete,
  disableDelete,
  id
}: IProps) => {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [pdfError, setPdfError] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const isPdf = isPdfFile(previewImage)
  const isValidPdf = previewImage.data ? isValidPdfData(previewImage.data) : false

  // Debug logging
  React.useEffect(() => {
    console.log('[DocumentPreview] PDF Debug:', {
      previewImage,
      isPdf,
      isValidPdf,
      hasData: !!previewImage.data,
      dataLength: previewImage.data?.length,
      dataPreview: previewImage.data?.substring(0, 100)
    })
  }, [previewImage, isPdf, isValidPdf])

  const zoomIn = () => setZoom((prevState) => prevState + 0.2)
  const zoomOut = () =>
    setZoom((prevState) => (prevState >= 1 ? prevState - 0.2 : prevState))
  const rotateLeft = () => setRotation((prevState) => (prevState - 90) % 360)

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
        desktopTitle={title}
        desktopRight={
          <Stack gap={8}>
            {!isPdf && (
              <PanControls
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                rotateLeft={rotateLeft}
              />
            )}
            {!disableDelete && (
              <>
                {!isPdf && <DividerVertical />}
                <Button
                  id="preview_delete"
                  type="icon"
                  onClick={() => onDelete(previewImage)}
                >
                  <Icon name="Trash" color="red" />
                </Button>
              </>
            )}
            <DividerVertical />
            <Button
              id="preview_close"
              aria-label="Go close"
              size="medium"
              type="icon"
              onClick={goBack}
            >
              <Icon name="X" size="medium" />
            </Button>
          </Stack>
        }
        mobileLeft={<Icon name="Paperclip" size="large" />}
        mobileTitle={title}
        mobileRight={
          <Stack gap={8}>
            {!isPdf && (
              <PanControls
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                rotateLeft={rotateLeft}
              />
            )}
            {!disableDelete && (
              <Button
                id="preview_delete"
                type="icon"
                onClick={() => onDelete(previewImage)}
              >
                <Icon name="Trash" color="red" />
              </Button>
            )}
            <Button
              id="preview_close"
              aria-label="Go back"
              size="medium"
              type="icon"
              onClick={goBack}
            >
              <Icon name="X" size="medium" />
            </Button>
          </Stack>
        }
      />

      <ViewerContainer>
        {previewImage.data && (
          <>
            {isPdf ? (
              <PDFContainer>
                {!isValidPdf ? (
                  <PDFError>
                    <Icon name="Warning" size="large" color="red" />
                    <div>Invalid PDF file</div>
                    <div>Please upload a valid PDF document</div>
                  </PDFError>
                ) : pdfError ? (
                  <PDFError>
                    <Icon name="FileText" size="large" />
                    <div>Unable to preview PDF in browser</div>
                    <a
                      href={previewImage.data}
                      download="document.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        // Security: Additional validation before download
                        if (!isValidPdfData(previewImage.data)) {
                          e.preventDefault()
                        }
                      }}
                    >
                      Download PDF to view
                    </a>
                  </PDFError>
                ) : pdfLoading ? (
                  <PDFLoading>
                    <Icon name="FileText" size="large" />
                    <div>Loading PDF...</div>
                  </PDFLoading>
                ) : (
                  <embed
                    src={previewImage.data}
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
                image={previewImage.data}
                zoom={zoom}
                rotation={rotation}
              />
            )}
          </>
        )}
      </ViewerContainer>
    </ViewerWrapper>
  )
}
