"use client"

import React, { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { useHotDeals } from "@/hooks/use-hot-deals"
import { fetchWithAuth } from "@/lib/api-client"
import { logAction } from "@/lib/analytics-client"
import { MapPin, Flame, Sparkles, Users, Search, X, LocateFixed, SlidersHorizontal } from "lucide-react"
import { useSystemConfig } from "@/hooks/use-system-config"
import { FilterDialog } from "@/components/ui/components/home/FilterDialog"

// 장소 추천 탭 — 내 취향/모임 기반 추천 + 핫딜.
// 기본은 내 위치 기준, 지역 검색(앵커)하면 모든 섹션이 그 지역 기준으로 전환.
// (예: 집은 청구지만 "강남"을 검색하면 강남에서 내 취향/모임에 맞는 곳 추천)

// 사진 없을 때 카테고리 이모지 타일 폴백
function categoryEmoji(name?: string, cat?: string): string {
  const s = `${name ?? ""} ${cat ?? ""}`
  if (/피자|pizza/i.test(s)) return "🍕"
  if (/버거|burger/i.test(s)) return "🍔"
  if (/파스타|이탈리|스테이크|브런치|양식/i.test(s)) return "🍝"
  if (/카페|까페|커피|coffee|cafe|디저트|케이크|빙수|마카롱/i.test(s)) return "☕"
  if (/베이커리|제과|도넛|베이글|크루아상|크로플|빵/i.test(s)) return "🥐"
  if (/스시|초밥|오마카세|사시미|일식/i.test(s)) return "🍣"
  if (/라멘|우동|소바|국수|칼국수|쌀국수|팟타이|아시아|베트남|태국/i.test(s)) return "🍜"
  if (/중식|중국|짜장|짬뽕|마라|딤섬|만두|훠궈/i.test(s)) return "🥟"
  if (/치킨|닭강정|통닭/i.test(s)) return "🍗"
  if (/곱창|막창|대창|삼겹|갈비|숯불|구이|정육|양꼬치|고기/i.test(s)) return "🥩"
  if (/호프|맥주|펍|pub|포차|술집|이자카야|와인|칵테일|하이볼/i.test(s)) return "🍺"
  if (/분식|떡볶이|김밥|순대|어묵|토스트/i.test(s)) return "🍢"
  if (/해산물|수산|횟집|물회|조개|대게|랍스터|새우/i.test(s)) return "🦐"
  if (/샐러드|포케/i.test(s)) return "🥗"
  if (/국밥|설렁탕|해장국|감자탕|찌개|백반|족발|보쌈|비빔밥|불고기|한식/i.test(s)) return "🍚"
  return "🍽️"
}

const FACTOR_STYLE: Record<string, string> = {
  all: "bg-[#0F6E56] text-[#E1F5EE]",
  own: "bg-[#EEEDFE] text-[#3C3489]",
  similar: "bg-[#EEEDFE] text-[#3C3489]",
  food: "bg-[#E1F5EE] text-[#0F6E56]",
  vibe: "bg-[#E1F5EE] text-[#0F6E56]",
  revisit: "bg-[#FAEEDA] text-[#854F0B]",
  rating: "bg-[#FBEAF0] text-[#993556]",
  near: "bg-gray-100 text-gray-500",
}

function PlaceThumb({ image, name, category, accent }: { image?: string; name?: string; category?: string; accent?: string }) {
  if (image) {
    return <img src={image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100" loading="lazy" />
  }
  return (
    <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-xl" style={{ backgroundColor: accent || "#FEF3C7" }}>
      {categoryEmoji(name, category)}
    </div>
  )
}

type PlaceRec = {
  id: number
  name: string
  category?: string
  address?: string
  reason?: string
  social_proof?: { count: number; names: string[] } | null
}

type Anchor = { name: string; lat: number; lng: number }

// 인기 지역 퀵칩(좌표 고정 — 지오코딩 불필요)
const QUICK_REGIONS: Anchor[] = [
  { name: "강남", lat: 37.498, lng: 127.0276 },
  { name: "홍대", lat: 37.5572, lng: 126.9245 },
  { name: "성수", lat: 37.5446, lng: 127.0559 },
  { name: "을지로", lat: 37.5663, lng: 126.9925 },
  { name: "잠실", lat: 37.5133, lng: 127.1001 },
]

const distKm = (a: Anchor, lat?: number | null, lng?: number | null) => {
  if (!lat || !lng) return Infinity
  const R = 6371
  const dLa = ((lat - a.lat) * Math.PI) / 180
  const dLo = ((lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLa / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

export function PlacePicksTab() {
  const router = useRouter()
  const { data: deals = [], isLoading: dealsLoading } = useHotDeals()
  const [recs, setRecs] = useState<PlaceRec[]>([])
  const [recsLoading, setRecsLoading] = useState(true)
  const [meetingRecsLoading, setMeetingRecsLoading] = useState(true)
  const [meetingRecs, setMeetingRecs] = useState<any[]>([])
  const [vacancies, setVacancies] = useState<any[]>([])

  // 🎛️ 목적/취향 필터 — 홈 탭과 동일한 필터 설정(FilterDialog) 재사용
  const { data: purposeConfig } = useSystemConfig()
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [selectedPurpose, setSelectedPurpose] = useState("식사")
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
    PURPOSE: ["식사"], CATEGORY: [], PRICE: [], VIBE: [], CONDITION: [],
  })
  useEffect(() => {
    if (!purposeConfig) return
    if (!selectedPurpose || !purposeConfig[selectedPurpose]) {
      const first = Object.keys(purposeConfig)[0]
      if (first) {
        setSelectedPurpose(first)
        setSelectedFilters((prev) => ({ ...prev, PURPOSE: [first] }))
      }
    }
  }, [purposeConfig, selectedPurpose])
  const toggleFilter = (k: string, v: string) => {
    setSelectedFilters((prev) => {
      const list = prev[k] || []
      return list.includes(v) ? { ...prev, [k]: list.filter((i) => i !== v) } : { ...prev, [k]: [...list, v] }
    })
  }
  const handleSelectPurpose = (p: string) => {
    setSelectedPurpose(p)
    setSelectedFilters({ PURPOSE: [p], CATEGORY: [], PRICE: [], VIBE: [], CONDITION: [] })
  }
  // PURPOSE는 purpose 파라미터로 이미 전달 — 태그에선 제외
  const filterTags = Object.entries(selectedFilters)
    .filter(([k]) => k !== "PURPOSE")
    .map(([, v]) => v)
    .reduce((acc: string[], v) => acc.concat(v), [])

  // 📍 지역 앵커 — null이면 내 위치 기준
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [me, setMe] = useState<{ id: number | null; lat: number; lng: number; name: string } | null>(null)
  const [regionQuery, setRegionQuery] = useState("")
  const [regionResults, setRegionResults] = useState<any[]>([])
  const debounceRef = useRef<any>(null)

  // 내 위치/id 1회 로드
  useEffect(() => {
    let active = true
    fetchWithAuth("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!active) return
        const lat = m?.lat && Math.abs(Number(m.lat)) > 1 ? m.lat : 37.5665
        const lng = m?.lat && Math.abs(Number(m.lat)) > 1 ? m.lng : 126.978
        setMe({ id: m?.id ?? null, lat, lng, name: m?.location_name || "내 주변" })
      })
      .catch(() => { if (active) setMe({ id: null, lat: 37.5665, lng: 126.978, name: "내 주변" }) })
    return () => { active = false }
  }, [])

  const baseLat = anchor?.lat ?? me?.lat ?? 37.5665
  const baseLng = anchor?.lng ?? me?.lng ?? 126.978
  const areaLabel = anchor ? anchor.name : "내 주변"

  // ✨ 내 취향 추천 — 앵커/내 위치 기준
  // 탭 재진입 시 마지막 결과를 즉시 그리고(sessionStorage), 뒤에서 새 데이터로 갱신(SWR)
  useEffect(() => {
    if (!me) return
    let active = true
    const cacheKey = `picks:recs:${baseLat.toFixed(3)},${baseLng.toFixed(3)}:${selectedPurpose}:${filterTags.join(",")}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try { setRecs(JSON.parse(cached)); setRecsLoading(false) } catch { setRecsLoading(true) }
    } else {
      setRecsLoading(true)
    }
    fetchWithAuth("/api/recommend", {
      method: "POST",
      body: JSON.stringify({
        purpose: selectedPurpose || "식사",
        user_selected_tags: filterTags,
        current_lat: baseLat,
        current_lng: baseLng,
        member_user_ids: me.id ? [me.id] : [],
      }),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((regions) => {
        if (!active) return
        const next = ((regions?.[0]?.places || []) as PlaceRec[]).slice(0, 8)
        setRecs(next)
        try { sessionStorage.setItem(cacheKey, JSON.stringify(next)) } catch { /* quota */ }
      })
      .catch(() => { if (active && !cached) setRecs([]) })
      .finally(() => { if (active) setRecsLoading(false) })
    return () => { active = false }
  }, [me, anchor, selectedPurpose, selectedFilters])

  // 🔴 지금 빈자리 — 앵커/내 위치 기준 (1분 갱신)
  useEffect(() => {
    if (!me) return
    let active = true
    const load = () => {
      fetchWithAuth(`/api/places/vacancy-now?lat=${baseLat}&lng=${baseLng}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (active) setVacancies(d?.places || []) })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { active = false; clearInterval(t) }
  }, [me, anchor])

  // 🗳️ 진행 중인 모임 장소 투표 — 있으면 배너로 담기 유도
  const [activePolls, setActivePolls] = useState<any[]>([])
  useEffect(() => {
    fetchWithAuth("/api/chat/polls/active")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setActivePolls(d?.items || []))
      .catch(() => {})
  }, [])

  // 👥 내 모임 추천 — 앵커 시 그 지역 기준(멤버 취향은 유지)
  // 무거운 파이프라인이라 탭 재진입 시 마지막 결과 즉시 표시 + 백그라운드 갱신(SWR)
  useEffect(() => {
    let active = true
    const cacheKey = `picks:meetings:${anchor ? `${anchor.lat},${anchor.lng}` : "me"}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try { setMeetingRecs(JSON.parse(cached)); setMeetingRecsLoading(false) } catch { setMeetingRecsLoading(true) }
    } else {
      setMeetingRecsLoading(true)
    }
    const q = anchor ? `?lat=${anchor.lat}&lng=${anchor.lng}&area=${encodeURIComponent(anchor.name)}` : ""
    fetchWithAuth(`/api/recommend/my-meetings${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d) return
        setMeetingRecs(d.places || [])
        try { sessionStorage.setItem(cacheKey, JSON.stringify(d.places || [])) } catch { /* quota */ }
      })
      .catch(() => {})
      .finally(() => { if (active) setMeetingRecsLoading(false) })
    return () => { active = false }
  }, [anchor])

  // 🔥 핫딜 — 앵커 시 5km 반경만
  const visibleDeals = anchor
    ? deals.filter((d: any) => distKm(anchor, d.lat, d.lng) <= 5)
    : deals

  // 지역 검색(지오코딩) — 디바운스
  const onRegionInput = (v: string) => {
    setRegionQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!v.trim() || v.trim().length < 2) { setRegionResults([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetchWithAuth(`/api/geocode?query=${encodeURIComponent(v.trim())}`)
        setRegionResults(res.ok ? (await res.json()).slice(0, 5) : [])
      } catch { setRegionResults([]) }
    }, 350)
  }

  const pickRegion = (item: any, name?: string) => {
    if (!item?.lat || !item?.lng) return
    setAnchor({ name: (name || item.title || "선택 지역").replace(/^서울\S* /, ""), lat: item.lat, lng: item.lng })
    setRegionQuery("")
    setRegionResults([])
  }

  const resetAnchor = () => { setAnchor(null); setRegionQuery(""); setRegionResults([]) }

  const goPlace = (id: number) => {
    if (!id) return
    router.push(`/places/${id}`)
  }

  const goDeal = (deal: any) => {
    if (!deal?.store_id) return
    const offer = deal.offer_rule_id ?? deal.deal_id
    if (offer) {
      logAction({ action_type: "offer_click", offer_id: Number(offer), source: "place_picks", metadata: { store_id: deal.store_id } })
    }
    router.push(`/places/${deal.store_id}?offer=${offer}`)
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 font-['Pretendard']">
      <div className="bg-white p-4 pb-3 sticky top-0 z-10 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900">✨ 장소 추천</h2>
        <p className="text-xs text-gray-500 mt-1">내 취향에 맞는 곳과 진행 중인 핫딜을 모았어요.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-3 space-y-6">
        {/* 🗳️ 진행 중 모임 투표 배너 — 장소 상세의 '투표에 담기'로 후보 추가 가능 */}
        {activePolls.length > 0 && (
          <section className="rounded-2xl border border-[#F5A623] bg-amber-50 px-3.5 py-2.5 flex items-center gap-2.5 -mb-2">
            <span className="text-lg">🗳️</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-900 truncate">
                {activePolls[0].room_title} · 장소 투표 진행 중
              </p>
              <p className="text-[11px] text-amber-700">
                마음에 드는 곳 상세에서 '투표에 담기'를 눌러보세요 (후보 {activePolls[0].option_count}곳)
              </p>
            </div>
          </section>
        )}

        {/* 📍 지역 앵커 — 기본 내 위치, 검색하면 그 지역 기준으로 전체 전환 */}
        <section className={`rounded-2xl border p-3 ${anchor ? "bg-amber-50 border-[#F5A623]" : "bg-gray-50 border-gray-100"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className={`w-4 h-4 flex-shrink-0 ${anchor ? "text-[#F5A623]" : "text-[#F5A623]"}`} />
              {anchor ? (
                <span className="text-sm font-bold text-amber-800 truncate">
                  {anchor.name} <span className="font-normal text-amber-600 text-xs">기준 추천 중</span>
                </span>
              ) : (
                <span className="text-sm font-bold text-gray-800 truncate">
                  {me?.name || "내 주변"} <span className="font-normal text-gray-400 text-xs">· 내 위치</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {anchor && (
                <button
                  onClick={resetAnchor}
                  className="flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-white border border-gray-200 rounded-full px-2.5 py-1"
                >
                  <LocateFixed className="w-3 h-3" /> 내 위치로
                </button>
              )}
              <button
                onClick={() => setIsFilterOpen(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1"
              >
                <SlidersHorizontal className="w-3 h-3" /> {selectedPurpose}
                {filterTags.length > 0 && ` +${filterTags.length}`}
              </button>
            </div>
          </div>

          <div className="relative mt-2">
            <div className={`flex items-center gap-1.5 bg-white border rounded-xl px-3 py-2 ${anchor ? "border-amber-200" : "border-gray-200"}`}>
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                value={regionQuery}
                onChange={(e) => onRegionInput(e.target.value)}
                placeholder="다른 지역에서 추천받기 (강남, 성수동, 홍대입구역…)"
                className="flex-1 text-xs outline-none bg-transparent min-w-0"
              />
              {regionQuery && (
                <button onClick={() => { setRegionQuery(""); setRegionResults([]) }}>
                  <X className="w-3.5 h-3.5 text-gray-300" />
                </button>
              )}
            </div>
            {regionResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-20 overflow-hidden">
                {regionResults.map((it, i) => (
                  <button
                    key={i}
                    onClick={() => pickRegion(it)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <div className="text-xs font-bold text-gray-800 truncate">{it.title}</div>
                    {it.address && <div className="text-[10px] text-gray-400 truncate">{it.address}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-hide">
            {QUICK_REGIONS.map((r) => (
              <button
                key={r.name}
                onClick={() => (anchor?.name === r.name ? resetAnchor() : pickRegion(r, r.name))}
                className={`flex-shrink-0 text-[11px] font-medium rounded-full px-2.5 py-1 border transition-colors ${
                  anchor?.name === r.name
                    ? "bg-[#F5A623] text-white border-[#F5A623]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-[#F5A623]"
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>

          {/* 선택된 취향 태그 — 탭하면 제거 */}
          {filterTags.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-2">
              {filterTags.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    Object.entries(selectedFilters).forEach(([k, vals]) => {
                      if (k !== "PURPOSE" && vals.includes(t)) toggleFilter(k, t)
                    })
                  }}
                  className="text-[11px] font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5"
                >
                  #{t} ✕
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 🔴 지금 빈자리 — 사장님 실시간 신호 (있을 때만 노출) */}
        {vacancies.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
              </span>
              <h3 className="text-sm font-bold text-gray-800">지금 빈자리</h3>
              <span className="text-[10px] font-bold text-[#D97706]">· {areaLabel}</span>
              <span className="text-[10px] text-gray-400">사장님이 방금 알린 실시간 자리예요</span>
            </div>
            <div className="space-y-2">
              {vacancies.map((v) => (
                <div
                  key={v.id}
                  onClick={() => goPlace(v.id)}
                  className="bg-white border-2 border-rose-200 rounded-xl p-3 cursor-pointer hover:border-rose-400 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-gray-800 truncate">{v.name}</div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {v.category} · {v.dist_km}km
                      </div>
                      {v.empty_tables > 0 && (
                        <div className="text-[11px] font-semibold text-emerald-600 mt-0.5">
                          🪑 {v.empty_tables}테이블 · {v.empty_seats}석 비어있음
                          {v.max_group_seats > v.max_single_seats && (
                            <span className="text-indigo-500"> · ⛓ 합석 시 최대 {v.max_group_seats}명</span>
                          )}
                        </div>
                      )}
                      {v.best_deal && (
                        <div className="mt-0.5 inline-flex rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                          💸 빈 테이블 한정 최대 {v.best_deal}% 할인
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-[11px] font-bold text-rose-600">🔴 지금 입장 가능</div>
                      <div className="text-[10px] text-gray-400">{v.remain_min}분 남음</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 내 취향 추천 */}
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-4 h-4 text-[#F5A623]" />
            <h3 className="text-sm font-bold text-gray-800">내 취향 추천</h3>
            <span className="text-[10px] font-bold text-[#D97706]">· {areaLabel}</span>
            <button
              onClick={() => router.push(`/picks?tab=taste${anchor ? `&lat=${anchor.lat}&lng=${anchor.lng}&area=${encodeURIComponent(anchor.name)}` : ""}&purpose=${encodeURIComponent(selectedPurpose)}${filterTags.length > 0 ? `&tags=${encodeURIComponent(filterTags.join(","))}` : ""}`)}
              className="ml-auto text-[11px] font-bold text-amber-600"
            >
              전체 ›
            </button>
          </div>
          {recsLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : recs.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">
              {anchor ? `${anchor.name} 주변에서 취향에 맞는 곳을 찾지 못했어요.` : "취향을 설정하면 맞춤 장소를 추천해드려요. (마이페이지 → 취향)"}
            </div>
          ) : (
            <div className="space-y-2">
              {recs.map((p) => (
                <div
                  key={p.id}
                  onClick={() => goPlace(p.id)}
                  className="bg-white border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-[#F5A623] transition-colors flex gap-3"
                >
                  <PlaceThumb image={(p as any).image} name={p.name} category={p.category} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-gray-800 truncate">{p.name}</div>
                    <div className="text-[11px] text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{p.category} · {p.address}</span>
                    </div>
                    {p.reason && <div className="mt-1 text-[11px] font-bold text-[#F5A623] truncate">✨ {p.reason}</div>}
                    {p.social_proof && p.social_proof.count > 0 && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                        🫂 비슷한 취향 {p.social_proof.count}명이 좋아함
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 내 모임 추천 — 내 채팅방들 기반, 방 이름이 근거 */}
        {(meetingRecsLoading || meetingRecs.length > 0) && (
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="w-4 h-4 text-[#14B8A6]" />
              <h3 className="text-sm font-bold text-gray-800">내 모임 추천</h3>
              <span className="text-[10px] font-bold text-[#D97706]">· {areaLabel}</span>
              <button
                onClick={() => router.push(`/picks?tab=meetings${anchor ? `&lat=${anchor.lat}&lng=${anchor.lng}&area=${encodeURIComponent(anchor.name)}` : ""}`)}
                className="ml-auto text-[11px] font-bold text-amber-600"
              >
                전체 ›
              </button>
            </div>
            {meetingRecsLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {meetingRecs.map((p, idx) => (
                  <div
                    key={`${p.room_id}-${p.id}-${idx}`}
                    onClick={() => goPlace(p.id)}
                    className="bg-white border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-[#14B8A6] transition-colors flex gap-3"
                  >
                    <PlaceThumb image={(p as any).image} name={p.name} category={p.category} accent="#CCFBF1" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-gray-800 truncate">{p.name}</div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{p.category} · {p.address}</span>
                      </div>
                      {Array.isArray((p as any).factors) && (p as any).factors.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(p as any).factors.map((f: any, fi: number) => (
                            <span key={fi} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${FACTOR_STYLE[f.key] || FACTOR_STYLE.near}`}>
                              {f.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] font-bold text-[#0D9488] truncate">
                          ✨ {p.meeting_reason}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 핫딜 섹션 — 앵커 시 5km 반경만 */}
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Flame className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold text-gray-800">오늘의 핫딜</h3>
            <span className="text-[10px] font-bold text-[#D97706]">· {areaLabel}</span>
            <button
              onClick={() => router.push(`/picks?tab=hotdeals${anchor ? `&lat=${anchor.lat}&lng=${anchor.lng}&area=${encodeURIComponent(anchor.name)}` : ""}`)}
              className="ml-auto text-[11px] font-bold text-amber-600"
            >
              전체 ›
            </button>
          </div>
          {dealsLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : visibleDeals.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">
              {anchor ? `${anchor.name} 주변에 진행 중인 핫딜이 없어요.` : "진행 중인 핫딜이 없습니다."}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleDeals.map((deal: any) => (
                <div
                  key={`${deal.deal_id}-${deal.store_id}`}
                  onClick={() => goDeal(deal)}
                  className="bg-white border border-rose-100 rounded-xl p-3 cursor-pointer hover:border-rose-300 transition-colors flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-gray-800 truncate">{deal.store_name}</div>
                    <div className="text-[11px] text-rose-600 font-bold truncate">🔥 {deal.benefit_title}</div>
                    {typeof deal.remaining === "number" && deal.remaining >= 0 && (
                      <div className="text-[10px] text-gray-400">{deal.remaining}개 남음</div>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-rose-500 flex-shrink-0 ml-2">받기 ›</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 🎛️ 목적/취향 필터 — 홈 탭과 동일한 다이얼로그 재사용 */}
      <FilterDialog
        isOpen={isFilterOpen}
        onOpenChange={setIsFilterOpen}
        purposeConfig={purposeConfig || null}
        selectedPurpose={selectedPurpose}
        onSelectPurpose={handleSelectPurpose}
        selectedFilters={selectedFilters}
        onToggleFilter={toggleFilter}
      />
    </div>
  )
}
