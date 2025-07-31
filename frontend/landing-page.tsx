"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  Zap,
  Sparkles,
  ArrowLeftRight,
  Users,
  Wallet,
} from "lucide-react"
import Dither from "./components/Dither"
import { useWallet } from "./components/WalletProvider"

export default function LandingPage({ 
  onEnterPlatform, 
  onEnterResolver 
}: { 
  onEnterPlatform: () => void
  onEnterResolver: () => void 
}) {
  const [isHovered, setIsHovered] = useState(false)
  const { isConnected, address, connect, disconnect, isLoading } = useWallet()

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

      {/* Content Overlay */}
      <div className="relative z-10">
        {/* Navigation */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex items-center justify-between p-8"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">StellarFusion</span>
          </div>

          <div className="flex items-center gap-6">
            {!isConnected ? (
              <Button
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10 backdrop-blur-sm bg-transparent"
                onClick={connect}
                disabled={isLoading}
              >
                <Wallet className="w-4 h-4 mr-2" />
                {isLoading ? "Connecting..." : "Connect Wallet"}
              </Button>
            ) : (
              <div className="flex items-center gap-4">
                <span className="text-white/80 text-sm">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <Button
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10 backdrop-blur-sm bg-transparent"
                  onClick={disconnect}
                >
                  Disconnect
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 backdrop-blur-sm bg-transparent"
              onClick={onEnterPlatform}
            >
              Launch App
            </Button>
          </div>
        </motion.nav>

        {/* Hero Section */}
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="max-w-4xl mx-auto"
          >
            <Badge className="bg-white/10 text-white border-white/20 backdrop-blur-xl mb-6 px-4 py-2">
              <Zap className="w-4 h-4 mr-2" />
              Next-Gen Cross-Chain Swaps
            </Badge>

            <h1 className="text-6xl md:text-8xl font-bold mb-8 leading-tight">
              <span className="bg-gradient-to-r from-white via-gray-200 to-white bg-clip-text text-transparent">
                Stellar Fusion
              </span>
              <br />
              <span className="bg-gradient-to-r from-gray-400 via-white to-gray-400 bg-clip-text text-transparent">
                Swaps
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-white/70 mb-12 max-w-3xl mx-auto leading-relaxed">
              Experience gasless atomic swaps between ethereum and stellar
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onHoverStart={() => setIsHovered(true)}
                onHoverEnd={() => setIsHovered(false)}
              >
                <Button
                  size="lg"
                  className="bg-white text-black hover:bg-gray-100 font-bold text-lg px-8 py-4 h-auto"
                  onClick={onEnterPlatform}
                >
                  <ArrowLeftRight className="w-5 h-5 mr-2" />
                  Swap
                  <motion.div animate={{ x: isHovered ? 5 : 0 }} transition={{ duration: 0.2 }}>
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </motion.div>
                </Button>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10 hover:text-white backdrop-blur-sm font-bold text-lg px-8 py-4 h-auto bg-transparent"
                  onClick={onEnterResolver}
                >
                  <Users className="w-5 h-5 mr-2" />
                  Resolver
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
