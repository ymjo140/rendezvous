"use client"

import React from "react"
import { Archive, BookOpen, Check, ClipboardList, Lock, Loader2, Trophy, X, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useCrewResource } from "@/lib/use-crew-resource"
import { CrewLoadError } from "@/components/ui/crew-load-error"

/** 퀘스트 — 마을 위에 떠 있는 버튼, 누르면 모달.
 *
 *  아이러브커피의 액션 아이콘을 참고하되, 현재 화면에서는 캐릭터를 가리지 않도록
 *  장면 위쪽에 작게 가로로 배치한다. 목록으로 깔면 마을이 밀려 내려간다.
 *
 *  계단 3개는 일회성 온보딩이라 다 깨면 사라진다. 그 자리를 주간이 이어받는다.
 *  주간인 이유는 밥은 매일 먹어도 크루로 모이는 건 주 1~2회라서다.
 */

type Mission = {
  key: string; title: string; desc: string
  done: boolean; progress: number; goal: number
  action?: { href: string; label: string }; completion?: string | null; scope?: string
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
          <span className="block">{m.scope === "personal_in_crew" ? "이 크루에서 내 활동" : "크루 공동 활동"} · {m.progress}/{m.goal}</span>
          {m.done && <span className="block text-emerald-700">{m.completion}</span>}
        </div>
        {!dim && !m.done && m.action && <Link href={m.action.href} className="mt-2 inline-block rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">{m.action.label}</Link>}
      </div>
    </div>
  )
}

export function CrewMissions({
  groupId,
  onMenuDex,
  onRanking,
  onVisits,
}: {
  groupId: string
  onMenuDex?: () => void
  onRanking?: () => void
  onVisits?: () => void
}) {
  const { data: m, loading, error, reload } = useCrewResource<Missions>(`/api/groups/${encodeURIComponent(groupId)}/missions`)
  const [open, setOpen] = React.useState(false)
  if (loading) return <span role="status" className="absolute left-3 top-3 rounded-xl bg-white p-2 text-xs"><Loader2 className="inline h-3 w-3 animate-spin" /> 퀘스트 확인 중</span>
  if (error && !m) return <div className="absolute left-2 top-0 z-10 max-w-[90%]"><CrewLoadError message={error} retry={reload} /></div>
  if (!m) return null

  const showSteps = m.steps_done < m.steps.length
  // 남은 개수를 배지로 — 뱃지가 0이면 굳이 눌러볼 이유가 없다
  const left = (m.weekly.length - m.weekly_done) + (showSteps ? m.steps.length - m.steps_done : 0)

  return (
    <>
      {/* 캐릭터 머리보다 위에 놓는 컴팩트 액션 레일 */}
      <div className="absolute left-3 top-[52px] z-20 flex items-start gap-1">
        <button
          onClick={() => setOpen(true)}
          className="relative flex h-[43px] w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl border border-[#f1cc7b] bg-[#fff2cf]/95 px-1 py-1 shadow-[0_3px_10px_rgba(126,80,20,0.14)] active:scale-95"
        >
          <ClipboardList className="h-4 w-4 text-[#F5A623]" />
          <span className="text-[8.5px] font-extrabold leading-none text-[#a86613]">퀘스트</span>
          {left > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
              {left}
            </span>
          )}
        </button>
        <FloatingAction icon={BookOpen} label="도감" onClick={onMenuDex} />
        <FloatingAction icon={Trophy} label="랭킹" onClick={onRanking} />
        <FloatingAction icon={Archive} label="기록" onClick={onVisits} ariaLabel="방문 기록" />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            role="dialog" aria-modal="true" aria-label="크루 퀘스트"
            className="max-h-[78vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[17px] font-extrabold text-slate-900">퀘스트</h2>
              <button aria-label="퀘스트 닫기" onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-gray-100">
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

function FloatingAction({
  icon: Icon,
  label,
  onClick,
  ariaLabel,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || label}
      className="flex h-[43px] w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl border border-[#f1cc7b] bg-[#fff8e8]/95 px-1 py-1 text-[#a86613] shadow-[0_3px_10px_rgba(126,80,20,0.12)] transition-transform active:scale-95 disabled:opacity-60"
      disabled={!onClick}
    >
      <Icon className="h-4 w-4 text-[#F5A623]" strokeWidth={2.4} />
      <span className="text-[8.5px] font-extrabold leading-none">{label}</span>
    </button>
  )
}
