"use client"

// 🧪 [redesign/group-home] 하단 5탭 — 홈·지도·탐색·내 크루·프로필
// 지도/탐색/프로필은 기존 탭 컴포넌트를 프로토타입 라우트에 직접 편입(외부 점프 없음).
// 브랜드색 #F5A623 유지.

import React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Compass, Map, LayoutGrid, Users, User } from "lucide-react"

const BRAND = "#F5A623"

export function TabBar() {
  const router = useRouter()
  const pathname = usePathname()

  const tabs = [
    { key: "home", label: "홈", icon: Compass, path: "/", exact: true },
    { key: "map", label: "지도", icon: Map, path: "/map" },
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
