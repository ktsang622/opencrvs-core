/*
 * Copyright (C) Toppan Security. All rights reserved.
 */

import * as Hapi from '@hapi/hapi'
import { indexPersonDb } from '@opencrvs/toppan-db'

export async function indexPersonDbHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  try {
    const result = await indexPersonDb()
    
    if (result.success) {
      return h.response({
        success: true,
        indexed: result.indexed,
        message: 'Person index updated successfully'
      }).code(200)
    } else {
      return h.response({
        success: false,
        error: result.error || 'Unknown error'
      }).code(500)
    }
  } catch (error) {
    console.error('❌ OpenSearch indexing error:', error)
    return h.response({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }).code(500)
  }
}