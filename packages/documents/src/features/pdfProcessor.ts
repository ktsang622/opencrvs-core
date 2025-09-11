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

import pdf2pic from 'pdf2pic'
import { PDFDocument } from 'pdf-lib'

export interface PdfPage {
  pageNumber: number
  path: string
  buffer: Buffer
}

export interface ProcessedPdf {
  pageCount: number
  pages: PdfPage[]
}

export async function processPdf(
  pdfBuffer: Buffer,
  transactionId: string
): Promise<ProcessedPdf> {
  // Get page count
  const pdfDoc = await PDFDocument.load(pdfBuffer)
  const pageCount = pdfDoc.getPageCount()

  // Convert pages to images
  const convert = pdf2pic.fromBuffer(pdfBuffer, {
    density: 150,
    format: 'png',
    width: 800,
    height: 1200
  })

  const pages: PdfPage[] = []

  for (let i = 1; i <= pageCount; i++) {
    const result = await convert(i, { responseType: 'buffer' })
    const pagePath = `event-attachments/${transactionId}-page-${i}.png`

    if (!result.buffer) {
      throw new Error(`Failed to convert PDF page ${i} to image`)
    }

    pages.push({
      pageNumber: i,
      path: pagePath,
      buffer: result.buffer
    })
  }

  return {
    pageCount,
    pages
  }
}
