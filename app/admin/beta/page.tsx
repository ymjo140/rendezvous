"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { BetaMetrics, RetentionMetric, percent } from "@/lib/beta-metrics"

function RetentionCard({ title, unit, metric }: { title: string; unit: string; metric: RetentionMetric }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4">
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      <p className="mt-2 text-2xl font-extrabold text-[#B46A08]">{percent(metric.rate)}</p>
      <p className="mt-2 text-xs leading-5 text-gray-600">
        28일 관찰을 마친 {metric.eligible.toLocaleString()}{unit} 중 {metric.converted.toLocaleString()}{unit} 재방문
        <br />관찰 중 {metric.pending.toLocaleString()}{unit}
      </p>
    </section>
  )
}

export default function BetaMetricsPage() {
  const [result, setResult] = useState<{ key: number; data: BetaMetrics | null; error: string }>({ key: -1, data: null, error: "" })
  const [refresh, setRefresh] = useState(0)
  const request = useRef(0)
  const loading = result.key !== refresh
  const data = loading ? null : result.data
  const error = loading ? "" : result.error

  useEffect(() => {
    const id = ++request.current
    const controller = new AbortController()
    const fail = (message: string) => setResult({ key: refresh, data: null, error: message })
    const expire = () => {
      controller.abort()
      ++request.current
      fail("관리자 계정으로 다시 로그인해주세요.")
    }
    window.addEventListener("auth:expired", expire)
    void (async () => {
      try {
        const response = await fetchWithAuth("/api/admin/beta-metrics", { signal: controller.signal, cache: "no-store" })
        if (id !== request.current) return
        if (!response.ok) {
          fail(response.status === 401 || response.status === 403
            ? "관리자 계정으로 로그인해야 볼 수 있어요."
            : "지표를 불러오지 못했어요. 잠시 후 다시 시도해주세요.")
          return
        }
        const payload: BetaMetrics = await response.json()
        if (id === request.current && !controller.signal.aborted) setResult({ key: refresh, data: payload, error: "" })
      } catch {
        if (id === request.current && !controller.signal.aborted) fail("서버 연결에 실패했어요. 다시 시도해주세요.")
      }
    })()
    return () => {
      controller.abort()
      window.removeEventListener("auth:expired", expire)
    }
  }, [refresh])

  return (
    <main className="min-h-screen bg-[#FAF8F4] text-gray-900">
      <div className="mx-auto max-w-2xl">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-gray-100 bg-white/95 px-4 backdrop-blur">
          <Link href="/admin/metrics" aria-label="기존 운영 지표로 이동" className="rounded-full p-2 hover:bg-gray-100"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="font-bold">크루 베타 지표</h1>
          <button onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="지표 새로고침"
            className="ml-auto rounded-full p-2 hover:bg-gray-100 disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </header>

        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-16 text-sm text-gray-600"><Loader2 className="h-5 w-5 animate-spin" />지표를 계산하고 있어요</div>
          : error ? <div role="alert" className="m-4 rounded-2xl bg-white p-8 text-center">
            <p className="text-sm text-gray-700">{error}</p>
            <button onClick={() => setRefresh(value => value + 1)} className="mt-4 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white">다시 시도</button>
          </div> : data ? <div className="space-y-4 p-4 pb-12">
            <section className="rounded-3xl bg-[#F4A623] p-5">
              <p className="text-sm font-semibold">최근 28일 · 반복해서 모인 크루</p>
              <p className="my-2 text-4xl font-black">{data.summary.repeat_crews.toLocaleString()}<span className="ml-1 text-lg font-bold">팀</span></p>
              <p className="text-sm leading-6">현장에서 인증한 공동 방문이 2회 이상인 크루예요.</p>
              <p className="mt-3 text-xs leading-5">한국 시간 오늘 현재까지 포함 · {new Date(data.as_of).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 기준</p>
            </section>
            <div className="grid grid-cols-3 gap-2">
              {[
                { title: "방문한 크루", value: data.summary.active_crews, unit: "팀" },
                { title: "공동 방문", value: data.summary.verified_visits, unit: "회" },
                { title: "첫 방문 크루", value: data.summary.first_visit_crews, unit: "팀" },
              ].map(({ title, value, unit }) => <div key={title} className="rounded-2xl border border-gray-100 bg-white p-3 text-center">
                <p className="text-xs text-gray-600">{title}</p><p className="mt-2 text-lg font-extrabold">{value.toLocaleString()}<span className="ml-1 text-xs font-normal">{unit}</span></p>
              </div>)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <RetentionCard title="28일 안에 두 번째 공동 방문" unit="팀" metric={data.retention.second_visit_28d} />
              <RetentionCard title="28일 안에 같은 가게 재방문" unit="쌍" metric={data.retention.same_place_28d} />
            </div>
            <p className="px-1 text-xs leading-5 text-gray-600">재방문율은 누적 관찰 대상 기준이에요. 첫 방문 후 28일이 지나야 분모에 포함되며, 같은 가게는 크루·가게 쌍으로 계산해요. 예약이나 “또 갈래요” 답변은 방문에 포함하지 않아요.</p>

            <section className="rounded-2xl border border-gray-100 bg-white p-4">
              <h2 className="text-sm font-bold">첫 방문 주차별 두 번째 방문</h2>
              <p className="mt-1 text-xs text-gray-500">최근 12개 주차 · 월요일 시작 · 28일 관찰 기준</p>
              {data.cohorts.length ? <div className="mt-3 overflow-x-auto"><table className="w-full whitespace-nowrap text-xs">
                <thead><tr className="text-gray-500"><th className="py-2 text-left">첫 방문 주</th><th>전체</th><th>관찰 완료</th><th>재방문</th><th className="text-right">비율</th></tr></thead>
                <tbody>{data.cohorts.map(row => <tr key={row.week_start} className="border-t border-gray-100">
                  <td className="py-3">{row.week_start}</td><td className="text-center">{row.crews}</td><td className="text-center">{row.eligible}</td><td className="text-center">{row.converted}</td><td className="text-right font-semibold">{percent(row.rate)}</td>
                </tr>)}</tbody>
              </table></div> : <p className="mt-4 text-sm text-gray-500">첫 공동 방문을 기다리고 있어요.</p>}
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4">
              <h2 className="text-sm font-bold">최근 14일 공동 방문</h2>
              <table className="mt-2 w-full text-xs"><thead><tr className="text-gray-500"><th className="py-2 text-left">날짜</th><th>방문 크루</th><th>공동 방문</th><th className="text-right">첫 방문 크루</th></tr></thead>
                <tbody>{data.series.slice(-14).reverse().map(row => <tr key={row.date} className="border-t border-gray-50">
                  <td className="py-2">{row.date.slice(5)}</td><td className="text-center">{row.crews}</td><td className="text-center">{row.visits}</td><td className="text-right">{row.first_visit_crews}</td>
                </tr>)}</tbody>
              </table>
            </section>
            <section className="rounded-2xl border border-gray-100 bg-white p-4 text-sm">
              <h2 className="font-bold">최근 28일의 기록</h2>
              <p className="mt-3 flex justify-between"><span>다른 크루 리스트 담기</span><strong>{data.summary.credited_list_copies}건</strong></p>
              <p className="mt-2 flex justify-between"><span>공동 방문 참가자 후기 응답</span><strong>{data.summary.verified_feedback_responses}건</strong></p>
            </section>
            <section className="rounded-2xl border border-gray-100 bg-white p-4">
              <h2 className="text-sm font-bold">베타 행동 이벤트</h2>
              <p className="mt-1 text-xs text-gray-500">최근 {data.behavior_events.window_days}일 · 서버 사실과 인증 사용자 행동의 횟수</p>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {[
                  ["마을 조회", "village_viewed"],
                  ["미션 시작", "mission_action_started"],
                  ["장소 저장", "list_place_saved"],
                  ["방문 인증", "visit_verified"],
                  ["크루 합류", "crew_member_joined"],
                  ["투표 확정", "decision_confirmed"],
                ].map(([label, key]) => (
                  <p key={key} className="flex justify-between border-b border-gray-50 pb-1.5">
                    <span>{label}</span><strong>{(data.behavior_events.counts[key] || 0).toLocaleString()}</strong>
                  </p>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-dashed border-gray-300 p-4">
              <h2 className="text-sm font-bold">아직 측정하지 않는 지표</h2>
              <ul className="mt-2 space-y-2 text-xs leading-5 text-gray-600">{data.coverage.unavailable.map(item => <li key={item.key}>{item.reason}</li>)}</ul>
            </section>
          </div> : null}
      </div>
    </main>
  )
}
