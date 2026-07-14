"use client"

import { useEffect, useState, type MouseEvent } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Heart, UserPlus, UserCheck, Loader2 } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type GroupRow = {
  rank: number
  community_id: string
  title: string
  icon: string
  visibility: string
  member_count: number
  follower_count: number
  like_count: number
  list_count: number
  is_following: boolean
}

export default function GroupRankingPage() {
  const router = useRouter()
  const [items, setItems] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetchWithAuth("/api/group-ranking?limit=30")
        const d = res.ok ? await res.json() : { items: [] }
        if (alive) setItems(d.items || [])
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

  const toggle = async (e: MouseEvent, g: GroupRow) => {
    e.stopPropagation()
    if (busy) return
    setBusy(g.community_id)
    const next = !g.is_following
    const patch = (on: boolean) =>
      setItems((prev) => prev.map((x) => x.community_id === g.community_id ? { ...x, is_following: on, follower_count: x.follower_count + (on ? 1 : -1) } : x))
    patch(next)
    try {
      const res = await fetchWithAuth(`/api/groups/${g.community_id}/follow`, { method: next ? "POST" : "DELETE" })
      if (res.status === 401) { patch(!next); alert("로그인이 필요해요.") }
    } catch { patch(!next) } finally { setBusy(null) }
  }

  return (
    <div className="min-h-screen bg-white max-w-lg mx-auto">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 flex items-center gap-2 px-3 h-14">
        <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <span className="font-bold text-gray-900">🏆 인기 모임</span>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-sm text-gray-400">아직 공개된 모임이 없어요.</div>
      ) : (
        <div>
          {items.map((g) => (
            <button
              key={g.community_id}
              onClick={() => router.push(`/groups/${g.community_id}`)}
              className="w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors"
            >
              <span className={`w-5 text-center font-extrabold text-sm ${g.rank <= 3 ? "text-amber-500" : "text-gray-300"}`}>{g.rank}</span>
              <span className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center text-xl flex-shrink-0">{g.icon || "🍽️"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 truncate">{g.title}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  팔로워 {g.follower_count} · <span className="text-pink-500">♥ {g.like_count}</span> · 리스트 {g.list_count}
                </div>
              </div>
              <span
                onClick={(e) => toggle(e, g)}
                className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                  g.is_following ? "bg-gray-100 text-gray-600" : "bg-amber-500 text-white"
                }`}
              >
                {g.is_following ? (<><UserCheck className="w-3 h-3" />팔로잉</>) : (<><UserPlus className="w-3 h-3" />팔로우</>)}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
