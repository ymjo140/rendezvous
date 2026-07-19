"use client"

// 🧪 [redesign/group-home] 탐색 탭 — 기존 DiscoveryTab(인스타형 피드) 그대로 편입.
// 릴스·게시물·큐레이터·급상승 스트립 등 기존 기능 전부 유지.

import React from "react"
import { DiscoveryTab } from "@/components/ui/discovery-tab"
import { TabBar } from "../tab-bar"

export default function FeedTabPage() {
  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-16">
      <DiscoveryTab />
      <TabBar />
    </div>
  )
}
