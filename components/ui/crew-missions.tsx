"use client"

import React from "react"
import { Check, Lock, Loader2, X, ClipboardList } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

/** 퀘스트 — 마을 위에 떠 있는 버튼, 누르면 모달.
 *
 *  아이러브커피의 좌측 세로 아이콘(퀘스트·특별주문·업적)이 이 형태다. 화면을 차지하지
 *  않으면서 '할 게 남았다'는 걸 배지로 알린다. 목록으로 깔면 마을이 밀려 내려간다.
 *
 *  계단 3개는 일회성 온보딩이라 다 깨면 사라진다. 그 자리를 주간이 이어받는다.
 *  주간인 이유는 밥은 매일 먹어도 크루로 모이는 건 주 1~2회라서다.
 */

type Mission = {
  key: string; title: string; desc: string
  done: boolean; progress: number; goal: number
  locked?: boolean; locked_reason?: string | null
}
type Missions = {
  steps: Mission[]; steps_done: number
  weekly: Mission[]; weekly_done: number
}

function Row({ m }: { m: Mission }) {
  const dim = m.locked && !m.done
  return (
    <div className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 ${
      m.done ? "bg-amber-50/70" : dim ? "bg-gray-50" : "bg-white border border-gray-100"
    }`}>
      <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
        m.done ? "bg-[#F5A623]" : dim ? "bg-gray-200" : "border-2 border-gray-200"
      }`}>
        {m.done ? <Check className="h-3 w-3 text-white" strokeWidth={3} />
                : dim ? <Lock className="h-2.5 w-2.5 text-gray-400" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] font-bold leading-tight ${
          m.done ? "text-amber-800" : dim ? "text-gray-400" : "text-gray-900"
        }`}>
          {m.title}
        </div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-gray-500">
          {dim ? m.locked_reason : m.desc}
        </div>
      </div>
    </div>
  )
}

export function CrewMissions({ groupId }: { groupId: string }) {
  const [m, setM] = React.useState<Missions | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    fetchWithAuth(`/api/groups/${groupId}/missions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setM(d) })
      .catch(() => { /* 퀘스트가 안 떠도 마을은 보여야 한다 */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [groupId])

  if (loading || !m) return null

  const showSteps = m.steps_done < m.steps.length
  // 남은 개수를 배지로 — 뱃지가 0이면 굳이 눌러볼 이유가 없다
  const left = (m.weekly.length - m.weekly_done) + (showSteps ? m.steps.length - m.steps_done : 0)

  return (
    <>
      {/* 마을 위에 떠 있는 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="absolute left-2.5 top-2.5 flex flex-col items-center gap-0.5 rounded-2xl bg-white/92 px-2.5 py-2 shadow-sm active:scale-95"
      >
        <ClipboardList className="h-5 w-5 text-[#C2620F]" />
        <span className="text-[10px] font-bold text-[#C2620F]">퀘스트</span>
        {left > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {left}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="max-h-[78vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[17px] font-extrabold text-slate-900">퀘스트</h2>
              <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="flex items-baseline justify-between">
              <h3 className="text-[13.5px] font-bold text-slate-900">이번 주</h3>
              <span className="text-[12px] font-bold text-amber-700">{m.weekly_done} / {m.weekly.length}</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {m.weekly.map((w) => <Row key={w.key} m={w} />)}
            </div>

            {showSteps && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[13.5px] font-bold text-slate-900">시작하기</h3>
                  <span className="text-[11.5px] text-gray-400">{m.steps_done} / {m.steps.length}</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {m.steps.map((s) => <Row key={s.key} m={s} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
