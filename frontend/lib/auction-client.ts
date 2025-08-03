export interface AuctionSegment {
  id: number
  amount: number
  startPrice: number
  endPrice: number
  currentPrice: number
  winner: string | null
  status: 'active' | 'completed' | 'expired'
  endTime: number | null
}

export interface SingleAuction {
  orderId: string
  orderType: 'normal'
  auctionType: 'single'
  // Database fields (now included in all auction objects)
  hashedSecret: string
  buyerAddress: string
  buyerEthAddress?: string
  buyerStellarAddress?: string
  srcChainId: string
  dstChainId: string
  srcToken: string
  dstToken: string
  srcAmount: string
  dstAmount: string
  status: string
  createdAt: string
  market_price: string
  slippage: string
  // Auction-specific calculated fields
  currentPrice: number
  startPrice: number
  endPrice: number
  minimumPrice: number
  sourceAmount: number
  marketPrice: number
  winner: string | null
  endTime: number | null
}

export interface SegmentedAuction {
  orderId: string
  orderType: 'partialfill'
  auctionType: 'segmented'
  // Database fields (now included in all auction objects)
  hashedSecret: string
  buyerAddress: string
  buyerEthAddress?: string
  buyerStellarAddress?: string
  srcChainId: string
  dstChainId: string
  srcToken: string
  dstToken: string
  srcAmount: string
  dstAmount: string
  status: string
  createdAt: string
  market_price: string
  slippage: string
  // Auction-specific calculated fields
  segments: AuctionSegment[]
  totalWinners: any[]
  marketPrice: number
  sourceAmount: number
  minimumPrice: number
  intervals: any[]
}

export type Auction = SingleAuction | SegmentedAuction

export interface AuctionClient {
  connect(): void
  disconnect(): void
  joinAuction(orderId: string): void
  confirmAuction(orderId: string, segmentId?: number, userAddress?: string): void
  requestActiveAuctions(): void
  onAuctionUpdate(callback: (auction: Auction) => void): void
  onNewAuction(callback: (auction: Auction) => void): void
  onAuctionEnd(callback: (orderId: string, status: string) => void): void
  onSegmentUpdate(callback: (orderId: string, segmentId: number, segment: AuctionSegment) => void): void
  onSegmentEnd(callback: (orderId: string, segmentId: number, status: string, winner?: string) => void): void
  onActiveAuctionsReceived(callback: (auctions: any[]) => void): void
  // New resolver progress event handlers
  onResolverProgress(callback: (orderId: string, step: string, details: any, segmentId?: number) => void): void
  onEscrowCreated(callback: (orderId: string, escrowType: string, escrowAddress: string, transactionHash: string, segmentId?: number) => void): void
  onWithdrawalCompleted(callback: (orderId: string, withdrawalType: string, transactionHash: string, segmentId?: number) => void): void
  onOrderCompleted(callback: (orderId: string, segmentId?: number) => void): void
  onCompletionStep(callback: (orderId: string, details: any) => void): void
}

class DutchAuctionClient implements AuctionClient {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private clientName: string
  private auctionUpdateCallbacks: ((auction: Auction) => void)[] = []
  private newAuctionCallbacks: ((auction: Auction) => void)[] = []
  private auctionEndCallbacks: ((orderId: string, status: string) => void)[] = []
  private segmentUpdateCallbacks: ((orderId: string, segmentId: number, segment: AuctionSegment) => void)[] = []
  private segmentEndCallbacks: ((orderId: string, segmentId: number, status: string, winner?: string) => void)[] = []
  private activeAuctionsCallbacks: ((auctions: any[]) => void)[] = []
  // New resolver progress event callbacks
  private resolverProgressCallbacks: ((orderId: string, step: string, details: any, segmentId?: number) => void)[] = []
  private escrowCreatedCallbacks: ((orderId: string, escrowType: string, escrowAddress: string, transactionHash: string, segmentId?: number) => void)[] = []
  private withdrawalCompletedCallbacks: ((orderId: string, withdrawalType: string, transactionHash: string, segmentId?: number) => void)[] = []
  private orderCompletedCallbacks: ((orderId: string, segmentId?: number) => void)[] = []
  private completionStepCallbacks: ((orderId: string, details: any) => void)[] = []

  constructor(clientName: string = 'frontend-client') {
    this.clientName = clientName
  }

  connect(): void {
    try {
      console.log('🔗 Attempting to connect to WebSocket server at wss://7c0c84d53b51.ngrok-free.app')
      this.ws = new WebSocket('wss://7c0c84d53b51.ngrok-free.app')
      
      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.warn('⚠️ WebSocket connection timeout')
          this.ws.close()
        }
      }, 5000)
      
              this.ws.onopen = () => {
          console.log('✅ WebSocket connection established successfully')
          this.reconnectAttempts = 0
          clearTimeout(connectionTimeout)
          
          // Register this client
          console.log('📝 Registering client with name:', this.clientName)
          this.send({
            type: 'register',
            name: this.clientName
          })

          // Request active auctions on connection
          this.requestActiveAuctions()
        }

      this.ws.onmessage = (event) => {
        try {
          console.log('📨 Raw WebSocket message received:', event.data)
          const data = JSON.parse(event.data)
          console.log('📨 Parsed WebSocket message:', data)
          this.handleMessage(data)
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error)
        }
      }

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket connection closed:', event.code, event.reason)
        this.attemptReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
        // Don't throw error, just log it
      }
    } catch (error) {
      console.error('❌ Failed to connect to WebSocket server:', error)
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
      
      setTimeout(() => {
        this.connect()
      }, this.reconnectDelay * this.reconnectAttempts)
    } else {
      console.error('❌ Max reconnection attempts reached')
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  joinAuction(orderId: string): void {
    this.send({
      type: 'join_auction',
      orderId: orderId
    })
  }

  confirmAuction(orderId: string, segmentId?: number, userAddress?: string): void {
    if (segmentId) {
      this.send({
        type: 'confirm_segment',
        orderId: orderId,
        segmentId: segmentId,
        name: userAddress || this.clientName // Use userAddress if provided, otherwise clientName
      })
    } else {
      this.send({
        type: 'confirm_single',
        orderId: orderId,
        name: userAddress || this.clientName // Use userAddress if provided, otherwise clientName
      })
    }
  }

  requestActiveAuctions(): void {
    this.send({
      type: 'request_active_auctions'
    })
  }

  private send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    } else {
      console.warn('⚠️ WebSocket not connected, cannot send message')
    }
  }

  private handleMessage(data: any): void {
    console.log('🔍 Processing WebSocket message type:', data.type)

    switch (data.type) {
      case 'welcome':
        console.log('👋 Welcome message received')
        if (data.activeAuctions) {
          console.log('📋 Active auctions from welcome message:', data.activeAuctions)
          this.activeAuctionsCallbacks.forEach(callback => {
            callback(data.activeAuctions)
          })
        }
        break

      case 'new_single_auction':
        console.log('🚀 New single auction started:', data.orderId)
        console.log('📊 Single auction data:', data)
        this.newAuctionCallbacks.forEach(callback => {
          const auction: SingleAuction = {
            orderId: data.orderId,
            orderType: 'normal',
            auctionType: 'single',
            // Database fields (now included in all auction objects)
            hashedSecret: data.hashedSecret || '',
            buyerAddress: data.buyerAddress || '',
            buyerEthAddress: data.buyerEthAddress || '',
            buyerStellarAddress: data.buyerStellarAddress || '',
            srcChainId: data.srcChainId || '',
            dstChainId: data.dstChainId || '',
            srcToken: data.srcToken || '',
            dstToken: data.dstToken || '',
            srcAmount: data.srcAmount || '',
            dstAmount: data.dstAmount || '',
            status: data.status || 'active',
            createdAt: data.createdAt || '',
            market_price: data.market_price || '',
            slippage: data.slippage || '',
            // Auction-specific calculated fields
            currentPrice: data.currentPrice,
            startPrice: data.startPrice,
            endPrice: data.endPrice,
            minimumPrice: data.endPrice, // endPrice is the minimum price
            sourceAmount: data.sourceAmount,
            marketPrice: data.marketPrice,
            winner: null,
            endTime: null
          }
          console.log('📤 Calling newAuction callback with:', auction)
          callback(auction)
        })
        break

             case 'new_segmented_auction':
         console.log('🚀 New segmented auction started:', data.orderId)
         console.log('📊 Segmented auction data:', data)
         this.newAuctionCallbacks.forEach(callback => {
           const auction: SegmentedAuction = {
             orderId: data.orderId,
             orderType: 'partialfill',
             auctionType: 'segmented',
             // Database fields (now included in all auction objects)
             hashedSecret: data.hashedSecret || '',
             buyerAddress: data.buyerAddress || '',
             buyerEthAddress: data.buyerEthAddress || '',
             buyerStellarAddress: data.buyerStellarAddress || '',
             srcChainId: data.srcChainId || '',
             dstChainId: data.dstChainId || '',
             srcToken: data.srcToken || '',
             dstToken: data.dstToken || '',
             srcAmount: data.srcAmount || '',
             dstAmount: data.dstAmount || '',
             status: data.status || 'active',
             createdAt: data.createdAt || '',
             market_price: data.market_price || '',
             slippage: data.slippage || '',
             // Auction-specific calculated fields
             segments: data.segments || [],
             totalWinners: [],
             marketPrice: data.marketPrice,
             sourceAmount: data.sourceAmount,
             minimumPrice: data.minimumPrice,
             intervals: []
           }
           console.log('📤 Calling newAuction callback with:', auction)
           callback(auction)
         })
         break

      case 'single_auction_update':
        console.log('📊 Single auction update:', data.orderId, 'Price:', data.currentPrice)
        this.auctionUpdateCallbacks.forEach(callback => {
          const auction: SingleAuction = {
            orderId: data.orderId,
            orderType: 'normal',
            auctionType: 'single',
            // Database fields (now included in all auction objects)
            hashedSecret: data.hashedSecret || '',
            buyerAddress: data.buyerAddress || '',
            buyerEthAddress: data.buyerEthAddress || '',
            buyerStellarAddress: data.buyerStellarAddress || '',
            srcChainId: data.srcChainId || '',
            dstChainId: data.dstChainId || '',
            srcToken: data.srcToken || '',
            dstToken: data.dstToken || '',
            srcAmount: data.srcAmount || '',
            dstAmount: data.dstAmount || '',
            status: data.status || 'active',
            createdAt: data.createdAt || '',
            market_price: data.market_price || '',
            slippage: data.slippage || '',
            // Auction-specific calculated fields
            currentPrice: data.currentPrice,
            startPrice: data.startPrice,
            endPrice: data.endPrice,
            minimumPrice: data.endPrice,
            sourceAmount: data.sourceAmount || 0,
            marketPrice: data.marketPrice,
            winner: null,
            endTime: null
          }
          console.log('📤 Calling auctionUpdate callback with:', auction)
          callback(auction)
        })
        break

      case 'segment_update':
        console.log('📊 Segment update:', data.orderId, 'Segment:', data.segmentId, 'Price:', data.currentPrice)
        this.segmentUpdateCallbacks.forEach(callback => {
          const segment: AuctionSegment = {
            id: data.segmentId,
            amount: 0, // Will be filled from segments array
            startPrice: data.startPrice,
            endPrice: data.endPrice,
            currentPrice: data.currentPrice,
            winner: null,
            status: 'active',
            endTime: null
          }
          console.log('📤 Calling segmentUpdate callback with:', data.orderId, data.segmentId, segment)
          callback(data.orderId, data.segmentId, segment)
        })
        break

      case 'single_auction_completed':
        console.log('🏁 Single auction completed:', data.orderId, 'Winner:', data.winner)
        this.auctionEndCallbacks.forEach(callback => {
          callback(data.orderId, data.status)
        })
        break

      case 'segment_ended':
        console.log('🏁 Segment ended:', data.orderId, 'Segment:', data.segmentId, 'Winner:', data.winner)
        this.segmentEndCallbacks.forEach(callback => {
          callback(data.orderId, data.segmentId, data.status, data.winner)
        })
        break

      case 'segmented_auction_completed':
        console.log('🏁 Segmented auction completed:', data.orderId)
        this.auctionEndCallbacks.forEach(callback => {
          callback(data.orderId, 'completed')
        })
        break

      case 'active_auctions_received':
        console.log('📋 Active auctions received:', data.auctions)
        this.activeAuctionsCallbacks.forEach(callback => {
          callback(data.auctions)
        })
        break

      // New resolver progress events
      case 'resolver_progress':
        console.log('🔧 Resolver progress:', data.orderId, 'Step:', data.step, 'Segment:', data.segmentId)
        this.resolverProgressCallbacks.forEach(callback => {
          callback(data.orderId, data.step, data.details, data.segmentId)
        })
        break

      case 'source_escrow_created':
      case 'destination_escrow_created':
        console.log('🏗️ Escrow created:', data.orderId, 'Type:', data.type.replace('_escrow_created', ''), 'Address:', data.escrowAddress)
        this.escrowCreatedCallbacks.forEach(callback => {
          const escrowType = data.type.replace('_escrow_created', '')
          callback(data.orderId, escrowType, data.escrowAddress, data.transactionHash, data.segmentId)
        })
        break

      case 'source_withdrawal_completed':
      case 'destination_withdrawal_completed':
        console.log('💰 Withdrawal completed:', data.orderId, 'Type:', data.type.replace('_withdrawal_completed', ''), 'Hash:', data.transactionHash)
        this.withdrawalCompletedCallbacks.forEach(callback => {
          const withdrawalType = data.type.replace('_withdrawal_completed', '')
          callback(data.orderId, withdrawalType, data.transactionHash, data.segmentId)
        })
        break

      case 'order_completed':
      case 'segment_completed':
        console.log('✅ Order/Segment completed:', data.orderId, 'Segment:', data.segmentId)
        this.orderCompletedCallbacks.forEach(callback => {
          callback(data.orderId, data.segmentId)
        })
        break

      case 'secret_requested':
      case 'segment_secret_requested':
        console.log('🔑 Secret requested:', data.orderId, 'Segment:', data.segmentId)
        this.resolverProgressCallbacks.forEach(callback => {
          const step = data.type === 'segment_secret_requested' ? 'segment_secret_requested' : 'secret_requested'
          callback(data.orderId, step, {}, data.segmentId)
        })
        break

      case 'segment_secret_received':
        console.log('✅ Segment secret received:', data.orderId, 'Segment:', data.segmentId)
        this.resolverProgressCallbacks.forEach(callback => {
          callback(data.orderId, 'segment_secret_received', {}, data.segmentId)
        })
        break

      case 'completion_step':
        console.log('🎉 Completion step:', data.orderId, 'Details:', data.details)
        this.completionStepCallbacks.forEach(callback => {
          callback(data.orderId, data.details)
        })
        break

      case 'error':
        console.error('❌ Auction server error:', data.message)
        break

      default:
        console.log('📨 Unknown message type:', data.type, 'Data:', data)
    }
  }

  onAuctionUpdate(callback: (auction: Auction) => void): void {
    this.auctionUpdateCallbacks.push(callback)
  }

  onNewAuction(callback: (auction: Auction) => void): void {
    this.newAuctionCallbacks.push(callback)
  }

  onAuctionEnd(callback: (orderId: string, status: string) => void): void {
    this.auctionEndCallbacks.push(callback)
  }

  onSegmentUpdate(callback: (orderId: string, segmentId: number, segment: AuctionSegment) => void): void {
    this.segmentUpdateCallbacks.push(callback)
  }

  onSegmentEnd(callback: (orderId: string, segmentId: number, status: string, winner?: string) => void): void {
    this.segmentEndCallbacks.push(callback)
  }

  onActiveAuctionsReceived(callback: (auctions: any[]) => void): void {
    this.activeAuctionsCallbacks.push(callback)
  }

  // New resolver progress event handlers
  onResolverProgress(callback: (orderId: string, step: string, details: any, segmentId?: number) => void): void {
    this.resolverProgressCallbacks.push(callback)
  }

  onEscrowCreated(callback: (orderId: string, escrowType: string, escrowAddress: string, transactionHash: string, segmentId?: number) => void): void {
    this.escrowCreatedCallbacks.push(callback)
  }

  onWithdrawalCompleted(callback: (orderId: string, withdrawalType: string, transactionHash: string, segmentId?: number) => void): void {
    this.withdrawalCompletedCallbacks.push(callback)
  }

  onOrderCompleted(callback: (orderId: string, segmentId?: number) => void): void {
    this.orderCompletedCallbacks.push(callback)
  }

  onCompletionStep(callback: (orderId: string, details: any) => void): void {
    this.completionStepCallbacks.push(callback)
  }
}

export function createAuctionClient(clientName?: string): AuctionClient {
  return new DutchAuctionClient(clientName)
} 