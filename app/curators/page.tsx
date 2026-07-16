"use client"

import { useEffect, useState, type MouseEvent } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, BadgeCheck, UserPlus, UserCheck, Loader2 } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type CuratorRow = {
  rank: number
  id: number
  name: string
  avatar: string
  tagline: string
  verified: boolean
  weekly_score: number
  weekly_new_followers: number
  weekly_list_likes: number
  follower_count: number
  list_count: number
  is_following: boolean
  is_me: boolean
}

export default function CuratorRankingPage() {
  const router = useRouter()
  const [items, setItems] = useState<CuratorRow[]>([])
  const [week, setWeek] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetchWithAuth("/api/curators/ranking?scope=all&limit=30")
        const d = res.ok ? await res.json() : { items: [] }
        if (alive) {
          setItems(d.items || [])
          setWeek(d.week || "")
        }
      } catch {
        /* graceful */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const toggle = async (e: MouseEvent, c: CuratorRow) => {
    e.stopPropagation()
    if (busy || c.is_me) return
    setBusy(c.id)
    const next = !c.is_following
    const patch = (on: boolean) =>
      setItems((prev) => prev.map((x) => x.id === c.id ? { ...x, is_following: on, follower_count: x.follower_count + (on ? 1 : -1) } : x))
    patch(next)
    try {
      const res = await fetchWithAuth(`/api/users/${c.id}/follow`, { method: next ? "POST" : "DELETE" })
      if (res.status === 401) { patch(!next); alert("로그인이 필요해요.") }
    } catch { patch(!next) } finally { setBusy(null) }
  }

  return (
    <div className="min-h-screen bg-white max-w-lg mx-auto">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 flex items-center gap-2 px-3 h-14">
        <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <span className="font-bold text-gray-900">👑 금주의 큐레이터</span>
        <span className="text-xs text-gray-400">· 월요일 리셋</span>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-sm text-gray-400">아직 활동한 큐레이터가 없어요.</div>
      ) : (
        <div>
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/users/${c.id}`)}
              className="w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors"
            >
              <span className={`w-5 text-center font-extrabold text-sm ${c.rank <= 3 ? "text-amber-500" : "text-gray-300"}`}>{c.rank}</span>
              <span className="w-11 h-11 rounded-full bg-amber-50 flex items-center justify-center text-2xl flex-shrink-0">{c.avatar || "🙂"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 truncate flex items-center gap-1">
                  {c.name}
                  {c.verified && <BadgeCheck className="w-4 h-4 text-[#F5A623] flex-shrink-0" />}
                  {c.is_me && <span className="text-[10px] text-[#F5A623]">나</span>}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  이번 주 <span className="text-[#14B8A6] font-bold">{c.weekly_score}점</span>
                  {" "}(팔로워 +{c.weekly_new_followers} · 좋아요 +{c.weekly_list_likes}) · 리스트 {c.list_count}
                </div>
              </div>
              {!c.is_me && (
                <span
                  onClick={(e) => toggle(e, c)}
                  className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                    c.is_following ? "bg-gray-100 text-gray-600" : "bg-[#F5A623] text-white"
                  }`}
                >
                  {c.is_following ? (<><UserCheck className="w-3 h-3" />팔로잉</>) : (<><UserPlus className="w-3 h-3" />팔로우</>)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
