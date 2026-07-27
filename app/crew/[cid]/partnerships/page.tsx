"use client"

// 🤝 크루 제휴 관리 — 받은 제안 / 제휴 중 / 신청 중 / 신청할 수 있는 곳 / 지난 기록.
// 내 크루 탭의 '제휴 관리' 칸에서 진입. 진입 시 seen 처리로 느낌표가 사라진다.

import React, { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft, ChevronDown, Handshake } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type Store = { place_id: number; name: string; address: string; category: string }
type Deal = {
  partnership_id: number; title: string; benefit: string; discount_pct: number | null
  target: string; conditions: any; expires_at: string | null; store: Store
  app_id?: number; status?: string; direction?: string; message?: string | null
  created_at?: string; is_new?: boolean; days_left?: number | null; ended?: boolean
  uses?: number; visits?: number; agreed_at?: string
}
type Summary = {
  crew: { id: string; title: string; icon: string; crew_type: string }
  eligibility: { eligible: boolean; track: string | null; members: number; visits: number }
  invites: Deal[]; active: Deal[]; pending: Deal[]; available: Deal[]; past: Deal[]
}

const DAY_LABEL: Record<string, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
}

function condText(c: any): string {
  const parts: string[] = []
  if (Array.isArray(c?.days) && c.days.length) parts.push(c.days.map((d: string) => DAY_LABEL[d] || d).join("·"))
  if (c?.time_from || c?.time_to) parts.push(`${c.time_from || ""}~${c.time_to || ""}`)
  if (c?.min_party) parts.push(`${c.min_party}인 이상`)
  if (c?.max_members) parts.push(`크루 ${c.max_members}명까지`)
  if (c?.monthly_uses) parts.push(`월 ${c.monthly_uses}회`)
  return parts.join(" · ")
}

function area(addr: string): string {
  return (addr || "").split(" ").slice(1, 3).join(" ")
}

export default function CrewPartnershipsPage() {
  const params = useParams<{ cid: string }>()
  const router = useRouter()
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pastOpen, setPastOpen] = useState(false)

  const load = useCallback(() => {
    if (!params?.cid) return
    fetchWithAuth(`/api/crew-partnerships/summary?community_id=${params.cid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [params?.cid])

  useEffect(() => {
    load()
    // 화면을 열면 느낌표 해제
    if (params?.cid) {
      fetchWithAuth("/api/crew-partnerships/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community_id: params.cid }),
      }).catch(() => {})
    }
  }, [params?.cid, load])

  const flash = (t: string) => {
    setMsg(t)
    setTimeout(() => setMsg(null), 3000)
  }

  const respond = async (appId: number, action: "accept" | "decline") => {
    setBusy(appId)
    try {
      const r = await fetchWithAuth(`/api/crew-partnerships/${appId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (r.ok) {
        flash(action === "accept" ? "제휴가 시작됐어요! 이제 혜택을 쓸 수 있어요 🤝" : "제안을 거절했어요.")
        load()
      }
    } catch { /* ignore */ } finally { setBusy(null) }
  }

  const cancel = async (appId: number) => {
    setBusy(appId)
    try {
      const r = await fetchWithAuth(`/api/crew-partnerships/${appId}/cancel`, { method: "POST" })
      if (r.ok) { flash("신청을 취소했어요."); load() }
    } catch { /* ignore */ } finally { setBusy(null) }
  }

  const apply = async (pid: number) => {
    setBusy(pid)
    try {
      const r = await fetchWithAuth(`/api/crew-deals/${pid}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community_id: params.cid }),
      })
      if (r.ok) { flash("신청 완료! 사장님 승인을 기다려주세요."); load() }
      else {
        const e = await r.json().catch(() => null)
        flash(typeof e?.detail === "string" ? e.detail : "아직 제휴 자격이 안 돼요.")
      }
    } catch { /* ignore */ } finally { setBusy(null) }
  }

  if (loading) {
    return <div className="mx-auto min-h-screen max-w-md bg-white py-20 text-center text-sm text-slate-400">불러오는 중...</div>
  }
  if (!data) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 py-20 text-center">
        <p className="text-sm text-slate-400">제휴 정보를 불러오지 못했어요.</p>
        <button onClick={() => router.back()} className="mt-4 text-[13px] font-semibold text-[#F5A623]">돌아가기</button>
      </div>
    )
  }

  const el = data.eligibility

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-16">

      <div className="sticky top-0 z-10 flex items-center gap-2 bg-white px-4 py-3">
        <button onClick={() => router.back()} className="rounded-full p-1 text-slate-500" aria-label="뒤로">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold text-slate-900">제휴 관리</h1>
          <p className="truncate text-[11px] text-slate-400">{data.crew.icon} {data.crew.title}</p>
        </div>
        {el.eligible ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            제휴 자격 있음
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
            자격 준비 중
          </span>
        )}
      </div>

      {msg && (
        <div className="mx-4 mb-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12px] font-medium text-amber-800">{msg}</div>
      )}

      {/* 자격 미달 — 뭘 더 하면 되는지 */}
      {!el.eligible && (
        <div className="mx-4 mb-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
          <p className="text-[12.5px] font-semibold text-amber-900">제휴 자격까지 조금 남았어요</p>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-2 text-[12px]">
              <span className={el.members >= 3 ? "text-emerald-600" : "text-slate-300"}>●</span>
              <span className="text-slate-600">멤버 3명 이상</span>
              <span className="ml-auto font-semibold text-slate-700">{el.members}/3</span>
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <span className={el.visits >= 3 ? "text-emerald-600" : "text-slate-300"}>●</span>
              <span className="text-slate-600">함께 방문 3회 이상</span>
              <span className="ml-auto font-semibold text-slate-700">{el.visits}/3</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
            학교·회사 이메일로 소속을 인증하면 방문 횟수 없이도 바로 자격이 생겨요.
          </p>
        </div>
      )}

      {/* 🔔 받은 제안 */}
      {data.invites.length > 0 && (
        <section className="px-4 pt-1">
          <h2 className="mb-2 flex items-center gap-1.5 text-[13.5px] font-bold text-slate-900">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            받은 제안 <span className="text-[12px] font-medium text-slate-400">{data.invites.length}</span>
          </h2>
          <div className="space-y-2">
            {data.invites.map((d) => (
              <div key={d.app_id} className="rounded-2xl border border-amber-300 bg-amber-50/70 p-3.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-bold text-amber-900">{d.store.name}</b>
                    <span className="block truncate text-[11px] text-amber-700">
                      {d.store.category}{d.store.address ? ` · ${area(d.store.address)}` : ""}
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-[13px] font-medium text-amber-900">
                  🎁 {d.benefit}{d.discount_pct ? ` (${d.discount_pct}%)` : ""}
                </div>
                {condText(d.conditions) && (
                  <div className="mt-0.5 text-[11px] text-amber-700">{condText(d.conditions)}</div>
                )}
                {d.message && (
                  <div className="mt-2 border-t border-amber-200 pt-2 text-[11.5px] leading-relaxed text-amber-800">
                    사장님 한마디 — {d.message}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => respond(d.app_id!, "accept")}
                    disabled={busy === d.app_id}
                    className="flex-1 rounded-xl bg-[#F5A623] py-2.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                  >
                    수락
                  </button>
                  <button
                    onClick={() => respond(d.app_id!, "decline")}
                    disabled={busy === d.app_id}
                    className="flex-1 rounded-xl border border-amber-200 bg-white py-2.5 text-[12.5px] font-semibold text-slate-500 disabled:opacity-50"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ✅ 제휴 중 */}
      <section className="px-4 pt-4">
        <h2 className="mb-2 text-[13.5px] font-bold text-slate-900">
          제휴 중 <span className="text-[12px] font-medium text-slate-400">{data.active.length}</span>
        </h2>
        {data.active.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 px-3.5 py-4 text-[12px] text-slate-400">
            아직 진행 중인 제휴가 없어요. 아래에서 신청하거나 사장님 제안을 기다려보세요.
          </p>
        ) : (
          <div className="space-y-2">
            {data.active.map((d) => (
              <div key={d.app_id} className="rounded-2xl border border-slate-100 p-3.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-semibold text-slate-900">{d.store.name}</b>
                    <span className="block truncate text-[11px] text-slate-400">
                      {d.store.category}{d.store.address ? ` · ${area(d.store.address)}` : ""}
                    </span>
                  </div>
                  {typeof d.days_left === "number" && d.days_left <= 14 ? (
                    <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600">
                      {d.days_left}일 남음
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      사용 가능
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-[13px] text-slate-700">
                  🎁 {d.benefit}{d.discount_pct ? ` (${d.discount_pct}%)` : ""}
                </div>
                {condText(d.conditions) && (
                  <div className="mt-0.5 text-[11px] text-slate-400">{condText(d.conditions)}</div>
                )}
                <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2.5">
                  <span className="text-[11px] text-slate-400">
                    우리 크루 {d.uses ?? 0}번 방문
                    {d.expires_at ? ` · ${d.expires_at.slice(0, 10)}까지` : ""}
                    {d.agreed_at ? ` · ${d.agreed_at.slice(0, 10)} 합의` : ""}
                  </span>
                  <button
                    onClick={() => router.push(`/places/${d.store.place_id}`)}
                    className="ml-auto text-[11.5px] font-semibold text-[#F5A623]"
                  >
                    가게 보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ⏳ 신청 중 */}
      {data.pending.length > 0 && (
        <section className="px-4 pt-4">
          <h2 className="mb-2 text-[13.5px] font-bold text-slate-900">
            신청 중 <span className="text-[12px] font-medium text-slate-400">{data.pending.length}</span>
          </h2>
          <div className="space-y-2">
            {data.pending.map((d) => (
              <div key={d.app_id} className="rounded-2xl border border-slate-100 p-3.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-semibold text-slate-900">{d.store.name}</b>
                    <span className="block truncate text-[11px] text-slate-400">
                      {d.created_at ? `${d.created_at.slice(0, 10)} 신청` : "신청함"} · 보통 2~3일 안에 답변이 와요
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                    승인 대기
                  </span>
                </div>
                <button
                  onClick={() => cancel(d.app_id!)}
                  disabled={busy === d.app_id}
                  className="mt-2.5 w-full border-t border-slate-100 pt-2.5 text-left text-[11.5px] text-slate-400 disabled:opacity-50"
                >
                  신청 취소
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 🔎 신청할 수 있는 곳 */}
      <section className="px-4 pt-4">
        <h2 className="mb-2 text-[13.5px] font-bold text-slate-900">
          신청할 수 있는 곳 <span className="text-[12px] font-medium text-slate-400">{data.available.length}</span>
        </h2>
        {data.available.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 px-3.5 py-4 text-[12px] text-slate-400">
            지금은 신청할 수 있는 제휴가 없어요. 새 제휴가 열리면 여기에 뜹니다.
          </p>
        ) : (
          <div className="space-y-2">
            {data.available.map((d) => (
              <div key={d.partnership_id} className="rounded-2xl border border-slate-100 p-3.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-semibold text-slate-900">{d.store.name}</b>
                    <span className="block truncate text-[11px] text-slate-400">
                      {d.store.category}{d.store.address ? ` · ${area(d.store.address)}` : ""}
                      {(d.visits ?? 0) > 0 && ` · 우리 크루가 ${d.visits}번 방문`}
                    </span>
                  </div>
                  <button
                    onClick={() => apply(d.partnership_id)}
                    disabled={busy === d.partnership_id || !el.eligible}
                    className="shrink-0 rounded-full bg-[#F5A623] px-3.5 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-40"
                  >
                    {el.eligible ? "신청" : "자격 필요"}
                  </button>
                </div>
                <div className="mt-1.5 text-[12.5px] text-slate-600">
                  🎁 {d.benefit}{d.discount_pct ? ` (${d.discount_pct}%)` : ""}
                </div>
                {condText(d.conditions) && (
                  <div className="mt-0.5 text-[11px] text-slate-400">{condText(d.conditions)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 지난 기록 */}
      {data.past.length > 0 && (
        <section className="px-4 pt-4">
          <button
            onClick={() => setPastOpen(!pastOpen)}
            className="flex w-full items-center gap-1.5 border-t border-slate-100 pt-3 text-[12px] text-slate-400"
          >
            지난 제휴 · 거절된 신청 <span>{data.past.length}</span>
            <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${pastOpen ? "rotate-180" : ""}`} />
          </button>
          {pastOpen && (
            <div className="mt-2 space-y-1.5">
              {data.past.map((d) => (
                <div key={d.app_id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{d.store.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {d.status === "rejected" ? "거절됨" : d.ended ? "종료" : "지난 제휴"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="px-4 pt-6">
        <div className="flex items-start gap-2 rounded-2xl bg-slate-50 px-3.5 py-3">
          <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-[11.5px] leading-relaxed text-slate-500">
            제휴는 크루 단위로 맺어요. 승인되면 멤버 누구나 가게에서 혜택을 쓸 수 있고,
            우리 크루가 자주 간 가게일수록 제안이 잘 들어와요.
            <br />
            성사된 제휴는 <b className="font-semibold text-slate-600">수락한 시점의 조건</b>이 기간이 끝날 때까지 그대로 유지돼요.
          </p>
        </div>
      </div>

    </div>
  )
}
