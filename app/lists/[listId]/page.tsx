"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft, MapPin, ChevronRight, Loader2, Quote, Heart, MessageCircle, Send, Trash2 } from "lucide-react"
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
  like_count: number
  comment_count: number
  is_liked: boolean
}

type Comment = {
  id: number
  user_id: number
  user_name: string
  user_avatar: string
  content: string
  created_at: string | null
  is_mine: boolean
}

export default function CuratorListPage() {
  const params = useParams()
  const router = useRouter()
  const raw = params?.listId
  const listId = Array.isArray(raw) ? raw[0] : raw

  const [data, setData] = useState<ListDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [likeBusy, setLikeBusy] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState("")
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    if (!listId) return
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [d, c] = await Promise.all([
          fetchWithAuth(`/api/lists/${listId}`).then((r) => (r.ok ? r.json() : null)),
          fetchWithAuth(`/api/lists/${listId}/comments`).then((r) => (r.ok ? r.json() : { items: [] })),
        ])
        if (!alive) return
        setData(d)
        if (d) {
          setLiked(!!d.is_liked)
          setLikeCount(d.like_count || 0)
        }
        setComments(c.items || [])
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

  const toggleLike = async () => {
    if (likeBusy) return
    setLikeBusy(true)
    const next = !liked
    setLiked(next)
    setLikeCount((n) => n + (next ? 1 : -1))
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/like`, { method: next ? "POST" : "DELETE" })
      if (res.status === 401) {
        setLiked(!next)
        setLikeCount((n) => n + (next ? -1 : 1))
        alert("로그인이 필요해요.")
      } else if (res.ok) {
        const j = await res.json()
        setLiked(j.liked)
        setLikeCount(j.like_count)
      }
    } catch {
      setLiked(!next)
      setLikeCount((n) => n + (next ? -1 : 1))
    } finally {
      setLikeBusy(false)
    }
  }

  const submitComment = async () => {
    const text = commentText.trim()
    if (!text || posting) return
    setPosting(true)
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: text }),
      })
      if (res.status === 401) {
        alert("로그인이 필요해요.")
      } else if (res.ok) {
        const c = await res.json()
        setComments((prev) => [c, ...prev])
        setCommentText("")
      }
    } catch {
      /* graceful */
    } finally {
      setPosting(false)
    }
  }

  const deleteComment = async (id: number) => {
    if (!confirm("댓글을 삭제할까요?")) return
    const prev = comments
    setComments((c) => c.filter((x) => x.id !== id))
    try {
      const res = await fetchWithAuth(`/api/list-comments/${id}`, { method: "DELETE" })
      if (!res.ok) setComments(prev)
    } catch {
      setComments(prev)
    }
  }

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

        {/* 추천 + 지표 */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={toggleLike}
            disabled={likeBusy}
            className={`flex items-center gap-1.5 h-9 px-4 rounded-full font-bold text-sm transition-colors ${
              liked ? "bg-pink-500 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Heart className={`w-4 h-4 ${liked ? "fill-current" : ""}`} />
            추천 {likeCount}
          </button>
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <MapPin className="w-4 h-4" />
            {data.count}곳
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <MessageCircle className="w-4 h-4" />
            {comments.length}
          </div>
        </div>
      </div>

      {/* 랭킹 리스트 */}
      {data.items.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">아직 담긴 장소가 없어요.</div>
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

      {/* 댓글 */}
      <div className="border-t-8 border-gray-50 mt-2 px-4 py-4">
        <div className="font-bold text-gray-900 mb-3">댓글 {comments.length}</div>
        <div className="flex items-center gap-2 mb-4">
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitComment() }}
            placeholder="이 리스트 어땠나요? (예: 여기 진짜 맛있어요!)"
            maxLength={500}
            className="flex-1 h-10 px-3 rounded-full bg-gray-100 text-sm outline-none focus:ring-2 focus:ring-purple-200"
          />
          <button
            onClick={submitComment}
            disabled={posting || !commentText.trim()}
            className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {comments.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">첫 댓글을 남겨보세요.</div>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center text-base flex-shrink-0">
                  {c.user_avatar || "🙂"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900">{c.user_name}</span>
                    {c.is_mine && (
                      <button onClick={() => deleteComment(c.id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-line break-words">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="h-10" />
    </div>
  )
}
