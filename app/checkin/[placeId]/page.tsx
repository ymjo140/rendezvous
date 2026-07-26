"use client"

// 📥 QR 체크인 — 가게 테이블/계산대의 QR을 찍으면 열리는 화면.
// 크루를 고르면 그 크루의 '함께 방문'으로 쌓여서 제휴 자격(활동 트랙)으로 이어진다.

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Check, MapPin, Users } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type Crew = { id: string; title: string; icon: string; members: number; visits: number; checked_today: boolean }
type Ctx = {
  place: { id: number; name: string; category: string; address: string }
  logged_in: boolean
  crews: Crew[]
}

export default function CheckinPage() {
  const params = useParams<{ placeId: string }>()
  const router = useRouter()
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ crew: Crew | null; visits: number; eligible: boolean } | null>(null)

  useEffect(() => {
    if (!params?.placeId) return
    fetchWithAuth(`/api/checkin/${params.placeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Ctx | null) => {
        setCtx(d)
        // 크루가 하나뿐이고 오늘 안 찍었으면 미리 선택 — 탭 한 번으로 끝나게
        const fresh = (d?.crews || []).filter((c) => !c.checked_today)
        if (fresh.length === 1) setPicked(fresh[0].id)
      })
      .catch(() => setCtx(null))
      .finally(() => setLoading(false))
  }, [params?.placeId])

  const submit = async () => {
    if (!ctx || busy) return
    setBusy(true)
    try {
      const r = await fetchWithAuth("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: ctx.place.id, community_id: picked }),
      })
      if (r.status === 401) { router.push("/login"); return }
      const d = await r.json().catch(() => null)
      if (!r.ok) return
      setDone({
        crew: ctx.crews.find((c) => c.id === picked) || null,
        visits: d?.crew_visits ?? 0,
        eligible: !!d?.eligible_now,
      })
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  if (loading) {
    return <div className="mx-auto min-h-screen max-w-md bg-white py-24 text-center text-sm text-slate-400">불러오는 중...</div>
  }
  if (!ctx) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 py-24 text-center">
        <p className="text-sm text-slate-500">가게 정보를 찾을 수 없어요.</p>
        <p className="mt-1 text-[12px] text-slate-400">QR을 다시 찍어주세요.</p>
      </div>
    )
  }

  // ── 완료 화면 ──
  if (done) {
    const need = Math.max(0, 3 - done.visits)
    return (
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pt-20 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="mt-4 text-[18px] font-bold text-slate-900">체크인 완료!</h1>
        <p className="mt-1 text-[13px] text-slate-500">{ctx.place.name}</p>

        {done.crew ? (
          <div className="mt-6 rounded-2xl bg-amber-50 px-4 py-4 text-left">
            <div className="flex items-center gap-2">
              <span className="text-xl">{done.crew.icon}</span>
              <b className="text-[13.5px] font-bold text-amber-900">{done.crew.title}</b>
              <span className="ml-auto text-[12px] font-bold text-amber-800">함께 방문 {done.visits}회</span>
            </div>
            {done.eligible ? (
              <p className="mt-2 text-[12px] leading-relaxed text-amber-800">
                🎉 제휴 자격을 갖췄어요! 이제 가게 제휴에 신청할 수 있어요.
              </p>
            ) : need > 0 ? (
              <p className="mt-2 text-[12px] leading-relaxed text-amber-700">
                제휴 자격까지 <b>{need}회</b> 남았어요. 함께 밥 먹을 때마다 체크인하면 쌓여요.
              </p>
            ) : (
              <p className="mt-2 text-[12px] leading-relaxed text-amber-700">
                멤버가 3명 이상이 되면 제휴 자격이 생겨요.
              </p>
            )}
            <button
              onClick={() => router.push(`/home-next/crew/${done.crew!.id}/partnerships`)}
              className="mt-3 w-full rounded-xl bg-[#F5A623] py-2.5 text-[12.5px] font-bold text-white"
            >
              제휴 관리 보기
            </button>
          </div>
        ) : (
          <p className="mt-6 text-[12.5px] text-slate-500">개인 방문으로 기록했어요.</p>
        )}

        <button onClick={() => router.push("/home-next")} className="mt-4 text-[12.5px] font-semibold text-slate-400">
          홈으로
        </button>
      </div>
    )
  }

  // ── 체크인 화면 ──
  const fresh = ctx.crews.filter((c) => !c.checked_today)
  const already = ctx.crews.filter((c) => c.checked_today)

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-28">
      <div className="px-4 pt-8">
        <div className="rounded-2xl bg-amber-50 px-4 py-5 text-center">
          <div className="text-3xl">📥</div>
          <h1 className="mt-2 text-[17px] font-bold text-amber-900">{ctx.place.name}</h1>
          <p className="mt-0.5 flex items-center justify-center gap-1 text-[11.5px] text-amber-700">
            {ctx.place.category}
            {ctx.place.address && (
              <>
                <MapPin className="h-3 w-3" />
                {ctx.place.address.split(" ").slice(1, 3).join(" ")}
              </>
            )}
          </p>
        </div>
      </div>

      {!ctx.logged_in ? (
        <div className="px-4 pt-6 text-center">
          <p className="text-[13px] text-slate-600">로그인하면 방문이 기록돼요.</p>
          <p className="mt-1 text-[11.5px] text-slate-400">크루 방문이 쌓이면 이 가게와 제휴를 맺을 수 있어요.</p>
          <button onClick={() => router.push("/login")} className="mt-4 w-full rounded-2xl bg-[#F5A623] py-3 text-[14px] font-bold text-white">
            로그인하고 체크인
          </button>
        </div>
      ) : (
        <div className="px-4 pt-6">
          <h2 className="text-[14px] font-bold text-slate-900">누구랑 왔나요?</h2>
          <p className="mt-0.5 text-[11.5px] text-slate-400">크루를 고르면 함께 방문 실적으로 쌓여요</p>

          <div className="mt-3 space-y-2">
            {fresh.map((c) => (
              <button
                key={c.id}
                onClick={() => setPicked(picked === c.id ? null : c.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                  picked === c.id ? "border-[#F5A623] bg-amber-50" : "border-slate-100"
                }`}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-xl">{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-slate-900">{c.title}</span>
                  <span className="block text-[11px] text-slate-400">멤버 {c.members} · 함께 방문 {c.visits}회</span>
                </span>
                <span className={`text-[18px] ${picked === c.id ? "text-[#F5A623]" : "text-slate-200"}`}>
                  {picked === c.id ? "✓" : "○"}
                </span>
              </button>
            ))}

            <button
              onClick={() => setPicked(null)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                picked === null ? "border-[#F5A623] bg-amber-50" : "border-slate-100"
              }`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                <Users className="h-5 w-5 text-slate-400" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-slate-900">혼자 왔어요</span>
                <span className="block text-[11px] text-slate-400">개인 방문으로만 기록</span>
              </span>
              <span className={`text-[18px] ${picked === null ? "text-[#F5A623]" : "text-slate-200"}`}>
                {picked === null ? "✓" : "○"}
              </span>
            </button>
          </div>

          {already.length > 0 && (
            <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
              <p className="text-[11.5px] text-slate-500">
                오늘 이미 체크인한 크루 — {already.map((c) => c.title).join(", ")}
              </p>
            </div>
          )}

          {ctx.crews.length === 0 && (
            <div className="mt-3 rounded-2xl bg-amber-50 px-3.5 py-3">
              <p className="text-[12px] font-semibold text-amber-900">아직 크루가 없어요</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-amber-700">
                친구·동아리와 크루를 만들면 함께 방문이 쌓이고, 이 가게와 제휴도 맺을 수 있어요.
              </p>
              <button
                onClick={() => router.push("/home-next/crew-new")}
                className="mt-2 text-[12px] font-bold text-[#F5A623]"
              >
                크루 만들기 →
              </button>
            </div>
          )}
        </div>
      )}

      {ctx.logged_in && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-slate-100 bg-white p-4">
          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-2xl bg-[#F5A623] py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
          >
            {busy ? "기록하는 중..." : "체크인하기"}
          </button>
        </div>
      )}
    </div>
  )
}
