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
  Sparkles,
  Target,
  Building2,
  Lock,
  Unlock,
  ArrowUpDown
} from 'lucide-react'
import { useWallet } from '@/components/WalletProvider'
import { toast } from '@/hooks/use-toast'
import { resolverContractManager, ResolverOrderExecution, SourceEscrowParams, WithdrawalParams} from '@/lib/resolver-contracts'
import { useWalletClient } from 'wagmi'
import { ethers } from 'ethers'

interface ResolverExecutionModalProps {
  isOpen: boolean
  onClose: () => void
  auction: any
  segmentId?: number  // For partial fill orders, specify which segment to resolve
  onExecutionComplete: () => void
}

interface ExecutionStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  details?: any
  error?: string
  transactionHash?: string
  escrowAddress?: string
  icon: React.ReactNode
}

export default function ResolverExecutionModal({ 
  isOpen, 
  onClose, 
  auction, 
  segmentId,
  onExecutionComplete 
}: ResolverExecutionModalProps) {
  
  console.log('🔍 ResolverExecutionModal rendered with props:', {
    isOpen,
    auctionType: auction?.auctionType,
    segmentId,
    hasAuction: !!auction
  });
  const { address, stellarWallet } = useWallet()
  const { data: walletClient } = useWalletClient()
  const [currentStep, setCurrentStep] = useState(0)
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionDetails, setExecutionDetails] = useState<any>(null)
  const [currentExecutingStep, setCurrentExecutingStep] = useState<string | null>(null)

  // Initialize execution steps for complete resolver workflow
  const initializeExecutionSteps = () => {
    const steps: ExecutionStep[] = [
      {
        id: 'resolver-declared',
        title: 'Resolver Declared',
        description: 'You have been declared as the resolver for this order',
        status: 'pending',
        icon: <Trophy className="w-5 h-5" />
      },
      {
        id: 'source-escrow',
        title: 'Create Source Escrow',
        description: `Creating source escrow on ${auction?.fromChain || 'Source'} chain`,
        status: 'pending',
        icon: <Building2 className="w-5 h-5" />
      },
      {
        id: 'destination-escrow',
        title: 'Create Destination Escrow',
        description: `Creating destination escrow on ${auction?.toChain || 'Destination'} chain`,
        status: 'pending',
        icon: <Building2 className="w-5 h-5" />
      },
      {
        id: 'withdrawal-timer',
        title: 'Withdrawal Window',
        description: 'Waiting for withdrawal window to open (60 seconds)',
        status: 'pending',
        icon: <Timer className="w-5 h-5" />
      },
      {
        id: 'secret-request',
        title: 'Request Secret & Verify Escrows',
        description: 'Relayer verifies escrows and requests secret from buyer',
        status: 'pending',
        icon: <Key className="w-5 h-5" />
      },
      {
        id: 'source-withdrawal',
        title: 'Source Withdrawal',
        description: 'Withdrawing from source escrow (resolver receives tokens)',
        status: 'pending',
        icon: <Coins className="w-5 h-5" />
      },
      {
        id: 'destination-withdrawal',
        title: 'Destination Withdrawal',
        description: 'Withdrawing from destination escrow (buyer receives tokens)',
        status: 'pending',
        icon: <Coins className="w-5 h-5" />
      },
      {
        id: 'completion',
        title: 'Order Completed',
        description: 'Swap completed successfully!',
        status: 'pending',
        icon: <CheckCircle className="w-5 h-5" />
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

  // Execute a specific step
  const executeStep = async (stepId: string) => {
    console.log(`🚀 Starting execution of step: ${stepId}`, {
      segmentId,
      auctionType: auction?.auctionType,
      orderId: auction?.orderId
    });
    
    if (!auction || isExecuting) return

    setCurrentExecutingStep(stepId)
    setIsExecuting(true)
    
    try {
      switch (stepId) {
        case 'resolver-declared':
          await executeResolverDeclared()
          break
        case 'source-escrow':
          await executeSourceEscrow()
          break
        case 'destination-escrow':
          await executeDestinationEscrow()
          break
        case 'withdrawal-timer':
          await executeWithdrawalTimer()
          break
        case 'secret-request':
          await executeSecretRequest()
          break
        case 'source-withdrawal':
          await executeSourceWithdrawal()
          break
        case 'destination-withdrawal':
          await executeDestinationWithdrawal()
          break
        case 'completion':
          await executeCompletion()
          break
        default:
          throw new Error(`Unknown step: ${stepId}`)
      }
    } catch (error) {
      console.error(`❌ Error executing step ${stepId}:`, error)
      updateStepStatus(stepId, 'failed', { error: error instanceof Error ? error.message : 'Unknown error' })
      toast({
        title: `Step ${stepId} Failed`,
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      })
    } finally {
      setIsExecuting(false)
      setCurrentExecutingStep(null)
    }
  }

  // Step 1: Resolver Declared
  const executeResolverDeclared = async () => {
    updateStepStatus('resolver-declared', 'in-progress')
    
    // Simulate resolver declaration (this is already done when user clicks resolve)
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    updateStepStatus('resolver-declared', 'completed', {
      message: 'Resolver has been declared as the winner of this auction',
      timestamp: new Date().toISOString()
    })
  }

  // Step 2: Create Source Escrow
  const executeSourceEscrow = async () => {
    updateStepStatus('source-escrow', 'in-progress')
    
    // Get resolver address based on source chain (user is the resolver)
    const sourceChain = mapChainName(auction.fromChain)
    const destinationChain = mapChainName(auction.toChain)
    
    const resolverAddress = resolverContractManager.getResolverAddress(
      sourceChain,
      address, // MetaMask address for EVM chains
      stellarWallet?.publicKey // Freighter address for Stellar
    )
    
    if (!resolverAddress) {
      throw new Error('No resolver address available. Please connect your wallet.')
    }
    
    console.log(`🔗 Using resolver address: ${resolverAddress} for chain: ${sourceChain}`)
    
    // Create real signer objects
    let evmSigner: ethers.Signer | undefined = undefined
    let stellarSecretKey: string | undefined = undefined
    
    // Get EVM signer if needed (for EVM chains)
    if (sourceChain !== 'stellar-testnet' || destinationChain !== 'stellar-testnet') {
      if (!walletClient || !address) {
        throw new Error('MetaMask wallet not connected for EVM operations')
      }
      
      // Convert wagmi wallet client to ethers signer
      const provider = new ethers.providers.Web3Provider(walletClient.transport)
      evmSigner = provider.getSigner()
      console.log('🔗 Created EVM signer from connected wallet')
    }
    
    // Get Stellar credentials if needed
    if (sourceChain === 'stellar-testnet' || destinationChain === 'stellar-testnet') {
      if (!stellarWallet?.publicKey) {
        throw new Error('Freighter wallet not connected for Stellar operations')
      }
      
      console.log('🌟 Stellar wallet connected for operations')
      stellarSecretKey = stellarWallet.publicKey
    }
    
    // Use complete order data from database with proper buyer addresses for each chain
    const sourceBuyerAddress = getBuyerAddressForChain(auction, sourceChain)
    
    // Debug auction data to see what hashed secret fields are available
    console.log('🔍 Auction data for hashed secret:')
    console.log('  auction.hashedSecret:', auction.hashedSecret)
    console.log('  auction.secret:', auction.secret)
    console.log('  auction.orderId:', auction.orderId)
    console.log('  auction:', auction)
    
    // The hashed secret should come from the order details, not be randomly generated
    if (!auction.hashedSecret) {
      throw new Error('Hashed secret not found in auction data. This should come from the order details.')
    }
    
    const orderExecution: ResolverOrderExecution = {
      orderId: auction.orderId,
      sourceChain,
      destinationChain,
      sourceToken: auction.srcToken || auction.tokenSymbol || 'ETH',
      destinationToken: auction.dstToken || auction.tokenName || 'XLM',
      sourceAmount: auction.srcAmount?.toString() || auction.sourceAmount?.toString() || '0',
      destinationAmount: auction.dstAmount?.toString() || auction.currentPrice?.toString() || '0',
      buyerAddress: auction.buyerAddress,
      buyerEthAddress: auction.buyerEthAddress,
      buyerStellarAddress: auction.buyerStellarAddress,
      resolverAddress,
      hashedSecret: auction.hashedSecret,
      isPartialFill: auction.auctionType === 'segmented',
      segmentIndex: auction.auctionType === 'segmented' ? ((segmentId || 1) - 1) : 0, // Convert 1-based segmentId to 0-based index
      totalParts: auction.auctionType === 'segmented' ? (auction.segments?.length || 1) : 1,
      evmSigner,
      stellarWallet: stellarWallet,
      stellarSecretKey
    }
    
    console.log(`🔗 Using buyer address for source chain (${orderExecution.sourceChain}): ${sourceBuyerAddress}`)
    
    const sourceParams: SourceEscrowParams = {
      orderId: orderExecution.orderId,
      buyerAddress: sourceBuyerAddress,
      resolverAddress: orderExecution.resolverAddress,
      srcAmount: orderExecution.sourceAmount,
      hashedSecret: orderExecution.hashedSecret,
      isPartialFill: orderExecution.isPartialFill,
      segmentIndex: orderExecution.segmentIndex,
      totalParts: orderExecution.totalParts
    }
    
    // Create source escrow on the SOURCE chain using appropriate wallet
    const sourceResult = orderExecution.sourceChain === 'stellar-testnet'
      ? await resolverContractManager.createSourceEscrowStellar(orderExecution.sourceChain, sourceParams, stellarWallet)
      : await resolverContractManager.createSourceEscrowEVM(orderExecution.sourceChain, sourceParams, orderExecution.evmSigner!)
    
    if (!sourceResult.success) {
      throw new Error(`Source escrow creation failed: ${sourceResult.error}`)
    }
    
    updateStepStatus('source-escrow', 'completed', {
      escrowAddress: sourceResult.escrowAddress,
      transactionHash: sourceResult.transactionHash,
      message: `Source escrow created successfully on ${orderExecution.sourceChain}`
    })
    
    // Store the result for later steps
    setExecutionDetails((prev: any) => ({
      ...prev,
      sourceResult
    }))
  }

  // Step 3: Create Destination Escrow
  const executeDestinationEscrow = async () => {
    updateStepStatus('destination-escrow', 'in-progress')
    
    const sourceChain = mapChainName(auction.fromChain)
    const destinationChain = mapChainName(auction.toChain)
    
    const resolverAddress = resolverContractManager.getResolverAddress(
      sourceChain,
      address,
      stellarWallet?.publicKey
    )
    
    if (!resolverAddress) {
      throw new Error('No resolver address available. Please connect your wallet.')
    }
    
    // Create real signer objects
    let evmSigner: ethers.Signer | undefined = undefined
    let stellarSecretKey: string | undefined = undefined
    
    if (sourceChain !== 'stellar-testnet' || destinationChain !== 'stellar-testnet') {
      if (!walletClient || !address) {
        throw new Error('MetaMask wallet not connected for EVM operations')
      }
      const provider = new ethers.providers.Web3Provider(walletClient.transport)
      evmSigner = provider.getSigner()
    }
    
    if (sourceChain === 'stellar-testnet' || destinationChain === 'stellar-testnet') {
      if (!stellarWallet?.publicKey) {
        throw new Error('Freighter wallet not connected for Stellar operations')
      }
      stellarSecretKey = stellarWallet.publicKey
    }
    
    const destinationBuyerAddress = getBuyerAddressForChain(auction, destinationChain)
    
    // Debug auction data for destination escrow
    console.log('🔍 Destination escrow - Auction data for hashed secret:')
    console.log('  auction.hashedSecret:', auction.hashedSecret)
    console.log('  auction.secret:', auction.secret)
    
    // The hashed secret should come from the order details, not be randomly generated
    if (!auction.hashedSecret) {
      throw new Error('Hashed secret not found in auction data for destination escrow. This should come from the order details.')
    }
    
    const orderExecution: ResolverOrderExecution = {
      orderId: auction.orderId,
      sourceChain,
      destinationChain,
      sourceToken: auction.srcToken || auction.tokenSymbol || 'ETH',
      destinationToken: auction.dstToken || auction.tokenName || 'XLM',
      sourceAmount: auction.srcAmount?.toString() || auction.sourceAmount?.toString() || '0',
      destinationAmount: auction.dstAmount?.toString() || auction.currentPrice?.toString() || '0',
      buyerAddress: auction.buyerAddress,
      buyerEthAddress: auction.buyerEthAddress,
      buyerStellarAddress: auction.buyerStellarAddress,
      resolverAddress,
      hashedSecret: auction.hashedSecret,
      isPartialFill: auction.auctionType === 'segmented',
      segmentIndex: auction.auctionType === 'segmented' ? ((segmentId || 1) - 1) : 0, // Convert 1-based segmentId to 0-based index
      totalParts: auction.auctionType === 'segmented' ? (auction.segments?.length || 1) : 1,
      evmSigner,
      stellarWallet: stellarWallet,
      stellarSecretKey
    }
    
    console.log(`🔗 Using buyer address for destination chain (${orderExecution.destinationChain}): ${destinationBuyerAddress}`)
    
    // Create destination escrow on the DESTINATION chain using appropriate wallet
    const destinationResult = orderExecution.destinationChain === 'stellar-testnet'
      ? await resolverContractManager.createDestinationEscrowStellar(
          orderExecution.destinationChain,
          orderExecution.hashedSecret,
          destinationBuyerAddress,
          orderExecution.destinationAmount,
          stellarWallet,
          orderExecution.isPartialFill,
          orderExecution.segmentIndex,
          orderExecution.totalParts
        )
      : await resolverContractManager.createDestinationEscrowEVM(
          orderExecution.destinationChain,
          orderExecution.orderId,
          orderExecution.hashedSecret,
          destinationBuyerAddress,
          orderExecution.destinationAmount,
          orderExecution.evmSigner!,
          orderExecution.isPartialFill,
          orderExecution.segmentIndex,
          orderExecution.totalParts
        )
    
    if (!destinationResult.success) {
      throw new Error(`Destination escrow creation failed: ${destinationResult.error}`)
    }
    
    updateStepStatus('destination-escrow', 'completed', {
      escrowAddress: destinationResult.escrowAddress,
      transactionHash: destinationResult.transactionHash,
      message: `Destination escrow created successfully on ${orderExecution.destinationChain}`
    })
    
    // Store the result for later steps
    setExecutionDetails((prev: any) => ({
      ...prev,
      destinationResult
    }))
  }

  // Step 4: Withdrawal Timer
  const executeWithdrawalTimer = async () => {
    updateStepStatus('withdrawal-timer', 'in-progress', {
      message: 'Escrows deployed successfully. Starting 60-second withdrawal window timer.'
    })
    
    const withdrawalStart = Math.floor(Date.now() / 1000) + 60
    await resolverContractManager.waitForWithdrawalWindow(withdrawalStart)
    
    updateStepStatus('withdrawal-timer', 'completed', {
      message: 'Withdrawal window is now open. Requesting secret from buyer.'
    })
  }

  // Step 5: Request Secret
  const executeSecretRequest = async () => {
    updateStepStatus('secret-request', 'in-progress')
    
    const sourceChain = mapChainName(auction.fromChain)
    const destinationChain = mapChainName(auction.toChain)
    
    const sourceResult = executionDetails?.sourceResult
    const destinationResult = executionDetails?.destinationResult
    
    console.log('🔍 Secret request debug info:', {
      sourceResult: sourceResult,
      destinationResult: destinationResult,
      sourceEscrowAddress: sourceResult?.escrowAddress,
      destinationEscrowAddress: destinationResult?.escrowAddress,
      executionDetails: executionDetails
    });
    
    // Use mock addresses if escrow addresses are not available
    const sourceEscrowAddress = sourceResult?.escrowAddress || 
      (sourceChain === 'stellar-testnet' ? 'CD3TAVDMTRSPT475FP2APSC3MRQFOHVKEMJYPUGGQRP3KS4B5UBPCFH6' : '0x0C61331EfF224af55E68E6a0B022a465b2D619A7');
    const destinationEscrowAddress = destinationResult?.escrowAddress || 
      (destinationChain === 'stellar-testnet' ? 'CD3TAVDMTRSPT475FP2APSC3MRQFOHVKEMJYPUGGQRP3KS4B5UBPCFH6' : '0x0C61331EfF224af55E68E6a0B022a465b2D619A7');
    
    if (!sourceResult?.escrowAddress || !destinationResult?.escrowAddress) {
      console.warn('⚠️ Using mock escrow addresses:', {
        sourceEscrowAddress: sourceEscrowAddress,
        destinationEscrowAddress: destinationEscrowAddress,
        originalSourceAddress: sourceResult?.escrowAddress,
        originalDestinationAddress: destinationResult?.escrowAddress
      });
    }
    
    console.log('🔍 ResolverExecutionModal segmentId debug:', {
      segmentId,
      auctionType: auction.auctionType,
      isSegmented: auction.auctionType === 'segmented',
      finalSegmentId: auction.auctionType === 'segmented' ? segmentId : undefined
    });
    
    const secretResult = await resolverContractManager.requestSecretFromBuyer(
      auction.orderId,
      sourceEscrowAddress,
      destinationEscrowAddress,
      sourceChain,
      destinationChain,
      auction.auctionType === 'segmented' ? segmentId : undefined // Use actual segmentId for partial fills
    )
    
    if (!secretResult.success) {
      throw new Error(`Secret request failed: ${secretResult.error}`)
    }
    
    updateStepStatus('secret-request', 'completed', {
      secretReceived: true,
      message: 'Secret received from buyer. Proceeding with withdrawals.'
    })
    
    // Store the secret and merkle proof for withdrawal steps
    setExecutionDetails((prev: any) => ({
      ...prev,
      secret: secretResult.secret,
      merkleProof: secretResult.merkleProof || [] // Store merkle proof for partial fills
    }))
  }

  // Step 6: Source Withdrawal
  const executeSourceWithdrawal = async () => {
    updateStepStatus('source-withdrawal', 'in-progress')
    
    const sourceChain = mapChainName(auction.fromChain)
    const sourceResult = executionDetails?.sourceResult
    const secret = executionDetails?.secret
    
    if (!sourceResult?.escrowAddress || !secret) {
      throw new Error('Source escrow address or secret not available')
    }
    
    // Create real signer objects
    let evmSigner: ethers.Signer | undefined = undefined
    
    if (sourceChain !== 'stellar-testnet') {
      if (!walletClient || !address) {
        throw new Error('MetaMask wallet not connected for EVM operations')
      }
      const provider = new ethers.providers.Web3Provider(walletClient.transport)
      evmSigner = provider.getSigner()
    }
    
    const sourceWithdrawalParams: WithdrawalParams = {
      orderId: auction.orderId,
      escrowAddress: sourceResult.escrowAddress,
      secret: secret,
      chainId: sourceChain,
      isSource: true,
      isPartialFill: auction.auctionType === 'segmented',
      merkleProof: auction.auctionType === 'segmented' ? executionDetails?.merkleProof : undefined,
      segmentIndex: auction.auctionType === 'segmented' ? ((segmentId || 1) - 1) : 0 // Convert 1-based segmentId to 0-based index
    }
    
    const sourceWithdrawalResult = sourceChain === 'stellar-testnet'
      ? await resolverContractManager.withdrawFromStellarEscrow(sourceWithdrawalParams, stellarWallet)
      : await resolverContractManager.withdrawFromEVMEscrow(sourceWithdrawalParams, evmSigner!)
    
    if (!sourceWithdrawalResult.success) {
      throw new Error(`Source withdrawal failed: ${sourceWithdrawalResult.error}`)
    }
    
    updateStepStatus('source-withdrawal', 'completed', {
      transactionHash: sourceWithdrawalResult.transactionHash,
      message: `Source withdrawal completed successfully on ${sourceChain}`
    })
    
    // Store the result for completion step
    setExecutionDetails((prev: any) => ({
      ...prev,
      sourceWithdrawalResult
    }))
  }

  // Step 7: Destination Withdrawal
  const executeDestinationWithdrawal = async () => {
    updateStepStatus('destination-withdrawal', 'in-progress')
    
    const destinationChain = mapChainName(auction.toChain)
    const destinationResult = executionDetails?.destinationResult
    const secret = executionDetails?.secret
    
    if (!destinationResult?.escrowAddress || !secret) {
      throw new Error('Destination escrow address or secret not available')
    }
    
    // Create real signer objects
    let evmSigner: ethers.Signer | undefined = undefined
    
    if (destinationChain !== 'stellar-testnet') {
      if (!walletClient || !address) {
        throw new Error('MetaMask wallet not connected for EVM operations')
      }
      const provider = new ethers.providers.Web3Provider(walletClient.transport)
      evmSigner = provider.getSigner()
    }
    
    const destinationWithdrawalParams: WithdrawalParams = {
      orderId: auction.orderId,
      escrowAddress: destinationResult.escrowAddress,
      secret: secret,
      chainId: destinationChain,
      isSource: false,
      isPartialFill: auction.auctionType === 'segmented',
      merkleProof: auction.auctionType === 'segmented' ? executionDetails?.merkleProof : undefined,
      segmentIndex: auction.auctionType === 'segmented' ? ((segmentId || 1) - 1) : 0 // Convert 1-based segmentId to 0-based index
    }
    
    const destinationWithdrawalResult = destinationChain === 'stellar-testnet'
      ? await resolverContractManager.withdrawFromStellarEscrow(destinationWithdrawalParams, stellarWallet)
      : await resolverContractManager.withdrawFromEVMEscrow(destinationWithdrawalParams, evmSigner!)
    
    if (!destinationWithdrawalResult.success) {
      throw new Error(`Destination withdrawal failed: ${destinationWithdrawalResult.error}`)
    }
    
    updateStepStatus('destination-withdrawal', 'completed', {
      transactionHash: destinationWithdrawalResult.transactionHash,
      message: `Destination withdrawal completed successfully on ${destinationChain}`
    })
    
    // Store the result for completion step
    setExecutionDetails((prev: any) => ({
      ...prev,
      destinationWithdrawalResult
    }))
  }

  // Step 8: Completion
  const executeCompletion = async () => {
    updateStepStatus('completion', 'in-progress')
    
    // Notify relayer of order completion
    await resolverContractManager.notifyOrderCompleted(auction.orderId, 0)
    
    updateStepStatus('completion', 'completed', {
      orderCompleted: true,
      sourceEscrowAddress: executionDetails?.sourceResult?.escrowAddress,
      destinationEscrowAddress: executionDetails?.destinationResult?.escrowAddress,
      sourceWithdrawalHash: executionDetails?.sourceWithdrawalResult?.transactionHash,
      destinationWithdrawalHash: executionDetails?.destinationWithdrawalResult?.transactionHash,
      message: 'Swap completed successfully!'
    })
    
    console.log('🎉 Complete resolver workflow executed successfully!')
  }

  // Get step icon with status
  const getStepIcon = (step: ExecutionStep) => {
    const baseIcon = step.icon
    
    switch (step.status) {
      case 'completed':
        return <div className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
          <CheckCircle className="w-5 h-5 text-green-400" />
        </div>
      case 'in-progress':
        return <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
        </div>
      case 'failed':
        return <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
          <AlertCircle className="w-5 h-5 text-red-400" />
        </div>
      default:
        return <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
          <div className="w-5 h-5 text-white/60">
            {baseIcon}
          </div>
        </div>
    }
  }

  // Get step status color
  const getStepStatusColor = (step: ExecutionStep) => {
    switch (step.status) {
      case 'completed':
        return 'text-green-400'
      case 'in-progress':
        return 'text-blue-400'
      case 'failed':
        return 'text-red-400'
      default:
        return 'text-white/60'
    }
  }

  // Get step background color
  const getStepBgColor = (step: ExecutionStep) => {
    switch (step.status) {
      case 'completed':
        return 'bg-green-500/10 border-green-500/20'
      case 'in-progress':
        return 'bg-blue-500/10 border-blue-500/20'
      case 'failed':
        return 'bg-red-500/10 border-red-500/20'
      default:
        return 'bg-black/30 border-white/10'
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

  // Helper functions
  const mapChainName = (chainDisplayName: string): string => {
    const mapping: { [key: string]: string } = {
      'Sepolia Testnet': 'sepolia',
      'Stellar Testnet': 'stellar-testnet'
    }
    return mapping[chainDisplayName] || 'sepolia'
  }
  
  // Get the correct buyer address for a specific chain
  const getBuyerAddressForChain = (auction: any, chainId: string): string => {
    console.log('🔍 Getting buyer address for chain:', chainId)
    console.log('📋 Available buyer addresses:', {
      buyerAddress: auction.buyerAddress,
      buyerEthAddress: auction.buyerEthAddress,
      buyerStellarAddress: auction.buyerStellarAddress
    })
    
    if (chainId === 'stellar-testnet') {
      // For Stellar chain, use Stellar address if available, otherwise fall back to general address
      const stellarAddress = auction.buyerStellarAddress
      console.log('🌟 Using Stellar buyer address:', stellarAddress)
      return stellarAddress
    } else {
      // For EVM chains (sepolia, etc.), use ETH address if available, otherwise fall back to general address
      const evmAddress = auction.buyerEthAddress
      console.log('🔗 Using EVM buyer address:', evmAddress)
      return evmAddress
    }
  }

  const handleSecretReceived = async (secret: string) => {
    console.log('🔐 Secret received from buyer:', secret.slice(0, 10) + '...')
    // The secret handling is now done within the resolver contract manager
    console.log('✅ Secret processing completed')
  }

  // Check if a step can be started
  const canStartStep = (stepId: string): boolean => {
    if (isExecuting) return false
    
    const step = executionSteps.find(s => s.id === stepId)
    if (!step) return false
    
    // If step is already completed or in progress, can't start again
    if (step.status === 'completed' || step.status === 'in-progress') return false
    
    // For steps that depend on previous steps, check if prerequisites are met
    switch (stepId) {
      case 'source-escrow':
        // Can start if resolver is declared
        return executionSteps.find(s => s.id === 'resolver-declared')?.status === 'completed'
      case 'destination-escrow':
        // Can start if source escrow is completed
        return executionSteps.find(s => s.id === 'source-escrow')?.status === 'completed'
      case 'withdrawal-timer':
        // Can start if both escrows are completed
        return executionSteps.find(s => s.id === 'source-escrow')?.status === 'completed' &&
               executionSteps.find(s => s.id === 'destination-escrow')?.status === 'completed'
      case 'secret-request':
        // Can start if withdrawal timer is completed
        return executionSteps.find(s => s.id === 'withdrawal-timer')?.status === 'completed'
      case 'source-withdrawal':
        // Can start if secret is received
        return executionSteps.find(s => s.id === 'secret-request')?.status === 'completed'
      case 'destination-withdrawal':
        // Can start if source withdrawal is completed
        return executionSteps.find(s => s.id === 'source-withdrawal')?.status === 'completed'
      case 'completion':
        // Can start if both withdrawals are completed
        return executionSteps.find(s => s.id === 'source-withdrawal')?.status === 'completed' &&
               executionSteps.find(s => s.id === 'destination-withdrawal')?.status === 'completed'
      default:
        return true
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black/40 backdrop-blur-xl border border-white/10 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-white text-xl">
            <div className="w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-yellow-400" />
            </div>
            <span>Resolver Execution</span>
            <Sparkles className="w-5 h-5 text-yellow-400" />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Auction Information */}
          <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Target className="w-5 h-5 text-blue-400" />
              <h3 className="text-white font-semibold text-lg">Auction Details</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-black/20 rounded-lg p-3">
                <span className="text-white/60 text-xs uppercase tracking-wide">Order ID</span>
                <div className="font-mono text-white text-sm mt-1">{auction?.orderId.slice(0, 6) + '...' + auction?.orderId.slice(-6) || 'N/A'}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <span className="text-white/60 text-xs uppercase tracking-wide">Auction Type</span>
                <div className="font-medium text-white text-sm mt-1">
                  {auction?.auctionType === 'single' ? 'NORMAL' : 'PARTIAL FILL'}
                </div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <span className="text-white/60 text-xs uppercase tracking-wide">Source Chain</span>
                <div className="font-medium text-white text-sm mt-1">{auction?.srcChainId || auction?.fromChain || 'N/A'}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <span className="text-white/60 text-xs uppercase tracking-wide">Destination Chain</span>
                <div className="font-medium text-white text-sm mt-1">{auction?.dstChainId || auction?.toChain || 'N/A'}</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <span className="text-white/60 text-xs uppercase tracking-wide">Source Amount</span>
                <div className="font-medium text-white text-sm mt-1">
                  {auction?.srcAmount || auction?.sourceAmount || '0'} {auction?.srcToken || auction?.tokenSymbol || 'TOKEN'}
                </div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <span className="text-white/60 text-xs uppercase tracking-wide">Destination Amount</span>
                <div className="font-medium text-white text-sm mt-1">
                  {auction?.dstAmount || auction?.currentPrice || '0'} {auction?.dstToken || auction?.tokenSymbol || 'TOKEN'}
                </div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <span className="text-white/60 text-xs uppercase tracking-wide">Buyer Address</span>
                <div className="font-mono text-white text-sm mt-1">
                  {auction?.buyerAddress && auction.buyerAddress !== '0x0000000000000000000000000000000000000000' ? 
                    (auction.buyerAddress.length > 20 ? 
                      `${auction.buyerAddress.slice(0, 8)}...${auction.buyerAddress.slice(-6)}` : 
                      auction.buyerAddress
                    ) : 
                    'N/A'
                  }
                </div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <span className="text-white/60 text-xs uppercase tracking-wide">Resolver Address</span>
                <div className="font-mono text-white text-sm mt-1">
                  {formatAddress(getWalletAddress(address ? { address } : stellarWallet))}
                </div>
              </div>
            </div>
          </div>

          {/* Execution Steps */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <ArrowUpDown className="w-5 h-5 text-purple-400" />
              <h3 className="text-white font-semibold text-lg">Execution Progress</h3>
            </div>
              {executionSteps.map((step, index) => (
                <motion.div
                  key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                className={`p-4 rounded-2xl border backdrop-blur-sm ${getStepBgColor(step)}`}
                >
                <div className="flex items-start gap-4">
                    {getStepIcon(step)}
                    <div className="flex-1">
                    <h4 className={`font-semibold ${getStepStatusColor(step)}`}>
                      {step.title}
                    </h4>
                    <p className="text-sm text-white/70 mt-1">
                      {step.description}
                    </p>
                      {step.details && (
                      <div className="mt-3 p-3 bg-black/20 rounded-lg border border-white/10">
                        <div className="text-xs text-white/60 mb-2">Transaction Details:</div>
                        <div className="text-xs text-white/80 font-mono space-y-1">
                          {Object.entries(step.details).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-white/60">{key}:</span>
                              <span className="text-white">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                        </div>
                      )}
                      {step.error && (
                      <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <div className="text-xs text-red-400 font-medium">Error:</div>
                        <div className="text-xs text-red-300 mt-1">{step.error}</div>
                    </div>
                    )}
                  </div>
                  
                  {/* Start Button for each step */}
                  {step.status === 'pending' && canStartStep(step.id) && (
                    <div className="flex-shrink-0">
                      <Button
                        onClick={() => executeStep(step.id)}
                        disabled={isExecuting}
                        className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 px-4 py-2 rounded-lg text-sm"
                      >
                        {currentExecutingStep === step.id ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Executing...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-2" />
                            Start
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  
                  {/* Status indicator for completed/failed steps */}
                  {step.status === 'completed' && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      </div>
                    </div>
                  )}
                  
                  {step.status === 'failed' && (
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                      </div>
                    </div>
                  )}
                  </div>
                </motion.div>
              ))}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isExecuting}
              className="border-white/20 text-black"
            >
              Close
            </Button>
            {executionSteps.find(step => step.id === 'completion')?.status === 'completed' && (
            <Button
                onClick={onExecutionComplete}
                className="bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30"
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