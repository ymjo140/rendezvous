import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Coins, Gem } from "lucide-react"
import { Button } from "@/components/ui/button"

type ActionButtonsProps = {
  nearbyLoot: any
  nearbyPlace: any
  interactionLoading: boolean
  onClaimLoot: () => void
  onCheckIn: () => void
}

export const ActionButtons = ({
  nearbyLoot,
  nearbyPlace,
  interactionLoading,
  onClaimLoot,
  onCheckIn,
}: ActionButtonsProps) => {
  return (
    <AnimatePresence>
      {nearbyLoot ? (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className="absolute bottom-24 left-4 right-4 z-30"
        >
          <Button
            onClick={onClaimLoot}
            disabled={interactionLoading}
            className="w-full h-14 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-xl animate-pulse flex gap-2"
          >
            <Gem className="w-5 h-5" /> 보물 줍기 (+{nearbyLoot.amount}C)
          </Button>
        </motion.div>
      ) : nearbyPlace ? (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className="absolute bottom-24 left-4 right-4 z-30"
        >
          <Button
            onClick={onCheckIn}
            disabled={interactionLoading}
            className="w-full h-14 rounded-2xl bg-yellow-500 hover:bg-yellow-600 text-white font-bold shadow-xl animate-bounce flex gap-2"
          >
            <Coins className="w-5 h-5" /> 방문 인증 (+50C)
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
