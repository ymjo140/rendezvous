"use client"

// ─────────────────────────────────────────────────────────────
// 🧪 [redesign/group-home] 새 홈 v2 — "크루·리스트 중심 발견"
// 구성(피드백 반영): 검색 → 필터(목적/음식) → 랭킹 3줄 → 내 크루 어울리는 가게 → 취향 리스트 → 맥락 랙
// 브랜드색 #F5A623(기존 유지). 실데이터 우선 + mock 폴백.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Sparkles, RotateCw, MapPin, Bookmark, ChevronRight, ChevronDown, BadgeCheck, Flame, Users, ListOrdered } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { TabBar } from "./tab-bar"

const BRAND = "#F5A623"

// ── 타입 ─────────────────────────────────────────────────────
type ListBy = { kind: "crew" | "curator"; id: string | number | null; name: string; icon: string; members?: number }
type ListCard = {
  folder_id: number; name: string; icon: string; description: string
  context_tag: string | null; item_count: number; saves: number; revisit: number
  area: string; match: number | null; by: ListBy
}
type Rack = { tag: string; label: string; emoji: string; items: ListCard[] }
type Feed = {
  taste_matched: ListCard[]; racks: Rack[]
  trending: (ListCard & { rank: number; up: boolean })[]
  logged_in: boolean; has_taste: boolean
}
type CrewPlace = {
  id?: number; place_id?: number; name: string; category?: string; address?: string
  room_name?: string; reason?: string; factors?: { key?: string; label: string }[]
  image?: string | null
}
type RankRow = { label: string; emoji: string; icon: React.ReactNode; items: { name: string; go?: () => void }[]; goAll?: () => void }

// ── 필터 정의 ────────────────────────────────────────────────
const CTX_CHIPS = [
  { tag: "date", label: "데이트", emoji: "💕" },
  { tag: "work", label: "회식", emoji: "🥂" },
  { tag: "drink", label: "술 한잔", emoji: "🍶" },
  { tag: "cafe", label: "카페", emoji: "☕" },
  { tag: "solo", label: "혼밥", emoji: "🍚" },
  { tag: "friends", label: "친구", emoji: "🍻" },
  { tag: "family", label: "가족", emoji: "🍲" },
  { tag: "special", label: "기념일", emoji: "🎂" },
]
const FOOD_CHIPS = [
  { key: "한식", emoji: "🍜" },
  { key: "일식", emoji: "🍣" },
  { key: "양식", emoji: "🍝" },
  { key: "중식", emoji: "🥟" },
  { key: "카페", emoji: "☕" },
  { key: "빵", emoji: "🥐" },
  { key: "술집", emoji: "🍺" },
  { key: "분식", emoji: "🍢" },
]
const FOOD_MATCH: Record<string, string[]> = {
  한식: ["한식", "국밥", "찌개", "고기", "한정식", "백반"],
  일식: ["일식", "초밥", "스시", "라멘", "돈카츠", "이자카야", "우동"],
  양식: ["양식", "파스타", "피자", "스테이크", "버거", "브런치"],
  중식: ["중식", "중국", "마라", "딤섬", "짜장", "양꼬치"],
  카페: ["카페", "커피", "디저트", "케이크", "브런치"],
  빵: ["빵", "베이커리", "베이글", "도넛", "크루아상"],
  술집: ["술집", "주점", "포차", "바", "펍", "호프", "와인", "맥주", "이자카야"],
  분식: ["분식", "떡볶이", "김밥", "만두", "튀김"],
}

// ── mock 폴백 ────────────────────────────────────────────────
const MOCK: Feed = {
  logged_in: false, has_taste: false,
  taste_matched: [
    { folder_id: -1, name: "퇴근하고 와인 한잔 하기 좋은 집", icon: "🍷", description: "", context_tag: "drink", item_count: 8, saves: 312, revisit: 19, area: "성수동", match: 87, by: { kind: "crew", id: "m1", name: "성수 와인 크루", icon: "🍷", members: 24 } },
    { folder_id: -2, name: "줄 서서라도 먹는 라멘 성지", icon: "🍜", description: "", context_tag: "solo", item_count: 12, saves: 508, revisit: 31, area: "연남동", match: 81, by: { kind: "crew", id: "m2", name: "라멘 원정 크루", icon: "🍜", members: 41 } },
  ],
  racks: [
    { tag: "work", label: "회식 실패 없는", emoji: "🥂", items: [
      { folder_id: -3, name: "팀 회식 실패 없는 고깃집", icon: "🥩", description: "", context_tag: "work", item_count: 6, saves: 120, revisit: 14, area: "역삼동", match: null, by: { kind: "crew", id: "m3", name: "강남 직장인 크루", icon: "🏢", members: 33 } },
      { folder_id: -4, name: "부장님도 만족한 한정식", icon: "🍲", description: "", context_tag: "work", item_count: 5, saves: 88, revisit: 9, area: "판교", match: null, by: { kind: "crew", id: "m4", name: "판교 개발자 크루", icon: "💻", members: 21 } },
    ]},
    { tag: "date", label: "데이트하기 좋은", emoji: "💕", items: [
      { folder_id: -5, name: "분위기 좋은 파스타집", icon: "🍝", description: "", context_tag: "date", item_count: 7, saves: 204, revisit: 11, area: "연남동", match: null, by: { kind: "crew", id: "m5", name: "연남 데이트 크루", icon: "💕", members: 12 } },
    ]},
  ],
  trending: [],
}
const MOCK_CREW_PLACES: CrewPlace[] = [
  { name: "아우어 베이커리", category: "빵집", address: "성수동", room_name: "빵 탐방 크루", factors: [{ label: "크루 취향 저격" }] },
  { name: "소금빵연구소", category: "베이커리", address: "연남동", room_name: "빵 탐방 크루", factors: [{ label: "🔁 유사 크루 재방문" }] },
  { name: "앤트러사이트", category: "카페", address: "합정동", room_name: "빵 탐방 크루", factors: [{ label: "멤버 2명 저장" }] },
]

const catEmoji = (c?: string) => {
  const s = c || ""
  if (/빵|베이커리/.test(s)) return "🥐"
  if (/카페|커피|디저트/.test(s)) return "☕"
  if (/일식|초밥|스시|라멘/.test(s)) return "🍣"
  if (/술|주점|포차|바|펍|호프|와인|맥주|이자카야/.test(s)) return "🍺"
  if (/중식|마라|양꼬치/.test(s)) return "🥟"
  if (/양식|파스타|피자|스테이크|버거/.test(s)) return "🍝"
  if (/분식|떡볶이/.test(s)) return "🍢"
  return "🍚"
}

export default function HomeNextPage() {
  const router = useRouter()
  const [feed, setFeed] = useState<Feed>(MOCK)
  const [live, setLive] = useState(false)
  const [ctx, setCtx] = useState<string | null>(null)      // 목적 필터
  const [food, setFood] = useState<string | null>(null)    // 음식 필터

  // 랭킹 3줄
  const [hotPlaces, setHotPlaces] = useState<{ name: string; place_id?: number }[]>([])
  const [hotCrews, setHotCrews] = useState<{ id: string; title: string }[]>([])
  const [hotLists, setHotLists] = useState<{ folder_id: number; name: string }[]>([])

  // 내 크루 어울리는 가게
  const [crewPlaces, setCrewPlaces] = useState<CrewPlace[]>(MOCK_CREW_PLACES)
  const [crewLive, setCrewLive] = useState(false)
  const [crewSel, setCrewSel] = useState<string | null>(null)
  const [crewOpen, setCrewOpen] = useState(false)

  useEffect(() => {
    let alive = true
    // 홈 피드(취향 리스트 + 랙)
    fetchWithAuth("/api/home/feed")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Feed | null) => {
        if (!alive || !d) return
        const hasAny = (d.taste_matched?.length || 0) + (d.racks?.length || 0) > 0
        if (hasAny) { setFeed({ ...d, racks: d.racks?.length ? d.racks : MOCK.racks }); setLive(true) }
      })
      .catch(() => {})
    // 랭킹: 급상승 장소 / 인기 크루 / 인기 리스트
    fetchWithAuth("/api/trending/places?days=7&limit=4")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => { if (alive && d?.items?.length) setHotPlaces(d.items.map((x: any) => ({ name: x.name || x.place_name || "장소", place_id: x.place_id }))) })
      .catch(() => {})
    fetchWithAuth("/api/group-ranking")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => { if (alive && d?.items?.length) setHotCrews(d.items.slice(0, 4).map((x: any) => ({ id: x.id, title: x.title || x.name || "크루" }))) })
      .catch(() => {})
    fetchWithAuth("/api/list-ranking?limit=4")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => { if (alive && d?.items?.length) setHotLists(d.items.map((x: any) => ({ folder_id: x.folder_id, name: x.name }))) })
      .catch(() => {})
    // 내 크루 어울리는 가게 (기존 모임 추천 엔진 재활용)
    fetchWithAuth("/api/recommend/my-meetings?per_room=12")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (!alive) return
        const ps: CrewPlace[] = d?.places || []
        if (ps.length) { setCrewPlaces(ps); setCrewLive(true) }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const crewNames = useMemo(() => {
    const names: string[] = []
    crewPlaces.forEach((p) => { if (p.room_name && !names.includes(p.room_name)) names.push(p.room_name) })
    return names
  }, [crewPlaces])
  const activeCrew = crewSel && crewNames.includes(crewSel) ? crewSel : crewNames[0] || null

  // 필터 적용
  const foodTest = (s?: string) => {
    if (!food) return true
    const kws = FOOD_MATCH[food] || [food]
    return kws.some((k) => (s || "").includes(k))
  }
  const shownCrewPlaces = useMemo(
    () => crewPlaces.filter((p) => (!activeCrew || p.room_name === activeCrew) && foodTest(p.category)).slice(0, 12),
    [crewPlaces, activeCrew, food] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const shownTaste = useMemo(
    () => feed.taste_matched.filter((l) => !ctx || l.context_tag === ctx).slice(0, 8),
    [feed.taste_matched, ctx]
  )
  const shownRacks = useMemo(
    () => feed.racks.filter((r) => !ctx || r.tag === ctx),
    [feed.racks, ctx]
  )

  const rankRows: RankRow[] = [
    { label: "급상승", emoji: "🔥", icon: <Flame className="h-3.5 w-3.5 text-rose-500" />, items: hotPlaces.map((p) => ({ name: p.name, go: p.place_id ? () => router.push(`/places/${p.place_id}`) : undefined })), goAll: () => router.push("/trending") },
    { label: "인기 크루", emoji: "👥", icon: <Users className="h-3.5 w-3.5" style={{ color: BRAND }} />, items: hotCrews.map((c) => ({ name: c.title, go: () => router.push(`/home-next/crew/${c.id}`) })) },
    { label: "인기 리스트", emoji: "📋", icon: <ListOrdered className="h-3.5 w-3.5 text-emerald-600" />, items: hotLists.map((l) => ({ name: l.name, go: () => router.push(`/lists/${l.folder_id}`) })) },
  ]

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-24">
      <div className="px-4 py-1.5 text-center text-[11px] font-medium text-white" style={{ backgroundColor: BRAND }}>
        🧪 새 홈 프로토타입 v2 · {live ? "실데이터" : "mock"}
      </div>

      {/* ① 검색바 */}
      <div className="sticky top-0 z-10 bg-white px-4 pb-2 pt-3">
        <button
          onClick={() => router.push("/home-next/search")}
          className="flex w-full items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-left"
        >
          <Search className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-400">성수 데이트, 강남 회식…</span>
        </button>

        {/* ② 필터 — 목적 / 음식 */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <button
            onClick={() => setCtx(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold ${ctx === null ? "text-white" : "bg-gray-100 text-gray-500"}`}
            style={ctx === null ? { backgroundColor: "#111827" } : undefined}
          >전체</button>
          {CTX_CHIPS.map((c) => (
            <button
              key={c.tag}
              onClick={() => setCtx(ctx === c.tag ? null : c.tag)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium ${ctx === c.tag ? "text-white" : "bg-gray-100 text-gray-500"}`}
              style={ctx === c.tag ? { backgroundColor: BRAND } : undefined}
            >{c.emoji} {c.label}</button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {FOOD_CHIPS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFood(food === f.key ? null : f.key)}
              className={`shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-medium ${
                food === f.key ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-500"
              }`}
              style={food === f.key ? { backgroundColor: BRAND } : undefined}
            >{f.emoji} {f.key}</button>
          ))}
        </div>
      </div>

      {/* ③ 랭킹 3줄 */}
      <div className="mx-4 mt-1 divide-y divide-gray-100 rounded-2xl border border-gray-100">
        {rankRows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 px-3 py-2.5">
            <span className="flex w-[74px] shrink-0 items-center gap-1 text-[11px] font-bold text-gray-700">{row.icon}{row.label}</span>
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap">
              {row.items.length === 0 ? (
                <span className="text-[11px] text-gray-300">집계 중</span>
              ) : row.items.slice(0, 3).map((it, i) => (
                <button key={i} onClick={it.go} className="flex shrink-0 items-center gap-1 text-[11.5px] text-gray-800">
                  <em className="not-italic font-bold" style={{ color: BRAND }}>{i + 1}</em>
                  <span className="max-w-[92px] truncate font-medium">{it.name}</span>
                </button>
              ))}
            </div>
            <button onClick={row.goAll} className="shrink-0 text-gray-300"><ChevronRight className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      {/* ④ 내 크루에 어울리는 곳 — 기존 모임 추천 엔진 재활용 */}
      {crewNames.length > 0 && (
        <section className="px-4 pt-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-gray-900">
              {catEmoji(shownCrewPlaces[0]?.category)} {activeCrew ? `${activeCrew}에 어울리는 곳` : "내 크루에 어울리는 곳"}
            </h2>
            {crewNames.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setCrewOpen(!crewOpen)}
                  className="flex items-center gap-0.5 text-[12px] font-semibold"
                  style={{ color: BRAND }}
                >크루 바꾸기<ChevronDown className="h-3.5 w-3.5" /></button>
                {crewOpen && (
                  <div className="absolute right-0 top-6 z-20 w-44 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                    {crewNames.map((n) => (
                      <button
                        key={n}
                        onClick={() => { setCrewSel(n); setCrewOpen(false) }}
                        className={`block w-full truncate px-3 py-2 text-left text-[12px] ${n === activeCrew ? "font-bold" : "text-gray-600"}`}
                        style={n === activeCrew ? { color: BRAND } : undefined}
                      >{n}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-400">크루 취향·저장·재방문 기록으로 골랐어요 {!crewLive && "(예시)"}</p>
          <div className="mt-2.5 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {shownCrewPlaces.length === 0 ? (
              <div className="w-full rounded-2xl border-2 border-dashed border-gray-200 py-8 text-center text-[12px] text-gray-400">
                이 필터에 맞는 추천이 아직 없어요
              </div>
            ) : shownCrewPlaces.map((p, i) => (
              <article
                key={`${p.name}-${i}`}
                onClick={() => { const pid = p.place_id || p.id; if (pid) router.push(`/places/${pid}`) }}
                className="w-[136px] shrink-0 cursor-pointer rounded-2xl border border-gray-100 p-2.5"
              >
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="h-[68px] w-full rounded-xl object-cover" />
                ) : (
                  <div className="flex h-[68px] w-full items-center justify-center rounded-xl bg-gray-50 text-3xl">{catEmoji(p.category)}</div>
                )}
                <div className="mt-1.5 truncate text-[12px] font-semibold text-gray-900">{p.name}</div>
                <div className="truncate text-[10px] text-gray-400">{p.category || "맛집"}{p.address ? ` · ${p.address.split(" ").slice(1, 2)}` : ""}</div>
                {p.factors && p.factors[0] && (
                  <span className="mt-1 inline-block rounded-md bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-700">
                    {p.factors[0].label}
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ⑤ 취향 매칭 리스트 */}
      <section className="px-4 pt-5">
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" style={{ color: BRAND }} />
          <h2 className="text-[15px] font-bold text-gray-900">
            {feed.has_taste ? "나와 입맛 겹치는 크루의 리스트" : "요즘 많이 담는 리스트"}
          </h2>
        </div>
        {shownTaste.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 py-8 text-center text-[12px] text-gray-400">
            이 목적의 리스트가 아직 없어요 — 첫 리스트의 주인이 되어보세요!
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {shownTaste.map((g) => (
              <article
                key={g.folder_id}
                onClick={() => {
                  if (g.by.kind === "crew" && g.by.id) router.push(`/home-next/crew/${g.by.id}`)
                  else if (g.folder_id > 0) router.push(`/lists/${g.folder_id}`)
                }}
                className="w-[250px] shrink-0 cursor-pointer rounded-2xl border border-gray-100 p-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-xl">{g.by.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-sm font-semibold text-gray-900">{g.by.name}</span>
                      {g.by.kind === "crew" && <BadgeCheck className="h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />}
                    </div>
                    <div className="text-[11px] text-gray-400">{g.by.kind === "crew" ? `멤버 ${g.by.members}명 · 크루` : "큐레이터"}</div>
                  </div>
                  {g.match !== null && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{g.match}%</span>
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  <span>{g.icon}</span><span className="truncate">{g.name}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
                  <MapPin className="h-3 w-3" />{g.area || "여러 지역"} · {g.item_count}곳
                  <span className="mx-0.5">·</span>
                  <Bookmark className="h-3 w-3" />{g.saves}
                </div>
                {g.revisit > 0 && (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    <RotateCw className="h-2.5 w-2.5" />재방문 의사 {g.revisit}명
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ⑥ 맥락별 랙 (목적 필터 시 해당 랙만) */}
      {shownRacks.map((rack) => (
        <section key={rack.tag} className="px-4 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-gray-900">{rack.emoji} {rack.label}</h2>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {rack.items.map((it) => (
              <article
                key={it.folder_id}
                onClick={() => { if (it.folder_id > 0) router.push(`/lists/${it.folder_id}`) }}
                className="w-[185px] shrink-0 cursor-pointer rounded-2xl border border-gray-100 p-3"
              >
                <div className="flex h-24 w-full items-center justify-center rounded-xl bg-gray-50 text-4xl">{it.icon}</div>
                <div className="mt-2 truncate text-[13px] font-semibold leading-tight text-gray-900">{it.name}</div>
                <div className="mt-1 truncate text-[11px] text-gray-400">by {it.by.name}</div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {it.revisit > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      <RotateCw className="h-2.5 w-2.5" />재방문 {it.revisit}명
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500">
                    <Bookmark className="h-2.5 w-2.5" />{it.saves}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <TabBar />
    </div>
  )
}
