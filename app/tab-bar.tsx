"use client"

import React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Home, Search, MessageCircle, ShoppingBag, User } from "lucide-react"

const MINT = "#3BD4AE"

/**
 * 5탭 구조: 홈(스케줄러) | 탐색(숏폼+추천) | 채팅(모임별) | 샵(제휴·핫딜·IAP) | MY(설정)
 * 모임의 전 과정을 앱 안에서 완결하는 플랫폼.
 * 시각 언어: 민트 #3BD4AE = 메인 / 앰버 #FFB800 = 단골 모임 / 오렌지 #FF6B35 = 핫딜·긴급
 */
export function TabBar() {
  const router = useRouter()
  const pathname = usePathname()

  const tabs = [
    { key: "home", label: "홈", icon: Home, path: "/", exact: true },
    { key: "discover", label: "탐색", icon: Search, path: "/search" },
    { key: "chat", label: "채팅", icon: MessageCircle, path: "/chats" },
    { key: "shop", label: "샵", icon: ShoppingBag, path: "/shop" },
    { key: "my", label: "MY", icon: User, path: "/profile" },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-gray-100 bg-white/95 backdrop-blur">
      <div className="flex">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = t.exact ? pathname === t.path : pathname?.startsWith(t.path)
          return (
            <button key={t.key} onClick={() => router.push(t.path)} className="flex flex-1 flex-col items-center gap-0.5 py-2">
              <Icon className="h-5 w-5" style={{ color: active ? MINT : "#d1d5db" }} />
              <span className="text-[10px] font-medium" style={{ color: active ? MINT : "#9ca3af" }}>{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
