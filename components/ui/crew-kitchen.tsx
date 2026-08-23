"use client"

import React from "react"
import { Lock, Loader2, Star } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

/** 우리 크루 — 크루가 같이 간 기록이 쌓이는 곳.
 *
 *  지금까지 제품은 '정하고 나면 끝'이었다. 투표하고 예약하면 다시 열 이유가 없다.
 *  여기가 다시 열 이유다 — 다녀오면 메뉴가 해금되고 가게 등급이 오른다.
 *
 *  등급이 방문 '횟수'가 아니라 '가짓수'로 오르는 게 핵심이다. 횟수로 걸면 돈 많은
 *  크루가 이기고 나머지는 금방 포기한다. 가짓수면 여러 종류를 찾아다니게 된다.
 *
 *  단골집은 따로 센다. 해금만 밀면 새 가게만 가게 되는데, 그러면 제휴 가게에
 *  "손님은 오는데 다시는 안 옵니다"가 된다. 재방문이 있어야 영업 근거가 생긴다.
 */

type Menu = {
  key: string; title: string; group: string; image: string
  unlocked: boolean; place_name: string | null; date: string | null
}
type Regular = { place_id: number; name: string; visits: number; last_date: string; menu: string }
type Kitchen = {
  title: string; icon: string | null
  tier: string; tier_desc: string
  next_tier: { name: string; need: number; remain: number } | null
  unlocked_count: number; total_count: number; total_visits: number
  menus: Menu[]; regulars: Regular[]
  members?: { id: number; name: string; avatar: string; is_host: boolean }[]
}

/** showTitle=false — 우리 크루 탭에서는 상단 헤더가 이미 제목이라 두 번 나온다.
 *  모임 상세에서는 여러 섹션 중 하나라서 제목이 필요하다. */
export function CrewKitchen({ groupId, showTitle = true, onLoad }: {
  groupId: string; showTitle?: boolean
  /** 마을 그림을 탭 페이지가 그리므로 등급·멤버를 위로 올려준다 */
  onLoad?: (k: any) => void
}) {
  const [k, setK] = React.useState<Kitchen | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [showAll, setShowAll] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    fetchWithAuth(`/api/groups/${groupId}/kitchen`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) { setK(d); onLoad?.(d) } })
      .catch(() => { /* 주방이 안 떠도 모임 화면은 보여야 한다 */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [groupId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> 우리 크루를 불러오는 중
      </div>
    )
  }
  if (!k) return null

  const pct = Math.round((k.unlocked_count / Math.max(1, k.total_count)) * 100)
  // 해금한 건 앞으로, 잠긴 건 뒤로. 접었을 땐 해금한 것 위주로 보여준다.
  const sorted = [...k.menus].sort((a, b) => Number(b.unlocked) - Number(a.unlocked))
  const shown = showAll ? sorted : sorted.slice(0, 9)

  return (
    <section className={`px-4 py-5 ${showTitle ? "border-t border-gray-100" : ""}`}>
      {showTitle && (
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[16px] font-bold text-slate-900">우리 크루</h2>
          <span className="text-[11.5px] text-gray-400">같이 다녀온 곳이 쌓여요</span>
        </div>
      )}

      {/* 등급 */}
      <div className="mt-3 rounded-2xl bg-gradient-to-br from-amber-50 to-white border border-amber-100 p-4">
        <div className="flex items-center gap-2">
          <span className="text-[19px] font-extrabold text-amber-700">{k.tier}</span>
          <span className="text-[11.5px] text-gray-500">{k.tier_desc}</span>
        </div>

        <div className="mt-3 h-2 rounded-full bg-amber-100 overflow-hidden">
          <div className="h-full bg-[#F5A623] transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
          <span className="text-gray-500">
            메뉴 <b className="font-bold text-gray-800">{k.unlocked_count}</b> / {k.total_count}종 ·
            함께 방문 {k.total_visits}회
          </span>
          {k.next_tier && (
            <span className="font-bold text-amber-700">
              {k.next_tier.name}까지 {k.next_tier.remain}종
            </span>
          )}
        </div>
      </div>

      {/* 해금한 메뉴 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {shown.map((m) => (
          <div
            key={m.key}
            className={`relative overflow-hidden rounded-xl ${m.unlocked ? "ring-1 ring-amber-200" : "ring-1 ring-gray-100"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.image}
              alt=""
              loading="lazy"
              className={`aspect-square w-full object-cover bg-gray-100 ${m.unlocked ? "" : "grayscale opacity-40"}`}
            />
            {!m.unlocked && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Lock className="w-4 h-4 text-white drop-shadow" />
              </span>
            )}
            <div className="px-1.5 py-1.5">
              <div className={`text-[11.5px] font-bold leading-tight ${m.unlocked ? "text-gray-800" : "text-gray-400"}`}>
                {m.title}
              </div>
              {/* 어디서 해금했는지 남긴다 — 그 자체가 크루의 기록이다 */}
              {m.unlocked && m.place_name && (
                <div className="mt-0.5 truncate text-[10px] text-amber-700">{m.place_name}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {k.menus.length > 9 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-2.5 w-full rounded-xl border border-gray-200 py-2 text-[12.5px] font-bold text-gray-600 hover:bg-gray-50"
        >
          {showAll ? "접기" : `잠긴 메뉴 ${k.total_count - k.unlocked_count}종 더 보기`}
        </button>
      )}

      {/* 단골집 */}
      <div className="mt-5">
        <h3 className="text-[13.5px] font-bold text-slate-900">우리 크루의 단골집</h3>
        {k.regulars.length === 0 ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-gray-400">
            같은 곳을 세 번 가면 단골집이 돼요. 새로운 곳도 좋지만, 다시 가는 곳이 있어야
            진짜 우리 크루가 됩니다.
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {k.regulars.map((r) => (
              <div key={r.place_id} className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2">
                <Star className="w-4 h-4 flex-shrink-0 text-[#F5A623]" fill="#F5A623" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-gray-900">{r.name}</div>
                  <div className="text-[11px] text-gray-500">{r.menu} · 마지막 방문 {r.last_date}</div>
                </div>
                <span className="flex-shrink-0 text-[11.5px] font-bold text-amber-700">{r.visits}회</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
