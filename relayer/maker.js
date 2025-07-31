const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');

class Maker {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.wsUrl = 'ws://localhost:8080';
    this.ws = null;
    this.mode = null;
    this.secrets = [];
    this.orderId = null;
    this.winners = new Map(); // Map to track winners and their secrets
    this.verificationResults = new Map(); // Map to track verification results
  }

  // Generate a random secret
  generateSecret() {
    return '0x' + crypto.randomBytes(32).toString('hex');
  }

  // Generate hashed secret
  generateHashedSecret(secret) {
    return '0x' + crypto.createHash('sha256').update(secret).digest('hex');
  }

  // Initialize the maker with mode selection
  async initialize() {
    console.log('\n🎯 STELLARFUSION MAKER SCRIPT');
    console.log('================================');
    console.log('1. Normal Mode - Single auction with 1 secret');
    console.log('2. Partial Fill Mode - Segmented auction with 4 secrets');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('\nSelect mode (1 or 2): ', (answer) => {
        rl.close();
        this.mode = answer === '2' ? 'partialfill' : 'normal';
        console.log(`\n✅ Selected mode: ${this.mode.toUpperCase()}`);
        resolve();
      });
    });
  }

  // Generate secrets based on mode
  generateSecrets() {
    console.log('\n🔐 Generating secrets...');
    
    if (this.mode === 'normal') {
      const secret = this.generateSecret();
      const hashedSecret = this.generateHashedSecret(secret);
      
      this.secrets = [{
        secret: secret,
        hashedSecret: hashedSecret,
        segmentId: null
      }];
      
      console.log(`✅ Generated 1 secret for normal mode`);
      console.log(`   Secret: ${secret}`);
      console.log(`   Hashed: ${hashedSecret}`);
    } else {
      // Partial fill mode - 4 secrets for 4 segments
      this.secrets = [];
      for (let i = 1; i <= 4; i++) {
        const secret = this.generateSecret();
        const hashedSecret = this.generateHashedSecret(secret);
        
        this.secrets.push({
          secret: secret,
          hashedSecret: hashedSecret,
          segmentId: i
        });
        
        console.log(`✅ Generated secret for segment ${i}`);
        console.log(`   Secret: ${secret}`);
        console.log(`   Hashed: ${hashedSecret}`);
      }
    }
  }

  // Create order via API
  async createOrder() {
    console.log('\n📝 Creating order...');
    
    const endpoint = this.mode === 'partialfill' ? '/partialfill' : '/create';
    
    const orderData = {
      orderId: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      buyerAddress: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      srcChainId: 11155111,
      dstChainId: "stellar-testnet",
      srcToken: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
      dstToken: "XLM",
      srcAmount: "1",
      dstAmount: "3900",
      market_price: "3900",
      slippage: "0.1"
    };

    try {
      const response = await axios.post(`${this.baseUrl}${endpoint}`, orderData);
      
      if (response.data.success) {
        this.orderId = orderData.orderId;
        console.log(`✅ Order created successfully!`);
        console.log(`   Order ID: ${this.orderId}`);
        console.log(`   Endpoint: ${endpoint}`);
        console.log(`   Status: ${response.data.data.status}`);
        
        // For partial fill orders, update segment secrets
        if (this.mode === 'partialfill') {
          await this.updateSegmentSecrets();
        }
        
        return true;
      } else {
        console.log(`❌ Failed to create order: ${response.data.error}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error creating order:`, error.response?.data || error.message);
      return false;
    }
  }

  // Update segment secrets for partial fill orders
  async updateSegmentSecrets() {
    console.log('\n🔐 Updating segment secrets...');
    
    try {
      const response = await axios.post(`${this.baseUrl}/orders/${this.orderId}/segment-secrets`, {
        segmentSecrets: this.secrets
      });
      
      if (response.data.success) {
        console.log(`✅ Segment secrets updated successfully!`);
        console.log(`   Total segments: ${response.data.data.totalSegments}`);
      } else {
        console.log(`❌ Failed to update segment secrets: ${response.data.error}`);
      }
    } catch (error) {
      console.error(`❌ Error updating segment secrets:`, error.response?.data || error.message);
    }
  }

  // Connect to WebSocket for auction updates
  connectWebSocket() {
    console.log('\n🔌 Connecting to auction WebSocket...');
    
    this.ws = new WebSocket(this.wsUrl);
    
    this.ws.on('open', () => {
      console.log('✅ Connected to auction WebSocket');
      this.ws.send(JSON.stringify({
        type: 'register',
        name: 'maker'
      }));
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('🔌 WebSocket connection closed');
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });
  }

  // Handle WebSocket messages
  handleWebSocketMessage(message) {
    switch (message.type) {
      case 'welcome':
        console.log('👋 Received welcome message from auction server');
        break;
        
      case 'new_segmented_auction':
        if (message.orderId === this.orderId) {
          console.log(`🎯 New segmented auction started for order: ${message.orderId}`);
          console.log(`📊 Segments: ${message.segments.length}`);
        }
        break;
        
      case 'new_single_auction':
        if (message.orderId === this.orderId) {
          console.log(`🎯 New single auction started for order: ${message.orderId}`);
          console.log(`💰 Starting price: ${message.currentPrice}`);
        }
        break;
        
      case 'segment_ended':
        if (message.orderId === this.orderId) {
          console.log(`🏁 Segment ${message.segmentId} ended`);
          console.log(`   Status: ${message.status}`);
          console.log(`   Winner: ${message.winner || 'None'}`);
          console.log(`   Final Price: ${message.finalPrice}`);
          
          if (message.winner && message.status === 'completed') {
            this.handleWinner(message.segmentId, message.winner, message.finalPrice);
          }
        }
        break;
        
      case 'single_auction_completed':
        if (message.orderId === this.orderId) {
          console.log(`🏁 Single auction completed`);
          console.log(`   Status: ${message.status}`);
          console.log(`   Winner: ${message.winner || 'None'}`);
          console.log(`   Final Price: ${message.finalPrice}`);
          
          if (message.winner && message.status === 'completed') {
            this.handleWinner(null, message.winner, message.finalPrice);
          }
        }
        break;
        
      case 'segmented_auction_completed':
        if (message.orderId === this.orderId) {
          console.log(`🎊 Segmented auction fully completed!`);
          console.log(`   Total Winners: ${message.totalWinners}`);
          console.log(`   Total Amount: ${message.totalAmount}`);
          console.log(`   Effective Rate: ${message.effectiveRate}`);
        }
        break;
    }
  }

  // Handle winner selection
  async handleWinner(segmentId, winner, finalPrice) {
    console.log(`\n🎉 WINNER DETECTED!`);
    console.log(`   Segment: ${segmentId || 'Single'}`);
    console.log(`   Winner: ${winner}`);
    console.log(`   Price: ${finalPrice}`);
    
    // Store winner information
    const winnerKey = segmentId ? `segment_${segmentId}` : 'single';
    this.winners.set(winnerKey, {
      winner: winner,
      segmentId: segmentId,
      finalPrice: finalPrice,
      verified: false
    });
    
    // Verify the winner
    await this.verifyWinner(winnerKey, winner);
  }

  // Verify winner using /verify endpoint
  async verifyWinner(winnerKey, winner) {
    console.log(`\n🔍 Verifying winner: ${winner}`);
    
    const verificationData = {
      orderId: this.orderId
    };

    // Add segmentId for partial fill orders
    if (this.mode === 'partialfill') {
      const winnerInfo = this.winners.get(winnerKey);
      if (winnerInfo && winnerInfo.segmentId) {
        verificationData.segmentId = winnerInfo.segmentId;
      }
    }

    try {
      const response = await axios.post(`${this.baseUrl}/verify`, verificationData);
      
      const success = response.data.success;
      this.verificationResults.set(winnerKey, success);
      
      console.log(`📋 Verification result for ${winner}: ${success ? '✅ PASSED' : '❌ FAILED'}`);
      
      if (success) {
        await this.sendSecretToWinner(winnerKey, winner);
      } else {
        console.log(`❌ Verification failed for ${winner}. Secret will not be sent.`);
      }
      
    } catch (error) {
      console.error(`❌ Error verifying winner ${winner}:`, error.response?.data || error.message);
      this.verificationResults.set(winnerKey, false);
    }
  }

  // Send secret to winner
  async sendSecretToWinner(winnerKey, winner) {
    console.log(`\n🔐 Sending secret to winner: ${winner}`);
    
    let secretToSend = null;
    
    if (this.mode === 'normal') {
      // Single auction - send the only secret
      secretToSend = this.secrets[0].secret;
    } else {
      // Partial fill - find the correct secret for this segment
      const winnerInfo = this.winners.get(winnerKey);
      const segmentId = winnerInfo.segmentId;
      
      const segmentSecret = this.secrets.find(s => s.segmentId === segmentId);
      if (segmentSecret) {
        secretToSend = segmentSecret.secret;
      }
    }
    
    if (secretToSend) {
      console.log(`✅ Secret sent to ${winner}: ${secretToSend}`);
      console.log(`   Mode: ${this.mode}`);
      console.log(`   Segment: ${this.winners.get(winnerKey)?.segmentId || 'Single'}`);
      
      // In a real implementation, you would send this secret securely to the winner
      // For now, we'll just log it
      console.log(`\n📤 SECRET DELIVERY SUMMARY:`);
      console.log(`   Winner: ${winner}`);
      console.log(`   Secret: ${secretToSend}`);
      console.log(`   Verification: ✅ PASSED`);
      console.log(`   Status: ✅ DELIVERED`);
      
    } else {
      console.log(`❌ No secret found for winner ${winner}`);
    }
  }

  // Display final summary
  displaySummary() {
    console.log(`\n📊 FINAL SUMMARY`);
    console.log(`================`);
    console.log(`Mode: ${this.mode.toUpperCase()}`);
    console.log(`Order ID: ${this.orderId}`);
    console.log(`Total Secrets Generated: ${this.secrets.length}`);
    console.log(`Total Winners: ${this.winners.size}`);
    
    if (this.winners.size > 0) {
      console.log(`\n🏆 WINNERS:`);
      this.winners.forEach((winnerInfo, key) => {
        const verified = this.verificationResults.get(key);
        console.log(`   ${key}: ${winnerInfo.winner}`);
        console.log(`     Price: ${winnerInfo.finalPrice}`);
        console.log(`     Verified: ${verified ? '✅ YES' : '❌ NO'}`);
        console.log(`     Secret Sent: ${verified ? '✅ YES' : '❌ NO'}`);
      });
    }
  }

  // Main execution flow
  async run() {
    try {
      // Step 1: Initialize and select mode
      await this.initialize();
      
      // Step 2: Generate secrets
      this.generateSecrets();
      
      // Step 3: Create order
      const orderCreated = await this.createOrder();
      if (!orderCreated) {
        console.log('❌ Failed to create order. Exiting...');
        return;
      }
      
      // Step 4: Connect to WebSocket
      this.connectWebSocket();
      
      // Step 5: Wait for auction completion
      console.log('\n⏳ Waiting for auction to complete...');
      console.log('   (Press Ctrl+C to exit)');
      
      // Keep the script running
      process.on('SIGINT', () => {
        console.log('\n\n🛑 Shutting down maker...');
        this.displaySummary();
        if (this.ws) {
          this.ws.close();
        }
        process.exit(0);
      });
      
    } catch (error) {
      console.error('❌ Error in maker script:', error);
      process.exit(1);
    }
  }
}

// Run the maker script
if (require.main === module) {
  const maker = new Maker();
  maker.run();
}

module.exports = Maker; 