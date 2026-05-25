"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchWithAuth } from "@/lib/api-client"

export type Friend = {
  id: number
  name: string
  email?: string
  location?: { lat: number; lng: number }
  avatar?: { equipped?: Record<string, string | null> }
}

export type FriendRequestItem = {
  id: number
  requester_name: string
  requester_email: string
}

export type FriendSearchResult = {
  id: number
  name: string
  location_name?: string
  status: "none" | "pending" | "accepted"
}

type FriendsResponse = { friends: Friend[]; requests: FriendRequestItem[] }

export function useFriends() {
  const qc = useQueryClient()

  const query = useQuery<FriendsResponse>({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/friends")
      if (!res.ok) throw new Error("친구 목록을 불러오지 못했습니다.")
      const data = await res.json()
      return {
        friends: Array.isArray(data?.friends) ? data.friends : [],
        requests: Array.isArray(data?.requests) ? data.requests : [],
      }
    },
    staleTime: 30 * 1000,
    retry: 1,
  })

  const requestById = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetchWithAuth("/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      })
      if (!res.ok) throw new Error("친구 요청에 실패했습니다.")
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }),
  })

  const accept = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await fetchWithAuth("/api/friends/accept", {
        method: "POST",
        body: JSON.stringify({ request_id: requestId }),
      })
      if (!res.ok) throw new Error("수락에 실패했습니다.")
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }),
  })

  return {
    friends: query.data?.friends ?? [],
    requests: query.data?.requests ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    requestById,
    accept,
  }
}

export async function searchUsers(q: string): Promise<FriendSearchResult[]> {
  const trimmed = q.trim()
  if (!trimmed) return []
  const res = await fetchWithAuth(`/api/friends/search?q=${encodeURIComponent(trimmed)}`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export type ShareItem = {
  type: "place" | "post"
  id?: number | string
  name?: string
  category?: string
  address?: string
  image?: string | null
  content?: string
}

export async function shareToFriends(payload: {
  friend_ids?: number[]
  room_id?: string
  message?: string
  items: ShareItem[]
}) {
  const res = await fetchWithAuth("/api/chat/share", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error("공유에 실패했습니다.")
  return res.json()
}

/** 카톡 초대링크 referral 처리: 로그인 직후 호출. */
export async function linkReferral(inviterId: number) {
  const res = await fetchWithAuth("/api/friends/link-referral", {
    method: "POST",
    body: JSON.stringify({ inviter_id: inviterId }),
  })
  if (!res.ok) throw new Error("초대 연결 실패")
  return res.json()
}
