"use client"

import React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useHotDeals } from "@/hooks/use-hot-deals"

type CommunityTabProps = {
  source?: string
}

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80&auto=format&fit=crop"

const formatEndTime = (value?: string | null) => {
  if (!value) return "마감 시간 미정"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "마감 시간 미정"
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `~ ${hours}:${minutes}까지`
}

export function CommunityTab({ source: _source }: CommunityTabProps = {}) {
  const { data = [], isLoading, error } = useHotDeals()

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
                    <p className="text-xs text-gray-400">{formatEndTime(deal.end_time)}</p>
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
