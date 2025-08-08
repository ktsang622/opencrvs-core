// Test payloads for toppan service
const testPayloads = {
  addFather: {
    action: "ADD_FATHER",
    eventId: "bdae473e-541a-4221-aa8a-8abaaf70f23f",
    fatherData: {
      fatherId: "33a2678b-1bfc-402d-b508-1d80f4e7e8ff",
      fatherCRVSUuid: "1a2fdd97-f778-4a4b-8728-474b266851d4"
    },
    reason: "Father details added by registrar"
  },
  
  removeFather: {
    action: "REMOVE_FATHER", 
    eventId: "bdae473e-541a-4221-aa8a-8abaaf70f23f",
    fatherData: {
      fatherId: "33a2678b-1bfc-402d-b508-1d80f4e7e8ff",
      fatherCRVSUuid: "1a2fdd97-f778-4a4b-8728-474b266851d4"
    },
    reason: "Father removed per court order"
  }
}

async function testEndpoint(payload, testName) {
  console.log(`\n🧪 Testing ${testName}...`)
  
  try {
    const response = await fetch('http://localhost:9998/person-db-sync/birth/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    const result = await response.json()
    console.log(`✅ ${testName} - Status:`, response.status)
    console.log(`📋 Response:`, result)
    
  } catch (error) {
    console.error(`❌ ${testName} failed:`, error.message)
  }
}

async function runTests() {
  console.log('🚀 Starting toppan service tests...')
  
  // Test health endpoint
  try {
    const health = await fetch('http://localhost:9998/health')
    const healthResult = await health.json()
    console.log('💚 Health check:', healthResult)
  } catch (error) {
    console.error('❌ Service not running:', error.message)
    return
  }
  
  // Test payloads
  await testEndpoint(testPayloads.addFather, 'ADD_FATHER')
  await testEndpoint(testPayloads.removeFather, 'REMOVE_FATHER')
  
  console.log('\n✅ Tests completed!')
}

// Run tests
runTests().catch(console.error)