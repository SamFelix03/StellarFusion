"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
} from "lucide-react"
import LiquidChrome from "./components/LiquidChrome"

interface Auction {
  id: string
  tokenName: string
  tokenSymbol: string
  fromChain: "Ethereum" | "Stellar"
  toChain: "Ethereum" | "Stellar"
  startPrice: number
  currentPrice: number
  minPrice: number
  endTime: number
  resolver: string
  totalAmount: number
  filled: number
  status: "active" | "ending" | "completed"
  type: "normal" | "partial-fill"
  segments?: AuctionSegment[]
}

interface AuctionSegment {
  id: string
  currentPrice: number
  minPrice: number
  filled: number
  totalAmount: number
  status: "active" | "ending" | "completed"
}

interface AuctionDetails extends Auction {
  gasEstimate: number
  contractAddress: string
  description: string
  swapFee: number
}

const generateMockAuctions = (): Auction[] => {
  const tokens = [
    { name: "Ethereum", symbol: "ETH" },
    { name: "USD Coin", symbol: "USDC" },
    { name: "Tether", symbol: "USDT" },
    { name: "Wrapped Bitcoin", symbol: "WBTC" },
    { name: "Chainlink", symbol: "LINK" },
    { name: "Uniswap", symbol: "UNI" },
    { name: "Stellar Lumens", symbol: "XLM" },
    { name: "Aave", symbol: "AAVE" },
  ]

  const auctions: Auction[] = []

  // Generate normal auctions (first 4 tokens)
  tokens.slice(0, 4).forEach((token, index) => {
    const fromChain = Math.random() > 0.5 ? "Ethereum" : "Stellar"
    const toChain = fromChain === "Ethereum" ? "Stellar" : "Ethereum"

    auctions.push({
      id: `fusion-normal-${index + 1}`,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      fromChain,
      toChain,
      startPrice: Math.random() * 10 + 5,
      currentPrice: Math.random() * 8 + 2,
      minPrice: Math.random() * 3 + 0.5,
      endTime: Date.now() + Math.random() * 3600000,
      resolver: `0x${Math.random().toString(16).substr(2, 8)}...${Math.random().toString(16).substr(2, 4)}`,
      totalAmount: Math.floor(Math.random() * 10000) + 1000,
      filled: Math.floor(Math.random() * 5000),
      status: Math.random() > 0.7 ? "ending" : Math.random() > 0.3 ? "active" : "completed",
      type: "normal"
    })
  })

  // Generate partial fill auctions (last 4 tokens)
  tokens.slice(4, 8).forEach((token, index) => {
    const fromChain = Math.random() > 0.5 ? "Ethereum" : "Stellar"
    const toChain = fromChain === "Ethereum" ? "Stellar" : "Ethereum"
    const baseAmount = Math.floor(Math.random() * 10000) + 1000
    const segmentAmount = Math.floor(baseAmount / 4)

    // Create 4 segments for partial fill
    const segments: AuctionSegment[] = Array.from({ length: 4 }, (_, segIndex) => ({
      id: `segment-${index + 1}-${segIndex + 1}`,
      currentPrice: Math.random() * 8 + 2,
      minPrice: Math.random() * 3 + 0.5,
      filled: Math.floor(Math.random() * segmentAmount),
      totalAmount: segmentAmount,
      status: Math.random() > 0.7 ? "ending" : Math.random() > 0.3 ? "active" : "completed"
    }))

    auctions.push({
      id: `fusion-partial-${index + 1}`,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      fromChain,
      toChain,
      startPrice: Math.random() * 10 + 5,
      currentPrice: Math.random() * 8 + 2,
      minPrice: Math.random() * 3 + 0.5,
      endTime: Date.now() + Math.random() * 3600000,
      resolver: `0x${Math.random().toString(16).substr(2, 8)}...${Math.random().toString(16).substr(2, 4)}`,
      totalAmount: baseAmount,
      filled: segments.reduce((sum, seg) => sum + seg.filled, 0),
      status: Math.random() > 0.7 ? "ending" : Math.random() > 0.3 ? "active" : "completed",
      type: "partial-fill",
      segments
    })
  })

  return auctions
}

export default function Component({ onBackToHome }: { onBackToHome?: () => void }) {
  const [auctions, setAuctions] = useState<Auction[]>(generateMockAuctions())
  const [selectedAuction, setSelectedAuction] = useState<AuctionDetails | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  // Simulate real-time price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setAuctions((prev) =>
        prev.map((auction) => {
          const updatedAuction = {
            ...auction,
            currentPrice: Math.max(auction.minPrice, auction.currentPrice - Math.random() * 0.05),
          }

          // Update segments for partial fill auctions
          if (auction.type === "partial-fill" && auction.segments) {
            const updatedSegments = auction.segments.map(segment => ({
              ...segment,
              currentPrice: Math.max(segment.minPrice, segment.currentPrice - Math.random() * 0.05),
              filled: Math.min(segment.totalAmount, segment.filled + Math.floor(Math.random() * 10)),
            }))
            
            updatedAuction.segments = updatedSegments
            updatedAuction.filled = updatedSegments.reduce((sum, seg) => sum + seg.filled, 0)
          } else {
            // For normal auctions, update filled amount
            updatedAuction.filled = Math.min(auction.totalAmount, auction.filled + Math.floor(Math.random() * 50))
          }

          return updatedAuction
        }),
      )
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  const handleAuctionClick = (auction: Auction) => {
    const details: AuctionDetails = {
      ...auction,
      gasEstimate: Math.floor(Math.random() * 50000) + 21000,
      contractAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
      description: `Cross-chain swap from ${auction.fromChain} to ${auction.toChain} for ${auction.tokenName}. Participate as a resolver to facilitate this fusion swap.`,
      swapFee: Math.random() * 0.5 + 0.1,
    }
    setSelectedAuction(details)
    setIsModalOpen(true)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-emerald-50/80 text-emerald-700 border-emerald-200/50"
      case "ending":
        return "bg-amber-50/80 text-amber-700 border-amber-200/50"
      case "completed":
        return "bg-gray-50/80 text-gray-700 border-gray-200/50"
      default:
        return "bg-blue-50/80 text-blue-700 border-blue-200/50"
    }
  }

  const formatTimeRemaining = (endTime: number) => {
    const remaining = endTime - Date.now()
    const hours = Math.floor(remaining / 3600000)
    const minutes = Math.floor((remaining % 3600000) / 60000)
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* LiquidChrome Background */}
      <div className="fixed inset-0 z-0">
        <LiquidChrome
          baseColor={[0.1, 0.1, 0.1]}
          speed={0.05}
          amplitude={0.6}
          interactive={false}
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
        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10"
        >
          {[
            {
              label: "Active Swaps",
              value: auctions.filter((a) => a.status === "active").length,
              icon: Activity,
              iconColor: "text-emerald-600",
            },
            {
              label: "Total Volume",
              value: "$2.8M",
              icon: DollarSign,
              iconColor: "text-blue-600",
            },
            {
              label: "Ending Soon",
              value: auctions.filter((a) => a.status === "ending").length,
              icon: Zap,
              iconColor: "text-amber-600",
            },
            {
              label: "Completed",
              value: auctions.filter((a) => a.status === "completed").length,
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
                    <p className="text-sm font-medium text-gray-600 mb-2">{stat.label}</p>
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
                    <TableHead className="font-semibold text-gray-700 border-white/20 py-4">Token & Route</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Auction Type</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Current Price</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Min Price</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Progress</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Time Left</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Status</TableHead>
                    <TableHead className="font-semibold text-gray-700 border-white/20">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {auctions.map((auction, index) => (
                      <motion.tr
                        key={auction.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ delay: index * 0.05, duration: 0.4 }}
                        className="cursor-pointer border-white/20 hover:bg-black/5 transition-all duration-300 group"
                        onMouseEnter={() => setHoveredRow(auction.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        onClick={() => handleAuctionClick(auction)}
                      >
                        <TableCell className="border-white/20 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-black/5 backdrop-blur-sm rounded-xl flex items-center justify-center text-black font-bold border border-black/10">
                              {auction.tokenSymbol.charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold text-black text-lg">{auction.tokenName}</p>
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <span>{auction.fromChain}</span>
                                <ArrowRight className="w-3 h-3" />
                                <span>{auction.toChain}</span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <Badge className={`${
                            auction.type === "normal" 
                              ? "bg-blue-50/80 text-blue-700 border-blue-200/50" 
                              : "bg-purple-50/80 text-purple-700 border-purple-200/50"
                          } border font-medium backdrop-blur-sm`}>
                            {auction.type === "normal" ? "NORMAL" : "PARTIAL FILL"}
                          </Badge>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <motion.div
                            className="flex items-center gap-2"
                            animate={{ scale: hoveredRow === auction.id ? 1.03 : 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            <TrendingDown className="w-4 h-4 text-red-500" />
                            <span className="font-bold text-xl text-black">${auction.currentPrice.toFixed(4)}</span>
                          </motion.div>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <span className="text-gray-600 font-medium">${auction.minPrice.toFixed(4)}</span>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-3 bg-black/10 rounded-full overflow-hidden backdrop-blur-sm">
                              <motion.div
                                className="h-full bg-gradient-to-r from-black/60 to-black/80 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${(auction.filled / auction.totalAmount) * 100}%` }}
                                transition={{ duration: 1, delay: index * 0.1 }}
                              />
                            </div>
                            <span className="text-sm text-gray-600 font-medium">
                              {((auction.filled / auction.totalAmount) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <span className="text-sm font-medium text-black">
                              {formatTimeRemaining(auction.endTime)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                            <Badge className={`${getStatusColor(auction.status)} border font-medium backdrop-blur-sm`}>
                              {auction.status.toUpperCase()}
                            </Badge>
                          </motion.div>
                        </TableCell>
                        <TableCell className="border-white/20">
                          <motion.div whileHover={{ x: 3 }} transition={{ duration: 0.2 }}>
                            <Button
                              size="sm"
                              className="bg-black hover:bg-black/80 text-white backdrop-blur-sm border border-black/10 shadow-lg font-medium"
                            >
                              Resolve
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                          </motion.div>
                        </TableCell>
                      </motion.tr>
                    ))}
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
              className="relative w-full max-w-lg bg-white/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/50 overflow-hidden"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/5 hover:bg-black/10 transition-colors"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>

              {/* Header */}
              <div className="p-6 border-b border-white/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-black/5 backdrop-blur-sm rounded-xl flex items-center justify-center text-black font-bold border border-black/10">
                    {selectedAuction.tokenSymbol.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-black">{selectedAuction.tokenName}</h2>
                      <Badge className="bg-blue-50/80 text-blue-700 border-blue-200/50 backdrop-blur-sm text-xs">
                        FUSION SWAP
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                      <span>{selectedAuction.fromChain}</span>
                      <ArrowLeftRight className="w-3 h-3" />
                      <span>{selectedAuction.toChain}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {/* Price Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-lg p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingDown className="w-3 h-3 text-emerald-600" />
                      <span className="font-medium text-emerald-800 text-xs">Current</span>
                    </div>
                    <motion.p
                      className="text-lg font-bold text-black"
                      animate={{ opacity: [0.9, 1, 0.9] }}
                      transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                    >
                      ${selectedAuction.currentPrice.toFixed(4)}
                    </motion.p>
                  </div>

                  <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-lg p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <Layers className="w-3 h-3 text-blue-600" />
                      <span className="font-medium text-blue-800 text-xs">Min</span>
                    </div>
                    <p className="text-lg font-bold text-black">${selectedAuction.minPrice.toFixed(4)}</p>
                  </div>
                </div>

                {/* Contract Details */}
                <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Wallet className="w-4 h-4 text-gray-700" />
                    <h3 className="font-semibold text-black text-sm">Contract Details</h3>
                  </div>

                  <div>
                    <div className="text-xs text-gray-600 mb-1">Contract Address</div>
                    <div className="p-2 bg-black/5 backdrop-blur-sm rounded-md border border-black/5">
                      <p className="text-xs font-mono text-gray-800 break-all">{selectedAuction.contractAddress}</p>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-lg p-4">
                  <h4 className="font-semibold text-black text-sm mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Swap Details
                  </h4>
                  <p className="text-gray-700 text-sm leading-relaxed">{selectedAuction.description}</p>
                </div>

                {/* Segments for Partial Fill Auctions */}
                {selectedAuction.type === "partial-fill" && selectedAuction.segments && (
                  <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-lg p-4">
                    <h4 className="font-semibold text-black text-sm mb-3 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-500" />
                      Auction Segments
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedAuction.segments.map((segment, index) => (
                        <div key={segment.id} className="bg-black/5 backdrop-blur-sm rounded-lg p-3 border border-black/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-600">Segment {index + 1}</span>
                            <Badge className={`${
                              segment.status === "active" 
                                ? "bg-green-50/80 text-green-700 border-green-200/50" 
                                : segment.status === "ending"
                                ? "bg-yellow-50/80 text-yellow-700 border-yellow-200/50"
                                : "bg-gray-50/80 text-gray-700 border-gray-200/50"
                            } text-xs`}>
                              {segment.status.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Current:</span>
                              <span className="font-semibold text-black">${segment.currentPrice.toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Min:</span>
                              <span className="font-semibold text-black">${segment.minPrice.toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Progress:</span>
                              <span className="font-semibold text-black">
                                {((segment.filled / segment.totalAmount) * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Button */}
                <motion.div whileHover={{ y: -2 }} whileTap={{ y: 1 }}>
                  <Button
                    className="w-full h-12 bg-black hover:bg-black/90 text-white font-bold backdrop-blur-sm border border-black/10 shadow-xl rounded-lg"
                    onClick={() => {
                      setIsModalOpen(false)
                    }}
                  >
                    <motion.div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Approve & Resolve Swap
                      <ArrowRight className="w-4 h-4" />
                    </motion.div>
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
