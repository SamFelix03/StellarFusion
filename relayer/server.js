const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const WebSocket = require('ws');
const readline = require('readline');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Initialize DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = 'stellarfusion';

// Dutch Auction System
class DutchAuctionServer {
  constructor(port = WS_PORT) {
    this.port = port;
    this.wss = new WebSocket.Server({ port: this.port });
    this.clients = new Map(); // Store client connections with their names
    this.activeAuctions = new Map(); // Store active auctions by orderId
    this.segmentDuration = 60000; // 1 minute per segment
    this.segments = 4; // Number of segments
    
    this.setupWebSocketServer();
    this.setupCLI();
  }
  
  setupWebSocketServer() {
    this.wss.on('connection', (ws) => {
      console.log('🔄 New auction client connected');
      
      // Send list of active auctions to new client
      const activeAuctionsList = Array.from(this.activeAuctions.values()).map(auction => ({
        orderId: auction.orderId,
        currentPrice: auction.currentPrice,
        startingPrice: auction.startingPrice,
        timeRemaining: auction.endTime - Date.now()
      }));
      
      ws.send(JSON.stringify({
        type: 'welcome',
        activeAuctions: activeAuctionsList
      }));
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('❌ Invalid message received:', error);
        }
      });
      
      ws.on('close', () => {
        // Remove client from map when they disconnect
        for (let [name, client] of this.clients.entries()) {
          if (client === ws) {
            this.clients.delete(name);
            console.log(`👋 Auction client ${name} disconnected`);
            break;
          }
        }
      });
    });
    
    console.log(`🎯 Dutch Auction WebSocket server running on port ${this.port}`);
    console.log('⏳ Waiting for auction clients to connect...');
  }
  
  handleClientMessage(ws, data) {
    switch (data.type) {
      case 'register':
        this.clients.set(data.name, ws);
        console.log(`📝 Auction client registered: ${data.name}`);
        break;
        
      case 'join_auction':
        const orderId = data.orderId;
        const auction = this.activeAuctions.get(orderId);
        
        if (auction) {
          // Send current segmented auction state to client
          const currentSegment = auction.segments.find(s => s.id === auction.currentSegment);
          ws.send(JSON.stringify({
            type: 'segmented_auction_update',
            orderId: orderId,
            segments: auction.segments,
            currentSegment: auction.currentSegment,
            currentSegmentData: currentSegment,
            marketPrice: auction.marketPrice,
            sourceAmount: auction.sourceAmount
          }));
          console.log(`👤 ${data.name} joined segmented auction for order ${orderId}`);
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Auction for order ${orderId} not found`
          }));
        }
        break;
        
      case 'confirm_segment':
        const confirmOrderId = data.orderId;
        const segmentId = data.segmentId;
        const confirmAuction = this.activeAuctions.get(confirmOrderId);
        
        if (confirmAuction) {
          const segment = confirmAuction.segments.find(s => s.id === segmentId);
          
          if (segment && segment.status === 'active' && !segment.winner) {
            segment.winner = data.name;
            
            console.log(`\n🎉 SEGMENT ${segmentId} WINNER: ${data.name} confirmed at price ${Math.floor(segment.currentPrice)}!`);
            console.log(`📦 Order ID: ${confirmOrderId}`);
            console.log(`💰 Amount: ${segment.amount}`);
            
            // Clear interval if exists
            if (segment.interval) {
              clearInterval(segment.interval);
            }
            
            // End this segment
            this.endSegment(confirmOrderId, segmentId, 'completed');
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Segment ${segmentId} is not available for confirmation`
            }));
          }
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Auction for order ${confirmOrderId} not found`
          }));
        }
        break;
        
      case 'confirm':
        // Legacy support for old confirm format
        const legacyOrderId = data.orderId;
        const legacyAuction = this.activeAuctions.get(legacyOrderId);
        
        if (legacyAuction) {
          if (legacyAuction.auctionType === 'segmented' && legacyAuction.currentSegment) {
            // Handle as segmented auction
            const currentSegment = legacyAuction.segments.find(s => s.id === legacyAuction.currentSegment);
            if (currentSegment && currentSegment.status === 'active' && !currentSegment.winner) {
              currentSegment.winner = data.name;
              
              console.log(`\n🎉 SEGMENT ${legacyAuction.currentSegment} WINNER: ${data.name} confirmed at price ${Math.floor(currentSegment.currentPrice)}!`);
              console.log(`📦 Order ID: ${legacyOrderId}`);
              
              if (currentSegment.interval) {
                clearInterval(currentSegment.interval);
              }
              
              this.endSegment(legacyOrderId, legacyAuction.currentSegment, 'completed');
            }
          } else if (legacyAuction.auctionType === 'single') {
            // Handle as single auction
            if (legacyAuction.status === 'active' && !legacyAuction.winner) {
              legacyAuction.winner = data.name;
              
              console.log(`\n🎉 SINGLE AUCTION WINNER: ${data.name} confirmed at price ${Math.floor(legacyAuction.currentPrice)}!`);
              console.log(`📦 Order ID: ${legacyOrderId}`);
              
              this.endSingleAuction(legacyOrderId, 'completed');
            }
          }
        }
        break;
        
      case 'confirm_single':
        const singleOrderId = data.orderId;
        const singleAuction = this.activeAuctions.get(singleOrderId);
        
        if (singleAuction && singleAuction.auctionType === 'single') {
          if (singleAuction.status === 'active' && !singleAuction.winner) {
            singleAuction.winner = data.name;
            
            console.log(`\n🎉 SINGLE AUCTION WINNER: ${data.name} confirmed at price ${Math.floor(singleAuction.currentPrice)}!`);
            console.log(`📦 Order ID: ${singleOrderId}`);
            
            this.endSingleAuction(singleOrderId, 'completed');
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Single auction for order ${singleOrderId} is not available for confirmation`
            }));
          }
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: `Single auction for order ${singleOrderId} not found`
          }));
        }
        break;
    }
  }
  
  async updateOrderStatus(orderId, status, winner = null, finalPrice = null, segmentData = null) {
    try {
      const updateParams = {
        TableName: TABLE_NAME,
        Key: { orderId: orderId },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updatedAt': new Date().toISOString()
        }
      };
      
      if (winner) {
        updateParams.UpdateExpression += ', #winner = :winner, #finalPrice = :finalPrice';
        updateParams.ExpressionAttributeNames['#winner'] = 'winner';
        updateParams.ExpressionAttributeNames['#finalPrice'] = 'finalPrice';
        updateParams.ExpressionAttributeValues[':winner'] = winner;
        updateParams.ExpressionAttributeValues[':finalPrice'] = finalPrice.toString();
      }
      
      if (segmentData) {
        // For segment completion, we need to append to existing segments array
        if (status === 'segment_completed') {
          // First, get the current order to see if segments array exists
          const getParams = {
            TableName: TABLE_NAME,
            Key: { orderId: orderId }
          };
          
          const currentOrder = await dynamodb.get(getParams).promise();
          let segments = [];
          
          if (currentOrder.Item && currentOrder.Item.segments) {
            try {
              segments = JSON.parse(currentOrder.Item.segments);
            } catch (e) {
              segments = [];
            }
          }
          
          // Add the new segment data
          segments.push(segmentData);
          
          updateParams.UpdateExpression += ', #segments = :segments';
          updateParams.ExpressionAttributeNames['#segments'] = 'segments';
          updateParams.ExpressionAttributeValues[':segments'] = JSON.stringify(segments);
        } else {
          // For final completion, store the comprehensive auction data
          updateParams.UpdateExpression += ', #segmentData = :segmentData';
          updateParams.ExpressionAttributeNames['#segmentData'] = 'segmentData';
          updateParams.ExpressionAttributeValues[':segmentData'] = JSON.stringify(segmentData);
        }
      }
      
      await dynamodb.update(updateParams).promise();
      console.log(`✅ Order ${orderId} status updated to: ${status}`);
    } catch (error) {
      console.error('❌ Error updating order status:', error);
    }
  }
  
  setupCLI() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\n🎯 Dutch Auction Commands:');
    console.log('  auctions - Show active auctions');
    console.log('  clients - Show connected auction clients');
    console.log('  orders - Show pending orders');
    console.log('  quit - Exit server');
    console.log('');
    
    rl.on('line', (input) => {
      const [command, ...args] = input.trim().split(' ');
      
      switch (command) {
        case 'auctions':
          this.listActiveAuctions();
          break;
          
        case 'clients':
          console.log('👥 Connected auction clients:', Array.from(this.clients.keys()));
          break;
          
        case 'orders':
          this.listPendingOrders();
          break;
          
        case 'quit':
          console.log('🛑 Shutting down server...');
          this.wss.close();
          process.exit(0);
          break;
          
        default:
          console.log('❓ Unknown command. Available: auctions, clients, orders, quit');
      }
    });
  }
  
  async startSegmentedAuction(orderId, startingPrice) {
    // Check if auction already exists for this order
    if (this.activeAuctions.has(orderId)) {
      console.log(`❌ Auction already active for order ${orderId}`);
      return;
    }
    
    let orderData = null;
    
    // Verify order exists in DynamoDB and get market price
    try {
      const params = {
        TableName: TABLE_NAME,
        Key: { orderId: orderId }
      };
      
      const result = await dynamodb.get(params).promise();
      if (!result.Item) {
        console.log(`❌ Order ${orderId} not found in database`);
        return;
      }
      
      if (result.Item.status !== 'pending') {
        console.log(`❌ Order ${orderId} is not in pending status (current: ${result.Item.status})`);
        return;
      }
      
      orderData = result.Item;
      
    } catch (error) {
      console.error('❌ Error checking order:', error);
      return;
    }
    
    // Get source amount and market price
    const sourceAmount = parseFloat(orderData.srcAmount) || 0;
    const marketPrice = parseFloat(orderData.market_price) || 3900; // Default market price
    const segmentAmount = sourceAmount / this.segments; // Split into 4 segments
    
    console.log(`\n🚀 Starting Segmented Dutch Auction for order ${orderId}`);
    console.log(`💰 Total source amount: ${sourceAmount}`);
    console.log(`📊 Market price: ${marketPrice}`);
    console.log(`🔢 Segment amount: ${segmentAmount}`);
    console.log(`⏱️ Segment duration: 1 minute each`);
    
    // Calculate segment starting prices based on market price
    const segment1StartPrice = Math.floor(marketPrice * 1.077); // ~4,200 for 3,900 market
    const segment2StartPrice = Math.floor(marketPrice * 1.051); // ~4,100 for 3,900 market  
    const segment3StartPrice = Math.floor(marketPrice * 1.026); // ~4,000 for 3,900 market
    const segment4StartPrice = marketPrice; // Market price
    
    // Calculate price drops for segments 1-3 (segment 4 doesn't drop)
    const segment1EndPrice = Math.floor(marketPrice * 1.026); // ~4,000
    const segment2EndPrice = Math.floor(marketPrice * 1.013); // ~3,950
    const segment3EndPrice = marketPrice; // ~3,900
    
    // Create auction object with segmented data
    const auction = {
      orderId: orderId,
      orderType: 'partialfill',
      auctionType: 'segmented',
      segments: [
        {
          id: 1,
          amount: segmentAmount,
          startPrice: segment1StartPrice,
          endPrice: segment1EndPrice,
          currentPrice: segment1StartPrice,
          winner: null,
          status: 'active',
          endTime: Date.now() + this.segmentDuration
        },
        {
          id: 2,
          amount: segmentAmount,
          startPrice: segment2StartPrice,
          endPrice: segment2EndPrice,
          currentPrice: segment2StartPrice,
          winner: null,
          status: 'active',
          endTime: Date.now() + this.segmentDuration
        },
        {
          id: 3,
          amount: segmentAmount,
          startPrice: segment3StartPrice,
          endPrice: segment3EndPrice,
          currentPrice: segment3StartPrice,
          winner: null,
          status: 'active',
          endTime: Date.now() + this.segmentDuration
        },
        {
          id: 4,
          amount: segmentAmount,
          startPrice: segment4StartPrice,
          endPrice: segment4StartPrice,
          currentPrice: segment4StartPrice,
          winner: null,
          status: 'active',
          endTime: Date.now() + this.segmentDuration
        }
      ],
      totalWinners: [],
      marketPrice: marketPrice,
      sourceAmount: sourceAmount,
      intervals: [] // Array to store all segment intervals
    };
    
    // Add to active auctions
    this.activeAuctions.set(orderId, auction);
    
    console.log(`📊 Segment 1: ${segment1StartPrice} → ${segment1EndPrice} (${segmentAmount} tokens)`);
    console.log(`📊 Segment 2: ${segment2StartPrice} → ${segment2EndPrice} (${segmentAmount} tokens)`);
    console.log(`📊 Segment 3: ${segment3StartPrice} → ${segment3EndPrice} (${segmentAmount} tokens)`);
    console.log(`📊 Segment 4: ${segment4StartPrice} (fixed market price) (${segmentAmount} tokens)`);
    
    // Broadcast new auction to all clients
    this.broadcastToAll({
      type: 'new_segmented_auction',
      orderId: orderId,
      segments: auction.segments,
      currentSegment: auction.currentSegment,
      marketPrice: auction.marketPrice,
      sourceAmount: auction.sourceAmount
    });
    
    // Start all segments in parallel
    for (let i = 1; i <= 4; i++) {
      this.startSegmentAuction(orderId, i);
    }
  }

  async startSingleAuction(orderId, startingPrice) {
    // Check if auction already exists for this order
    if (this.activeAuctions.has(orderId)) {
      console.log(`❌ Auction already active for order ${orderId}`);
      return;
    }
    
    let orderData = null;
    
    // Verify order exists in DynamoDB and get market price
    try {
      const params = {
        TableName: TABLE_NAME,
        Key: { orderId: orderId }
      };
      
      const result = await dynamodb.get(params).promise();
      if (!result.Item) {
        console.log(`❌ Order ${orderId} not found in database`);
        return;
      }
      
      if (result.Item.status !== 'pending') {
        console.log(`❌ Order ${orderId} is not in pending status (current: ${result.Item.status})`);
        return;
      }
      
      orderData = result.Item;
      
    } catch (error) {
      console.error('❌ Error checking order:', error);
      return;
    }
    
    // Get source amount and market price
    const sourceAmount = parseFloat(orderData.srcAmount) || 0;
    const marketPrice = parseFloat(orderData.market_price) || 3900; // Default market price
    const slippage = parseFloat(orderData.slippage) || 0.005; // Default 0.5% slippage
    
    console.log(`\n🚀 Starting Single Dutch Auction for order ${orderId}`);
    console.log(`💰 Total source amount: ${sourceAmount}`);
    console.log(`📊 Market price: ${marketPrice}`);
    console.log(`📉 Starting price: ${startingPrice}`);
    console.log(`🎯 Target price: ${marketPrice}`);
    console.log(`⏱️ Auction duration: Until market price or winner`);
    
    // Calculate minimum price based on slippage
    const slippageAmount = startingPrice * slippage;
    const minimumPrice = startingPrice - slippageAmount;
    
    // Create auction object for single auction
    const auction = {
      orderId: orderId,
      orderType: 'normal',
      auctionType: 'single',
      currentPrice: startingPrice,
      startPrice: startingPrice,
      endPrice: marketPrice,
      minimumPrice: minimumPrice,
      sourceAmount: sourceAmount,
      marketPrice: marketPrice,
      winner: null,
      status: 'active',
      endTime: null, // No fixed end time, ends when price reaches market price or winner
      interval: null
    };
    
    // Add to active auctions
    this.activeAuctions.set(orderId, auction);
    
    console.log(`📊 Price range: ${startingPrice} → ${marketPrice}`);
    console.log(`📉 Minimum price (with slippage): ${minimumPrice}`);
    
    // Broadcast new auction to all clients
    this.broadcastToAll({
      type: 'new_single_auction',
      orderId: orderId,
      currentPrice: startingPrice,
      startPrice: startingPrice,
      endPrice: marketPrice,
      sourceAmount: sourceAmount,
      marketPrice: marketPrice
    });
    
    // Start single auction
    this.startSingleAuctionTimer(orderId);
  }
  
  startSingleAuctionTimer(orderId) {
    const auction = this.activeAuctions.get(orderId);
    if (!auction) return;
    
    console.log(`\n🎯 Starting Single Auction timer for order ${orderId}`);
    console.log(`💰 Starting price: ${auction.startPrice}`);
    console.log(`📉 End price: ${auction.endPrice}`);
    console.log(`⏱️ Price reduction: 5% every 10 seconds`);
    
    // Price reduction: 5% of current price every 10 seconds
    const interval = setInterval(() => {
      if (auction.winner) {
        clearInterval(interval);
        return;
      }
      
      // Calculate price reduction (5% of current price)
      const priceReduction = auction.currentPrice * 0.05;
      auction.currentPrice = Math.max(auction.endPrice, auction.currentPrice - priceReduction);
      
      console.log(`💰 Order ${orderId} - Current price: ${Math.floor(auction.currentPrice)}`);
      
      // Broadcast updated price
      this.broadcastToAll({
        type: 'single_auction_update',
        orderId: orderId,
        currentPrice: Math.floor(auction.currentPrice),
        startPrice: auction.startPrice,
        endPrice: auction.endPrice,
        timeRemaining: null // No fixed time
      });
      
      // Check if price reached end price (market price)
      if (auction.currentPrice <= auction.endPrice) {
        console.log(`🛑 Single auction reached market price, ending auction`);
        this.endSingleAuction(orderId, 'expired');
      }
    }, 10000); // Update every 10 seconds
    
    // Store interval reference
    auction.interval = interval;
  }
  
  startSegmentAuction(orderId, segmentId) {
    const auction = this.activeAuctions.get(orderId);
    if (!auction) return;
    
    const segment = auction.segments.find(s => s.id === segmentId);
    if (!segment) return;
    
    console.log(`\n🎯 Starting Segment ${segmentId} auction for order ${orderId}`);
    console.log(`💰 Starting price: ${segment.startPrice}`);
    console.log(`📉 End price: ${segment.endPrice}`);
    console.log(`⏱️ Duration: 1 minute`);
    
    // Calculate price drop per second for segments 1-3
    if (segmentId <= 3) {
      const totalPriceDrop = segment.startPrice - segment.endPrice;
      const priceDropPerSecond = totalPriceDrop / 60; // 60 seconds
      
      const interval = setInterval(() => {
        if (segment.winner) {
          clearInterval(interval);
          return;
        }
        
        // Reduce price linearly
        segment.currentPrice = Math.max(segment.endPrice, segment.currentPrice - priceDropPerSecond);
        
        console.log(`💰 Order ${orderId} Segment ${segmentId} - Current price: ${Math.floor(segment.currentPrice)}`);
        
        // Broadcast updated price
        this.broadcastToAll({
          type: 'segment_update',
          orderId: orderId,
          segmentId: segmentId,
          currentPrice: Math.floor(segment.currentPrice),
          startPrice: segment.startPrice,
          endPrice: segment.endPrice,
          timeRemaining: segment.endTime - Date.now()
        });
        
        // Check if price reached end price
        if (segment.currentPrice <= segment.endPrice) {
          console.log(`🛑 Segment ${segmentId} reached end price, ending segment`);
          this.endSegment(orderId, segmentId, 'expired');
        }
      }, 1000); // Update every second
      
      // Store interval reference
      auction.intervals.push(interval);
    } else {
      // Segment 4 - fixed price, no price drop
      console.log(`💰 Segment 4 - Fixed price: ${segment.currentPrice}`);
    }
    
    // Set timeout to end segment after 1 minute
    setTimeout(() => {
      if (segment && !segment.winner) {
        console.log(`⏰ Segment ${segmentId} time expired! No winner.`);
        this.endSegment(orderId, segmentId, 'expired');
      }
    }, this.segmentDuration);
  }
  
  endSegment(orderId, segmentId, status) {
    const auction = this.activeAuctions.get(orderId);
    if (!auction) return;
    
    const segment = auction.segments.find(s => s.id === segmentId);
    if (!segment) return;
    
    segment.status = status;
    
    console.log(`\n🏁 Segment ${segmentId} ended with status: ${status}`);
    if (segment.winner) {
      console.log(`🎉 Winner: ${segment.winner} at price ${Math.floor(segment.currentPrice)}`);
      auction.totalWinners.push({
        segmentId: segmentId,
        winner: segment.winner,
        price: Math.floor(segment.currentPrice),
        amount: segment.amount,
        startPrice: segment.startPrice,
        endPrice: segment.endPrice,
        finalPrice: Math.floor(segment.currentPrice),
        status: status,
        endTime: new Date().toISOString()
      });
    } else {
      // Log segment that expired without winner
      auction.totalWinners.push({
        segmentId: segmentId,
        winner: null,
        price: Math.floor(segment.currentPrice),
        amount: segment.amount,
        startPrice: segment.startPrice,
        endPrice: segment.endPrice,
        finalPrice: Math.floor(segment.currentPrice),
        status: status,
        endTime: new Date().toISOString()
      });
    }
    
    // Update DynamoDB with segment completion
    const segmentData = {
      segmentId: segmentId,
      status: status,
      winner: segment.winner || null, // Store null if no winner
      startPrice: segment.startPrice,
      endPrice: segment.endPrice,
      finalPrice: Math.floor(segment.currentPrice),
      amount: segment.amount,
      endTime: new Date().toISOString()
    };
    
    this.updateOrderStatus(orderId, 'segment_completed', segment.winner || 'no_winner', Math.floor(segment.currentPrice), segmentData);
    
    // Broadcast segment end
    this.broadcastToAll({
      type: 'segment_ended',
      orderId: orderId,
      segmentId: segmentId,
      status: status,
      winner: segment.winner,
      finalPrice: Math.floor(segment.currentPrice)
    });
    
    // Check if all segments are completed
    const completedSegments = auction.segments.filter(s => s.status === 'completed' || s.status === 'expired');
    if (completedSegments.length === 4) {
      console.log(`\n🎊 All segments completed for order ${orderId}!`);
      this.endSegmentedAuction(orderId);
    }
  }
  
  endSegmentedAuction(orderId) {
    const auction = this.activeAuctions.get(orderId);
    if (!auction) return;
    
    // Clear all intervals
    auction.intervals.forEach(interval => clearInterval(interval));
    
    // Calculate total results
    const totalWinners = auction.totalWinners.filter(win => win.winner !== null).length;
    const totalAmount = auction.totalWinners.reduce((sum, win) => sum + win.amount, 0);
    const totalValue = auction.totalWinners.reduce((sum, win) => sum + (win.price * win.amount), 0);
    const effectiveRate = totalValue / totalAmount;
    
    console.log(`\n📊 SEGMENTED AUCTION RESULTS for order ${orderId}:`);
    console.log(`🏆 Total winners: ${totalWinners}`);
    console.log(`💰 Total amount: ${totalAmount}`);
    console.log(`💵 Total value: ${totalValue}`);
    console.log(`📈 Effective rate: ${effectiveRate.toFixed(2)}`);
    
    // Prepare comprehensive auction data for DynamoDB
    const auctionResults = {
      totalWinners: totalWinners,
      totalAmount: totalAmount,
      totalValue: totalValue,
      effectiveRate: effectiveRate,
      segments: auction.totalWinners,
      marketPrice: auction.marketPrice,
      sourceAmount: auction.sourceAmount,
      auctionType: 'segmented',
      completedAt: new Date().toISOString()
    };
    
    // Also store individual segment details for easy querying
    const segmentDetails = auction.segments.map(segment => ({
      segmentId: segment.id,
      status: segment.status,
      winner: segment.winner || null,
      startPrice: segment.startPrice,
      endPrice: segment.endPrice,
      finalPrice: Math.floor(segment.currentPrice),
      amount: segment.amount,
      endTime: new Date().toISOString()
    }));
    
    // Update order status in DynamoDB with comprehensive data
    this.updateOrderStatus(orderId, 'completed', JSON.stringify(auction.totalWinners), effectiveRate, {
      ...auctionResults,
      segmentDetails: segmentDetails
    });
    
    // Remove from active auctions
    this.activeAuctions.delete(orderId);
    
    // Broadcast final results
    this.broadcastToAll({
      type: 'segmented_auction_completed',
      orderId: orderId,
      totalWinners: auction.totalWinners,
      totalAmount: totalAmount,
      totalValue: totalValue,
      effectiveRate: effectiveRate
    });
  }
  
  endSingleAuction(orderId, status) {
    const auction = this.activeAuctions.get(orderId);
    if (!auction) return;
    
    // Clear interval if exists
    if (auction.interval) {
      clearInterval(auction.interval);
    }
    
    auction.status = status;
    
    console.log(`\n🏁 Single Auction ended with status: ${status}`);
    if (auction.winner) {
      console.log(`🎉 Winner: ${auction.winner} at price ${Math.floor(auction.currentPrice)}`);
    } else {
      console.log(`⏰ Auction expired without winner at price ${Math.floor(auction.currentPrice)}`);
    }
    
    // Prepare auction data for DynamoDB
    const auctionData = {
      winner: auction.winner || null,
      finalPrice: Math.floor(auction.currentPrice),
      startPrice: auction.startPrice,
      endPrice: auction.endPrice,
      sourceAmount: auction.sourceAmount,
      marketPrice: auction.marketPrice,
      auctionType: 'single',
      status: status,
      completedAt: new Date().toISOString()
    };
    
    // Update order status in DynamoDB
    this.updateOrderStatus(orderId, 'completed', auction.winner || 'no_winner', Math.floor(auction.currentPrice), auctionData);
    
    // Broadcast auction end
    this.broadcastToAll({
      type: 'single_auction_completed',
      orderId: orderId,
      status: status,
      winner: auction.winner,
      finalPrice: Math.floor(auction.currentPrice)
    });
    
    // Remove from active auctions
    this.activeAuctions.delete(orderId);
  }
  
  endAuction(orderId, status) {
    const auction = this.activeAuctions.get(orderId);
    if (auction) {
      if (auction.interval) {
        clearInterval(auction.interval);
      }
      
      this.activeAuctions.delete(orderId);
      this.updateOrderStatus(orderId, status);
      
      console.log(`🛑 Auction for order ${orderId} ended. Status: ${status}`);
      
      // Notify all clients
      this.broadcastToAll({
        type: 'auction_ended',
        orderId: orderId,
        status: status
      });
    }
  }
  
  listActiveAuctions() {
    if (this.activeAuctions.size === 0) {
      console.log('📋 No active auctions');
    } else {
      console.log(`📋 Active auctions (${this.activeAuctions.size}):`);
      this.activeAuctions.forEach((auction, orderId) => {
        if (auction.auctionType === 'segmented') {
          console.log(`  - ${orderId} (Segmented): ${auction.segments.length} segments active`);
          auction.segments.forEach(segment => {
            if (segment.status === 'active') {
              const timeRemaining = Math.max(0, segment.endTime - Date.now());
              const minutes = Math.floor(timeRemaining / 60000);
              const seconds = Math.floor((timeRemaining % 60000) / 1000);
              console.log(`    Segment ${segment.id}: $${Math.floor(segment.currentPrice)} (${minutes}m ${seconds}s remaining)`);
            }
          });
        } else if (auction.auctionType === 'single') {
          console.log(`  - ${orderId} (Single): $${Math.floor(auction.currentPrice)} → $${auction.endPrice}`);
        }
      });
    }
  }
  
  async listPendingOrders() {
    try {
      const params = {
        TableName: TABLE_NAME,
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'pending'
        }
      };
      
      const result = await dynamodb.scan(params).promise();
      
      if (result.Items.length === 0) {
        console.log('📋 No pending orders found');
      } else {
        console.log(`📋 Pending orders (${result.Items.length}):`);
        result.Items.forEach(item => {
          console.log(`  - ${item.orderId}: ${item.srcAmount} ${item.srcToken} → ${item.dstAmount} ${item.dstToken}`);
        });
      }
    } catch (error) {
      console.error('❌ Error listing orders:', error);
    }
  }
  
  broadcastToAll(message) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((ws, name) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }
}

// Create DynamoDB table if it doesn't exist
async function createTableIfNotExists() {
  const dynamodbService = new AWS.DynamoDB();
  
  const params = {
    TableName: TABLE_NAME,
    KeySchema: [
      { AttributeName: 'orderId', KeyType: 'HASH' }  // Partition key
    ],
    AttributeDefinitions: [
      { AttributeName: 'orderId', AttributeType: 'S' }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  };

  try {
    await dynamodbService.createTable(params).promise();
    console.log('✅ DynamoDB table created successfully');
  } catch (error) {
    if (error.code === 'ResourceInUseException') {
      console.log('ℹ️ Table already exists');
    } else {
      console.error('❌ Error creating table:', error);
    }
  }
}

// POST /partialfill endpoint - Creates order with segmented auction (4 segments)
app.post('/partialfill', async (req, res) => {
  try {
    const {
      orderId,
      buyerAddress,
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      srcAmount,
      dstAmount,
      hashedSecret,
      secret,
      slippage,
      market_price
    } = req.body;

    // Validate required fields
    if (!orderId || !buyerAddress || !hashedSecret || !secret) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, buyerAddress, hashedSecret, secret'
      });
    }

    // Prepare item for DynamoDB
    const item = {
      orderId,
      buyerAddress,
      srcChainId: srcChainId?.toString() || '',
      dstChainId: dstChainId?.toString() || '',
      srcToken: srcToken || '',
      dstToken: dstToken || '',
      srcAmount: srcAmount?.toString() || '',
      dstAmount: dstAmount?.toString() || '',
      hashedSecret,
      secret,
      slippage: slippage?.toString() || '0.005', // Default 0.5% slippage
      market_price: market_price?.toString() || '3900', // Default market price
      orderType: 'partialfill', // Identify this as a partial fill order
      auctionType: 'segmented', // Segmented auction with 4 segments
      segmentAmount: (parseFloat(srcAmount) / 4).toString(), // Amount per segment
      createdAt: new Date().toISOString(),
      status: 'pending',
      // Store segment secrets (will be populated by maker)
      segmentSecrets: JSON.stringify([])
    };

    // Store in DynamoDB
    const params = {
      TableName: TABLE_NAME,
      Item: item
    };

    await dynamodb.put(params).promise();

    console.log('✅ Partial fill order created successfully:', orderId);

    // Automatically start segmented Dutch auction for the new order
    const startingPrice = parseInt(dstAmount) || 10000; // Use destination amount as starting price
    if (auctionServer) {
      await auctionServer.startSegmentedAuction(orderId, startingPrice);
    }

    res.status(201).json({
      success: true,
      message: 'Partial fill order created successfully and segmented auction started',
      data: {
        orderId,
        orderType: 'partialfill',
        status: 'pending',
        createdAt: item.createdAt,
        auctionStarted: true,
        auctionType: 'segmented',
        startingPrice: startingPrice
      }
    });

  } catch (error) {
    console.error('❌ Error creating partial fill order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /create endpoint - Creates order with single auction (no partial fill)
app.post('/create', async (req, res) => {
  try {
    const {
      orderId,
      buyerAddress,
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      srcAmount,
      dstAmount,
      hashedSecret,
      secret,
      withdrawalStart,
      publicWithdrawalStart,
      cancellationStart,
      publicCancellationStart,
      slippage,
      market_price
    } = req.body;

    // Validate required fields
    if (!orderId || !buyerAddress || !hashedSecret || !secret) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, buyerAddress, hashedSecret, secret'
      });
    }

    // Prepare item for DynamoDB
    const item = {
      orderId,
      buyerAddress,
      srcChainId: srcChainId?.toString() || '',
      dstChainId: dstChainId?.toString() || '',
      srcToken: srcToken || '',
      dstToken: dstToken || '',
      srcAmount: srcAmount?.toString() || '',
      dstAmount: dstAmount?.toString() || '',
      hashedSecret,
      secret,
      slippage: slippage?.toString() || '0.005', // Default 0.5% slippage
      market_price: market_price?.toString() || '3900', // Default market price
      orderType: 'normal', // Identify this as a normal order
      auctionType: 'single', // Single auction (no segments)
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    // Store in DynamoDB
    const params = {
      TableName: TABLE_NAME,
      Item: item
    };

    await dynamodb.put(params).promise();

    console.log('✅ Normal order created successfully:', orderId);

    // Automatically start single Dutch auction for the new order
    const startingPrice = parseInt(dstAmount) || 10000; // Use destination amount as starting price
    if (auctionServer) {
      await auctionServer.startSingleAuction(orderId, startingPrice);
    }

    res.status(201).json({
      success: true,
      message: 'Normal order created successfully and single auction started',
      data: {
        orderId,
        orderType: 'normal',
        status: 'pending',
        createdAt: item.createdAt,
        auctionStarted: true,
        auctionType: 'single',
        startingPrice: startingPrice
      }
    });

  } catch (error) {
    console.error('❌ Error creating normal order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /health endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Relayer server is running',
    timestamp: new Date().toISOString()
  });
});

// GET /orders endpoint - List all orders
app.get('/orders', async (req, res) => {
  try {
    const params = {
      TableName: TABLE_NAME
    };
    
    const result = await dynamodb.scan(params).promise();
    
    // Parse segment data for each order
    const orders = result.Items.map(item => {
      if (item.segmentData) {
        try {
          item.segmentData = JSON.parse(item.segmentData);
        } catch (e) {
          console.log('Could not parse segmentData for order:', item.orderId);
        }
      }
      if (item.segments) {
        try {
          item.segments = JSON.parse(item.segments);
        } catch (e) {
          console.log('Could not parse segments for order:', item.orderId);
        }
      }
      return item;
    });
    
    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
    
  } catch (error) {
    console.error('❌ Error retrieving orders:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /orders/:orderId endpoint
app.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const params = {
      TableName: TABLE_NAME,
      Key: {
        orderId: orderId
      }
    };

    const result = await dynamodb.get(params).promise();

    if (!result.Item) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Parse segment data if it exists
    let parsedData = result.Item;
    if (result.Item.segmentData) {
      try {
        parsedData.segmentData = JSON.parse(result.Item.segmentData);
      } catch (e) {
        console.log('Could not parse segmentData');
      }
    }
    
    // Parse segments array if it exists
    if (result.Item.segments) {
      try {
        parsedData.segments = JSON.parse(result.Item.segments);
      } catch (e) {
        console.log('Could not parse segments');
      }
    }
    
    res.json({
      success: true,
      data: parsedData
    });

  } catch (error) {
    console.error('❌ Error fetching order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /orders/:orderId/segments endpoint - Get detailed segment information
app.get('/orders/:orderId/segments', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const params = {
      TableName: TABLE_NAME,
      Key: { orderId: orderId }
    };
    
    const result = await dynamodb.get(params).promise();
    
    if (!result.Item) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    // Parse segments data
    let segments = [];
    if (result.Item.segments) {
      try {
        segments = JSON.parse(result.Item.segments);
      } catch (e) {
        console.log('Could not parse segments for order:', orderId);
      }
    }
    
    // Parse final segment details if available
    let segmentDetails = [];
    if (result.Item.segmentData && result.Item.segmentData.segmentDetails) {
      segmentDetails = result.Item.segmentData.segmentDetails;
    }
    
    res.json({
      success: true,
      orderId: orderId,
      status: result.Item.status,
      segments: segments,
      segmentDetails: segmentDetails,
      totalSegments: segments.length,
      completedSegments: segments.filter(s => s.status === 'completed' || s.status === 'expired').length
    });
    
  } catch (error) {
    console.error('❌ Error retrieving segment information:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /orders/:orderId/segment-secrets endpoint - Update segment secrets for partial fill orders
app.post('/orders/:orderId/segment-secrets', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { segmentSecrets } = req.body;

    // Validate required fields
    if (!segmentSecrets || !Array.isArray(segmentSecrets)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid segmentSecrets array'
      });
    }

    // Validate segment secrets structure
    for (let i = 0; i < segmentSecrets.length; i++) {
      const secret = segmentSecrets[i];
      if (!secret.segmentId || !secret.secret || !secret.hashedSecret) {
        return res.status(400).json({
          success: false,
          error: `Invalid segment secret at index ${i}. Must have segmentId, secret, and hashedSecret`
        });
      }
    }

    // Get order from DynamoDB
    const getParams = {
      TableName: TABLE_NAME,
      Key: { orderId: orderId }
    };

    const orderResult = await dynamodb.get(getParams).promise();
    if (!orderResult.Item) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const order = orderResult.Item;
    
    // Verify this is a partial fill order
    if (order.orderType !== 'partialfill') {
      return res.status(400).json({
        success: false,
        error: 'Can only update segment secrets for partial fill orders'
      });
    }

    // Update the order with segment secrets
    const updateParams = {
      TableName: TABLE_NAME,
      Key: { orderId: orderId },
      UpdateExpression: 'SET #segmentSecrets = :segmentSecrets, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#segmentSecrets': 'segmentSecrets',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':segmentSecrets': JSON.stringify(segmentSecrets),
        ':updatedAt': new Date().toISOString()
      }
    };

    await dynamodb.update(updateParams).promise();

    console.log(`✅ Updated segment secrets for order ${orderId}`);
    console.log(`📊 Total segment secrets: ${segmentSecrets.length}`);

    res.json({
      success: true,
      message: 'Segment secrets updated successfully',
      data: {
        orderId: orderId,
        segmentSecrets: segmentSecrets,
        totalSegments: segmentSecrets.length
      }
    });

  } catch (error) {
    console.error('❌ Error updating segment secrets:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /verify endpoint - Verify transactions using ethchecker and xlmchecker logic
app.post('/verify', async (req, res) => {
  try {
    const {
      escrowAddress,
      targetAddress,
      xlmaddress
    } = req.body;

    // Validate required fields
    if (!escrowAddress || !targetAddress || !xlmaddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: escrowAddress, targetAddress, xlmaddress'
      });
    }

    console.log(`🔍 Starting verification process...`);
    console.log(`📊 Escrow Address: ${escrowAddress}`);
    console.log(`📊 Target Address: ${targetAddress}`);
    console.log(`📊 XLM Address: ${xlmaddress}`);

    // Import required modules
    const axios = require('axios');
    const { ethers } = require('ethers');

    // Configuration
    const ALCHEMY_URL = "https://eth-sepolia.g.alchemy.com/v2/NMsHzNgJ7XUYtzNyFpEJ8yT4muQ_lkRF";
    const targetAmount = 0.001; // From ethchecker.js
    const contractAddress = 'CBDMXSMH25IQJPI4YSAKMVITGXFVFH2O23SSAPS5L73F2WIGSDHQA6OY';
    const stellarTestnetHorizon = 'https://horizon-testnet.stellar.org';

    let ethResult = false;
    let xlmResult = false;

    // === ETHEREUM CHECK (from ethchecker.js) ===
    console.log(`\n🔗 Checking Ethereum transactions...`);
    try {
      console.log(`📊 Using escrow address: ${escrowAddress.toLowerCase()}`);
      console.log(`📊 Looking for transactions from: ${targetAddress.toLowerCase()}`);
      console.log(`📊 Target amount: ${targetAmount} ETH`);
      
      const response = await axios.post(ALCHEMY_URL, {
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getAssetTransfers",
        params: [{
          fromBlock: "0x0",
          toBlock: "latest",
          toAddress: escrowAddress.toLowerCase(),
          category: ["internal"], // Only internal txs
          withMetadata: true,
          excludeZeroValue: false,
          maxCount: "0x3e8"
        }]
      });

      console.log(`📊 Alchemy response status: ${response.status}`);
      
      if (response.data.error) {
        console.error(`❌ Alchemy API error:`, response.data.error);
        throw new Error(`Alchemy API error: ${JSON.stringify(response.data.error)}`);
      }

      const transfers = response.data.result.transfers;
      console.log(`📊 Total Internal Transactions to Escrow: ${transfers.length}`);

      // Log first few transactions for debugging
      if (transfers.length > 0) {
        console.log(`📊 Sample transactions:`);
        transfers.slice(0, 3).forEach((tx, i) => {
          console.log(`  ${i + 1}. From: ${tx.from}, To: ${tx.to}, Value: ${tx.value}, Hash: ${tx.hash}`);
        });
      }

      const matched = transfers.filter(tx => {
        const from = tx.from?.toLowerCase();
        const value = parseFloat(tx.value || 0);
        const matches = from === targetAddress.toLowerCase() && value === targetAmount;
        if (matches) {
          console.log(`  Found matching transaction: ${tx.hash} from ${from} with value ${value}`);
        }
        return matches;
      });

      if (matched.length > 0) {
        console.log(`✅ ETH Match found! ${matched.length} transaction(s) from ${targetAddress} with value ${targetAmount} ETH`);
        matched.forEach((tx, i) => {
          console.log(`  ${i + 1}. Hash: ${tx.hash}`);
        });
        ethResult = true;
      } else {
        console.log(`❌ No matching ETH transactions found for address ${targetAddress} with value ${targetAmount} ETH`);
      }
    } catch (error) {
      console.error("❌ Error checking Ethereum transactions:", error.response?.data || error.message);
      if (error.response?.data) {
        console.error("❌ Full error response:", JSON.stringify(error.response.data, null, 2));
      }
      
      // If it's an Alchemy API error, try with a different approach
      if (error.response?.data?.error?.code === 1002 || error.message.includes('Internal server error')) {
        console.log(`🔄 Trying alternative approach due to Alchemy API error...`);
        try {
          // Try with a simpler request
          const altResponse = await axios.post(ALCHEMY_URL, {
            jsonrpc: "2.0",
            id: 1,
            method: "alchemy_getAssetTransfers",
            params: [{
              fromBlock: "0x0",
              toBlock: "latest",
              toAddress: escrowAddress.toLowerCase(),
              category: ["internal"],
              withMetadata: false,
              excludeZeroValue: false,
              maxCount: "0x64" // Reduced count
            }]
          });
          
          if (altResponse.data.error) {
            console.error(`❌ Alternative approach also failed:`, altResponse.data.error);
          } else {
            const altTransfers = altResponse.data.result.transfers;
            console.log(`📊 Alternative approach found ${altTransfers.length} transactions`);
            
            const altMatched = altTransfers.filter(tx => {
              const from = tx.from?.toLowerCase();
              const value = parseFloat(tx.value || 0);
              return from === targetAddress.toLowerCase() && value === targetAmount;
            });
            
            if (altMatched.length > 0) {
              console.log(`✅ ETH Match found via alternative approach!`);
              ethResult = true;
            }
          }
        } catch (altError) {
          console.error("❌ Alternative approach also failed:", altError.message);
        }
      }
    }

    // === STELLAR CHECK (from xlmchecker.js) ===
    console.log(`\n⭐ Checking Stellar transactions...`);
    try {
      // Test connection first
      const horizonResponse = await fetch(stellarTestnetHorizon);
      if (!horizonResponse.ok) {
        console.log('❌ Cannot connect to Stellar Horizon');
        xlmResult = false;
      } else {
        console.log('✅ Connected to Stellar Horizon');

        // Check if XLM address exists
        const accountResponse = await fetch(`${stellarTestnetHorizon}/accounts/${xlmaddress}`);
        if (!accountResponse.ok) {
          console.log(`❌ XLM address ${xlmaddress} not found`);
          xlmResult = false;
        } else {
          console.log(`✅ XLM address ${xlmaddress} exists`);

          // Get recent transactions
          const txResponse = await fetch(`${stellarTestnetHorizon}/accounts/${xlmaddress}/transactions?order=desc&limit=10`);
          if (txResponse.ok) {
            const txData = await txResponse.json();
            const transactions = txData._embedded ? txData._embedded.records : [];
            console.log(`📊 Found ${transactions.length} recent XLM transactions`);

            // Check each transaction for time and effect criteria
            for (let i = 0; i < transactions.length; i++) {
              const tx = transactions[i];
              
              // Check if transaction is within 5 minutes
              const currentTime = new Date();
              const txTime = new Date(tx.created_at);
              const timeDiffMs = currentTime.getTime() - txTime.getTime();
              const timeDiffMinutes = timeDiffMs / (1000 * 60);
              
              console.log(`  Checking transaction ${i + 1}: ${tx.hash} (${timeDiffMinutes.toFixed(2)} minutes ago)`);
              
              if (timeDiffMinutes <= 5) {
                // Check effects for account_debited
                const effectsResponse = await fetch(`${stellarTestnetHorizon}/transactions/${tx.hash}/effects`);
                if (effectsResponse.ok) {
                  const effectsData = await effectsResponse.json();
                  const effects = effectsData._embedded ? effectsData._embedded.records : [];
                  
                  if (effects.length > 0 && effects[0].type === 'account_debited') {
                    console.log(`✅ XLM Match found! Transaction ${tx.hash} has Effect 1 = "account_debited" and is within 5 minutes`);
                    xlmResult = true;
                    break;
                  }
                }
              } else {
                console.log(`  Transaction is older than 5 minutes, skipping...`);
              }
            }
            
            if (!xlmResult) {
              console.log(`❌ No matching XLM transactions found with Effect 1 = "account_debited" within 5 minutes`);
            }
          } else {
            console.log(`❌ Error fetching XLM transactions`);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error checking Stellar transactions:", error.message);
    }

    // === FINAL RESULT ===
    console.log(`\n📋 VERIFICATION RESULTS:`);
    console.log(`🔗 Ethereum: ${ethResult ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`⭐ Stellar: ${xlmResult ? '✅ PASS' : '❌ FAIL'}`);

    const overallResult = ethResult || xlmResult;
    console.log(`🎯 Overall Result: ${overallResult ? '✅ TRUE' : '❌ FALSE'}`);

    if (overallResult) {
      res.json({
        success: true,
        message: 'Verification successful - At least one test case passed',
        data: {
          ethResult: ethResult,
          xlmResult: xlmResult,
          overallResult: true,
          details: {
            ethereum: {
              checked: true,
              passed: ethResult,
              escrowAddress: escrowAddress,
              targetAddress: targetAddress,
              targetAmount: targetAmount
            },
            stellar: {
              checked: true,
              passed: xlmResult,
              xlmAddress: xlmaddress,
              contractAddress: contractAddress,
              timeFilter: '5 minutes',
              effectFilter: 'account_debited'
            }
          }
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Verification failed - No test cases passed',
        data: {
          ethResult: ethResult,
          xlmResult: xlmResult,
          overallResult: false,
          details: {
            ethereum: {
              checked: true,
              passed: ethResult,
              escrowAddress: escrowAddress,
              targetAddress: targetAddress,
              targetAmount: targetAmount
            },
            stellar: {
              checked: true,
              passed: xlmResult,
              xlmAddress: xlmaddress,
              contractAddress: contractAddress,
              timeFilter: '5 minutes',
              effectFilter: 'account_debited'
            }
          }
        }
      });
    }

  } catch (error) {
    console.error('❌ Error in verification process:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Global auction server instance
let auctionServer;

// Start server
async function startServer() {
  try {
    // Create table if it doesn't exist
    await createTableIfNotExists();
    
    // Start Dutch Auction WebSocket server
    auctionServer = new DutchAuctionServer();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Relayer server running on port ${PORT}`);
      console.log(`📊 DynamoDB table: ${TABLE_NAME}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
      console.log(`📝 Create normal order: POST http://localhost:${PORT}/create`);
      console.log(`📝 Create partial fill order: POST http://localhost:${PORT}/partialfill`);
      console.log(`🔍 Verify transactions: POST http://localhost:${PORT}/verify`);
      console.log(`🔐 Update segment secrets: POST http://localhost:${PORT}/orders/:orderId/segment-secrets`);
      console.log(`📋 Get orders: GET http://localhost:${PORT}/orders`);
      console.log(`📋 Get order details: GET http://localhost:${PORT}/orders/:orderId`);
      console.log(`📋 Get segment info: GET http://localhost:${PORT}/orders/:orderId/segments`);
    });
    
    console.log('\n🎯 Dutch Auction System Ready!');
    console.log('📋 Available commands:');
    console.log('  auctions - Show active auctions');
    console.log('  clients - Show connected clients');
    console.log('  orders - Show pending orders');
    console.log('  quit - Exit server');
    console.log('');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down relayer server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down relayer server...');
  process.exit(0);
});

startServer(); 