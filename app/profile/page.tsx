"use client"

// ─────────────────────────────────────────────────────────────
// 👤 MY — 계정 설정 · 내 활동 · 알림 관리
// 기존 MyPageTab을 기반으로, 모임 관리/랭킹 진입점 제공.
// 프로필 스탯(방문 맛집, 총 모임, 포인트) + 내 활동 메뉴 + 설정.
// ─────────────────────────────────────────────────────────────

import React from "react"
import { MyPageTab } from "@/components/ui/mypage-tab"
import { TabBar } from "../tab-bar"

export default function MyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-md bg-[#F5F9F8] pb-16">
      <MyPageTab />
      <TabBar />
    </div>
  )
}
