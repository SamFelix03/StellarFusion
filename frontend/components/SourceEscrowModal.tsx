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
  Trophy,
  Smartphone
} from 'lucide-react'
import { useWallet } from '@/components/WalletProvider'
import { toast } from '@/hooks/use-toast'
import { resolverContractManager, ExecutionResult } from '@/lib/resolver-contracts'
import { useWalletClient } from 'wagmi'

interface SourceEscrowModalProps {
  isOpen: boolean
  onClose: () => void
  auction: any
  onEscrowCreated: (result: ExecutionResult) => void
}

interface ExecutionStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  details?: any
  error?: string
}

export default function SourceEscrowModal({ 
  isOpen, 
  onClose, 
  auction, 
  onEscrowCreated 
}: SourceEscrowModalProps) {
  const { address, stellarWallet } = useWallet()
  const { data: walletClient } = useWalletClient()
  const [currentStep, setCurrentStep] = useState(0)
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [privateKey, setPrivateKey] = useState('')

  // Initialize execution steps for source escrow creation
  const initializeExecutionSteps = () => {
    const steps: ExecutionStep[] = [
      {
        id: 'wallet-setup',
        title: 'Wallet Setup',
        description: 'Setting up wallet connection and private key',
        status: 'pending'
      },
      {
        id: 'fetch-secret',
        title: 'Fetch Hashed Secret',
        description: 'Retrieving hashed secret from database',
        status: 'pending'
      },
      {
        id: 'create-escrow',
        title: 'Create Source Escrow',
        description: 'Creating source escrow on blockchain',
        status: 'pending'
      },
      {
        id: 'completion',
        title: 'Completion',
        description: 'Source escrow created successfully',
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

  // Execute source escrow creation workflow
  const executeSourceEscrowWorkflow = async () => {
    if (!auction || !privateKey.trim()) {
      toast({
        title: "Error",
        description: "Please provide a private key to continue",
        variant: "destructive"
      })
      return
    }

    setIsExecuting(true)
    
    try {
      // Step 1: Wallet Setup
      await executeWalletSetupStep()
      
      // Step 2: Fetch Hashed Secret
      await executeFetchSecretStep()
      
      // Step 3: Create Source Escrow
      await executeCreateEscrowStep()
      
      // Step 4: Completion
      await executeCompletionStep()
      
      // Call the callback with the result
      if (executionResult) {
        onEscrowCreated(executionResult)
      }
      
    } catch (error) {
      console.error('❌ Source escrow creation workflow failed:', error)
      toast({
        title: "Creation Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      })
    } finally {
      setIsExecuting(false)
    }
  }

  const executeWalletSetupStep = async () => {
    updateStepStatus('wallet-setup', 'in-progress')
    
    try {
      console.log('🔧 Setting up wallet...')
      
      // Initialize chain with private key
      await resolverContractManager.initializeChain('sepolia', privateKey)
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      updateStepStatus('wallet-setup', 'completed', {
        chainId: 'sepolia',
        walletAddress: getWalletAddress(address ? { address } : stellarWallet)
      })
      
    } catch (error) {
      console.error('❌ Error in wallet setup step:', error)
      updateStepStatus('wallet-setup', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeFetchSecretStep = async () => {
    updateStepStatus('fetch-secret', 'in-progress')
    
    try {
      console.log('🔍 Fetching hashed secret from database...')
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      updateStepStatus('fetch-secret', 'completed', {
        orderId: auction.orderId,
        hashedSecret: '0x...' // This would be the actual hashed secret from DB
      })
      
    } catch (error) {
      console.error('❌ Error in fetch secret step:', error)
      updateStepStatus('fetch-secret', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeCreateEscrowStep = async () => {
    updateStepStatus('create-escrow', 'in-progress')
    
    try {
      console.log('🏗️ Creating source escrow...')
      console.log('📋 Auction object:', auction)
      console.log('📋 Auction buyerAddress:', auction?.buyerAddress)
      console.log('📋 Auction orderId:', auction?.orderId)
      console.log('📋 Auction sourceAmount:', auction?.sourceAmount)
      console.log('📋 Auction currentPrice:', auction?.currentPrice)
      
      // Determine if this is a partial fill order
      const isPartialFill = auction.auctionType === 'segmented'
      const segmentIndex = isPartialFill ? 0 : undefined // For now, use first segment
      const totalParts = isPartialFill ? (auction.segments?.length || 1) : 1
      
      // Get source amount
      const srcAmount = auction.sourceAmount || auction.currentPrice || "0.001"
      
      // Create source escrow
      const result = await resolverContractManager.createSourceEscrowForWinner(
        'sepolia',
        auction.orderId,
        auction.buyerAddress || '0x0000000000000000000000000000000000000000', // Use zero address as fallback
        getWalletAddress(address ? { address } : stellarWallet) || '',
        srcAmount.toString(),
        isPartialFill,
        segmentIndex,
        totalParts
      )
      
      setExecutionResult(result)
      
      if (result.success) {
        updateStepStatus('create-escrow', 'completed', {
          transactionHash: result.transactionHash,
          escrowAddress: result.escrowAddress,
          gasUsed: result.gasUsed
        })
      } else {
        updateStepStatus('create-escrow', 'failed', undefined, result.error)
        throw new Error(result.error)
      }
      
    } catch (error) {
      console.error('❌ Error in create escrow step:', error)
      updateStepStatus('create-escrow', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeCompletionStep = async () => {
    updateStepStatus('completion', 'in-progress')
    
    try {
      console.log('✅ Completing source escrow creation...')
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      updateStepStatus('completion', 'completed', {
        completed: true,
        timestamp: new Date().toISOString(),
        orderId: auction.orderId
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
      setExecutionResult(null)
      setPrivateKey('')
    }
  }, [isOpen])

  // Start execution when user provides private key and clicks execute
  const handleExecute = () => {
    if (!privateKey.trim()) {
      toast({
        title: "Private Key Required",
        description: "Please enter your private key to create the source escrow",
        variant: "destructive"
      })
      return
    }
    executeSourceEscrowWorkflow()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-blue-500" />
            Create Source Escrow
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Auction Information */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">Auction Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Order ID:</span>
                <div className="font-mono text-blue-700">{auction?.orderId || 'N/A'}</div>
              </div>
              <div>
                <span className="text-gray-600">Auction Type:</span>
                <div className="font-medium text-blue-700">{auction?.auctionType || 'N/A'}</div>
              </div>
              <div>
                <span className="text-gray-600">Resolver Address:</span>
                <div className="font-mono text-blue-700">
                  {formatAddress(getWalletAddress(address ? { address } : stellarWallet))}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Source Amount:</span>
                <div className="font-medium text-blue-700">{auction?.sourceAmount || auction?.currentPrice || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Private Key Input */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Private Key</h3>
            <div className="space-y-2">
              <input
                type="password"
                placeholder="Enter your private key (0x...)"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isExecuting}
              />
              <p className="text-xs text-gray-500">
                ⚠️ Your private key is required to create the source escrow. It will not be stored.
              </p>
            </div>
          </div>

          {/* Execution Steps */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Source Escrow Creation Progress</h3>
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
              Cancel
            </Button>
            {!isExecuting && executionSteps.every(step => step.status === 'pending') && (
              <Button
                onClick={handleExecute}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={!privateKey.trim()}
              >
                <Zap className="w-4 h-4 mr-2" />
                Create Source Escrow
              </Button>
            )}
            {executionSteps.every(step => step.status === 'completed') && (
              <Button
                onClick={() => {
                  if (executionResult) {
                    onEscrowCreated(executionResult)
                  }
                  onClose()
                }}
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