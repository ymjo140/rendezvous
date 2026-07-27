"use client"

// 🧪 [redesign/group-home] 검색 — 리스트 단위 결과 + 필터 4축(지역·맥락·정렬·재방문 검증)
// 검색의 기본 단위는 장소가 아니라 "믿을 무리가 만든 리스트".

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Search, RotateCw, Bookmark, MapPin, Loader2, BadgeCheck } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type ListBy = { kind: "crew" | "curator"; id: string | number | null; name: string; icon: string; members?: number }
type ListCard = {
  folder_id: number; name: string; icon: string; description: string
  context_tag: string | null; item_count: number; saves: number; revisit: number
  area: string; match: number | null; by: ListBy
}

const TAGS = [
  { tag: "date", label: "데이트", emoji: "💕" },
  { tag: "work", label: "회식", emoji: "🥂" },
  { tag: "drink", label: "술 한잔", emoji: "🍶" },
  { tag: "cafe", label: "카페", emoji: "☕" },
  { tag: "solo", label: "혼밥", emoji: "🍚" },
  { tag: "friends", label: "친구", emoji: "🍻" },
  { tag: "family", label: "가족", emoji: "🍲" },
  { tag: "special", label: "기념일", emoji: "🎂" },
]

const REGIONS = ["성수", "홍대", "강남", "연남", "이태원", "망원", "판교", "성북"]

const SORTS = [
  { key: "match", label: "취향순" },
  { key: "saves", label: "많이 담은순" },
  { key: "revisit", label: "재방문순" },
]

export default function HomeSearchPage() {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [region, setRegion] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [items, setItems] = useState<ListCard[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(async (params: { q: string; region: string | null; tag: string | null; sort: string | null; verified: boolean }) => {
    setLoading(true)
    try {
      const sp = new URLSearchParams()
      if (params.q.trim()) sp.set("q", params.q.trim())
      if (params.region) sp.set("region", params.region)
      if (params.tag) sp.set("tag", params.tag)
      if (params.sort) sp.set("sort", params.sort)
      if (params.verified) sp.set("verified", "true")
      const res = await fetchWithAuth(`/api/home/search?${sp.toString()}`)
      if (res.ok) {
        const d = await res.json()
        setItems(d.items || [])
        setSearched(true)
      }
    } catch {
      /* 네트워크 실패 시 기존 결과 유지 */
    } finally {
      setLoading(false)
    }
  }, [])

  // 필터/검색어 바뀌면 디바운스 재검색
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => run({ q, region, tag, sort, verified }), 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, region, tag, sort, verified, run])

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-16">

      {/* 검색바 */}
      <div className="sticky top-0 z-10 bg-white px-4 pb-1 pt-3">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="rounded-full p-1 text-slate-500">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="리스트 이름·키워드"
              className="w-full bg-transparent text-sm focus:outline-none"
              autoFocus
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
          </div>
        </div>

        {/* 필터 칩: [지역] [맥락8] */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(region === r ? null : r)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                region === r ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              📍 {r}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {TAGS.map((t) => (
            <button
              key={t.tag}
              onClick={() => setTag(tag === t.tag ? null : t.tag)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                tag === t.tag ? "bg-[#F5A623] text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* 정렬 + 재방문 검증 토글 */}
        <div className="mt-1.5 flex items-center gap-1.5 pb-2">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(sort === s.key ? null : s.key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                sort === s.key ? "bg-slate-200 text-slate-900" : "text-slate-400"
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={() => setVerified(!verified)}
            className={`ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              verified ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"
            }`}
          >
            <RotateCw className="h-3 w-3" />재방문 검증만
          </button>
        </div>
      </div>

      {/* 결과: 리스트 단위 */}
      <div className="px-4 pt-2">
        {items.length === 0 && searched && !loading && (
          <div className="py-16 text-center">
            <div className="text-3xl">🔍</div>
            <p className="mt-2 text-sm text-slate-400">조건에 맞는 리스트가 아직 없어요.</p>
            <p className="mt-1 text-[11px] text-slate-300">필터를 풀거나, 우리 크루의 첫 리스트를 만들어보세요.</p>
          </div>
        )}
        <div className="space-y-2.5">
          {items.map((it) => (
            <article
              key={it.folder_id}
              onClick={() => router.push(`/lists/${it.folder_id}`)}
              className="cursor-pointer rounded-2xl border border-slate-100 p-3.5"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-2xl">{it.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold text-slate-900">{it.name}</span>
                    {it.match !== null && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{it.match}%</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-0.5">
                      {it.by.kind === "crew" && <BadgeCheck className="h-3 w-3 text-amber-400" />}
                      by {it.by.name}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {it.area && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                        <MapPin className="h-2.5 w-2.5" />{it.area}
                      </span>
                    )}
                    <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">{it.item_count}곳</span>
                    <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                      <Bookmark className="h-2.5 w-2.5" />{it.saves}
                    </span>
                    {it.revisit > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        <RotateCw className="h-2.5 w-2.5" />재방문 {it.revisit}명
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
