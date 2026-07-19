"use client"

// 🧪 [redesign/group-home] 채팅 — 기존 ChatTab 편입 (홈 상단 💬 아이콘에서 진입).
// ?room={id} 오면 해당 방 바로 열기 (크루 카드 💬 → 크루 채팅방).
// 채팅은 목적지가 아니라 크루의 작업실: 공유·투표·분담결제가 본질.

import React, { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { ChatTab } from "@/components/ui/chat-tab"

const BRAND = "#F5A623"

function ChatsInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const room = sp.get("room")

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col bg-white">
      <div className="px-4 py-1.5 text-center text-[11px] font-medium text-white" style={{ backgroundColor: BRAND }}>
        🧪 새 홈 프로토타입 · 채팅
      </div>
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
        <button onClick={() => router.back()} className="rounded-full p-1 text-gray-500"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="text-[15px] font-bold text-gray-900">채팅</h1>
      </div>
      <div className="min-h-0 flex-1">
        <ChatTab openRoomId={room} />
      </div>
    </div>
  )
}

export default function ChatsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-300">불러오는 중...</div>}>
      <ChatsInner />
    </Suspense>
  )
}
