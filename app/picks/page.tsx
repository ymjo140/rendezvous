"use client"

// 장소 추천 전체 보기 — 내 취향 / 내 모임 / 핫딜 탭 + 정렬(추천·거리·급상승·또갈래요·평점·리뷰·가격)
// 평점/리뷰/가격은 데이터가 쌓이면 자동으로 의미가 생기는 정렬(미리 구축).
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, Loader2 } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type Tab = "taste" | "meetings" | "hotdeals"

const PLACE_SORTS = [
  { key: "reco", label: "추천순" },
  { key: "dist", label: "거리순" },
  { key: "trend", label: "급상승" },
  { key: "revisit", label: "또갈래요" },
  { key: "rating", label: "평점순" },
  { key: "reviews", label: "리뷰순" },
  { key: "price", label: "가격순" },
]

const DEAL_SORTS = [
  { key: "discount", label: "할인율" },
  { key: "deadline", label: "마감임박" },
  { key: "dist", label: "거리순" },
]

const CATEGORY_FILTERS = [
  { key: "all", label: "전체", re: null as RegExp | null },
  { key: "food", label: "맛집", re: /식당|한식|중식|일식|양식|고기|분식|음식|FOOD|RESTAURANT/i },
  { key: "cafe", label: "카페", re: /카페|커피|디저트|베이커리|CAFE/i },
  { key: "pub", label: "술집", re: /술|주점|포차|호프|바|이자카야|PUB/i },
]

function distKm(lat1: number, lng1: number, lat2?: number | null, lng2?: number | null) {
  if (!lat2 || !lng2) return Infinity
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// "1~2만원" / "15,000원" 등에서 대표 숫자(원) 추출 — 없으면 Infinity(뒤로)
function parsePrice(pr?: string | null): number {
  if (!pr) return Infinity
  const m = String(pr).replace(/,/g, "").match(/\d+/)
  if (!m) return Infinity
  let n = parseInt(m[0], 10)
  if (/만/.test(String(pr)) && n < 1000) n *= 10000
  return n
}

// "20% 할인" 등에서 할인율 추출
function parseDiscount(title?: string | null): number {
  const m = String(title || "").match(/(\d+)\s*%/)
  return m ? parseInt(m[1], 10) : 0
}

function PicksContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const initTab = (sp.get("tab") as Tab) || "taste"
  const anchorLat = parseFloat(sp.get("lat") || "") || null
  const anchorLng = parseFloat(sp.get("lng") || "") || null
  const areaName = sp.get("area") || ""
  const purpose = sp.get("purpose") || "식사"
  const filterTags = (sp.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean)

  // 뒤로가기 복원: 장소 상세에 다녀와도 탭/정렬/필터/스크롤 유지
  const PICKS_STATE_KEY = "picks_view_state_v1"
  const saved = (() => {
    if (typeof window === "undefined") return null
    try { return JSON.parse(sessionStorage.getItem(PICKS_STATE_KEY) || "null") } catch { return null }
  })()

  const [tab, setTab] = useState<Tab>(saved?.tab || initTab)
  const [sort, setSort] = useState(saved?.sort || "reco")
  const [cat, setCat] = useState(saved?.cat || "all")
  const [roomFilter, setRoomFilter] = useState(saved?.roomFilter || "all")
  const [roomMenuOpen, setRoomMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [base, setBase] = useState<{ lat: number; lng: number; label: string } | null>(
    anchorLat && anchorLng ? { lat: anchorLat, lng: anchorLng, label: areaName || "선택 지역" } : null
  )
  const [places, setPlaces] = useState<any[]>([])
  const [meetings, setMeetings] = useState<any[]>([])
  const [deals, setDeals] = useState<any[]>([])
  const [trendRank, setTrendRank] = useState<Record<number, number>>({})

  // 기준점: 쿼리 앵커 → 없으면 내 저장 위치
  useEffect(() => {
    if (base) return
    fetchWithAuth("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        const lat = m?.lat && Math.abs(Number(m.lat)) > 1 ? m.lat : 37.5665
        const lng = m?.lat && Math.abs(Number(m.lat)) > 1 ? m.lng : 126.978
        setBase({ lat, lng, label: m?.location_name || "내 주변" })
      })
      .catch(() => setBase({ lat: 37.5665, lng: 126.978, label: "내 주변" }))
  }, [])

  // 급상승 랭크 맵(정렬용)
  useEffect(() => {
    fetchWithAuth("/api/trending/places?days=7&limit=50")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        const map: Record<number, number> = {}
        ;(d.items || []).forEach((it: any) => { if (it.place_id) map[it.place_id] = it.rank })
        setTrendRank(map)
      })
      .catch(() => {})
  }, [])

  // 탭별 데이터 로드
  useEffect(() => {
    if (!base) return
    let active = true
    setLoading(true)
    const done = () => { if (active) setLoading(false) }
    if (tab === "taste") {
      fetchWithAuth("/api/recommend", {
        method: "POST",
        body: JSON.stringify({
          purpose,
          user_selected_tags: filterTags,
          current_lat: base.lat,
          current_lng: base.lng,
          member_user_ids: [],
          top_k: 100,
        }),
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((regions) => { if (active) setPlaces(regions?.[0]?.places || []) })
        .catch(() => {})
        .finally(done)
    } else if (tab === "meetings") {
      const q = anchorLat && anchorLng ? `&lat=${anchorLat}&lng=${anchorLng}&area=${encodeURIComponent(areaName)}` : ""
      fetchWithAuth(`/api/recommend/my-meetings?per_room=100${q}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (active) setMeetings(d?.places || []) })
        .catch(() => {})
        .finally(done)
    } else {
      fetchWithAuth("/api/hotdeals")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => { if (active) setDeals(Array.isArray(d) ? d : []) })
        .catch(() => {})
        .finally(done)
    }
    return () => { active = false }
  }, [tab, base])

  const roomNames = useMemo(() => {
    const names: string[] = []
    meetings.forEach((p: any) => { if (p.room_name && names.indexOf(p.room_name) < 0) names.push(p.room_name) })
    return names
  }, [meetings])

  // 뷰 상태 저장(탭/정렬/필터) — 뒤로가기 시 복원용
  useEffect(() => {
    try { sessionStorage.setItem(PICKS_STATE_KEY, JSON.stringify({ tab, sort, cat, roomFilter, scrollY: 0 })) } catch { /* noop */ }
  }, [tab, sort, cat, roomFilter])

  // 스크롤 위치 저장 + 복원(장소 상세 다녀온 뒤 그 자리로)
  useEffect(() => {
    const onScroll = () => {
      try {
        const s = JSON.parse(sessionStorage.getItem(PICKS_STATE_KEY) || "{}")
        s.scrollY = window.scrollY
        sessionStorage.setItem(PICKS_STATE_KEY, JSON.stringify(s))
      } catch { /* noop */ }
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  const restoredRef = useRef(false)
  useEffect(() => {
    if (loading || restoredRef.current) return
    restoredRef.current = true
    if (saved?.scrollY) requestAnimationFrame(() => window.scrollTo(0, saved.scrollY))
  }, [loading])

  const sortedPlaces = useMemo(() => {
    const src = tab === "meetings" ? meetings : places
    let list = src.map((p: any, i: number) => ({ ...p, _idx: i }))
    if (tab === "meetings" && roomFilter !== "all") list = list.filter((p: any) => p.room_name === roomFilter)
    const c = CATEGORY_FILTERS.find((x) => x.key === cat)
    if (c?.re) list = list.filter((p: any) => c.re!.test(String(p.category || "")))
    const b = base!
    const cmp: Record<string, (a: any, x: any) => number> = {
      reco: (a, x) => a._idx - x._idx,
      dist: (a, x) => distKm(b.lat, b.lng, a.lat, a.lng) - distKm(b.lat, b.lng, x.lat, x.lng),
      trend: (a, x) => (trendRank[a.id] || 999) - (trendRank[x.id] || 999) || a._idx - x._idx,
      revisit: (a, x) => (x.revisit_count || 0) - (a.revisit_count || 0) || a._idx - x._idx,
      rating: (a, x) => (x.wemeet_rating || 0) - (a.wemeet_rating || 0) || a._idx - x._idx,
      reviews: (a, x) => (x.review_count || 0) - (a.review_count || 0) || a._idx - x._idx,
      price: (a, x) => parsePrice(a.price_range) - parsePrice(x.price_range) || a._idx - x._idx,
    }
    return list.sort(cmp[sort] || cmp.reco)
  }, [tab, places, meetings, sort, cat, roomFilter, base, trendRank])

  const sortedDeals = useMemo(() => {
    const b = base
    const list = deals.map((d: any, i: number) => ({ ...d, _idx: i }))
    if (sort === "deadline") return list.sort((a, x) => String(a.end_time || "99").localeCompare(String(x.end_time || "99")))
    if (sort === "dist" && b) return list.sort((a, x) => distKm(b.lat, b.lng, a.lat, a.lng) - distKm(b.lat, b.lng, x.lat, x.lng))
    return list.sort((a, x) => parseDiscount(x.benefit_title) - parseDiscount(a.benefit_title) || a._idx - x._idx)
  }, [deals, sort, base])

  const switchTab = (t: Tab) => {
    setTab(t)
    setSort(t === "hotdeals" ? "discount" : "reco")
    setCat("all")
    setRoomFilter("all")
  }

  const sorts = tab === "hotdeals" ? DEAL_SORTS : PLACE_SORTS

  return (
    <div className="min-h-screen bg-white max-w-lg mx-auto font-['Pretendard']">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="flex items-center gap-2 px-3 h-14">
          <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <span className="font-bold text-gray-900">장소 추천 전체</span>
          {base && <span className="text-xs text-gray-400">· {base.label}</span>}
          {tab === "taste" && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
              {purpose}{filterTags.length > 0 ? ` +${filterTags.length}` : ""}
            </span>
          )}
        </div>
        {/* 탭 */}
        <div className="flex px-3 gap-1 pb-0">
          {[
            { key: "taste" as Tab, label: "✨ 내 취향" },
            { key: "meetings" as Tab, label: "👥 내 모임" },
            { key: "hotdeals" as Tab, label: "🔥 핫딜" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={`px-3 py-2 text-sm font-bold border-b-2 transition-colors ${
                tab === t.key ? "border-[#F5A623] text-gray-900" : "border-transparent text-gray-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* 정렬 + 필터 */}
        <div className="px-3 py-2 space-y-1.5 border-t border-gray-50">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {sorts.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                  sort === s.key ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-500"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {/* 모임 선택 (모임 탭 전용) — 드롭다운으로 열어서 선택. 모임 많아도 스크롤로 수용 */}
          {tab === "meetings" && roomNames.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setRoomMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold bg-teal-600 text-white"
              >
                👥 {roomFilter === "all" ? "전체 모임" : roomFilter}
                <span className="text-[10px] opacity-80">{roomMenuOpen ? "▲" : "▼"}</span>
              </button>
              {roomMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setRoomMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-30 w-56 max-h-64 overflow-y-auto bg-white rounded-xl shadow-lg border border-gray-100 py-1">
                    <button
                      onClick={() => { setRoomFilter("all"); setRoomMenuOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-sm ${roomFilter === "all" ? "font-bold text-teal-700 bg-teal-50" : "text-gray-700 hover:bg-gray-50"}`}
                    >
                      👥 전체 모임 <span className="text-xs text-gray-400">({roomNames.length}개)</span>
                    </button>
                    {roomNames.map((rn) => (
                      <button
                        key={rn}
                        onClick={() => { setRoomFilter(rn); setRoomMenuOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-sm truncate ${roomFilter === rn ? "font-bold text-teal-700 bg-teal-50" : "text-gray-700 hover:bg-gray-50"}`}
                      >
                        {rn}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {tab !== "hotdeals" && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {CATEGORY_FILTERS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCat(c.key)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                    cat === c.key ? "bg-amber-100 text-amber-800" : "bg-gray-50 text-gray-400"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading || !base ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#F5A623]" /></div>
      ) : tab === "hotdeals" ? (
        sortedDeals.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-400">진행 중인 핫딜이 없어요.</div>
        ) : (
          <div>
            {sortedDeals.map((d: any, i: number) => {
              const km = distKm(base.lat, base.lng, d.lat, d.lng)
              return (
                <button
                  key={`${d.deal_id}-${i}`}
                  onClick={() => d.store_id && router.push(`/places/${d.store_id}${d.offer_rule_id ? `?offer=${d.offer_rule_id}` : ""}`)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50"
                >
                  <span className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-lg flex-shrink-0">🔥</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-gray-900 truncate">{d.benefit_title}</div>
                    <div className="text-xs text-gray-500 truncate">{d.store_name} · {d.description}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {d.remaining != null && <div className="text-[10px] font-bold text-rose-500">남은 수량 {d.remaining}</div>}
                    {isFinite(km) && <div className="text-[10px] text-gray-400">{km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        )
      ) : sortedPlaces.length === 0 ? (
        <div className="py-20 text-center text-sm text-gray-400">
          {tab === "meetings" ? "모임 추천이 없어요. 모임 채팅방을 만들어보세요!" : "조건에 맞는 곳이 없어요."}
        </div>
      ) : (
        <div>
          {sortedPlaces.map((p: any, i: number) => {
            const km = distKm(base.lat, base.lng, p.lat, p.lng)
            const tr = trendRank[p.id]
            return (
              <button
                key={`${p.id}-${p.room_id ?? ""}-${i}`}
                onClick={() => p.id && router.push(`/places/${p.id}`)}
                className="w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50"
              >
                <span className={`w-6 text-center text-sm font-extrabold pt-0.5 ${i < 3 ? "text-[#F5A623]" : "text-gray-300"}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-gray-900 truncate">
                    {p.name}
                    {tr && tr <= 10 && <span className="ml-1 text-[9px] font-bold text-orange-600 bg-orange-50 rounded px-1 py-0.5">🔥급상승 {tr}위</span>}
                  </div>
                  {/* 모임 탭: 어느 모임 추천인지 배지로 명확히 (전체 보기일 때만 — 특정 모임 선택 시엔 중복이라 생략) */}
                  {tab === "meetings" && p.room_name && roomFilter === "all" && (
                    <span className="inline-block mt-0.5 text-[10px] font-bold text-teal-700 bg-teal-50 rounded-full px-2 py-0.5">
                      👥 {p.room_name}
                    </span>
                  )}
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    {[p.category, isFinite(km) ? (km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`) : null].filter(Boolean).join(" · ")}
                  </div>
                  {(p.meeting_reason || p.reason) && (
                    <div className="text-[11px] text-[#D97706] truncate mt-0.5">✨ {tab === "meetings" && p.reason ? p.reason : (p.meeting_reason || p.reason)}</div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                    {(p.wemeet_rating || 0) > 0 && <span>⭐ {Number(p.wemeet_rating).toFixed(1)}</span>}
                    {(p.review_count || 0) > 0 && <span>리뷰 {p.review_count}</span>}
                    {(p.revisit_count || 0) > 0 && <span className="text-amber-600 font-bold">💛 또갈래요 {p.revisit_count}</span>}
                    {p.price_range && <span>{p.price_range}</span>}
                    {p.vacancy_now && <span className="text-rose-500 font-bold">🔴 지금 입장 가능</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}

export default function PicksPage() {
  return (
    <Suspense fallback={<div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#F5A623]" /></div>}>
      <PicksContent />
    </Suspense>
  )
}
