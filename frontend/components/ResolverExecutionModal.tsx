"use client"

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { 
  Wallet, 
  ArrowRight, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Loader2,
  ExternalLink,
  Copy,
  Shield,
  Zap,
  Coins,
  Network,
  Timer,
  Hash,
  Key,
  Trophy
} from 'lucide-react'
import { useWallet } from '@/components/WalletProvider'
import { toast } from '@/hooks/use-toast'

interface ResolverExecutionModalProps {
  isOpen: boolean
  onClose: () => void
  auction: any
  onExecutionComplete: () => void
}

interface ExecutionStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  details?: any
  error?: string
}

export default function ResolverExecutionModal({ 
  isOpen, 
  onClose, 
  auction, 
  onExecutionComplete 
}: ResolverExecutionModalProps) {
  const { address, stellarWallet } = useWallet()
  const [currentStep, setCurrentStep] = useState(0)
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionDetails, setExecutionDetails] = useState<any>(null)

  // Initialize execution steps for winner declaration
  const initializeExecutionSteps = () => {
    const steps: ExecutionStep[] = [
      {
        id: 'winner-declaration',
        title: 'Winner Declaration',
        description: 'Declaring resolver as the winner of the auction',
        status: 'pending'
      },
      {
        id: 'confirmation',
        title: 'Confirmation',
        description: 'Confirming winner status and preparing for next steps',
        status: 'pending'
      },
      {
        id: 'completion',
        title: 'Completion',
        description: 'Winner declaration completed successfully',
        status: 'pending'
      }
    ]
    setExecutionSteps(steps)
  }

  // Update step status
  const updateStepStatus = (stepId: string, status: ExecutionStep['status'], details?: any, error?: string) => {
    setExecutionSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status, details, error }
        : step
    ))
  }

  // Get wallet address
  const getWalletAddress = (wallet: any): string | undefined => {
    if (!wallet) return undefined
    if (wallet.address) return wallet.address
    if (wallet.publicKey) return wallet.publicKey
    return undefined
  }

  // Format address for display
  const formatAddress = (address: string | undefined | null) => {
    if (!address) return 'Not connected'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Copy to clipboard
  const copyToClipboard = (text: string | undefined | null) => {
    if (!text) return
      navigator.clipboard.writeText(text)
      toast({
        title: "Copied!",
      description: "Address copied to clipboard",
    })
  }

  // Execute winner declaration workflow
  const executeWinnerDeclarationWorkflow = async () => {
    if (!auction) return

    setIsExecuting(true)
    
    try {
      // Step 1: Winner Declaration
      await executeWinnerDeclarationStep()
      
      // Step 2: Confirmation
      await executeConfirmationStep()
      
      // Step 3: Completion
      await executeCompletionStep()
      
      onExecutionComplete()
      
    } catch (error) {
      console.error('❌ Winner declaration workflow failed:', error)
      toast({
        title: "Declaration Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      })
    } finally {
      setIsExecuting(false)
    }
  }

  const executeWinnerDeclarationStep = async () => {
    updateStepStatus('winner-declaration', 'in-progress')
    
    try {
      console.log('🏆 Starting winner declaration step with auction:', auction)
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Update with success details
      updateStepStatus('winner-declaration', 'completed', {
        orderId: auction.orderId,
        winnerAddress: getWalletAddress(address ? { address } : stellarWallet),
        auctionType: auction.auctionType,
        finalPrice: auction.currentPrice || auction.finalPrice
      })
      
    } catch (error) {
      console.error('❌ Error in winner declaration step:', error)
      updateStepStatus('winner-declaration', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeConfirmationStep = async () => {
    updateStepStatus('confirmation', 'in-progress')
    
    try {
      console.log('✅ Starting confirmation step...')
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Update with confirmation details
      updateStepStatus('confirmation', 'completed', {
        confirmed: true,
        timestamp: new Date().toISOString(),
        orderId: auction.orderId
      })
      
    } catch (error) {
      console.error('❌ Error in confirmation step:', error)
      updateStepStatus('confirmation', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeCompletionStep = async () => {
    updateStepStatus('completion', 'in-progress')
    
    try {
      console.log('🎉 Starting completion step...')
      
      // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000))
    
      // Update with completion details
      updateStepStatus('completion', 'completed', {
        completed: true,
        timestamp: new Date().toISOString(),
        orderId: auction.orderId,
        winnerAddress: getWalletAddress(address ? { address } : stellarWallet)
      })
      
    } catch (error) {
      console.error('❌ Error in completion step:', error)
      updateStepStatus('completion', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  // Get step icon
  const getStepIcon = (step: ExecutionStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'in-progress':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return <Clock className="w-5 h-5 text-gray-400" />
    }
  }

  // Get step status color
  const getStepStatusColor = (step: ExecutionStep) => {
    switch (step.status) {
      case 'completed':
        return 'text-green-600'
      case 'in-progress':
        return 'text-blue-600'
      case 'failed':
        return 'text-red-600'
      default:
        return 'text-gray-500'
    }
  }

  // Initialize steps when modal opens
  useEffect(() => {
    if (isOpen) {
      initializeExecutionSteps()
      setCurrentStep(0)
      setIsExecuting(false)
      setExecutionDetails(null)
    }
  }, [isOpen])

  // Start execution when modal opens
  useEffect(() => {
    if (isOpen && !isExecuting) {
      executeWinnerDeclarationWorkflow()
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            Winner Declaration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Auction Information */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg border border-purple-200">
            <h3 className="font-semibold text-purple-900 mb-2">Auction Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Order ID:</span>
                <div className="font-mono text-purple-700">{auction?.orderId || 'N/A'}</div>
              </div>
              <div>
                <span className="text-gray-600">Auction Type:</span>
                <div className="font-medium text-purple-700">{auction?.auctionType || 'N/A'}</div>
              </div>
              <div>
                <span className="text-gray-600">Winner Address:</span>
                <div className="font-mono text-purple-700">
                  {formatAddress(getWalletAddress(address ? { address } : stellarWallet))}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Final Price:</span>
                <div className="font-medium text-purple-700">{auction?.currentPrice || auction?.finalPrice || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Execution Steps */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Winner Declaration Progress</h3>
              {executionSteps.map((step, index) => (
                <motion.div
                  key={step.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                className={`p-4 rounded-lg border ${
                  step.status === 'completed' ? 'bg-green-50 border-green-200' :
                  step.status === 'in-progress' ? 'bg-blue-50 border-blue-200' :
                  step.status === 'failed' ? 'bg-red-50 border-red-200' :
                  'bg-gray-50 border-gray-200'
                }`}
                >
                  <div className="flex items-center gap-3">
                    {getStepIcon(step)}
                    <div className="flex-1">
                    <h4 className={`font-medium ${getStepStatusColor(step)}`}>
                      {step.title}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {step.description}
                    </p>
                      {step.details && (
                        <div className="mt-2 text-xs text-gray-500">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(step.details, null, 2)}
                        </pre>
                        </div>
                      )}
                      {step.error && (
                      <div className="mt-2 text-xs text-red-500">
                        Error: {step.error}
                    </div>
                    )}
                  </div>
                  </div>
                </motion.div>
              ))}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isExecuting}
            >
              Close
            </Button>
            {executionSteps.every(step => step.status === 'completed') && (
            <Button
                onClick={onExecutionComplete}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 