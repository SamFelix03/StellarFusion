"use client"

import { motion } from "framer-motion"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Loader2, Clock, CheckCircle } from "lucide-react"

interface LoadingModalProps {
  isOpen: boolean
  message?: string
  step?: number
  totalSteps?: number
}

export default function LoadingModal({ 
  isOpen, 
  message = "Creating your order...", 
  step = 1,
  totalSteps = 3
}: LoadingModalProps) {
  const steps = [
    "Generating secrets and hashes...",
    "Preparing order data...",
    "Sending to relayer..."
  ]

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="bg-black/40 backdrop-blur-xl border border-white/10 max-w-md">
        <div className="flex flex-col items-center justify-center py-8 space-y-6">
          {/* Loading Animation */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="relative"
          >
            <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full" />
            <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-blue-400 rounded-full animate-pulse" />
          </motion.div>

          {/* Main Message */}
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-white">{message}</h3>
            <p className="text-sm text-white/60">Please wait while we process your order</p>
          </div>

          {/* Progress Steps */}
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Progress</span>
              <span className="text-white">{step}/{totalSteps}</span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-white/10 rounded-full h-2">
              <motion.div
                className="bg-gradient-to-r from-blue-400 to-purple-500 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(step / totalSteps) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            {/* Current Step */}
            <div className="flex items-center space-x-2 text-sm text-white/80">
              <Clock className="w-4 h-4" />
              <span>{steps[step - 1] || "Processing..."}</span>
            </div>
          </div>

          {/* Status Icons */}
          <div className="flex items-center space-x-4">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} className="flex items-center space-x-2">
                {i < step - 1 ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : i === step - 1 ? (
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-white/20" />
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 