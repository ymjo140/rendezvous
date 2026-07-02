"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { useHotDeals } from "@/hooks/use-hot-deals"
import { fetchWithAuth } from "@/lib/api-client"
import { logAction } from "@/lib/analytics-client"
import { MapPin, Flame, Sparkles, Users } from "lucide-react"

// 장소 추천 탭 — 내 취향 기반 추천 장소 + 핫딜을 한 섹션으로.
// 채팅의 모임 추천(중간지점+그룹)과 달리, 여기선 개인 취향 위주(전국).
// 무겁지 않게 요약 카드만, 상세는 기존 /places/{id}로 딥링크.

type PlaceRec = {
  id: number
  name: string
  category?: string
  address?: string
  reason?: string
  social_proof?: { count: number; names: string[] } | null
}

export function PlacePicksTab() {
  const router = useRouter()
  const { data: deals = [], isLoading: dealsLoading } = useHotDeals()
  const [recs, setRecs] = useState<PlaceRec[]>([])
  const [recsLoading, setRecsLoading] = useState(true)
  const [meetingRecsLoading, setMeetingRecsLoading] = useState(true)
  const [meetingRecs, setMeetingRecs] = useState<any[]>([])
  const [vacancies, setVacancies] = useState<any[]>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        // 내 위치/취향 기반 추천 — member_user_ids=[나]로 개인 재랭킹
        const meRes = await fetchWithAuth("/api/users/me")
        let lat = 37.5665
        let lng = 126.978
        let myId: number | null = null
        if (meRes.ok) {
          const me = await meRes.json()
          myId = me?.id ?? null
          if (me?.lat && Math.abs(Number(me.lat)) > 1) {
            lat = me.lat
            lng = me.lng
          }
        }
        const res = await fetchWithAuth("/api/recommend", {
          method: "POST",
          body: JSON.stringify({
            purpose: "식사",
            user_selected_tags: [],
            current_lat: lat,
            current_lng: lng,
            member_user_ids: myId ? [myId] : [],
          }),
        })
        const regions = res.ok ? await res.json() : []
        const places: PlaceRec[] = (regions?.[0]?.places || []).slice(0, 8)
        if (active) setRecs(places)
      } catch {
        if (active) setRecs([])
      } finally {
        if (active) setRecsLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  // 🔴 지금 빈자리 (사장님 실시간 신호, 자동 만료)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const meRes = await fetchWithAuth("/api/users/me")
        let lat = 37.5665, lng = 126.978
        if (meRes.ok) {
          const me = await meRes.json()
          if (me?.lat && Math.abs(Number(me.lat)) > 1) { lat = me.lat; lng = me.lng }
        }
        const res = await fetchWithAuth(`/api/places/vacancy-now?lat=${lat}&lng=${lng}`)
        const d = res.ok ? await res.json() : null
        if (active) setVacancies(d?.places || [])
      } catch { /* graceful */ }
    }
    load()
    const t = setInterval(load, 60_000) // 1분마다 갱신(만료 반영)
    return () => { active = false; clearInterval(t) }
  }, [])

  // 내 모임(채팅방) 기반 추천 — 방 이름이 근거로 붙음
  useEffect(() => {
    let active = true
    fetchWithAuth("/api/recommend/my-meetings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setMeetingRecs(d?.places || [])
      })
      .catch(() => {})
      .finally(() => {
        if (active) setMeetingRecsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

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
        {/* 🔴 지금 빈자리 — 사장님 실시간 신호 (있을 때만 노출) */}
        {vacancies.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
              </span>
              <h3 className="text-sm font-bold text-gray-800">지금 빈자리</h3>
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
          </div>
          {recsLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : recs.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">
              취향을 설정하면 맞춤 장소를 추천해드려요. (마이페이지 → 취향)
            </div>
          ) : (
            <div className="space-y-2">
              {recs.map((p) => (
                <div
                  key={p.id}
                  onClick={() => goPlace(p.id)}
                  className="bg-white border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-[#F5A623] transition-colors"
                >
                  <div className="font-bold text-sm text-gray-800">{p.name}</div>
                  <div className="text-[11px] text-gray-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {p.category} · {p.address}
                  </div>
                  {p.reason && <div className="mt-1 text-[11px] font-bold text-[#F5A623]">✨ {p.reason}</div>}
                  {p.social_proof && p.social_proof.count > 0 && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                      🫂 비슷한 취향 {p.social_proof.count}명이 좋아함
                    </div>
                  )}
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
                    className="bg-white border border-gray-100 rounded-xl p-3 cursor-pointer hover:border-[#14B8A6] transition-colors"
                  >
                    <div className="font-bold text-sm text-gray-800">{p.name}</div>
                    <div className="text-[11px] text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {p.category} · {p.address}
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-[#0D9488]">
                      ✨ {p.meeting_reason}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 핫딜 섹션 */}
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Flame className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold text-gray-800">오늘의 핫딜</h3>
          </div>
          {dealsLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : deals.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">진행 중인 핫딜이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {deals.map((deal) => (
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
    </div>
  )
}
