"use client"

// 앱 어디서든(장소 상세/추천 탭) 진행 중인 모임 투표에 장소를 담는 입구.
// 진행 중 투표가 있으면 바로 담기, 없으면 그 자리에서 새 투표 시작(이 장소가 첫 후보).
import React, { useEffect, useState } from "react"
import { Loader2, ListChecks } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type PlaceLite = {
  id: number
  name: string
  category?: string | null
  lat?: number | null
  lng?: number | null
}

type ActivePoll = { poll_id: number; room_id: string; room_title: string; option_count: number }

export function AddToPollButton({ place, className }: { place: PlaceLite; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ||
          "flex-1 h-11 rounded-xl border border-amber-300 text-amber-700 text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-amber-50 transition-colors"
        }
      >
        <ListChecks className="w-4 h-4" /> 투표에 담기
      </button>
      {open && <AddToPollSheet place={place} onClose={() => setOpen(false)} />}
    </>
  )
}

export function AddToPollSheet({ place, onClose }: { place: PlaceLite; onClose: () => void }) {
  const [polls, setPolls] = useState<ActivePoll[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [pRes, rRes] = await Promise.all([
          fetchWithAuth("/api/chat/polls/active"),
          fetchWithAuth("/api/chat/rooms"),
        ])
        const p = pRes.ok ? await pRes.json() : { items: [] }
        const r = rRes.ok ? await rRes.json() : []
        if (!alive) return
        setPolls(p.items || [])
        // 진행 중 투표가 없는 그룹방만 '새 투표 시작' 후보로
        const pollRoomIds = new Set((p.items || []).map((x: ActivePoll) => x.room_id))
        setRooms((Array.isArray(r) ? r : []).filter((room: any) => room.is_group && !pollRoomIds.has(room.id)))
      } catch {
        /* graceful */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const toast = (text: string) => {
    try { window.dispatchEvent(new CustomEvent("app:toast", { detail: { text } })) } catch {}
    alert(text)
  }

  const addToPoll = async (poll: ActivePoll) => {
    setBusy(`p${poll.poll_id}`)
    try {
      const res = await fetchWithAuth(`/api/chat/polls/${poll.poll_id}/options`, {
        method: "POST",
        body: JSON.stringify({ label: place.name, place_id: place.id, meta: { category: place.category } }),
      })
      if (res.ok) {
        toast(`'${poll.room_title}' 투표에 담았어요!`)
        onClose()
      } else {
        const d = await res.json().catch(() => null)
        toast(d?.detail || "담기에 실패했어요.")
      }
    } catch { toast("오류가 발생했어요.") } finally { setBusy(null) }
  }

  const startPoll = async (room: any) => {
    setBusy(`r${room.id}`)
    try {
      const res = await fetchWithAuth(`/api/chat/rooms/${room.id}/polls`, {
        method: "POST",
        body: JSON.stringify({
          kind: "place",
          meta: {
            anchor_name: `${place.name} 주변`,
            lat: place.lat,
            lng: place.lng,
            purpose: "식사",
          },
          options: [{ label: place.name, place_id: place.id, meta: { category: place.category } }],
        }),
      })
      if (res.ok) {
        toast(`'${(room.title || "").replace("[모임] ", "")}'에 장소 투표를 시작했어요!`)
        onClose()
      } else toast("투표 시작에 실패했어요.")
    } catch { toast("오류가 발생했어요.") } finally { setBusy(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-7 max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <h3 className="font-bold text-gray-900 mb-0.5">어느 모임 투표에 담을까요?</h3>
        <p className="text-xs text-gray-400 mb-4 truncate">📍 {place.name}</p>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-[#F5A623] mx-auto" /></div>
        ) : (
          <div className="space-y-1.5">
            {polls.map((p) => (
              <button
                key={p.poll_id}
                onClick={() => addToPoll(p)}
                disabled={busy !== null}
                className="w-full flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/50 px-3.5 py-3 text-left"
              >
                <span className="text-lg">🗳️</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-gray-900 truncate">{p.room_title}</span>
                  <span className="block text-[11px] text-amber-700">장소 투표 진행 중 · 후보 {p.option_count}곳</span>
                </span>
                <span className="text-[11px] font-bold text-white bg-[#F5A623] rounded-full px-3 py-1.5 flex-shrink-0">
                  {busy === `p${p.poll_id}` ? "..." : "담기"}
                </span>
              </button>
            ))}
            {rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => startPoll(r)}
                disabled={busy !== null}
                className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 px-3.5 py-3 text-left hover:bg-gray-50"
              >
                <span className="text-lg">👥</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-gray-800 truncate">{(r.title || "").replace("[모임] ", "")}</span>
                  <span className="block text-[11px] text-gray-400">진행 중 투표 없음</span>
                </span>
                <span className="text-[11px] font-bold text-gray-600 border border-gray-200 rounded-full px-3 py-1.5 flex-shrink-0">
                  {busy === `r${r.id}` ? "..." : "새 투표 시작"}
                </span>
              </button>
            ))}
            {polls.length === 0 && rooms.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">
                모임 채팅방이 없어요.<br />채팅 탭에서 모임을 만들면 함께 투표할 수 있어요.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
