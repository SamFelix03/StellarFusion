"use client"

import { useState } from "react"
import LandingPage from "../landing-page"
import Component from "../dutch-auction-platform"

export default function Page() {
  const [showPlatform, setShowPlatform] = useState(false)

  if (showPlatform) {
    return <Component />
  }

  return <LandingPage onEnterPlatform={() => setShowPlatform(true)} />
}
