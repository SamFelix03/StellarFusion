# StellarFusion Relayer System

A complete cross-chain atomic swap system with Dutch auction mechanism for Ethereum and Stellar networks.

## 🚀 Quick Start

### 1. Start the Server
```bash
cd relayer
npm install
node server.js
```

### 2. Run the Maker Script
```bash
node maker.js
```

### 3. Run Test Clients (Optional)
```bash
node auction-client.js
```

### 4. Run Complete Flow Test
```bash
node test-complete-flow.js
```

## 📋 System Components

### 1. **Server (`server.js`)**
- **Port**: 3000 (HTTP), 8080 (WebSocket)
- **Features**:
  - Dutch auction system (single and segmented)
  - Order management with DynamoDB
  - Transaction verification (Ethereum + Stellar)
  - WebSocket real-time updates

### 2. **Maker Script (`maker.js`)**
- **Modes**: Normal (1 secret) or Partial Fill (4 secrets)
- **Features**:
  - Secret generation and management
  - Order creation via API
  - Real-time winner detection
  - Automatic verification and secret delivery

### 3. **Auction Client (`auction-client.js`)**
- **Purpose**: Automated auction participation for testing
- **Features**:
  - Multiple client simulation
  - Automatic bidding
  - Real-time auction monitoring

### 4. **Complete Flow Test (`test-complete-flow.js`)**
- **Purpose**: End-to-end system testing
- **Features**:
  - Automated maker and client coordination
  - Comprehensive result reporting
  - Success rate calculation

## 🔧 API Endpoints

### Order Management
```bash
# Create normal order
POST /create
{
  "orderId": "unique_id",
  "buyerAddress": "0x...",
  "srcChainId": 11155111,
  "dstChainId": "stellar-testnet",
  "srcToken": "0x...",
  "dstToken": "XLM",
  "srcAmount": "1",
  "dstAmount": "3900",
  "slippage": "0.1"
}

# Create partial fill order
POST /partialfill
{
  "orderId": "unique_id",
  "buyerAddress": "0x...",
  "srcChainId": 11155111,
  "dstChainId": "stellar-testnet",
  "srcToken": "0x...",
  "dstToken": "XLM",
  "srcAmount": "1",
  "dstAmount": "3900",
  "slippage": "0.1"
}

# Verify transactions (Normal order)
POST /verify
{
  "orderId": "unique_id"
}

# Verify transactions (Partial fill order)
POST /verify
{
  "orderId": "unique_id",
  "segmentId": 1
}

# Update segment secrets (Partial fill orders only)
POST /orders/:orderId/segment-secrets
{
  "segmentSecrets": [
    {
      "segmentId": 1,
      "secret": "0x...",
      "hashedSecret": "0x..."
    },
    {
      "segmentId": 2,
      "secret": "0x...",
      "hashedSecret": "0x..."
    },
    {
      "segmentId": 3,
      "secret": "0x...",
      "hashedSecret": "0x..."
    },
    {
      "segmentId": 4,
      "secret": "0x...",
      "hashedSecret": "0x..."
    }
  ]
}
```

### Order Queries
```bash
# Get all orders
GET /orders

# Get specific order
GET /orders/:orderId

# Get order segments
GET /orders/:orderId/segments
```

## 🎯 Auction System

### Single Auction (Normal Mode)
- **Duration**: Until market price or winner
- **Price Reduction**: 5% every 10 seconds
- **Secrets**: 1 secret for the winner

### Segmented Auction (Partial Fill Mode)
- **Segments**: 4 segments of equal amount
- **Duration**: 1 minute per segment
- **Price Strategy**:
  - Segment 1: 4200 → 4000 (7.7% → 2.6% above market)
  - Segment 2: 4100 → 3950 (5.1% → 1.3% above market)
  - Segment 3: 4000 → 3900 (2.6% → market price)
  - Segment 4: 3900 (fixed market price)
- **Secrets**: 4 different secrets (1 per segment)

## 🔍 Verification System

### Ethereum Check
- **Method**: Alchemy API
- **Criteria**: Internal transactions to escrow
- **Filter**: From specific address with exact amount (0.001 ETH)

### Stellar Check
- **Method**: Stellar Horizon API
- **Criteria**: Recent transactions (within 5 minutes)
- **Filter**: Effect 1 type = "account_debited"

### Success Criteria
- **Overall**: At least one check passes
- **Result**: Returns `true` if either Ethereum OR Stellar verification succeeds

## 🧪 Testing

### Manual Testing
1. **Start server**: `node server.js`
2. **Start maker**: `node maker.js` (choose mode)
3. **Start clients**: `node auction-client.js`
4. **Monitor results** in maker console

### Automated Testing
```bash
# Run complete flow test
node test-complete-flow.js
```

### Expected Results
- **Ethereum verification**: Should pass (based on existing transactions)
- **Stellar verification**: Should fail (no recent matching transactions)
- **Overall result**: Should pass (Ethereum check succeeds)

## 📊 Monitoring

### Server Commands
```bash
# Show active auctions
auctions

# Show connected clients
clients

# Show pending orders
orders

# Exit server
quit
```

### WebSocket Events
- `new_segmented_auction`: New partial fill auction started
- `new_single_auction`: New normal auction started
- `segment_ended`: Individual segment completed
- `single_auction_completed`: Normal auction completed
- `segmented_auction_completed`: All segments completed

## 🔐 Security Features

### Secret Management
- **Generation**: Cryptographically secure random secrets
- **Hashing**: SHA-256 for commitment scheme
- **Delivery**: Only to verified winners
- **Segmentation**: Separate secrets per segment

### Verification
- **Multi-chain**: Ethereum + Stellar verification
- **Time-based**: Recent transaction filtering
- **Amount-based**: Exact value matching
- **Address-based**: Specific address filtering

## 🛠️ Configuration

### Environment Variables
```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1

# Server Configuration
PORT=3000
WS_PORT=8080

# Database
TABLE_NAME=stellarfusion
```

### Network Configuration
- **Ethereum**: Sepolia testnet
- **Stellar**: Testnet
- **Alchemy**: Sepolia endpoint
- **Horizon**: Testnet endpoint

## 📈 Performance

### Scalability
- **Concurrent Auctions**: Multiple auctions supported
- **WebSocket Connections**: Unlimited client connections
- **Database**: DynamoDB for scalability
- **Verification**: Parallel Ethereum + Stellar checks

### Monitoring
- **Real-time Updates**: WebSocket for instant notifications
- **Detailed Logging**: Comprehensive console output
- **Error Handling**: Graceful error recovery
- **Status Tracking**: Complete auction lifecycle

## 🚨 Troubleshooting

### Common Issues
1. **Alchemy API Error**: Check API key and network connectivity
2. **Stellar Connection**: Verify Horizon endpoint accessibility
3. **WebSocket Issues**: Check port availability and firewall settings
4. **DynamoDB Errors**: Verify AWS credentials and table permissions

### Debug Mode
- Enable detailed logging in server console
- Monitor WebSocket message flow
- Check verification results in maker script
- Review auction state in server commands

## 📝 License

MIT License - See LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## 📞 Support

For issues and questions:
- Check troubleshooting section
- Review server logs
- Test with provided scripts
- Open GitHub issue with details 