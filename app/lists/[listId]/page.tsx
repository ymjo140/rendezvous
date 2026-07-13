"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft, MapPin, ChevronRight, Loader2, Quote } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type Entry = {
  place_id: number
  name: string
  category: string
  address: string
  memo: string
}

type ListDetail = {
  id: number
  name: string
  icon: string
  description: string
  owner: { id: number; name: string; avatar: string } | null
  count: number
  items: Entry[]
}

export default function CuratorListPage() {
  const params = useParams()
  const router = useRouter()
  const raw = params?.listId
  const listId = Array.isArray(raw) ? raw[0] : raw

  const [data, setData] = useState<ListDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!listId) return
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetchWithAuth(`/api/lists/${listId}`)
        if (alive) setData(res.ok ? await res.json() : null)
      } catch {
        if (alive) setData(null)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [listId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-3 px-6 text-center">
        <p className="text-gray-500">공개된 리스트가 아니거나 삭제되었어요.</p>
        <button onClick={() => router.back()} className="text-sm font-semibold text-purple-600">
          돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white max-w-lg mx-auto">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 flex items-center gap-2 px-3 h-14">
        <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <span className="font-bold text-gray-900 truncate">맛집 리스트</span>
      </div>

      {/* 히어로 */}
      <div className="px-4 pt-6 pb-4 bg-gradient-to-b from-purple-50 to-white">
        <div className="text-4xl mb-2">{data.icon || "📁"}</div>
        <h1 className="text-2xl font-extrabold text-gray-900">{data.name}</h1>
        {data.description && <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-line">{data.description}</p>}
        {data.owner && (
          <button
            onClick={() => router.push(`/users/${data.owner!.id}`)}
            className="mt-3 inline-flex items-center gap-2 bg-white rounded-full pl-1 pr-3 py-1 shadow-sm hover:shadow transition-shadow"
          >
            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center text-base">
              {data.owner.avatar || "🙂"}
            </span>
            <span className="text-sm font-semibold text-gray-800">{data.owner.name}</span>
            <span className="text-xs text-gray-400">큐레이터</span>
          </button>
        )}
        <div className="mt-3 text-xs text-gray-500 font-medium">{data.count}곳의 맛집</div>
      </div>

      {/* 랭킹 리스트 */}
      {data.items.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">아직 담긴 장소가 없어요.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {data.items.map((e, i) => (
            <button
              key={`${e.place_id}-${i}`}
              onClick={() => router.push(`/places/${e.place_id}`)}
              className="w-full text-left flex gap-3 px-4 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-purple-600 text-white font-bold text-sm flex items-center justify-center">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-gray-900 truncate">{e.name}</span>
                  {e.category && <span className="text-[11px] text-gray-400 flex-shrink-0">{e.category}</span>}
                </div>
                {e.address && (
                  <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{e.address}</span>
                  </div>
                )}
                {e.memo && (
                  <div className="flex items-start gap-1 mt-1.5 text-sm text-gray-600 bg-purple-50 rounded-lg px-2.5 py-1.5">
                    <Quote className="w-3 h-3 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{e.memo}</span>
                  </div>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 self-center" />
            </button>
          ))}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}
