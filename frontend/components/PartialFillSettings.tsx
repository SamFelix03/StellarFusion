"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { 
  Layers, 
  Settings, 
  ChevronDown,
  ChevronUp
} from "lucide-react"

interface PartialFillSettingsProps {
  enablePartialFills: boolean
  partsCount: number
  onPartialFillsChange: (enabled: boolean) => void
  onPartsCountChange: (count: number) => void
}

// Custom Switch component with proper styling
function CustomSwitch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border-2 transition-colors ${
        checked 
          ? 'bg-white border-white' 
          : 'bg-white/20 border-white/40'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-black transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export default function PartialFillSettings({
  enablePartialFills,
  partsCount,
  onPartialFillsChange,
  onPartsCountChange
}: PartialFillSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const handlePartsCountChange = (value: string) => {
    const count = parseInt(value)
    if (count >= 2 && count <= 8) {
      onPartsCountChange(count)
    }
  }

  return (
    <div className="bg-black/20 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-white/60" />
          <Label className="text-sm text-white/60">Partial Fills</Label>
        </div>
        
        <div className="flex items-center space-x-3">
          <CustomSwitch
            checked={enablePartialFills}
            onCheckedChange={onPartialFillsChange}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-white/60 hover:text-white"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <motion.div
        initial={false}
        animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-white/60">Number of Parts</Label>
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                min="2"
                max="8"
                value={partsCount}
                onChange={(e) => handlePartsCountChange(e.target.value)}
                className="w-20 bg-black/30 border-white/10 text-white text-center"
                disabled={!enablePartialFills}
              />
              <span className="text-xs text-white/40">(2-8)</span>
            </div>
          </div>

          <div className="bg-black/30 border border-white/10 rounded-lg p-3">
            <div className="text-xs text-white/60 space-y-1">
              <p>• Order can be filled in {partsCount} separate parts</p>
              <p>• Each part has its own secret and proof</p>
              <p>• Resolver can fill parts independently</p>
              <p>• Atomic execution per part</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
} 