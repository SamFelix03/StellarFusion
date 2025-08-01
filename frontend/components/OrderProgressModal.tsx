"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Wallet, 
  Shield, 
  Key, 
  ArrowRight,
  Copy,
  ExternalLink,
  Star,
  TrendingUp,
  Users,
  Zap
} from "lucide-react"
import { toast } from "@/components/ui/use-toast"

export interface OrderProgress {
  orderId: string
  orderType: 'single' | 'partial'
  status: 'auction_started' | 'price_update' | 'auction_ended' | 'resolver_declared' | 'source_escrow_created' | 'destination_escrow_created' | 'escrows_verified' | 'secret_requested' | 'secret_received' | 'source_withdrawal_completed' | 'destination_withdrawal_completed' | 'order_completed' | 'failed' | 'segment_secret_requested'
  // Source amounts (what user is paying)
  sourceAmount: string
  sourceToken: string
  sourceChain: string
  // Destination amounts (what user is receiving)
  destinationAmount: string
  destinationToken: string
  destinationChain: string
  // Progress tracking
  filledAmount: string
  fillPercentage: number
  buyerAddress: string
  hashedSecret: string
  // Real event data
  currentPrice?: number
  resolverAddress?: string
  sourceEscrowAddress?: string
  destinationEscrowAddress?: string
  sourceWithdrawalTx?: string
  destinationWithdrawalTx?: string
  // Partial fill segments
  segments?: OrderSegment[]
  error?: string
  createdAt: number
  updatedAt: number
}

export interface OrderSegment {
  id: number
  amount: string
  status: 'segment_auction_started' | 'segment_price_update' | 'segment_auction_ended' | 'segment_escrows_created' | 'segment_secret_requested' | 'segment_secret_received' | 'segment_withdrawal_completed' | 'segment_failed'
  resolverAddress?: string
  sourceEscrowAddress?: string
  destinationEscrowAddress?: string
  withdrawalTxHash?: string
  destinationWithdrawalTxHash?: string
  fillPercentage: number
  currentPrice?: number
  error?: string
}

interface OrderProgressModalProps {
  isOpen: boolean
  onClose: () => void
  orderData: OrderProgress | null
  onShareSecret?: (orderId: string, segmentId?: number) => Promise<void>
}

const ORDER_STATUS_STEPS = [
  { id: 'auction_started', label: 'Auction Started', icon: TrendingUp, description: 'Order auction has begun' },
  { id: 'price_update', label: 'Price Updates', icon: TrendingUp, description: 'Auction price is updating' },
  { id: 'auction_ended', label: 'Auction Ended', icon: Users, description: 'Resolver has won the auction' },
  { id: 'resolver_declared', label: 'Resolver Declared', icon: Shield, description: 'Resolver has accepted the order' },
  { id: 'source_escrow_created', label: 'Source Escrow Created', icon: Shield, description: 'Source escrow has been deployed' },
  { id: 'destination_escrow_created', label: 'Destination Escrow Created', icon: Shield, description: 'Destination escrow has been deployed' },
  { id: 'escrows_verified', label: 'Escrows Verified', icon: CheckCircle, description: 'Relayer has verified both escrows' },
  { id: 'secret_requested', label: 'Secret Requested', icon: Key, description: 'Relayer is requesting secret from buyer' },
  { id: 'secret_received', label: 'Secret Received', icon: Key, description: 'Buyer has shared the secret' },
  { id: 'source_withdrawal_completed', label: 'Source Withdrawal', icon: Wallet, description: 'Resolver has withdrawn from source escrow' },
  { id: 'destination_withdrawal_completed', label: 'Destination Withdrawal', icon: Wallet, description: 'Buyer has withdrawn from destination escrow' },
  { id: 'order_completed', label: 'Order Completed', icon: CheckCircle, description: 'Order has been successfully completed' }
]

const getStatusStepIndex = (status: string): number => {
  return ORDER_STATUS_STEPS.findIndex(step => step.id === status)
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'order_completed':
    case 'destination_withdrawal_completed':
    case 'source_withdrawal_completed':
    case 'secret_received':
    case 'escrows_verified':
    case 'destination_escrow_created':
    case 'source_escrow_created':
    case 'resolver_declared':
    case 'auction_ended':
      return 'text-green-500'
    case 'secret_requested':
    case 'price_update':
    case 'auction_started':
      return 'text-blue-500'
    case 'failed':
      return 'text-red-500'
    default:
      return 'text-gray-500'
  }
}

const getStatusBgColor = (status: string): string => {
  switch (status) {
    case 'order_completed':
    case 'destination_withdrawal_completed':
    case 'source_withdrawal_completed':
    case 'secret_received':
    case 'escrows_verified':
    case 'destination_escrow_created':
    case 'source_escrow_created':
    case 'resolver_declared':
    case 'auction_ended':
      return 'bg-green-500/10 border-green-500/20'
    case 'secret_requested':
    case 'price_update':
    case 'auction_started':
      return 'bg-blue-500/10 border-blue-500/20'
    case 'failed':
      return 'bg-red-500/10 border-red-500/20'
    default:
      return 'bg-gray-500/10 border-gray-500/20'
  }
}

export default function OrderProgressModal({ 
  isOpen, 
  onClose, 
  orderData, 
  onShareSecret 
}: OrderProgressModalProps) {
  const [isSharingSecret, setIsSharingSecret] = useState(false)

  const handleShareSecret = async () => {
    if (!orderData || !onShareSecret) return
    
    try {
      setIsSharingSecret(true)
      await onShareSecret(orderData.orderId)
      toast({
        title: "Secret Shared Successfully",
        description: "The secret has been shared with the relayer.",
      })
    } catch (error) {
      toast({
        title: "Error Sharing Secret",
        description: error instanceof Error ? error.message : "Failed to share secret",
        variant: "destructive",
      })
    } finally {
      setIsSharingSecret(false)
    }
  }

  const handleShareSegmentSecret = async (segmentId: number) => {
    if (!orderData || !onShareSecret) return
    
    try {
      setIsSharingSecret(true)
      await onShareSecret(orderData.orderId, segmentId)
      toast({
        title: "Segment Secret Shared Successfully",
        description: `Secret for segment ${segmentId} has been shared with the relayer.`,
      })
    } catch (error) {
      toast({
        title: "Error Sharing Segment Secret",
        description: error instanceof Error ? error.message : "Failed to share segment secret",
        variant: "destructive",
      })
    } finally {
      setIsSharingSecret(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Copied to Clipboard",
      description: "The text has been copied to your clipboard.",
    })
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount)
    if (isNaN(num)) return '0.0000'
    
    // Handle different token decimals
    if (amount.includes('.')) {
      // If it's already a decimal string, format it nicely
      return num.toFixed(4)
    } else {
      // For whole numbers, show fewer decimal places
      return num.toFixed(2)
    }
  }

  const canShareSecret = (orderData: OrderProgress): boolean => {
    if (orderData.orderType === 'single') {
      return orderData.status === 'secret_requested'
    } else if (orderData.orderType === 'partial' && orderData.segments) {
      // For partial fills, check if any segment needs secret sharing
      return orderData.segments.some(segment => segment.status === 'segment_secret_requested')
    }
    return false
  }

  if (!orderData) return null

  const currentStepIndex = getStatusStepIndex(orderData.status)
  const isCompleted = orderData.status === 'order_completed'
  const isFailed = orderData.status === 'failed'

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black/40 backdrop-blur-xl border border-white/10 max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-center text-xl">
            Order Progress
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Order Header */}
          <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                <span className="text-white font-semibold">
                  Order {orderData.orderId.slice(0, 8)}...
                </span>
                <Badge variant={orderData.orderType === 'single' ? 'default' : 'secondary'}>
                  {orderData.orderType === 'single' ? 'Single Fill' : 'Partial Fill'}
                </Badge>
              </div>
              <div className="text-white/60 text-sm">
                {new Date(orderData.createdAt).toLocaleString()}
              </div>
            </div>

            {/* Order Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-white/60">Source:</span>
                <span className="text-white ml-2">
                  {formatAmount(orderData.sourceAmount)} {orderData.sourceToken} ({orderData.sourceChain})
                </span>
              </div>
              <div>
                <span className="text-white/60">Destination:</span>
                <span className="text-white ml-2">
                  {formatAmount(orderData.destinationAmount)} {orderData.destinationToken} ({orderData.destinationChain})
                </span>
              </div>
              <div>
                <span className="text-white/60">Buyer:</span>
                <span className="text-white ml-2">{formatAddress(orderData.buyerAddress)}</span>
              </div>
              <div>
                <span className="text-white/60">Fill Progress:</span>
                <span className="text-white ml-2">{orderData.fillPercentage.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Progress Steps - Show only current step */}
          <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
            <h3 className="text-white font-semibold mb-4">Current Status</h3>
            <div className="space-y-3">
              {(() => {
                const currentStep = ORDER_STATUS_STEPS.find(step => step.id === orderData.status)
                if (!currentStep) return null
                
                const Icon = currentStep.icon
                const isCompleted = orderData.status === 'order_completed'
                const isCurrent = true // Always show current step
                const isStepFailed = orderData.status === 'failed'

                return (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className={`flex items-center space-x-3 p-4 rounded-lg border ${
                      isCompleted ? 'bg-green-500/10 border-green-500/20' :
                      isCurrent ? 'bg-blue-500/10 border-blue-500/20' :
                      'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isCompleted ? 'bg-green-500' :
                      isCurrent ? 'bg-blue-500 animate-pulse' :
                      'bg-white/20'
                    }`}>
                      {isCompleted ? (
                        <CheckCircle className="w-5 h-5 text-white" />
                      ) : isCurrent ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <Icon className="w-5 h-5 text-white/60" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`font-semibold text-lg ${
                        isCompleted ? 'text-green-400' :
                        isCurrent ? 'text-blue-400' :
                        'text-white/60'
                      }`}>
                        {currentStep.label}
                      </div>
                      <div className="text-sm text-white/60 mt-1">
                        {currentStep.description}
                      </div>
                    </div>
                  </motion.div>
                )
              })()}
            </div>
          </div>

          {/* Transaction Information */}
          {(orderData.sourceWithdrawalTx || orderData.destinationWithdrawalTx) && (
            <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
              <h3 className="text-white font-semibold mb-4">Transaction Details</h3>
              <div className="space-y-3">
                {orderData.sourceWithdrawalTx && (
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div>
                      <span className="text-white/60 text-sm">Source Withdrawal:</span>
                      <div className="font-mono text-white text-sm">{formatAddress(orderData.sourceWithdrawalTx)}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => orderData.sourceWithdrawalTx && copyToClipboard(orderData.sourceWithdrawalTx)}
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                {orderData.destinationWithdrawalTx && (
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div>
                      <span className="text-white/60 text-sm">Destination Withdrawal:</span>
                      <div className="font-mono text-white text-sm">{formatAddress(orderData.destinationWithdrawalTx)}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => orderData.destinationWithdrawalTx && copyToClipboard(orderData.destinationWithdrawalTx)}
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fill Progress Bar */}
          <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">Fill Progress</span>
              <span className="text-white/60">{orderData.fillPercentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-3">
              <motion.div
                className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${orderData.fillPercentage}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <div className="flex justify-between text-sm text-white/60 mt-2">
              <span>{formatAmount(orderData.filledAmount)} / {formatAmount(orderData.destinationAmount)}</span>
              <span>{orderData.orderType === 'partial' && orderData.segments ? 
                `${orderData.segments.filter(s => s.status === 'segment_withdrawal_completed').length} / ${orderData.segments.length} segments` : 
                'Single fill'
              }</span>
            </div>
          </div>

          {/* Segments (for partial fills) */}
          {orderData.orderType === 'partial' && orderData.segments && (
            <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
              <h3 className="text-white font-semibold mb-4">Segment Progress</h3>
              <div className="grid grid-cols-2 gap-4">
                {orderData.segments.map((segment, index) => (
                  <motion.div
                    key={segment.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-3 rounded-lg border ${
                      segment.status === 'segment_withdrawal_completed' ? 'bg-green-500/10 border-green-500/20' :
                      segment.status === 'segment_secret_requested' ? 'bg-blue-500/10 border-blue-500/20' :
                      segment.status === 'segment_auction_started' || segment.status === 'segment_price_update' ? 'bg-yellow-500/10 border-yellow-500/20' :
                      'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-medium">Segment {segment.id}</span>
                        <span className="text-white/60 text-sm">({formatAmount(segment.amount)})</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          segment.status === 'segment_withdrawal_completed' ? 'bg-green-500/20 text-green-400' :
                          segment.status === 'segment_secret_requested' ? 'bg-blue-500/20 text-blue-400' :
                          segment.status === 'segment_auction_started' || segment.status === 'segment_price_update' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-white/10 text-white/60'
                        }`}>
                          {segment.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Segment Progress Bar */}
                    <div className="w-full bg-white/20 rounded-full h-2 mb-2">
                      <motion.div
                        className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${segment.fillPercentage}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>

                    {/* Current Status Display */}
                    <div className="text-xs text-white/60">
                      {segment.status === 'segment_secret_requested' && (
                        <div className="flex items-center justify-between">
                          <span>Secret requested</span>
                          <Button
                            size="sm"
                            onClick={() => handleShareSegmentSecret(segment.id)}
                            disabled={isSharingSecret}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1"
                          >
                            {isSharingSecret ? (
                              <Loader2 className="w-2 h-2 animate-spin mr-1" />
                            ) : (
                              <Key className="w-2 h-2 mr-1" />
                            )}
                            Share
                          </Button>
                        </div>
                      )}
                      {segment.status === 'segment_withdrawal_completed' && segment.withdrawalTxHash && (
                        <div className="flex items-center justify-between">
                          <span>Completed</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => segment.withdrawalTxHash && copyToClipboard(segment.withdrawalTxHash)}
                            className="border-white/20 text-white hover:bg-white/10 text-xs px-2 py-1"
                          >
                            <Copy className="w-2 h-2" />
                          </Button>
                        </div>
                      )}
                      {segment.error && (
                        <div className="text-red-400 text-xs">
                          Error: {segment.error}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Share Secret Button (for single fills) */}
          {orderData.orderType === 'single' && canShareSecret(orderData) && (
            <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">Secret Sharing Required</h3>
                  <p className="text-white/60 text-sm">
                    The relayer is requesting the secret to complete the order.
                  </p>
                </div>
                <Button
                  onClick={handleShareSecret}
                  disabled={isSharingSecret}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSharingSecret ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Key className="w-4 h-4 mr-2" />
                  )}
                  Share Secret
                </Button>
              </div>
            </div>
          )}

          {/* Success Message */}
          {isCompleted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center"
            >
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <h3 className="text-green-400 font-semibold text-lg mb-2">Order Completed Successfully!</h3>
              <p className="text-white/60">
                All funds have been transferred and the order is now complete.
              </p>
            </motion.div>
          )}

          {/* Error Message */}
          {isFailed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center"
            >
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <h3 className="text-red-400 font-semibold text-lg mb-2">Order Failed</h3>
              <p className="text-white/60">
                {orderData.error || "An error occurred during order execution."}
              </p>
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-white/20 text-black"
            >
              Close
            </Button>
            {orderData.orderId && (
              <Button
                variant="outline"
                onClick={() => copyToClipboard(orderData.orderId)}
                className="border-white/20 text-black"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Order ID
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Badge component for status indicators
const Badge = ({ children, variant }: { children: React.ReactNode, variant: 'default' | 'secondary' }) => {
  const baseClasses = "px-2 py-1 text-xs rounded-full font-medium"
  const variantClasses = variant === 'default' 
    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
    : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
  
  return (
    <span className={`${baseClasses} ${variantClasses}`}>
      {children}
    </span>
  )
} 