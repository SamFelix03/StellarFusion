"use client"

import { useState, useEffect } from "react"
import LandingPage from "../landing-page"
import Component from "../dutch-auction-platform"
import SwapInterface from "../components/SwapInterface"
import { WalletProvider } from "../components/WalletProvider"

type View = "landing" | "swap" | "resolver"

export default function Page() {
  const [currentView, setCurrentView] = useState<View>("landing")

  // Load saved view from localStorage on mount
  useEffect(() => {
    const savedView = localStorage.getItem("currentView") as View
    if (savedView && ["landing", "swap", "resolver"].includes(savedView)) {
      setCurrentView(savedView)
    }
  }, [])

  const handleEnterSwap = () => {
    setCurrentView("swap")
    localStorage.setItem("currentView", "swap")
  }

  const handleEnterResolver = () => {
    setCurrentView("resolver")
    localStorage.setItem("currentView", "resolver")
  }

  const handleBackToHome = () => {
    setCurrentView("landing")
    localStorage.setItem("currentView", "landing")
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
