"use client"

import React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Compass, ChefHat, LayoutGrid, Mail, User } from "lucide-react"

const BRAND = "#F5A623"

/**
 * 공개 경험은 크루 마을에서, 운영 기능은 크루 관리에서 연다.
 * /crews와 /map은 기존 링크 호환을 위해 라우트를 유지한다.
 */
export function TabBar() {
  const router = useRouter()
  const pathname = usePathname()

  const tabs = [
    { key: "home", label: "홈", icon: Compass, path: "/", exact: true },
    { key: "town", label: "크루 마을", icon: ChefHat, path: "/kitchen" },
    { key: "feed", label: "탐색", icon: LayoutGrid, path: "/search" },
    { key: "mail", label: "메일", icon: Mail, path: "/mail" },
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
