"use client"

// 🧪 [redesign/group-home] 프로필 탭 — 기존 MyPageTab 그대로 편입.
// 내 폴더(저장)는 여기와 지도 탭 '저장 리스트'에서 접근 (저장 탭 삭제 결정).

import React from "react"
import { MyPageTab } from "@/components/ui/mypage-tab"
import { TabBar } from "../tab-bar"

export default function ProfileTabPage() {
  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-16">
      <MyPageTab />
      <TabBar />
    </div>
  )
}
