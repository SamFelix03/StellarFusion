"use client"

import { useState } from "react"
import LandingPage from "../landing-page"
import Component from "../dutch-auction-platform"
import SwapInterface from "../components/SwapInterface"
import { WalletProvider } from "../components/WalletProvider"

type View = "landing" | "swap" | "resolver"

export default function Page() {
  const [currentView, setCurrentView] = useState<View>("landing")

  const handleEnterSwap = () => {
    setCurrentView("swap")
  }

  const handleEnterResolver = () => {
    setCurrentView("resolver")
  }

  const handleBackToHome = () => {
    setCurrentView("landing")
  }

  return (
    <WalletProvider>
      {currentView === "swap" && (
        <SwapInterface onBackToHome={handleBackToHome} />
      )}

      {currentView === "resolver" && (
        <Component onBackToHome={handleBackToHome} />
      )}

      {currentView === "landing" && (
        <LandingPage 
          onEnterPlatform={handleEnterSwap} 
          onEnterResolver={handleEnterResolver} 
        />
      )}
    </WalletProvider>
  )
}
