"use client"

// 🧪 [redesign/group-home] 지도 탭 — 기존 HomeTab(지도) 컴포넌트 그대로 편입.
// 폴더 색 핀·저장 리스트 필터 등 기존 기능 전부 유지.

import React from "react"
import { HomeTab } from "@/components/ui/home-tab"
import { TabBar } from "../tab-bar"

export default function MapTabPage() {
  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-16">
      <HomeTab />
      <TabBar />
    </div>
  )
}
