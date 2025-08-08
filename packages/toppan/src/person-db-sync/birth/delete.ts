import * as Hapi from '@hapi/hapi'

export async function deletePersonHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  try {
    const { recordId } = request.payload as { recordId: string }
    
    console.log(`🗑️ Deleting person from external database: ${recordId}`)
    
    // TODO: Delete person logic
    // await deleteFromDatabase(recordId)
    
    return h.response({ 
      success: true, 
      message: 'Person deleted successfully' 
    }).code(200)
    
  } catch (error) {
    console.error('❌ Delete person error:', error)
    return h.response({ 
      error: (error as Error).message 
    }).code(500)
  }
}