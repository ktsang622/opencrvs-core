import * as Hapi from '@hapi/hapi'
import { pool, updateSyncRequestStatus, clearSyncRequestPayload } from '../database'
import { createPersonHandler } from './birth/create'

/**
 * Retry failed sync requests
 */
export async function retrySyncHandler(request: Hapi.Request, h: Hapi.ResponseToolkit) {
  try {
    const { syncRequestId } = request.params as { syncRequestId: string }
    
    // Get failed sync request (including those with cleared payloads)
    const result = await pool.query(
      `SELECT id, event_type, action, payload, retry_count, crvs_event_uuid 
       FROM sync_request 
       WHERE id = $1 AND status = 'failed'`,
      [syncRequestId]
    )
    
    if (result.rows.length === 0) {
      return h.response({ error: 'Sync request not found or not failed' }).code(404)
    }
    
    const syncRequest = result.rows[0]
    
    // If payload was cleared, we can't retry
    if (!syncRequest.payload) {
      return h.response({ error: 'Cannot retry - payload was already cleared. Original FHIR data no longer available.' }).code(400)
    }
    
    // Update retry count and status
    await pool.query(
      `UPDATE sync_request 
       SET retry_count = retry_count + 1, status = 'processing', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [syncRequestId]
    )
    
    // Retry the operation based on event type and action
    if (syncRequest.event_type === 'birth' && syncRequest.action === 'CREATE') {
      // Create mock request object for createPersonHandler with retry flag
      const mockRequest = {
        payload: { record: syncRequest.payload },
        isRetry: true,
        syncRequestId: syncRequestId
      } as any
      
      const response = await createPersonHandler(mockRequest, h)
      
      if (response.statusCode === 200) {
        await updateSyncRequestStatus(syncRequestId, 'completed')
        await clearSyncRequestPayload(syncRequestId)
        return h.response({ success: true, message: 'Retry successful' }).code(200)
      } else {
        console.error('❌ Retry failed with response:', response)
        const errorMsg = typeof response.source === 'object' && response.source && 'error' in response.source 
          ? (response.source as any).error 
          : 'Retry failed'
        await updateSyncRequestStatus(syncRequestId, 'failed', errorMsg)
        return h.response({ error: errorMsg }).code(500)
      }
    }
    
    return h.response({ error: 'Unsupported event type/action' }).code(400)
    
  } catch (error) {
    console.error('❌ Retry sync error:', error)
    return h.response({ error: (error as Error).message }).code(500)
  }
}

/**
 * Get all failed sync requests
 */
export async function getFailedSyncsHandler(request: Hapi.Request, h: Hapi.ResponseToolkit) {
  try {
    const result = await pool.query(
      `SELECT id, event_type, action, crvs_event_uuid, error_message, retry_count, created_at, updated_at
       FROM sync_request 
       WHERE status = 'failed'
       ORDER BY created_at DESC`
    )
    
    return h.response({ failedSyncs: result.rows }).code(200)
    
  } catch (error) {
    console.error('❌ Get failed syncs error:', error)
    return h.response({ error: (error as Error).message }).code(500)
  }
}