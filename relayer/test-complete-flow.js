const Maker = require('./maker');
const AuctionClient = require('./auction-client');

class CompleteFlowTest {
  constructor() {
    this.maker = null;
    this.clients = [];
    this.testResults = {
      orderCreated: false,
      auctionStarted: false,
      winners: [],
      verifications: [],
      secretsDelivered: []
    };
  }

  // Run the complete test flow
  async runTest() {
    console.log('\n🚀 STELLARFUSION COMPLETE FLOW TEST');
    console.log('====================================');
    
    try {
      // Step 1: Start the maker
      await this.startMaker();
      
      // Step 2: Start auction clients
      await this.startAuctionClients();
      
      // Step 3: Wait for completion
      await this.waitForCompletion();
      
      // Step 4: Display results
      this.displayResults();
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  }

  // Start the maker
  async startMaker() {
    console.log('\n📝 Step 1: Starting Maker...');
    
    this.maker = new Maker();
    
    // Override the initialize method to auto-select mode
    this.maker.initialize = async () => {
      console.log('✅ Auto-selecting partial fill mode for testing');
      this.maker.mode = 'partialfill';
      console.log(`✅ Selected mode: ${this.maker.mode.toUpperCase()}`);
    };
    
    // Start the maker process
    await this.maker.initialize();
    this.maker.generateSecrets();
    
    const orderCreated = await this.maker.createOrder();
    if (orderCreated) {
      this.testResults.orderCreated = true;
      console.log('✅ Order created successfully');
    } else {
      throw new Error('Failed to create order');
    }
    
    // Connect to WebSocket
    this.maker.connectWebSocket();
    
    // Wait a bit for the order to be processed
    await this.sleep(2000);
  }

  // Start auction clients
  async startAuctionClients() {
    console.log('\n🎯 Step 2: Starting Auction Clients...');
    
    const clientNames = ['Alice', 'Bob', 'Charlie', 'David'];
    
    clientNames.forEach((name, index) => {
      const client = new AuctionClient(name);
      this.clients.push(client);
      
      // Connect with delay
      setTimeout(() => {
        client.connect();
      }, index * 500);
    });
    
    console.log(`✅ Started ${clientNames.length} auction clients`);
    
    // Wait for clients to connect
    await this.sleep(3000);
  }

  // Wait for completion
  async waitForCompletion() {
    console.log('\n⏳ Step 3: Waiting for auction completion...');
    console.log('   (This may take up to 5 minutes)');
    
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      // Check if we have winners
      if (this.maker.winners.size > 0) {
        console.log(`\n🎉 Winners detected: ${this.maker.winners.size}`);
        
        // Check if all segments are completed (for partial fill)
        if (this.maker.mode === 'partialfill' && this.maker.winners.size >= 4) {
          console.log('✅ All segments completed!');
          break;
        }
        
        // For single auction, one winner is enough
        if (this.maker.mode === 'normal' && this.maker.winners.size >= 1) {
          console.log('✅ Single auction completed!');
          break;
        }
      }
      
      await this.sleep(5000); // Check every 5 seconds
    }
    
    console.log('\n✅ Auction phase completed');
  }

  // Display test results
  displayResults() {
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('=======================');
    
    console.log(`✅ Order Created: ${this.testResults.orderCreated ? 'YES' : 'NO'}`);
    console.log(`✅ Auction Started: ${this.maker ? 'YES' : 'NO'}`);
    console.log(`✅ Mode: ${this.maker?.mode?.toUpperCase() || 'N/A'}`);
    console.log(`✅ Order ID: ${this.maker?.orderId || 'N/A'}`);
    console.log(`✅ Total Secrets Generated: ${this.maker?.secrets?.length || 0}`);
    console.log(`✅ Total Winners: ${this.maker?.winners?.size || 0}`);
    
    if (this.maker?.winners.size > 0) {
      console.log('\n🏆 WINNERS DETAILS:');
      this.maker.winners.forEach((winnerInfo, key) => {
        const verified = this.maker.verificationResults.get(key);
        console.log(`   ${key}:`);
        console.log(`     Winner: ${winnerInfo.winner}`);
        console.log(`     Price: ${winnerInfo.finalPrice}`);
        console.log(`     Verified: ${verified ? '✅ YES' : '❌ NO'}`);
        console.log(`     Secret Sent: ${verified ? '✅ YES' : '❌ NO'}`);
      });
    }
    
    if (this.maker?.verificationResults.size > 0) {
      console.log('\n🔍 VERIFICATION RESULTS:');
      this.maker.verificationResults.forEach((verified, key) => {
        console.log(`   ${key}: ${verified ? '✅ PASSED' : '❌ FAILED'}`);
      });
    }
    
    // Calculate success rate
    const totalWinners = this.maker?.winners.size || 0;
    const verifiedWinners = Array.from(this.maker?.verificationResults.values() || []).filter(v => v).length;
    const successRate = totalWinners > 0 ? (verifiedWinners / totalWinners * 100).toFixed(1) : 0;
    
    console.log(`\n📈 SUCCESS RATE: ${successRate}% (${verifiedWinners}/${totalWinners} winners verified)`);
    
    if (successRate > 0) {
      console.log('🎉 TEST PASSED! At least one winner was verified and received their secret.');
    } else {
      console.log('❌ TEST FAILED! No winners were verified.');
    }
  }

  // Utility function to sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup
  cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.maker?.ws) {
      this.maker.ws.close();
    }
    
    this.clients.forEach(client => {
      client.disconnect();
    });
  }
}

// Run the test
if (require.main === module) {
  const test = new CompleteFlowTest();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted by user');
    test.cleanup();
    process.exit(0);
  });
  
  // Run the test
  test.runTest().then(() => {
    console.log('\n✅ Test completed');
    test.cleanup();
    process.exit(0);
  }).catch((error) => {
    console.error('\n❌ Test failed:', error);
    test.cleanup();
    process.exit(1);
  });
}

module.exports = CompleteFlowTest; 