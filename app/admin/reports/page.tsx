"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShieldAlert, Trash2, Check } from "lucide-react"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "")

const REASON_LABEL: Record<string, string> = {
  spam: "스팸/도배",
  abuse: "욕설/괴롭힘",
  adult: "성인/음란물",
  false_info: "허위정보",
  etc: "기타",
}

type Report = {
  id: number
  target_type: string
  target_id: string
  reason: string
  detail: string | null
  status: string
  created_at: string | null
  reporter: { id: number; name: string | null }
  preview: {
    exists: boolean
    content: string | null
    image_urls: string[]
    media_type: string | null
    author_id: number | null
  } | null
  target_user: { id: number; name: string | null } | null
}

export default function AdminReportsPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<"loading" | "denied" | "ready">("loading")
  const [tab, setTab] = useState<"pending" | "reviewed">("pending")
  const [reports, setReports] = useState<Report[]>([])
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [busyId, setBusyId] = useState<number | null>(null)

  const authHeader = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const load = useCallback(async (status: "pending" | "reviewed") => {
    try {
      const [rRes, sRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/reports?status=${status}`, { headers: authHeader(), cache: "no-store" }),
        fetch(`${API_URL}/api/admin/reports/summary`, { headers: authHeader(), cache: "no-store" }),
      ])
      if (rRes.status === 401 || rRes.status === 403) { setPhase("denied"); return }
      if (!rRes.ok) throw new Error("load failed")
      setReports(await rRes.json())
      if (sRes.ok) setSummary(await sRes.json())
      setPhase("ready")
    } catch {
      setPhase("denied")
    }
  }, [])

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
    if (!token) { router.push("/login"); return }
    load(tab)
  }, [tab, load, router])

  const act = async (id: number, action: "delete_content" | "dismiss") => {
    if (action === "delete_content" && !window.confirm("이 콘텐츠를 삭제할까요? 되돌릴 수 없습니다.")) return
    setBusyId(id)
    try {
      const res = await fetch(`${API_URL}/api/admin/reports/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error()
      await load(tab)
    } catch {
      alert("처리 중 오류가 발생했어요.")
    } finally {
      setBusyId(null)
    }
  }

  if (phase === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="w-6 h-6 animate-spin text-[#F5A623]" /></div>
  }

  if (phase === "denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center font-['Pretendard']">
        <ShieldAlert className="w-10 h-10 text-gray-300" />
        <p className="text-sm text-gray-500">관리자 전용 페이지예요.<br />운영 계정으로 로그인해주세요.</p>
        <button onClick={() => router.push("/")} className="mt-2 rounded-lg bg-[#F5A623] px-4 py-2 text-sm font-bold text-white">홈으로</button>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 font-['Pretendard']">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900">🛡️ 신고 처리</h1>
        <p className="mt-1 text-xs text-gray-500">접수된 신고를 검토하고 24시간 이내 조치하세요.</p>

        <div className="mt-4 flex gap-2">
          {(["pending", "reviewed"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === t ? "bg-[#F5A623] text-white" : "bg-white text-gray-500 border border-gray-200"}`}
            >
              {t === "pending" ? "대기" : "처리됨"} {summary[t] != null ? `(${summary[t]})` : ""}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {reports.length === 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
              {tab === "pending" ? "대기 중인 신고가 없어요. 👍" : "처리된 신고가 없어요."}
            </div>
          )}

          {reports.map((r) => (
            <div key={r.id} className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-500">
                  {REASON_LABEL[r.reason] || r.reason}
                </span>
                <span className="text-[11px] text-gray-400">
                  {r.created_at ? new Date(r.created_at).toLocaleString("ko-KR") : ""}
                </span>
              </div>

              <div className="mt-2 text-xs text-gray-500">
                대상: {r.target_type === "post" ? "게시물" : r.target_type === "comment" ? "댓글" : "사용자"}
                {" · "}신고자: {r.reporter.name || `#${r.reporter.id}`}
              </div>

              {r.detail && <p className="mt-1 text-xs text-gray-600">사유: {r.detail}</p>}

              {r.target_type === "post" && r.preview && (
                r.preview.exists ? (
                  <div className="mt-2 flex gap-3 rounded-xl bg-gray-50 p-3">
                    {r.preview.image_urls?.[0] && r.preview.media_type !== "video" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.preview.image_urls[0]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    )}
                    <p className="text-xs leading-relaxed text-gray-700 line-clamp-4">{r.preview.content || "(내용 없음)"}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-400">이미 삭제된 게시물입니다.</p>
                )
              )}

              {r.target_type === "user" && r.target_user && (
                <p className="mt-2 text-xs text-gray-600">대상 사용자: {r.target_user.name || `#${r.target_user.id}`}</p>
              )}

              {tab === "pending" && (
                <div className="mt-3 flex gap-2">
                  {r.target_type === "post" && r.preview?.exists && (
                    <button
                      disabled={busyId === r.id}
                      onClick={() => act(r.id, "delete_content")}
                      className="flex items-center gap-1 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 게시물 삭제
                    </button>
                  )}
                  <button
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, "dismiss")}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" /> 반려(문제 없음)
                  </button>
                  {busyId === r.id && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
