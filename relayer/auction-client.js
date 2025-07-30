const WebSocket = require('ws');

class AuctionClient {
  constructor(name = 'test-client') {
    this.name = name;
    this.wsUrl = 'ws://localhost:8080';
    this.ws = null;
    this.activeAuctions = new Map();
  }

  // Connect to auction WebSocket
  connect() {
    console.log(`🔌 ${this.name} connecting to auction WebSocket...`);
    
    this.ws = new WebSocket(this.wsUrl);
    
    this.ws.on('open', () => {
      console.log(`✅ ${this.name} connected to auction WebSocket`);
      this.ws.send(JSON.stringify({
        type: 'register',
        name: this.name
      }));
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(message);
      } catch (error) {
        console.error(`❌ ${this.name} error parsing message:`, error);
      }
    });

    this.ws.on('close', () => {
      console.log(`🔌 ${this.name} WebSocket connection closed`);
    });

    this.ws.on('error', (error) => {
      console.error(`❌ ${this.name} WebSocket error:`, error);
    });
  }

  // Handle incoming messages
  handleMessage(message) {
    switch (message.type) {
      case 'welcome':
        console.log(`👋 ${this.name} received welcome message`);
        console.log(`📊 Active auctions: ${message.activeAuctions.length}`);
        break;
        
      case 'new_segmented_auction':
        console.log(`🎯 ${this.name} - New segmented auction: ${message.orderId}`);
        this.activeAuctions.set(message.orderId, {
          type: 'segmented',
          segments: message.segments,
          orderId: message.orderId
        });
        this.joinAuction(message.orderId);
        break;
        
      case 'new_single_auction':
        console.log(`🎯 ${this.name} - New single auction: ${message.orderId}`);
        this.activeAuctions.set(message.orderId, {
          type: 'single',
          orderId: message.orderId,
          currentPrice: message.currentPrice
        });
        this.joinAuction(message.orderId);
        break;
        
      case 'segmented_auction_update':
        if (this.activeAuctions.has(message.orderId)) {
          const auction = this.activeAuctions.get(message.orderId);
          auction.segments = message.segments;
          this.checkAndBid(message.orderId);
        }
        break;
        
      case 'single_auction_update':
        if (this.activeAuctions.has(message.orderId)) {
          const auction = this.activeAuctions.get(message.orderId);
          auction.currentPrice = message.currentPrice;
          this.checkAndBid(message.orderId);
        }
        break;
        
      case 'segment_ended':
        console.log(`🏁 ${this.name} - Segment ${message.segmentId} ended for ${message.orderId}`);
        console.log(`   Winner: ${message.winner || 'None'}`);
        break;
        
      case 'single_auction_completed':
        console.log(`🏁 ${this.name} - Single auction completed for ${message.orderId}`);
        console.log(`   Winner: ${message.winner || 'None'}`);
        break;
        
      case 'segmented_auction_completed':
        console.log(`🎊 ${this.name} - Segmented auction fully completed for ${message.orderId}`);
        this.activeAuctions.delete(message.orderId);
        break;
    }
  }

  // Join an auction
  joinAuction(orderId) {
    console.log(`🎯 ${this.name} joining auction: ${orderId}`);
    this.ws.send(JSON.stringify({
      type: 'join_auction',
      orderId: orderId
    }));
  }

  // Check if we should bid and place bid
  checkAndBid(orderId) {
    const auction = this.activeAuctions.get(orderId);
    if (!auction) return;

    if (auction.type === 'segmented') {
      // For segmented auctions, try to win a random segment
      const availableSegments = auction.segments.filter(s => s.status === 'active' && !s.winner);
      if (availableSegments.length > 0) {
        const randomSegment = availableSegments[Math.floor(Math.random() * availableSegments.length)];
        const shouldBid = Math.random() < 0.3; // 30% chance to bid
        
        if (shouldBid) {
          console.log(`💰 ${this.name} bidding on segment ${randomSegment.id} for ${orderId}`);
          this.ws.send(JSON.stringify({
            type: 'confirm_segment',
            orderId: orderId,
            segmentId: randomSegment.id
          }));
        }
      }
    } else if (auction.type === 'single') {
      // For single auctions, try to win based on price
      const shouldBid = Math.random() < 0.2; // 20% chance to bid
      
      if (shouldBid) {
        console.log(`💰 ${this.name} bidding on single auction for ${orderId}`);
        this.ws.send(JSON.stringify({
          type: 'confirm_single',
          orderId: orderId
        }));
      }
    }
  }

  // Disconnect
  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Create multiple clients for testing
function createTestClients() {
  const clients = [];
  const clientNames = ['Alice', 'Bob', 'Charlie', 'David', 'Eve'];
  
  clientNames.forEach((name, index) => {
    const client = new AuctionClient(name);
    clients.push(client);
    
    // Connect with a slight delay to avoid overwhelming the server
    setTimeout(() => {
      client.connect();
    }, index * 1000);
  });
  
  return clients;
}

// Main execution
if (require.main === module) {
  console.log('🎯 Starting auction test clients...');
  
  const clients = createTestClients();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down auction clients...');
    clients.forEach(client => client.disconnect());
    process.exit(0);
  });
}

module.exports = AuctionClient; 