"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  Gift,
  Handshake,
  Inbox,
  Loader2,
  Mail as MailIcon,
  MessageCircle,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { TabBar } from "../tab-bar"

type MailCategory = "all" | "friend" | "crew" | "partnership" | "reward" | "notice"

type MailItem = {
  id: string
  category: MailCategory
  type: string
  title: string
  preview: string
  created_at?: string | null
  is_unread?: boolean
  unread?: boolean
  request_id?: number
  app_id?: number
  community_id?: string
  status?: string
  status_label?: string
  can_respond?: boolean
  room_id?: string
  conversation_room_id?: string
  unread_count?: number
  is_group?: boolean
  amount?: number
  reward_status?: string
  requester?: { id?: number; name?: string; avatar?: string | null }
  crew?: { id?: string; title?: string; icon?: string; members?: number }
  store?: { name?: string; address?: string; category?: string }
  terms?: {
    title?: string
    benefit?: string
    discount_pct?: number | null
    conditions?: Record<string, unknown>
    expires_at?: string | null
  }
  message?: string | null
}

type MailResponse = {
  items?: MailItem[]
  counts?: Partial<Record<MailCategory, number>>
  unread_count?: number
}

const FILTERS: { key: MailCategory; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "friend", label: "친구" },
  { key: "crew", label: "크루" },
  { key: "partnership", label: "제휴" },
  { key: "reward", label: "보상" },
  { key: "notice", label: "공지" },
]

function formatWhen(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
  }
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })
}

function conditionText(conditions?: Record<string, unknown>): string {
  if (!conditions) return "제휴 조건은 가게 안내를 따라요."
  const parts: string[] = []
  const days = conditions.days
  if (Array.isArray(days) && days.length > 0) {
    const names: Record<string, string> = { mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일" }
    parts.push(days.map((day) => names[String(day)] || String(day)).join("·"))
  }
  if (conditions.time_from || conditions.time_to) {
    parts.push(`${String(conditions.time_from || "")}~${String(conditions.time_to || "")}`)
  }
  if (conditions.min_party) parts.push(`${String(conditions.min_party)}인 이상`)
  if (conditions.max_members) parts.push(`크루 ${String(conditions.max_members)}명까지`)
  if (conditions.monthly_uses) parts.push(`월 ${String(conditions.monthly_uses)}회`)
  return parts.length > 0 ? parts.join(" · ") : "제휴 조건은 가게 안내를 따라요."
}

function iconFor(item: MailItem): { icon: LucideIcon; background: string; color: string } {
  if (item.category === "friend") return { icon: UserPlus, background: "#fff3d8", color: "#d58216" }
  if (item.category === "partnership") return { icon: Handshake, background: "#f2edff", color: "#6750bd" }
  if (item.category === "reward") return { icon: Gift, background: "#eaf8ef", color: "#27834d" }
  if (item.category === "notice") return { icon: Bell, background: "#eef4ff", color: "#5374bd" }
  if (item.is_group || item.category === "crew") return { icon: Users, background: "#fff0e7", color: "#d36f32" }
  return { icon: MessageCircle, background: "#f2f4f7", color: "#667085" }
}

function MailCard({
  item,
  onOpen,
  onAcceptFriend,
  busy,
}: {
  item: MailItem
  onOpen: (item: MailItem) => void
  onAcceptFriend: (item: MailItem) => void
  busy: string | null
}) {
  const { icon: Icon, background, color } = iconFor(item)
  const isFriendRequest = item.type === "friend_request"
  const isPartnership = item.category === "partnership"
  const isConversation = item.type === "conversation"
  const isReward = item.category === "reward"

  return (
    <article
      className={`rounded-[24px] border bg-white p-4 shadow-[0_5px_18px_rgba(74,52,35,0.04)] ${
        item.is_unread ? "border-[#f0d6a6]" : "border-[#eee7df]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background }}>
          <Icon className="h-[19px] w-[19px]" style={{ color }} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-[14px] font-extrabold text-[#342921]">{item.title}</h2>
                {item.is_unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e58b22]" aria-label="읽지 않음" />}
              </div>
              <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#8c796a]">{item.preview}</p>
            </div>
            <span className="shrink-0 text-[10px] text-[#b2a296]">{formatWhen(item.created_at)}</span>
          </div>

          {item.category === "partnership" && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
              <span className="rounded-full bg-[#f7f0e8] px-2 py-1 text-[#856b59]">{item.crew?.title || "우리 크루"}</span>
              {item.status_label && (
                <span className={`rounded-full px-2 py-1 ${item.can_respond ? "bg-[#fff3d8] text-[#a76712]" : "bg-[#edf7ef] text-[#3f8054]"}`}>
                  {item.status_label}
                </span>
              )}
            </div>
          )}

          {item.category === "reward" && (
            <span className="mt-3 inline-flex rounded-full bg-[#edf7ef] px-2 py-1 text-[10px] font-bold text-[#3f8054]">수령 완료</span>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            {isFriendRequest ? (
              <button
                type="button"
                onClick={() => onAcceptFriend(item)}
                disabled={busy === item.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#342921] px-3.5 py-2 text-[11px] font-extrabold text-white disabled:opacity-50"
              >
                {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                수락하고 대화
              </button>
            ) : isReward ? (
              <span className="text-[11px] font-semibold text-[#8e7a69]">이벤트·활동 기록</span>
            ) : (
              <span className="text-[11px] font-semibold text-[#a18d7d]">
                {isPartnership ? "제휴 조건과 대화를 확인해보세요" : isConversation ? `${item.unread_count || 0}개 안 읽음` : "확인하기"}
              </span>
            )}
            {!isFriendRequest && !isReward && (
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="inline-flex items-center gap-0.5 rounded-full bg-[#fff7e9] px-3 py-2 text-[11px] font-extrabold text-[#a9681b]"
              >
                {isConversation ? "대화 열기" : "자세히 보기"}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function PartnershipDetail({
  item,
  busy,
  onBack,
  onChat,
  onManage,
  onRespond,
}: {
  item: MailItem
  busy: string | null
  onBack: () => void
  onChat: (item: MailItem) => void
  onManage: (item: MailItem) => void
  onRespond: (item: MailItem, action: "accept" | "decline") => void
}) {
  const terms = item.terms || {}
  const isPending = item.status === "pending"
  const storeName = item.store?.name || "제휴 가게"
  const expires = terms.expires_at ? new Date(terms.expires_at).toLocaleDateString("ko-KR") : "별도 안내 시까지"

  return (
    <>
      <header className="border-b border-[#eee7df] bg-[#fbfaf7] px-4 pb-4 pt-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-[12px] font-bold text-[#8b7665]">
          <ArrowLeft className="h-4 w-4" /> 메일로 돌아가기
        </button>
        <div className="mt-5 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f2edff]">
            <Handshake className="h-6 w-6 text-[#6750bd]" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[#a18b7b]">제휴 문의 · {item.crew?.title || "우리 크루"}</p>
            <h1 className="mt-1 truncate text-[22px] font-black tracking-[-0.04em] text-[#342921]">{storeName}</h1>
            <p className="mt-1 text-[12px] text-[#8e7969]">{item.status_label || "제휴 내용을 확인해보세요"}</p>
          </div>
        </div>
      </header>

      <main className="space-y-3 px-4 py-4">
        <section className="rounded-[24px] border border-[#eadfd2] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-[#b0947f]">가게에서 보낸 제안</p>
              <h2 className="mt-1 text-[17px] font-extrabold text-[#342921]">{terms.title || "크루 전용 제휴"}</h2>
            </div>
            {item.can_respond && <span className="rounded-full bg-[#fff3d8] px-2.5 py-1 text-[10px] font-bold text-[#a76712]">답변 필요</span>}
          </div>
          {item.message && (
            <div className="mt-4 rounded-2xl bg-[#fcf6ed] px-3.5 py-3 text-[12px] leading-5 text-[#6e5949]">“{item.message}”</div>
          )}
        </section>

        <section className="rounded-[24px] border border-[#eadfd2] bg-white p-4">
          <h2 className="text-[13px] font-extrabold text-[#342921]">제휴 조건</h2>
          <div className="mt-3 divide-y divide-[#f1ebe5]">
            <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
              <span className="text-[11px] font-semibold text-[#aa9585]">혜택</span>
              <span className="text-right text-[12px] font-extrabold text-[#604937]">{terms.benefit || "가게 안내 혜택"}{terms.discount_pct ? ` (${terms.discount_pct}% 할인)` : ""}</span>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <span className="text-[11px] font-semibold text-[#aa9585]">이용 조건</span>
              <span className="max-w-[70%] text-right text-[12px] font-semibold leading-5 text-[#604937]">{conditionText(terms.conditions)}</span>
            </div>
            <div className="flex items-start justify-between gap-4 py-3 last:pb-0">
              <span className="text-[11px] font-semibold text-[#aa9585]">유효 기간</span>
              <span className="text-right text-[12px] font-semibold text-[#604937]">{expires}</span>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#ded8f8] bg-[#f8f6ff] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#6750bd]"><Users className="h-4 w-4" /></div>
            <div>
              <h2 className="text-[13px] font-extrabold text-[#4c3d91]">크루 대화에서 상의하기</h2>
              <p className="mt-1 text-[11px] leading-5 text-[#7669a8]">제휴 조건을 멤버들과 확인하고 방문 일정을 함께 정해보세요.</p>
            </div>
          </div>
          <button type="button" onClick={() => onChat(item)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#6750bd] py-3 text-[12px] font-extrabold text-white">
            <MessageCircle className="h-4 w-4" /> 크루 대화 열기
          </button>
        </section>

        {isPending ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onRespond(item, "decline")} disabled={busy === item.id} className="rounded-2xl border border-[#e6ddd5] bg-white py-3 text-[12px] font-bold text-[#907a68] disabled:opacity-50">
              <X className="mr-1 inline h-4 w-4 align-[-3px]" /> 거절하기
            </button>
            <button type="button" onClick={() => onRespond(item, "accept")} disabled={busy === item.id} className="rounded-2xl bg-[#342921] py-3 text-[12px] font-extrabold text-white disabled:opacity-50">
              {busy === item.id ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin align-[-3px]" /> : <Check className="mr-1 inline h-4 w-4 align-[-3px]" />} 수락하기
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => onManage(item)} className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[#e6ddd5] bg-white py-3 text-[12px] font-bold text-[#604937]">
            제휴 관리 열기 <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </main>
    </>
  )
}

export default function MailPage() {
  const router = useRouter()
  const [category, setCategory] = useState<MailCategory>("all")
  const [items, setItems] = useState<MailItem[]>([])
  const [counts, setCounts] = useState<Partial<Record<MailCategory, number>>>({})
  const [unreadCount, setUnreadCount] = useState(0)
  const [selected, setSelected] = useState<MailItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const loadInbox = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchWithAuth(`/api/mail/inbox?category=${category}`)
      if (response.status === 401) {
        setError("로그인하면 친구 요청과 제휴 메일을 확인할 수 있어요.")
        setItems([])
        return
      }
      if (!response.ok) throw new Error("mail request failed")
      const data = (await response.json()) as MailResponse
      setItems(Array.isArray(data.items) ? data.items : [])
      setCounts(data.counts || {})
      setUnreadCount(Number(data.unread_count || 0))
    } catch {
      setError("메일을 불러오지 못했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => {
    // 메일 분류가 바뀌면 외부 API와 동기화해야 한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInbox()
  }, [loadInbox])

  const openChat = useCallback((item: MailItem) => {
    const roomId = item.room_id || item.conversation_room_id
    if (!roomId) return
    router.push(`/chats?room=${encodeURIComponent(roomId)}&title=${encodeURIComponent(item.title)}`)
  }, [router])

  const openItem = async (item: MailItem) => {
    if (item.category === "partnership") {
      setSelected(item)
      if (item.app_id && item.is_unread) {
        fetchWithAuth(`/api/mail/partnership/${item.app_id}/read`, { method: "POST" }).catch(() => {})
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_unread: false, unread: false } : entry))
        setUnreadCount((current) => Math.max(0, current - 1))
      }
      return
    }
    if (item.type === "conversation") openChat(item)
  }

  const acceptFriend = async (item: MailItem) => {
    if (!item.request_id) return
    setBusy(item.id)
    try {
      const response = await fetchWithAuth(`/api/mail/friend/${item.request_id}/accept`, { method: "POST" })
      if (!response.ok) throw new Error("friend accept failed")
      const data = await response.json()
      if (data.room_id) {
        router.push(`/chats?room=${encodeURIComponent(String(data.room_id))}&title=${encodeURIComponent(data.title || item.requester?.name || "친구 대화")}`)
      } else {
        await loadInbox()
      }
    } catch {
      setError("친구 요청을 처리하지 못했어요.")
    } finally {
      setBusy(null)
    }
  }

  const respondPartnership = async (item: MailItem, action: "accept" | "decline") => {
    if (!item.app_id) return
    setBusy(item.id)
    try {
      const response = await fetchWithAuth(`/api/crew-partnerships/${item.app_id}/respond`, {
        method: "POST",
        body: JSON.stringify({ action }),
      })
      if (!response.ok) throw new Error("partnership response failed")
      setSelected(null)
      await loadInbox()
    } catch {
      setError("제휴 응답을 저장하지 못했어요.")
    } finally {
      setBusy(null)
    }
  }

  const headerSubtitle = useMemo(() => {
    if (unreadCount > 0) return `읽지 않은 소식 ${unreadCount}개`
    return "친구·크루·제휴 소식을 한곳에서 확인해요"
  }, [unreadCount])

  if (selected?.category === "partnership") {
    return (
      <div className="mx-auto min-h-[100dvh] max-w-md bg-[#fbfaf7] pb-24 text-[#342921]">
        <PartnershipDetail item={selected} busy={busy} onBack={() => setSelected(null)} onChat={(item) => {
          openChat(item)
        }} onManage={(item) => {
          if (item.community_id) router.push(`/crew/${encodeURIComponent(String(item.community_id))}/partnerships`)
        }} onRespond={respondPartnership} />
        <TabBar />
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-[#fbfaf7] pb-24 text-[#342921]">
      <header className="sticky top-0 z-10 border-b border-[#eee7df] bg-[#fbfaf7]/95 px-4 pb-3 pt-5 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.08em] text-[#b3947d]">RENDEZVOUS INBOX</p>
            <h1 className="mt-1 text-[25px] font-black tracking-[-0.05em] text-[#342921]">메일</h1>
            <p className="mt-1 text-[12px] text-[#917d6d]">{headerSubtitle}</p>
          </div>
          <div className="relative mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
            <MailIcon className="h-5 w-5 text-[#d6821d]" />
            {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e47754] px-1 text-[10px] font-black text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </div>
        </div>
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((filter) => {
            const active = category === filter.key
            const count = counts[filter.key] || 0
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => { setCategory(filter.key); setSelected(null) }}
                className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-extrabold transition ${active ? "bg-[#342921] text-white" : "bg-white text-[#9b8878]"}`}
              >
                {filter.label}{count > 0 && <span className={`ml-1 ${active ? "text-[#ffd98c]" : "text-[#d58a32]"}`}>{count}</span>}
              </button>
            )
          })}
        </div>
      </header>

      <main className="px-4 py-4">
        {error && (
          <div className="mb-3 rounded-2xl border border-[#f1d4c8] bg-[#fff5f1] px-4 py-3 text-[12px] leading-5 text-[#ae5d45]">
            {error}
            {error.startsWith("로그인") && <button type="button" onClick={() => router.push("/login")} className="ml-2 font-extrabold underline">로그인하기</button>}
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="space-y-3" aria-label="메일 불러오는 중">
            {[1, 2, 3].map((index) => <div key={index} className="h-[145px] animate-pulse rounded-[24px] bg-[#f1e8df]" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[#dfd2c6] bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff3d8] text-[#d58216]"><Inbox className="h-6 w-6" /></div>
            <h2 className="mt-4 text-[15px] font-extrabold text-[#604937]">새 메일이 없어요</h2>
            <p className="mt-2 text-[12px] leading-5 text-[#a18d7d]">친구 요청·제휴 문의·이벤트 보상이 도착하면<br />이곳에 차곡차곡 쌓여요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-[12px] font-extrabold text-[#765f4e]">받은 소식</p>
              <p className="text-[10px] font-semibold text-[#b19c8c]">{items.length}개</p>
            </div>
            {items.map((item) => <MailCard key={item.id} item={item} onOpen={openItem} onAcceptFriend={acceptFriend} busy={busy} />)}
          </div>
        )}
      </main>
      <TabBar />
    </div>
  )
}
