"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Flame, ArrowUp, ArrowDown, Loader2 } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type TrendingRow = {
  rank: number
  place_id: number
  name: string
  signal: string
  move: { type: string; delta?: number } | null
}

export default function TrendingPage() {
  const router = useRouter()
  const [items, setItems] = useState<TrendingRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetchWithAuth("/api/trending/places?days=7&limit=30")
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

  const move = (m: TrendingRow["move"]) => {
    if (m?.type === "new") return <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">NEW</span>
    if (m?.type === "up") return <span className="inline-flex items-center gap-0.5 text-xs font-bold text-green-600"><ArrowUp className="w-3 h-3" />{m.delta}</span>
    if (m?.type === "down") return <span className="inline-flex items-center gap-0.5 text-xs font-bold text-gray-400"><ArrowDown className="w-3 h-3" />{m.delta}</span>
    return <span className="text-xs text-gray-300">–</span>
  }

  return (
    <div className="min-h-screen bg-white max-w-lg mx-auto">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 flex items-center gap-2 px-3 h-14">
        <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <span className="font-bold text-gray-900 flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-orange-500" /> 실시간 급상승
        </span>
        <span className="text-xs text-gray-400">· 최근 7일</span>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-sm text-gray-400">아직 급상승 장소가 없어요.</div>
      ) : (
        <div>
          {items.map((it) => (
            <button
              key={it.place_id}
              onClick={() => it.place_id && router.push(`/places/${it.place_id}`)}
              className="w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors"
            >
              <span className={`w-5 text-center font-extrabold text-sm ${it.rank <= 3 ? "text-amber-500" : "text-gray-300"}`}>{it.rank}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 truncate">{it.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{it.signal}</div>
              </div>
              {move(it.move)}
            </button>
          ))}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
