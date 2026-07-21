"use client"

// 🧪 [redesign/group-home] 탐색 탭 — 기존 DiscoveryTab(인스타형 피드) 편입.
// 랭킹 스트립(급상승/인기 크루/인기 리스트)은 홈이 품으므로 여기서는 숨김.

import React from "react"
import { DiscoveryTab } from "@/components/ui/discovery-tab"
import { TabBar } from "../tab-bar"

export default function FeedTabPage() {
  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-16">
      <DiscoveryTab hideRankStrips />
      <TabBar />
    </div>
  )
}
