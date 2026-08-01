"use client"

// 채팅방 투표 카드 시스템 — 장소/일정 조율.
// PollCard(카드 렌더+투표+확정) / PlacePollComposer(장소 투표 만들기)
// SchedulePollComposer(일정 투표 만들기) / CandidateSheet(후보 추가)
// HistorySheet(확정 히스토리) / SettlementComposer(정산 카드)
import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MapPin, Calendar, X, Check, Search, Plus, History, Calculator } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MonthCalendar, type DayStatus } from "@/components/ui/month-calendar"
import { fetchWithAuth } from "@/lib/api-client"

export type PollOption = {
  id: number
  label: string
  place_id: number | null
  meta: Record<string, any>
  added_by: number | null
  added_by_name: string | null
  votes: number
  voted_by_me: boolean
}

export type Poll = {
  id: number
  room_id: string
  kind: "place" | "schedule"
  title: string
  meta: Record<string, any>
  status: "open" | "confirmed"
  confirmed_option_id: number | null
  creator_id: number
  creator_name: string
  is_creator: boolean
  total_votes: number
  options: PollOption[]
}

export async function fetchPoll(pollId: number): Promise<Poll | null> {
  try {
    const res = await fetchWithAuth(`/api/chat/polls/${pollId}`)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

const PURPOSES = [
  { key: "식사", label: "🍚 식사" },
  { key: "술/회식", label: "🍺 술/회식" },
  { key: "카페", label: "☕ 카페" },
  { key: "데이트", label: "💖 데이트" },
]

// 15분 단위. 네이티브 time 입력은 분 단위 휠이라 "오후 7시 3분" 같은 값이 나온다 —
// 모임 시간으로 쓸 값이 아니고, 가게 예약 슬롯(30분)과도 안 맞는다.
const QUARTER_TIMES = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4)
  const m = (i % 4) * 15
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
})
function timeLabel(t: string) {
  const [h, m] = t.split(":").map(Number)
  const ampm = h < 12 ? "오전" : "오후"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ampm} ${h12}:${String(m).padStart(2, "0")}`
}

const WD_KO = ["일", "월", "화", "수", "목", "금", "토"]
function dateLabel(dateStr: string, time?: string) {
  try {
    const d = new Date(`${dateStr}T00:00:00`)
    return `${d.getMonth() + 1}/${d.getDate()} (${WD_KO[d.getDay()]})${time ? ` ${time}` : ""}`
  } catch {
    return dateStr
  }
}

// ─────────────────────────────────────────────────────────────
// 투표 카드
// 확정된 장소 → 예약 화면으로 넘길 계획(크루·날짜·시간·인원).
// 이게 없으면 방금 투표로 정한 걸 예약 모달에서 처음부터 다시 고르게 되고,
// 무엇보다 크루를 안 고르면 예약에 community_id가 안 붙어서 체크인이 크루 방문으로
// 안 쌓인다 — 재방문·제휴·양보 데이터가 전부 거기서 나온다.
function reservePath(poll: Poll, placeId: number, memberCount?: number) {
  const qs = new URLSearchParams({ crew: String(poll.room_id) })
  if (poll.meta?.plan_date) qs.set("date", String(poll.meta.plan_date))
  if (poll.meta?.plan_time) qs.set("time", String(poll.meta.plan_time))
  if (memberCount && memberCount > 0) qs.set("party", String(memberCount))
  return `/places/${placeId}?${qs.toString()}`
}

export function PollCard({
  poll,
  onUpdate,
  onAddCandidates,
  memberCount,
}: {
  poll: Poll
  onUpdate: (p: Poll) => void
  onAddCandidates: (poll: Poll) => void
  memberCount?: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const vote = async (optionId: number) => {
    if (poll.status !== "open" || busy) return
    setBusy(true)
    try {
      const res = await fetchWithAuth(`/api/chat/polls/${poll.id}/vote`, {
        method: "POST",
        body: JSON.stringify({ option_id: optionId }),
      })
      if (res.ok) onUpdate(await res.json())
    } catch {} finally { setBusy(false) }
  }

  const removeOption = async (e: React.MouseEvent, optionId: number, votes: number) => {
    e.stopPropagation()
    if (votes > 0 && !confirm("표가 있는 후보예요. 뺄까요?")) return
    try {
      const res = await fetchWithAuth(`/api/chat/polls/${poll.id}/options/${optionId}`, { method: "DELETE" })
      if (res.ok) onUpdate(await res.json())
      else alert((await res.json())?.detail || "삭제 실패")
    } catch {}
  }

  const confirmPoll = async () => {
    const top = poll.options[0]
    if (!top) return
    if (!confirm(`'${top.label}'(최다 득표)으로 확정할까요?`)) return
    setBusy(true)
    try {
      const res = await fetchWithAuth(`/api/chat/polls/${poll.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({}),
      })
      if (res.ok) onUpdate(await res.json())
      else alert((await res.json())?.detail || "확정 실패")
    } catch {} finally { setBusy(false) }
  }

  const deletePoll = async () => {
    if (!confirm("이 투표를 삭제할까요? 후보와 표가 모두 사라져요.")) return
    setBusy(true)
    try {
      const res = await fetchWithAuth(`/api/chat/polls/${poll.id}`, { method: "DELETE" })
      if (!res.ok) alert((await res.json().catch(() => null))?.detail || "삭제에 실패했어요.")
      // 성공 시 message_deleted 브로드캐스트가 카드 메시지를 제거함
    } catch { alert("오류가 발생했어요.") } finally { setBusy(false) }
  }

  const confirmed = poll.status === "confirmed"
  const winner = confirmed ? poll.options.find((o) => o.id === poll.confirmed_option_id) : null
  const icon = poll.kind === "place" ? <MapPin className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 w-[270px]">
      <div className="flex items-center justify-between mb-0.5">
        <span className="flex items-center gap-1 text-xs font-bold text-[#F5A623]">
          {icon} {poll.title}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">{poll.creator_name} 만듦</span>
          {poll.is_creator && poll.status === "open" && (
            <button onClick={deletePoll} disabled={busy} className="p-0.5 text-gray-300 hover:text-red-400" title="투표 삭제">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>
      {poll.meta?.anchor_name && (
        <div className="text-[11px] text-gray-400 mb-2">
          {poll.meta.anchor_name} 기준{poll.kind === "place" ? " · AI 추천으로 시작" : ""}
        </div>
      )}

      <div className="space-y-1.5 mt-1">
        {poll.options.map((o) => {
          const isWinner = confirmed && o.id === poll.confirmed_option_id
          const mine = o.voted_by_me
          return (
            <button
              key={o.id}
              onClick={() => vote(o.id)}
              disabled={confirmed}
              className={`w-full text-left rounded-xl px-2.5 py-2 border transition-colors ${
                isWinner
                  ? "border-[#14B8A6] bg-teal-50"
                  : mine
                    ? "border-[#F5A623] bg-amber-50"
                    : "border-gray-200 hover:bg-gray-50"
              } ${confirmed && !isWinner ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={`text-xs font-bold truncate ${isWinner ? "text-teal-800" : mine ? "text-amber-900" : "text-gray-800"}`}>
                  {o.label}
                  {o.added_by === null ? (
                    <span className="ml-1 text-[9px] font-bold text-amber-600 bg-amber-100 rounded px-1 py-0.5">AI</span>
                  ) : (
                    o.added_by_name && (
                      <span className="ml-1 text-[9px] font-bold text-teal-700 bg-teal-50 rounded px-1 py-0.5">
                        {o.added_by_name} 추가
                      </span>
                    )
                  )}
                </span>
                <span className="flex items-center gap-1 flex-shrink-0">
                  <span className={`text-[11px] font-bold ${mine ? "text-[#F5A623]" : "text-gray-400"}`}>{o.votes}표</span>
                  {!confirmed && o.added_by !== null && (
                    <span onClick={(e) => removeOption(e, o.id, o.votes)} className="p-0.5 text-gray-300 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </span>
              </div>
              {o.meta?.reason && <div className="text-[10px] text-gray-400 truncate mt-0.5">{o.meta.reason}</div>}
              {o.meta?.category && !o.meta?.reason && (
                <div className="text-[10px] text-gray-400 truncate mt-0.5">{o.meta.category}</div>
              )}
              {o.place_id && (
                <span
                  onClick={(e) => { e.stopPropagation(); router.push(`/places/${o.place_id}`) }}
                  className="mt-1 inline-flex items-center text-[10px] font-bold text-sky-600"
                >
                  가게 상세 보기 →
                </span>
              )}
            </button>
          )
        })}
      </div>

      {confirmed ? (
        <div className="mt-2.5">
          <div className="text-[11px] font-bold text-teal-700 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> {winner?.label}(으)로 확정!
          </div>
          {poll.kind === "place" && winner?.place_id && (
            <>
              <Button
                onClick={() => router.push(reservePath(poll, winner.place_id as number, memberCount))}
                className="w-full h-8 mt-1.5 text-xs bg-[#14B8A6] hover:bg-[#0D9488] rounded-lg"
              >
                이 크루로 예약하기
              </Button>
              <div className="text-[10px] text-gray-400 mt-1">
                {poll.meta?.plan_date
                  ? `${dateLabel(String(poll.meta.plan_date), poll.meta.plan_time ? String(poll.meta.plan_time) : undefined)}${memberCount ? ` · ${memberCount}명` : ""}으로 채워서 열어요`
                  : "날짜는 예약 화면에서 고르면 돼요 · 일정 투표를 확정하면 여기 채워져요"}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-1.5 mt-2.5">
          <Button
            variant="outline"
            onClick={() => onAddCandidates(poll)}
            className="flex-1 h-8 text-[11px] rounded-lg border-gray-200 text-gray-600"
          >
            <Plus className="w-3 h-3 mr-0.5" /> 후보 추가
          </Button>
          {poll.is_creator && (
            <Button
              onClick={confirmPoll}
              disabled={busy || poll.options.length === 0}
              className="flex-1 h-8 text-[11px] rounded-lg bg-[#F5A623] hover:bg-[#D97706]"
            >
              확정하기
            </Button>
          )}
        </div>
      )}
      {!confirmed && (
        <div className="text-[10px] text-gray-300 mt-1.5">
          {poll.total_votes}명 투표 · 같은 후보 다시 누르면 취소
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 시트 래퍼(공용)
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-7 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h3 className="font-bold text-gray-900 mb-3">{title}</h3>
        {children}
      </div>
    </div>
  )
}

type ChatMember = {
  id: number; name: string; is_me?: boolean
  lat?: number | null; lng?: number | null; location_name?: string | null
}

// 집단 합성 후보(polls/suggest 응답 1건). 개인 추천과 달리 '몇 명이 맞는지'가 붙는다.
type CrewPick = {
  place_id: number | null
  name: string
  cuisine?: string | null
  address?: string | null
  satisfied?: number
  total?: number
  weakest?: string | null
  weakest_id?: number | null
  reason?: string | null       // 저장·공유용(이름) — 옵션 meta엔 이게 들어간다
  reason_me?: string | null    // 지금 보는 사람용('내가') — 화면에만 쓴다
  reason_kind?: string | null
  years_open?: number | null
  recommended?: boolean        // 한 명 이상 자기 기준을 넘음. 아래쪽은 참고용으로 남긴다
}

// 합성 결과의 색조 — '1명만 맞아요'를 초록으로 칠하면 거짓말이 된다
function reasonTone(kind?: string | null) {
  if (kind === "group_all") return "text-teal-700"
  if (kind === "group_most") return "text-amber-700"
  if (kind === "group_weak" || kind === "group_none") return "text-rose-500"
  return "text-gray-400"
}

// ─────────────────────────────────────────────────────────────
// 장소 투표 만들기 — 어디서 → 목적 → 집단 합성 후보 확인 → 카드 발행
export function PlacePollComposer({
  roomId,
  members,
  onClose,
  onCreated,
}: {
  roomId: string
  members: ChatMember[]
  onClose: () => void
  onCreated: (p: Poll) => void
}) {
  // 순서: 목적 → 동네 3곳(탭) → 후보. 동네부터 고르면 "여기서 뭘 할 건데"가 빠진 채
  // 가게가 먼저 튀어나온다.
  const [step, setStep] = useState<"purpose" | "origins" | "search" | "loading" | "picks">("purpose")
  const [loadingMsg, setLoadingMsg] = useState("모일 동네를 찾는 중...")
  // 중간지점 후보 3곳 — 엔진(find_best_midpoints)이 원래 3개를 주는데 1등만 쓰고 있었다
  const [regions, setRegions] = useState<
    { lat: number; lng: number; name: string; places: any[]; travel_times: number[] }[]
  >([])
  // 출발지 — 프로필에 내 동네가 없는 멤버는 이 자리에서 찍는다.
  // 중간지점은 출발지가 2곳 이상이어야 계산된다(서버가 1곳이면 '내 주변'으로 뭉갠다).
  // 여기서 찍은 위치는 이 투표를 만드는 동안만 쓰고 남의 프로필을 고치지 않는다.
  type Point = { name: string; lat: number; lng: number }
  const [points, setPoints] = useState<Record<number, Point>>(() => {
    const seed: Record<number, Point> = {}
    members.forEach((m) => {
      if (m.lat && m.lng && Math.abs(Number(m.lat)) > 1) {
        seed[m.id] = { name: m.location_name || "내 동네", lat: Number(m.lat), lng: Number(m.lng) }
      }
    })
    return seed
  })
  const [editingMember, setEditingMember] = useState<number | null>(null)
  const [pq, setPq] = useState("")
  const [phits, setPhits] = useState<any[]>([])
  const pointList = Object.values(points)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<any[]>([])
  const [purpose, setPurpose] = useState("")
  // 동네는 고르는 게 아니라 '필터'다 — 3곳을 탭으로 놓고 각각의 추천을 보면서
  // 어느 동네에서든 후보를 담는다. 한 동네만 남기면 나머지 두 곳은 크루도 못 보고
  // 그 동네 가게도 기회가 없다.
  const [regionIdx, setRegionIdx] = useState(0)
  const [picksBy, setPicksBy] = useState<Record<number, CrewPick[]>>({})
  const [noteBy, setNoteBy] = useState<Record<number, string>>({})
  const [crewBy, setCrewBy] = useState<Record<number, boolean>>({})
  const [loadingRegion, setLoadingRegion] = useState<number | null>(null)
  // 담은 후보는 동네를 넘나든다 — 어느 동네에서 담았는지 같이 들고 있어야
  // 카드에 "노원 · 청구" 처럼 적어줄 수 있다
  const [chosen, setChosen] = useState<{ region: number; pick: CrewPick }[]>([])
  const [creating, setCreating] = useState(false)
  const [shown, setShown] = useState(6)   // 더보기로 6개씩 늘린다

  const picks = picksBy[regionIdx] ?? []
  const note = noteBy[regionIdx] ?? ""
  const fromCrew = crewBy[regionIdx] ?? true
  const pickKey = (p: CrewPick) => (p.place_id != null ? `p${p.place_id}` : `n${p.name}`)
  const isChosen = (p: CrewPick) => chosen.some((c) => pickKey(c.pick) === pickKey(p))

  // 출발지 검색 — 멤버 한 명의 출발 지점을 찍는다
  const searchPoint = async () => {
    const q = pq.trim()
    if (!q) return
    try {
      const res = await fetchWithAuth(`/api/geocode?query=${encodeURIComponent(q)}`)
      const data = res.ok ? await res.json() : []
      setPhits(Array.isArray(data) ? data.slice(0, 5) : [])
    } catch { setPhits([]) }
  }

  // 지역/동/역 검색(지오코딩) — 식당 검색이 아니라 '어디 근처'의 기준점을 잡는 단계
  const search = async () => {
    const q = query.trim()
    if (!q) return
    try {
      const res = await fetchWithAuth(`/api/geocode?query=${encodeURIComponent(q)}`)
      const data = res.ok ? await res.json() : []
      setHits(Array.isArray(data) ? data.slice(0, 6) : [])
    } catch { setHits([]) }
  }

  // 중간지점 후보 3곳을 받아 고르게 한다. 엔진은 191개 핫스팟 중 min-max(가장 오래
  // 걸리는 사람의 시간을 최소화)로 3곳을 뽑는데, 1등만 쓰면 "왜 여기?"에 답할 수 없다.
  const loadMidpoints = async (p: string, pts: Point[]) => {
    setPurpose(p)
    setLoadingMsg("모일 동네를 찾는 중...")
    setStep("loading")
    try {
      const res = await fetchWithAuth(`/api/recommend`, {
        method: "POST",
        body: JSON.stringify({
          purpose: p,
          user_selected_tags: [],
          member_user_ids: members.map((m) => m.id),
          current_lat: pts[0]?.lat ?? 37.5665,
          current_lng: pts[0]?.lng ?? 126.978,
          users: pts.slice(1).map((q) => ({ location: { lat: q.lat, lng: q.lng } })),
        }),
      })
      const rs = res.ok ? await res.json() : []
      const list = (Array.isArray(rs) ? rs : []).slice(0, 3).map((r: any) => ({
        lat: r?.center?.lat ?? 37.5665,
        lng: r?.center?.lng ?? 126.978,
        name: r?.region_name || "중간지점",
        places: r?.places || [],
        travel_times: Array.isArray(r?.travel_times) ? r.travel_times.map(Number) : [],
      }))
      setRegions(list)
      if (list.length === 0) {
        alert("모일 동네를 찾지 못했어요. 지역을 직접 입력해 주세요.")
        setStep("search")
        return
      }
      // 동네를 고르라고 한 번 더 묻지 않는다 — 3곳을 탭으로 놓고 첫 동네를 바로 연다
      setStep("picks")
      setPicksBy({}); setNoteBy({}); setCrewBy({})
      openRegion(0, p, list)
    } catch {
      alert("오류가 발생했어요.")
      setStep("purpose")
    }
  }

  // 개인 추천(/api/recommend) — 취향 시트가 없을 때의 폴백.
  const recommend = async (p: string, at?: { lat: number; lng: number }) => {
    const located = members.filter((m) => m.lat && m.lng && Math.abs(Number(m.lat)) > 1)
    const payload: any = {
      purpose: p,
      user_selected_tags: [],
      member_user_ids: members.map((m) => m.id),
      current_lat: at?.lat ?? located[0]?.lat ?? 37.5665,
      current_lng: at?.lng ?? located[0]?.lng ?? 126.978,
    }
    if (!at) payload.users = located.slice(1).map((m) => ({ location: { lat: m.lat, lng: m.lng } }))
    try {
      const res = await fetchWithAuth(`/api/recommend`, { method: "POST", body: JSON.stringify(payload) })
      const regions = res.ok ? await res.json() : []
      const r0 = regions?.[0]
      return {
        lat: r0?.center?.lat ?? payload.current_lat,
        lng: r0?.center?.lng ?? payload.current_lng,
        name: r0?.region_name || "중간지점",
        places: (r0?.places || []) as any[],
      }
    } catch {
      return { lat: payload.current_lat, lng: payload.current_lng, name: "중간지점", places: [] as any[] }
    }
  }

  // 동네 하나를 열어 그 동네의 추천을 채운다. 이미 불러왔으면 탭만 바꾼다.
  // 담은 후보는 건드리지 않는다 — 동네를 옮겨 다니며 담는 게 이 화면의 요지다.
  const openRegion = async (i: number, p = purpose, list = regions) => {
    setRegionIdx(i)
    setShown(6)
    const r = list[i]
    if (!r) return
    if (picksBy[i]) return
    setLoadingRegion(i)
    try {
      const qs = `lat=${r.lat}&lng=${r.lng}&purpose=${encodeURIComponent(p)}&limit=24`
      const res = await fetchWithAuth(`/api/chat/rooms/${roomId}/polls/suggest?${qs}`)
      const data = res.ok ? await res.json() : null
      const items: CrewPick[] = Array.isArray(data?.items) ? data.items : []

      if (items.length > 0) {
        setCrewBy((s) => ({ ...s, [i]: true }))
        setNoteBy((s) => ({ ...s, [i]: data?.note || "" }))
        setPicksBy((s) => ({ ...s, [i]: items }))
        // 첫 동네에서만 자동으로 담아준다. 그것도 추천에서만 — 기준 밖인 곳이
        // 체크된 채 올라가면 안 된다. 나머지 동네는 사람이 보고 담는다.
        if (i === 0 && chosen.length === 0) {
          const rec = items.filter((it) => it.recommended).slice(0, 3)
          setChosen((rec.length ? rec : items.slice(0, 3)).map((pick) => ({ region: i, pick })))
        }
        return
      }

      // 취향 시트가 없거나 반경 안에 후보가 없을 때 — 기존 추천으로라도 채운다
      const fallback = (r.places?.length ? r.places : (await recommend(p, r)).places) || []
      setCrewBy((s) => ({ ...s, [i]: false }))
      setNoteBy((s) => ({
        ...s,
        [i]: data?.note || (fallback.length ? "멤버 취향을 아직 모으지 못해 일반 추천으로 채웠어요." : "이 동네엔 후보가 없어요."),
      }))
      setPicksBy((s) => ({
        ...s,
        [i]: fallback.slice(0, 12).map((x: any) => ({
          place_id: x.id ?? null, name: x.name, cuisine: x.category, reason: x.reason,
        })),
      }))
    } catch {
      setNoteBy((s) => ({ ...s, [i]: "불러오지 못했어요." }))
      setPicksBy((s) => ({ ...s, [i]: [] }))
    } finally {
      setLoadingRegion(null)
    }
  }

  const toggle = (p: CrewPick) =>
    setChosen((prev) =>
      prev.some((c) => pickKey(c.pick) === pickKey(p))
        ? prev.filter((c) => pickKey(c.pick) !== pickKey(p))
        : [...prev, { region: regionIdx, pick: p }]
    )

  // 아무도 게이트를 못 넘은 목록 — 순위는 '덜 어긋나는 순'일 뿐이다.
  // 이걸 "다 같이 만족하는 순서"라고 부르면 화면이 거짓말을 한다.
  const noneSatisfied = fromCrew && picks.length > 0 && picks.every((p) => (p.satisfied ?? 0) === 0)
  // 추천 구간이 끝나는 지점 — 여기부터는 기준 밖(참고용)이라고 화면이 밝힌다
  const firstBelow = picks.findIndex((p) => !p.recommended)

  const create = async () => {
    if (chosen.length === 0 || regions.length === 0) return
    setCreating(true)
    try {
      // 담은 후보가 어느 동네에서 왔는지 세어, 가장 많이 담긴 동네를 대표로 쓴다.
      // ★후보 동네는 전부 남긴다★ — 크루가 검토한 동네 셋을 다 기록해야, 그 동네
      // 가게들도 '우리 동네가 후보였다'는 걸 알고 제안할 기회가 생긴다.
      // tsconfig target이 es5라 Map/Set 순회(스프레드·for...of)가 막힌다 — 객체로 센다
      const used: Record<number, number> = {}
      chosen.forEach((c) => { used[c.region] = (used[c.region] || 0) + 1 })
      const usedIdx = Object.keys(used).map(Number)
      const mainIdx = usedIdx.slice().sort((a, b) => used[b] - used[a])[0] ?? regionIdx
      const main = regions[mainIdx] || regions[0]
      const usedNames = usedIdx.slice().sort((a, b) => a - b)
        .map((i) => regions[i]?.name).filter(Boolean)

      const res = await fetchWithAuth(`/api/chat/rooms/${roomId}/polls`, {
        method: "POST",
        body: JSON.stringify({
          kind: "place",
          meta: {
            anchor_name: usedNames.join(" · ") || main.name,
            lat: main.lat, lng: main.lng, purpose,
            regions: regions.map((r) => ({ name: r.name, lat: r.lat, lng: r.lng })),
          },
          options: chosen.map(({ region, pick: p }) => ({
            label: p.name,
            place_id: p.place_id,
            added_by_ai: true,
            meta: {
              category: p.cuisine,
              region: regions[region]?.name,
              reason: p.reason,
              reason_kind: p.reason_kind,
              satisfied: p.satisfied,
              total: p.total,
              weakest: p.weakest,
            },
          })),
        }),
      })
      if (res.ok) {
        onCreated(await res.json())
        onClose()
      } else {
        alert("투표 생성에 실패했어요.")
      }
    } catch {
      alert("오류가 발생했어요.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Sheet title="📍 장소 투표 만들기" onClose={onClose}>
      {step === "purpose" && (
        <div>
          <p className="text-xs text-gray-500 mb-2">뭐 하러 모이나요? 목적을 고르면 모일 동네를 찾아드려요.</p>
          <div className="grid grid-cols-2 gap-2">
            {PURPOSES.map((p) => (
              <Button
                key={p.key}
                onClick={() => {
                  setPurpose(p.key)
                  // 출발지가 2곳 이상이면 바로 동네를 찾고, 아니면 출발지부터 채운다
                  if (pointList.length >= 2) loadMidpoints(p.key, pointList)
                  else setStep("origins")
                }}
                variant="outline"
                className="h-11 rounded-xl"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {step === "search" && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">지역·동·지하철역으로 검색하세요. 그 근처에서 추천해요.</p>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="예: 강남역, 성수동, 홍대입구"
              className="h-10 text-sm"
            />
            <Button onClick={search} className="bg-[#F5A623] hover:bg-[#D97706] rounded-xl">
              <Search className="w-4 h-4" />
            </Button>
          </div>
          {hits.length === 0 && query.trim() && (
            <p className="text-[11px] text-gray-300">검색 버튼이나 Enter를 눌러주세요.</p>
          )}
          {hits.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                if (!p?.lat || !p?.lng) return
                const name = String(p.title || p.name || query).replace(/^서울\S* /, "")
                // 직접 고른 동네는 탭에 하나 더 붙는다 — 기존 후보를 밀어내지 않는다
                const next = [...regions, { lat: p.lat, lng: p.lng, name, places: [], travel_times: [] }]
                setRegions(next)
                setStep("picks")
                openRegion(next.length - 1, purpose, next)
              }}
              className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-amber-50 text-sm"
            >
              <div className="font-bold text-gray-800">{p.title || p.name}</div>
              {p.category && <div className="text-xs text-gray-400">{p.category}</div>}
            </button>
          ))}
        </div>
      )}
      {step === "origins" && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            누가 어디서 출발하나요? 2명 이상 찍으면 그 사이 동네를 찾아드려요.
          </p>
          <p className="text-[11px] text-gray-400">
            여기서 찍은 위치는 이 투표에만 써요. 멤버 프로필은 안 바뀌어요.
          </p>
          {members.map((m) => {
            const pt = points[m.id]
            const open = editingMember === m.id
            return (
              <div key={m.id} className="rounded-xl border border-gray-200 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-gray-800 truncate">
                    {m.name}{m.is_me ? " (나)" : ""}
                  </span>
                  {pt ? (
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[11px] text-gray-500 truncate max-w-[110px]">{pt.name}</span>
                      <button
                        onClick={() => { setEditingMember(open ? null : m.id); setPq(""); setPhits([]) }}
                        className="text-[11px] font-bold text-amber-700"
                      >
                        변경
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => { setEditingMember(open ? null : m.id); setPq(""); setPhits([]) }}
                      className="text-[11px] font-bold text-amber-800 bg-amber-100 rounded-full px-2.5 py-1 flex-shrink-0"
                    >
                      {open ? "닫기" : "+ 위치 추가"}
                    </button>
                  )}
                </div>
                {open && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex gap-2">
                      <Input
                        value={pq}
                        onChange={(e) => setPq(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && searchPoint()}
                        placeholder="예: 강남역, 청구역, 성수동"
                        className="h-9 text-sm"
                      />
                      <Button onClick={searchPoint} className="bg-[#F5A623] hover:bg-[#D97706] rounded-xl h-9">
                        <Search className="w-4 h-4" />
                      </Button>
                    </div>
                    {phits.map((h, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (!h?.lat || !h?.lng) return
                          const name = String(h.title || h.name || pq).replace(/^서울\S* /, "")
                          setPoints((prev) => ({ ...prev, [m.id]: { name, lat: h.lat, lng: h.lng } }))
                          setEditingMember(null)
                          setPq("")
                          setPhits([])
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-amber-50 text-xs"
                      >
                        <span className="font-bold text-gray-800">{h.title || h.name}</span>
                        {h.category && <span className="ml-1 text-[10px] text-gray-400">{h.category}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <Button
            onClick={() => loadMidpoints(purpose, pointList)}
            disabled={pointList.length < 2}
            className="w-full h-11 rounded-xl bg-[#F5A623] hover:bg-[#D97706]"
          >
            {pointList.length < 2
              ? `출발지 ${pointList.length}곳 · 2곳부터 찾을 수 있어요`
              : `이 ${pointList.length}곳 사이에서 찾기`}
          </Button>
          <Button onClick={() => setStep("search")} variant="outline" className="w-full h-10 rounded-xl">
            🔍 그냥 지역 직접 고르기
          </Button>
        </div>
      )}
      {step === "loading" && (
        <div className="py-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#F5A623] mx-auto mb-2" />
          <p className="text-xs text-gray-400">{loadingMsg}</p>
        </div>
      )}
      {step === "picks" && (
        <div>
          {/* 동네 탭 — 3곳을 오가며 담는다. 한 곳만 고르는 화면이 아니다 */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            {regions.map((r, i) => {
              const on = i === regionIdx
              const n = chosen.filter((c) => c.region === i).length
              const worst = r.travel_times.length ? Math.max(...r.travel_times) : null
              return (
                <button
                  key={`${r.name}-${i}`}
                  onClick={() => openRegion(i)}
                  className={`flex-shrink-0 rounded-xl border px-3 py-1.5 text-left transition-colors ${
                    on ? "border-[#F5A623] bg-amber-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className={`text-xs font-bold ${on ? "text-amber-900" : "text-gray-700"}`}>
                    {r.name}
                    {n > 0 && (
                      <span className="ml-1 rounded-full bg-[#F5A623] px-1.5 text-[9px] font-bold text-white">{n}</span>
                    )}
                  </div>
                  {worst !== null && <div className="text-[9px] text-gray-400">먼 멤버 {worst}분</div>}
                </button>
              )
            })}
            <button
              onClick={() => setStep("search")}
              className="flex-shrink-0 rounded-xl border border-dashed border-gray-200 px-3 py-1.5 text-xs text-gray-400"
            >
              + 동네
            </button>
          </div>

          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs text-gray-500">
              {note}
              {fromCrew && (
                <span className={`block text-[11px] ${noneSatisfied ? "text-rose-500" : "text-gray-400"}`}>
                  {noneSatisfied
                    ? "이 동네엔 기준을 넘는 곳이 없어요. 다른 동네 탭을 눌러보세요."
                    : "동네를 오가며 담을 수 있어요. 한 명이라도 맞는 곳을 취향 총합 순으로 놓았어요."}
                </span>
              )}
            </p>
            <button onClick={() => setStep("purpose")} className="text-[11px] text-gray-400 flex-shrink-0 underline">
              목적 바꾸기
            </button>
          </div>

          {loadingRegion === regionIdx && (
            <div className="py-6 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#F5A623] mx-auto" />
            </div>
          )}

          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
            {picks.slice(0, shown).map((p, i) => {
              const on = isChosen(p)
              return (
                <React.Fragment key={p.place_id ?? `i${i}`}>
                {i === firstBelow && firstBelow > 0 && (
                  <div className="flex items-center gap-2 pt-1.5 pb-0.5">
                    <span className="h-px flex-1 bg-gray-100" />
                    <span className="text-[10px] text-gray-400">여기부터는 기준 밖 · 직접 고를 수 있어요</span>
                    <span className="h-px flex-1 bg-gray-100" />
                  </div>
                )}
                <button
                  onClick={() => toggle(p)}
                  className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                    on ? "border-[#F5A623] bg-amber-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-gray-800 truncate">
                        {p.recommended && (
                          <span className="mr-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-700">
                            추천
                          </span>
                        )}
                        {p.name}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {[p.cuisine, p.address].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span
                      className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                        on ? "bg-[#F5A623] border-[#F5A623] text-white" : "border-gray-200 text-transparent"
                      }`}
                    >
                      <Check className="w-3 h-3" />
                    </span>
                  </div>
                  {(p.reason_me || p.reason) && (
                    <div className={`mt-1 text-[10px] font-bold ${reasonTone(p.reason_kind)}`}>
                      {p.reason_me || p.reason}
                    </div>
                  )}
                  {p.years_open ? (
                    <div className="text-[10px] text-gray-400 mt-0.5">{p.years_open}년째 영업 중</div>
                  ) : null}
                </button>
                </React.Fragment>
              )
            })}
            {picks.length > shown && (
              <button
                onClick={() => setShown((n) => n + 6)}
                className="w-full rounded-xl border border-dashed border-gray-200 py-2 text-[11px] font-bold text-gray-500 hover:bg-gray-50"
              >
                더보기 ({picks.length - shown}곳 남음)
              </button>
            )}
          </div>
          {chosen.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {chosen.map(({ region, pick: p }) => (
                <span
                  key={pickKey(p)}
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800"
                >
                  {regions[region]?.name ? `${regions[region].name} · ` : ""}{p.name}
                </span>
              ))}
            </div>
          )}
          <Button
            onClick={create}
            disabled={creating || chosen.length === 0}
            className="w-full h-11 rounded-xl bg-[#F5A623] hover:bg-[#D97706] mt-3"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : `투표 올리기 (${chosen.length}곳)`}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────
// 일정 투표 만들기 — 비는 날 후보 중 선택
export function SchedulePollComposer({
  roomId,
  onClose,
  onCreated,
}: {
  roomId: string
  onClose: () => void
  onCreated: (p: Poll) => void
}) {
  const [dates, setDates] = useState<any[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [time, setTime] = useState("19:00")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchWithAuth(`/api/chat/rooms/${roomId}/available-dates?days=60`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const arr = Array.isArray(d) ? d : []
        setDates(arr)
        // 기본 선택은 '비는 날' 앞에서 3개 — 바쁜 날을 기본으로 올리면 안 된다
        setSelected(arr.filter((x: any) => !x.busy).slice(0, 3).map((x: any) => x.fullDate))
      })
      .catch(() => {})
  }, [roomId])

  // 달력 색 구분 — free는 전원 일정 없음(추천), busy는 누군가 일정 있음
  const status = useMemo(() => {
    const m: Record<string, DayStatus> = {}
    dates.forEach((d: any) => { m[d.fullDate] = d.busy ? "busy" : "free" })
    return m
  }, [dates])

  const labelOf = (fd: string) => {
    const hit = dates.find((d: any) => d.fullDate === fd)
    return hit ? hit.displayDate : dateLabel(fd)
  }

  const toggle = (fd: string) =>
    setSelected((prev) => (prev.includes(fd) ? prev.filter((x) => x !== fd) : [...prev, fd]))

  const create = async () => {
    if (selected.length === 0) return
    setLoading(true)
    try {
      const res = await fetchWithAuth(`/api/chat/rooms/${roomId}/polls`, {
        method: "POST",
        body: JSON.stringify({
          kind: "schedule",
          meta: { anchor_name: "멤버들 비는 날" },
          options: [...selected].sort().map((fd) => ({
            label: `${labelOf(fd)} ${time}`,
            added_by_ai: true,
            meta: { date: fd, time },
          })),
        }),
      })
      if (res.ok) {
        onCreated(await res.json())
        onClose()
      } else alert("투표 생성에 실패했어요.")
    } catch { alert("오류가 발생했어요.") } finally { setLoading(false) }
  }

  return (
    <Sheet title="📅 일정 투표 만들기" onClose={onClose}>
      <p className="text-xs text-gray-500 mb-1">올릴 날짜를 고르세요. 여러 개 고를 수 있어요.</p>
      <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-200" /> 다 비는 날
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-gray-100" /> 일정 있는 멤버 있음
        </span>
      </div>
      <MonthCalendar selected={selected} onToggle={toggle} status={status} />
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {[...selected].sort().map((fd) => (
            <span key={fd} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              {labelOf(fd)}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 my-4">
        <span className="text-xs text-gray-500">시간</span>
        <select
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 px-2 text-sm"
        >
          {QUARTER_TIMES.map((t) => (
            <option key={t} value={t}>{timeLabel(t)}</option>
          ))}
        </select>
      </div>
      <Button
        onClick={create}
        disabled={loading || selected.length === 0}
        className="w-full h-11 rounded-xl bg-[#F5A623] hover:bg-[#D97706]"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `투표 올리기 (${selected.length}개 후보)`}
      </Button>
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────
// 후보 추가 시트 — 장소: AI 추천 전체 + 검색 / 일정: 날짜 직접 추가
export function CandidateSheet({
  poll,
  members,
  onClose,
  onUpdate,
}: {
  poll: Poll
  members: ChatMember[]
  onClose: () => void
  onUpdate: (p: Poll) => void
}) {
  const router = useRouter()
  const [tab, setTab] = useState<"reco" | "search">("reco")
  const [recos, setRecos] = useState<CrewPick[]>([])
  const [recoNote, setRecoNote] = useState("")
  const [fromCrew, setFromCrew] = useState(true)
  const [loading, setLoading] = useState(poll.kind === "place")
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<any[]>([])
  const [newDate, setNewDate] = useState("")
  const [newTime, setNewTime] = useState("19:00")
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const existingPlaceIds = useMemo(
    () => new Set(poll.options.map((o) => o.place_id).filter(Boolean)),
    [poll.options]
  )
  const existingLabels = useMemo(() => new Set(poll.options.map((o) => o.label)), [poll.options])
  // 합성 목록인데 아무도 게이트를 못 넘었으면 그 사실을 밝힌다(순위는 상대적일 뿐)
  const recoNoneSatisfied =
    fromCrew && recos.length > 0 && recos.every((p) => (p.satisfied ?? 0) === 0)

  // 후보 추가 목록도 투표를 만들 때와 같은 집단 합성으로 뽑는다 — 만든 사람과
  // 나중에 담는 사람이 서로 다른 기준의 목록을 보면 같은 투표가 아니다.
  useEffect(() => {
    if (poll.kind !== "place") return
    const meta = poll.meta || {}
    const lat = meta.lat ?? 37.5665
    const lng = meta.lng ?? 126.978
    const purpose = meta.purpose || "식사"
    let alive = true

    const run = async () => {
      try {
        const qs = `lat=${lat}&lng=${lng}&purpose=${encodeURIComponent(purpose)}&limit=24`
        const res = await fetchWithAuth(`/api/chat/rooms/${poll.room_id}/polls/suggest?${qs}`)
        const data = res.ok ? await res.json() : null
        const items: CrewPick[] = Array.isArray(data?.items) ? data.items : []
        if (!alive) return
        if (items.length > 0) {
          setFromCrew(true)
          setRecoNote(data?.note || "")
          setRecos(items)
          return
        }
        // 취향 시트가 없거나 반경 안에 후보가 없을 때 — 기존 추천으로라도 채운다
        const r2 = await fetchWithAuth(`/api/recommend`, {
          method: "POST",
          body: JSON.stringify({
            purpose,
            user_selected_tags: [],
            member_user_ids: members.map((m) => m.id),
            current_lat: lat,
            current_lng: lng,
          }),
        })
        const regions = r2.ok ? await r2.json() : []
        if (!alive) return
        setFromCrew(false)
        setRecoNote(data?.note || "")
        setRecos(
          (regions?.[0]?.places || []).map((x: any) => ({
            place_id: x.id ?? null,
            name: x.name,
            cuisine: x.category,
            reason: x.reason,
          }))
        )
      } catch {
        /* 목록이 비면 검색 탭으로 담으면 된다 */
      } finally {
        if (alive) setLoading(false)
      }
    }
    run()
    return () => { alive = false }
  }, [poll.id])

  const add = async (key: string, body: any) => {
    setBusyKey(key)
    try {
      const res = await fetchWithAuth(`/api/chat/polls/${poll.id}/options`, {
        method: "POST",
        body: JSON.stringify(body),
      })
      if (res.ok) onUpdate(await res.json())
      else alert((await res.json())?.detail || "추가 실패")
    } catch {} finally { setBusyKey(null) }
  }

  const search = async () => {
    const q = query.trim()
    if (!q) return
    try {
      const res = await fetchWithAuth(`/api/places/search?query=${encodeURIComponent(q)}`)
      const data = res.ok ? await res.json() : []
      setHits(Array.isArray(data) ? data.slice(0, 8) : [])
    } catch { setHits([]) }
  }

  if (poll.kind === "schedule") {
    return (
      <Sheet title="📅 날짜 후보 추가" onClose={onClose}>
        <MonthCalendar selected={newDate ? [newDate] : []} onToggle={(d) => setNewDate(d)} />
        <div className="flex items-center gap-2 my-3">
          <span className="text-xs text-gray-500">시간</span>
          <select
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="h-10 rounded-lg border border-gray-200 px-2 text-sm"
          >
            {QUARTER_TIMES.map((t) => (
              <option key={t} value={t}>{timeLabel(t)}</option>
            ))}
          </select>
        </div>
        <Button
          onClick={() => {
            if (!newDate) return
            const label = dateLabel(newDate, newTime)
            if (existingLabels.has(label)) { alert("이미 후보에 있어요."); return }
            add("date", { label, meta: { date: newDate, time: newTime } })
          }}
          disabled={!newDate || busyKey !== null}
          className="w-full h-11 rounded-xl bg-[#F5A623] hover:bg-[#D97706]"
        >
          후보로 추가
        </Button>
      </Sheet>
    )
  }

  return (
    <Sheet title="📍 후보 추가" onClose={onClose}>
      <div className="flex rounded-xl bg-gray-100 p-0.5 mb-3">
        <button
          onClick={() => setTab("reco")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${tab === "reco" ? "bg-white shadow-sm text-gray-900" : "text-gray-400"}`}
        >
          {fromCrew ? "🤝 우리 취향" : "✨ AI 추천"} {recos.length > 0 ? `${recos.length}곳` : ""}
        </button>
        <button
          onClick={() => setTab("search")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${tab === "search" ? "bg-white shadow-sm text-gray-900" : "text-gray-400"}`}
        >
          🔍 검색
        </button>
      </div>

      {tab === "reco" && (
        <div className="space-y-1.5">
          {loading && (
            <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-[#F5A623] mx-auto" /></div>
          )}
          {!loading && recos.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">추천 결과가 없어요. 검색으로 추가해보세요.</p>
          )}
          {!loading && recos.length > 0 && (recoNote || recoNoneSatisfied) && (
            <p className={`text-[11px] pb-0.5 ${recoNoneSatisfied ? "text-rose-500" : "text-gray-400"}`}>
              {recoNoneSatisfied ? `${recoNote} · 기준을 넓혀도 넘는 곳이 없어 덜 어긋나는 순서예요` : recoNote}
            </p>
          )}
          {recos.map((p, i) => {
            const added = !!p.place_id && existingPlaceIds.has(p.place_id)
            const key = `p${p.place_id ?? i}`
            return (
              <div key={p.place_id ?? `i${i}`} className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2">
                <button
                  onClick={() => p.place_id && router.push(`/places/${p.place_id}`)}
                  className="flex-1 min-w-0 text-left"
                  title="가게 상세 보기"
                >
                  <div className="text-xs font-bold text-gray-800 truncate">
                    {p.recommended && (
                      <span className="mr-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-700">
                        추천
                      </span>
                    )}
                    {p.name}
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">
                    {[p.cuisine, p.address].filter(Boolean).join(" · ")}
                  </div>
                  {(p.reason_me || p.reason) && (
                    <div className={`text-[10px] font-bold truncate ${reasonTone(p.reason_kind)}`}>
                      {p.reason_me || p.reason}
                    </div>
                  )}
                  {p.place_id && <span className="text-[9px] font-bold text-sky-600">상세 보기 →</span>}
                </button>
                {added ? (
                  <span className="text-[10px] text-gray-400 flex items-center gap-0.5 flex-shrink-0">
                    <Check className="w-3 h-3" /> 담김
                  </span>
                ) : (
                  <button
                    onClick={() =>
                      add(key, {
                        label: p.name,
                        place_id: p.place_id,
                        meta: {
                          category: p.cuisine,
                          reason: p.reason,
                          reason_kind: p.reason_kind,
                          satisfied: p.satisfied,
                          total: p.total,
                          weakest: p.weakest,
                        },
                      })
                    }
                    disabled={busyKey !== null}
                    className="text-[11px] font-bold text-amber-800 bg-amber-100 rounded-full px-2.5 py-1 flex-shrink-0"
                  >
                    {busyKey === key ? "..." : "+ 담기"}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === "search" && (
        <div className="space-y-1.5">
          <div className="flex gap-2 mb-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="가게 이름으로 검색"
              className="h-10 text-sm"
            />
            <Button onClick={search} className="bg-[#F5A623] hover:bg-[#D97706] rounded-xl">
              <Search className="w-4 h-4" />
            </Button>
          </div>
          {hits.map((p: any, i: number) => {
            const added = (p.id && existingPlaceIds.has(p.id)) || existingLabels.has(p.name)
            return (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2">
                <button
                  onClick={() => p.id && router.push(`/places/${p.id}`)}
                  className="flex-1 min-w-0 text-left"
                  title="가게 상세 보기"
                >
                  <div className="text-xs font-bold text-gray-800 truncate">{p.name || p.title}</div>
                  <div className="text-[10px] text-gray-400 truncate">{p.address}</div>
                  {p.id && <span className="text-[9px] font-bold text-sky-600">상세 보기 →</span>}
                </button>
                {added ? (
                  <span className="text-[10px] text-gray-400 flex-shrink-0">담김</span>
                ) : (
                  <button
                    onClick={() => add(`s${i}`, { label: p.name || p.title, place_id: p.id, meta: { category: p.category } })}
                    disabled={busyKey !== null}
                    className="text-[11px] font-bold text-amber-800 bg-amber-100 rounded-full px-2.5 py-1 flex-shrink-0"
                  >
                    {busyKey === `s${i}` ? "..." : "+ 담기"}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────
// 방문 히스토리 시트 — 이 방에서 확정된 장소/일정 기록
export function HistorySheet({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWithAuth(`/api/chat/rooms/${roomId}/polls?status=confirmed`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [roomId])

  return (
    <Sheet title="🕘 우리 모임 히스토리" onClose={onClose}>
      {loading ? (
        <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">
          아직 확정된 모임 기록이 없어요.<br />장소·일정 투표를 확정하면 여기에 쌓여요.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => (
            <button
              key={it.poll_id}
              onClick={() => it.confirmed?.place_id && router.push(`/places/${it.confirmed.place_id}`)}
              className="w-full flex items-center gap-2.5 rounded-xl border border-gray-100 px-3 py-2.5 text-left hover:bg-gray-50"
            >
              <span className="text-base">{it.kind === "place" ? "📍" : "📅"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-gray-800 truncate">{it.confirmed?.label || "확정 기록"}</div>
                <div className="text-[10px] text-gray-400">
                  {it.created_at ? it.created_at.slice(0, 10) : ""} 확정
                </div>
              </div>
              {it.confirmed?.place_id && <span className="text-[10px] text-amber-600 font-bold flex-shrink-0">다시 가기 →</span>}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────
// 정산 카드 만들기 — 총액 → 1인당 자동 계산 → 채팅 카드 발행
export function SettlementComposer({
  roomId,
  memberCount,
  onClose,
  onSent,
}: {
  roomId: string
  memberCount: number
  onClose: () => void
  onSent: () => void
}) {
  const [total, setTotal] = useState("")
  const [count, setCount] = useState(Math.max(memberCount, 2))
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)

  const totalNum = parseInt(total.replace(/[^0-9]/g, ""), 10) || 0
  const per = count > 0 ? Math.ceil(totalNum / count) : 0

  const send = async () => {
    if (totalNum <= 0) return
    setLoading(true)
    try {
      const res = await fetchWithAuth(`/api/chat/message`, {
        method: "POST",
        body: JSON.stringify({
          room_id: roomId,
          payload: { type: "settlement", total: totalNum, count, per, note: note.trim() },
        }),
      })
      if (res.ok) { onSent(); onClose() }
      else alert("전송에 실패했어요.")
    } catch { alert("오류가 발생했어요.") } finally { setLoading(false) }
  }

  return (
    <Sheet title="💸 정산하기" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">총액 (원)</label>
          <Input
            value={total}
            onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="84000"
            inputMode="numeric"
            className="h-11 text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500">인원</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setCount((c) => Math.max(2, c - 1))} className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600">-</button>
            <span className="text-sm font-bold w-8 text-center">{count}</span>
            <button onClick={() => setCount((c) => c + 1)} className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600">+</button>
          </div>
        </div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (예: 국민 123-456 조영민)" className="h-10 text-sm" />
        {totalNum > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-center">
            <span className="text-xs text-amber-700">1인당 </span>
            <span className="text-lg font-extrabold text-amber-800">{per.toLocaleString()}원</span>
          </div>
        )}
        <Button onClick={send} disabled={totalNum <= 0 || loading} className="w-full h-11 rounded-xl bg-[#F5A623] hover:bg-[#D97706]">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "정산 카드 보내기"}
        </Button>
      </div>
    </Sheet>
  )
}

// 정산 카드 렌더러(메시지)
export function SettlementCard({ data }: { data: any }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 w-[240px]">
      <div className="flex items-center gap-1 text-xs font-bold text-[#F5A623] mb-2">
        <Calculator className="w-3.5 h-3.5" /> 정산
      </div>
      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
        <span>총액</span>
        <span className="font-bold text-gray-800">{Number(data.total || 0).toLocaleString()}원</span>
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{data.count}명 · 1인당</span>
        <span className="text-base font-extrabold text-amber-700">{Number(data.per || 0).toLocaleString()}원</span>
      </div>
      {data.note && <div className="mt-2 text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 break-all">{data.note}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 💳 모임 예약금 분담 — 요청 카드(각자 수락 시 차감) + 만들기 시트
export type SplitShare = {
  user_id: number
  name: string
  amount: number
  paid: boolean
  paid_by: number | null
  paid_by_name: string | null
}

export type Split = {
  id: number
  room_id: string
  place_id: number | null
  place_name: string
  date: string
  time: string
  party_size: number
  total_amount: number
  per_amount: number
  status: "open" | "completed" | "cancelled" | "expired" | "refunded"
  reservation_id: string | null
  creator_id: number
  creator_name: string
  expires_at: string | null
  paid_count: number
  share_count: number
  shares: SplitShare[]
}

export async function fetchSplit(splitId: number): Promise<Split | null> {
  try {
    const res = await fetchWithAuth(`/api/chat/splits/${splitId}`)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

export function SplitCard({
  split,
  myId,
  onUpdate,
}: {
  split: Split
  myId: number | null
  onUpdate: (s: Split) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  const call = async (key: string, path: string, body: any = {}) => {
    setBusy(key)
    try {
      const res = await fetchWithAuth(path, { method: "POST", body: JSON.stringify(body) })
      const d = await res.json().catch(() => null)
      if (res.ok) {
        if (d?.id) onUpdate(d)
        return true
      }
      alert(d?.detail || "처리에 실패했어요.")
      return false
    } catch {
      alert("오류가 발생했어요.")
      return false
    } finally {
      setBusy(null)
    }
  }

  const isCreator = myId === split.creator_id
  const open = split.status === "open"
  const done = split.status === "completed"
  const myShare = split.shares.find((s) => s.user_id === myId)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 w-[270px]">
      <div className="flex items-center justify-between mb-0.5">
        <span className="flex items-center gap-1 text-xs font-bold text-[#F5A623]">
          <Calculator className="w-3.5 h-3.5" /> 예약금 분담
        </span>
        <span className="text-[10px] text-gray-400">{split.creator_name} 요청</span>
      </div>
      <div className="text-sm font-bold text-gray-900 truncate">{split.place_name}</div>
      <div className="text-[11px] text-gray-400 mb-2">
        {split.date} {split.time} · {split.party_size}명 · 총 {split.total_amount.toLocaleString()}원
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-center mb-2">
        <span className="text-xs text-amber-700">1인당 </span>
        <span className="text-base font-extrabold text-amber-800">{split.per_amount.toLocaleString()}원</span>
        <span className="text-[10px] text-amber-600 ml-1.5">{split.paid_count}/{split.share_count} 완료</span>
      </div>

      <div className="space-y-1 mb-2">
        {split.shares.map((s) => {
          const mine = s.user_id === myId
          return (
            <div key={s.user_id} className="flex items-center gap-2 text-xs">
              <span className={`flex-1 truncate ${mine ? "font-bold text-gray-900" : "text-gray-600"}`}>
                {s.name}{mine && " (나)"}
              </span>
              {s.paid ? (
                <span className="text-[10px] font-bold text-teal-600 flex items-center gap-0.5">
                  <Check className="w-3 h-3" />
                  {s.paid_by && s.paid_by !== s.user_id ? `${s.paid_by_name}이(가) 대신` : "완료"}
                </span>
              ) : open ? (
                mine ? (
                  <button
                    onClick={() => call("pay", `/api/chat/splits/${split.id}/pay`)}
                    disabled={busy !== null}
                    className="text-[10px] font-bold text-white bg-[#F5A623] rounded-full px-2.5 py-1"
                  >
                    {busy === "pay" ? "..." : `내 몫 내기`}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm(`${s.name}님 몫 ${s.amount.toLocaleString()}원을 대신 낼까요?`))
                        call(`p${s.user_id}`, `/api/chat/splits/${split.id}/pay`, { target_user_id: s.user_id })
                    }}
                    disabled={busy !== null}
                    className="text-[10px] font-bold text-amber-700 border border-amber-200 rounded-full px-2 py-1"
                  >
                    대신 내기
                  </button>
                )
              ) : (
                <span className="text-[10px] text-gray-300">미납</span>
              )}
            </div>
          )
        })}
      </div>

      {done ? (
        <div>
          <div className="text-[11px] font-bold text-teal-700 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> 전원 완료 — 예약 확정!
          </div>
          {split.place_id && (
            <Button
              onClick={() => router.push(`/places/${split.place_id}`)}
              className="w-full h-8 mt-1.5 text-xs bg-[#14B8A6] hover:bg-[#0D9488] rounded-lg"
            >
              장소 보기
            </Button>
          )}
        </div>
      ) : !open ? (
        <div className="text-[11px] text-gray-400">
          {split.status === "cancelled" && "요청이 취소됐어요 (낸 금액은 환불됨)"}
          {split.status === "expired" && "기한이 지나 만료됐어요 (낸 금액은 환불됨)"}
          {split.status === "refunded" && "예약이 취소돼 각자 환불됐어요"}
        </div>
      ) : isCreator ? (
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            onClick={() => call("remind", `/api/chat/splits/${split.id}/remind`)}
            disabled={busy !== null}
            className="flex-1 h-8 text-[11px] rounded-lg border-gray-200 text-gray-600"
          >
            ⏰ 리마인드
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("분담 요청을 취소할까요? 낸 금액은 각자 환불됩니다."))
                call("cancel", `/api/chat/splits/${split.id}/cancel`).then((ok) => {
                  if (ok) fetchSplit(split.id).then((s) => s && onUpdate(s))
                })
            }}
            disabled={busy !== null}
            className="flex-1 h-8 text-[11px] rounded-lg border-red-100 text-red-500"
          >
            요청 취소
          </Button>
        </div>
      ) : (
        !myShare?.paid && (
          <div className="text-[10px] text-gray-400">캐시가 부족하면 마이페이지에서 충전 후 눌러주세요</div>
        )
      )}
    </div>
  )
}

// 장소 카테고리 → 타일 이모지 (실사진 없는 크롤링 데이터 대응)
function placeEmoji(cat?: string | null): string {
  const c = String(cat || "")
  if (/카페|커피|디저트|베이커리|빵|CAFE/i.test(c)) return "☕"
  if (/술|주점|포차|호프|바|이자카야|맥주|PUB/i.test(c)) return "🍺"
  if (/고기|구이|삼겹/i.test(c)) return "🥩"
  if (/일식|초밥|스시|라멘/i.test(c)) return "🍣"
  if (/중식|중국/i.test(c)) return "🥟"
  if (/양식|피자|파스타|버거/i.test(c)) return "🍕"
  if (/국밥|한식|찌개|백반/i.test(c)) return "🍲"
  return "🍽️"
}

// 분담 만들기 시트 — AI 추천 리스트가 먼저, 각 장소는 상세로 이동 가능
export function SplitComposer({
  roomId,
  memberCount,
  members = [],
  onClose,
  onCreated,
}: {
  roomId: string
  memberCount: number
  members?: ChatMember[]
  onClose: () => void
  onCreated: (s: Split) => void
}) {
  const router = useRouter()
  const [confirmedPolls, setConfirmedPolls] = useState<any[]>([])
  const [recos, setRecos] = useState<any[]>([])
  const [recosLoading, setRecosLoading] = useState(true)
  const [place, setPlace] = useState<{ id: number | null; name: string } | null>(null)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<any[]>([])
  const [date, setDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  })
  const [time, setTime] = useState("19:00")
  const [party, setParty] = useState(Math.max(memberCount, 2))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchWithAuth(`/api/chat/rooms/${roomId}/polls?status=confirmed`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setConfirmedPolls((d.items || []).filter((x: any) => x.kind === "place" && x.confirmed?.place_id)))
      .catch(() => {})
  }, [roomId])

  // 모임 취향 기반 AI 추천 — 시트 열자마자 주르륵
  useEffect(() => {
    const located = members.filter((m) => m.lat && m.lng && Math.abs(Number(m.lat)) > 1)
    fetchWithAuth(`/api/recommend`, {
      method: "POST",
      body: JSON.stringify({
        purpose: "식사",
        user_selected_tags: [],
        member_user_ids: members.map((m) => m.id),
        current_lat: located[0]?.lat ?? 37.5665,
        current_lng: located[0]?.lng ?? 126.978,
        users: located.slice(1).map((m) => ({ location: { lat: m.lat, lng: m.lng } })),
        top_k: 15,
      }),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((regions) => setRecos(regions?.[0]?.places || []))
      .catch(() => {})
      .finally(() => setRecosLoading(false))
  }, [roomId])

  const search = async () => {
    const q = query.trim()
    if (!q) return
    try {
      const res = await fetchWithAuth(`/api/places/search?query=${encodeURIComponent(q)}`)
      const data = res.ok ? await res.json() : []
      setHits(Array.isArray(data) ? data.slice(0, 5) : [])
    } catch { setHits([]) }
  }

  const total = party * 5000
  const per = Math.ceil(total / Math.max(memberCount, 1) / 100) * 100

  const create = async () => {
    if (!place || busy) return
    setBusy(true)
    try {
      const res = await fetchWithAuth(`/api/chat/rooms/${roomId}/splits`, {
        method: "POST",
        body: JSON.stringify({ place_id: place.id, place_name: place.name, date, time, party_size: party }),
      })
      const d = await res.json().catch(() => null)
      if (res.ok) {
        onCreated(d)
        onClose()
      } else alert(d?.detail || "요청 생성에 실패했어요.")
    } catch { alert("오류가 발생했어요.") } finally { setBusy(false) }
  }

  return (
    <Sheet title="💳 모임 예약 (예약금 분담)" onClose={onClose}>
      {!place ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">어디를 예약할까요? 장소를 누르면 상세 정보를 볼 수 있어요.</p>
          {confirmedPolls.map((p: any) => (
            <button
              key={p.poll_id}
              onClick={() => setPlace({ id: p.confirmed.place_id, name: p.confirmed.label })}
              className="w-full flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/50 px-3 py-2.5 text-left"
            >
              <span>🗳️</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-gray-900 truncate">{p.confirmed.label}</span>
                <span className="block text-[10px] text-teal-700">투표로 확정된 장소 — 탭하면 바로 선택</span>
              </span>
            </button>
          ))}

          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="가게 이름 검색"
              className="h-10 text-sm"
            />
            <Button onClick={search} className="bg-[#F5A623] hover:bg-[#D97706] rounded-xl">
              <Search className="w-4 h-4" />
            </Button>
          </div>
          {hits.map((p: any, i: number) => (
            <div key={`h${i}`} className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-3 py-2">
              <button
                onClick={() => p.id && router.push(`/places/${p.id}`)}
                className="flex flex-1 items-center gap-2.5 min-w-0 text-left"
              >
                <span className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-lg flex-shrink-0">{placeEmoji(p.category)}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-gray-800 truncate">{p.name || p.title}</span>
                  <span className="block text-[10px] text-gray-400 truncate">{p.address}</span>
                </span>
              </button>
              <button
                onClick={() => setPlace({ id: p.id ?? null, name: p.name || p.title })}
                className="text-[11px] font-bold text-white bg-[#F5A623] rounded-full px-3 py-1.5 flex-shrink-0"
              >
                선택
              </button>
            </div>
          ))}

          {/* ✨ 모임 취향 AI 추천 — 열자마자 주르륵 */}
          <div className="flex items-center gap-1 pt-1">
            <span className="text-[11px] font-bold text-gray-600">✨ 우리 모임 취향 추천</span>
            {recosLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-300" />}
          </div>
          {!recosLoading && recos.length === 0 && (
            <p className="text-[11px] text-gray-400">추천을 불러오지 못했어요. 검색으로 골라주세요.</p>
          )}
          {recos.map((p: any, i: number) => (
            <div key={p.id ?? `r${i}`} className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-3 py-2">
              <button
                onClick={() => p.id && router.push(`/places/${p.id}`)}
                className="flex flex-1 items-center gap-2.5 min-w-0 text-left"
                title="상세 정보 보기"
              >
                <span className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-lg flex-shrink-0">{placeEmoji(p.category)}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-gray-800 truncate">{p.name}</span>
                  <span className="block text-[10px] text-gray-400 truncate">
                    {[p.category, (p.wemeet_rating || 0) > 0 ? `⭐${Number(p.wemeet_rating).toFixed(1)}` : null, (p.revisit_count || 0) > 0 ? `💛또갈래요 ${p.revisit_count}` : null].filter(Boolean).join(" · ")}
                  </span>
                  {p.reason && <span className="block text-[10px] text-[#D97706] truncate">✨ {p.reason}</span>}
                </span>
              </button>
              <button
                onClick={() => setPlace({ id: p.id ?? null, name: p.name })}
                className="text-[11px] font-bold text-white bg-[#F5A623] rounded-full px-3 py-1.5 flex-shrink-0"
              >
                선택
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl bg-gray-50 px-3 py-2 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800 truncate">📍 {place.name}</span>
            <button onClick={() => setPlace(null)} className="text-[11px] text-gray-400">변경</button>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 h-10 rounded-lg border border-gray-200 px-2 text-sm" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 rounded-lg border border-gray-200 px-2 text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">인원</span>
            <button onClick={() => setParty((c) => Math.max(1, c - 1))} className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600">-</button>
            <span className="text-sm font-bold w-8 text-center">{party}</span>
            <button onClick={() => setParty((c) => Math.min(50, c + 1))} className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600">+</button>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-center">
            <div className="text-xs text-amber-700">예약금 {total.toLocaleString()}원 · 멤버 {memberCount}명</div>
            <div className="text-lg font-extrabold text-amber-800">1인당 {per.toLocaleString()}원</div>
            <div className="text-[10px] text-amber-600 mt-0.5">각자 카드에서 수락하면 본인 캐시에서 빠져나가요</div>
          </div>
          <Button onClick={create} disabled={busy} className="w-full h-11 rounded-xl bg-[#F5A623] hover:bg-[#D97706]">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "분담 요청 보내기"}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

// 분담 완료/취소 배너(메시지)
export function SplitBanner({ data }: { data: any }) {
  const router = useRouter()
  const done = data.type === "split_completed"
  return (
    <div className="flex justify-center my-2">
      <button
        onClick={() => done && data.place_id && router.push(`/places/${data.place_id}`)}
        className={`text-[11px] font-bold px-3.5 py-1.5 rounded-full flex items-center gap-1 border ${
          done ? "bg-teal-50 border-teal-100 text-teal-700" : "bg-gray-50 border-gray-100 text-gray-500"
        }`}
      >
        {done
          ? <>🎉 {data.place_name} 예약 확정! ({data.date} {data.time})</>
          : <>분담 요청이 취소됐어요 (낸 금액 환불)</>}
      </button>
    </div>
  )
}

// 확정 알림 카드 렌더러(메시지)
export function PollConfirmedCard({ data }: { data: any }) {
  const router = useRouter()
  return (
    <div className="flex justify-center my-2">
      <button
        onClick={() => data.place_id && router.push(`/places/${data.place_id}`)}
        className="bg-teal-50 border border-teal-100 text-teal-700 text-[11px] font-bold px-3.5 py-1.5 rounded-full flex items-center gap-1"
      >
        {data.kind === "place" ? "📍" : "📅"} {data.label} 확정!
        {data.place_id ? <span className="text-teal-500">· 보러가기</span> : null}
      </button>
    </div>
  )
}
