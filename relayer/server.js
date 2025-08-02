const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const WebSocket = require('ws');
const readline = require('readline');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;
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
        timeRemaining: auction.endTime - Date.now(),
        buyerAddress: auction.buyerAddress,
        buyerEthAddress: auction.buyerEthAddress,
        buyerStellarAddress: auction.buyerStellarAddress
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
          // Send error response to client
          try {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid message format'
            }));
          } catch (sendError) {
            console.error('❌ Failed to send error response:', sendError);
          }
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
    try {
      switch (data.type) {
      case 'register':
        this.clients.set(data.name, ws);
        console.log(`📝 Auction client registered: ${data.name}`);
        break;
        
      case 'request_active_auctions':
        // Send list of currently active auctions to the client
        const activeAuctionsList = Array.from(this.activeAuctions.values()).map(auction => {
          // Create a clean object with ALL database fields
          const cleanAuction = {
            orderId: auction.orderId,
            orderType: auction.orderType,
            auctionType: auction.auctionType,
            // Include ALL database fields
            hashedSecret: auction.hashedSecret,
            buyerAddress: auction.buyerAddress,
            buyerEthAddress: auction.buyerEthAddress,
            buyerStellarAddress: auction.buyerStellarAddress,
            srcChainId: auction.srcChainId,
            dstChainId: auction.dstChainId,
            srcToken: auction.srcToken,
            dstToken: auction.dstToken,
            srcAmount: auction.srcAmount,
            dstAmount: auction.dstAmount,
            status: auction.status,
            createdAt: auction.createdAt,
            market_price: auction.market_price,
            slippage: auction.slippage,
            // Auction-specific calculated fields
            currentPrice: auction.currentPrice || auction.segments?.[0]?.currentPrice,
            startPrice: auction.startPrice || auction.segments?.[0]?.startPrice,
            endPrice: auction.endPrice || auction.minimumPrice,
            minimumPrice: auction.minimumPrice,
            sourceAmount: auction.sourceAmount,
            marketPrice: auction.marketPrice,
            winner: auction.winner,
            endTime: auction.endTime,
            segments: auction.segments ? auction.segments.map(segment => ({
              id: segment.id,
              amount: segment.amount,
              startPrice: segment.startPrice,
              endPrice: segment.endPrice,
              currentPrice: segment.currentPrice,
              winner: segment.winner,
              status: segment.status,
              endTime: segment.endTime
              // Don't include interval or other circular references
            })) : [],
            totalWinners: auction.totalWinners || [],
            // Don't include intervals array as it contains circular references
          };
          return cleanAuction;
        });
        
        ws.send(JSON.stringify({
          type: 'active_auctions_received',
          auctions: activeAuctionsList
        }));
        console.log(`📋 Sent ${activeAuctionsList.length} active auctions to client`);
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
            buyerAddress: auction.buyerAddress,
            buyerEthAddress: auction.buyerEthAddress,
            buyerStellarAddress: auction.buyerStellarAddress,
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
    } catch (error) {
      console.error('❌ Error handling client message:', error);
      try {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Internal server error'
        }));
      } catch (sendError) {
        console.error('❌ Failed to send error response:', sendError);
      }
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
  
  async startSegmentedAuction(orderId) {
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
    
    // Get slippage from order data
    const slippage = parseFloat(orderData.slippage) || 0.02; // Default 2% slippage
    const minimumPrice = parseFloat((marketPrice * (1 - slippage)).toFixed(5)); // Market price with slippage - exact to 5 decimals
    
    // Calculate segment starting prices based on market price (original logic) - exact to 5 decimals
    const segment1StartPrice = parseFloat((marketPrice * 1.077).toFixed(5)); // ~4,200 for 3,900 market
    const segment2StartPrice = parseFloat((marketPrice * 1.051).toFixed(5)); // ~4,100 for 3,900 market  
    const segment3StartPrice = parseFloat((marketPrice * 1.026).toFixed(5)); // ~4,000 for 3,900 market
    const segment4StartPrice = parseFloat((marketPrice * 1.0).toFixed(5)); // Market price
    
    console.log(`📊 Market price: ${marketPrice.toFixed(5)}`);
    console.log(`📈 Segment 1 starting price: ${segment1StartPrice.toFixed(5)} (1.077 × ${marketPrice.toFixed(5)})`);
    console.log(`📈 Segment 2 starting price: ${segment2StartPrice.toFixed(5)} (1.051 × ${marketPrice.toFixed(5)})`);
    console.log(`📈 Segment 3 starting price: ${segment3StartPrice.toFixed(5)} (1.026 × ${marketPrice.toFixed(5)})`);
    console.log(`📈 Segment 4 starting price: ${segment4StartPrice.toFixed(5)} (1.0 × ${marketPrice.toFixed(5)})`);
    console.log(`📉 Minimum price: ${minimumPrice.toFixed(5)} (${marketPrice.toFixed(5)} × (1 - ${slippage}))`);
    console.log(`⏱️ Price reduction: 5% every 10 seconds for each segment`);
    
    // Create auction object with segmented data
    const auction = {
      orderId: orderId,
      orderType: 'partialfill',
      auctionType: 'segmented',
      // Include ALL database fields
      hashedSecret: orderData.hashedSecret || '',
      buyerAddress: orderData.buyerAddress || '',
      srcChainId: orderData.srcChainId || '',
      dstChainId: orderData.dstChainId || '',
      srcToken: orderData.srcToken || '',
      dstToken: orderData.dstToken || '',
      srcAmount: orderData.srcAmount || '',
      dstAmount: orderData.dstAmount || '',
      status: orderData.status || '',
      createdAt: orderData.createdAt || '',
      market_price: orderData.market_price || '',
      slippage: orderData.slippage || '',
      orderType: orderData.orderType || '',
      auctionType: orderData.auctionType || '',
      // Auction-specific calculated fields
      sourceAmount: sourceAmount,
      marketPrice: marketPrice,
      minimumPrice: minimumPrice,
      segments: [
        {
          id: 1,
          amount: segmentAmount,
          startPrice: segment1StartPrice,
          endPrice: minimumPrice,
          currentPrice: segment1StartPrice,
          winner: null,
          status: 'active',
          endTime: null // No fixed end time, ends when price reaches minimum or winner
        },
        {
          id: 2,
          amount: segmentAmount,
          startPrice: segment2StartPrice,
          endPrice: minimumPrice,
          currentPrice: segment2StartPrice,
          winner: null,
          status: 'active',
          endTime: null // No fixed end time, ends when price reaches minimum or winner
        },
        {
          id: 3,
          amount: segmentAmount,
          startPrice: segment3StartPrice,
          endPrice: minimumPrice,
          currentPrice: segment3StartPrice,
          winner: null,
          status: 'active',
          endTime: null // No fixed end time, ends when price reaches minimum or winner
        },
        {
          id: 4,
          amount: segmentAmount,
          startPrice: segment4StartPrice,
          endPrice: minimumPrice,
          currentPrice: segment4StartPrice,
          winner: null,
          status: 'active',
          endTime: null // No fixed end time, ends when price reaches minimum or winner
        }
      ],
      totalWinners: [],
      intervals: [] // Array to store all segment intervals
    };
    
    console.log('🔍 Segmented auction created with buyer address:', auction.buyerAddress)
    console.log('🔍 Order data buyer address:', orderData.buyerAddress)
    
    // Add to active auctions
    this.activeAuctions.set(orderId, auction);
    
    console.log('🔐 ========================================');
    console.log('🔐 SEGMENTED AUCTION CREATED WITH HASHED SECRET');
    console.log('🔐 ========================================');
    console.log('📋 Order ID:', orderId);
    console.log('🔐 Hashed Secret (Merkle Root):', auction.hashedSecret);
    console.log(`📊 Segment 1: ${segment1StartPrice} → ${minimumPrice} (${segmentAmount} tokens)`);
    console.log(`📊 Segment 2: ${segment2StartPrice} → ${minimumPrice} (${segmentAmount} tokens)`);
    console.log(`📊 Segment 3: ${segment3StartPrice} → ${minimumPrice} (${segmentAmount} tokens)`);
    console.log(`📊 Segment 4: ${segment4StartPrice} → ${minimumPrice} (${segmentAmount} tokens)`);
    console.log(`🛑 Stop when price ≤ ${minimumPrice} or winner arrives for each segment`);
    console.log('🔐 ========================================');
    
    // Broadcast new auction to all clients
    this.broadcastToAll({
      type: 'new_segmented_auction',
      orderId: orderId,
      orderType: auction.orderType,
      auctionType: auction.auctionType,
      // Include ALL database fields
      hashedSecret: auction.hashedSecret,
      buyerAddress: auction.buyerAddress,
      buyerEthAddress: auction.buyerEthAddress,
      buyerStellarAddress: auction.buyerStellarAddress,
      srcChainId: auction.srcChainId,
      dstChainId: auction.dstChainId,
      srcToken: auction.srcToken,
      dstToken: auction.dstToken,
      srcAmount: auction.srcAmount,
      dstAmount: auction.dstAmount,
      status: auction.status,
      createdAt: auction.createdAt,
      market_price: auction.market_price,
      slippage: auction.slippage,
      // Auction-specific calculated fields
      segments: auction.segments,
      marketPrice: auction.marketPrice,
      sourceAmount: auction.sourceAmount,
      minimumPrice: auction.minimumPrice
    });
    
    // Start all segments in parallel
    for (let i = 1; i <= 4; i++) {
      this.startSegmentAuction(orderId, i);
    }
  }

  async startSingleAuction(orderId) {
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
    const slippage = parseFloat(orderData.slippage) || 0.02; // Default 2% slippage
    
    // Calculate auction parameters according to new logic
    const startPrice = Math.floor(marketPrice * 1.2); // 1.2 x market price
    const minimumPrice = Math.round(marketPrice * (1 - slippage)); // Market price with slippage
    
    console.log(`\n🚀 Starting Single Dutch Auction for order ${orderId}`);
    console.log(`💰 Total source amount: ${sourceAmount}`);
    console.log(`📊 Market price: ${marketPrice}`);
    console.log(`📈 Starting price: ${startPrice} (1.2 × ${marketPrice})`);
    console.log(`📉 Minimum price: ${minimumPrice} (${marketPrice} × (1 - ${slippage}))`);
    console.log(`⏱️ Price reduction: 5% every 10 seconds`);
    console.log(`🛑 Stop when price ≤ ${minimumPrice} or winner arrives`);
    
    // Create auction object for single auction
    const auction = {
      orderId: orderId,
      orderType: 'normal',
      auctionType: 'single',
      // Include ALL database fields
      hashedSecret: orderData.hashedSecret || '',
      buyerAddress: orderData.buyerAddress || '',
      srcChainId: orderData.srcChainId || '',
      dstChainId: orderData.dstChainId || '',
      srcToken: orderData.srcToken || '',
      dstToken: orderData.dstToken || '',
      srcAmount: orderData.srcAmount || '',
      dstAmount: orderData.dstAmount || '',
      status: orderData.status || '',
      createdAt: orderData.createdAt || '',
      market_price: orderData.market_price || '',
      slippage: orderData.slippage || '',
      orderType: orderData.orderType || '',
      auctionType: orderData.auctionType || '',
      // Auction-specific calculated fields
      currentPrice: startPrice,
      startPrice: startPrice,
      endPrice: marketPrice,
      minimumPrice: minimumPrice,
      sourceAmount: sourceAmount,
      marketPrice: marketPrice,
      winner: null,
      status: 'active',
      endTime: null, // No fixed end time, ends when price reaches minimum price or winner
      interval: null
    };
    
    console.log('🔍 Single auction created with buyer address:', auction.buyerAddress)
    console.log('🔍 Order data buyer address:', orderData.buyerAddress)
    
    // Add to active auctions
    this.activeAuctions.set(orderId, auction);
    
    console.log('🔐 ========================================');
    console.log('🔐 SINGLE AUCTION CREATED WITH HASHED SECRET');
    console.log('🔐 ========================================');
    console.log('📋 Order ID:', orderId);
    console.log('🔐 Hashed Secret:', auction.hashedSecret);
    console.log(`📊 Price range: ${startPrice} → ${minimumPrice}`);
    console.log(`📉 Market price: ${marketPrice}`);
    console.log('🔐 ========================================');
    
    // Broadcast new auction to all clients
    this.broadcastToAll({
      type: 'new_single_auction',
      orderId: orderId,
      orderType: auction.orderType,
      auctionType: auction.auctionType,
      // Include ALL database fields
      hashedSecret: auction.hashedSecret,
      buyerAddress: auction.buyerAddress,
      buyerEthAddress: auction.buyerEthAddress,
      buyerStellarAddress: auction.buyerStellarAddress,
      srcChainId: auction.srcChainId,
      dstChainId: auction.dstChainId,
      srcToken: auction.srcToken,
      dstToken: auction.dstToken,
      srcAmount: auction.srcAmount,
      dstAmount: auction.dstAmount,
      status: auction.status,
      createdAt: auction.createdAt,
      market_price: auction.market_price,
      slippage: auction.slippage,
      // Auction-specific calculated fields
      currentPrice: startPrice,
      startPrice: startPrice,
      endPrice: minimumPrice,
      marketPrice: marketPrice,
      sourceAmount: sourceAmount
    });
    
    // Start single auction
    this.startSingleAuctionTimer(orderId);
  }
  
  startSingleAuctionTimer(orderId) {
    const auction = this.activeAuctions.get(orderId);
    if (!auction) return;
    
    console.log(`\n🎯 Starting Single Auction timer for order ${orderId}`);
    console.log(`💰 Starting price: ${auction.startPrice}`);
    console.log(`📉 Minimum price: ${auction.minimumPrice}`);
    console.log(`📊 Market price: ${auction.marketPrice}`);
    console.log(`⏱️ Price reduction: 5% every 10 seconds`);
    
    // Price reduction: 5% of current price every 10 seconds
    const interval = setInterval(() => {
      if (auction.winner) {
        clearInterval(interval);
        return;
      }
      
      // Calculate price reduction (5% of current price)
      const priceReduction = auction.currentPrice * 0.05;
      auction.currentPrice = Math.max(auction.minimumPrice, auction.currentPrice - priceReduction);
      
      console.log(`💰 Order ${orderId} - Current price: ${auction.currentPrice.toFixed(2)}`);
      
      // Broadcast updated price
      this.broadcastToAll({
        type: 'single_auction_update',
        orderId: orderId,
        // Include ALL database fields
        hashedSecret: auction.hashedSecret,
        buyerAddress: auction.buyerAddress,
        buyerEthAddress: auction.buyerEthAddress,
        buyerStellarAddress: auction.buyerStellarAddress,
        srcChainId: auction.srcChainId,
        dstChainId: auction.dstChainId,
        srcToken: auction.srcToken,
        dstToken: auction.dstToken,
        srcAmount: auction.srcAmount,
        dstAmount: auction.dstAmount,
        status: auction.status,
        createdAt: auction.createdAt,
        market_price: auction.market_price,
        slippage: auction.slippage,
        // Auction-specific calculated fields
        currentPrice: Math.round(auction.currentPrice * 100) / 100, // Round to 2 decimal places
        startPrice: auction.startPrice,
        endPrice: auction.minimumPrice,
        marketPrice: auction.marketPrice,
        timeRemaining: null // No fixed time
      });
      
      // Check if price reached minimum price - but don't end auction automatically
      if (auction.currentPrice <= auction.minimumPrice) {
        console.log(`🛑 Single auction reached minimum price (${auction.minimumPrice}), stopping price reduction`);
        clearInterval(interval); // Clear the interval but keep auction active
        // Don't end the auction - let it stay active until someone resolves it
        return; // Exit the interval callback
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
    console.log(`📉 Minimum price: ${segment.endPrice}`);
    console.log(`📊 Market price: ${auction.marketPrice}`);
    console.log(`⏱️ Price reduction: 5% every 10 seconds`);
    
    // Price reduction: 5% of current price every 10 seconds (same as single auction)
    const interval = setInterval(() => {
      if (segment.winner) {
        clearInterval(interval);
        return;
      }
      
      // Calculate price reduction (5% of current price)
      const priceReduction = segment.currentPrice * 0.05;
      segment.currentPrice = Math.max(segment.endPrice, segment.currentPrice - priceReduction);
      
      console.log(`💰 Order ${orderId} Segment ${segmentId} - Current price: ${segment.currentPrice.toFixed(2)}`);
      
      // Broadcast updated price
      this.broadcastToAll({
        type: 'segment_update',
        orderId: orderId,
        segmentId: segmentId,
        // Include ALL database fields
        hashedSecret: auction.hashedSecret,
        buyerAddress: auction.buyerAddress,
        buyerEthAddress: auction.buyerEthAddress,
        buyerStellarAddress: auction.buyerStellarAddress,
        srcChainId: auction.srcChainId,
        dstChainId: auction.dstChainId,
        srcToken: auction.srcToken,
        dstToken: auction.dstToken,
        srcAmount: auction.srcAmount,
        dstAmount: auction.dstAmount,
        status: auction.status,
        createdAt: auction.createdAt,
        market_price: auction.market_price,
        slippage: auction.slippage,
        // Auction-specific calculated fields
        currentPrice: Math.round(segment.currentPrice * 100) / 100, // Round to 2 decimal places
        startPrice: segment.startPrice,
        endPrice: segment.endPrice,
        marketPrice: auction.marketPrice,
        timeRemaining: null // No fixed time
      });
      
      // Check if price reached minimum price - but don't end segment automatically
      if (segment.currentPrice <= segment.endPrice) {
        console.log(`🛑 Segment ${segmentId} reached minimum price (${segment.endPrice}), stopping price reduction`);
        clearInterval(interval); // Clear the interval but keep segment active
        // Don't end the segment - let it stay active until someone resolves it
        return; // Exit the interval callback
      }
    }, 10000); // Update every 10 seconds
    
    // Store interval reference
    auction.intervals.push(interval);
  }
  
  endSegment(orderId, segmentId, status) {
    const auction = this.activeAuctions.get(orderId);
    if (!auction) return;
    
    const segment = auction.segments.find(s => s.id === segmentId);
    if (!segment) return;
    
    // Prevent multiple calls to endSegment for the same segment
    if (segment.status === 'completed' || segment.status === 'expired') {
      console.log(`⚠️ Segment ${segmentId} already ended with status: ${segment.status}`);
      return;
    }
    
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
      endPrice: segment.endPrice, // This is now the minimum price
      finalPrice: Math.floor(segment.currentPrice),
      amount: segment.amount,
      marketPrice: auction.marketPrice,
      slippage: auction.slippage,
      endTime: new Date().toISOString()
    };
    
    this.updateOrderStatus(orderId, 'segment_completed', segment.winner || 'no_winner', Math.floor(segment.currentPrice), segmentData);
    
    // Broadcast segment end
    this.broadcastToAll({
      type: 'segment_ended',
      orderId: orderId,
      segmentId: segmentId,
      // Include ALL database fields
      hashedSecret: auction.hashedSecret,
      buyerAddress: auction.buyerAddress,
      buyerEthAddress: auction.buyerEthAddress,
      buyerStellarAddress: auction.buyerStellarAddress,
      srcChainId: auction.srcChainId,
      dstChainId: auction.dstChainId,
      srcToken: auction.srcToken,
      dstToken: auction.dstToken,
      srcAmount: auction.srcAmount,
      dstAmount: auction.dstAmount,
      status: auction.status,
      createdAt: auction.createdAt,
      market_price: auction.market_price,
      slippage: auction.slippage,
      // Auction-specific calculated fields
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
      endPrice: segment.endPrice, // This is now the minimum price
      finalPrice: Math.floor(segment.currentPrice),
      amount: segment.amount,
      marketPrice: auction.marketPrice,
      slippage: auction.slippage,
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
      // Include ALL database fields
      hashedSecret: auction.hashedSecret,
      buyerAddress: auction.buyerAddress,
      buyerEthAddress: auction.buyerEthAddress,
      buyerStellarAddress: auction.buyerStellarAddress,
      srcChainId: auction.srcChainId,
      dstChainId: auction.dstChainId,
      srcToken: auction.srcToken,
      dstToken: auction.dstToken,
      srcAmount: auction.srcAmount,
      dstAmount: auction.dstAmount,
      status: auction.status,
      createdAt: auction.createdAt,
      market_price: auction.market_price,
      slippage: auction.slippage,
      // Auction-specific calculated fields
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
      endPrice: auction.minimumPrice,
      marketPrice: auction.marketPrice,
      sourceAmount: auction.sourceAmount,
      slippage: auction.slippage,
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
      // Include ALL database fields
      hashedSecret: auction.hashedSecret,
      buyerAddress: auction.buyerAddress,
      buyerEthAddress: auction.buyerEthAddress,
      buyerStellarAddress: auction.buyerStellarAddress,
      srcChainId: auction.srcChainId,
      dstChainId: auction.dstChainId,
      srcToken: auction.srcToken,
      dstToken: auction.dstToken,
      srcAmount: auction.srcAmount,
      dstAmount: auction.dstAmount,
      status: auction.status,
      createdAt: auction.createdAt,
      market_price: auction.market_price,
      slippage: auction.slippage,
      // Auction-specific calculated fields
      status: status,
      winner: auction.winner,
      finalPrice: Math.floor(auction.currentPrice),
      startPrice: auction.startPrice,
      endPrice: auction.minimumPrice,
      marketPrice: auction.marketPrice
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
        // Include ALL database fields
        hashedSecret: auction.hashedSecret,
        buyerAddress: auction.buyerAddress,
        buyerEthAddress: auction.buyerEthAddress,
        buyerStellarAddress: auction.buyerStellarAddress,
        srcChainId: auction.srcChainId,
        dstChainId: auction.dstChainId,
        srcToken: auction.srcToken,
        dstToken: auction.dstToken,
        srcAmount: auction.srcAmount,
        dstAmount: auction.dstAmount,
        status: auction.status,
        createdAt: auction.createdAt,
        market_price: auction.market_price,
        slippage: auction.slippage,
        // Auction-specific calculated fields
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
          console.log(`  - ${orderId} (Single): $${Math.floor(auction.currentPrice)} → $${auction.minimumPrice} (Market: $${auction.marketPrice})`);
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
      buyerEthAddress,
      buyerStellarAddress,
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      srcAmount,
      dstAmount,
      slippage,
      market_price,
      hashedSecret,
      segmentSecrets
    } = req.body;

    // Validate required fields
    if (!orderId || !buyerAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, buyerAddress'
      });
    }

    // Prepare item for DynamoDB
    const item = {
      orderId,
      buyerAddress,
      buyerEthAddress: buyerEthAddress || '',
      buyerStellarAddress: buyerStellarAddress || '',
      srcChainId: srcChainId?.toString() || '',
      dstChainId: dstChainId?.toString() || '',
      srcToken: srcToken || '',
      dstToken: dstToken || '',
      srcAmount: srcAmount?.toString() || '',
      dstAmount: dstAmount?.toString() || '',
      slippage: slippage?.toString() || '0.005', // Default 0.5% slippage
      market_price: market_price?.toString() || '3900', // Default market price
      hashedSecret: hashedSecret || '', // Store hashedSecret for resolver
      orderType: 'partialfill', // Identify this as a partial fill order
      auctionType: 'segmented', // Segmented auction with 4 segments
      segmentAmount: (parseFloat(srcAmount) / 4).toString(), // Amount per segment
      createdAt: new Date().toISOString(),
      status: 'pending',
      // Store segment secrets if provided, otherwise empty array
      segmentSecrets: segmentSecrets ? JSON.stringify(segmentSecrets) : JSON.stringify([])
    };

    console.log('🔐 ========================================');
    console.log('🔐 STORING PARTIAL FILL ORDER IN DATABASE');
    console.log('🔐 ========================================');
    console.log('📋 Order ID:', orderId);
    console.log('🔐 Hashed Secret (Merkle Root):', hashedSecret);
    console.log('🔐 Segment Secrets Count:', segmentSecrets ? segmentSecrets.length : 0);
    if (segmentSecrets) {
      segmentSecrets.forEach((segment, index) => {
        console.log(`   Segment ${segment.segmentId}: Secret: ${segment.secret.slice(0, 10)}..., Hash: ${segment.hashedSecret.slice(0, 10)}...`);
      });
    }
    console.log('🔐 ========================================');

    // Store in DynamoDB
    const params = {
      TableName: TABLE_NAME,
      Item: item
    };

    await dynamodb.put(params).promise();

    console.log('✅ Partial fill order created successfully:', orderId);

    // Automatically start segmented Dutch auction for the new order
    if (global.auctionServer) {
      await global.auctionServer.startSegmentedAuction(orderId);
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
        auctionType: 'segmented'
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
      buyerEthAddress,
      buyerStellarAddress,
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      srcAmount,
      dstAmount,
      withdrawalStart,
      publicWithdrawalStart,
      cancellationStart,
      publicCancellationStart,
      slippage,
      market_price,
      hashedSecret
    } = req.body;

    // Validate required fields
    if (!orderId || !buyerAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, buyerAddress'
      });
    }

    // Prepare item for DynamoDB
    const item = {
      orderId,
      buyerAddress,
      buyerEthAddress: buyerEthAddress || '',
      buyerStellarAddress: buyerStellarAddress || '',
      srcChainId: srcChainId?.toString() || '',
      dstChainId: dstChainId?.toString() || '',
      srcToken: srcToken || '',
      dstToken: dstToken || '',
      srcAmount: srcAmount?.toString() || '',
      dstAmount: dstAmount?.toString() || '',
      slippage: slippage?.toString() || '0.005', // Default 0.5% slippage
      market_price: market_price?.toString() || '3900', // Default market price
      hashedSecret: hashedSecret || '', // Store hashedSecret for resolver
      orderType: 'normal', // Identify this as a normal order
      auctionType: 'single', // Single auction (no segments)
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    console.log('🔐 ========================================');
    console.log('🔐 STORING NORMAL ORDER IN DATABASE');
    console.log('🔐 ========================================');
    console.log('📋 Order ID:', orderId);
    console.log('🔐 Hashed Secret:', hashedSecret);
    console.log('🔐 ========================================');

    // Store in DynamoDB
    const params = {
      TableName: TABLE_NAME,
      Item: item
    };

    await dynamodb.put(params).promise();

    console.log('✅ Normal order created successfully:', orderId);

    // Automatically start single Dutch auction for the new order
    if (global.auctionServer) {
      await global.auctionServer.startSingleAuction(orderId);
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
        auctionType: 'single'
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

// POST /orders/:orderId/segment-secret endpoint - Update specific segment secret for partial fill orders
app.post('/orders/:orderId/segment-secret', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { segmentId, secret, hashedSecret } = req.body;

    // Validate required fields
    if (!segmentId || !secret || !hashedSecret) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: segmentId, secret, and hashedSecret'
      });
    }

    // Validate segmentId
    if (segmentId < 1 || segmentId > 4) {
      return res.status(400).json({
        success: false,
        error: 'segmentId must be between 1 and 4'
      });
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

    // Get existing segment secrets or create new array
    let segmentSecrets = [];
    if (order.segmentSecrets) {
      try {
        segmentSecrets = JSON.parse(order.segmentSecrets);
      } catch (e) {
        console.log('Could not parse existing segmentSecrets, starting fresh');
        segmentSecrets = [];
      }
    }

    // Update or add the specific segment secret
    const existingIndex = segmentSecrets.findIndex(s => s.segmentId === segmentId);
    const segmentSecret = {
      segmentId: segmentId,
      secret: secret,
      hashedSecret: hashedSecret
    };

    if (existingIndex >= 0) {
      // Update existing segment
      segmentSecrets[existingIndex] = segmentSecret;
      console.log(`🔄 Updated existing segment ${segmentId} secret`);
    } else {
      // Add new segment
      segmentSecrets.push(segmentSecret);
      console.log(`➕ Added new segment ${segmentId} secret`);
    }

    // Update the order with the updated segment secrets
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

    console.log(`✅ Updated segment ${segmentId} secret for order ${orderId}`);
    console.log(`🔐 Secret: ${secret.slice(0, 10)}...`);
    console.log(`🔐 Hashed Secret: ${hashedSecret.slice(0, 10)}...`);
    console.log(`📊 Total segment secrets: ${segmentSecrets.length}`);

    res.json({
      success: true,
      message: `Segment ${segmentId} secret updated successfully`,
      data: {
        orderId: orderId,
        segmentId: segmentId,
        secret: secret.slice(0, 10) + '...',
        hashedSecret: hashedSecret.slice(0, 10) + '...',
        totalSegments: segmentSecrets.length
      }
    });

  } catch (error) {
    console.error('❌ Error updating segment secret:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /orders/:orderId/secret endpoint - Update main secret for single fill orders
app.post('/orders/:orderId/secret', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { secret, hashedSecret } = req.body;

    // Validate required fields
    if (!secret || !hashedSecret) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: secret and hashedSecret'
      });
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
    
    // Verify this is a single fill order
    if (order.orderType === 'partialfill') {
        return res.status(400).json({
          success: false,
        error: 'Cannot update main secret for partial fill orders. Use segment-secret endpoint instead.'
      });
    }

    // Update the order with the main secret
    const updateParams = {
      TableName: TABLE_NAME,
      Key: { orderId: orderId },
      UpdateExpression: 'SET #secret = :secret, #hashedSecret = :hashedSecret, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#secret': 'secret',
        '#hashedSecret': 'hashedSecret',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':secret': secret,
        ':hashedSecret': hashedSecret,
        ':updatedAt': new Date().toISOString()
      }
    };

    await dynamodb.update(updateParams).promise();

    console.log(`✅ Updated main secret for order ${orderId}`);
    console.log(`🔐 Secret: ${secret.slice(0, 10)}...`);
    console.log(`🔐 Hashed Secret: ${hashedSecret.slice(0, 10)}...`);

    res.json({
      success: true,
      message: 'Main secret updated successfully',
      data: {
        orderId: orderId,
        secret: secret.slice(0, 10) + '...',
        hashedSecret: hashedSecret.slice(0, 10) + '...'
      }
    });

  } catch (error) {
    console.error('❌ Error updating main secret:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});



// Endpoint to get hashedSecret by order ID
app.post('/get-hashed-secret', async (req, res) => {
  console.log('🔍 ========================================');
  console.log('🔍 GET HASHED SECRET ENDPOINT CALLED');
  console.log('🔍 ========================================');
  
  try {
    const { orderId } = req.body;
    console.log('📋 Order ID:', orderId);
    
    if (!orderId) {
      console.error('❌ Order ID is required');
        return res.status(400).json({
          success: false,
        error: 'Order ID is required' 
      });
    }

    // Query DynamoDB for the order
    const params = {
      TableName: TABLE_NAME,
      Key: {
        orderId: orderId
      }
    };

    console.log('🔍 Querying DynamoDB with params:', JSON.stringify(params, null, 2));
    
    const result = await dynamodb.get(params).promise();
    console.log('📋 DynamoDB result:', JSON.stringify(result, null, 2));
    
    if (!result.Item) {
      console.error('❌ Order not found in database');
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
        });
      }

    const hashedSecret = result.Item.hashedSecret;
    console.log('🔐 HashedSecret from database:', hashedSecret);
    
    if (!hashedSecret) {
      console.error('❌ HashedSecret not found in order data');
      return res.status(404).json({ 
        success: false, 
        error: 'HashedSecret not found in order data' 
      });
    }

    console.log('✅ HashedSecret retrieved successfully');
    console.log('🔐 HashedSecret length:', hashedSecret.length);
    
    res.json({
      success: true,
      hashedSecret: hashedSecret,
      orderId: orderId
    });

  } catch (error) {
    console.error('❌ Error fetching hashedSecret:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
    global.auctionServer = new DutchAuctionServer();
    
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

// POST /resolver/progress endpoint - Update resolver progress for an order
app.post('/resolver/progress', async (req, res) => {
  try {
    const { orderId, step, details, segmentId } = req.body;

    // Validate required fields
    if (!orderId || !step) {
        return res.status(400).json({
          success: false,
        error: 'Missing required fields: orderId and step'
      });
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
    
    // Update order with resolver progress
    const updateParams = {
      TableName: TABLE_NAME,
      Key: { orderId: orderId },
      UpdateExpression: 'SET #resolverProgress = :resolverProgress, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#resolverProgress': 'resolverProgress',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':resolverProgress': JSON.stringify({
          step: step,
          details: details || {},
          timestamp: new Date().toISOString(),
          segmentId: segmentId
        }),
        ':updatedAt': new Date().toISOString()
      }
    };

    await dynamodb.update(updateParams).promise();

    console.log(`✅ Resolver progress updated for order ${orderId}: ${step}`);
    if (segmentId) {
      console.log(`📊 Segment ${segmentId} progress: ${step}`);
    }

    // Emit WebSocket event for this specific order
    if (global.auctionServer) {
      const eventData = {
        type: 'resolver_progress',
        orderId: orderId,
        step: step,
        details: details || {},
        segmentId: segmentId,
        timestamp: new Date().toISOString()
      };
      
      global.auctionServer.broadcastToAll(eventData);
      console.log(`📡 Emitted resolver_progress event for order ${orderId}`);
    }

    res.json({
      success: true,
      message: 'Resolver progress updated successfully',
      data: {
        orderId: orderId,
        step: step,
        segmentId: segmentId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error updating resolver progress:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /resolver/escrow-created endpoint - Notify escrow creation
app.post('/resolver/escrow-created', async (req, res) => {
  try {
    const { orderId, escrowType, escrowAddress, transactionHash, segmentId } = req.body;

    // Validate required fields
    if (!orderId || !escrowType || !escrowAddress) {
        return res.status(400).json({
          success: false,
        error: 'Missing required fields: orderId, escrowType, and escrowAddress'
      });
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
    
    // Update order with escrow information
    const escrowKey = segmentId ? `${escrowType}_escrow_segment_${segmentId}` : `${escrowType}_escrow`;
    const updateParams = {
      TableName: TABLE_NAME,
      Key: { orderId: orderId },
      UpdateExpression: `SET #${escrowKey} = :escrowData, #updatedAt = :updatedAt`,
      ExpressionAttributeNames: {
        [`#${escrowKey}`]: escrowKey,
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        [`:escrowData`]: JSON.stringify({
          address: escrowAddress,
          transactionHash: transactionHash,
          timestamp: new Date().toISOString(),
          segmentId: segmentId
        }),
        ':updatedAt': new Date().toISOString()
      }
    };

    await dynamodb.update(updateParams).promise();

    console.log(`✅ ${escrowType} escrow created for order ${orderId}: ${escrowAddress}`);
      if (segmentId) {
      console.log(`📊 Segment ${segmentId} ${escrowType} escrow: ${escrowAddress}`);
    }

    // Emit WebSocket event for this specific order
    if (global.auctionServer) {
      const eventData = {
        type: `${escrowType}_escrow_created`,
        orderId: orderId,
        escrowAddress: escrowAddress,
        transactionHash: transactionHash,
        segmentId: segmentId,
        timestamp: new Date().toISOString()
      };
      
      global.auctionServer.broadcastToAll(eventData);
      console.log(`📡 Emitted ${escrowType}_escrow_created event for order ${orderId}`);
    }

    res.json({
      success: true,
      message: `${escrowType} escrow created successfully`,
      data: {
        orderId: orderId,
        escrowType: escrowType,
        escrowAddress: escrowAddress,
        transactionHash: transactionHash,
        segmentId: segmentId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error notifying escrow creation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /resolver/withdrawal-completed endpoint - Notify withdrawal completion
app.post('/resolver/withdrawal-completed', async (req, res) => {
  try {
    const { orderId, withdrawalType, transactionHash, segmentId } = req.body;

    // Validate required fields
    if (!orderId || !withdrawalType || !transactionHash) {
        return res.status(400).json({
          success: false,
        error: 'Missing required fields: orderId, withdrawalType, and transactionHash'
      });
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
    
    // Update order with withdrawal information
    const withdrawalKey = segmentId ? `${withdrawalType}_withdrawal_segment_${segmentId}` : `${withdrawalType}_withdrawal`;
    const updateParams = {
      TableName: TABLE_NAME,
      Key: { orderId: orderId },
      UpdateExpression: `SET #${withdrawalKey} = :withdrawalData, #updatedAt = :updatedAt`,
      ExpressionAttributeNames: {
        [`#${withdrawalKey}`]: withdrawalKey,
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        [`:withdrawalData`]: JSON.stringify({
          transactionHash: transactionHash,
          timestamp: new Date().toISOString(),
          segmentId: segmentId
        }),
        ':updatedAt': new Date().toISOString()
      }
    };

    await dynamodb.update(updateParams).promise();

    console.log(`✅ ${withdrawalType} withdrawal completed for order ${orderId}: ${transactionHash}`);
    if (segmentId) {
      console.log(`📊 Segment ${segmentId} ${withdrawalType} withdrawal: ${transactionHash}`);
    }

    // Emit WebSocket event for this specific order
    if (global.auctionServer) {
      const eventData = {
        type: `${withdrawalType}_withdrawal_completed`,
        orderId: orderId,
        transactionHash: transactionHash,
        segmentId: segmentId,
        timestamp: new Date().toISOString()
      };
      
      global.auctionServer.broadcastToAll(eventData);
      console.log(`📡 Emitted ${withdrawalType}_withdrawal_completed event for order ${orderId}`);
    }

    res.json({
      success: true,
      message: `${withdrawalType} withdrawal completed successfully`,
      data: {
        orderId: orderId,
        withdrawalType: withdrawalType,
        transactionHash: transactionHash,
        segmentId: segmentId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error notifying withdrawal completion:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
        });
      }
});

// POST /resolver/order-completed endpoint - Notify order completion
app.post('/resolver/order-completed', async (req, res) => {
  try {
    const { orderId, segmentId } = req.body;

    // Validate required fields
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: orderId'
      });
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
    
    // Update order status
    const updateParams = {
      TableName: TABLE_NAME,
      Key: { orderId: orderId },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':status': segmentId ? 'segment_completed' : 'completed',
        ':updatedAt': new Date().toISOString()
      }
    };

    await dynamodb.update(updateParams).promise();

    console.log(`✅ Order ${orderId} ${segmentId ? `segment ${segmentId}` : ''} completed`);
    if (segmentId) {
      console.log(`📊 Segment ${segmentId} completed for order ${orderId}`);
    }

    // Emit WebSocket event for this specific order
    if (global.auctionServer) {
      const eventData = {
        type: segmentId ? 'segment_completed' : 'order_completed',
        orderId: orderId,
        segmentId: segmentId,
        timestamp: new Date().toISOString()
      };
      
      global.auctionServer.broadcastToAll(eventData);
      console.log(`📡 Emitted ${segmentId ? 'segment_completed' : 'order_completed'} event for order ${orderId}`);
    }

    res.json({
      success: true,
      message: segmentId ? `Segment ${segmentId} completed successfully` : 'Order completed successfully',
      data: {
        orderId: orderId,
        segmentId: segmentId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error notifying order completion:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}); 

// POST /resolver/request-secret endpoint - Request secret from buyer with verification
app.post('/resolver/request-secret', async (req, res) => {
  try {
    const { orderId, segmentId, sourceEscrowAddress, destinationEscrowAddress, sourceChain, destinationChain } = req.body;

    // Validate required fields
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: orderId'
      });
    }

    // Validate escrow addresses (required for verification)
    if (!sourceEscrowAddress || !destinationEscrowAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required escrow addresses: sourceEscrowAddress and destinationEscrowAddress'
      });
    }

    // Validate chain information (required for verification)
    if (!sourceChain || !destinationChain) {
      return res.status(400).json({
        success: false,
        error: 'Missing required chain information: sourceChain and destinationChain'
      });
    }

    console.log(`🔍 Starting verification process for order: ${orderId}`);
    console.log(`🔗 Source escrow address: ${sourceEscrowAddress} (${sourceChain})`);
    console.log(`🔗 Destination escrow address: ${destinationEscrowAddress} (${destinationChain})`);
    if (segmentId) {
      console.log(`📊 Segment ID: ${segmentId}`);
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
    console.log(`📊 Order Type: ${order.orderType}`);
    console.log(`📊 Order Status: ${order.status}`);

    // Validate segmentId for partial fill orders
    if (order.orderType === 'partialfill') {
      if (!segmentId) {
        return res.status(400).json({
          success: false,
          error: 'segmentId is required for partial fill orders'
        });
      }

      if (segmentId < 1 || segmentId > 4) {
        return res.status(400).json({
          success: false,
          error: 'segmentId must be between 1 and 4'
        });
      }
    }

    // Import required modules for verification
    const axios = require('axios');
    const { ethers } = require('ethers');

    // Configuration
    const ALCHEMY_URL = "https://eth-sepolia.g.alchemy.com/v2/NMsHzNgJ7XUYtzNyFpEJ8yT4muQ_lkRF";
    const stellarTestnetHorizon = 'https://horizon-testnet.stellar.org';
    
    // Use escrow addresses passed by the resolver (not from database or hardcoded)
    console.log(`🔗 Using resolver-provided escrow addresses:`);
    console.log(`  Source: ${sourceEscrowAddress}`);
    console.log(`  Destination: ${destinationEscrowAddress}`);

    let ethResult = false;
    let xlmResult = false;

    // === ETHEREUM VERIFICATION ===
    console.log(`\n🔗 Checking ${sourceChain} escrow transactions...`);
    try {
      const targetAmount = parseFloat(order.srcAmount) || 0.001;
      
      console.log(`📊 Using source escrow address: ${sourceEscrowAddress.toLowerCase()}`);
      console.log(`📊 Looking for transactions to: ${sourceEscrowAddress.toLowerCase()}`);
      console.log(`📊 Target amount: ${targetAmount} ETH`);
      
      // Only check Ethereum if source chain is Ethereum
      if (sourceChain === 'Sepolia Testnet') {
      const response = await axios.post(ALCHEMY_URL, {
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getAssetTransfers",
        params: [{
          fromBlock: "0x0",
          toBlock: "latest",
            toAddress: sourceEscrowAddress.toLowerCase(),
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
        console.log(`📊 Total Internal Transactions to Source Escrow: ${transfers.length}`);

      // Log first few transactions for debugging
      if (transfers.length > 0) {
        console.log(`📊 Sample transactions:`);
        transfers.slice(0, 3).forEach((tx, i) => {
          console.log(`  ${i + 1}. From: ${tx.from}, To: ${tx.to}, Value: ${tx.value}, Hash: ${tx.hash}`);
        });
      }

        // Check for transactions with sufficient amount
      const matched = transfers.filter(tx => {
        const value = parseFloat(tx.value || 0);
          const matches = value >= targetAmount;
        if (matches) {
            console.log(`  Found matching transaction: ${tx.hash} with value ${value} ETH`);
        }
        return matches;
      });

      if (matched.length > 0) {
          console.log(`✅ ${sourceChain} Escrow verified! ${matched.length} transaction(s) with sufficient amount (≥${targetAmount} ETH)`);
        matched.forEach((tx, i) => {
            console.log(`  ${i + 1}. Hash: ${tx.hash}, Value: ${tx.value} ETH`);
        });
        ethResult = true;
      } else {
          console.log(`❌ No matching ${sourceChain} escrow transactions found with sufficient amount (≥${targetAmount} ETH)`);
        }
      } else {
        console.log(`⏭️ Skipping ${sourceChain} verification (not Ethereum)`);
      }
    } catch (error) {
      console.error("❌ Error checking Ethereum escrow transactions:", error.response?.data || error.message);
      if (error.response?.data) {
        console.error("❌ Full error response:", JSON.stringify(error.response.data, null, 2));
      }
      
      // Try alternative approach for Alchemy API errors
      if (error.response?.data?.error?.code === 1002 || error.message.includes('Internal server error')) {
        console.log(`🔄 Trying alternative approach due to Alchemy API error...`);
        try {
          const altResponse = await axios.post(ALCHEMY_URL, {
            jsonrpc: "2.0",
            id: 1,
            method: "alchemy_getAssetTransfers",
            params: [{
              fromBlock: "0x0",
              toBlock: "latest",
              toAddress: sourceEscrowAddress.toLowerCase(),
              category: ["internal"],
              withMetadata: false,
              excludeZeroValue: false,
              maxCount: "0x64"
            }]
          });
          
          if (altResponse.data.error) {
            console.error(`❌ Alternative approach also failed:`, altResponse.data.error);
          } else {
            const altTransfers = altResponse.data.result.transfers;
            console.log(`📊 Alternative approach found ${altTransfers.length} transactions`);
            
            const targetAmount = parseFloat(order.srcAmount) || 0.001;
            const altMatched = altTransfers.filter(tx => {
              const value = parseFloat(tx.value || 0);
              return value >= targetAmount;
            });
            
            if (altMatched.length > 0) {
              console.log(`✅ ETH Escrow verified via alternative approach!`);
              ethResult = true;
            }
          }
        } catch (altError) {
          console.error("❌ Alternative approach also failed:", altError.message);
        }
      }
    }

    // === STELLAR VERIFICATION ===
    console.log(`\n⭐ Checking ${destinationChain} escrow transactions...`);
    try {
      // Only check Stellar if destination chain is Stellar
      if (destinationChain === 'Stellar Testnet') {
      // Test connection first
      const horizonResponse = await fetch(stellarTestnetHorizon);
      if (!horizonResponse.ok) {
        console.log('❌ Cannot connect to Stellar Horizon');
        xlmResult = false;
      } else {
        console.log('✅ Connected to Stellar Horizon');

          // Check if destination escrow address exists
          const accountResponse = await fetch(`${stellarTestnetHorizon}/accounts/${destinationEscrowAddress}`);
        if (!accountResponse.ok) {
            console.log(`❌ Stellar escrow address ${destinationEscrowAddress} not found`);
          xlmResult = false;
        } else {
            console.log(`✅ Stellar escrow address ${destinationEscrowAddress} exists`);

            // Get recent transactions for the escrow
            const txResponse = await fetch(`${stellarTestnetHorizon}/accounts/${destinationEscrowAddress}/transactions?order=desc&limit=10`);
          if (txResponse.ok) {
            const txData = await txResponse.json();
            const transactions = txData._embedded ? txData._embedded.records : [];
              console.log(`📊 Found ${transactions.length} recent Stellar escrow transactions`);

              // Check each transaction for recent activity
            for (let i = 0; i < transactions.length; i++) {
              const tx = transactions[i];
              
                // Check if transaction is within 10 minutes (more lenient for escrow creation)
              const currentTime = new Date();
              const txTime = new Date(tx.created_at);
              const timeDiffMs = currentTime.getTime() - txTime.getTime();
              const timeDiffMinutes = timeDiffMs / (1000 * 60);
              
              console.log(`  Checking transaction ${i + 1}: ${tx.hash} (${timeDiffMinutes.toFixed(2)} minutes ago)`);
              
                if (timeDiffMinutes <= 10) {
                  // Check effects for account_credited (escrow funded)
                const effectsResponse = await fetch(`${stellarTestnetHorizon}/transactions/${tx.hash}/effects`);
                if (effectsResponse.ok) {
                  const effectsData = await effectsResponse.json();
                  const effects = effectsData._embedded ? effectsData._embedded.records : [];
                  
                    if (effects.length > 0 && effects[0].type === 'account_credited') {
                      console.log(`✅ ${destinationChain} Escrow verified! Transaction ${tx.hash} has Effect 1 = "account_credited" and is within 10 minutes`);
                    xlmResult = true;
                    break;
                  }
                }
              } else {
                  console.log(`  Transaction is older than 10 minutes, skipping...`);
              }
            }
            
            if (!xlmResult) {
                console.log(`❌ No matching ${destinationChain} escrow transactions found with Effect 1 = "account_credited" within 10 minutes`);
            }
          } else {
              console.log(`❌ Error fetching Stellar escrow transactions`);
          }
        }
        }
      } else {
        console.log(`⏭️ Skipping ${destinationChain} verification (not Stellar)`);
      }
    } catch (error) {
      console.error("❌ Error checking Stellar escrow transactions:", error.message);
    }

    // === VERIFICATION RESULT ===
    console.log(`\n📋 ESCROW VERIFICATION RESULTS:`);
    console.log(`🔗 ${sourceChain} Source Escrow: ${ethResult ? '✅ VERIFIED' : '❌ NOT VERIFIED'}`);
    console.log(`⭐ ${destinationChain} Destination Escrow: ${xlmResult ? '✅ VERIFIED' : '❌ NOT VERIFIED'}`);

    // Determine which verifications are required based on chain types
    const requiresEthereumVerification = sourceChain === 'Sepolia Testnet';
    const requiresStellarVerification = destinationChain === 'Stellar Testnet';
    
    let overallResult = true;
    if (requiresEthereumVerification && !ethResult) {
      overallResult = false;
    }
    if (requiresStellarVerification && !xlmResult) {
      overallResult = false;
    }
    
    console.log(`🎯 Overall Result: ${overallResult ? '✅ ALL REQUIRED ESCROWS VERIFIED' : '❌ ESCROWS NOT VERIFIED'}`);
    console.log(`📊 Verification Requirements:`);
    console.log(`   ${sourceChain} verification required: ${requiresEthereumVerification} (${ethResult ? 'PASSED' : 'FAILED'})`);
    console.log(`   ${destinationChain} verification required: ${requiresStellarVerification} (${xlmResult ? 'PASSED' : 'FAILED'})`);

    if (!overallResult) {
      return res.status(400).json({
        success: false,
        error: 'Escrow verification failed - All required escrows must be verified before requesting secret',
        data: {
          orderId: orderId,
          segmentId: segmentId || null,
          orderType: order.orderType,
          sourceChain: sourceChain,
          destinationChain: destinationChain,
          ethResult: ethResult,
          xlmResult: xlmResult,
          overallResult: false,
          verificationRequirements: {
            sourceChainRequired: requiresEthereumVerification,
            destinationChainRequired: requiresStellarVerification
          },
          details: {
            source: {
              chain: sourceChain,
              checked: requiresEthereumVerification,
              passed: ethResult,
              escrowAddress: sourceEscrowAddress,
              targetAmount: parseFloat(order.srcAmount) || 0.001
            },
            destination: {
              chain: destinationChain,
              checked: requiresStellarVerification,
              passed: xlmResult,
              escrowAddress: destinationEscrowAddress,
              timeFilter: '10 minutes',
              effectFilter: 'account_credited'
            }
          }
        }
      });
    }

    // If verification passes, proceed with secret request
    console.log(`🔑 Both escrows verified! Proceeding with secret request...`);

    // Update order status to indicate secret is requested
    const updateParams = {
      TableName: TABLE_NAME,
      Key: { orderId: orderId },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt'
      },
      ExpressionAttributeValues: {
        ':status': segmentId ? 'segment_secret_requested' : 'secret_requested',
        ':updatedAt': new Date().toISOString()
      }
    };

    await dynamodb.update(updateParams).promise();

    console.log(`🔑 Secret requested for order ${orderId}${segmentId ? ` segment ${segmentId}` : ''}`);
    if (segmentId) {
      console.log(`📊 Segment ${segmentId} secret requested`);
    }

    // Emit WebSocket event for this specific order
    if (global.auctionServer) {
      const eventData = {
        type: segmentId ? 'segment_secret_requested' : 'secret_requested',
        orderId: orderId,
        segmentId: segmentId,
        timestamp: new Date().toISOString()
      };
      
      global.auctionServer.broadcastToAll(eventData);
      console.log(`📡 Emitted ${segmentId ? 'segment_secret_requested' : 'secret_requested'} event for order ${orderId}`);
    }

    res.json({
      success: true,
      message: segmentId ? `Secret requested for segment ${segmentId}` : 'Secret requested successfully',
        data: {
          orderId: orderId,
        segmentId: segmentId,
        verification: {
          ethResult: ethResult,
          xlmResult: xlmResult,
          overallResult: true
        },
        timestamp: new Date().toISOString()
        }
      });

  } catch (error) {
    console.error('❌ Error in secret request verification process:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// PATCH /orders/:orderId endpoint - Update order data
app.patch('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const updateData = req.body;

    // Validate required fields
    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: orderId'
      });
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
    
    // Build update expression dynamically based on provided data
    const updateExpression = []
    const expressionAttributeNames = {}
    const expressionAttributeValues = {}

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && updateData[key] !== null) {
        updateExpression.push(`#${key} = :${key}`)
        expressionAttributeNames[`#${key}`] = key
        expressionAttributeValues[`:${key}`] = updateData[key]
      }
    })

    if (updateExpression.length === 0) {
      return res.status(400).json({
      success: false, 
        error: 'No valid fields to update'
      })
    }

    // Add updatedAt timestamp
    updateExpression.push('#updatedAt = :updatedAt')
    expressionAttributeNames['#updatedAt'] = 'updatedAt'
    expressionAttributeValues[':updatedAt'] = new Date().toISOString()

    const updateParams = {
      TableName: TABLE_NAME,
      Key: { orderId: orderId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }

    await dynamodb.update(updateParams).promise()

    console.log(`✅ Order ${orderId} updated successfully`)
    console.log(`📊 Updated fields: ${Object.keys(updateData).join(', ')}`)

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: {
        orderId: orderId,
        updatedFields: Object.keys(updateData),
        timestamp: new Date().toISOString()
      }
    })
    
  } catch (error) {
    console.error('❌ Error updating order:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
})