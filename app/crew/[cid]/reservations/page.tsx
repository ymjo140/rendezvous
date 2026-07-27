"use client"

// 📅 크루 예약 — 멤버 누구의 예약이든 크루 전체가 본다. 같이 가는 약속이니까.
// 예약 시간 ±2시간에는 '방문 체크인' 버튼이 뜬다(위치로 현장 확인 → 제휴 혜택 자동 적용).

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft, CalendarCheck, MapPin, Users } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type Resv = {
  id: string
  place_id?: number | null
  place_name: string
  date: string
  time: string
  party_size: number
  deposit_amount: number
  status: "confirmed" | "cancelled" | "completed"
  table_label?: string | null
  crew_title?: string | null
  crew_icon?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "예약 확정", completed: "방문 완료", cancelled: "취소됨", no_show: "노쇼",
}
const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-600",
  completed: "bg-slate-100 text-slate-500",
  cancelled: "bg-rose-50 text-rose-500",
  no_show: "bg-rose-50 text-rose-500",
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** 예약 당일 ±2시간 — 서버가 같은 창으로 검사하므로 버튼도 그때만 보여준다. */
function canCheckIn(r: Resv): boolean {
  if (r.status !== "confirmed" || !r.place_id) return false
  if (r.date !== todayStr()) return false
  const now = new Date()
  const [hh, mm] = String(r.time || "0:0").split(":")
  return Math.abs(now.getHours() * 60 + now.getMinutes() - (Number(hh) * 60 + Number(mm))) <= 120
}

export default function CrewReservationsPage() {
  const cid = useParams<{ cid: string }>()?.cid
  const router = useRouter()
  const [items, setItems] = useState<Resv[] | null>(null)

  useEffect(() => {
    if (!cid) return
    fetchWithAuth(`/api/reservations/crew/${cid}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
  }, [cid])

  const today = todayStr()
  const upcoming = (items || []).filter((r) => r.status === "confirmed" && r.date >= today)
  const past = (items || []).filter((r) => !(r.status === "confirmed" && r.date >= today))

  const Card = ({ r }: { r: Resv }) => (
    <article className="rounded-2xl border border-slate-100 p-3.5">
      <div className="flex items-center gap-1.5">
        <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-slate-900">{r.place_name}</b>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status] || "bg-slate-100 text-slate-500"}`}>
          {STATUS_LABEL[r.status] || r.status}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-slate-400">
        <span className="flex items-center gap-0.5"><CalendarCheck className="h-3 w-3" />{r.date} {r.time}</span>
        <span>·</span>
        <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{r.party_size}명</span>
        {r.table_label && <><span>·</span><span>{r.table_label}</span></>}
      </div>
      {canCheckIn(r) && (
        <button
          onClick={() => router.push(`/checkin/${r.place_id}?rid=${r.id}`)}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#F5A623] py-2.5 text-[12.5px] font-bold text-white"
        >
          <MapPin className="h-3.5 w-3.5" />방문 체크인
        </button>
      )}
    </article>
  )

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-16">
      <header className="flex items-center gap-2 px-4 pt-5">
        <button onClick={() => router.back()} className="-ml-1 p-1 text-slate-400">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[17px] font-bold text-slate-900">크루 예약</h1>
      </header>
      <p className="px-4 pt-1 text-[11.5px] text-slate-400">
        멤버 누가 잡은 예약이든 크루 전체가 볼 수 있어요
      </p>

      {items === null ? (
        <p className="px-4 py-20 text-center text-[13px] text-slate-300">불러오는 중...</p>
      ) : items.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-[13px] text-slate-500">아직 크루 예약이 없어요.</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">
            가게에서 예약할 때 &lsquo;누구와 가나요&rsquo;에서 이 크루를 고르면 여기 모여요.
          </p>
          <button onClick={() => router.push("/")} className="mt-4 text-[12.5px] font-bold text-[#F5A623]">
            가게 찾아보기 →
          </button>
        </div>
      ) : (
        <div className="space-y-4 px-4 pt-4">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold text-slate-500">다가오는 예약 {upcoming.length}건</h2>
              <div className="space-y-2">{upcoming.map((r) => <Card key={r.id} r={r} />)}</div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold text-slate-500">지난 예약</h2>
              <div className="space-y-2 opacity-70">{past.map((r) => <Card key={r.id} r={r} />)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
