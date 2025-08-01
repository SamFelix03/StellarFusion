"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { motion } from "framer-motion"
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
  totalSteps = 4 // Updated from 3 to 4
}: LoadingModalProps) {
  const steps = [
    "Generating secrets and hashes...",
    "Preparing buyer approval...", // New step
    "Sending to relayer...",
    "Processing response..."
  ]

  return (
    <Dialog open={isOpen}>
      <DialogContent className="bg-black/40 backdrop-blur-xl border border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-center">
            {message}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center space-y-6 py-4">
          {/* Loading Animation */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full"
          >
            <Loader2 className="w-8 h-8 text-white mx-auto mt-2" />
          </motion.div>

          {/* Progress Steps */}
          <div className="w-full space-y-3">
            {steps.map((stepText, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  index + 1 < step 
                    ? 'bg-green-500' 
                    : index + 1 === step 
                    ? 'bg-blue-500 animate-pulse' 
                    : 'bg-white/20'
                }`}>
                  {index + 1 < step ? (
                    <CheckCircle className="w-4 h-4 text-white" />
                  ) : index + 1 === step ? (
                    <Clock className="w-4 h-4 text-white" />
                  ) : (
                    <span className="text-white text-xs">{index + 1}</span>
                  )}
                </div>
                <span className={`text-sm ${
                  index + 1 <= step ? 'text-white' : 'text-white/40'
                }`}>
                  {stepText}
                </span>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-white/20 rounded-full h-2">
            <motion.div
              className="bg-white h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(step / totalSteps) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          <div className="text-white/60 text-sm">
            Step {step} of {totalSteps}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 