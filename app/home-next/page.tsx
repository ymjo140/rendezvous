"use client"

// ─────────────────────────────────────────────────────────────
// 🧪 [redesign/group-home] 새 홈 v2.1 — "크루·리스트 중심 발견"
// 검색 → 필터(시트·중복선택) → 랭킹 3줄 → 크루 맞춤 가게 → 크루 리스트 / 큐레이터 리스트 분리 → 맥락 랙
// 브랜드색 #F5A623. 실데이터 우선 + mock 폴백.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Sparkles, RotateCw, MapPin, Bookmark, ChevronRight, ChevronDown, BadgeCheck, Flame, Users, ListOrdered, SlidersHorizontal, X } from "lucide-react"
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
  logged_in: boolean; has_taste: boolean
}
type CrewPlace = {
  id?: number; place_id?: number; name: string; category?: string; address?: string
  room_name?: string; reason?: string; factors?: { key?: string; label: string }[]
  image?: string | null
}

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
type Anchor = { name: string; lat: number; lng: number }
const QUICK_REGIONS: Anchor[] = [
  { name: "강남", lat: 37.498, lng: 127.0276 },
  { name: "홍대", lat: 37.5572, lng: 126.9245 },
  { name: "성수", lat: 37.5446, lng: 127.0559 },
  { name: "을지로", lat: 37.5663, lng: 126.9925 },
  { name: "잠실", lat: 37.5133, lng: 127.1001 },
]
type PlaceHit = { id: number; name: string; cuisine: string; category: string; address: string; rating: number; review_count: number; image: string | null; dist_km: number | null }
const FOOD_CHIPS = ["한식", "일식", "양식", "중식", "카페", "빵", "술집", "분식"]
const FOOD_EMOJI: Record<string, string> = { 한식: "🍜", 일식: "🍣", 양식: "🍝", 중식: "🥟", 카페: "☕", 빵: "🥐", 술집: "🍺", 분식: "🍢" }
const FOOD_MATCH: Record<string, string[]> = {
  한식: ["한식", "국밥", "찌개", "고기", "한정식", "백반"],
  일식: ["일식", "초밥", "스시", "라멘", "돈카츠", "우동"],
  양식: ["양식", "파스타", "피자", "스테이크", "버거", "브런치"],
  중식: ["중식", "중국", "마라", "딤섬", "짜장", "양꼬치"],
  카페: ["카페", "커피", "디저트", "케이크"],
  빵: ["빵", "베이커리", "베이글", "도넛", "크루아상"],
  술집: ["술집", "주점", "포차", "바", "펍", "호프", "와인", "맥주", "이자카야"],
  분식: ["분식", "떡볶이", "김밥", "만두", "튀김"],
}

// ── mock 폴백 ────────────────────────────────────────────────
const MOCK: Feed = {
  logged_in: false, has_taste: false,
  taste_matched: [
    { folder_id: -1, name: "퇴근하고 와인 한잔 하기 좋은 집", icon: "🍷", description: "", context_tag: "drink", item_count: 8, saves: 312, revisit: 19, area: "성수동", match: 87, by: { kind: "crew", id: "m1", name: "성수 와인 크루", icon: "🍷", members: 24 } },
    { folder_id: -2, name: "홍대 이자카야 8선", icon: "🍶", description: "", context_tag: "drink", item_count: 8, saves: 96, revisit: 12, area: "서교동", match: 74, by: { kind: "curator", id: null, name: "안주 성애자", icon: "🍢" } },
  ],
  racks: [],
}
const MOCK_CREW_PLACES: CrewPlace[] = [
  { name: "아우어 베이커리", category: "빵집", address: "서울 성수동", room_name: "빵 탐방 크루", factors: [{ label: "크루 취향 저격" }] },
  { name: "소금빵연구소", category: "베이커리", address: "서울 연남동", room_name: "빵 탐방 크루", factors: [{ label: "🔁 유사 크루 재방문" }] },
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

  // 필터(중복 선택) — 시트에서 고르고 적용
  const [ctxs, setCtxs] = useState<string[]>([])
  const [foods, setFoods] = useState<string[]>([])
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draftCtxs, setDraftCtxs] = useState<string[]>([])
  const [draftFoods, setDraftFoods] = useState<string[]>([])
  const [draftAnchor, setDraftAnchor] = useState<Anchor | null>(null)
  const [regionInput, setRegionInput] = useState("")
  const [regionResults, setRegionResults] = useState<{ title: string; address?: string; lat: number; lng: number }[]>([])
  const regionTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // 랭킹 3줄
  const [hotPlaces, setHotPlaces] = useState<{ name: string; place_id?: number }[]>([])
  const [hotCrews, setHotCrews] = useState<{ id: string; title: string }[]>([])
  const [hotLists, setHotLists] = useState<{ folder_id: number; name: string }[]>([])

  // 내 크루 어울리는 가게
  const [crewPlaces, setCrewPlaces] = useState<CrewPlace[]>(MOCK_CREW_PLACES)
  const [crewLive, setCrewLive] = useState(false)
  const [crewSel, setCrewSel] = useState<string | null>(null)
  const [crewOpen, setCrewOpen] = useState(false)

  // 필터 결과 — 필터가 걸리면 화면 데이터가 아니라 서버(전체 공개 리스트)를 검색
  const [filterResults, setFilterResults] = useState<ListCard[] | null>(null)
  const [placeResults, setPlaceResults] = useState<PlaceHit[] | null>(null)
  const [filterLoading, setFilterLoading] = useState(false)

  useEffect(() => {
    let alive = true
    fetchWithAuth("/api/home/feed")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (!alive || !d) return
        const hasAny = (d.taste_matched?.length || 0) + (d.racks?.length || 0) > 0
        if (hasAny) { setFeed(d); setLive(true) }
      })
      .catch(() => {})
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

  // 필터 활성 시 서버 검색 — 전체 장소 DB(12만+) + 공개 리스트 동시
  useEffect(() => {
    if (ctxs.length + foods.length + (anchor ? 1 : 0) === 0) { setFilterResults(null); setPlaceResults(null); return }
    let alive = true
    setFilterLoading(true)
    // ① 음식점 (전체 DB, 지역=좌표 반경)
    const pp = new URLSearchParams()
    if (anchor) { pp.set("lat", String(anchor.lat)); pp.set("lng", String(anchor.lng)); pp.set("radius_km", "2") }
    if (ctxs.length) pp.set("tags", ctxs.join(","))
    if (foods.length) pp.set("foods", foods.join(","))
    const p1 = fetchWithAuth(`/api/home/search-places?${pp.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => { if (alive) setPlaceResults(d?.items || []) })
      .catch(() => { if (alive) setPlaceResults([]) })
    // ② 리스트 (공개 리스트)
    const sp = new URLSearchParams()
    if (ctxs.length) sp.set("tags", ctxs.join(","))
    if (foods.length) sp.set("foods", foods.join(","))
    if (anchor) sp.set("regions", anchor.name)
    const p2 = fetchWithAuth(`/api/home/search?${sp.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => { if (alive) setFilterResults(d?.items || []) })
      .catch(() => { if (alive) setFilterResults([]) })
    Promise.allSettled([p1, p2]).then(() => { if (alive) setFilterLoading(false) })
    return () => { alive = false }
  }, [ctxs, foods, anchor])

  // 지역 자동완성 — 기존 /api/geocode 방식 그대로
  const onRegionInput = (v: string) => {
    setRegionInput(v)
    if (regionTimer.current) clearTimeout(regionTimer.current)
    if (!v.trim() || v.trim().length < 2) { setRegionResults([]); return }
    regionTimer.current = setTimeout(async () => {
      try {
        const res = await fetchWithAuth(`/api/geocode?query=${encodeURIComponent(v.trim())}`)
        setRegionResults(res.ok ? ((await res.json()) as any[]).slice(0, 5) : [])
      } catch { setRegionResults([]) }
    }, 350)
  }
  const pickDraftRegion = (it: { title?: string; lat: number; lng: number }, name?: string) => {
    if (!it?.lat || !it?.lng) return
    setDraftAnchor({ name: (name || it.title || "선택 지역").replace(/^서울\S* /, ""), lat: it.lat, lng: it.lng })
    setRegionInput("")
    setRegionResults([])
  }

  const crewNames = useMemo(() => {
    const names: string[] = []
    crewPlaces.forEach((p) => { if (p.room_name && !names.includes(p.room_name)) names.push(p.room_name) })
    return names
  }, [crewPlaces])
  const activeCrew = crewSel && crewNames.includes(crewSel) ? crewSel : crewNames[0] || null

  // ── 필터 적용 (중복 선택 = OR) ──
  const foodTest = (s?: string) => {
    if (foods.length === 0) return true
    return foods.some((f) => (FOOD_MATCH[f] || [f]).some((k) => (s || "").includes(k)))
  }
  const ctxTest = (tag: string | null) => ctxs.length === 0 || (tag != null && ctxs.includes(tag))

  const shownCrewPlaces = useMemo(
    () => crewPlaces.filter((p) => (!activeCrew || p.room_name === activeCrew) && foodTest(p.category)).slice(0, 12),
    [crewPlaces, activeCrew, foods] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const crewLists = useMemo(
    () => feed.taste_matched.filter((l) => l.by.kind === "crew" && ctxTest(l.context_tag)).slice(0, 8),
    [feed.taste_matched, ctxs] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const curatorLists = useMemo(
    () => feed.taste_matched.filter((l) => l.by.kind === "curator" && ctxTest(l.context_tag)).slice(0, 8),
    [feed.taste_matched, ctxs] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const shownRacks = useMemo(
    () => feed.racks.filter((r) => ctxs.length === 0 || ctxs.includes(r.tag)),
    [feed.racks, ctxs]
  )

  const filterCount = ctxs.length + foods.length + (anchor ? 1 : 0)
  const openSheet = () => { setDraftCtxs(ctxs); setDraftFoods(foods); setDraftAnchor(anchor); setRegionInput(""); setRegionResults([]); setSheetOpen(true) }
  const applySheet = () => { setCtxs(draftCtxs); setFoods(draftFoods); setAnchor(draftAnchor); setSheetOpen(false) }

  const rankRows = [
    { label: "급상승", icon: <Flame className="h-3.5 w-3.5 text-rose-500" />, items: hotPlaces.map((p) => ({ name: p.name, go: p.place_id ? () => router.push(`/places/${p.place_id}`) : undefined })), goAll: () => router.push("/trending") },
    { label: "인기 크루", icon: <Users className="h-3.5 w-3.5" style={{ color: BRAND }} />, items: hotCrews.map((c) => ({ name: c.title, go: () => router.push(`/home-next/crew/${c.id}`) })), goAll: undefined as (() => void) | undefined },
    { label: "인기 리스트", icon: <ListOrdered className="h-3.5 w-3.5 text-emerald-600" />, items: hotLists.map((l) => ({ name: l.name, go: () => router.push(`/lists/${l.folder_id}`) })), goAll: undefined as (() => void) | undefined },
  ]

  const ListCardView = ({ g }: { g: ListCard }) => (
    <article
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
  )

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-24">
      <div className="px-4 py-1.5 text-center text-[11px] font-medium text-white" style={{ backgroundColor: BRAND }}>
        🧪 새 홈 프로토타입 v2 · {live ? "실데이터" : "mock"}
      </div>

      {/* ① 검색바 + 필터 버튼 */}
      <div className="sticky top-0 z-10 bg-white px-4 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/home-next/search")}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-left"
          >
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="truncate text-sm text-gray-400">성수 데이트, 강남 회식…</span>
          </button>
          <button
            onClick={openSheet}
            className={`flex shrink-0 items-center gap-1 rounded-2xl border px-3 py-2.5 text-[12px] font-bold ${
              filterCount > 0 ? "border-transparent text-white" : "border-gray-200 text-gray-600"
            }`}
            style={filterCount > 0 ? { backgroundColor: BRAND } : undefined}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />필터{filterCount > 0 && ` ${filterCount}`}
          </button>
        </div>

        {/* 적용된 필터 칩 (탭해서 제거) */}
        {filterCount > 0 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {anchor && (
              <button onClick={() => setAnchor(null)} className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11.5px] font-medium text-amber-800">
                📍 {anchor.name}<X className="h-3 w-3" />
              </button>
            )}
            {ctxs.map((t) => {
              const c = CTX_CHIPS.find((x) => x.tag === t)
              return (
                <button key={t} onClick={() => setCtxs(ctxs.filter((x) => x !== t))} className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11.5px] font-medium text-amber-800">
                  {c?.emoji} {c?.label}<X className="h-3 w-3" />
                </button>
              )
            })}
            {foods.map((f) => (
              <button key={f} onClick={() => setFoods(foods.filter((x) => x !== f))} className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11.5px] font-medium text-amber-800">
                {FOOD_EMOJI[f]} {f}<X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ② 랭킹 3줄 */}
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
            {row.goAll && <button onClick={row.goAll} className="shrink-0 text-gray-300"><ChevronRight className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>

      {/* ②-b 필터 결과 — 서버에서 전체 공개 리스트 검색 */}
      {filterCount > 0 && (
        <section className="px-4 pt-5">
          <div className="mb-2 flex items-center gap-1.5">
            <SlidersHorizontal className="h-4 w-4" style={{ color: BRAND }} />
            <h2 className="text-[15px] font-bold text-gray-900">필터 결과</h2>
            {filterResults && <span className="text-[12px] text-gray-400">{filterResults.length}개</span>}
          </div>
          {filterLoading ? (
            <div className="py-8 text-center text-[12px] text-gray-300">찾는 중...</div>
          ) : (placeResults?.length || 0) + (filterResults?.length || 0) === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 py-8 text-center">
              <p className="text-[13px] text-gray-400">이 조합의 결과가 아직 없어요.</p>
              <p className="mt-1 text-[11px] text-gray-300">필터를 줄여보세요.</p>
            </div>
          ) : (
            <>
            {/* 음식점 — 전체 장소 DB(12만+) 검색 결과 */}
            {(placeResults?.length || 0) > 0 && (
              <div className="mb-3 space-y-2">
                {placeResults!.map((p) => (
                  <article
                    key={p.id}
                    onClick={() => router.push(`/places/${p.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-gray-100 p-3"
                  >
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-xl">{catEmoji(`${p.cuisine} ${p.category} ${p.name}`)}</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13px] font-semibold text-gray-900">{p.name}</b>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400">
                        <span className="shrink-0">{p.cuisine || p.category || "맛집"}</span>
                        {p.dist_km !== null && <span className="shrink-0">· {p.dist_km}km</span>}
                        {p.rating > 0 && <span className="shrink-0 font-medium text-amber-600">★ {p.rating.toFixed(1)}</span>}
                        {p.review_count > 0 && <span className="shrink-0">리뷰 {p.review_count}</span>}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                  </article>
                ))}
              </div>
            )}
            {(filterResults?.length || 0) > 0 && (
              <p className="mb-1.5 mt-1 text-[12px] font-semibold text-gray-500">믿을 리스트</p>
            )}
            <div className="space-y-2">
              {(filterResults || []).map((it) => (
                <article
                  key={it.folder_id}
                  onClick={() => router.push(`/lists/${it.folder_id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-gray-100 p-3"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-xl">{it.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <b className="truncate text-[13px] font-semibold text-gray-900">{it.name}</b>
                      {it.match !== null && <em className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold not-italic text-amber-700">{it.match}%</em>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400">
                      <span className="truncate">by {it.by.name}</span>
                      <span>·</span><span className="shrink-0">{it.item_count}곳</span>
                      {it.revisit > 0 && <span className="shrink-0 font-medium text-amber-700">🔁 {it.revisit}</span>}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                </article>
              ))}
            </div>
            </>
          )}
        </section>
      )}

      {/* ③ 내 크루에 어울리는 곳 */}
      {crewNames.length > 0 && (
        <section className="px-4 pt-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-gray-900">
              {catEmoji(shownCrewPlaces[0]?.category)} {activeCrew ? `${activeCrew}에 어울리는 곳` : "내 크루에 어울리는 곳"}
            </h2>
            {crewNames.length > 1 && (
              <div className="relative">
                <button onClick={() => setCrewOpen(!crewOpen)} className="flex items-center gap-0.5 text-[12px] font-semibold" style={{ color: BRAND }}>
                  크루 바꾸기<ChevronDown className="h-3.5 w-3.5" />
                </button>
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
                이 크루 추천 중엔 필터에 맞는 곳이 없어요 — 필터를 빼면 다시 보여요
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
                  <span className="mt-1 inline-block rounded-md bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-700">{p.factors[0].label}</span>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ④ 내 크루와 비슷한 크루의 리스트 — 필터 중엔 '필터 결과'가 대신함 */}
      {filterCount === 0 && crewLists.length > 0 && (
        <section className="px-4 pt-5">
          <div className="mb-2 flex items-center gap-1.5">
            <Users className="h-4 w-4" style={{ color: BRAND }} />
            <h2 className="text-[15px] font-bold text-gray-900">내 크루와 비슷한 크루의 리스트</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {crewLists.map((g) => <ListCardView key={g.folder_id} g={g} />)}
          </div>
        </section>
      )}

      {/* ⑤ 내 입맛과 닮은 큐레이터의 리스트 — 필터 중엔 '필터 결과'가 대신함 */}
      {filterCount === 0 && curatorLists.length > 0 && (
        <section className="px-4 pt-5">
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" style={{ color: BRAND }} />
            <h2 className="text-[15px] font-bold text-gray-900">내 입맛과 닮은 큐레이터의 리스트</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {curatorLists.map((g) => <ListCardView key={g.folder_id} g={g} />)}
          </div>
        </section>
      )}

      {/* ⑥ 맥락별 랙 — 필터 중엔 숨김 */}
      {filterCount === 0 && shownRacks.map((rack) => (
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

      {/* 필터 시트 (기존 필터 설정 UI 스타일 · 중복 선택) */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 mx-auto flex max-w-md items-end bg-black/40" onClick={() => setSheetOpen(false)}>
          <div className="w-full rounded-t-3xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-gray-900">필터 설정</h3>
              <button onClick={() => setSheetOpen(false)} className="rounded-full p-1 text-gray-400"><X className="h-5 w-5" /></button>
            </div>

            <p className="mb-2 text-[12px] font-semibold text-gray-500">지역 <span className="font-normal text-gray-400">· 검색해서 선택</span></p>
            <div className="relative mb-2">
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <input
                  value={regionInput}
                  onChange={(e) => onRegionInput(e.target.value)}
                  placeholder="지역 검색 (강남, 성수동, 홍대입구역…)"
                  className="min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none"
                />
                {regionInput && (
                  <button onClick={() => { setRegionInput(""); setRegionResults([]) }}><X className="h-3.5 w-3.5 text-gray-300" /></button>
                )}
              </div>
              {regionResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
                  {regionResults.map((it, i) => (
                    <button key={i} onClick={() => pickDraftRegion(it)} className="block w-full border-b border-gray-50 px-3 py-2.5 text-left last:border-0 hover:bg-gray-50">
                      <div className="truncate text-xs font-bold text-gray-800">{it.title}</div>
                      {it.address && <div className="truncate text-[10px] text-gray-400">{it.address}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {draftAnchor && (
              <button onClick={() => setDraftAnchor(null)} className="mb-2 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold text-white" style={{ backgroundColor: BRAND }}>
                📍 {draftAnchor.name} <X className="h-3 w-3" />
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              {QUICK_REGIONS.map((r) => {
                const on = draftAnchor?.name === r.name
                return (
                  <button
                    key={r.name}
                    onClick={() => (on ? setDraftAnchor(null) : pickDraftRegion(r, r.name))}
                    className={`rounded-full border px-3.5 py-2 text-[13px] font-medium ${on ? "border-transparent text-white" : "border-gray-200 text-gray-600"}`}
                    style={on ? { backgroundColor: BRAND } : undefined}
                  >📍 {r.name}</button>
                )
              })}
            </div>

            <p className="mb-2 mt-5 text-[12px] font-semibold text-gray-500">목적 <span className="font-normal text-gray-400">· 중복 선택</span></p>
            <div className="flex flex-wrap gap-2">
              {CTX_CHIPS.map((c) => {
                const on = draftCtxs.includes(c.tag)
                return (
                  <button
                    key={c.tag}
                    onClick={() => setDraftCtxs(on ? draftCtxs.filter((x) => x !== c.tag) : [...draftCtxs, c.tag])}
                    className={`rounded-full border px-3.5 py-2 text-[13px] font-medium ${on ? "border-transparent text-white" : "border-gray-200 text-gray-600"}`}
                    style={on ? { backgroundColor: BRAND } : undefined}
                  >{c.emoji} {c.label}</button>
                )
              })}
            </div>

            <p className="mb-2 mt-5 text-[12px] font-semibold text-gray-500">메뉴 <span className="font-normal text-gray-400">· 중복 선택</span></p>
            <div className="flex flex-wrap gap-2">
              {FOOD_CHIPS.map((f) => {
                const on = draftFoods.includes(f)
                return (
                  <button
                    key={f}
                    onClick={() => setDraftFoods(on ? draftFoods.filter((x) => x !== f) : [...draftFoods, f])}
                    className={`rounded-full border px-3.5 py-2 text-[13px] font-medium ${on ? "border-transparent text-white" : "border-gray-200 text-gray-600"}`}
                    style={on ? { backgroundColor: BRAND } : undefined}
                  >{FOOD_EMOJI[f]} {f}</button>
                )
              })}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => { setDraftCtxs([]); setDraftFoods([]); setDraftAnchor(null) }}
                className="w-24 rounded-2xl border border-gray-200 py-3 text-[14px] font-semibold text-gray-500"
              >초기화</button>
              <button
                onClick={applySheet}
                className="flex-1 rounded-2xl py-3 text-[14px] font-bold text-white"
                style={{ backgroundColor: BRAND }}
              >적용{draftCtxs.length + draftFoods.length + (draftAnchor ? 1 : 0) > 0 ? ` (${draftCtxs.length + draftFoods.length + (draftAnchor ? 1 : 0)})` : ""}</button>
            </div>
          </div>
        </div>
      )}

      <TabBar />
    </div>
  )
}
