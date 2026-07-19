"use client"

// 🧪 [redesign/group-home] 전체보기 — 랙(맥락 태그)/크루 리스트/큐레이터 리스트의 풀 리스트.
// mode=tag&tag=date | mode=crew | mode=curator

import React, { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, RotateCw, Bookmark, BadgeCheck, MapPin } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

const BRAND = "#F5A623"

type ListBy = { kind: "crew" | "curator"; id: string | number | null; name: string; icon: string; members?: number }
type ListCard = {
  folder_id: number; name: string; icon: string; description: string
  context_tag: string | null; item_count: number; saves: number; revisit: number
  area: string; match: number | null; by: ListBy
}

const TAG_TITLE: Record<string, string> = {
  date: "💕 데이트하기 좋은", work: "🥂 회식 실패 없는", drink: "🍶 술 한잔 하기 좋은",
  cafe: "☕ 카페·디저트 성지", solo: "🍚 혼밥·혼술 환영", friends: "🍻 친구랑 가기 좋은",
  family: "🍲 가족 외식으로", special: "🎂 기념일에 좋은",
}

function BrowseInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const mode = sp.get("mode") || "tag"
  const tag = sp.get("tag") || ""
  const [items, setItems] = useState<ListCard[]>([])
  const [loading, setLoading] = useState(true)

  const title =
    mode === "crew" ? "👥 크루의 리스트 전체" :
    mode === "curator" ? "✨ 큐레이터의 리스트 전체" :
    TAG_TITLE[tag] || "리스트 전체"

  useEffect(() => {
    const q = new URLSearchParams()
    if (mode === "tag" && tag) q.set("tags", tag)
    fetchWithAuth(`/api/home/search?${q.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        let list: ListCard[] = d?.items || []
        if (mode === "crew") list = list.filter((l) => l.by.kind === "crew")
        if (mode === "curator") list = list.filter((l) => l.by.kind === "curator")
        setItems(list)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [mode, tag])

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-16">
      <div className="px-4 py-1.5 text-center text-[11px] font-medium text-white" style={{ backgroundColor: BRAND }}>
        🧪 새 홈 프로토타입 · 전체보기
      </div>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-white px-4 py-3">
        <button onClick={() => router.back()} className="rounded-full p-1 text-gray-500"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-bold text-gray-900">{title}</h1>
        <span className="shrink-0 text-[12px] text-gray-400">{items.length}개</span>
      </div>

      <div className="px-4">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-300">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 py-10 text-center">
            <p className="text-[13px] text-gray-400">아직 리스트가 없어요.</p>
            <p className="mt-1 text-[11px] text-gray-300">우리 크루가 첫 리스트의 주인이 될 기회예요!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <article
                key={it.folder_id}
                onClick={() => router.push(`/lists/${it.folder_id}`)}
                className="flex cursor-pointer items-center gap-3 rounded-2xl border border-gray-100 p-3"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-2xl">{it.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <b className="truncate text-[13.5px] font-semibold text-gray-900">{it.name}</b>
                    {it.match !== null && <em className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold not-italic text-amber-700">{it.match}%</em>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                    {it.by.kind === "crew" && <BadgeCheck className="h-3 w-3 shrink-0" style={{ color: BRAND }} />}
                    <span className="truncate">by {it.by.name}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {it.area && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">
                        <MapPin className="h-2.5 w-2.5" />{it.area}
                      </span>
                    )}
                    <span className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">{it.item_count}곳</span>
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">
                      <Bookmark className="h-2.5 w-2.5" />{it.saves}
                    </span>
                    {it.revisit > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        <RotateCw className="h-2.5 w-2.5" />재방문 {it.revisit}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function BrowsePage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-300">불러오는 중...</div>}>
      <BrowseInner />
    </Suspense>
  )
}
