"use client"

// 달력 — 년/월 선택 + 월 그리드. 예약 날짜와 일정 투표 후보가 같이 쓴다.
//
// components/ui/calendar.tsx(react-day-picker)를 안 쓴 이유: 그 파일은 Tailwind v4
// 문법(size-(--cell-size), has-focus:, **:[...])으로 쓰여 있는데 이 프로젝트 빌드는
// v3다(postcss.config.js + tailwind.config.ts + app/globals.css 전부 v3). 클래스가
// 생성되지 않아 화면이 깨지고, 어디서도 import된 적 없어 동작 선례도 없다.

import React, { useState } from "react"

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"]

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export type DayStatus = "free" | "busy"

export function MonthCalendar({
  selected,
  onToggle,
  status,
  footer,
}: {
  selected: string[]
  onToggle: (date: string) => void
  /** 날짜별 상태 — free는 추천(멤버 전원 일정 없음), busy는 누군가 일정 있음 */
  status?: Record<string, DayStatus>
  footer?: React.ReactNode
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const first = selected.find((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
  const base = first ? new Date(`${first}T00:00:00`) : today
  const [cursor, setCursor] = useState(new Date(base.getFullYear(), base.getMonth(), 1))
  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const lead = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]
  // 지난 달로는 못 간다 — 과거는 어차피 전부 비활성이라 빈 화면만 보여준다
  const canPrev = year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth())
  const years = [today.getFullYear(), today.getFullYear() + 1]

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-lg px-2 py-1 text-gray-500 disabled:opacity-25"
          aria-label="이전 달"
        >
          ‹
        </button>
        <div className="flex items-center gap-1">
          <select
            value={year}
            onChange={(e) => setCursor(new Date(Number(e.target.value), month, 1))}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setCursor(new Date(year, Number(e.target.value), 1))}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700"
          >
            {Array.from({ length: 12 }, (_, m) => (
              <option key={m} value={m}>{m + 1}월</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded-lg px-2 py-1 text-gray-500"
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-gray-400">
        {DOW_KO.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`pad-${i}`} />
          const s = ymd(d)
          const past = d < today
          const on = selected.includes(s)
          const st = status?.[s]
          return (
            <button
              key={s}
              type="button"
              disabled={past}
              onClick={() => onToggle(s)}
              className={`relative rounded-lg py-1.5 text-xs transition-colors ${
                on
                  ? "bg-amber-600 font-bold text-white"
                  : past
                    ? "text-gray-300"
                    : st === "busy"
                      ? "text-gray-300 line-through"
                      : st === "free"
                        ? "bg-amber-50 font-bold text-amber-800 hover:bg-amber-100"
                        : "text-gray-700 hover:bg-amber-50"
              }`}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
      {footer}
    </div>
  )
}
