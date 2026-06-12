"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { UserPlus, Search, Check, Loader2, Users } from "lucide-react"
import { useFriends, searchUsers, type FriendSearchResult } from "@/hooks/use-friends"
import { shareInvite } from "@/lib/kakao"

export function FriendsPanel({ myId, myName }: { myId?: number; myName?: string }) {
  const { friends, requests, isLoading, requestById, accept } = useFriends()
  const [q, setQ] = useState("")
  const [results, setResults] = useState<FriendSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [requestedIds, setRequestedIds] = useState<number[]>([])
  const [toast, setToast] = useState("")

  useEffect(() => {
    if (q.trim().length < 1) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        setResults(await searchUsers(q))
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(""), 4000)
  }

  const handleAdd = async (u: FriendSearchResult) => {
    try {
      await requestById.mutateAsync(u.id)
      setRequestedIds((prev) => [...prev, u.id])
      showToast(`${u.name}님에게 친구 요청을 보냈어요.`)
    } catch {
      alert("친구 요청에 실패했어요.")
    }
  }

  const handleInvite = async () => {
    if (!myId) {
      alert("로그인이 필요해요.")
      return
    }
    const { result } = await shareInvite({ inviterId: myId, inviterName: myName })
    if (result === "kakao") showToast("카카오톡 공유창을 열었어요.")
    else if (result === "shared") showToast("공유 시트를 열었어요.")
    else if (result === "copied") showToast("초대 링크를 복사했어요! 카톡 등에 붙여넣어 보내세요.")
    else showToast("이 환경에선 공유가 어려워요. 링크를 직접 복사해 주세요.")
  }

  return (
    <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
      <CardContent className="p-5 space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center text-[#F5A623]">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-800">내 친구</div>
              <div className="text-xs text-gray-400">{friends.length}명</div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleInvite}
            className="bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold rounded-xl h-9 text-xs shadow-sm"
          >
            <UserPlus className="w-4 h-4 mr-1" /> 카톡으로 초대
          </Button>
        </div>

        {toast && (
          <div className="text-xs text-[#F5A623] bg-amber-50 rounded-lg px-3 py-2">{toast}</div>
        )}

        {/* 친구 검색/추가 */}
        <div className="relative">
          <div className="flex items-center border rounded-xl px-3 bg-gray-50 focus-within:border-[#F5A623] focus-within:ring-1 focus-within:ring-[#F5A623]/20 transition-all">
            <Search className="w-4 h-4 text-gray-400 mr-2" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름으로 친구 검색"
              className="border-none bg-transparent h-10 text-sm focus-visible:ring-0 placeholder:text-gray-400"
            />
            {searching && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          </div>
          {results.length > 0 && (
            <div className="mt-2 space-y-1 bg-white rounded-xl border border-gray-100">
              {results.map((u) => {
                const already = u.status === "accepted"
                const pending = u.status === "pending" || requestedIds.includes(u.id)
                return (
                  <div key={u.id} className="flex items-center justify-between p-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-amber-50 text-[#F5A623] text-xs font-bold">
                          {u.name?.[0] || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{u.name}</div>
                        {u.location_name && (
                          <div className="text-[10px] text-gray-400 truncate">{u.location_name}</div>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={already || pending}
                      onClick={() => handleAdd(u)}
                      className={
                        already || pending
                          ? "bg-gray-100 text-gray-400 h-8 text-xs"
                          : "bg-[#F5A623] hover:bg-amber-700 h-8 text-xs"
                      }
                    >
                      {already ? "친구" : pending ? "요청됨" : "추가"}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 받은 친구 요청 */}
        {requests.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-500">받은 요청 {requests.length}</div>
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-amber-50 rounded-xl p-2.5">
                <div className="flex items-center gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-amber-100 text-amber-700 text-xs font-bold">
                      {r.requester_name?.[0] || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-sm font-medium text-gray-800">{r.requester_name}</div>
                </div>
                <Button
                  size="sm"
                  onClick={() => accept.mutate(r.id)}
                  disabled={accept.isPending}
                  className="bg-[#14B8A6] hover:bg-teal-600 h-8 text-xs"
                >
                  <Check className="w-3 h-3 mr-1" /> 수락
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* 친구 목록 */}
        {isLoading ? (
          <div className="py-6 text-center text-xs text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" /> 불러오는 중...
          </div>
        ) : friends.length > 0 ? (
          <div className="space-y-1">
            {friends.map((f) => (
              <div key={f.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50">
                <Avatar className="w-9 h-9">
                  <AvatarFallback className="bg-amber-50 text-[#F5A623] text-xs font-bold">
                    {f.name?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="text-sm font-medium text-gray-800">{f.name}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center space-y-1">
            <div className="text-sm font-bold text-gray-700">아직 친구가 없어요</div>
            <div className="text-xs text-gray-400">카톡으로 초대하거나 이름으로 검색해 추가해보세요!</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
