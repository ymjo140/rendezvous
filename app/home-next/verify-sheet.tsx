"use client"

// 소속 인증 시트 — 이메일(학교/회사) → 6자리 코드. 크루 생성·합류 게이트에서 공용.
// SMTP 미설정(베타)이면 서버가 dev_code를 주므로 자동 입력 + 안내 문구.

import React, { useState } from "react"
import { X, Loader2, ShieldCheck } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

const BRAND = "#F5A623"

const KIND_META: Record<string, { title: string; ph: string; desc: string; emoji: string }> = {
  university: {
    emoji: "🎓", title: "학교 이메일 인증",
    ph: "예: mj@korea.ac.kr",
    desc: "학교 이메일(@OO.ac.kr)로 소속을 인증해요. 제휴 혜택의 근거가 됩니다.",
  },
  company: {
    emoji: "🏢", title: "회사 이메일 인증",
    ph: "예: mj@company.co.kr",
    desc: "회사 이메일로 소속을 인증해요. (개인 메일 불가)",
  },
}

export function VerifySheet({
  kind,
  requireOrgName,
  onDone,
  onClose,
}: {
  kind: "university" | "company"
  requireOrgName?: string | null   // 특정 소속 크루 합류용이면 안내 표시
  onDone: (r: { domain: string; org_name: string }) => void
  onClose: () => void
}) {
  const meta = KIND_META[kind]
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [devNote, setDevNote] = useState(false)
  const [orgName, setOrgName] = useState<string | null>(null)

  const request = async () => {
    if (busy || !email.trim()) return
    setBusy(true); setErr("")
    try {
      const res = await fetchWithAuth("/api/verify/email/request", {
        method: "POST",
        body: JSON.stringify({ kind, email: email.trim() }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(typeof d?.detail === "string" ? d.detail : "요청에 실패했어요."); return }
      setOrgName(d.org_name || null)
      if (d.dev_code) { setCode(d.dev_code); setDevNote(true) }
      setStep("code")
    } catch { setErr("네트워크 오류 — 잠시 후 다시 시도해주세요.") } finally { setBusy(false) }
  }

  const confirm = async () => {
    if (busy || code.trim().length !== 6) return
    setBusy(true); setErr("")
    try {
      const res = await fetchWithAuth("/api/verify/email/confirm", {
        method: "POST",
        body: JSON.stringify({ kind, code: code.trim() }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(typeof d?.detail === "string" ? d.detail : "확인에 실패했어요."); return }
      onDone({ domain: d.domain, org_name: d.org_name })
    } catch { setErr("네트워크 오류 — 잠시 후 다시 시도해주세요.") } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md items-end bg-black/40" onClick={onClose}>
      <div className="w-full rounded-t-3xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[16px] font-bold text-gray-900">
            <span>{meta.emoji}</span>{meta.title}
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-[12px] leading-relaxed text-gray-400">{meta.desc}</p>
        {requireOrgName && (
          <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-700">
            이 크루는 <b>{requireOrgName}</b> 소속 인증이 있어야 합류할 수 있어요.
          </p>
        )}

        {step === "email" ? (
          <>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") request() }}
              placeholder={meta.ph}
              type="email"
              className="mt-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] focus:border-[#F5A623] focus:outline-none"
              autoFocus
            />
            {err && <p className="mt-2 text-[12px] text-rose-500">{err}</p>}
            <button
              onClick={request}
              disabled={busy || !email.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: BRAND }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}인증 코드 받기
            </button>
          </>
        ) : (
          <>
            <p className="mt-4 text-[13px] text-gray-600">
              <b>{email}</b>{orgName ? ` (${orgName})` : ""} 으로 보낸 6자리 코드를 입력해주세요.
            </p>
            {devNote && (
              <p className="mt-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-600">
                베타 기간이라 코드가 자동 입력됐어요. (정식 오픈 시 이메일로 발송됩니다)
              </p>
            )}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") confirm() }}
              placeholder="123456"
              inputMode="numeric"
              className="mt-3 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-[20px] font-bold tracking-[8px] focus:border-[#F5A623] focus:outline-none"
            />
            {err && <p className="mt-2 text-[12px] text-rose-500">{err}</p>}
            <button
              onClick={confirm}
              disabled={busy || code.length !== 6}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: BRAND }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}인증 완료
            </button>
            <button onClick={() => { setStep("email"); setErr(""); setDevNote(false) }} className="mt-2 w-full py-1 text-[12px] text-gray-400">
              이메일 다시 입력
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export const CREW_TYPE_META: Record<string, { emoji: string; label: string; desc: string; verify: "university" | "company" | null }> = {
  friends: { emoji: "👫", label: "친구·지인", desc: "인증 없이 자유롭게", verify: null },
  university: { emoji: "🎓", label: "대학 동아리", desc: "학교 메일 인증 · 대학가 제휴 대상", verify: "university" },
  company: { emoji: "🏢", label: "회사·직장", desc: "회사 메일 인증 · 직장인 제휴 대상", verify: "company" },
  community: { emoji: "🏃", label: "오픈 동호회", desc: "인증 없이 누구나", verify: null },
}
