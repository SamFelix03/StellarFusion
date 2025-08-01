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
import { useBalance, useAccount, useWalletClient } from "wagmi"
import Aurora from "./Aurora"
import OrderDetails from "./OrderDetails"
import PartialFillSettings from "./PartialFillSettings"
import LoadingModal from "./LoadingModal"
import { createOrder, sendOrderToRelayer, prepareBuyer, prepareStellarBuyer, shareSecretsWithRelayer, shareSegmentSecret, OrderData } from "@/lib/order-utils"
import OrderProgressModal from "./OrderProgressModal"
import { OrderProgress } from "./OrderProgressModal"
import { useOrderProgress } from "@/hooks/useOrderProgress"
import { toast } from "@/components/ui/use-toast"

interface Token {
  symbol: string
  name: string
  icon: string
  balance: number
  usdValue: number
  chain: "Sepolia Testnet" | "Stellar Testnet"
  address: string
  coingeckoId?: string
}

interface SwapState {
  fromToken: Token | null
  toToken: Token | null
  fromAmount: string
  toAmount: string
  fromChain: "Sepolia Testnet" | "Stellar Testnet"
  toChain: "Sepolia Testnet" | "Stellar Testnet"
}

interface PriceData {
  [key: string]: {
    usd: number
  }
}

// Import chain configuration
import { chainsConfig } from "@/constants/chains"

interface TokenConfig {
  name: string
  symbol: string
  address: string
  decimals: number
  isNative: boolean
}

const getTokensFromConfig = (): Token[] => {
  const tokens: Token[] = []
  
  // Add Sepolia tokens
  const sepoliaTokens = chainsConfig.sepolia.tokens as Record<string, TokenConfig>
  Object.entries(sepoliaTokens).forEach(([symbol, token]) => {
    tokens.push({
      symbol: symbol,
      name: token.name,
      icon: symbol === "ETH" ? "🔷" : symbol === "WETH" ? "🔷" : symbol === "USDC" ? "💙" : "💚",
      balance: 0,
      usdValue: 0,
      chain: "Sepolia Testnet",
      address: token.address,
      coingeckoId: symbol === "ETH" || symbol === "WETH" ? "ethereum" : undefined
    })
  })
  
  // Add Stellar tokens
  const stellarTokens = chainsConfig["stellar-testnet"].tokens as Record<string, TokenConfig>
  Object.entries(stellarTokens).forEach(([symbol, token]) => {
    tokens.push({
      symbol: symbol,
      name: token.name,
      icon: symbol === "XLM" ? "⭐" : symbol === "USDC" ? "💙" : "💚",
      balance: 0,
      usdValue: 0,
      chain: "Stellar Testnet",
      address: token.address,
      coingeckoId: symbol === "XLM" ? "stellar" : undefined
    })
  })
  
  return tokens
}

const mockTokens: Token[] = getTokensFromConfig()

export default function SwapInterface({ onBackToHome }: { onBackToHome?: () => void }) {
  const { 
    isConnected, 
    address, 
    connect, 
    disconnect, 
    isLoading,
    stellarWallet,
    connectStellar,
    disconnectStellar,
    isStellarLoading,
    updateCounter,
    balanceRef,
    isMounted
  } = useWallet()
  const { data: walletClient } = useWalletClient()
  
  const [swapState, setSwapState] = useState<SwapState>({
    fromToken: null,
    toToken: null,
    fromAmount: "",
    toAmount: "",
    fromChain: "Sepolia Testnet",
    toChain: "Stellar Testnet"
  })
  
  const [showTokenSelector, setShowTokenSelector] = useState(false)
  const [tokenSelectorType, setTokenSelectorType] = useState<"from" | "to">("from")
  const [searchQuery, setSearchQuery] = useState("")
  const [priceData, setPriceData] = useState<PriceData>({})
  const [currentUsdValue, setCurrentUsdValue] = useState(0)
  const [tokensWithBalances, setTokensWithBalances] = useState<Token[]>(mockTokens)
  
  // Monitor Stellar wallet changes
  useEffect(() => {
    if (stellarWallet?.isConnected) {
    }
  }, [stellarWallet])

  // Monitor balanceRef changes
  useEffect(() => {
    if (balanceRef.current !== '0') {
      console.log("💰 Balance ref has non-zero value:", balanceRef.current)
    }
  }, [updateCounter]) // Re-run when updateCounter changes
  
  // Monitor Stellar wallet changes more effectively
  useEffect(() => {
    if (stellarWallet?.isConnected) {
      console.log("✅ Stellar wallet is connected, balance:", stellarWallet.balance)
      console.log("🔧 Balance ref value:", balanceRef.current)
    }
  }, [stellarWallet, updateCounter])

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

  // Order progress tracking - simplified for current order only
  const [currentOrder, setCurrentOrder] = useState<OrderProgress | null>(null)
  const [showOrderProgress, setShowOrderProgress] = useState(false)
  const [orderDataMap, setOrderDataMap] = useState<Map<string, OrderData>>(new Map())

  // Use the real-time order progress hook
  const { orderProgress, setOrderProgress } = useOrderProgress(currentOrder?.orderId || null)

  // Update current order when real-time progress is received
  useEffect(() => {
    if (orderProgress && currentOrder) {
      setCurrentOrder(orderProgress)
    }
  }, [orderProgress, currentOrder])

  // Fetch real ETH balance using wagmi
  const { data: ethBalance } = useBalance({
    address: address as `0x${string}` | undefined,
  })

  // Fetch token prices from CoinGecko
  const fetchPrices = async () => {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,stellar&vs_currencies=usd')
      const data = await response.json()
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
    const updatedTokens = mockTokens.map(token => {
      // Handle Ethereum tokens (ETH, WETH, USDC)
      if (token.chain === "Sepolia Testnet") {
        if (token.symbol === "ETH" || token.symbol === "WETH") {
          return {
            ...token,
            balance: isConnected && ethBalance ? parseFloat(ethBalance.formatted) : 0,
            usdValue: isConnected && ethBalance ? parseFloat(ethBalance.formatted) * (priceData.ethereum?.usd || 0) : 0
          }
        }
        // For other Ethereum tokens (USDC), balance would be fetched separately
        return {
          ...token,
          balance: 0, // TODO: Fetch actual token balances
          usdValue: 0
        }
      }
      
      // Handle Stellar tokens (XLM, USDC)
      if (token.chain === "Stellar Testnet") {
        if (token.symbol === "XLM") {
          // Use both stellarWallet.balance and balanceRef.current for redundancy
          const rawBalance = stellarWallet?.balance || balanceRef.current || '0'
          const xlmBalance = stellarWallet?.isConnected ? parseFloat(rawBalance) : 0
          const xlmUsdValue = stellarWallet?.isConnected ? parseFloat(rawBalance) * (priceData.stellar?.usd || 0) : 0
          
          console.log("⭐ XLM Balance Update:")
          console.log("   - Stellar wallet connected:", stellarWallet?.isConnected)
          console.log("   - Raw balance from wallet:", stellarWallet?.balance)
          console.log("   - Raw balance from ref:", balanceRef.current)
          console.log("   - Used balance:", rawBalance)
          console.log("   - Parsed balance:", xlmBalance)
          console.log("   - USD value:", xlmUsdValue)
          
          return {
            ...token,
            balance: xlmBalance,
            usdValue: xlmUsdValue
          }
        }
        // For other Stellar tokens (USDC), balance would be fetched separately
        return {
          ...token,
          balance: 0, // TODO: Fetch actual token balances
          usdValue: 0
        }
      }
      
      return token
    })
    
    setTokensWithBalances(updatedTokens)
    
    // Update swap state with first available tokens
    setSwapState(prev => ({
      ...prev,
      fromToken: updatedTokens.find(t => t.chain === "Sepolia Testnet") || null,
      toToken: updatedTokens.find(t => t.chain === "Stellar Testnet") || null
    }))
  }, [isConnected, address, ethBalance, stellarWallet, balanceRef.current, updateCounter, priceData])

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
        toChain: token.chain === "Sepolia Testnet" ? "Stellar Testnet" : "Sepolia Testnet",
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

  // Check if required wallets are connected
  const isEthereumRequired = swapState.fromChain === "Sepolia Testnet" || swapState.toChain === "Sepolia Testnet"
  const isStellarRequired = swapState.fromChain === "Stellar Testnet" || swapState.toChain === "Stellar Testnet"
  
  const ethereumWalletConnected = isConnected
  const stellarWalletConnected = stellarWallet?.isConnected

  // Order creation functions
  const handleCreateOrder = () => {
    if (!swapState.fromToken || !swapState.toToken || !swapState.fromAmount || !swapState.toAmount) {
      toast({
        title: "Missing Information",
        description: "Please fill in all swap details before creating an order.",
        variant: "destructive",
      })
      return
    }

    // Check wallet connections
    if (isEthereumRequired && !ethereumWalletConnected) {
      toast({
        title: "Sepolia Testnet Wallet Required",
        description: "Please connect your MetaMask wallet to Sepolia testnet to create this order.",
        variant: "destructive",
      })
      return
    }

    if (isStellarRequired && !stellarWalletConnected) {
      toast({
        title: "Stellar Testnet Wallet Required",
        description: "Please connect your Freighter wallet to Stellar testnet to create this order.",
        variant: "destructive",
      })
      return
    }

    try {
      setShowLoadingModal(true)
      setLoadingStep(1) // Step 1: Order creation
      
      const orderData = createOrder({
        buyerAddress: address || stellarWallet?.publicKey || "",
        sourceChain: swapState.fromChain,
        destinationChain: swapState.toChain,
        sourceToken: swapState.fromToken?.symbol || "",
        destinationToken: swapState.toToken?.symbol || "",
        sourceAmount: swapState.fromAmount,
        destinationAmount: swapState.toAmount,
        enablePartialFills: enablePartialFills,
        partsCount: enablePartialFills ? partsCount : undefined
      })

      setOrderData(orderData)
      setShowOrderDetails(true)
      setShowLoadingModal(false)
      
    } catch (error) {
      setShowLoadingModal(false)
      console.error('❌ Error creating order:', error)
      
      toast({
        title: "Error Creating Order",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      })
    }
  }

  const handleConfirmOrder = async () => {
    if (!orderData) return;

    try {
      setShowLoadingModal(true);
      setLoadingStep(2); // Step 2: Buyer preparation
      
      // Step 1: Prepare buyer (APPROVAL PHASE) - IMMEDIATELY after order creation
      
      // Handle Ethereum approvals
      if (swapState.fromChain === "Sepolia Testnet" || swapState.toChain === "Sepolia Testnet") {
        if (!address) {
          throw new Error('Ethereum wallet not connected');
        }
        
        if (!walletClient) {
          throw new Error('Ethereum wallet client not available');
        }
        
        await prepareBuyer(
          swapState.fromChain, // Use the actual chain name instead of chain ID
          orderData.srcToken as string,
          orderData.srcAmount as string,
          walletClient
        );
      }
      
      // Handle Stellar approvals (if needed)
      if (swapState.fromChain === "Stellar Testnet" || swapState.toChain === "Stellar Testnet") {
        if (!stellarWallet?.isConnected) {
          throw new Error('Stellar wallet not connected');
        }
        
        // For Stellar, we might need to handle trustlines or other approvals
        await prepareStellarBuyer(
          orderData.srcToken as string,
          orderData.srcAmount as string,
          stellarWallet
        );
      }
      
      setLoadingStep(3); // Step 3: Sending to relayer
      
      // Step 2: Send order to relayer
      
      const response = await sendOrderToRelayer(orderData, orderData.isPartialFillEnabled);
      
      setLoadingStep(4); // Step 4: Processing response
      
      setShowLoadingModal(false);
      setShowOrderDetails(false);
      setOrderData(null);
      
      // Create order progress entry
      const orderProgress: OrderProgress = {
        orderId: orderData.orderId,
        orderType: orderData.isPartialFillEnabled ? 'partial' : 'single',
        status: 'auction_started', // Start with auction
        // Source amounts (what user is paying)
        sourceAmount: orderData.srcAmount as string,
        sourceToken: orderData.srcToken as string,
        sourceChain: orderData.srcChainId as string,
        // Destination amounts (what user is receiving)
        destinationAmount: orderData.dstAmount as string,
        destinationToken: orderData.dstToken as string,
        destinationChain: orderData.dstChainId as string,
        // Progress tracking
        filledAmount: '0',
        fillPercentage: 0,
        buyerAddress: orderData.buyerAddress as string,
        hashedSecret: orderData.hashedSecret as string,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      
      // Add segments for partial fills
      if (orderData.isPartialFillEnabled && orderData.partialFillSecrets) {
        const segmentAmount = parseFloat(orderData.dstAmount as string) / orderData.partialFillSecrets.length
        orderProgress.segments = orderData.partialFillSecrets.map((_, index) => ({
          id: index + 1,
          amount: segmentAmount.toString(),
          status: 'segment_auction_started', // Start with segment auction
          fillPercentage: 0
        }))
      }
      
      // Add order to progress tracking
      setCurrentOrder(orderProgress)
      setShowOrderProgress(true)
      
      // Initialize real-time progress tracking
      setOrderProgress(orderProgress)
      
      // Store the original OrderData for secret sharing
      setOrderDataMap(prev => {
        const newMap = new Map(prev)
        newMap.set(orderData.orderId, orderData)
        return newMap
      })
      
      // Show success message
      toast({
        title: "Order Created Successfully!",
        description: `Order ID: ${orderData.orderId}`,
      });
      
    } catch (error) {
      setShowLoadingModal(false);
      console.error('❌ Error confirming order:', error);
      
      toast({
        title: "Error Creating Order",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  const handleRefreshXLM = async () => {
    try {
      console.log("🔄 Manually refreshing XLM balance...")
      await connectStellar()
      
      // Force a re-render after connection
      setTimeout(() => {
        console.log("⏰ After refresh delay - checking balance")
        console.log("💰 Current stellarWallet state:", stellarWallet)
        console.log("💰 Current balanceRef:", balanceRef.current)
      }, 500)
      
      console.log("✅ XLM balance refreshed")
    } catch (error) {
      console.error("❌ Failed to refresh XLM balance:", error)
    }
  }

  // Handle secret sharing
  const handleShareSecret = async (orderId: string, segmentId?: number) => {
    try {
      const orderData = orderDataMap.get(orderId)
      if (!orderData) {
        throw new Error('Order data not found')
      }

      if (segmentId) {
        // Share segment secret for partial fills
        await shareSegmentSecret(orderId, segmentId, orderData)
      } else {
        // Share main secret for single fills
        await shareSecretsWithRelayer(orderData)
      }

      // Update current order status
      if (currentOrder && currentOrder.orderId === orderId) {
        setCurrentOrder({
          ...currentOrder,
          status: 'secret_received',
          updatedAt: Date.now()
        })
      }
      
      toast({
        title: "Secret Shared Successfully",
        description: segmentId ? `Segment ${segmentId} secret shared` : "Main secret shared",
      })
    } catch (error) {
      console.error('❌ Error sharing secret:', error)
      toast({
        title: "Error Sharing Secret",
        description: error instanceof Error ? error.message : "Failed to share secret",
        variant: "destructive",
      })
    }
  }

  // Simulate order status updates (for demo purposes)
  const simulateOrderProgress = () => {
    if (!currentOrder) return

    const statuses: OrderProgress['status'][] = [
      'auction_started',
      'price_update', 
      'auction_ended',
      'resolver_declared',
      'source_escrow_created',
      'destination_escrow_created',
      'escrows_verified',
      'secret_requested'
    ]

    let currentIndex = statuses.indexOf(currentOrder.status)
    if (currentIndex === -1) currentIndex = 0

    const nextIndex = (currentIndex + 1) % statuses.length
    const nextStatus = statuses[nextIndex]

    setCurrentOrder({
      ...currentOrder,
      status: nextStatus,
      updatedAt: Date.now()
    })
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
              
              {/* Wallet Status Indicators */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${ethereumWalletConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-xs text-white/60">Sepolia</span>
                <div className={`w-2 h-2 rounded-full ${stellarWalletConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-xs text-white/60">Stellar</span>
              </div>
            </div>

            {/* Wallet Connection Status */}
            {(!ethereumWalletConnected && isEthereumRequired) || (!stellarWalletConnected && isStellarRequired) ? (
              <div className="text-center py-8">
                <Wallet className="w-12 h-12 mx-auto mb-4 text-white/60" />
                <h3 className="text-lg font-semibold mb-2 text-white">Testnet Wallets Required</h3>
                <p className="text-white/60 mb-6">
                  {!ethereumWalletConnected && isEthereumRequired && !stellarWalletConnected && isStellarRequired
                    ? "Please connect both MetaMask (Sepolia) and Freighter (Stellar Testnet) wallets"
                    : !ethereumWalletConnected && isEthereumRequired
                    ? "Please connect your MetaMask wallet to Sepolia testnet"
                    : "Please connect your Freighter wallet to Stellar testnet"
                  }
                </p>
                
                <div className="flex flex-col gap-3">
                  {!ethereumWalletConnected && isEthereumRequired && (
                    <Button
                      onClick={connect}
                      disabled={isLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Wallet className="w-4 h-4 mr-2" />
                      {isLoading ? "Connecting..." : "Connect MetaMask (Sepolia)"}
                    </Button>
                  )}
                  
                  {!stellarWalletConnected && isStellarRequired && (
                    <Button
                      onClick={connectStellar}
                      disabled={isStellarLoading}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Star className="w-4 h-4 mr-2" />
                      {isStellarLoading ? "Connecting..." : "Connect Freighter (Testnet)"}
                    </Button>
                  )}
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBackToHome}
                  className="text-xs text-white/40 hover:text-white hover:bg-white/10 mt-4"
                >
                  Manage Wallets
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
                      <input
                        type="text"
                        value={swapState.fromAmount}
                        onChange={(e) => {
                          const value = e.target.value
                          // Only allow numbers and decimal point
                          const sanitizedValue = value.replace(/[^0-9.]/g, '')
                          handleFromAmountChange(sanitizedValue)
                        }}
                        placeholder="0.0"
                        className="text-right text-2xl font-bold bg-transparent border-none text-white placeholder-white/40 focus:outline-none focus:ring-0 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        style={{
                          WebkitAppearance: 'none',
                          MozAppearance: 'textfield'
                        }}
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
                  <div className="text-sm text-white/60 mb-2">
                    {isMounted && ethereumWalletConnected && (
                      <div>ETH: {address?.slice(0, 6)}...{address?.slice(-4)}</div>
                    )}
                    {isMounted && stellarWalletConnected && (
                      <div>
                        <div>XLM: {stellarWallet.publicKey.slice(0, 6)}...{stellarWallet.publicKey.slice(-4)}</div>
                        <div className="text-xs text-white/40 mt-1">
                          Balance: {parseFloat(stellarWallet.balance || balanceRef.current).toFixed(4)} XLM
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onBackToHome}
                      className="text-xs text-white/40 hover:text-white hover:bg-white/10"
                    >
                      Manage Wallets
                    </Button>
                    {currentOrder && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={simulateOrderProgress}
                        className="text-xs text-white/40 hover:text-white hover:bg-white/10"
                      >
                        Simulate Progress
                      </Button>
                    )}
                    {isMounted && stellarWalletConnected && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRefreshXLM}
                        disabled={isStellarLoading}
                        className="text-xs text-white/40 hover:text-white hover:bg-white/10"
                      >
                        {isStellarLoading ? "Refreshing..." : "Refresh XLM"}
                      </Button>
                    )}
                  </div>
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
                  <span>Testnet Networks</span>
                  <ChevronDown className="w-4 h-4" />
                </DialogTitle>
              </DialogHeader>
              
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  placeholder="Search by name or paste address"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/40 min-h-[2.5rem] w-full focus:outline-none focus:border-white/20"
                />
              </div>

              {/* Popular Tokens */}
              <div className="flex space-x-2 mb-4 overflow-x-auto pb-2">
                {["ETH", "WETH", "XLM", "USDC"].map((symbol) => (
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
                        <div className="text-sm text-white/60">{token.symbol}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">${token.usdValue.toFixed(2)}</div>
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
        totalSteps={4}
        message={loadingStep === 1 ? "Creating your order..." : 
                loadingStep === 2 ? "Preparing buyer approval..." : 
                loadingStep === 3 ? "Sending to relayer..." : 
                "Processing response..."}
      />

      {/* Order Progress Modal */}
      <OrderProgressModal
        isOpen={showOrderProgress}
        onClose={() => setShowOrderProgress(false)}
        orderData={currentOrder}
        onShareSecret={handleShareSecret}
      />
    </div>
  )
}