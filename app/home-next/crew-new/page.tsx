"use client"

// 🧪 [redesign/group-home] 우리 크루 만들기 — 결정 B의 심장(크루 생성 유도)
// 3스텝: 이름+이모지 → 공개 수준 → 첫 리스트(맥락 태그). POST /api/crews 한 방.
// 카피 원칙: "사람 모으기"가 아니라 "리스트 쌓기"가 상품.

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Check, Loader2 } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { VerifySheet, CREW_TYPE_META } from "../verify-sheet"

const EMOJIS = ["🍷", "🍜", "🍞", "🍺", "☕", "🍣", "🥩", "🌮", "🍰", "🍲", "🦞", "🍕"]

const VISIBILITY = [
  { key: "list_only", title: "리스트만 공개", desc: "우리가 쌓은 맛집 리스트만 남들이 봐요. 멤버는 비공개.", emoji: "📋", badge: "추천" },
  { key: "private", title: "우리끼리", desc: "멤버만 볼 수 있어요. 리스트도 비공개.", emoji: "🔒" },
  { key: "public", title: "크루 공개", desc: "크루 프로필·멤버·리스트 모두 공개. 팔로워를 모아요.", emoji: "🌟" },
]

const TAGS = [
  { tag: "date", label: "데이트", emoji: "💕" },
  { tag: "work", label: "회식", emoji: "🥂" },
  { tag: "drink", label: "술 한잔", emoji: "🍶" },
  { tag: "cafe", label: "카페·디저트", emoji: "☕" },
  { tag: "solo", label: "혼밥·혼술", emoji: "🍚" },
  { tag: "friends", label: "친구 모임", emoji: "🍻" },
  { tag: "family", label: "가족 외식", emoji: "🍲" },
  { tag: "special", label: "기념일", emoji: "🎂" },
]

export default function CrewNewPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [crewType, setCrewType] = useState("friends")
  const [verified, setVerified] = useState<Record<string, string>>({})  // kind -> org_name
  const [verifyOpen, setVerifyOpen] = useState<null | "university" | "company">(null)
  const [title, setTitle] = useState("")
  const [icon, setIcon] = useState("🍷")
  const [visibility, setVisibility] = useState("list_only")
  const [listName, setListName] = useState("")
  const [listTag, setListTag] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  React.useEffect(() => {
    fetchWithAuth("/api/verify/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        const m: Record<string, string> = {}
        for (const v of d.verifications || []) m[v.kind] = v.org_name
        setVerified(m)
      })
      .catch(() => {})
  }, [])

  const pickType = (t: string) => {
    setCrewType(t)
    const need = CREW_TYPE_META[t]?.verify
    if (need && !verified[need]) setVerifyOpen(need)
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const res = await fetchWithAuth("/api/crews", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          icon,
          visibility,
          crew_type: crewType,
          first_list: listName.trim()
            ? { name: listName.trim(), icon, context_tag: listTag }
            : null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        if (d?.detail?.code === "verify_required") {
          setVerifyOpen(d.detail.kind)
          setBusy(false)
          return
        }
        throw new Error(typeof d?.detail === "string" ? d.detail : "크루를 만들지 못했어요.")
      }
      const d = await res.json()
      router.push(`/home-next/crew/${d.id}?created=1`)
    } catch (e: any) {
      setError(e?.message || "크루를 만들지 못했어요. 로그인 상태를 확인해주세요.")
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-16">

      {/* 헤더 + 진행 */}
      <div className="sticky top-0 z-10 bg-white px-4 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <button onClick={() => (step > 1 ? setStep(step - 1) : router.back())} className="rounded-full p-1 text-slate-500">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 text-[15px] font-semibold text-slate-900">우리 크루 만들기</div>
          <span className="text-[11px] text-slate-400">{step}/3</span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>

      {/* STEP 1: 이름 + 이모지 */}
      {step === 1 && (
        <div className="px-4 pt-4">
          <h2 className="text-lg font-bold text-slate-900">어떤 크루야?</h2>
          <p className="mt-1 text-[12px] text-slate-400">종류에 따라 제휴 혜택 대상이 달라져요.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Object.entries(CREW_TYPE_META).map(([t, m]) => {
              const on = crewType === t
              const needVerify = m.verify && !verified[m.verify]
              return (
                <button
                  key={t}
                  onClick={() => pickType(t)}
                  className={`rounded-2xl border-2 p-3 text-left transition-colors ${on ? "border-[#F5A623] bg-amber-50" : "border-slate-100"}`}
                >
                  <span className="text-xl">{m.emoji}</span>
                  <span className="mt-1 flex items-center gap-1">
                    <b className="text-[13px] font-semibold text-slate-900">{m.label}</b>
                    {m.verify && verified[m.verify] && <span className="text-[10px] text-emerald-600">✓ {verified[m.verify]}</span>}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-slate-400">
                    {m.desc}{needVerify && on ? " · 인증 필요" : ""}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-4 text-[12px] font-medium text-slate-600">크루 이름</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={30}
            placeholder="예: 성수 와인 크루, 매운맛 원정대"
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] focus:border-[#F5A623] focus:outline-none"
          />
          <div className="mt-4 grid grid-cols-6 gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setIcon(e)}
                className={`flex h-12 items-center justify-center rounded-xl text-2xl transition-colors ${
                  icon === e ? "bg-amber-100 ring-2 ring-amber-400" : "bg-slate-50"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <button
            disabled={!title.trim()}
            onClick={() => {
              const need = CREW_TYPE_META[crewType]?.verify
              if (need && !verified[need]) { setVerifyOpen(need); return }
              setStep(2)
            }}
            className="mt-6 w-full rounded-2xl bg-[#F5A623] py-3.5 text-[15px] font-semibold text-white disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}

      {/* STEP 2: 공개 수준 */}
      {step === 2 && (
        <div className="px-4 pt-4">
          <h2 className="text-lg font-bold text-slate-900">어디까지 보여줄까?</h2>
          <p className="mt-1 text-[12px] text-slate-400">리스트가 공개되면 남들이 담아가고, 크루가 알려져요.</p>
          <div className="mt-4 space-y-2.5">
            {VISIBILITY.map((v) => (
              <button
                key={v.key}
                onClick={() => setVisibility(v.key)}
                className={`flex w-full items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition-colors ${
                  visibility === v.key ? "border-[#F5A623] bg-amber-50" : "border-slate-100"
                }`}
              >
                <span className="text-2xl">{v.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <b className="text-[14px] font-semibold text-slate-900">{v.title}</b>
                    {v.badge && <em className="rounded-full bg-[#F5A623] px-1.5 py-0.5 text-[9px] font-bold not-italic text-white">{v.badge}</em>}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">{v.desc}</span>
                </span>
                {visibility === v.key && <Check className="h-4 w-4 shrink-0 text-[#F5A623]" />}
              </button>
            ))}
          </div>
          <button onClick={() => setStep(3)} className="mt-6 w-full rounded-2xl bg-[#F5A623] py-3.5 text-[15px] font-semibold text-white">
            다음
          </button>
        </div>
      )}

      {/* STEP 3: 첫 리스트 (선택) */}
      {step === 3 && (
        <div className="px-4 pt-4">
          <h2 className="text-lg font-bold text-slate-900">첫 리스트를 만들어볼까?</h2>
          <p className="mt-1 text-[12px] text-slate-400">크루의 첫 맛집 리스트예요. 나중에 만들어도 돼요.</p>
          <input
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            maxLength={40}
            placeholder={`예: ${title.trim() || "우리 크루"}의 인생 맛집`}
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] focus:border-[#F5A623] focus:outline-none"
          />
          <p className="mt-4 text-[12px] font-medium text-slate-600">어떤 상황의 리스트야?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TAGS.map((t) => (
              <button
                key={t.tag}
                onClick={() => setListTag(listTag === t.tag ? null : t.tag)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  listTag === t.tag ? "bg-[#F5A623] text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-600">{error}</p>}

          <button
            onClick={submit}
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F5A623] py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {listName.trim() ? "크루 + 첫 리스트 만들기" : "크루만 먼저 만들기"}
          </button>
        </div>
      )}

      {verifyOpen && (
        <VerifySheet
          kind={verifyOpen}
          onClose={() => setVerifyOpen(null)}
          onDone={(r) => {
            setVerified((prev) => ({ ...prev, [verifyOpen]: r.org_name }))
            setVerifyOpen(null)
          }}
        />
      )}
    </div>
  )
}
