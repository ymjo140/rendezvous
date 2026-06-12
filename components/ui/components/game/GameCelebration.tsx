"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { CelebrationDetail } from "@/lib/game"

type CelebrationItem = {
  id: number
  emoji: string
  title: string
  subtitle: string
}

function buildItems(d: CelebrationDetail): CelebrationItem[] {
  const items: CelebrationItem[] = []
  let seq = Date.now()
  if (d.leveled_up) {
    items.push({ id: seq++, emoji: "🎉", title: `레벨 ${d.level} 달성!`, subtitle: "탐험을 멈추지 마세요" })
  }
  for (const b of d.new_badges || []) {
    items.push({ id: seq++, emoji: b.emoji || "🏅", title: `${b.title || "새 뱃지"} 획득!`, subtitle: "뱃지 컬렉션에 추가됐어요" })
  }
  if ((d.completed_quests || []).length > 0 && !d.leveled_up) {
    // 레벨업이 있으면 그쪽을 우선 노출(과한 연출 방지)
    items.push({
      id: seq++,
      emoji: "✅",
      title: "퀘스트 완료!",
      subtitle: d.gained_xp ? `+${d.gained_xp} XP` : "보상을 받았어요",
    })
  }
  return items
}

export function GameCelebration() {
  const [queue, setQueue] = useState<CelebrationItem[]>([])
  const current = queue[0]

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as CelebrationDetail
      if (!detail) return
      const items = buildItems(detail)
      if (items.length > 0) setQueue((q) => [...q, ...items])
    }
    window.addEventListener("game:celebrate", handler)
    return () => window.removeEventListener("game:celebrate", handler)
  }, [])

  useEffect(() => {
    if (!current) return
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 2200)
    return () => clearTimeout(t)
  }, [current])

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0.6, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            className="bg-white rounded-3xl shadow-2xl px-8 py-6 text-center border-2 border-[#F5A623]/20 mx-6"
          >
            <motion.div
              initial={{ scale: 0.4, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 12, delay: 0.05 }}
              className="text-6xl mb-2"
            >
              {current.emoji}
            </motion.div>
            <div className="text-lg font-extrabold text-gray-900">{current.title}</div>
            <div className="text-sm text-gray-500 mt-0.5">{current.subtitle}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
