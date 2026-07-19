"use client"

// 🧪 [redesign/group-home] 하단 5탭 — 홈·탐색·내 크루·저장·프로필 (결정 E)
// 탐색/프로필은 기존 앱 탭 재활용: sessionStorage.activeTab 지정 후 루트로 이동.

import React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Compass, Map, Users, Bookmark, User } from "lucide-react"

export function TabBar() {
  const router = useRouter()
  const pathname = usePathname()

  const goLegacyTab = (tab: string) => {
    try { sessionStorage.setItem("activeTab", tab) } catch { /* ignore */ }
    router.push("/")
  }

  const tabs = [
    { key: "home", label: "홈", icon: Compass, active: pathname === "/home-next", go: () => router.push("/home-next") },
    { key: "explore", label: "탐색", icon: Map, active: false, go: () => goLegacyTab("home") },
    { key: "crews", label: "내 크루", icon: Users, active: pathname?.startsWith("/home-next/crews"), go: () => router.push("/home-next/crews") },
    { key: "saves", label: "저장", icon: Bookmark, active: pathname?.startsWith("/home-next/saves"), go: () => router.push("/home-next/saves") },
    { key: "profile", label: "프로필", icon: User, active: false, go: () => goLegacyTab("mypage") },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-slate-100 bg-white/95 backdrop-blur">
      <div className="flex">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={t.go} className="flex flex-1 flex-col items-center gap-0.5 py-2">
              <Icon className={`h-5 w-5 ${t.active ? "text-violet-600" : "text-slate-400"}`} />
              <span className={`text-[10px] font-medium ${t.active ? "text-violet-600" : "text-slate-400"}`}>{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
