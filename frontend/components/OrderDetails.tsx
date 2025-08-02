"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Copy, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Hash,
  Key,
  Layers,
  ExternalLink
} from "lucide-react"
import { OrderData } from "@/lib/order-utils"

interface OrderDetailsProps {
  orderData: OrderData | null
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isLoading?: boolean
}

export default function OrderDetails({ 
  orderData, 
  isOpen, 
  onClose, 
  onConfirm, 
  isLoading = false 
}: OrderDetailsProps) {
  const [showSecrets, setShowSecrets] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  const truncateHash = (hash: string, length: number = 10) => {
    return `${hash.slice(0, length)}...${hash.slice(-length)}`
  }

  if (!orderData) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black/40 backdrop-blur-xl border border-white/10 max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-white">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span>Order Details</span>
            {orderData.isPartialFillEnabled && (
              <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                Partial Fill ({orderData.partialFillManager?.getPartsCount()} parts)
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Order Summary */}
            <div className="bg-black/20 border border-white/10 rounded-xl p-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Hash className="w-5 h-5 mr-2" />
                Order Summary
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-white/60">Order ID</label>
                  <div className="flex items-center space-x-2 mt-1">
                    <code className="text-sm bg-white/10 px-2 py-1 rounded text-white/80 font-mono">
                      {truncateHash(orderData.orderId, 8)}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(orderData.orderId, 'orderId')}
                      className="text-white/60 hover:text-white"
                    >
                      {copiedField === 'orderId' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm text-white/60">Buyer Address</label>
                  <div className="flex items-center space-x-2 mt-1">
                    <code className="text-sm bg-white/10 px-2 py-1 rounded text-white/80 font-mono">
                      {truncateHash(orderData.buyerAddress, 8)}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(orderData.buyerAddress, 'buyerAddress')}
                      className="text-white/60 hover:text-white"
                    >
                      {copiedField === 'buyerAddress' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Swap Details */}
            <div className="bg-black/20 border border-white/10 rounded-xl p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Swap Details</h3>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-white/60">Source Chain</label>
                    <div className="text-white font-medium">{orderData.srcChainId}</div>
                  </div>
                  <div>
                    <label className="text-sm text-white/60">Source Token</label>
                    <div className="text-white font-medium">{orderData.srcToken}</div>
                  </div>
                  <div>
                    <label className="text-sm text-white/60">Source Amount</label>
                    <div className="text-white font-medium">{orderData.srcAmount}</div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-white/60">Destination Chain</label>
                    <div className="text-white font-medium">{orderData.dstChainId}</div>
                  </div>
                  <div>
                    <label className="text-sm text-white/60">Destination Token</label>
                    <div className="text-white font-medium">{orderData.dstToken}</div>
                  </div>
                  <div>
                    <label className="text-sm text-white/60">Destination Amount</label>
                    <div className="text-white font-medium">{orderData.dstAmount}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Order Creation Time */}
            <div className="bg-black/20 border border-white/10 rounded-xl p-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Clock className="w-5 h-5 mr-2" />
                Order Creation Time
              </h3>
              
              <div className="text-white font-medium">
                {orderData.orderCreationTime ? new Date(orderData.orderCreationTime * 1000).toLocaleString() : new Date().toLocaleString()}
              </div>
            </div>

            {/* Secrets Section */}
            <div className="bg-black/20 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Key className="w-5 h-5 mr-2" />
                  {orderData.isPartialFillEnabled ? 'Partial Fill Secrets & Hashes' : 'Secrets & Hashes'}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="text-white/60 hover:text-white"
                >
                  {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showSecrets ? 'Hide' : 'Show'} Secrets
                </Button>
              </div>

              <AnimatePresence>
                {showSecrets && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                  >
                    {/* Main Secret - Only show for non-partial fill orders */}
                    {!orderData.isPartialFillEnabled && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm text-red-300 font-medium">Main Secret</label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(orderData.secret, 'secret')}
                            className="text-red-300 hover:text-red-200"
                          >
                            {copiedField === 'secret' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                        <code className="text-xs bg-black/30 px-2 py-1 rounded text-red-200 font-mono break-all">
                          {orderData.secret}
                        </code>
                      </div>
                    )}

                    {/* Hashed Secret - Only show for non-partial fill orders */}
                    {!orderData.isPartialFillEnabled && (
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm text-blue-300 font-medium">Hashed Secret</label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(orderData.hashedSecret, 'hashedSecret')}
                            className="text-blue-300 hover:text-blue-200"
                          >
                            {copiedField === 'hashedSecret' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                        <code className="text-xs bg-black/30 px-2 py-1 rounded text-blue-200 font-mono break-all">
                          {orderData.hashedSecret}
                        </code>
                      </div>
                    )}

                    {/* Partial Fill Secrets */}
                    {orderData.isPartialFillEnabled && orderData.partialFillSecrets && orderData.partialFillSecretHashes && (
                      <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                        <div className="flex items-center mb-3">
                          <Layers className="w-4 h-4 mr-2 text-purple-300" />
                          <label className="text-sm text-purple-300 font-medium">
                            Partial Fill Secrets ({orderData.partialFillSecrets.length} parts)
                          </label>
                        </div>
                        
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {orderData.partialFillSecrets.map((secret, index) => (
                            <div key={index} className="bg-black/20 rounded p-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-purple-200">Part {index + 1}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(secret, `secret-${index}`)}
                                  className="text-purple-300 hover:text-purple-200 h-6 px-2"
                                >
                                  {copiedField === `secret-${index}` ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="text-xs text-purple-300/60">Secret:</span>
                                  <code className="text-xs bg-black/30 px-1 py-0.5 rounded text-purple-200 font-mono block truncate">
                                    {truncateHash(secret, 6)}
                                  </code>
                                </div>
                                <div>
                                  <span className="text-xs text-purple-300/60">Hash:</span>
                                  <code className="text-xs bg-black/30 px-1 py-0.5 rounded text-purple-200 font-mono block truncate">
                                    {truncateHash(orderData.partialFillSecretHashes![index], 6)}
                                  </code>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Relayer Data */}
            <div className="bg-black/20 border border-white/10 rounded-xl p-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <ExternalLink className="w-5 h-5 mr-2" />
                Relayer Data (Will be sent to relayer)
              </h3>
              
              <div className="bg-black/30 border border-white/20 rounded-lg p-3">
                <pre className="text-xs text-white/80 font-mono overflow-x-auto">
                  {JSON.stringify({
                    orderId: orderData.orderId,
                    buyerAddress: orderData.buyerAddress,
                    buyerStellarAddress: orderData.buyerStellarAddress,
                    buyerEthAddress: orderData.buyerEthAddress,
                    srcChainId: orderData.srcChainId,
                    dstChainId: orderData.dstChainId,
                    srcToken: orderData.srcToken,
                    dstToken: orderData.dstToken,
                    srcAmount: orderData.srcAmount,
                    dstAmount: orderData.dstAmount,
                    market_price: orderData.market_price,
                    slippage: orderData.slippage
                  }, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-4 border-t border-white/10">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-white/20 text-white hover:bg-white/20 hover:text-white !bg-transparent"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 bg-white text-black hover:bg-gray-100 font-semibold"
          >
            {isLoading ? 'Creating Order...' : 'Create Order'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 