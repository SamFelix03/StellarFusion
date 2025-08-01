"use client"

import { createContext, useContext, useEffect, useState, useRef } from "react"
import { createConfig, http } from "wagmi"
import { mainnet, sepolia } from "wagmi/chains"
import { metaMask, walletConnect, coinbaseWallet } from "wagmi/connectors"
import { WagmiProvider, useAccount, useConnect, useDisconnect } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { isConnected, getAddress, getNetwork } from "@stellar/freighter-api"

const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    metaMask(),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID" }),
    coinbaseWallet({ appName: "StellarFusion" }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})

const queryClient = new QueryClient()

interface StellarWallet {
  publicKey: string
  isConnected: boolean
  balance: string
  network: 'testnet' | 'mainnet'
}

interface WalletContextType {
  // Ethereum wallet
  isConnected: boolean
  address: string | undefined
  connect: () => Promise<void>
  disconnect: () => void
  isLoading: boolean
  
  // Stellar wallet
  stellarWallet: StellarWallet | null
  connectStellar: () => Promise<void>
  disconnectStellar: () => void
  isStellarLoading: boolean
  updateCounter: number // Add counter to force re-renders
  balanceRef: React.MutableRefObject<string> // Add ref for direct balance access
  isMounted: boolean // Add mounted state to prevent hydration errors
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

function WalletContextProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected: ethConnected } = useAccount()
  const { connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  // Stellar wallet state
  const [stellarWallet, setStellarWallet] = useState<StellarWallet | null>(null)
  const [isStellarLoading, setIsStellarLoading] = useState(false)
  const [updateCounter, setUpdateCounter] = useState(0) // Force re-render counter
  const balanceRef = useRef<string>('0') // Track balance in ref
  const [isMounted, setIsMounted] = useState(false) // Track if component is mounted

  // Set mounted state after hydration
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Load saved wallet state from localStorage
  useEffect(() => {
    if (isMounted) {
      const savedWallet = localStorage.getItem("stellarWallet")
      if (savedWallet) {
        try {
          const parsedWallet = JSON.parse(savedWallet)
          console.log("📱 Loading saved wallet state:", parsedWallet)
          
          // Defer state update to avoid hydration issues
          const timer = setTimeout(() => {
            setStellarWallet(parsedWallet)
            balanceRef.current = parsedWallet.balance || '0'
          }, 50)
          
          return () => clearTimeout(timer)
        } catch (error) {
          console.error("❌ Error loading saved wallet:", error)
          localStorage.removeItem("stellarWallet")
        }
      }
    }
  }, [isMounted])

  const handleConnect = async () => {
    try {
      await connect({ connector: metaMask() })
    } catch (error) {
      console.error("Failed to connect Ethereum wallet:", error)
    }
  }

  const handleDisconnect = () => {
    disconnect()
  }

  const connectStellar = async () => {
    setIsStellarLoading(true)
    try {
      console.log("🔍 Starting Freighter connection...")
      
      // First, request access to Freighter
      console.log("🔐 Requesting access to Freighter...")
      try {
        // Import requestAccess dynamically to avoid issues
        const { requestAccess } = await import("@stellar/freighter-api")
        await requestAccess()
        console.log("✅ Access granted to Freighter")
      } catch (accessError) {
        console.log("⚠️ Access request failed, trying to check if already connected:", accessError)
      }
      
      // Check if Freighter is connected
      const connected = await isConnected()
      console.log("📊 Current connection status:", connected)
      
      if (!connected) {
        console.log("🔌 Freighter not connected, please connect in the extension")
        throw new Error("Please connect your Freighter wallet first. Open the Freighter extension and connect your account.")
      }

      // Get wallet info
      console.log("📋 Getting wallet information...")
      const addressResult = await getAddress()
      const networkInfo = await getNetwork()
      
      console.log("🔑 Address Result:", addressResult)
      console.log("🌐 Network Info:", networkInfo)
      
      if (addressResult.error) {
        throw new Error(`Failed to get address: ${addressResult.error}`)
      }
      
      const publicKey = addressResult.address
      
      // Get XLM balance
      const balance = await getStellarBalance(publicKey, networkInfo.network)
      console.log("💰 Raw balance from API:", balance)
      
      // Parse and format the balance properly
      const parsedBalance = parseFloat(balance)
      console.log("💰 Parsed balance:", parsedBalance)
      
      // Store balance in ref
      balanceRef.current = balance
      console.log("🔧 Balance stored in ref:", balanceRef.current)
      
      // Check if account has any balance
      if (parsedBalance === 0) {
        console.log("⚠️ Account has 0 XLM balance")
      } else {
        console.log("✅ Account has XLM balance:", parsedBalance)
      }
      
      const walletData = {
        publicKey,
        isConnected: true,
        balance: balance, // Keep as string to preserve precision
        network: networkInfo.network as 'testnet' | 'mainnet'
      }
      
      console.log("🔧 Setting Stellar wallet data:", walletData)
      console.log("🔧 Previous stellarWallet state:", stellarWallet)
      
      // Save wallet data to localStorage
      localStorage.setItem("stellarWallet", JSON.stringify(walletData))
      console.log("💾 Wallet data saved to localStorage")
      
      // Force state update with a callback to ensure it's applied
      setStellarWallet(prevState => {
        console.log("🔄 Previous state in setter:", prevState)
        console.log("🔄 New state being set:", walletData)
        return walletData
      })
      
      // Force re-render
      setUpdateCounter(prev => {
        console.log("🔄 Updating counter from", prev, "to", prev + 1)
        return prev + 1
      })
      
      console.log("🔧 setStellarWallet called with:", walletData)
      
      // Force a re-render after a short delay to ensure state is updated
      setTimeout(() => {
        console.log("⏰ After delay - checking if state was updated")
        console.log("💰 Current stellarWallet state:", stellarWallet)
      }, 100)

      console.log("✅ Stellar wallet connected successfully!")
      
      // Show user-friendly message if balance is 0
      if (parsedBalance === 0) {
        console.log("💡 Tip: Your Stellar account has 0 XLM. You may need to fund it with testnet XLM.")
      } else {
        console.log("🎉 XLM balance loaded successfully:", parsedBalance)
      }
      
    } catch (error) {
      console.error("❌ Failed to connect Stellar wallet:", error)
      throw error
    } finally {
      setIsStellarLoading(false)
    }
  }

  const disconnectStellar = async () => {
    try {
      setStellarWallet(null)
      localStorage.removeItem("stellarWallet")
      console.log("✅ Stellar wallet disconnected and localStorage cleared")
    } catch (error) {
      console.error("Failed to disconnect Stellar wallet:", error)
    }
  }

  // Check if Stellar account exists
  const checkStellarAccount = async (publicKey: string, network: string): Promise<boolean> => {
    try {
      const horizonUrl = network === 'testnet' 
        ? 'https://horizon-testnet.stellar.org' 
        : 'https://horizon.stellar.org'
      
      const response = await fetch(`${horizonUrl}/accounts/${publicKey}`)
      return response.ok
    } catch (error) {
      console.error("❌ Failed to check account existence:", error)
      return false
    }
  }

  // Get Stellar balance
  const getStellarBalance = async (publicKey: string, network: string): Promise<string> => {
    try {
      console.log("🔍 Fetching XLM balance for:", publicKey)
      console.log("🌐 Network:", network)
      
      // First check if account exists
      const accountExists = await checkStellarAccount(publicKey, network)
      if (!accountExists) {
        console.log("📝 Account does not exist, returning 0 balance")
        return '0'
      }
      
      const horizonUrl = network === 'testnet' 
        ? 'https://horizon-testnet.stellar.org' 
        : 'https://horizon.stellar.org'
      
      console.log("📡 Horizon URL:", horizonUrl)
      
      // Use the correct endpoint for account details
      const response = await fetch(`${horizonUrl}/accounts/${publicKey}`)
      console.log("📊 Response status:", response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error("❌ Horizon API error:", errorText)
        
        // If account doesn't exist, return 0 balance
        if (response.status === 404) {
          console.log("📝 Account not found, returning 0 balance")
          return '0'
        }
        
        throw new Error(`Horizon API error: ${response.status} - ${errorText}`)
      }
      
      const accountData = await response.json()
      console.log("📋 Account data:", accountData)
      
      // Find XLM balance (native asset)
      const xlmBalance = accountData.balances.find((balance: any) => 
        balance.asset_type === 'native'
      )
      
      console.log("💰 XLM balance found:", xlmBalance)
      
      if (xlmBalance) {
        const balance = xlmBalance.balance
        console.log("✅ Final XLM balance:", balance)
        return balance
      } else {
        console.log("❌ No XLM balance found in account data")
        return '0'
      }
      
    } catch (error) {
      console.error("❌ Failed to fetch Stellar balance:", error)
      return '0'
    }
  }

  // Listen for Freighter connection changes
  useEffect(() => {
    const checkFreighterConnection = async () => {
      try {
        const connected = await isConnected()
        if (!connected && stellarWallet) {
          setStellarWallet(null)
        }
      } catch (error) {
        console.error("Error checking Freighter connection:", error)
      }
    }

    // Check connection status periodically
    const interval = setInterval(checkFreighterConnection, 5000)
    return () => clearInterval(interval)
  }, [stellarWallet])

  // Auto-reconnect Freighter wallet on app reload
  useEffect(() => {
    const autoReconnectFreighter = async () => {
      try {
        console.log("🔄 Checking for existing Freighter connection...")
        const connected = await isConnected()
        
        if (connected && !stellarWallet) {
          console.log("✅ Freighter is connected, reconnecting wallet...")
          await connectStellar()
        } else if (!connected) {
          console.log("❌ Freighter not connected, user needs to connect manually")
        }
      } catch (error) {
        console.error("❌ Error during auto-reconnect:", error)
      }
    }

    // Only attempt auto-reconnect after component is mounted and hydration is complete
    if (isMounted) {
      // Defer the auto-reconnect to avoid hydration issues
      const timer = setTimeout(() => {
        autoReconnectFreighter()
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [isMounted]) // Only run when mounted state changes

  // Monitor stellarWallet state changes
  useEffect(() => {
    console.log("🔄 WalletProvider: stellarWallet state changed:", stellarWallet)
    if (stellarWallet) {
      console.log("💰 Current balance in state:", stellarWallet.balance)
      console.log("🔗 Current connection status:", stellarWallet.isConnected)
    }
  }, [stellarWallet])

  return (
    <WalletContext.Provider
      value={{
        // Ethereum wallet
        isConnected: ethConnected,
        address,
        connect: handleConnect,
        disconnect: handleDisconnect,
        isLoading: isPending,
        
        // Stellar wallet
        stellarWallet,
        connectStellar,
        disconnectStellar,
        isStellarLoading,
        updateCounter, // Add counter to force re-renders
        balanceRef, // Add ref for direct balance access
        isMounted, // Add mounted state to prevent hydration errors
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider")
  }
  return context
} 