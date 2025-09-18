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

// TOPPAN MIGRATION NOTE - Universal Document Viewer:
// This file has been significantly enhanced to support both images and PDFs.
//
// Key changes made by Kevin Tsang:
// 1. Added PDF detection and browser-native PDF rendering
// 2. Implemented security validations to prevent XSS attacks
// 3. Added graceful error handling with fallback options
// 4. Enhanced responsive design for full viewport PDF display
// 5. Conditional UI controls (zoom/rotate hidden for PDFs)
//
// Migration requirements for new OpenCRVS releases:
// - Verify that PDF detection logic remains compatible
// - Check if new release has conflicting document viewer features
// - Ensure security validations don't break with new patterns
// - Test that both modal previews and side panel viewers work
// - Validate that responsive design works with new UI frameworks
//
// Dependencies: Feature flag ENHANCED_DOCUMENT_VIEWER, browser PDF support
import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Select, ISelectOption as SelectComponentOptions } from '../Select'
import PanViewer from './components/PanViewer'
import PanControls from './components/PanControls'

// Helper function to detect if URL is a PDF
function isPdfUrl(url: string): boolean {
  return (
    url.toLowerCase().includes('.pdf') ||
    url.includes('application/pdf') ||
    url.startsWith('data:application/pdf')
  )
}

// Security: Validate and sanitize PDF URLs
function isValidPdfUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false
  }
  
  // Allow data URLs with PDF content
  if (url.startsWith('data:application/pdf;base64,')) {
    return true
  }
  
  // Allow HTTP/HTTPS URLs ending with .pdf
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

const ViewerWrapper = styled.div`
  position: relative;
  background-color: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.grey300};
  border-radius: 4px;
  box-sizing: border-box;
  height: calc(100vh - 104px);
  width: 100%;
  overflow: hidden;
  @media (max-width: ${({ theme }) => theme.grid.breakpoints.lg}px) {
    display: none;
  }
`

const ViewerContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`
const ViewerHeader = styled.div`
  height: 64px;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 16px;
  z-index: 99;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.colors.white};
  border-bottom: 1px solid ${({ theme }) => theme.colors.grey300};
`

const ViewerImage = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
`

const PDFContainer = styled.div`
  width: 100%;
  flex: 1;
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
  color: ${({ theme }) => theme.colors.grey600};

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

export interface IDocumentViewerOptions {
  selectOptions: SelectComponentOptions[]
  documentOptions: SelectComponentOptions[]
}

interface IProps {
  id?: string
  options: IDocumentViewerOptions
  children?: React.ReactNode
}

export const DocumentViewer = ({ id, options, children }: IProps) => {
  const [selectedOption, setSelectedOption] = useState(
    options.selectOptions[0]?.value || ''
  )
  const [selectedDocument, setSelectedDocument] = useState(
    options.documentOptions[0]?.value || ''
  )
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [pdfError, setPdfError] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const isPdf = isPdfUrl(selectedDocument)
  const isValidPdf = isValidPdfUrl(selectedDocument)

  useEffect(() => {
    setSelectedOption(options.selectOptions[0]?.value || '')
    setSelectedDocument(options.documentOptions[0]?.value || '')
    setPdfError(false) // Reset PDF error when document changes
    setPdfLoading(false) // Reset loading state
  }, [options])

  const zoomIn = () => {
    setZoom((prev) => prev + 0.2)
  }

  const zoomOut = () => {
    setZoom((prev) => {
      if (prev >= 1) {
        return prev - 0.2
      }
      return prev
    })
  }

  const rotateLeft = () => {
    setRotation((prev) => (prev - 90) % 360)
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

  const isSupportingDocumentsEmpty =
    selectedDocument && selectedDocument.length > 0

  return (
    <ViewerWrapper id={id}>
      <>
        <ViewerContainer>
          <ViewerHeader>
            <Select
              id="select_document"
              options={options.selectOptions}
              color="inherit"
              value={selectedOption}
              onChange={(val: string) => {
                const imgArray = options.documentOptions.filter((doc) => {
                  return doc.label === val
                })
                if (imgArray[0]) {
                  setSelectedDocument(imgArray[0].value)
                  setSelectedOption(val)
                }
              }}
            />
            {!isPdf && (
              <PanControls
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                rotateLeft={rotateLeft}
              />
            )}
          </ViewerHeader>
          {isSupportingDocumentsEmpty && (
            <>
              {isPdf ? (
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
                        href={selectedDocument}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          // Security: Additional validation before opening
                          if (!isValidPdfUrl(selectedDocument)) {
                            e.preventDefault()
                          }
                        }}
                      >
                        Open PDF in new tab
                      </a>
                    </PDFError>
                  ) : pdfLoading ? (
                    <PDFLoading>
                      <div>📄</div>
                      <div>Loading PDF...</div>
                    </PDFLoading>
                  ) : (
                    <embed
                      src={selectedDocument}
                      type="application/pdf"
                      onLoad={handlePdfLoad}
                      onError={handlePdfError}
                      onLoadStart={handlePdfLoadStart}
                    />
                  )}
                </PDFContainer>
              ) : (
                <ViewerImage>
                  <PanViewer
                    id="document_image"
                    image={selectedDocument}
                    zoom={zoom}
                    rotation={rotation}
                  />
                </ViewerImage>
              )}
            </>
          )}
          {children}
        </ViewerContainer>
      </>
    </ViewerWrapper>
  )
}
