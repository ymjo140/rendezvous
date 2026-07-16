"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Heart, MessageCircle, Loader2 } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type ListRow = {
  rank: number
  folder_id: number
  name: string
  icon: string
  like_count: number
  comment_count: number
  item_count: number
  curator: { id: number; name: string } | null
}

export default function ListRankingPage() {
  const router = useRouter()
  const [items, setItems] = useState<ListRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetchWithAuth("/api/list-ranking?limit=30")
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

  return (
    <div className="min-h-screen bg-white max-w-lg mx-auto">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 flex items-center gap-2 px-3 h-14">
        <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <span className="font-bold text-gray-900">🏆 인기 맛집 리스트</span>
        <span className="text-xs text-gray-400">· 추천 랭킹</span>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-sm text-gray-400">아직 공개된 맛집 리스트가 없어요.</div>
      ) : (
        <div>
          {items.map((l) => (
            <button
              key={l.folder_id}
              onClick={() => router.push(`/lists/${l.folder_id}`)}
              className="w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors"
            >
              <span className={`w-5 text-center font-extrabold text-sm ${l.rank <= 3 ? "text-amber-500" : "text-gray-300"}`}>{l.rank}</span>
              <span className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">{l.icon || "📁"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 truncate">{l.name}</div>
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                  {l.curator && <span className="truncate">by {l.curator.name}</span>}
                  <span className="inline-flex items-center gap-0.5"><Heart className="w-3 h-3 text-pink-400" />{l.like_count}</span>
                  <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3 text-gray-300" />{l.comment_count}</span>
                  <span>{l.item_count}곳</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
