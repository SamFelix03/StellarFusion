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
  Key
} from 'lucide-react'
import { useWallet } from '@/components/WalletProvider'
import { ethers } from 'ethers'
import { toast } from '@/hooks/use-toast'
import { resolverContractManager, ExecutionResult } from '@/lib/resolver-contracts'

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

interface ContractCall {
  contract: string
  function: string
  parameters: any[]
  value?: string
  gasLimit?: number
  gasPrice?: string
  chainType?: 'evm' | 'stellar'
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
  const [contractCalls, setContractCalls] = useState<ContractCall[]>([])

  // Initialize execution steps when modal opens
  useEffect(() => {
    if (isOpen && auction) {
      console.log('🔍 ResolverExecutionModal received auction data:', auction)
      initializeExecutionSteps()
    }
  }, [isOpen, auction])

  const initializeExecutionSteps = () => {
    const steps: ExecutionStep[] = [
      {
        id: 'preparation',
        title: 'Preparation & Validation',
        description: 'Validating order details and preparing wallets',
        status: 'pending'
      },
      {
        id: 'source-escrow',
        title: 'Create Source Escrow',
        description: 'Creating escrow on source chain',
        status: 'pending'
      },
      {
        id: 'destination-escrow',
        title: 'Create Destination Escrow',
        description: 'Creating escrow on destination chain',
        status: 'pending'
      },
      {
        id: 'wait-timelock',
        title: 'Wait for Withdrawal Window',
        description: 'Waiting for timelock to expire',
        status: 'pending'
      },
      {
        id: 'source-withdrawal',
        title: 'Withdraw from Source Escrow',
        description: 'Resolver withdraws source tokens',
        status: 'pending'
      },
      {
        id: 'destination-withdrawal',
        title: 'Withdraw from Destination Escrow',
        description: 'Buyer withdraws destination tokens',
        status: 'pending'
      },
      {
        id: 'completion',
        title: 'Execution Complete',
        description: 'Swap successfully completed',
        status: 'pending'
      }
    ]
    setExecutionSteps(steps)
    setCurrentStep(0)
    setIsExecuting(false)
    setExecutionDetails(null)
    setContractCalls([])
  }

  const updateStepStatus = (stepId: string, status: ExecutionStep['status'], details?: any, error?: string) => {
    setExecutionSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status, details, error }
        : step
    ))
  }

  const addContractCall = (call: ContractCall) => {
    setContractCalls(prev => [...prev, call])
  }

  const determineChainTypes = () => {
    if (!auction) {
      return {
        isSourceStellar: false,
        isDestinationStellar: false,
        swapType: 'EVM → EVM'
      }
    }
    
    // Determine if source and destination are Stellar or EVM
    const isSourceStellar = auction.orderType === 'partialfill' || auction.sourceChain?.includes('stellar') || auction.fromChain?.includes('stellar')
    const isDestinationStellar = auction.orderType === 'partialfill' || auction.destinationChain?.includes('stellar') || auction.toChain?.includes('stellar')
    
    return {
      isSourceStellar,
      isDestinationStellar,
      swapType: `${isSourceStellar ? 'Stellar' : 'EVM'} → ${isDestinationStellar ? 'Stellar' : 'EVM'}`
    }
  }

  const getWalletForChain = (isStellar: boolean) => {
    if (isStellar) {
      return stellarWallet
    } else {
      return { address }
    }
  }

  const formatAmount = (amount: number | undefined | null, decimals: number = 18) => {
    if (amount === undefined || amount === null) {
      return '0'
    }
    try {
      return ethers.utils.formatUnits(ethers.BigNumber.from(amount), decimals)
    } catch (error) {
      console.error('Error formatting amount:', error, 'Amount:', amount)
      return '0'
    }
  }

  const formatAddress = (address: string | undefined | null) => {
    if (!address) {
      return 'Not Connected'
    }
    if (address.length <= 10) {
      return address
    }
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const copyToClipboard = (text: string | undefined | null) => {
    if (!text) {
      toast({
        title: "Nothing to copy",
        description: "No address available to copy",
        variant: "destructive"
      })
      return
    }
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied to clipboard",
      description: "Address copied successfully",
    })
  }

  const executeResolverWorkflow = async () => {
    if (!auction) return

    setIsExecuting(true)
    const chainTypes = determineChainTypes()
    
    try {
      // Step 1: Preparation & Validation
      await executePreparationStep(chainTypes)
      
      // Step 2: Create Source Escrow
      await executeSourceEscrowStep(chainTypes)
      
      // Step 3: Create Destination Escrow
      await executeDestinationEscrowStep(chainTypes)
      
      // Step 4: Wait for Withdrawal Window
      await executeWaitStep()
      
      // Step 5: Source Withdrawal
      await executeSourceWithdrawalStep(chainTypes)
      
      // Step 6: Destination Withdrawal
      await executeDestinationWithdrawalStep(chainTypes)
      
      // Step 7: Completion
      await executeCompletionStep()
      
      onExecutionComplete()
      
    } catch (error) {
      console.error('❌ Resolver workflow failed:', error)
      toast({
        title: "Execution Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      })
    } finally {
      setIsExecuting(false)
    }
  }

  const executePreparationStep = async (chainTypes: any) => {
    updateStepStatus('preparation', 'in-progress')
    
    try {
      // Validate wallets are connected
      const sourceWallet = getWalletForChain(chainTypes.isSourceStellar)
      const destinationWallet = getWalletForChain(chainTypes.isDestinationStellar)
      
      if (!sourceWallet?.address || !destinationWallet?.address) {
        throw new Error('Both source and destination wallets must be connected')
      }
      
      // Validate order details using contract manager
      if (!resolverContractManager.validateOrderDetails(auction)) {
        throw new Error('Invalid order details')
      }
      
             const details = {
         sourceWallet: sourceWallet.address,
         destinationWallet: destinationWallet.address,
         swapType: chainTypes.swapType,
         orderId: auction.orderId || 'default-order-id',
         sourceAmount: formatAmount(auction.sourceAmount || auction.amount),
         destinationAmount: formatAmount(auction.destinationAmount || auction.currentPrice),
         hashedSecret: auction.hashedSecret || 'Generated during execution'
       }
      
      updateStepStatus('preparation', 'completed', details)
      setCurrentStep(1)
      
    } catch (error) {
      console.error('❌ Error in preparation step:', error)
      updateStepStatus('preparation', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeSourceEscrowStep = async (chainTypes: any) => {
    updateStepStatus('source-escrow', 'in-progress')
    
    const sourceWallet = getWalletForChain(chainTypes.isSourceStellar)
    
    try {
      if (chainTypes.isSourceStellar) {
        // Stellar source escrow creation
                 const stellarCall: ContractCall = {
           contract: 'Stellar Factory Contract',
           function: 'createSrcEscrow',
           parameters: [
             auction.buyerAddress || sourceWallet.address,
             sourceWallet.address,
             auction.hashedSecret || 'default-hash',
             auction.sourceAmount || auction.amount || 0,
             auction.withdrawalStart || Math.floor(Date.now() / 1000) + 60,
             auction.publicWithdrawalStart || Math.floor(Date.now() / 1000) + 120,
             auction.cancellationStart || Math.floor(Date.now() / 1000) + 180,
             auction.publicCancellationStart || Math.floor(Date.now() / 1000) + 240,
             0, // partIndex
             1  // totalParts
           ],
           value: '0.001 XLM',
           chainType: 'stellar'
         }
        addContractCall(stellarCall)
        
                 const result: ExecutionResult = await resolverContractManager.createSourceEscrowStellar(
           auction.buyerAddress || sourceWallet.address,
           sourceWallet.address,
           auction.hashedSecret || 'default-hash',
           auction.sourceAmount || auction.amount || 0,
           {
             withdrawalStart: auction.withdrawalStart || Math.floor(Date.now() / 1000) + 60,
             publicWithdrawalStart: auction.publicWithdrawalStart || Math.floor(Date.now() / 1000) + 120,
             cancellationStart: auction.cancellationStart || Math.floor(Date.now() / 1000) + 180,
             publicCancellationStart: auction.publicCancellationStart || Math.floor(Date.now() / 1000) + 240
           }
         )
        
        if (result.success) {
                     updateStepStatus('source-escrow', 'completed', {
             escrowAddress: result.escrowAddress,
             transactionHash: result.transactionHash,
             amount: formatAmount(auction.sourceAmount || auction.amount),
             recipient: sourceWallet.address,
             ...result.details
           })
        } else {
          updateStepStatus('source-escrow', 'failed', undefined, result.error)
          throw new Error(result.error)
        }
        
      } else {
        // EVM source escrow creation
                 const evmCall: ContractCall = {
           contract: 'LOP Contract',
           function: 'fillOrder',
           parameters: [
             auction.orderId || 'default-order-id',
             auction.buyerAddress || sourceWallet.address,
             sourceWallet.address,
             auction.sourceAmount || auction.amount || 0,
             auction.hashedSecret || 'default-hash',
             auction.withdrawalStart || Math.floor(Date.now() / 1000) + 60,
             auction.publicWithdrawalStart || Math.floor(Date.now() / 1000) + 120,
             auction.cancellationStart || Math.floor(Date.now() / 1000) + 180,
             auction.publicCancellationStart || Math.floor(Date.now() / 1000) + 240,
             0, // partIndex
             1  // totalParts
           ],
           value: ethers.utils.parseEther('0.001').toString(),
           gasLimit: 500000,
           gasPrice: ethers.utils.parseUnits('15', 'gwei').toString(),
           chainType: 'evm'
         }
        addContractCall(evmCall)
        
                 const result: ExecutionResult = await resolverContractManager.createSourceEscrowEVM(
           'sepolia', // Replace with actual source chain
           auction.orderId || 'default-order-id',
           auction.buyerAddress || sourceWallet.address,
           sourceWallet.address,
           ethers.BigNumber.from(auction.sourceAmount || auction.amount || 0),
           auction.hashedSecret || 'default-hash',
           {
             withdrawalStart: auction.withdrawalStart || Math.floor(Date.now() / 1000) + 60,
             publicWithdrawalStart: auction.publicWithdrawalStart || Math.floor(Date.now() / 1000) + 120,
             cancellationStart: auction.cancellationStart || Math.floor(Date.now() / 1000) + 180,
             publicCancellationStart: auction.publicCancellationStart || Math.floor(Date.now() / 1000) + 240
           }
         )
        
        if (result.success) {
                     updateStepStatus('source-escrow', 'completed', {
             escrowAddress: result.escrowAddress,
             transactionHash: result.transactionHash,
             amount: formatAmount(auction.sourceAmount || auction.amount),
             recipient: sourceWallet.address,
             gasUsed: result.gasUsed?.toLocaleString(),
             gasPrice: '15 gwei',
             ...result.details
           })
        } else {
          updateStepStatus('source-escrow', 'failed', undefined, result.error)
          throw new Error(result.error)
        }
      }
      
      setCurrentStep(2)
      
    } catch (error) {
      console.error('❌ Error in source escrow step:', error)
      updateStepStatus('source-escrow', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeDestinationEscrowStep = async (chainTypes: any) => {
    updateStepStatus('destination-escrow', 'in-progress')
    
    const destinationWallet = getWalletForChain(chainTypes.isDestinationStellar)
    
    try {
      if (chainTypes.isDestinationStellar) {
        // Stellar destination escrow creation
                 const stellarCall: ContractCall = {
           contract: 'Stellar Factory Contract',
           function: 'createDstEscrow',
           parameters: [
             auction.hashedSecret || 'default-hash',
             auction.buyerAddress || sourceWallet.address,
             auction.destinationAmount || auction.currentPrice || 0,
             auction.withdrawalStart || Math.floor(Date.now() / 1000) + 60,
             auction.publicWithdrawalStart || Math.floor(Date.now() / 1000) + 120,
             auction.cancellationStart || Math.floor(Date.now() / 1000) + 180,
             0, // partIndex
             1  // totalParts
           ],
           value: '0.001 XLM',
           chainType: 'stellar'
         }
        addContractCall(stellarCall)
        
                 const result: ExecutionResult = await resolverContractManager.createDestinationEscrowStellar(
           auction.hashedSecret || 'default-hash',
           auction.buyerAddress || sourceWallet.address,
           auction.destinationAmount || auction.currentPrice || 0,
           {
             withdrawalStart: auction.withdrawalStart || Math.floor(Date.now() / 1000) + 60,
             publicWithdrawalStart: auction.publicWithdrawalStart || Math.floor(Date.now() / 1000) + 120,
             cancellationStart: auction.cancellationStart || Math.floor(Date.now() / 1000) + 180
           }
         )
        
        if (result.success) {
                     updateStepStatus('destination-escrow', 'completed', {
             escrowAddress: result.escrowAddress,
             transactionHash: result.transactionHash,
             amount: formatAmount(auction.destinationAmount || auction.currentPrice),
             recipient: auction.buyerAddress || sourceWallet.address,
             ...result.details
           })
        } else {
          updateStepStatus('destination-escrow', 'failed', undefined, result.error)
          throw new Error(result.error)
        }
        
      } else {
        // EVM destination escrow creation
                 const evmCall: ContractCall = {
           contract: 'Factory Contract',
           function: 'createDstEscrow',
           parameters: [
             auction.hashedSecret || 'default-hash',
             auction.buyerAddress || sourceWallet.address,
             auction.destinationAmount || auction.currentPrice || 0,
             auction.withdrawalStart || Math.floor(Date.now() / 1000) + 60,
             auction.publicWithdrawalStart || Math.floor(Date.now() / 1000) + 120,
             auction.cancellationStart || Math.floor(Date.now() / 1000) + 180,
             0, // partIndex
             1  // totalParts
           ],
           value: ethers.utils.parseEther('0.001').toString(),
           gasLimit: 2000000,
           gasPrice: ethers.utils.parseUnits('2', 'gwei').toString(),
           chainType: 'evm'
         }
        addContractCall(evmCall)
        
                 const result: ExecutionResult = await resolverContractManager.createDestinationEscrowEVM(
           'sepolia', // Replace with actual destination chain
           auction.hashedSecret || 'default-hash',
           auction.buyerAddress || sourceWallet.address,
           ethers.BigNumber.from(auction.destinationAmount || auction.currentPrice || 0),
           {
             withdrawalStart: auction.withdrawalStart || Math.floor(Date.now() / 1000) + 60,
             publicWithdrawalStart: auction.publicWithdrawalStart || Math.floor(Date.now() / 1000) + 120,
             cancellationStart: auction.cancellationStart || Math.floor(Date.now() / 1000) + 180
           }
         )
        
        if (result.success) {
                     updateStepStatus('destination-escrow', 'completed', {
             escrowAddress: result.escrowAddress,
             transactionHash: result.transactionHash,
             amount: formatAmount(auction.destinationAmount || auction.currentPrice),
             recipient: auction.buyerAddress || sourceWallet.address,
             gasUsed: result.gasUsed?.toLocaleString(),
             gasPrice: '2 gwei',
             ...result.details
           })
        } else {
          updateStepStatus('destination-escrow', 'failed', undefined, result.error)
          throw new Error(result.error)
        }
      }
      
      setCurrentStep(3)
      
    } catch (error) {
      console.error('❌ Error in destination escrow step:', error)
      updateStepStatus('destination-escrow', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeWaitStep = async () => {
    updateStepStatus('wait-timelock', 'in-progress')
    
    try {
      const currentTime = Math.floor(Date.now() / 1000)
      const withdrawalStart = auction.withdrawalStart || (currentTime + 60)
      const timeToWait = Math.max(0, withdrawalStart - currentTime)
      
      if (timeToWait > 0) {
        const details = {
          currentTime: new Date(currentTime * 1000).toISOString(),
          withdrawalStart: new Date(withdrawalStart * 1000).toISOString(),
          timeToWait: `${timeToWait} seconds`
        }
        
        updateStepStatus('wait-timelock', 'in-progress', details)
        
        // Use the contract manager to wait for withdrawal window
        await resolverContractManager.waitForWithdrawalWindow(withdrawalStart)
      }
      
      updateStepStatus('wait-timelock', 'completed', { message: 'Withdrawal window is now open' })
      setCurrentStep(4)
      
    } catch (error) {
      console.error('❌ Error in wait step:', error)
      updateStepStatus('wait-timelock', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeSourceWithdrawalStep = async (chainTypes: any) => {
    updateStepStatus('source-withdrawal', 'in-progress')
    
    const sourceWallet = getWalletForChain(chainTypes.isSourceStellar)
    
    try {
      if (chainTypes.isSourceStellar) {
        // Stellar source withdrawal
                 const stellarCall: ContractCall = {
           contract: 'Stellar Escrow Contract',
           function: 'withdraw',
           parameters: [auction.secret || 'default-secret'],
           value: '0',
           chainType: 'stellar'
         }
        addContractCall(stellarCall)
        
                 const result: ExecutionResult = await resolverContractManager.withdrawFromStellarEscrow(
           'source-escrow-address', // This would be the actual escrow address
           auction.secret || 'default-secret'
         )
        
        if (result.success) {
                     updateStepStatus('source-withdrawal', 'completed', {
             escrowAddress: 'Source Stellar Escrow',
             transactionHash: result.transactionHash,
             amount: formatAmount(auction.sourceAmount || auction.amount),
             recipient: sourceWallet.address,
             secret: auction.secret || 'default-secret',
             ...result.details
           })
        } else {
          updateStepStatus('source-withdrawal', 'failed', undefined, result.error)
          throw new Error(result.error)
        }
        
      } else {
        // EVM source withdrawal
                 const evmCall: ContractCall = {
           contract: 'Source Escrow Contract',
           function: 'withdraw',
           parameters: [auction.secret || 'default-secret'],
           value: '0',
           gasLimit: 150000,
           gasPrice: ethers.utils.parseUnits('15', 'gwei').toString(),
           chainType: 'evm'
         }
        addContractCall(evmCall)
        
                 const result: ExecutionResult = await resolverContractManager.withdrawFromSourceEscrowEVM(
           'sepolia', // Replace with actual source chain
           'source-escrow-address', // This would be the actual escrow address
           auction.secret || 'default-secret'
         )
        
        if (result.success) {
                     updateStepStatus('source-withdrawal', 'completed', {
             escrowAddress: 'Source EVM Escrow',
             transactionHash: result.transactionHash,
             amount: formatAmount(auction.sourceAmount || auction.amount),
             recipient: sourceWallet.address,
             secret: auction.secret || 'default-secret',
             gasUsed: result.gasUsed?.toLocaleString(),
             gasPrice: '15 gwei',
             ...result.details
           })
        } else {
          updateStepStatus('source-withdrawal', 'failed', undefined, result.error)
          throw new Error(result.error)
        }
      }
      
      setCurrentStep(5)
      
    } catch (error) {
      console.error('❌ Error in source withdrawal step:', error)
      updateStepStatus('source-withdrawal', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeDestinationWithdrawalStep = async (chainTypes: any) => {
    updateStepStatus('destination-withdrawal', 'in-progress')
    
    const destinationWallet = getWalletForChain(chainTypes.isDestinationStellar)
    
    try {
      if (chainTypes.isDestinationStellar) {
        // Stellar destination withdrawal
                 const stellarCall: ContractCall = {
           contract: 'Stellar Destination Escrow',
           function: 'withdraw',
           parameters: [auction.secret || 'default-secret'],
           value: '0',
           chainType: 'stellar'
         }
        addContractCall(stellarCall)
        
                 const result: ExecutionResult = await resolverContractManager.withdrawFromStellarEscrow(
           'destination-escrow-address', // This would be the actual escrow address
           auction.secret || 'default-secret'
         )
        
        if (result.success) {
                     updateStepStatus('destination-withdrawal', 'completed', {
             escrowAddress: 'Destination Stellar Escrow',
             transactionHash: result.transactionHash,
             amount: formatAmount(auction.destinationAmount || auction.currentPrice),
             recipient: auction.buyerAddress || sourceWallet.address,
             secret: auction.secret || 'default-secret',
             ...result.details
           })
        } else {
          updateStepStatus('destination-withdrawal', 'failed', undefined, result.error)
          throw new Error(result.error)
        }
        
      } else {
        // EVM destination withdrawal
                 const evmCall: ContractCall = {
           contract: 'Destination Escrow Contract',
           function: 'withdraw',
           parameters: [auction.secret || 'default-secret'],
           value: '0',
           gasLimit: 150000,
           gasPrice: ethers.utils.parseUnits('2', 'gwei').toString(),
           chainType: 'evm'
         }
        addContractCall(evmCall)
        
                 const result: ExecutionResult = await resolverContractManager.withdrawFromDestinationEscrowEVM(
           'sepolia', // Replace with actual destination chain
           'destination-escrow-address', // This would be the actual escrow address
           auction.secret || 'default-secret'
         )
        
        if (result.success) {
                     updateStepStatus('destination-withdrawal', 'completed', {
             escrowAddress: 'Destination EVM Escrow',
             transactionHash: result.transactionHash,
             amount: formatAmount(auction.destinationAmount || auction.currentPrice),
             recipient: auction.buyerAddress || sourceWallet.address,
             secret: auction.secret || 'default-secret',
             gasUsed: result.gasUsed?.toLocaleString(),
             gasPrice: '2 gwei',
             ...result.details
           })
        } else {
          updateStepStatus('destination-withdrawal', 'failed', undefined, result.error)
          throw new Error(result.error)
        }
      }
      
      setCurrentStep(6)
      
    } catch (error) {
      console.error('❌ Error in destination withdrawal step:', error)
      updateStepStatus('destination-withdrawal', 'failed', undefined, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  const executeCompletionStep = async () => {
    updateStepStatus('completion', 'in-progress')
    
    // Simulate final verification
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const details = {
      totalGasUsed: '2,940,000',
      totalCost: '0.0441 ETH',
      executionTime: '15 seconds',
      success: true
    }
    
    updateStepStatus('completion', 'completed', details)
    
    toast({
      title: "Swap Execution Complete!",
      description: "The cross-chain swap has been successfully executed.",
    })
  }

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

  const getStepStatusColor = (step: ExecutionStep) => {
    switch (step.status) {
      case 'completed':
        return 'border-green-200 bg-green-50'
      case 'in-progress':
        return 'border-blue-200 bg-blue-50'
      case 'failed':
        return 'border-red-200 bg-red-50'
      default:
        return 'border-gray-200 bg-gray-50'
    }
  }

  if (!auction) {
    console.error('❌ No auction data provided to ResolverExecutionModal')
    return null
  }

  const chainTypes = determineChainTypes()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-2xl border border-white/50">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-black flex items-center gap-3">
            <Zap className="w-6 h-6 text-blue-600" />
            Resolver Execution Workflow
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Summary */}
          <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-xl p-4">
            <h3 className="text-lg font-semibold text-black mb-3 flex items-center gap-2">
              <Network className="w-5 h-5 text-purple-600" />
              Order Summary
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Order ID</p>
                <p className="font-mono text-black">{formatAddress(auction.orderId)}</p>
              </div>
              <div>
                <p className="text-gray-600">Swap Type</p>
                <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                  {chainTypes.swapType}
                </Badge>
              </div>
                             <div>
                 <p className="text-gray-600">Source Amount</p>
                 <p className="font-semibold text-black">
                   {formatAmount(auction.sourceAmount || auction.amount)} {auction.sourceToken || auction.tokenSymbol || 'ETH'}
                 </p>
               </div>
               <div>
                 <p className="text-gray-600">Destination Amount</p>
                 <p className="font-semibold text-black">
                   {formatAmount(auction.destinationAmount || auction.currentPrice)} {auction.destinationToken || 'XLM'}
                 </p>
               </div>
            </div>
          </div>

          {/* Wallet Status */}
          <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-xl p-4">
            <h3 className="text-lg font-semibold text-black mb-3 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-600" />
              Wallet Status
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Source Wallet ({chainTypes.isSourceStellar ? 'Stellar' : 'EVM'})</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-black">
                    {formatAddress(getWalletForChain(chainTypes.isSourceStellar)?.address || 'Not Connected')}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(getWalletForChain(chainTypes.isSourceStellar)?.address || '')}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-gray-600">Destination Wallet ({chainTypes.isDestinationStellar ? 'Stellar' : 'EVM'})</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-black">
                    {formatAddress(getWalletForChain(chainTypes.isDestinationStellar)?.address || 'Not Connected')}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(getWalletForChain(chainTypes.isDestinationStellar)?.address || '')}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Execution Steps */}
          <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-xl p-4">
            <h3 className="text-lg font-semibold text-black mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Execution Steps
            </h3>
            <div className="space-y-3">
              {executionSteps.map((step, index) => (
                <motion.div
                  key={step.id}
                  className={`p-3 rounded-lg border ${getStepStatusColor(step)} transition-all duration-300`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex items-center gap-3">
                    {getStepIcon(step)}
                    <div className="flex-1">
                      <h4 className="font-semibold text-black">{step.title}</h4>
                      <p className="text-sm text-gray-600">{step.description}</p>
                      {step.details && (
                        <div className="mt-2 text-xs text-gray-500">
                          {Object.entries(step.details).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="capitalize">{key}:</span>
                              <span className="font-mono">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {step.error && (
                        <p className="mt-2 text-xs text-red-500">{step.error}</p>
                      )}
                    </div>
                    {index < currentStep && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Contract Calls */}
          {contractCalls.length > 0 && (
            <div className="bg-white/50 backdrop-blur-xl border border-white/50 rounded-xl p-4">
              <h3 className="text-lg font-semibold text-black mb-3 flex items-center gap-2">
                <Coins className="w-5 h-5 text-orange-600" />
                Contract Calls ({contractCalls.length})
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {contractCalls.map((call, index) => (
                  <div key={index} className="p-2 bg-black/5 rounded border text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{call.contract}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="font-mono">{call.function}</span>
                    </div>
                    <div className="text-gray-600">
                      <div>Parameters: {call.parameters.length}</div>
                      {call.value && <div>Value: {call.value}</div>}
                      {call.gasLimit && <div>Gas Limit: {call.gasLimit.toLocaleString()}</div>}
                      {call.gasPrice && <div>Gas Price: {call.gasPrice}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isExecuting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={executeResolverWorkflow}
              disabled={isExecuting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Execute Swap
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 