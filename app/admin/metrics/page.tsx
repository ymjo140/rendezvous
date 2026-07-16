"use client"

// 운영 지표 대시보드 — 관리자(user 5) 전용. /admin/metrics
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type Series = { date: string; dau: number; messages: number; reservations: number; polls: number }

export default function AdminMetricsPage() {
  const router = useRouter()
  const [data, setData] = useState<{ totals: Record<string, number>; series: Series[] } | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetchWithAuth("/api/admin/metrics?days=14")
      if (res.status === 401 || res.status === 403) {
        setError("관리자 계정으로 로그인해야 볼 수 있어요.")
      } else if (res.ok) {
        setData(await res.json())
      } else {
        setError("지표를 불러오지 못했어요.")
      }
    } catch {
      setError("서버 연결에 실패했어요.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const t = data?.totals || {}
  const series = data?.series || []
  const maxDau = Math.max(1, ...series.map((s) => s.dau))

  const CARDS: { key: string; label: string; hint?: string }[] = [
    { key: "active_today", label: "오늘 활성 (DAU)" },
    { key: "active_7d", label: "주간 활성 (WAU)" },
    { key: "active_30d", label: "월간 활성 (MAU)" },
    { key: "total_users", label: "총 가입자" },
    { key: "push_devices", label: "앱 설치 기기", hint: "푸시 토큰 수" },
    { key: "reservations_total", label: "누적 예약" },
    { key: "polls_total", label: "투표 생성" },
    { key: "polls_confirmed", label: "투표 확정" },
    { key: "messages_total", label: "채팅 메시지" },
    { key: "posts_total", label: "게시물" },
    { key: "reviews_total", label: "리뷰" },
    { key: "revisit_feedback", label: "'또 갈래요' 응답" },
    { key: "friendships", label: "친구 관계" },
  ]

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto font-['Pretendard']">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 flex items-center gap-2 px-3 h-14">
        <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <span className="font-bold text-gray-900">📊 운영 지표</span>
        <button onClick={load} className="ml-auto p-1.5 rounded-full hover:bg-gray-100" title="새로고침">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && !data ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#F5A623]" /></div>
      ) : error ? (
        <div className="py-20 text-center text-sm text-gray-400">{error}</div>
      ) : (
        <div className="p-4 space-y-4">
          {/* 핵심 지표 카드 */}
          <div className="grid grid-cols-3 gap-2">
            {CARDS.slice(0, 3).map((c) => (
              <div key={c.key} className="rounded-2xl bg-white border border-gray-100 p-3 text-center">
                <div className="text-[11px] text-gray-400">{c.label}</div>
                <div className="text-xl font-extrabold text-[#F5A623] mt-0.5">{(t[c.key] ?? 0).toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* 일별 DAU 바 차트 (14일) */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            <div className="text-xs font-bold text-gray-600 mb-3">일별 활성 유저 (최근 14일)</div>
            <div className="flex items-end gap-1 h-28">
              {series.map((s) => (
                <div key={s.date} className="flex-1 flex flex-col items-center gap-1" title={`${s.date}: ${s.dau}명`}>
                  <span className="text-[9px] text-gray-500 font-bold">{s.dau > 0 ? s.dau : ""}</span>
                  <div
                    className="w-full rounded-t bg-[#F5A623] min-h-[2px] transition-all"
                    style={{ height: `${Math.round((s.dau / maxDau) * 88)}%`, opacity: s.dau > 0 ? 1 : 0.15 }}
                  />
                  <span className="text-[8px] text-gray-400">{s.date.slice(8)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 일별 기능 사용 표 */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            <div className="text-xs font-bold text-gray-600 mb-2">일별 기능 사용</div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left py-1 font-normal">날짜</th>
                  <th className="text-right font-normal">DAU</th>
                  <th className="text-right font-normal">메시지</th>
                  <th className="text-right font-normal">투표</th>
                  <th className="text-right font-normal">예약</th>
                </tr>
              </thead>
              <tbody>
                {series.slice().reverse().map((s) => (
                  <tr key={s.date} className="border-t border-gray-50">
                    <td className="py-1 text-gray-600">{s.date.slice(5)}</td>
                    <td className="text-right font-bold text-gray-800">{s.dau}</td>
                    <td className="text-right text-gray-500">{s.messages}</td>
                    <td className="text-right text-gray-500">{s.polls}</td>
                    <td className="text-right text-gray-500">{s.reservations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 누적 지표 */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            <div className="text-xs font-bold text-gray-600 mb-2">누적</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {CARDS.slice(3).map((c) => (
                <div key={c.key} className="flex justify-between text-xs">
                  <span className="text-gray-500">{c.label}</span>
                  <span className="font-bold text-gray-800">{(t[c.key] ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
