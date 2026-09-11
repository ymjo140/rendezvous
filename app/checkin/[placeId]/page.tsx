"use client"

import { Suspense, useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Check, MapPin, Users, Clock } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { crewActivityChanged } from "@/lib/use-crew-resource"

type Crew = { id: string; title: string; icon: string; members: number; visits: number; checked_today: boolean }
type Context = {
  place: { id: number; name: string; category: string; address: string }
  logged_in: boolean; crews: Crew[]
  reservation?: { id: string; community_id: string | null; party_size: number; time: string } | null
}
type Visit = {
  id: string; status: "pending" | "verified"; participant_count: number; required_participants: number
  crew_visits: number; eligible_now: boolean; visit_date_kst: string
  eligibility: { next_action?: string; members_required?: number; visits_required?: number }
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.detail
    throw new Error(typeof detail === "string" ? detail : "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.")
  }
  return data as T
}

function getPosition() {
  return new Promise<{ lat: number; lng: number; accuracy_m: number; position_at: string }>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("위치를 확인할 수 없어요. 직원에게 방문 승인을 요청해주세요."))
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy,
        position_at: new Date(p.timestamp).toISOString() }),
      () => reject(new Error("위치 확인에 실패했어요. 권한을 허용하거나 직원에게 방문 승인을 요청해주세요.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}

function CheckinInner() {
  const { placeId } = useParams<{ placeId: string }>()
  const router = useRouter()
  const search = useSearchParams()
  const rid = search.get("rid")
  const requestedCrew = search.get("cid")
  const [ctx, setCtx] = useState<Context | null>(null)
  const [qr, setQr] = useState("")
  const [picked, setPicked] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [visit, setVisit] = useState<Visit | null>(null)

  useEffect(() => {
    let active = true
    const proof = new URLSearchParams(window.location.hash.slice(1)).get("qr") || ""
    // Keep short-lived proof across login only in this tab, never in an API URL.
    const key = `checkin-qr:${placeId}`
    if (proof) sessionStorage.setItem(key, proof)
    setQr(proof || sessionStorage.getItem(key) || "")
    setLoading(true)
    setVisit(null)
    setRequestId(null)
    setError(null)
    fetchWithAuth(`/api/checkin/${placeId}${rid ? `?rid=${encodeURIComponent(rid)}` : ""}`)
      .then(readResponse<Context>)
      .then(data => {
        if (!active) return
        setCtx(data)
        setPicked(data.reservation ? data.reservation.community_id : (data.crews.some(c => c.id === requestedCrew) ? requestedCrew : data.crews.length === 1 ? data.crews[0].id : null))
      })
      .catch(e => { if (active) { setCtx(null); setError(e.message) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [placeId, rid, requestedCrew])

  useEffect(() => { if (visit) crewActivityChanged() }, [visit])

  const pendingVisitId = visit?.status === "pending" ? visit.id : null
  useEffect(() => {
    if (!requestId && !pendingVisitId) return
    let active = true
    let inFlight = false
    const poll = async () => {
      if (document.hidden || inFlight) return
      inFlight = true
      try {
        if (requestId) {
          const data = await fetchWithAuth(`/api/checkin/approval-requests/${requestId}`)
            .then(readResponse<{ status: string; visit: Visit | null }>)
          if (!active) return
          if (data.status === "approved" && data.visit) { setVisit(data.visit); setRequestId(null) }
          if (data.status === "expired") {
            setRequestId(null)
            setError("승인 요청이 만료됐어요. 매장에서 다시 요청해주세요.")
            return
          }
        } else {
          const data = await fetchWithAuth(`/api/visits/${pendingVisitId}`).then(readResponse<Visit>)
          if (active) setVisit(data)
        }
        if (active) setError(null)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "상태를 확인하지 못했어요.")
      } finally { inFlight = false }
    }
    void poll()
    const timer = setInterval(poll, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [requestId, pendingVisitId])

  const submit = async (method: "qr" | "approval") => {
    if (!ctx || busy) return
    setBusy(true)
    setError(null)
    try {
      const body = { place_id: ctx.place.id, community_id: picked,
        reservation_id: ctx.reservation?.id ?? null, party_size: ctx.reservation?.party_size ?? 1 }
      if (method === "qr") {
        const position = await getPosition()
        const data = await fetchWithAuth("/api/checkin", { method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, qr_token: qr, ...position }),
        }).then(readResponse<Visit>)
        setVisit(data)
        sessionStorage.removeItem(`checkin-qr:${placeId}`)
      } else {
        const data = await fetchWithAuth("/api/checkin/approval-requests", { method: "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).then(readResponse<{ request_id: string }>)
        setRequestId(data.request_id)
      }
    } catch (e) { setError(e instanceof Error ? e.message : "방문 확인에 실패했어요.") }
    finally { setBusy(false) }
  }

  const returnParams = new URLSearchParams()
  if (rid) returnParams.set("rid", rid)
  if (picked || requestedCrew) returnParams.set("cid", picked || requestedCrew || "")
  const returnPath = `/checkin/${placeId}${returnParams.size ? `?${returnParams}` : ""}`
  const crew = ctx?.crews.find(c => c.id === picked)
  return (
    <main className="mx-auto min-h-screen max-w-md bg-white px-5 pb-12 pt-10">
      {loading ? <p role="status" className="py-20 text-center text-slate-500">불러오는 중...</p> : ctx ? <>
        <div className="rounded-3xl bg-amber-50 p-6 text-center">
          <MapPin className="mx-auto h-7 w-7 text-amber-600" />
          <h1 className="mt-3 text-xl font-bold text-amber-950">{ctx.place.name}</h1>
          <p className="mt-2 text-xs text-amber-800">{ctx.place.category} · {ctx.place.address}</p>
        </div>
        {visit ? <section className="mt-7" aria-live="polite">
          <Check className="mx-auto h-10 w-10 text-emerald-600" />
          <h2 className="mt-3 text-center text-lg font-bold">{visit.status === "verified" ? "방문 확인 완료" : "내 방문 확인 완료"}</h2>
          {crew ? <div className="mt-5 rounded-2xl bg-amber-50 p-5">
            <p className="font-semibold">{crew.icon} {crew.title}</p>
            <p className="mt-2 text-sm">함께 방문 {visit.crew_visits}회 · 확인한 멤버 {visit.participant_count}명</p>
            {visit.status === "pending" && <p className="mt-2 text-sm leading-relaxed text-amber-800">
              같은 날 2시간 안에 멤버 {visit.required_participants}명 이상이 각자 확인하면 공동 방문 1회로 인정돼요. 다른 멤버의 확인을 기다리고 있어요.
            </p>}
            <p className="mt-3 text-sm text-slate-600">{visit.eligible_now ? "제휴를 신청할 수 있어요." :
              visit.eligibility.next_action === "invite_members" ? `멤버 ${visit.eligibility.members_required}명부터 활동으로 제휴 자격을 얻을 수 있어요.` :
              `공동 방문 ${visit.eligibility.visits_required}회를 채우면 활동 조건을 충족해요.`}</p>
            <button onClick={() => router.push(`/crew/${crew.id}/partnerships`)} className="mt-4 w-full rounded-xl bg-[#F5A623] py-3 font-semibold text-white">크루 제휴 보기</button>
          </div> : <p className="mt-4 text-center text-sm text-slate-600">개인 방문으로 기록했어요.</p>}
          <p className="mt-4 text-center text-xs text-slate-500">{visit.visit_date_kst} · 한국 시간 기준</p>
          <p className="mt-3 text-center text-xs text-slate-500">제휴 혜택 사용은 준비 중이에요.</p>
          <button onClick={() => router.push("/")} className="mt-6 w-full py-3 text-sm text-slate-600">홈으로</button>
        </section> : requestId ? <section className="mt-8 text-center" aria-live="polite">
          <Clock className="mx-auto h-9 w-9 text-amber-600" />
          <h2 className="mt-3 text-lg font-bold">직원 확인을 기다리고 있어요</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">직원에게 앱의 이름을 알려주세요. 매장에서 승인하면 방문이 확인돼요. 요청은 15분 동안 유효해요.</p>
        </section> : !ctx.logged_in ? <section className="mt-7 text-center">
          <p className="text-sm text-slate-600">로그인한 뒤 매장에서 방문을 확인해주세요.</p>
          <button onClick={() => router.push(`/login?next=${encodeURIComponent(returnPath)}`)} className="mt-4 w-full rounded-2xl bg-[#F5A623] py-3.5 font-bold text-white">로그인하고 체크인</button>
        </section> : <section className="mt-7">
          {ctx.reservation && <p className="mb-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{ctx.reservation.time} 예약 · 매장 QR 또는 직원 승인이 필요해요.</p>}
          <h2 className="font-bold">누구와 함께 왔나요?</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">크루 공동 방문은 멤버 2명 이상이 같은 날 2시간 안에 각자 확인해야 해요.</p>
          <div className="mt-4 space-y-2">
            {ctx.crews.map(c => <button key={c.id} disabled={busy || !!ctx.reservation}
              aria-pressed={picked === c.id} onClick={() => setPicked(c.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${picked === c.id ? "border-amber-500 bg-amber-50" : "border-slate-200"}`}>
              <span className="text-2xl">{c.icon}</span><span><span className="block text-sm font-semibold">{c.title}</span>
                <span className="text-xs text-slate-500">함께 방문 {c.visits}회{c.checked_today ? " · 오늘 내 확인 기록 있음" : ""}</span></span>
            </button>)}
            <button disabled={busy || !!ctx.reservation} aria-pressed={picked === null} onClick={() => setPicked(null)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${picked === null ? "border-amber-500 bg-amber-50" : "border-slate-200"}`}>
              <Users className="h-6 w-6 text-slate-500" /><span className="text-sm font-semibold">개인 방문으로 기록</span>
            </button>
          </div>
          {qr ? <button disabled={busy} onClick={() => submit("qr")} className="mt-6 w-full rounded-2xl bg-[#F5A623] py-3.5 font-bold text-white disabled:opacity-50">{busy ? "확인하는 중..." : "QR과 현재 위치로 방문 확인"}</button> :
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">매장의 새 QR을 스캔하거나 직원에게 방문 승인을 요청해주세요.</p>}
          <button disabled={busy} onClick={() => submit("approval")} className="mt-3 w-full rounded-2xl border border-slate-200 py-3.5 text-sm font-semibold disabled:opacity-50">직원에게 방문 승인 요청</button>
        </section>}
      </> : <p className="py-16 text-center text-slate-500">가게 정보를 불러오지 못했어요.</p>}
      {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    </main>
  )
}

export default function CheckinPage() {
  return <Suspense fallback={<p className="py-20 text-center">불러오는 중...</p>}><CheckinInner /></Suspense>
}
