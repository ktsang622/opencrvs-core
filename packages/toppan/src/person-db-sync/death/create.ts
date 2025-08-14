import * as Hapi from '@hapi/hapi'

export async function createDeathHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  try {
    const { record } = request.payload as { record: any }
    
    console.log('🔄 Creating death record in external database...', record?.id || 'unknown')
    
    // TODO: Process death webhook data
    // Different logic from birth - deceased person, death details, etc.
    
    return h.response({ 
      success: true, 
      message: 'Death record created successfully' 
    }).code(200)
    
  } catch (error) {
    console.error('❌ Create death error:', error)
    return h.response({ 
      error: (error as Error).message 
    }).code(500)
  }
}