"use client"

// 하단 5탭 — 홈·우리 크루·탐색·내 크루 목록·프로필
// 지도 자리를 '우리 크루'가 대체한다. 지도 탭은 구 홈탭을 감싼 19줄 껍데기였고,
// 중간지점 추천은 이미 채팅·투표 안에 있어서 탭이 없어도 흐름이 안 끊긴다.
// 지도가 필요하면 내 크루에서 연다(/map은 라우트로 남겨둠).
// 브랜드색 #F5A623 유지.

import React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Compass, ChefHat, LayoutGrid, Users, User } from "lucide-react"

const BRAND = "#F5A623"

export function TabBar() {
  const router = useRouter()
  const pathname = usePathname()

  const tabs = [
    { key: "home", label: "홈", icon: Compass, path: "/", exact: true },
    { key: "kitchen", label: "우리 크루", icon: ChefHat, path: "/kitchen" },
    { key: "feed", label: "탐색", icon: LayoutGrid, path: "/feed" },
    { key: "crews", label: "내 크루", icon: Users, path: "/crews" },
    { key: "profile", label: "프로필", icon: User, path: "/profile" },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-gray-100 bg-white/95 backdrop-blur">
      <div className="flex">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = t.exact ? pathname === t.path : pathname?.startsWith(t.path)
          return (
            <button key={t.key} onClick={() => router.push(t.path)} className="flex flex-1 flex-col items-center gap-0.5 py-2">
              <Icon className="h-5 w-5" style={{ color: active ? BRAND : "#d1d5db" }} />
              <span className="text-[10px] font-medium" style={{ color: active ? BRAND : "#9ca3af" }}>{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
