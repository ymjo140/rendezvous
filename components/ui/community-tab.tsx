"use client"

import React, { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { useHotDeals } from "@/hooks/use-hot-deals"
import { logAction } from "@/lib/analytics-client"

type CommunityTabProps = {
  source?: string
}

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80&auto=format&fit=crop"

const formatEndTime = (value?: string | null) => {
  if (!value) return "마감 시간 미정"
  // "HH:MM" 또는 "HH:MM:SS" 형태(오퍼룰 시간블록)
  const hhmm = /^(\d{1,2}):(\d{2})/.exec(value)
  if (hhmm) {
    return `~ ${hhmm[1].padStart(2, "0")}:${hhmm[2]}까지`
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "마감 시간 미정"
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `~ ${hours}:${minutes}까지`
}

export function CommunityTab({ source: _source }: CommunityTabProps = {}) {
  const router = useRouter()
  const { data = [], isLoading, error } = useHotDeals()
  const loggedRef = useRef<Set<string>>(new Set())

  // 핫딜 노출 로깅 — 사장님 성과 리포트(노출→클릭→예약 퍼널)의 첫 고리. 세션당 딜별 1회.
  useEffect(() => {
    data.slice(0, 10).forEach((deal) => {
      const offerId = deal.offer_rule_id ?? deal.deal_id
      const key = String(offerId)
      if (!offerId || loggedRef.current.has(key)) return
      loggedRef.current.add(key)
      logAction({
        action_type: "offer_impression",
        offer_id: Number(offerId),
        source: "hotdeals_tab",
        metadata: { store_id: deal.store_id },
      })
    })
  }, [data])

  const goReserve = (deal: any) => {
    if (!deal?.store_id) return
    const offer = deal.offer_rule_id ?? deal.deal_id
    if (offer) {
      logAction({
        action_type: "offer_click",
        offer_id: Number(offer),
        source: "hotdeals_tab",
        metadata: { store_id: deal.store_id },
      })
    }
    router.push(`/places/${deal.store_id}?offer=${offer}`)
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 font-['Pretendard']">
      <div className="bg-white p-4 pb-3 sticky top-0 z-10 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900">🔥 오늘의 핫딜</h2>
        <p className="text-xs text-gray-500 mt-1">사장님이 직접 만든 혜택을 확인하세요.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-3">
        {isLoading && (
          <div className="space-y-4">
            {[0, 1, 2].map((idx) => (
              <div key={`skeleton-${idx}`} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <Skeleton className="h-40 w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="text-center text-sm text-gray-500 py-16">핫딜 정보를 불러오지 못했습니다.</div>
        )}

        {!isLoading && !error && data.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-16">현재 진행 중인 핫딜이 없습니다.</div>
        )}

        {!isLoading && !error && data.length > 0 && (
          <div className="space-y-4">
            {data.map((deal) => {
              const imageUrl = deal.image_url || PLACEHOLDER_IMAGE
              return (
                <div
                  key={`${deal.deal_id}-${deal.store_id}`}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                >
                  <div className="relative h-44">
                    <img src={imageUrl} alt={deal.store_name} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 text-white space-y-1">
                      <div className="text-xs opacity-80">{deal.store_name}</div>
                      <div className="inline-flex items-center gap-1 bg-rose-500/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                        {deal.benefit_title || "혜택"}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    {deal.description && <p className="text-sm text-gray-600">{deal.description}</p>}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">{formatEndTime(deal.end_time)}</p>
                      {typeof deal.remaining === "number" && (
                        <span className={`text-[11px] font-bold ${deal.remaining <= 3 ? "text-rose-500" : "text-gray-500"}`}>
                          {deal.remaining > 0 ? `${deal.remaining}개 남음` : "마감"}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => goReserve(deal)}
                      className="w-full mt-1 h-10 rounded-xl bg-[#F5A623] text-white text-sm font-bold hover:bg-amber-700 transition-colors"
                    >
                      예약하기
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
