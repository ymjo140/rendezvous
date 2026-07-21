"use client"

// 🧪 [redesign/group-home] 지도 탭 — 기존 HomeTab(지도) 편입.
// HomeTab은 h-full 체인이라 부모에 명시적 뷰포트 높이가 필요(비면 지도가 0px로 접힘).

import React from "react"
import { HomeTab } from "@/components/ui/home-tab"
import { TabBar } from "../tab-bar"

export default function MapTabPage() {
  return (
    <div className="mx-auto h-[100dvh] max-w-md overflow-hidden bg-white">
      <div className="h-full pb-14">
        <HomeTab />
      </div>
      <TabBar />
    </div>
  )
}
