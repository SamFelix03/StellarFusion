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
import Dither from "./components/Dither"
import { createAuctionClient, Auction, SingleAuction, SegmentedAuction, AuctionSegment } from "@/lib/auction-client"
import { useWallet } from "./components/WalletProvider"

interface AuctionDetails {
  orderId: string
  orderType: 'normal' | 'partialfill'
  auctionType: 'single' | 'segmented'
  gasEstimate: number
  contractAddress: string
  description: string
  swapFee: number
  tokenName: string
  tokenSymbol: string
  fromChain: string
  toChain: string
  // Single auction properties
  currentPrice?: number
  startPrice?: number
  endPrice?: number
  minimumPrice?: number
  sourceAmount?: number
  marketPrice?: number
  slippage?: number
  winner?: string | null
  status?: 'active' | 'completed' | 'expired'
  endTime?: number | null
  // Segmented auction properties
  segments?: AuctionSegment[]
  totalWinners?: any[]
  intervals?: any[]
}

export default function Component({ onBackToHome }: { onBackToHome?: () => void }) {
  const { address, stellarWallet, isConnected: walletConnected } = useWallet()
  const [auctions, setAuctions] = useState<Auction[]>([])
  const [selectedAuction, setSelectedAuction] = useState<AuctionDetails | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<AuctionDetails | Auction | null>(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const auctionClientRef = useRef<ReturnType<typeof createAuctionClient> | null>(null)

  // Get the current user's address for winner identification
  const getCurrentUserAddress = () => {
    if (address) return address
    if (stellarWallet?.publicKey) return stellarWallet.publicKey
    return null
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
    })

    client.onAuctionUpdate((auction) => {
      console.log('📊 Auction update received in resolver:', auction)
      setAuctions(prev => {
        console.log('📊 Updating auction:', auction.orderId)
        return prev.map(a => a.orderId === auction.orderId ? auction : a)
      })
    })

    client.onAuctionEnd((orderId, status) => {
      console.log('🏁 Auction ended:', orderId, status)
      setAuctions(prev => prev.map(a => 
        a.orderId === orderId 
          ? { ...a, status: status as 'completed' | 'expired' }
          : a
      ))
    })

    client.onSegmentUpdate((orderId, segmentId, segment) => {
      console.log('📊 Segment update received:', orderId, segmentId, segment)
      setAuctions(prev => prev.map(a => {
        if (a.orderId === orderId && a.auctionType === 'segmented') {
          const segAuction = a as SegmentedAuction
          const updatedSegments = segAuction.segments.map(s => 
            s.id === segmentId ? segment : s
          )
          return { ...segAuction, segments: updatedSegments }
        }
        return a
      }))
    })

    client.onSegmentEnd((orderId, segmentId, status, winner) => {
      console.log('🏁 Segment ended:', orderId, segmentId, status, winner)
      setAuctions(prev => prev.map(a => {
        if (a.orderId === orderId && a.auctionType === 'segmented') {
          const segAuction = a as SegmentedAuction
          const updatedSegments = segAuction.segments.map(s => 
            s.id === segmentId 
              ? { ...s, status: status as 'completed' | 'expired', winner: winner || null }
              : s
          )
          return { ...segAuction, segments: updatedSegments }
        }
        return a
      }))
    })

    // Handle active auctions received from server
    client.onActiveAuctionsReceived((activeAuctions) => {
      console.log('📋 Active auctions received from server:', activeAuctions)
      if (activeAuctions && activeAuctions.length > 0) {
        // Convert server auction data to our format
        const convertedAuctions: Auction[] = activeAuctions.map((serverAuction: any) => {
          if (serverAuction.auctionType === 'segmented') {
            return {
              orderId: serverAuction.orderId,
              orderType: 'partialfill',
              auctionType: 'segmented',
              segments: serverAuction.segments || [],
              totalWinners: serverAuction.totalWinners || [],
              marketPrice: serverAuction.marketPrice,
              sourceAmount: serverAuction.sourceAmount,
              slippage: serverAuction.slippage,
              minimumPrice: serverAuction.minimumPrice,
              intervals: serverAuction.intervals || []
            } as SegmentedAuction
          } else {
            return {
              orderId: serverAuction.orderId,
              orderType: 'normal',
              auctionType: 'single',
              currentPrice: serverAuction.currentPrice,
              startPrice: serverAuction.startPrice,
              endPrice: serverAuction.endPrice,
              minimumPrice: serverAuction.minimumPrice,
              sourceAmount: serverAuction.sourceAmount,
              marketPrice: serverAuction.marketPrice,
              slippage: serverAuction.slippage,
              winner: serverAuction.winner,
              status: serverAuction.status || 'active',
              endTime: serverAuction.endTime
            } as SingleAuction
          }
        })
        
        console.log('📊 Setting active auctions:', convertedAuctions)
        setAuctions(convertedAuctions)
      } else {
        console.log('📊 No active auctions found')
        setAuctions([])
      }
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
    try {
      console.log('🔄 Requesting active auctions from WebSocket server...')
      if (auctionClientRef.current) {
        auctionClientRef.current.requestActiveAuctions()
      } else {
        console.log('⚠️ Auction client not available')
      }
    } catch (error) {
      console.error('❌ Failed to load existing auctions:', error)
    }
  }

  // Load existing auctions when WebSocket connects
  useEffect(() => {
    if (isConnected && auctionClientRef.current) {
      loadExistingAuctions()
    }
  }, [isConnected])

  const handleAuctionClick = (auction: Auction) => {
    // Determine token info based on order data
    const tokenInfo = getTokenInfo(auction)
    
    const details: AuctionDetails = {
      ...auction,
      gasEstimate: Math.floor(Math.random() * 50000) + 21000,
      contractAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
      description: `Cross-chain swap from ${tokenInfo.fromChain} to ${tokenInfo.toChain} for ${tokenInfo.tokenName}. Participate as a resolver to facilitate this fusion swap.`,
      swapFee: Math.random() * 0.5 + 0.1,
      tokenName: tokenInfo.tokenName,
      tokenSymbol: tokenInfo.tokenSymbol,
      fromChain: tokenInfo.fromChain,
      toChain: tokenInfo.toChain,
    }
    setSelectedAuction(details)
    setSelectedSegmentId(null) // Reset segment selection
    setIsModalOpen(true)
  }

  const getTokenInfo = (auction: Auction) => {
    // Extract token info from orderId or use defaults
    // In a real implementation, you'd get this from the order data
    const isPartialFill = auction.auctionType === 'segmented'
    
    return {
      tokenName: isPartialFill ? "Stellar Lumens" : "Ethereum",
      tokenSymbol: isPartialFill ? "XLM" : "ETH",
      fromChain: isPartialFill ? "Ethereum" : "Stellar",
      toChain: isPartialFill ? "Stellar" : "Ethereum"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-emerald-50/80 text-emerald-700 border-emerald-200/50"
      case "ending":
        return "bg-amber-50/80 text-amber-700 border-amber-200/50"
      case "completed":
        return "bg-gray-50/80 text-gray-700 border-gray-200/50"
      case "expired":
        return "bg-red-50/80 text-red-700 border-red-200/50"
      default:
        return "bg-blue-50/80 text-blue-700 border-blue-200/50"
    }
  }

  const formatPrice = (price: number | undefined | null) => {
    if (price === undefined || price === null || isNaN(price)) {
      return '$0.00000'
    }
    return `$${price.toFixed(5)}`
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
      } else if (pendingConfirmation.auctionType === 'segmented') {
        if (!selectedSegmentId) {
          alert('Please select a segment first')
          return
        }
        auctionClientRef.current.confirmAuction(pendingConfirmation.orderId, selectedSegmentId, userAddress)
        console.log(`🏆 Confirming segment ${selectedSegmentId} of auction ${pendingConfirmation.orderId} as winner: ${userAddress}`)
      }

      // Close modals
      setIsConfirmModalOpen(false)
      setIsModalOpen(false)
      setPendingConfirmation(null)
      setSelectedAuction(null)
      setSelectedSegmentId(null)

      // Show success message
      alert(`Successfully confirmed as winner!`)
    } catch (error) {
      console.error('❌ Error confirming auction:', error)
      alert('Failed to confirm auction. Please try again.')
    }
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
      {/* Dither Background */}
      <div className="fixed inset-0 z-0">
        <Dither
          waveColor={[0.5, 0.5, 0.5]}
          disableAnimation={false}
          enableMouseInteraction={true}
          mouseRadius={0.3}
          colorNum={4}
          waveAmplitude={0.3}
          waveFrequency={3}
          waveSpeed={0.05}
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
              value: `$${auctions.reduce((sum, a) => sum + (a.auctionType === 'single' ? (a as SingleAuction).sourceAmount : (a as SegmentedAuction).sourceAmount), 0).toFixed(2)}`,
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
              <div className="relative overflow-hidden rounded-2xl bg-white/40 backdrop-blur-xl border border-white/50 p-6 shadow-lg hover:shadow-xl transition-all duration-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 mb-2">{stat.label}</p>
                    <motion.p
                      className="text-3xl font-bold text-black"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 + index * 0.1, duration: 0.8 }}
                    >
                      {stat.value}
                    </motion.p>
                  </div>
                  <div className="p-4 rounded-xl bg-black/5 backdrop-blur-sm border border-black/5">
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
          <div className="rounded-3xl bg-white/40 backdrop-blur-xl border border-white/50 overflow-hidden shadow-2xl">
            <div className="bg-white/30 backdrop-blur-sm border-b border-white/30 p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-black/5 backdrop-blur-sm border border-black/10">
                    <Network className="w-6 h-6 text-black" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-black">Live Dutch Auctions</h2>
                    <p className="text-gray-600">Cross-chain swap opportunities</p>
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
                  <TableRow className="border-white/30 hover:bg-transparent">
                    <TableHead className="font-semibold text-gray-700 border-white/20 py-4">Order ID</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Auction Type</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Current Price</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Min Price</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Progress</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Status</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Action</TableHead>
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
                        <TableCell colSpan={7} className="text-center py-8 text-gray-600">
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
                        <TableCell className="border-white/20 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-black/5 backdrop-blur-sm rounded-xl flex items-center justify-center text-black font-bold border border-black/10">
                                  {tokenInfo.tokenSymbol.charAt(0)}
                            </div>
                            <div>
                                  <p className="font-semibold text-black text-lg">{tokenInfo.tokenName}</p>
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <span>{tokenInfo.fromChain}</span>
                                <ArrowRight className="w-3 h-3" />
                                    <span>{tokenInfo.toChain}</span>
                                  </div>
                                  <p className="text-xs text-gray-500 font-mono">{auction.orderId.slice(0, 8)}...{auction.orderId.slice(-8)}</p>
                                </div>
                          </div>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <Badge className={`${
                                auction.auctionType === 'single' 
                              ? "bg-blue-50/80 text-blue-700 border-blue-200/50" 
                              : "bg-purple-50/80 text-purple-700 border-purple-200/50"
                          } border font-medium backdrop-blur-sm`}>
                                {auction.auctionType === 'single' ? "NORMAL" : "PARTIAL FILL"}
                          </Badge>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <motion.div
                            className="flex items-center gap-2"
                                animate={{ scale: hoveredRow === auction.orderId ? 1.03 : 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            <TrendingDown className="w-4 h-4 text-red-500" />
                                <span className="font-bold text-xl text-black">{formatPrice(currentPrice)}</span>
                          </motion.div>
                        </TableCell>
                        <TableCell className="border-white/20">
                              <span className="text-gray-600 font-medium">{formatPrice(minPrice)}</span>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-3 bg-black/10 rounded-full overflow-hidden backdrop-blur-sm">
                              <motion.div
                                className="h-full bg-gradient-to-r from-black/60 to-black/80 rounded-full"
                                initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                transition={{ duration: 1, delay: index * 0.1 }}
                              />
                            </div>
                            <span className="text-sm text-gray-600 font-medium">
                                  {progress.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                                <Badge className={`${getStatusColor(status)} border font-medium backdrop-blur-sm`}>
                                  {status.toUpperCase()}
                            </Badge>
                          </motion.div>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <motion.div whileHover={{ x: 3 }} transition={{ duration: 0.2 }}>
                                                         <Button
                               size="sm"
                               className="bg-black hover:bg-black/80 text-white backdrop-blur-sm border border-black/10 shadow-lg font-medium"
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
              className="relative w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/50 overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              {/* Close Button */}
                             <button
                 onClick={() => {
                   setIsModalOpen(false)
                   setSelectedSegmentId(null) // Reset segment selection
                 }}
                 className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/5 hover:bg-black/10 transition-colors"
               >
                <X className="w-4 h-4 text-gray-600" />
              </button>

              {/* Header */}
              <div className="p-4 border-b border-white/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-black/5 backdrop-blur-sm rounded-xl flex items-center justify-center text-black font-bold border border-black/10">
                    {selectedAuction.tokenSymbol.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-black">{selectedAuction.tokenName}</h2>
                      <Badge className="bg-blue-50/80 text-blue-700 border-blue-200/50 backdrop-blur-sm text-xs">
                        FUSION SWAP
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                      <span>{selectedAuction.fromChain}</span>
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>{selectedAuction.toChain}</span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-1">{selectedAuction.orderId}</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                {/* Price Cards */}
                <div className="grid grid-cols-2 gap-2">
                                     <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-lg p-2">
                     <div className="flex items-center gap-1 mb-1">
                       <TrendingDown className="w-3 h-3 text-emerald-600" />
                       <span className="font-medium text-emerald-800 text-xs">Current</span>
                       <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse ml-1" />
                     </div>
                                         <motion.p
                       key={`price-${selectedAuction.orderId}-${Date.now()}`}
                       className="text-base font-bold text-black"
                       animate={{ opacity: [0.9, 1, 0.9] }}
                       transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                     >
                       {selectedAuction.auctionType === 'single' 
                         ? formatPrice((selectedAuction as SingleAuction).currentPrice)
                         : formatPrice((selectedAuction as SegmentedAuction).segments?.[0]?.currentPrice)
                       }
                     </motion.p>
                  </div>

                  <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-lg p-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Layers className="w-3 h-3 text-blue-600" />
                      <span className="font-medium text-blue-800 text-xs">Min</span>
                    </div>
                    <p className="text-base font-bold text-black">
                      {selectedAuction.auctionType === 'single'
                        ? formatPrice((selectedAuction as SingleAuction).minimumPrice)
                        : formatPrice((selectedAuction as SegmentedAuction).minimumPrice)
                      }
                    </p>
                  </div>
                </div>

                {/* Auction Details */}
                <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-4 h-4 text-gray-700" />
                    <h3 className="font-semibold text-black text-sm">Auction Details</h3>
                  </div>

                                       <div className="space-y-2 text-xs">
                       <div className="flex justify-between">
                         <span className="text-gray-600">Source Amount:</span>
                         <span className="font-semibold text-black">
                           {selectedAuction.auctionType === 'single'
                             ? `${(selectedAuction as SingleAuction).sourceAmount || 0} ${selectedAuction.tokenSymbol}`
                             : `${(selectedAuction as SegmentedAuction).sourceAmount || 0} ${selectedAuction.tokenSymbol}`
                           }
                         </span>
                       </div>
                       <div className="flex justify-between">
                         <span className="text-gray-600">Market Price:</span>
                         <span className="font-semibold text-black">
                           {selectedAuction.auctionType === 'single'
                             ? formatPrice((selectedAuction as SingleAuction).marketPrice)
                             : formatPrice((selectedAuction as SegmentedAuction).marketPrice)
                           }
                         </span>
                       </div>
                       <div className="flex justify-between">
                         <span className="text-gray-600">Slippage:</span>
                         <span className="font-semibold text-black">
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
                   <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-lg p-3">
                     <h4 className="font-semibold text-black text-sm mb-2 flex items-center gap-2">
                       <Layers className="w-4 h-4 text-purple-500" />
                       Select a Segment to Resolve
                     </h4>
                     <div className="grid grid-cols-2 gap-2">
                       {(selectedAuction as SegmentedAuction).segments.map((segment, index) => (
                         <motion.div 
                           key={segment.id} 
                           className={`backdrop-blur-sm rounded-lg p-2 border cursor-pointer transition-all duration-200 ${
                             selectedSegmentId === segment.id 
                               ? 'bg-purple-100/80 border-purple-300 shadow-lg' 
                               : segment.status === 'active'
                               ? 'bg-black/5 border-black/10 hover:bg-purple-50/50'
                               : 'bg-gray-100/50 border-gray-200 opacity-50 cursor-not-allowed'
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
                             <span className="text-xs font-medium text-gray-600">Segment {segment.id}</span>
                             <div className="flex items-center gap-1">
                               {selectedSegmentId === segment.id && (
                                 <CheckCircle className="w-3 h-3 text-purple-600" />
                               )}
                               <Badge className={`${
                                 segment.status === "active" 
                                   ? "bg-green-50/80 text-green-700 border-green-200/50" 
                                   : segment.status === "completed"
                                   ? "bg-blue-50/80 text-blue-700 border-blue-200/50"
                                   : "bg-gray-50/80 text-gray-700 border-gray-200/50"
                               } text-xs`}>
                                 {segment.status.toUpperCase()}
                               </Badge>
                             </div>
                           </div>
                           <div className="space-y-1">
                             <div className="flex justify-between text-xs">
                               <span className="text-gray-600">Current:</span>
                               <motion.span 
                                 key={`segment-${segment.id}-price-${Date.now()}`}
                                 className="font-semibold text-black"
                                 animate={{ opacity: [0.8, 1, 0.8] }}
                                 transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
                               >
                                 {formatPrice(segment.currentPrice)}
                               </motion.span>
                             </div>
                             <div className="flex justify-between text-xs">
                               <span className="text-gray-600">Min:</span>
                               <span className="font-semibold text-black">{formatPrice(segment.endPrice)}</span>
                             </div>
                             <div className="flex justify-between text-xs">
                               <span className="text-gray-600">Amount:</span>
                               <span className="font-semibold text-black">{(segment.amount || 0).toFixed(4)}</span>
                             </div>
                             {segment.winner && (
                               <div className="flex justify-between text-xs">
                                 <span className="text-gray-600">Winner:</span>
                                 <span className="font-semibold text-green-600">{segment.winner.slice(0, 8)}...</span>
                               </div>
                             )}
                           </div>
                         </motion.div>
                       ))}
                     </div>
                     {selectedSegmentId && (
                       <div className="mt-3 p-2 bg-purple-50/80 rounded-lg border border-purple-200/50">
                         <p className="text-xs text-purple-700 font-medium">
                           ✅ Selected Segment {selectedSegmentId} - Click "Confirm as Winner" to resolve this segment
                         </p>
                       </div>
                     )}
                   </div>
                 )}

                {/* Action Button */}
                <motion.div whileHover={{ y: -2 }} whileTap={{ y: 1 }}>
                                     <Button
                     className="w-full h-10 bg-black hover:bg-black/90 text-white font-bold backdrop-blur-sm border border-black/10 shadow-xl rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
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
         <DialogContent className="max-w-md bg-white/95 backdrop-blur-2xl border border-white/50">
           <DialogHeader>
             <DialogTitle className="text-xl font-bold text-black">Confirm Resolution</DialogTitle>
           </DialogHeader>
           <div className="space-y-4">
             <p className="text-gray-700">
               {pendingConfirmation?.auctionType === 'segmented' 
                 ? `Are you sure you want to resolve segment ${selectedSegmentId} of auction ${pendingConfirmation?.orderId.slice(0, 8)}...?`
                 : `Are you sure you want to resolve auction ${pendingConfirmation?.orderId.slice(0, 8)}...?`
               }
             </p>
             <p className="text-sm text-gray-600">
               {pendingConfirmation?.auctionType === 'segmented'
                 ? `This will declare you as the winner of segment ${selectedSegmentId} and complete that segment.`
                 : `This will declare you as the winner and complete the auction.`
               }
             </p>
             <div className="flex gap-3 pt-4">
               <Button
                 variant="outline"
                 className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                 onClick={() => setIsConfirmModalOpen(false)}
               >
                 Cancel
               </Button>
               <Button
                 className="flex-1 bg-black hover:bg-black/80 text-white"
                 onClick={handleConfirmResolution}
               >
                 Confirm
               </Button>
             </div>
           </div>
         </DialogContent>
       </Dialog>
     </div>
   )
 }

