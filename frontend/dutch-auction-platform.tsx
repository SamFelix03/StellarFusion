"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  TrendingDown,
  Clock,
  Zap,
  DollarSign,
  Wallet,
  FuelIcon as Gas,
  CheckCircle,
  ArrowRight,
  Activity,
  ArrowLeftRight,
  Network,
  Layers,
  Sparkles,
  X,
  ArrowLeft,
  RefreshCw,
} from "lucide-react"
import { createAuctionClient, Auction, SingleAuction, SegmentedAuction, AuctionSegment } from "@/lib/auction-client"
import { useWallet } from "./components/WalletProvider"
import ResolverExecutionModal from "./components/ResolverExecutionModal"
import { toast } from "@/hooks/use-toast"
import { chainsConfig } from "@/constants/chains"
import Aurora from "./components/Aurora"

interface OrderData {
  orderId: string
  srcChainId: string
  dstChainId: string
  srcToken: string
  dstToken: string
  srcAmount: string
  dstAmount: string
  status: string
  createdAt: string
}

interface AuctionDetails {
  // Core auction identification
  orderId: string
  orderType: 'normal' | 'partialfill'
  auctionType: 'single' | 'segmented'
  hashedSecret: string
  buyerAddress: string // Now provided by relayer from the start
  
  // Auction participants
  winner?: string | null
  status?: 'active' | 'completed' | 'expired'
  
  // Chain and token info (derived from orderId patterns)
  fromChain?: string
  toChain?: string
  tokenName?: string
  tokenSymbol?: string
  
  // Single auction properties
  currentPrice?: number
  startPrice?: number
  endPrice?: number
  minimumPrice?: number
  sourceAmount?: number
  marketPrice?: number
  slippage?: number
  
  // Segmented auction properties
  segments?: AuctionSegment[]
}

export default function Component({ onBackToHome }: { onBackToHome?: () => void }) {
  const { address, stellarWallet, isConnected: walletConnected } = useWallet()
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [orderDataMap, setOrderDataMap] = useState<Map<string, OrderData>>(new Map())
  const [selectedAuction, setSelectedAuction] = useState<AuctionDetails | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<AuctionDetails | Auction | null>(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState(false)
  const [executingAuction, setExecutingAuction] = useState<AuctionDetails | null>(null)
  const auctionClientRef = useRef<ReturnType<typeof createAuctionClient> | null>(null)

  // Get the current user's address for winner identification
  const getCurrentUserAddress = () => {
    if (address) return address
    if (stellarWallet?.publicKey) return stellarWallet.publicKey
    return null
  }

  // Fetch order data from relayer
  const fetchOrderData = async (orderId: string): Promise<OrderData | null> => {
    try {
      const response = await fetch(`http://localhost:8000/orders/${orderId}`)
      if (!response.ok) {
        console.warn(`⚠️ Failed to fetch order data for ${orderId}:`, response.status)
        return null
      }
      const result = await response.json()
      return result.data
    } catch (error) {
      console.error(`❌ Error fetching order data for ${orderId}:`, error)
      return null
    }
  }

  // Fetch order data for all auctions
  const fetchAllOrderData = async (auctionList: Auction[]) => {
    const newOrderDataMap = new Map<string, OrderData>()
    
    for (const auction of auctionList) {
      const orderData = await fetchOrderData(auction.orderId)
      if (orderData) {
        newOrderDataMap.set(auction.orderId, orderData)
      }
    }
    
    setOrderDataMap(newOrderDataMap)
  }


  // Initialize auction client only when component mounts
  useEffect(() => {
    const client = createAuctionClient(getCurrentUserAddress() || 'anonymous')
    auctionClientRef.current = client

    // Set up event handlers
    client.onNewAuction((auction) => {
      console.log('🚀 New auction received in resolver:', auction)
      setAuctions(prev => {
        console.log('📊 Previous auctions state:', prev)
        // Check if auction already exists
        const exists = prev.find(a => a.orderId === auction.orderId)
        if (exists) {
          console.log('🔄 Updating existing auction:', auction.orderId)
          return prev.map(a => a.orderId === auction.orderId ? auction : a)
        } else {
          console.log('➕ Adding new auction:', auction.orderId)
          return [...prev, auction]
        }
      })
      
      // Fetch order data for the new auction
      fetchOrderData(auction.orderId).then(orderData => {
        if (orderData) {
          setOrderDataMap(prev => new Map(prev).set(auction.orderId, orderData))
        }
      })
    })

    client.onAuctionUpdate((auction) => {
      console.log('📊 Auction update received in resolver:', auction)
      setAuctions(prev => prev.map(a => a.orderId === auction.orderId ? auction : a))
    })

    client.onAuctionEnd((orderId, status) => {
      console.log('🏁 Auction ended in resolver:', orderId, status)
      setAuctions(prev => prev.filter(a => a.orderId !== orderId))
    })

    client.onSegmentUpdate((orderId, segmentId, segment) => {
      console.log('📊 Segment update received in resolver:', orderId, segmentId, segment)
      setAuctions(prev => prev.map(a => {
        if (a.orderId === orderId && a.auctionType === 'segmented') {
          const segAuction = a as SegmentedAuction
          return {
            ...segAuction,
            segments: segAuction.segments.map(s => s.id === segmentId ? segment : s)
          }
        }
        return a
      }))
    })

    client.onSegmentEnd((orderId, segmentId, status, winner) => {
      console.log('🏁 Segment ended in resolver:', orderId, segmentId, status, winner)
    })

    client.onActiveAuctionsReceived((auctions) => {
      console.log('📋 Active auctions received in resolver:', auctions)
      setAuctions(auctions)
      
      // Fetch order data for all received auctions
      fetchAllOrderData(auctions)
    })

    // Connect to WebSocket server
    client.connect()
    setIsConnected(true)
    setConnectionStatus('connecting')

    // Cleanup on unmount
    return () => {
      client.disconnect()
      setIsConnected(false)
      setConnectionStatus('disconnected')
    }
  }, [])

  // Monitor connection status
  useEffect(() => {
    if (auctionClientRef.current) {
      // Simulate connection status check
      const interval = setInterval(() => {
        // You could add a ping mechanism here
        setConnectionStatus(isConnected ? 'connected' : 'disconnected')
      }, 5000)

      return () => clearInterval(interval)
    }
  }, [isConnected])

  // Debug: Log auction state changes
  useEffect(() => {
    console.log('🔍 Auction state updated:', {
      totalAuctions: auctions.length,
      activeAuctions: auctions.filter(a => getAuctionStatus(a) === 'active').length,
      connectionStatus,
      isConnected
    })
  }, [auctions, connectionStatus, isConnected])

  // Load existing auctions from WebSocket server
  const loadExistingAuctions = async () => {
    if (!auctionClientRef.current) return
    
    try {
      console.log('🔄 Requesting active auctions from server...')
      auctionClientRef.current.requestActiveAuctions()
      
      // Fetch order data for existing auctions after a short delay
      setTimeout(() => {
        fetchAllOrderData(auctions)
      }, 1000)
    } catch (error) {
      console.error('❌ Error loading existing auctions:', error)
    }
  }

  // Load existing auctions when WebSocket connects
  useEffect(() => {
    if (isConnected && auctionClientRef.current) {
      loadExistingAuctions()
    }
  }, [isConnected])

  const handleAuctionClick = (auction: Auction) => {
    console.log('🔍 Auction clicked:', auction.orderId, 'Type:', auction.auctionType)
    
    // Determine token info based on order data
    const tokenInfo = getTokenInfo(auction)
    
    const details: AuctionDetails = {
      ...auction,
      tokenName: tokenInfo.tokenName,
      tokenSymbol: tokenInfo.tokenSymbol,
      fromChain: tokenInfo.fromChain,
      toChain: tokenInfo.toChain
      // buyerAddress comes from the relayer auction data
    }
    
    console.log('📊 Auction details:', details)
    if (details.auctionType === 'segmented') {
      console.log('📊 Segments in details:', (details as SegmentedAuction).segments)
    }
    
    setSelectedAuction(details)
    setSelectedSegmentId(null) // Reset segment selection
    setIsModalOpen(true)
  }

  const getTokenInfo = (auction: Auction) => {
    // Get order data from our map
    const orderData = orderDataMap.get(auction.orderId)
    
    if (orderData) {
      // Use real order data
      const srcChain = chainsConfig[orderData.srcChainId as keyof typeof chainsConfig]
      const dstChain = chainsConfig[orderData.dstChainId as keyof typeof chainsConfig]
      
      if (srcChain && dstChain) {
        const srcToken = srcChain.tokens[orderData.srcToken as keyof typeof srcChain.tokens]
        const dstToken = dstChain.tokens[orderData.dstToken as keyof typeof dstChain.tokens]
        
        return {
          tokenName: dstToken?.name || orderData.dstToken,
          tokenSymbol: dstToken?.symbol || orderData.dstToken,
          fromChain: srcChain.name,
          toChain: dstChain.name,
          srcAmount: orderData.srcAmount,
          dstAmount: orderData.dstAmount
        }
      }
    }
    
    // Fallback to defaults if order data not available
    const isPartialFill = auction.auctionType === 'segmented'
    return {
      tokenName: isPartialFill ? "Stellar Lumens" : "Ethereum",
      tokenSymbol: isPartialFill ? "XLM" : "ETH",
      fromChain: isPartialFill ? "Ethereum" : "Stellar",
      toChain: isPartialFill ? "Stellar" : "Ethereum",
      srcAmount: "0",
      dstAmount: "0"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
      case "ending":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30"
      case "completed":
        return "bg-gray-500/20 text-gray-300 border-gray-500/30"
      case "expired":
        return "bg-red-500/20 text-red-300 border-red-500/30"
      default:
        return "bg-blue-500/20 text-blue-300 border-blue-500/30"
    }
  }

  const formatPrice = (price: number | undefined | null) => {
    if (price === undefined || price === null || isNaN(price)) {
      return '0.00000'
    }
    return `${price.toFixed(5)}`
  }

  const getAuctionProgress = (auction: Auction) => {
    try {
      if (auction.auctionType === 'single') {
        const singleAuction = auction as SingleAuction
        if (!singleAuction.startPrice || !singleAuction.currentPrice || !singleAuction.minimumPrice) {
          return 0
        }
        const progress = ((singleAuction.startPrice - singleAuction.currentPrice) / (singleAuction.startPrice - singleAuction.minimumPrice)) * 100
        return Math.min(100, Math.max(0, progress))
      } else {
        const segAuction = auction as SegmentedAuction
        if (!segAuction.segments || segAuction.segments.length === 0) {
          return 0
        }
        const totalSegments = segAuction.segments.length
        const completedSegments = segAuction.segments.filter(s => s.status === 'completed' || s.status === 'expired').length
        return (completedSegments / totalSegments) * 100
      }
    } catch (error) {
      console.warn('⚠️ Error calculating auction progress:', error)
      return 0
    }
  }

  const getAuctionStatus = (auction: Auction | AuctionDetails) => {
    try {
      if (auction.auctionType === 'single') {
        const singleAuction = auction as SingleAuction
        if (singleAuction.winner) return 'completed'
        if (singleAuction.currentPrice && singleAuction.minimumPrice && singleAuction.currentPrice <= singleAuction.minimumPrice) return 'expired'
        return 'active'
      } else {
        const segAuction = auction as SegmentedAuction
        if (!segAuction.segments || segAuction.segments.length === 0) return 'active'
        const allCompleted = segAuction.segments.every(s => s.status === 'completed' || s.status === 'expired')
        if (allCompleted) return 'completed'
        const anyActive = segAuction.segments.some(s => s.status === 'active')
        return anyActive ? 'active' : 'expired'
      }
    } catch (error) {
      console.warn('⚠️ Error getting auction status:', error)
      return 'active'
    }
  }

  const handleResolveAuction = (auction: Auction | AuctionDetails) => {
    // For segmented auctions, require segment selection
    if (auction.auctionType === 'segmented') {
      if (!selectedSegmentId) {
        alert('Please select a segment first')
        return
      }
    }
    
    // Set pending confirmation and open confirm modal
    setPendingConfirmation(auction)
    setIsConfirmModalOpen(true)
  }

  const handleConfirmResolution = () => {
    if (!pendingConfirmation || !auctionClientRef.current) return

    const userAddress = getCurrentUserAddress()
    if (!userAddress) {
      alert('Please connect your wallet first to resolve auctions')
      return
    }

    try {
      if (pendingConfirmation.auctionType === 'single') {
        auctionClientRef.current.confirmAuction(pendingConfirmation.orderId, undefined, userAddress)
        console.log(`🏆 Confirming auction ${pendingConfirmation.orderId} as winner: ${userAddress}`)
        
        // Open resolver execution modal for normal orders
        setExecutingAuction(pendingConfirmation as AuctionDetails)
        setIsExecutionModalOpen(true)
      } else if (pendingConfirmation.auctionType === 'segmented') {
        if (!selectedSegmentId) {
          alert('Please select a segment first')
          return
        }
        auctionClientRef.current.confirmAuction(pendingConfirmation.orderId, selectedSegmentId, userAddress)
        console.log(`🏆 Confirming segment ${selectedSegmentId} of auction ${pendingConfirmation.orderId} as winner: ${userAddress}`)
        
        // Open resolver execution modal for partial fill orders
        setExecutingAuction(pendingConfirmation as AuctionDetails)
        setIsExecutionModalOpen(true)
      }

      // Close confirmation modal
      setIsConfirmModalOpen(false)
      setPendingConfirmation(null)
      setSelectedSegmentId(null) // Reset segment selection
    } catch (error) {
      console.error('❌ Error confirming auction:', error)
      alert('Failed to confirm auction. Please try again.')
    }
  }

  const handleExecutionComplete = () => {
    setIsExecutionModalOpen(false)
    setIsModalOpen(false)
    setExecutingAuction(null)
    setSelectedAuction(null)
    
    toast({
      title: "Execution Complete!",
      description: "The resolver workflow has been completed successfully.",
    })
  }


  const handleRefreshConnection = () => {
    if (auctionClientRef.current) {
      auctionClientRef.current.disconnect()
      setTimeout(() => {
        auctionClientRef.current?.connect()
        setIsConnected(true)
        setConnectionStatus('connecting')
      }, 1000)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Aurora Background with White Colors */}
      <div className="fixed inset-0 z-0">
        <Aurora 
          colorStops={["#FFFFFF", "#F8F9FA", "#E9ECEF", "#FFFFFF"]}
          amplitude={1.2}
          blend={0.6}
          speed={0.3}
        />
      </div>

      {/* Back to Home Button */}
      {onBackToHome && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="fixed top-8 left-8 z-50"
        >
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 text-white hover:bg-white/10 backdrop-blur-sm bg-transparent"
            onClick={onBackToHome}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </motion.div>
      )}

      {/* Content Overlay */}
      <div className="relative z-10 max-w-7xl mx-auto p-8 pt-24">
        {/* Connection Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' : 
                connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
              } animate-pulse`} />
              <span className="text-sm text-white/80">
                Auction Server: {connectionStatus === 'connected' ? 'Connected' : 
                               connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </span>
              <span className="text-xs text-white/60">
                ({auctions.length} auctions loaded)
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadExistingAuctions}
                className="border-white/20 text-white hover:bg-white/10 backdrop-blur-sm bg-transparent"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Load Auctions
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshConnection}
                disabled={connectionStatus === 'connecting'}
                className="border-white/20 text-white hover:bg-white/10 backdrop-blur-sm bg-transparent"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${connectionStatus === 'connecting' ? 'animate-spin' : ''}`} />
                Refresh WS
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10"
        >
          {[
            {
              label: "Active Auctions",
              value: auctions.filter((a) => getAuctionStatus(a) === "active").length,
              icon: Activity,
              iconColor: "text-emerald-600",
            },
            {
              label: "Total Volume",
              value: (() => {
                const totalAmount = auctions.reduce((sum, a) => {
                  const tokenInfo = getTokenInfo(a)
                  const amount = a.auctionType === 'single' 
                    ? (a as SingleAuction).sourceAmount 
                    : (a as SegmentedAuction).sourceAmount
                  return sum + (amount || 0)
                }, 0)
                const firstAuction = auctions[0]
                const tokenSymbol = firstAuction ? getTokenInfo(firstAuction).tokenSymbol : 'TOKENS'
                return `${totalAmount.toFixed(4)} ${tokenSymbol}`
              })(),
              icon: DollarSign,
              iconColor: "text-blue-600",
            },
            {
              label: "Normal Auctions",
              value: auctions.filter((a) => a.auctionType === 'single').length,
              icon: Zap,
              iconColor: "text-amber-600",
            },
            {
              label: "Partial Fill",
              value: auctions.filter((a) => a.auctionType === 'segmented').length,
              icon: CheckCircle,
              iconColor: "text-purple-600",
            },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              whileHover={{ y: -4 }}
              className="group"
            >
              <div className="relative overflow-hidden rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 p-6 shadow-lg hover:shadow-xl transition-all duration-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/60 mb-2">{stat.label}</p>
                    <motion.p
                      className="text-2xl font-bold text-white"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 + index * 0.1, duration: 0.8 }}
                    >
                      {stat.value}
                    </motion.p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
                    <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
                  </div>
                </div>
                <motion.div
                  className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-transparent via-black/20 to-transparent"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ delay: 0.5 + index * 0.1, duration: 1 }}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Auctions Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative"
        >
          <div className="rounded-3xl bg-black/40 backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="bg-black/30 backdrop-blur-sm border-b border-white/10 p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
                    <Network className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Live Dutch Auctions</h2>
                    <p className="text-white/60">Cross-chain swap opportunities</p>
                  </div>
                </div>
                <motion.div
                  animate={{ opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                >
                  <Badge className="bg-emerald-50/80 text-emerald-700 border-emerald-200/50 px-4 py-2 text-sm font-medium backdrop-blur-sm">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse" />
                    LIVE
                  </Badge>
                </motion.div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="font-semibold text-white/80 border-white/10 py-4">Order Details</TableHead>
                    <TableHead className="font-semibold text-white/80 border-white/10">Auction Type</TableHead>
                    <TableHead className="font-semibold text-white/80 border-white/10">Current Price</TableHead>
                    <TableHead className="font-semibold text-white/80 border-white/10">Min Price</TableHead>
                    <TableHead className="font-semibold text-white/80 border-white/10">Progress</TableHead>
                    <TableHead className="font-semibold text-white/80 border-white/10">Status</TableHead>
                    <TableHead className="font-semibold text-white/80 border-white/10">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {auctions.length === 0 ? (
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-white/20"
                      >
                        <TableCell colSpan={7} className="text-center py-8 text-white/60">
                          {connectionStatus === 'connected' ? 'No active auctions' : 'Connecting to auction server...'}
                        </TableCell>
                      </motion.tr>
                    ) : (
                      auctions.map((auction, index) => {
                        const tokenInfo = getTokenInfo(auction)
                        const status = getAuctionStatus(auction)
                        const progress = getAuctionProgress(auction)
                                                 const currentPrice = auction.auctionType === 'single' 
                           ? (auction as SingleAuction).currentPrice || 0
                           : (auction as SegmentedAuction).segments?.[0]?.currentPrice || 0
                         const minPrice = auction.auctionType === 'single'
                           ? (auction as SingleAuction).minimumPrice || 0
                           : (auction as SegmentedAuction).minimumPrice || 0

                        return (
                          <motion.tr
                            key={auction.orderId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ delay: index * 0.05, duration: 0.4 }}
                        className="cursor-pointer border-white/20 hover:bg-black/5 transition-all duration-300 group"
                            onMouseEnter={() => setHoveredRow(auction.orderId)}
                        onMouseLeave={() => setHoveredRow(null)}
                        onClick={() => handleAuctionClick(auction)}
                      >
                        <TableCell className="border-white/10 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center text-white font-bold border border-white/10">
                                  {tokenInfo.tokenSymbol.charAt(0)}
                            </div>
                            <div>
                                  <p className="font-semibold text-white text-lg">{tokenInfo.tokenName}</p>
                              <div className="flex items-center gap-2 text-sm text-white/70">
                                    <span className="font-medium">{tokenInfo.fromChain}</span>
                                <ArrowRight className="w-3 h-3" />
                                    <span className="font-medium">{tokenInfo.toChain}</span>
                                  </div>
                                  <div className="text-xs text-white/60 font-mono mt-1">
                                    <span className="font-medium">Amount: {tokenInfo.srcAmount} {tokenInfo.tokenSymbol}</span>
                                  </div>
                                  <p className="text-xs text-white/40 font-mono">{auction.orderId.slice(0, 8)}...{auction.orderId.slice(-8)}</p>
                                </div>
                          </div>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <Badge className={`${
                                auction.auctionType === 'single' 
                              ? "bg-blue-500/20 text-blue-300 border-blue-500/30" 
                              : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                          } border font-medium backdrop-blur-sm`}>
                                {auction.auctionType === 'single' ? "NORMAL" : "PARTIAL FILL"}
                          </Badge>
                        </TableCell>
                        <TableCell className="border-white/10">
                          <motion.div
                            className="flex items-center gap-2"
                                animate={{ scale: hoveredRow === auction.orderId ? 1.03 : 1 }}
                            transition={{ duration: 0.2 }}
                          >
                                <span className="font-bold text-lg text-white">{formatPrice(currentPrice)} {tokenInfo.tokenSymbol}</span>
                          </motion.div>
                        </TableCell>
                        <TableCell className="border-white/10">
                              <span className="text-white/70 font-medium text-sm">{formatPrice(minPrice)} {tokenInfo.tokenSymbol}</span>
                        </TableCell>
                        <TableCell className="border-white/10">
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-3 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
                              <motion.div
                                className="h-full bg-gradient-to-r from-white/60 to-white/80 rounded-full"
                                initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                transition={{ duration: 1, delay: index * 0.1 }}
                              />
                            </div>
                            <span className="text-sm text-white/70 font-medium">
                                  {progress.toFixed(0)}%
                            </span>
                          </div>
                          <div className="text-xs text-white/60 mt-1">
                            {auction.auctionType === 'segmented' ? 'Segments' : 'Price Drop'}
                          </div>
                        </TableCell>
                        <TableCell className="border-white/10">
                          <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                                <Badge className={`${getStatusColor(status)} border font-medium backdrop-blur-sm px-3 py-1`}>
                                  {status.toUpperCase()}
                            </Badge>
                          </motion.div>
                        </TableCell>
                        <TableCell className="border-white/10">
                          <motion.div whileHover={{ x: 3 }} transition={{ duration: 0.2 }}>
                                                         <Button
                               size="sm"
                               className="bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/10 shadow-lg font-medium"
                               onClick={(e) => {
                                 e.stopPropagation()
                                 handleAuctionClick(auction)
                               }}
                               disabled={status !== 'active'}
                             >
                               View Details
                               <ArrowRight className="w-4 h-4 ml-2" />
                             </Button>
                          </motion.div>
                        </TableCell>
                      </motion.tr>
                        )
                      })
                    )}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Compact Modal */}
      <AnimatePresence>
        {isModalOpen && selectedAuction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              {/* Close Button */}
                             <button
                 onClick={() => {
                   setIsModalOpen(false)
                   setSelectedSegmentId(null) // Reset segment selection
                 }}
                 className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
               >
                <X className="w-4 h-4 text-white" />
              </button>

              {/* Header */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center text-white font-bold border border-white/10">
                    {selectedAuction.tokenSymbol?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{selectedAuction.tokenName}</h2>
                      <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 backdrop-blur-sm text-xs">
                        FUSION SWAP
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/70 mt-1">
                      <span>{selectedAuction.fromChain}</span>
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>{selectedAuction.toChain}</span>
                    </div>
                    <p className="text-xs text-white/40 font-mono mt-1">{selectedAuction.orderId}</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                {/* Price Cards */}
                <div className="grid grid-cols-2 gap-2">
                                     <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-lg p-2">
                     <div className="flex items-center gap-1 mb-1">
                       <TrendingDown className="w-3 h-3 text-emerald-400" />
                       <span className="font-medium text-emerald-300 text-xs">Current</span>
                       <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse ml-1" />
                     </div>
                                         <motion.p
                       key={`price-${selectedAuction.orderId}-${Date.now()}`}
                       className="text-base font-bold text-white"
                       animate={{ opacity: [0.9, 1, 0.9] }}
                       transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                     >
                       {selectedAuction.auctionType === 'single' 
                         ? formatPrice((selectedAuction as SingleAuction).currentPrice)
                         : formatPrice((selectedAuction as SegmentedAuction).segments?.[0]?.currentPrice)
                       } {selectedAuction.tokenSymbol}
                     </motion.p>
                  </div>

                  <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-lg p-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Layers className="w-3 h-3 text-blue-400" />
                      <span className="font-medium text-blue-300 text-xs">Min</span>
                    </div>
                    <p className="text-base font-bold text-white">
                      {selectedAuction.auctionType === 'single'
                        ? formatPrice((selectedAuction as SingleAuction).minimumPrice)
                        : formatPrice((selectedAuction as SegmentedAuction).minimumPrice)
                      } {selectedAuction.tokenSymbol}
                    </p>
                  </div>
                </div>

                {/* Auction Details */}
                <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-4 h-4 text-white/70" />
                    <h3 className="font-semibold text-white text-sm">Auction Details</h3>
                  </div>

                                       <div className="space-y-2 text-xs">
                       <div className="flex justify-between">
                         <span className="text-white/60">Source Amount:</span>
                         <span className="font-semibold text-white">
                           {selectedAuction.auctionType === 'single'
                             ? `${(selectedAuction as SingleAuction).sourceAmount || 0} ${selectedAuction.tokenSymbol || ''}`
                             : `${(selectedAuction as SegmentedAuction).sourceAmount || 0} ${selectedAuction.tokenSymbol || ''}`
                           }
                         </span>
                       </div>
                       <div className="flex justify-between">
                         <span className="text-white/60">Market Price:</span>
                         <span className="font-semibold text-white">
                           {selectedAuction.auctionType === 'single'
                             ? formatPrice((selectedAuction as SingleAuction).marketPrice)
                             : formatPrice((selectedAuction as SegmentedAuction).marketPrice)
                           } {selectedAuction.tokenSymbol}
                         </span>
                       </div>
                       <div className="flex justify-between">
                         <span className="text-white/60">Slippage:</span>
                         <span className="font-semibold text-white">
                           {selectedAuction.auctionType === 'single'
                             ? `${(((selectedAuction as SingleAuction).slippage || 0.02) * 100).toFixed(2)}%`
                             : `${(((selectedAuction as SegmentedAuction).slippage || 0.02) * 100).toFixed(2)}%`
                           }
                         </span>
                       </div>
                     </div>
                </div>

                                 {/* Segments for Partial Fill Auctions */}
                 {selectedAuction.auctionType === 'segmented' && (
                   <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-lg p-3">
                     <h4 className="font-semibold text-white text-sm mb-2 flex items-center gap-2">
                       <Layers className="w-4 h-4 text-purple-400" />
                       Select a Segment to Resolve
                     </h4>
                     <div className="grid grid-cols-2 gap-2">
                       {(selectedAuction as SegmentedAuction).segments.map((segment, index) => (
                         <motion.div 
                           key={segment.id} 
                           className={`backdrop-blur-sm rounded-lg p-2 border cursor-pointer transition-all duration-200 ${
                             selectedSegmentId === segment.id 
                               ? 'bg-purple-500/20 border-purple-500/30 shadow-lg' 
                               : segment.status === 'active'
                               ? 'bg-white/10 border-white/10 hover:bg-purple-500/20'
                               : 'bg-white/5 border-white/5 opacity-50 cursor-not-allowed'
                           }`}
                           onClick={() => {
                             if (segment.status === 'active') {
                               setSelectedSegmentId(segment.id)
                             }
                           }}
                           whileHover={segment.status === 'active' ? { scale: 1.02 } : {}}
                           whileTap={segment.status === 'active' ? { scale: 0.98 } : {}}
                         >
                           <div className="flex items-center justify-between mb-1">
                             <span className="text-xs font-medium text-white/70">Segment {segment.id}</span>
                             <div className="flex items-center gap-1">
                               {selectedSegmentId === segment.id && (
                                 <CheckCircle className="w-3 h-3 text-purple-400" />
                               )}
                               <Badge className={`${
                                 segment.status === "active" 
                                   ? "bg-green-500/20 text-green-300 border-green-500/30" 
                                   : segment.status === "completed"
                                   ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                   : "bg-gray-500/20 text-gray-300 border-gray-500/30"
                               } text-xs`}>
                                 {segment.status.toUpperCase()}
                               </Badge>
                             </div>
                           </div>
                           <div className="space-y-1">
                             <div className="flex justify-between text-xs">
                               <span className="text-white/60">Current:</span>
                               <motion.span 
                                 key={`segment-${segment.id}-price-${Date.now()}`}
                                 className="font-semibold text-white"
                                 animate={{ opacity: [0.8, 1, 0.8] }}
                                 transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
                               >
                                 {formatPrice(segment.currentPrice)} {selectedAuction.tokenSymbol}
                               </motion.span>
                             </div>
                             <div className="flex justify-between text-xs">
                               <span className="text-white/60">Min:</span>
                               <span className="font-semibold text-white">{formatPrice(segment.endPrice)} {selectedAuction.tokenSymbol}</span>
                             </div>
                             <div className="flex justify-between text-xs">
                               <span className="text-white/60">Amount:</span>
                               <span className="font-semibold text-white">{(segment.amount || 0).toFixed(4)} {selectedAuction.tokenSymbol}</span>
                             </div>
                             {segment.winner && (
                               <div className="flex justify-between text-xs">
                                 <span className="text-white/60">Winner:</span>
                                 <span className="font-semibold text-green-400">{segment.winner.slice(0, 8)}...</span>
                               </div>
                             )}
                           </div>
                         </motion.div>
                       ))}
                     </div>
                     {selectedSegmentId && (
                       <div className="mt-3 p-2 bg-purple-500/20 rounded-lg border border-purple-500/30">
                         <p className="text-xs text-purple-300 font-medium">
                           ✅ Selected Segment {selectedSegmentId} - Click "Confirm as Winner" to resolve this segment
                         </p>
                       </div>
                     )}
                   </div>
                 )}

                {/* Action Button */}
                <motion.div whileHover={{ y: -2 }} whileTap={{ y: 1 }}>
                                     <Button
                     className="w-full h-10 bg-white/10 hover:bg-white/20 text-white font-bold backdrop-blur-sm border border-white/10 shadow-xl rounded-lg disabled:bg-white/5 disabled:cursor-not-allowed"
                     onClick={() => {
                       handleResolveAuction(selectedAuction)
                     }}
                     disabled={
                       getAuctionStatus(selectedAuction) !== 'active' || 
                       (selectedAuction.auctionType === 'segmented' && !selectedSegmentId)
                     }
                   >
                     <motion.div className="flex items-center gap-2">
                       <CheckCircle className="w-4 h-4" />
                       {selectedAuction.auctionType === 'segmented' 
                         ? `Confirm Segment ${selectedSegmentId}`
                         : 'Confirm as Winner'
                       }
                       <ArrowRight className="w-4 h-4" />
                     </motion.div>
                   </Button>
                </motion.div>
              </div>
            </motion.div>
          </div>
                 )}
       </AnimatePresence>

       {/* Confirmation Modal */}
       <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
         <DialogContent className="max-w-md bg-black/40 backdrop-blur-xl border border-white/10">
           <DialogHeader>
             <DialogTitle className="text-xl font-bold text-white">Confirm Resolution</DialogTitle>
           </DialogHeader>
           <div className="space-y-4">
             <p className="text-white/80">
               {pendingConfirmation?.auctionType === 'segmented' 
                 ? `Are you sure you want to resolve segment ${selectedSegmentId} of auction ${pendingConfirmation?.orderId.slice(0, 8)}...?`
                 : `Are you sure you want to resolve auction ${pendingConfirmation?.orderId.slice(0, 8)}...?`
               }
             </p>
             <p className="text-sm text-white/60">
               {pendingConfirmation?.auctionType === 'segmented'
                 ? `This will declare you as the winner of segment ${selectedSegmentId} and complete that segment.`
                 : `This will declare you as the winner and complete the auction.`
               }
             </p>
             <div className="flex gap-3 pt-4">
               <Button
                 variant="outline"
                 className="flex-1 border-white/20 text-white/80 hover:bg-white/10"
                 onClick={() => setIsConfirmModalOpen(false)}
               >
                 Cancel
               </Button>
               <Button
                 className="flex-1 bg-white/10 hover:bg-white/20 text-white border border-white/10"
                 onClick={handleConfirmResolution}
               >
                 Confirm
               </Button>
             </div>
           </div>
         </DialogContent>
       </Dialog>

       {/* Resolver Execution Modal */}
       <ResolverExecutionModal
         isOpen={isExecutionModalOpen}
         onClose={() => setIsExecutionModalOpen(false)}
         auction={executingAuction}
         onExecutionComplete={handleExecutionComplete}
       />

     </div>
   )
 }

