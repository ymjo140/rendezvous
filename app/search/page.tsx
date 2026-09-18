"use client"

// 장소·크루·리스트를 하나의 발견 스트림으로 보여준다.
// 장소와 크루를 별도 탭으로 나누지 않고, 검색어·방문 신뢰도·저장·취향 신호로
// 서버가 정렬한 결과를 인스타그램 Explore처럼 자연스럽게 섞어 내려받는다.

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BadgeCheck,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { stockCandidates } from "@/lib/stock-image"
import { TabBar } from "../tab-bar"

type DiscoveryItem = {
  kind: "place" | "crew" | "list"
  label: string
  id: string | number
  name: string
  description?: string | null
  image?: string | null
  icon?: string | null
  href?: string
  reason?: string | null
  cuisine?: string | null
  address?: string | null
  area?: string | null
  members?: number
  lists?: number
  followers?: number
  saves?: number
  verified_visits?: number
  revisits?: number
  trust_status?: "observed" | "collecting"
  score?: number | null
  preview_places?: string[]
  is_following?: boolean
  years_open?: number | null
  budget?: string | null
}

type LegacyList = {
  folder_id: number
  name: string
  description?: string
  icon?: string
  cover_image?: string | null
  item_count?: number
  saves?: number
  revisit?: number
  area?: string
  by?: { kind?: string; id?: string | number; name?: string }
  reason?: string | null
}

type LegacyPlace = {
  id: number
  name: string
  cuisine?: string
  category?: string
  address?: string
  image?: string | null
  reason?: string
  revisit?: number
  rank?: number
}

type Interp = {
  region: { name: string; lat: number; lng: number; source: string } | null
  foods: string[]
  tags: string[]
  residual_q: string
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
  { key: "saves", label: "많이 저장된 순" },
  { key: "revisit", label: "재방문 순" },
]

function normalizeDiscovery(data: {
  discovery?: DiscoveryItem[]
  items?: LegacyList[]
  places?: LegacyPlace[]
}): DiscoveryItem[] {
  if (Array.isArray(data.discovery) && data.discovery.length > 0) return data.discovery

  const lists: DiscoveryItem[] = (data.items || []).map((item) => ({
    kind: item.by?.kind === "crew" ? "crew" : "list",
    label: item.by?.kind === "crew" ? "크루" : "리스트",
    id: item.by?.kind === "crew" && item.by.id ? item.by.id : item.folder_id,
    name: item.name,
    description: item.description || `${item.item_count || 0}곳을 담은 기록`,
    image: item.cover_image,
    icon: item.icon || "📁",
    href: item.by?.kind === "crew" && item.by.id ? `/crew/${encodeURIComponent(String(item.by.id))}` : `/lists/${item.folder_id}`,
    reason: item.reason || "공개 기록",
    area: item.area,
    saves: item.saves || 0,
    revisits: item.revisit || 0,
  }))
  const places: DiscoveryItem[] = (data.places || []).map((place) => ({
    kind: "place",
    label: "장소",
    id: place.id,
    name: place.name,
    description: place.address || "",
    image: place.image,
    cuisine: place.cuisine || place.category || "",
    reason: place.reason || "새롭게 발견된 장소",
    revisits: place.revisit || 0,
    href: `/places/${place.id}`,
    score: place.rank,
  }))
  return [...lists, ...places]
}

function getImage(item: DiscoveryItem) {
  if (item.image) return item.image
  if (item.kind === "place") return stockCandidates(item.name, item.cuisine || undefined)[0]
  return null
}

function kindStyle(kind: DiscoveryItem["kind"]) {
  if (kind === "crew") return "bg-[#f3edff] text-[#5b4b9b]"
  if (kind === "place") return "bg-[#fff0dc] text-[#a45e25]"
  return "bg-[#eef3f7] text-[#526576]"
}

function hrefFor(item: DiscoveryItem) {
  if (item.href) return item.href
  if (item.kind === "place") return `/places/${item.id}`
  if (item.kind === "crew") return `/crew/${encodeURIComponent(String(item.id))}`
  return `/lists/${item.id}`
}

function DiscoveryCard({ item, onOpen }: { item: DiscoveryItem; onOpen: () => void }) {
  const image = getImage(item)
  const verified = (item.verified_visits || 0) >= 3 || item.trust_status === "observed"

  return (
    <article className="overflow-hidden rounded-[22px] border border-[#eee4d9] bg-white shadow-[0_4px_14px_rgba(82,55,34,0.05)]">
      <button type="button" onClick={onOpen} className="flex w-full gap-3 p-3 text-left active:bg-[#fffaf4]">
        <div className="relative h-[82px] w-[82px] shrink-0 overflow-hidden rounded-2xl bg-[#f8efe3]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl">{item.icon || (item.kind === "crew" ? "👥" : "📍")}</span>
          )}
          <span className={`absolute bottom-1.5 left-1.5 rounded-full px-2 py-1 text-[9px] font-extrabold ${kindStyle(item.kind)}`}>
            {item.label}
          </span>
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-start gap-1.5">
            <h3 className="min-w-0 flex-1 truncate text-[14px] font-black tracking-[-0.02em] text-[#31251e]">{item.name}</h3>
            {verified && <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="검증 방문 데이터 있음" />}
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#cfc2b5]" />
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#806f61]">
            {item.description || "좋은 사람들과 좋은 장소를 기록하는 중이에요."}
          </p>
          <p className="mt-1.5 truncate text-[10.5px] font-semibold text-[#bb7131]">
            {item.reason || "당신을 위한 발견"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[#9b8b7d]">
            {item.kind === "crew" && (
              <>
                <span className="inline-flex items-center gap-0.5"><Users className="h-3 w-3" />멤버 {item.members || 0}명</span>
                <span>·</span>
                <span>방문 {item.verified_visits || 0}회</span>
                {item.trust_status === "collecting" && <span className="text-[#aa9a8e]">데이터 수집 중</span>}
              </>
            )}
            {item.kind === "place" && (
              <>
                <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{item.cuisine || item.area || "장소"}</span>
                <span>·</span>
                <span>저장 {item.saves || 0}</span>
                {item.verified_visits ? <span>· 검증 방문 {item.verified_visits}</span> : null}
              </>
            )}
            {item.kind === "list" && (
              <>
                <span>{item.area || "공개 리스트"}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5"><Bookmark className="h-3 w-3" />{item.saves || 0}</span>
              </>
            )}
          </div>
        </div>
      </button>
      {item.kind === "crew" && item.preview_places && item.preview_places.length > 0 && (
        <div className="border-t border-[#f1e9e1] px-3 py-2 text-[10px] text-[#8b7869]">
          함께 기록한 곳 · {item.preview_places.join(" · ")}
        </div>
      )}
    </article>
  )
}

export default function HomeSearchPage() {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [region, setRegion] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [discovery, setDiscovery] = useState<DiscoveryItem[]>([])
  const [interp, setInterp] = useState<Interp | null>(null)
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
        const data = await res.json()
        setDiscovery(normalizeDiscovery(data))
        setInterp(data.interpretation || null)
        setSearched(true)
      }
    } catch {
      // 백그라운드 갱신 실패 시 마지막 결과를 유지한다.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => run({ q, region, tag, sort, verified }), 350)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, region, tag, sort, verified, run])

  const hasInterpretation = Boolean(interp && (interp.region || interp.foods.length > 0 || interp.tags.length > 0 || interp.residual_q))

  return (
    <div className="mx-auto min-h-screen max-w-md bg-[#fcfbf8] pb-16">
      <div className="sticky top-0 z-20 border-b border-[#eee6de] bg-[#fcfbf8]/95 px-4 pb-3 pt-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="rounded-full p-1 text-[#7f6e60]" aria-label="뒤로가기">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold tracking-[0.14em] text-[#b17b4f]">DISCOVER</p>
            <h1 className="text-[17px] font-black tracking-[-0.04em] text-[#31251e]">탐색</h1>
          </div>
          <div className="ml-auto flex flex-1 items-center gap-2 rounded-2xl border border-[#e8ddd2] bg-white px-3.5 py-2.5 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-[#a08f80]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="장소·크루·리스트 검색"
              className="w-full bg-transparent text-[13px] text-[#352a22] outline-none placeholder:text-[#b4a79c]"
              autoFocus
              aria-label="장소 크루 리스트 검색"
            />
            {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#c59a74]" />}
          </div>
        </div>
      </div>

      <section className="px-4 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-[#a7866d]">장소와 크루를 함께 발견해요</p>
            <h2 className="mt-1 text-[20px] font-black tracking-[-0.05em] text-[#31251e]">
              {q.trim() ? `'${q.trim()}' 관련 발견` : "당신을 위한 발견"}
            </h2>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#987b65] shadow-sm">
            하나의 추천 피드
          </span>
        </div>

        {hasInterpretation && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] font-semibold text-[#a28e7c]">이렇게 찾았어요</span>
            {interp?.region && <span className="rounded-full bg-[#3f3027] px-2 py-1 text-[10px] font-bold text-white">📍 {interp.region.name}</span>}
            {interp?.foods.map((food) => <span key={food} className="rounded-full bg-[#fff0dc] px-2 py-1 text-[10px] font-bold text-[#a45e25]">{food}</span>)}
            {interp?.tags.map((tagName) => <span key={tagName} className="rounded-full bg-[#f3edff] px-2 py-1 text-[10px] font-bold text-[#5b4b9b]">{TAGS.find((item) => item.tag === tagName)?.label || tagName}</span>)}
            {interp?.residual_q && <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[#806f61]">“{interp.residual_q}”</span>}
          </div>
        )}

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {REGIONS.map((item) => (
            <button key={item} onClick={() => setRegion(region === item ? null : item)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${region === item ? "bg-[#3f3027] text-white" : "bg-white text-[#806f61] shadow-sm"}`}>
              📍 {item}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {TAGS.map((item) => (
            <button key={item.tag} onClick={() => setTag(tag === item.tag ? null : item.tag)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${tag === item.tag ? "bg-[#d97738] text-white" : "bg-white text-[#806f61] shadow-sm"}`}>
              {item.emoji} {item.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {SORTS.map((item) => (
            <button key={item.key} onClick={() => setSort(sort === item.key ? null : item.key)} className={`rounded-full px-2.5 py-1.5 text-[10.5px] font-bold ${sort === item.key ? "bg-[#eee1d5] text-[#5b402e]" : "text-[#a28e7c]"}`}>
              {item.label}
            </button>
          ))}
          <button onClick={() => setVerified(!verified)} className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10.5px] font-bold ${verified ? "bg-[#e9f6ed] text-[#267347]" : "bg-white text-[#9f9084] shadow-sm"}`}>
            <RotateCw className="h-3 w-3" /> 인증 기록만
          </button>
        </div>
      </section>

      <main className="px-4 pt-5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-black text-[#49362a]"><Sparkles className="h-3.5 w-3.5 text-[#d97738]" /> 추천 발견</div>
          <span className="text-[10px] text-[#aa998b]">장소 · 크루 · 리스트</span>
        </div>

        {!searched && loading && (
          <div className="space-y-2.5" aria-label="검색 결과 불러오는 중">
            {[1, 2, 3].map((item) => <div key={item} className="h-[118px] animate-pulse rounded-[22px] bg-[#f1e8df]" />)}
          </div>
        )}

        {searched && discovery.length === 0 && !loading && (
          <div className="rounded-[22px] border border-dashed border-[#dfd1c4] bg-white px-5 py-12 text-center">
            <div className="text-3xl">🔍</div>
            <p className="mt-2.5 text-[13px] font-bold text-[#624b3b]">아직 관련 기록이 없어요.</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#a18f80]">다른 키워드를 검색하거나, 우리 크루의 첫 장소를 기록해보세요.</p>
          </div>
        )}

        <div className="space-y-2.5">
          {discovery.map((item) => (
            <DiscoveryCard key={`${item.kind}-${item.id}`} item={item} onOpen={() => router.push(hrefFor(item))} />
          ))}
        </div>

        {searched && discovery.length > 0 && (
          <div className="mt-4 flex items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-3 text-[10.5px] font-semibold text-[#9b8878]">
            <BadgeCheck className="h-3.5 w-3.5 text-[#d97738]" />
            검증된 방문 기록은 추천과 랭킹에 더 강하게 반영돼요.
          </div>
        )}
      </main>
      <TabBar />
    </div>
  )
}
