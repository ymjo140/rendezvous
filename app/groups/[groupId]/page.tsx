"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft, Users, Heart, UserPlus, UserCheck, MapPin, ChevronRight, Loader2, Lock, List, Globe } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type GList = {
  id: number
  name: string
  icon: string
  description: string
  item_count: number
  like_count: number
  comment_count: number
  preview: { place_id: number; name: string }[]
}

type Member = { id: number; name: string; avatar: string; is_host: boolean }

type Group = {
  id: string
  title: string
  description: string
  icon: string
  visibility: string
  member_count: number
  follower_count: number
  like_count: number
  list_count: number
  is_following: boolean
  is_member: boolean
  is_host: boolean
  can_join_chat: boolean
  members: Member[]
  lists: GList[]
}

const VIS_LABEL: Record<string, { text: string; icon: ReactNode }> = {
  list_only: { text: "리스트만 공개", icon: <List className="w-3 h-3" /> },
  public: { text: "모임 공개", icon: <Users className="w-3 h-3" /> },
  open: { text: "오픈채팅", icon: <Globe className="w-3 h-3" /> },
  private: { text: "비공개", icon: <Lock className="w-3 h-3" /> },
}

export default function GroupDetailPage() {
  const params = useParams()
  const router = useRouter()
  const raw = params?.groupId
  const groupId = Array.isArray(raw) ? raw[0] : raw

  const [g, setG] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [followBusy, setFollowBusy] = useState(false)

  useEffect(() => {
    if (!groupId) return
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetchWithAuth(`/api/groups/${groupId}`)
        if (alive) setG(res.ok ? await res.json() : null)
      } catch {
        if (alive) setG(null)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [groupId])

  const toggleFollow = async () => {
    if (!g || followBusy) return
    setFollowBusy(true)
    const next = !g.is_following
    setG({ ...g, is_following: next, follower_count: g.follower_count + (next ? 1 : -1) })
    try {
      const res = await fetchWithAuth(`/api/groups/${groupId}/follow`, { method: next ? "POST" : "DELETE" })
      if (res.status === 401) {
        setG((p) => (p ? { ...p, is_following: !next, follower_count: p.follower_count + (next ? -1 : 1) } : p))
        alert("로그인이 필요해요.")
      } else if (res.ok) {
        const d = await res.json()
        setG((p) => (p ? { ...p, is_following: d.following, follower_count: d.follower_count } : p))
      }
    } catch {
      setG((p) => (p ? { ...p, is_following: !next, follower_count: p.follower_count + (next ? -1 : 1) } : p))
    } finally {
      setFollowBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }
  if (!g) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-3 px-6 text-center">
        <p className="text-gray-500">비공개 모임이거나 찾을 수 없어요.</p>
        <button onClick={() => router.back()} className="text-sm font-semibold text-amber-600">돌아가기</button>
      </div>
    )
  }

  const vis = VIS_LABEL[g.visibility] || VIS_LABEL.private

  return (
    <div className="min-h-screen bg-white max-w-lg mx-auto">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 flex items-center gap-2 px-3 h-14">
        <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-full hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <span className="font-bold text-gray-900 truncate">모임</span>
      </div>

      <div className="px-4 pt-5 pb-4 bg-gradient-to-b from-amber-50 to-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center text-3xl flex-shrink-0">
            {g.icon || "🍽️"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg text-gray-900 truncate">{g.title}</div>
            <div className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full mt-1">
              {vis.icon}
              {vis.text}
            </div>
          </div>
        </div>
        {g.description && <p className="text-sm text-gray-600 mt-3 whitespace-pre-line">{g.description}</p>}

        <div className="flex items-center gap-4 mt-3 text-sm">
          <span className="text-gray-700"><b className="font-bold">{g.member_count}</b> <span className="text-gray-400">멤버</span></span>
          <span className="text-gray-700"><b className="font-bold">{g.follower_count}</b> <span className="text-gray-400">팔로워</span></span>
          <span className="inline-flex items-center gap-1 text-gray-700"><Heart className="w-3.5 h-3.5 text-pink-500" /><b className="font-bold">{g.like_count}</b></span>
        </div>

        {!g.is_host && (
          <button
            onClick={toggleFollow}
            disabled={followBusy}
            className={`mt-3 w-full h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-colors ${
              g.is_following ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-amber-500 text-white hover:bg-amber-600"
            }`}
          >
            {g.is_following ? (<><UserCheck className="w-4 h-4" /> 팔로잉</>) : (<><UserPlus className="w-4 h-4" /> 팔로우</>)}
          </button>
        )}

        {g.members.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <div className="flex">
              {g.members.slice(0, 5).map((m, i) => (
                <span
                  key={m.id}
                  className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-100 to-pink-100 border-2 border-white flex items-center justify-center text-sm"
                  style={{ marginLeft: i === 0 ? 0 : -8 }}
                >
                  {m.avatar || "🙂"}
                </span>
              ))}
            </div>
            <span className="text-xs text-gray-400">멤버 {g.member_count}명</span>
          </div>
        )}
      </div>

      {/* 모임의 맛집 리스트 */}
      <div className="px-4 py-4">
        <div className="font-bold text-gray-900 mb-3">맛집 리스트 {g.list_count}</div>
        {g.lists.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">아직 공개한 맛집 리스트가 없어요.</div>
        ) : (
          <div className="space-y-3">
            {g.lists.map((l) => (
              <button
                key={l.id}
                onClick={() => router.push(`/lists/${l.id}`)}
                className="w-full text-left bg-gray-50 rounded-2xl p-4 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{l.icon || "📁"}</span>
                  <span className="font-bold text-gray-900 flex-1 truncate">{l.name}</span>
                  <span className="text-xs text-gray-400">{l.item_count}곳</span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
                {l.description && <p className="text-sm text-gray-500 mt-1 line-clamp-1">{l.description}</p>}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-0.5"><Heart className="w-3 h-3 text-pink-400" />{l.like_count}</span>
                  <span>💬 {l.comment_count}</span>
                  {l.preview.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-gray-400 truncate">
                      <MapPin className="w-2.5 h-2.5" />{l.preview.map((p) => p.name).join(", ")}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="h-10" />
    </div>
  )
}
