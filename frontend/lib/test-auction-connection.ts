import { createAuctionClient } from './auction-client'

export function testAuctionConnection() {
  console.log('🧪 Testing auction connection...')
  
  const client = createAuctionClient('test-client')
  
  client.onNewAuction((auction) => {
    console.log('✅ New auction received:', auction)
  })
  
  client.onAuctionUpdate((auction) => {
    console.log('✅ Auction update received:', auction)
  })
  
  client.onAuctionEnd((orderId, status) => {
    console.log('✅ Auction ended:', orderId, status)
  })
  
  client.onSegmentUpdate((orderId, segmentId, segment) => {
    console.log('✅ Segment update received:', orderId, segmentId, segment)
  })
  
  client.onSegmentEnd((orderId, segmentId, status, winner) => {
    console.log('✅ Segment ended:', orderId, segmentId, status, winner)
  })
  
  client.connect()
  
  // Test connection after 2 seconds
  setTimeout(() => {
    console.log('🧪 Connection test completed')
  }, 2000)
  
  return client
} 