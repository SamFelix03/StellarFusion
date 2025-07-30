"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createConfig, http } from "wagmi"
import { mainnet, sepolia } from "wagmi/chains"
import { metaMask, walletConnect, coinbaseWallet } from "wagmi/connectors"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    metaMask(),
    walletConnect({ projectId: "YOUR_PROJECT_ID" }),
    coinbaseWallet({ appName: "StellarFusion" }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})

const queryClient = new QueryClient()

interface WalletContextType {
  isConnected: boolean
  address: string | undefined
  connect: () => Promise<void>
  disconnect: () => void
  isLoading: boolean
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [address, setAddress] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(false)

  const connect = async () => {
    setIsLoading(true)
    try {
      // This would be handled by wagmi hooks in a real implementation
      // For now, we'll simulate the connection
      await new Promise(resolve => setTimeout(resolve, 1000))
      const mockAddress = "0x" + Math.random().toString(16).substr(2, 40)
      setAddress(mockAddress)
      setIsConnected(true)
    } catch (error) {
      console.error("Failed to connect wallet:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const disconnect = () => {
    setIsConnected(false)
    setAddress(undefined)
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WalletContext.Provider
          value={{
            isConnected,
            address,
            connect,
            disconnect,
            isLoading,
          }}
        >
          {children}
        </WalletContext.Provider>
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