"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ChevronLeft,
  BadgeCheck,
  UserPlus,
  UserCheck,
  Grid3X3,
  Bookmark,
  MapPin,
  ChevronRight,
  Loader2,
  ImageOff,
} from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

type Profile = {
  id: number
  name: string
  avatar: string
  bio: string
  tagline: string
  verified: boolean
  post_count: number
  list_count: number
  follower_count: number
  following_count: number
  is_following: boolean
  is_me: boolean
}

type PostItem = {
  id: string
  image_urls: string[]
  media_type: string
  content: string
  likes_count: number
  place_id: number | null
}

type ListItem = {
  id: number
  name: string
  icon: string
  color: string
  description: string
  item_count: number
  preview: { place_id: number; name: string }[]
}

export default function CuratorProfilePage() {
  const params = useParams()
  const router = useRouter()
  const raw = params?.userId
  const userId = Array.isArray(raw) ? raw[0] : raw

  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<PostItem[]>([])
  const [lists, setLists] = useState<ListItem[]>([])
  const [tab, setTab] = useState<"posts" | "lists">("posts")
  const [loading, setLoading] = useState(true)
  const [followBusy, setFollowBusy] = useState(false)

  useEffect(() => {
    if (!userId) return
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [pr, po, li] = await Promise.all([
          fetchWithAuth(`/api/users/${userId}/profile`).then((r) => (r.ok ? r.json() : null)),
          fetchWithAuth(`/api/users/${userId}/posts`).then((r) => (r.ok ? r.json() : { items: [] })),
          fetchWithAuth(`/api/users/${userId}/lists`).then((r) => (r.ok ? r.json() : { items: [] })),
        ])
        if (!alive) return
        setProfile(pr)
        setPosts(po.items || [])
        setLists(li.items || [])
        // 리스트가 있고 게시물이 없으면 리스트 탭을 먼저
        if ((po.items || []).length === 0 && (li.items || []).length > 0) setTab("lists")
      } catch {
        /* graceful */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [userId])

  const toggleFollow = async () => {
    if (!profile || profile.is_me || followBusy) return
    setFollowBusy(true)
    const next = !profile.is_following
    // 낙관적 업데이트
    setProfile({
      ...profile,
      is_following: next,
      follower_count: profile.follower_count + (next ? 1 : -1),
    })
    try {
      const res = await fetchWithAuth(`/api/users/${userId}/follow`, { method: next ? "POST" : "DELETE" })
      if (res.status === 401) {
        // 롤백 + 로그인 안내
        setProfile((p) => (p ? { ...p, is_following: !next, follower_count: p.follower_count + (next ? -1 : 1) } : p))
        alert("로그인이 필요해요.")
      } else if (res.ok) {
        const data = await res.json()
        setProfile((p) => (p ? { ...p, is_following: data.following, follower_count: data.follower_count } : p))
      }
    } catch {
      setProfile((p) => (p ? { ...p, is_following: !next, follower_count: p.follower_count + (next ? -1 : 1) } : p))
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

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-3 px-6 text-center">
        <p className="text-gray-500">프로필을 불러올 수 없어요.</p>
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
        <div className="flex items-center gap-1 font-bold text-gray-900">
          <span className="truncate">{profile.name}</span>
          {profile.verified && <BadgeCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />}
        </div>
      </div>

      {/* 프로필 블록 */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center text-4xl flex-shrink-0">
            {profile.avatar || "🙂"}
          </div>
          <div className="flex-1 grid grid-cols-3 gap-1 text-center">
            <Stat label="게시물" value={profile.post_count} />
            <Stat label="팔로워" value={profile.follower_count} />
            <Stat label="팔로잉" value={profile.following_count} />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1">
            <span className="font-bold text-gray-900">{profile.name}</span>
            {profile.verified && <BadgeCheck className="w-4 h-4 text-blue-500" />}
          </div>
          {profile.tagline && <p className="text-sm text-purple-600 font-medium mt-0.5">{profile.tagline}</p>}
          {profile.bio && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{profile.bio}</p>}
        </div>

        {!profile.is_me && (
          <button
            onClick={toggleFollow}
            disabled={followBusy}
            className={`mt-3 w-full h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-colors ${
              profile.is_following
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-purple-600 text-white hover:bg-purple-700"
            }`}
          >
            {profile.is_following ? (
              <>
                <UserCheck className="w-4 h-4" /> 팔로잉
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" /> 팔로우
              </>
            )}
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-t border-gray-100">
        <TabBtn active={tab === "posts"} onClick={() => setTab("posts")} icon={<Grid3X3 className="w-4 h-4" />} label={`게시물 ${profile.post_count}`} />
        <TabBtn active={tab === "lists"} onClick={() => setTab("lists")} icon={<Bookmark className="w-4 h-4" />} label={`맛집 리스트 ${profile.list_count}`} />
      </div>

      {/* 콘텐츠 */}
      {tab === "posts" ? (
        posts.length === 0 ? (
          <Empty text="아직 게시물이 없어요." />
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {posts.map((p) => (
              <button
                key={p.id}
                onClick={() => p.place_id && router.push(`/places/${p.place_id}`)}
                className="relative aspect-square bg-gray-100 overflow-hidden"
              >
                {p.image_urls?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_urls[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <ImageOff className="w-6 h-6" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )
      ) : lists.length === 0 ? (
        <Empty text="아직 공개한 맛집 리스트가 없어요." />
      ) : (
        <div className="p-4 space-y-3">
          {lists.map((l) => (
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
              {l.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{l.description}</p>}
              {l.preview.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {l.preview.map((pv, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 bg-white rounded-full px-2 py-0.5">
                      <MapPin className="w-2.5 h-2.5" />
                      {pv.name}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="h-10" />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold border-b-2 transition-colors ${
        active ? "border-purple-600 text-purple-600" : "border-transparent text-gray-400"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="py-16 text-center text-sm text-gray-400">{text}</div>
}
