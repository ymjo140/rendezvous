"use client"

// ─────────────────────────────────────────────────────────────
// 🏠 홈 — 스케줄러 + 모임 진행 대시보드
// 2주 캘린더(삼성 캘린더 스타일) + 컴팩트 모임 카드 + 진행 상태 프로그레스
// 역할: "내 모임 현황" 한눈에 보기. 탐색/추천은 탐색 탭이 담당.
// 시각 언어: 민트 #3BD4AE = 메인 / 앰버 #FFB800 = 단골 / 오렌지 #FF6B35 = 긴급·핫딜
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Plus, Bell, ChevronLeft, ChevronRight, Calendar, MapPin, Users, Clock, Star, CheckCircle2, Vote, Loader2 } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { useMe } from "@/hooks/use-me"
import { TabBar } from "./tab-bar"

const MINT = "#3BD4AE"
const DANDOL = "#FFB800"
const HOTDEAL = "#FF6B35"
const CULTURE = "#7C4DFF"

// ── 타입 ─────────────────────────────────────────────────────
type MoimStatus = "date_voting" | "place_waiting" | "place_voting" | "confirmed" | "visited" | "reviewed"
type Moim = {
  id: string
  name: string
  emoji: string
  date?: string          // ISO date
  time?: string          // "19:00"
  memberCount: number
  status: MoimStatus
  statusLabel: string
  statusDetail: string   // "3/5 투표", "몽탄 확정" 등
  progress: number       // 0~100
  color: string          // 모임별 고유색
  isDandol: boolean      // 단골 모임 여부
  dandolStats?: { placeCount: number; avgRating: number; rank: number }
}

// ── 상태 레이블 ──────────────────────────────────────────────
const STATUS_CONFIG: Record<MoimStatus, { label: string; color: string }> = {
  date_voting:   { label: "일정 투표 중", color: MINT },
  place_waiting: { label: "장소 추천 대기", color: "#999" },
  place_voting:  { label: "장소 투표 중", color: HOTDEAL },
  confirmed:     { label: "확정", color: MINT },
  visited:       { label: "방문 완료", color: "#999" },
  reviewed:      { label: "평가 완료", color: "#999" },
}

// ── 2주 캘린더 컴포넌트 ──────────────────────────────────────
function TwoWeekCalendar({ moims, onDateClick }: { moims: Moim[]; onDateClick: (date: Date) => void }) {
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay() + 1) // 이번 주 월요일

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    return d
  })

  const weekdays = ["월", "화", "수", "목", "금", "토", "일"]

  // 날짜별 모임 매칭
  const moimByDate = useMemo(() => {
    const map: Record<string, Moim[]> = {}
    moims.forEach(m => {
      if (m.date) {
        const key = m.date.split("T")[0]
        if (!map[key]) map[key] = []
        map[key].push(m)
      }
    })
    return map
  }, [moims])

  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-gray-400 mb-2">
        {weekdays.map((w, i) => (
          <span key={w} className={i === 5 ? "text-[#3BD4AE]" : i === 6 ? "text-red-400" : ""}>{w}</span>
        ))}
      </div>
      {/* 날짜 그리드 */}
      {[0, 1].map(week => (
        <div key={week} className="grid grid-cols-7 text-center">
          {days.slice(week * 7, week * 7 + 7).map(d => {
            const key = d.toISOString().split("T")[0]
            const dayMoims = moimByDate[key] || []
            const firstMoim = dayMoims[0]
            const isSun = d.getDay() === 0
            const isSat = d.getDay() === 6

            return (
              <button
                key={key}
                onClick={() => firstMoim && onDateClick(d)}
                className="flex flex-col items-center py-1.5 gap-0.5"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    background: isToday(d) ? MINT : firstMoim ? `${firstMoim.color}20` : "transparent",
                    color: isToday(d) ? "#fff" : firstMoim ? firstMoim.color : isSun ? "#FF6B6B" : isSat ? MINT : "#666",
                  }}
                >
                  {d.getDate()}
                </div>
                {firstMoim ? (
                  <span className="text-[7px] font-medium truncate w-full" style={{ color: firstMoim.color }}>
                    {firstMoim.name.length > 4 ? firstMoim.name.slice(0, 4) : firstMoim.name}
                  </span>
                ) : (
                  <span className="text-[7px]">&nbsp;</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── 컴팩트 모임 카드 ─────────────────────────────────────────
function MoimCard({ moim, onClick }: { moim: Moim; onClick: () => void }) {
  const dateObj = moim.date ? new Date(moim.date) : null
  const dayLabel = dateObj ? ["일", "월", "화", "수", "목", "금", "토"][dateObj.getDay()] : ""
  const dateNum = dateObj?.getDate()
  const sc = STATUS_CONFIG[moim.status]

  return (
    <button onClick={onClick} className="w-full bg-white rounded-xl p-3 shadow-sm flex items-center gap-3 active:scale-[0.98] transition-transform text-left">
      {/* 왼쪽 컬러 바 */}
      <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ background: moim.color }} />
      {/* 이모지 */}
      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: `${moim.color}15` }}>
        {moim.emoji}
      </div>
      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-gray-900 truncate">{moim.name}</span>
          {moim.isDandol && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-500 flex-shrink-0">⭐ 단골</span>
          )}
          <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: `${sc.color}12`, color: sc.color }}>
            {moim.status === "confirmed" ? "✅ " : ""}{sc.label}
          </span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{moim.statusDetail}</p>
      </div>
      {/* 오른쪽 날짜 */}
      {dateNum && (
        <div className="text-right flex-shrink-0">
          <div className="text-base font-extrabold" style={{ color: moim.color }}>{dateNum}</div>
          <div className="text-[8px] text-gray-400">{dayLabel}</div>
        </div>
      )}
    </button>
  )
}

// ── 메인 홈 ──────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const { me } = useMe()
  const [loading, setLoading] = useState(true)

  // TODO: API 연동 — 현재는 목업 데이터
  const [moims, setMoims] = useState<Moim[]>([])

  useEffect(() => {
    // TODO: fetchWithAuth("/api/moims/upcoming") → 실제 API 연동
    // 목업 데이터
    const now = new Date()
    const wed = new Date(now); wed.setDate(now.getDate() + (3 - now.getDay() + 7) % 7 || 7)
    const fri = new Date(now); fri.setDate(now.getDate() + (5 - now.getDay() + 7) % 7 || 7)
    const sat = new Date(now); sat.setDate(now.getDate() + (6 - now.getDay() + 7) % 7 || 7)
    const nextFri = new Date(fri); nextFri.setDate(fri.getDate() + 7)

    setMoims([
      {
        id: "hoesik", name: "부서 회식", emoji: "🍖",
        date: wed.toISOString(), time: "19:00",
        memberCount: 5, status: "place_voting",
        statusLabel: "장소 투표 중", statusDetail: "수 저녁 7시 · 5명 · 3/5 투표",
        progress: 60, color: HOTDEAL, isDandol: false,
      },
      {
        id: "euljiro", name: "을지로 탐험대", emoji: "🍜",
        date: sat.toISOString(), time: "12:00",
        memberCount: 5, status: "date_voting",
        statusLabel: "일정 투표 중", statusDetail: "토요일 · 5명 · 4/5 투표",
        progress: 80, color: MINT, isDandol: true,
        dandolStats: { placeCount: 23, avgRating: 4.2, rank: 12 },
      },
      {
        id: "exhibit", name: "성수 전시 데이트", emoji: "🎨",
        date: fri.toISOString(), time: "14:00",
        memberCount: 2, status: "confirmed",
        statusLabel: "확정", statusDetail: "금 오후 2시 · 2명 · 호크니 전시",
        progress: 100, color: CULTURE, isDandol: false,
      },
      {
        id: "friday", name: "금요 퇴근러", emoji: "🍻",
        date: nextFri.toISOString(),
        memberCount: 8, status: "date_voting",
        statusLabel: "일정 투표 중", statusDetail: "다음 금 · 8명 · 아직 미정",
        progress: 0, color: DANDOL, isDandol: true,
        dandolStats: { placeCount: 15, avgRating: 3.9, rank: 34 },
      },
    ])
    setLoading(false)
  }, [])

  const handleMoimClick = (moim: Moim) => {
    router.push(`/chats?room=${moim.id}`)
  }

  return (
    <div className="min-h-screen bg-[#F5F9F8] pb-20">
      {/* 헤더 */}
      <header className="bg-white px-5 py-3 flex items-center justify-between border-b border-gray-100">
        <span className="text-xl font-extrabold text-gray-900 italic">mint</span>
        <button className="text-lg"><Bell className="w-5 h-5 text-gray-400" /></button>
      </header>

      <div className="px-4 pt-3 space-y-3">
        {/* 월 표시 + 새 모임 버튼 */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-gray-900">
            {new Date().getFullYear()}년 {new Date().getMonth() + 1}월
          </h1>
          <button
            onClick={() => router.push("/crew-new")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-bold"
            style={{ background: MINT }}
          >
            <Plus className="w-3.5 h-3.5" />
            새 모임
          </button>
        </div>

        {/* 2주 캘린더 */}
        <TwoWeekCalendar moims={moims} onDateClick={(d) => {
          const key = d.toISOString().split("T")[0]
          const m = moims.find(m => m.date?.split("T")[0] === key)
          if (m) handleMoimClick(m)
        }} />

        {/* 다가오는 모임 */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            다가오는 모임
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: MINT }}>
              {moims.length}
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : (
          <div className="space-y-2">
            {moims.map(m => (
              <MoimCard key={m.id} moim={m} onClick={() => handleMoimClick(m)} />
            ))}
          </div>
        )}
      </div>

      <TabBar />
    </div>
  )
}
