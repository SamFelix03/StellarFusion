"use client"

import { useState } from "react"
import LandingPage from "../landing-page"
import Component from "../dutch-auction-platform"

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

  if (currentView === "swap" || currentView === "resolver") {
    return <Component onBackToHome={handleBackToHome} />
  }

  return (
    <LandingPage 
      onEnterPlatform={handleEnterSwap} 
      onEnterResolver={handleEnterResolver} 
    />
  )
}
