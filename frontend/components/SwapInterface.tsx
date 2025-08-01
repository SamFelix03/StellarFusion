"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  ArrowDown,
  ArrowUpDown,
  Settings,
  RefreshCw,
  ChevronDown,
  Star,
  Search,
  Wallet,
  X,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
} from "lucide-react"
import { useWallet } from "./WalletProvider"
import { useBalance } from "wagmi"
import Aurora from "./Aurora"
import OrderDetails from "./OrderDetails"
import PartialFillSettings from "./PartialFillSettings"
import LoadingModal from "./LoadingModal"
import { createOrder, sendOrderToRelayer, OrderData } from "@/lib/order-utils"

interface Token {
  symbol: string
  name: string
  icon: string
  balance: number
  usdValue: number
  chain: "Ethereum" | "Stellar"
  address: string
  coingeckoId?: string
}

interface SwapState {
  fromToken: Token | null
  toToken: Token | null
  fromAmount: string
  toAmount: string
  fromChain: "Ethereum" | "Stellar"
  toChain: "Ethereum" | "Stellar"
}

interface PriceData {
  [key: string]: {
    usd: number
  }
}

const mockTokens: Token[] = [
  {
    symbol: "ETH",
    name: "Ether",
    icon: "🔷",
    balance: 0,
    usdValue: 0,
    chain: "Ethereum",
    address: "0x0000000000000000000000000000000000000000",
    coingeckoId: "ethereum"
  },
  {
    symbol: "Sepolia ETH",
    name: "Sepolia Ether",
    icon: "🔷",
    balance: 0,
    usdValue: 0,
    chain: "Ethereum",
    address: "0x0000000000000000000000000000000000000000",
    coingeckoId: "ethereum"
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    icon: "💙",
    balance: 0,
    usdValue: 0,
    chain: "Ethereum",
    address: "0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8"
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    icon: "💚",
    balance: 0,
    usdValue: 0,
    chain: "Ethereum",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  },
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    icon: "⭐",
    balance: 0,
    usdValue: 0,
    chain: "Stellar",
    address: "native",
    coingeckoId: "stellar"
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    icon: "💙",
    balance: 0,
    usdValue: 0,
    chain: "Stellar",
    address: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34KUEKUS"
  }
]

export default function SwapInterface({ onBackToHome }: { onBackToHome?: () => void }) {
  const { isConnected, address, connect, disconnect, isLoading } = useWallet()
  
  const [swapState, setSwapState] = useState<SwapState>({
    fromToken: null,
    toToken: null,
    fromAmount: "",
    toAmount: "",
    fromChain: "Ethereum",
    toChain: "Stellar"
  })
  
  const [showTokenSelector, setShowTokenSelector] = useState(false)
  const [tokenSelectorType, setTokenSelectorType] = useState<"from" | "to">("from")
  const [searchQuery, setSearchQuery] = useState("")
  const [priceData, setPriceData] = useState<PriceData>({})
  const [currentUsdValue, setCurrentUsdValue] = useState(0)
  const [tokensWithBalances, setTokensWithBalances] = useState<Token[]>(mockTokens)
  
  // Order creation state
  const [enablePartialFills, setEnablePartialFills] = useState(false)
  const [partsCount, setPartsCount] = useState(4)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [orderData, setOrderData] = useState<OrderData | null>(null)
  const [isCreatingOrder, setIsCreatingOrder] = useState(false)
  const [showLoadingModal, setShowLoadingModal] = useState(false)
  const [loadingStep, setLoadingStep] = useState(1)
  const [orderStatus, setOrderStatus] = useState<{
    type: 'success' | 'error' | null
    message: string
  }>({ type: null, message: '' })

  // Fetch real ETH balance using wagmi
  const { data: ethBalance } = useBalance({
    address: address as `0x${string}` | undefined,
  })

  // Fetch token prices from CoinGecko
  const fetchPrices = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,stellar&vs_currencies=usd')
      const data = await response.json()
      console.log('Fetched price data:', data)
      setPriceData(data)
    } catch (error) {
      console.error('Failed to fetch prices:', error)
    }
  }

  // Fetch prices on component mount
  useEffect(() => {
    fetchPrices()
    // Refresh prices every 30 seconds
    const interval = setInterval(fetchPrices, 30000)
    return () => clearInterval(interval)
  }, [])

  // Update token balances when wallet connects or ETH balance changes
  useEffect(() => {
    if (isConnected && address && ethBalance) {
      const updatedTokens = mockTokens.map(token => {
        if (token.symbol === "ETH" || token.symbol === "Sepolia ETH") {
          return {
            ...token,
            balance: parseFloat(ethBalance.formatted),
            usdValue: parseFloat(ethBalance.formatted) * (priceData.ethereum?.usd || 0)
          }
        }
        // For other tokens, you would fetch their balances here
        return {
          ...token,
          balance: Math.random() * 100, // Mock balance for other tokens
          usdValue: 0
        }
      })
      
      setTokensWithBalances(updatedTokens)
      
      // Update swap state with first available tokens
      setSwapState(prev => ({
        ...prev,
        fromToken: updatedTokens.find(t => t.chain === "Ethereum") || null,
        toToken: updatedTokens.find(t => t.chain === "Stellar") || null
      }))
    }
  }, [isConnected, address, ethBalance, priceData])

  // Calculate USD value when amount or price data changes
  useEffect(() => {
    if (swapState.fromAmount && swapState.fromToken && priceData) {
      const amount = parseFloat(swapState.fromAmount)
      const tokenId = swapState.fromToken.coingeckoId
      
      if (tokenId && priceData[tokenId]) {
        const usdValue = amount * priceData[tokenId].usd
        setCurrentUsdValue(usdValue)
      } else {
        setCurrentUsdValue(0)
      }
    } else {
      setCurrentUsdValue(0)
    }
  }, [swapState.fromAmount, swapState.fromToken, priceData])

  const openTokenSelector = (type: "from" | "to") => {
    setTokenSelectorType(type)
    setShowTokenSelector(true)
    setSearchQuery("")
  }

  const selectToken = (token: Token) => {
    if (tokenSelectorType === "from") {
      setSwapState(prev => ({
        ...prev,
        fromToken: token,
        fromChain: token.chain,
        toChain: token.chain === "Ethereum" ? "Stellar" : "Ethereum",
        fromAmount: token.balance.toString() // Auto-fill with balance
      }))
    } else {
      setSwapState(prev => ({
        ...prev,
        toToken: token,
        toChain: token.chain
      }))
    }
    setShowTokenSelector(false)
  }

  const swapTokens = () => {
    setSwapState(prev => ({
      ...prev,
      fromToken: prev.toToken,
      toToken: prev.fromToken,
      fromChain: prev.toChain,
      toChain: prev.fromChain,
      fromAmount: prev.toAmount,
      toAmount: prev.fromAmount
    }))
  }

  const handleFromAmountChange = (value: string) => {
    const numValue = parseFloat(value) || 0
    
    // Calculate real conversion rate based on price data
    let conversionRate = 1.5 // fallback rate
    if (swapState.fromToken && swapState.toToken && priceData) {
      const fromTokenId = swapState.fromToken.coingeckoId
      const toTokenId = swapState.toToken.coingeckoId
      
      if (fromTokenId && toTokenId && priceData[fromTokenId] && priceData[toTokenId]) {
        conversionRate = priceData[fromTokenId].usd / priceData[toTokenId].usd
        console.log(`Conversion rate: 1 ${swapState.fromToken.symbol} = ${conversionRate} ${swapState.toToken.symbol}`)
        console.log(`Price data: ETH=${priceData.ethereum?.usd}, XLM=${priceData.stellar?.usd}`)
      }
    }
    
    setSwapState(prev => ({
      ...prev,
      fromAmount: value,
      toAmount: value ? (numValue * conversionRate).toFixed(4) : ""
    }))
  }

  const setMaxAmount = () => {
    if (swapState.fromToken) {
      const maxAmount = swapState.fromToken.balance.toString()
      handleFromAmountChange(maxAmount)
    }
  }

  const filteredTokens = tokensWithBalances.filter(token => {
    const matchesSearch = token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
    
    if (tokenSelectorType === "from") {
      return matchesSearch && token.chain === swapState.fromChain
    } else {
      return matchesSearch && token.chain === swapState.toChain && 
             token.symbol !== swapState.fromToken?.symbol
    }
  })

  const canSwap = swapState.fromToken && swapState.toToken && 
                  swapState.fromAmount && parseFloat(swapState.fromAmount) > 0 &&
                  parseFloat(swapState.fromAmount) <= (swapState.fromToken?.balance || 0)

  // Order creation functions
  const handleCreateOrder = () => {
    console.log('🚀 Starting order creation process...')
    
    if (!address) {
      console.error('❌ No wallet address available')
      setOrderStatus({ type: 'error', message: 'Please connect your wallet first' })
      return
    }

    if (!swapState.fromToken || !swapState.toToken || !swapState.fromAmount || !swapState.toAmount) {
      console.error('❌ Invalid swap state for order creation')
      setOrderStatus({ type: 'error', message: 'Please complete the swap configuration' })
      return
    }

    // Show loading modal
    setShowLoadingModal(true)
    setLoadingStep(1)

    console.log('📋 Creating order with parameters:', {
      sourceChain: swapState.fromChain,
      destinationChain: swapState.toChain,
      sourceToken: swapState.fromToken.symbol,
      destinationToken: swapState.toToken.symbol,
      sourceAmount: swapState.fromAmount,
      destinationAmount: swapState.toAmount,
      buyerAddress: address,
      enablePartialFills,
      partsCount
    })

    try {
      // Step 1: Generate secrets and hashes
      setLoadingStep(1)
      const order = createOrder({
        sourceChain: swapState.fromChain,
        destinationChain: swapState.toChain,
        sourceToken: swapState.fromToken.symbol,
        destinationToken: swapState.toToken.symbol,
        sourceAmount: swapState.fromAmount,
        destinationAmount: swapState.toAmount,
        buyerAddress: address,
        enablePartialFills,
        partsCount
      })

      // Step 2: Prepare order data
      setLoadingStep(2)
      console.log('✅ Order created successfully:', order)
      setOrderData(order)
      
      // Step 3: Show order details
      setLoadingStep(3)
      setShowLoadingModal(false)
      setShowOrderDetails(true)
      setOrderStatus({ type: null, message: '' })
    } catch (error) {
      console.error('❌ Error creating order:', error)
      setShowLoadingModal(false)
      setOrderStatus({ type: 'error', message: 'Failed to create order' })
    }
  }

  const handleConfirmOrder = async () => {
    if (!orderData) {
      console.error('❌ No order data available')
      return
    }

    console.log('📤 Confirming order and sending to relayer...')
    setIsCreatingOrder(true)
    setOrderStatus({ type: null, message: '' })

    // Show loading modal for relayer communication
    setShowLoadingModal(true)
    setLoadingStep(1)

    try {
      // Step 1: Preparing to send
      setLoadingStep(1)
      
      // Step 2: Sending to relayer
      setLoadingStep(2)
      const result = await sendOrderToRelayer(orderData, orderData.isPartialFillEnabled || false)
      
      // Step 3: Processing response
      setLoadingStep(3)
      console.log('✅ Order sent to relayer successfully:', result)
      
      setOrderStatus({ 
        type: 'success', 
        message: `Order created successfully! Order ID: ${orderData.orderId.slice(0, 8)}...` 
      })
      
      // Close modals after successful creation
      setShowLoadingModal(false)
      setTimeout(() => {
        setShowOrderDetails(false)
        setOrderData(null)
        setOrderStatus({ type: null, message: '' })
      }, 3000)
      
    } catch (error) {
      console.error('❌ Error sending order to relayer:', error)
      setShowLoadingModal(false)
      setOrderStatus({ 
        type: 'error', 
        message: 'Failed to send order to relayer. Please try again.' 
      })
    } finally {
      setIsCreatingOrder(false)
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

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-md"
        >
          {/* Main Swap Card */}
          <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="bg-white/10 text-white hover:bg-white/20 rounded-xl"
                >
                  Swap
                </Button>
              </div>
            </div>

            {/* Wallet Connection Status */}
            {!isConnected ? (
              <div className="text-center py-8">
                <Wallet className="w-12 h-12 mx-auto mb-4 text-white/60" />
                <h3 className="text-lg font-semibold mb-2 text-white">Wallet Not Connected</h3>
                <p className="text-white/60 mb-6">Please connect your wallet from the home page to start swapping tokens</p>
                <Button
                  onClick={onBackToHome}
                  className="bg-white text-black hover:bg-gray-100 font-semibold px-8 py-3"
                >
                  Go to Home
                </Button>
              </div>
            ) : (
              <>
                {/* From Token */}
                <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white/60">You pay</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-white/60">
                        Balance: {swapState.fromToken?.balance.toFixed(4) || "0.0000"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={setMaxAmount}
                        className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded"
                      >
                        MAX
                      </Button>
                    </div>
                  </div>
                  
                                     <div className="flex items-center justify-between">
                     <div className="flex items-center space-x-3 min-w-0 flex-1">
                       <Button
                         variant="ghost"
                         onClick={() => openTokenSelector("from")}
                         className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl flex-shrink-0"
                       >
                         <span className="text-xl">{swapState.fromToken?.icon || "🔷"}</span>
                         <span className="font-semibold">{swapState.fromToken?.symbol || "Select"}</span>
                         <ChevronDown className="w-4 h-4" />
                       </Button>
                     </div>
                     
                     <div className="text-right min-w-0 flex-1 ml-4">
                       <Input
                         type="number"
                         value={swapState.fromAmount}
                         onChange={(e) => handleFromAmountChange(e.target.value)}
                         placeholder="0.0"
                         className="text-right text-2xl font-bold bg-transparent border-none text-white placeholder-white/40 focus:ring-0 w-full"
                       />
                       <div className="text-sm text-white/60 truncate">
                         ~${currentUsdValue.toFixed(2)}
                       </div>
                     </div>
                   </div>
                  
                  <div className="mt-2 text-xs text-white/40">
                    on {swapState.fromChain}
                  </div>
                </div>

                {/* Swap Arrow */}
                <div className="flex justify-center my-4">
                  <Button
                    variant="ghost"
                    onClick={swapTokens}
                    className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full"
                  >
                    <ArrowUpDown className="w-5 h-5" />
                  </Button>
                </div>

                {/* To Token */}
                <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-4 mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white/60">You receive</span>
                    <span className="text-sm text-white/60">
                      Balance: {swapState.toToken?.balance.toFixed(4) || "0.0000"}
                    </span>
                  </div>
                  
                                     <div className="flex items-center justify-between">
                     <div className="flex items-center space-x-3 min-w-0 flex-1">
                       <Button
                         variant="ghost"
                         onClick={() => openTokenSelector("to")}
                         className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl flex-shrink-0"
                       >
                         <span className="text-xl">{swapState.toToken?.icon || "⭐"}</span>
                         <span className="font-semibold">{swapState.toToken?.symbol || "Select"}</span>
                         <ChevronDown className="w-4 h-4" />
                       </Button>
                     </div>
                     
                     <div className="text-right min-w-0 flex-1 ml-4">
                       <div className="text-2xl font-bold text-white truncate">
                         {swapState.toAmount || "0.0"}
                       </div>
                       <div className="text-sm text-white/60 truncate">
                         ~${(() => {
                           if (swapState.toAmount && swapState.toToken && priceData) {
                             const amount = parseFloat(swapState.toAmount)
                             const tokenId = swapState.toToken.coingeckoId
                             if (tokenId && priceData[tokenId]) {
                               return (amount * priceData[tokenId].usd).toFixed(2)
                             }
                           }
                           return "0.00"
                         })()}
                       </div>
                     </div>
                   </div>
                  
                  <div className="mt-2 text-xs text-white/40">
                    on {swapState.toChain}
                  </div>
                </div>

                {/* Exchange Rate */}
                <div className="flex items-center justify-between text-sm text-white/60 mb-4">
                  <span>
                    {swapState.fromToken && swapState.toToken && priceData
                      ? (() => {
                          const fromTokenId = swapState.fromToken.coingeckoId
                          const toTokenId = swapState.toToken.coingeckoId
                          if (fromTokenId && toTokenId && priceData[fromTokenId] && priceData[toTokenId]) {
                            const rate = priceData[fromTokenId].usd / priceData[toTokenId].usd
                            return `1 ${swapState.fromToken.symbol} = ${rate.toFixed(2)} ${swapState.toToken.symbol}`
                          }
                          return `1 ${swapState.fromToken.symbol} = 1.5 ${swapState.toToken.symbol}`
                        })()
                      : `1 ${swapState.fromToken?.symbol || "ETH"} = 1.5 ${swapState.toToken?.symbol || "XLM"}`
                    }
                  </span>
                  <div className="flex items-center space-x-1">
                    <span className="text-green-400">Free</span>
                    <span>$0.00</span>
                    <ChevronDown className="w-3 h-3" />
                  </div>
                </div>

                {/* Partial Fill Settings */}
                <div className="mb-4">
                  <PartialFillSettings
                    enablePartialFills={enablePartialFills}
                    partsCount={partsCount}
                    onPartialFillsChange={setEnablePartialFills}
                    onPartsCountChange={setPartsCount}
                  />
                </div>

                {/* Order Status */}
                {orderStatus.type && (
                  <div className={`mb-4 p-3 rounded-lg border ${
                    orderStatus.type === 'success' 
                      ? 'bg-green-500/10 border-green-500/20 text-green-300' 
                      : 'bg-red-500/10 border-red-500/20 text-red-300'
                  }`}>
                    <div className="flex items-center space-x-2">
                      {orderStatus.type === 'success' ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                      <span className="text-sm">{orderStatus.message}</span>
                    </div>
                  </div>
                )}

                {/* Swap Button */}
                <Button
                  onClick={handleCreateOrder}
                  disabled={!canSwap}
                  className={`w-full py-4 rounded-2xl font-semibold ${
                    canSwap
                      ? "bg-white text-black hover:bg-gray-100"
                      : "bg-white/10 text-white/40 cursor-not-allowed"
                  }`}
                >
                  {!swapState.fromToken || !swapState.toToken
                    ? "Select tokens"
                    : !swapState.fromAmount
                    ? "Enter amount"
                    : parseFloat(swapState.fromAmount) > (swapState.fromToken?.balance || 0)
                    ? "Insufficient balance"
                    : "Create Order"}
                </Button>

                {/* Wallet Info */}
                <div className="mt-4 text-center">
                  <div className="text-sm text-white/60">
                    Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
                  </div>
                                     <Button
                     variant="ghost"
                     size="sm"
                     onClick={onBackToHome}
                     className="text-xs text-white/40 hover:text-white hover:bg-white/10 mt-2"
                   >
                     Manage Wallet
                   </Button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* Token Selector Modal */}
      <AnimatePresence>
        {showTokenSelector && (
          <Dialog open={showTokenSelector} onOpenChange={setShowTokenSelector}>
            <DialogContent className="bg-black/40 backdrop-blur-xl border border-white/10 max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2 text-white">
                  <span>🌐</span>
                  <span>All networks</span>
                  <ChevronDown className="w-4 h-4" />
                </DialogTitle>
              </DialogHeader>
              
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  placeholder="Search by name or paste address"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-black/30 border-white/10 text-white placeholder-white/40"
                />
              </div>

              {/* Popular Tokens */}
              <div className="flex space-x-2 mb-4 overflow-x-auto pb-2">
                {["ETH", "Sepolia ETH", "XLM", "USDC", "USDT"].map((symbol) => (
                  <Button
                    key={symbol}
                    variant="ghost"
                    size="sm"
                    className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-full text-sm whitespace-nowrap"
                  >
                    {symbol}
                  </Button>
                ))}
              </div>

              {/* Token List */}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {filteredTokens.map((token) => (
                  <Button
                    key={`${token.chain}-${token.symbol}`}
                    variant="ghost"
                    onClick={() => selectToken(token)}
                    className="w-full justify-between bg-black/20 hover:bg-black/40 text-white p-3 rounded-xl"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-xl">{token.icon}</span>
                      <div className="text-left">
                        <div className="font-semibold">{token.name}</div>
                        <div className="text-sm text-white/60">
                          {token.balance.toFixed(4)} {token.symbol} · {token.chain}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">${token.usdValue.toFixed(2)}</div>
                      <Star className="w-4 h-4 text-white/40" />
                    </div>
                  </Button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

             {/* Order Details Modal */}
       <OrderDetails
         orderData={orderData}
         isOpen={showOrderDetails}
         onClose={() => {
           setShowOrderDetails(false)
           setOrderData(null)
         }}
         onConfirm={handleConfirmOrder}
         isLoading={isCreatingOrder}
       />

       {/* Loading Modal */}
       <LoadingModal
         isOpen={showLoadingModal}
         step={loadingStep}
         totalSteps={3}
         message={loadingStep === 1 ? "Creating your order..." : 
                 loadingStep === 2 ? "Sending to relayer..." : 
                 "Processing response..."}
       />
     </div>
   )
} 