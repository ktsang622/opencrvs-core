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
import { minioClient } from '@documents/minio/client'
import { MINIO_BUCKET } from '@documents/minio/constants'
import * as Hapi from '@hapi/hapi'
import { v4 as uuid } from 'uuid'
import { fromBuffer } from 'file-type'
import { getUserId, logger } from '@opencrvs/commons'
import { processPdf } from '@documents/features/pdfProcessor'

import { z } from 'zod'
import { Readable } from 'stream'
import { badRequest, notFound } from '@hapi/boom'
export interface IDocumentPayload {
  fileData: string
  metaData?: Record<string, string>
}

export type IFileInfo = {
  ext: string
  mime: string
}

const HapiSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  headers: z.record(z.string()),
  bytes: z.number().optional()
})

const FileSchema = z
  .custom<Readable & { hapi: z.infer<typeof HapiSchema> }>((val) => {
    return '_readableState' in val && 'hapi' in val
  }, 'Not a readable stream or missing hapi field')
  .refine(
    (val) => HapiSchema.safeParse(val.hapi).success,
    'hapi does not match the required structure'
  )

const Payload = z.object({
  file: FileSchema,
  transactionId: z.string()
})

// Helper function to convert stream to buffer
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// Helper to check if PDF processing is enabled
async function isPdfProcessingEnabled(): Promise<boolean> {
  try {
    // For now, we'll check an environment variable
    // In production, this would check the application config
    return process.env.ENHANCED_DOCUMENT_VIEWER === 'true'
  } catch {
    return false // Default to disabled if config unavailable
  }
}

export async function fileUploadHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const userId = getUserId(request.headers.authorization)
  const payload = await Payload.parseAsync(request.payload).catch((error) => {
    logger.error(error)
    throw badRequest('Invalid payload')
  })

  const { file, transactionId } = payload

  const extension = file.hapi.filename.split('.').pop()
  const filename = `${transactionId}.${extension}`

  // NEW: Handle PDF processing ONLY if feature enabled
  if (extension === 'pdf' && (await isPdfProcessingEnabled())) {
    const pdfBuffer = await streamToBuffer(file)
    const processedPdf = await processPdf(pdfBuffer, transactionId)

    // Store original PDF
    await minioClient.putObject(
      MINIO_BUCKET,
      'event-attachments/' + filename,
      pdfBuffer,
      {
        'created-by': userId,
        'content-type': 'application/pdf'
      }
    )

    // Store page images
    for (const page of processedPdf.pages) {
      await minioClient.putObject(MINIO_BUCKET, page.path, page.buffer, {
        'created-by': userId,
        'content-type': 'image/png'
      })
    }

    return {
      filename: 'event-attachments/' + filename,
      pages: processedPdf.pages.map((p) => p.path)
    }
  }

  // EXISTING: Image handling unchanged
  await minioClient.putObject(
    MINIO_BUCKET,
    'event-attachments/' + filename,
    file,
    { 'created-by': userId }
  )

  return 'event-attachments/' + filename
}

export async function fileExistsHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const { filename } = request.params
  const exists = await minioClient.statObject(
    MINIO_BUCKET,
    'event-attachments/' + filename
  )
  if (!exists) {
    return notFound('File not found')
  }
  return h.response().code(200)
}

export async function documentUploadHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const userId = getUserId(request.headers.authorization)
  if (!userId)
    return Promise.reject(
      new Error(
        `request failed: Authorization token is missing or does not contain a valid user ID.`
      )
    )
  const payload = request.payload as IDocumentPayload
  const ref = uuid()
  try {
    const base64String = payload.fileData.split(',')[1]
    const base64Decoded = Buffer.from(base64String, 'base64')
    const fileType = (await fromBuffer(base64Decoded)) as IFileInfo
    const generateFileName = `${ref}.${fileType.ext}`

    await minioClient.putObject(MINIO_BUCKET, generateFileName, base64Decoded, {
      ...payload.metaData,
      'content-type': fileType.mime,
      'created-by': userId
    })

    return h
      .response({ refUrl: `/${MINIO_BUCKET}/${generateFileName}` })
      .code(200)
  } catch (error) {
    return Promise.reject(new Error(`request failed: ${error.message}`))
  }
}
