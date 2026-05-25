"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MessageCircle, Send, Check, Loader2 } from "lucide-react"
import { useFriends, shareToFriends, type ShareItem } from "@/hooks/use-friends"
import { shareRecommendation, appOrigin } from "@/lib/kakao"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  regionName?: string
  places: any[]
}

export function ShareRecommendationDialog({ open, onOpenChange, regionName, places }: Props) {
  const { friends } = useFriends()
  const [selected, setSelected] = useState<number[]>([])
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState("")

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const showToast = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(""), 4000)
  }

  const handleKakao = async () => {
    const { result } = await shareRecommendation({
      regionName,
      places: (places || []).map((p) => ({ name: p.name, category: p.category, address: p.address })),
      link: appOrigin(),
    })
    if (result === "kakao") showToast("카카오톡 공유창을 열었어요.")
    else if (result === "shared") showToast("공유 시트를 열었어요.")
    else if (result === "copied") showToast("추천 내용을 복사했어요! 붙여넣어 공유하세요.")
    else showToast("이 환경에선 공유가 어려워요.")
  }

  const handleSendToFriends = async () => {
    if (selected.length === 0) {
      showToast("보낼 친구를 선택해주세요.")
      return
    }
    setSending(true)
    try {
      const items: ShareItem[] = (places || []).slice(0, 5).map((p) => ({
        type: "place",
        id: p.id,
        name: p.name,
        category: p.category,
        address: p.address,
        content: Array.isArray(p.tags) && p.tags.length ? p.tags.slice(0, 3).join(", ") : undefined,
      }))
      await shareToFriends({
        friend_ids: selected,
        message: regionName ? `${regionName} 어때?` : "이 장소들 어때?",
        items,
      })
      showToast(`${selected.length}명에게 보냈어요! 채팅에서 확인할 수 있어요.`)
      setSelected([])
      setTimeout(() => onOpenChange(false), 1200)
    } catch {
      showToast("공유에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm rounded-3xl font-['Pretendard']">
        <DialogHeader>
          <DialogTitle>추천 공유하기</DialogTitle>
          <DialogDescription className="text-xs">
            {regionName ? `'${regionName}'` : "추천 장소"}를 친구에게 공유해보세요.
          </DialogDescription>
        </DialogHeader>

        {toast && (
          <div className="text-xs text-[#7C3AED] bg-purple-50 rounded-lg px-3 py-2">{toast}</div>
        )}

        <Button
          onClick={handleKakao}
          className="w-full bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold rounded-xl h-11"
        >
          <MessageCircle className="w-5 h-5 mr-2 fill-black" /> 카카오톡으로 공유
        </Button>

        <div className="my-1 flex items-center gap-3 text-[11px] text-gray-400">
          <div className="h-px flex-1 bg-gray-200" />
          <span>또는 앱 친구에게 보내기</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <div className="max-h-[40vh] overflow-y-auto space-y-1">
          {friends.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">
              아직 친구가 없어요. 마이페이지에서 친구를 추가해보세요.
            </div>
          ) : (
            friends.map((f) => {
              const on = selected.includes(f.id)
              return (
                <div
                  key={f.id}
                  onClick={() => toggle(f.id)}
                  className={`flex items-center justify-between p-2 rounded-xl cursor-pointer border ${
                    on ? "border-[#7C3AED] bg-purple-50" : "border-transparent hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-purple-50 text-[#7C3AED] text-xs font-bold">
                        {f.name?.[0] || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-sm font-medium text-gray-800">{f.name}</div>
                  </div>
                  {on && <Check className="w-4 h-4 text-[#7C3AED]" />}
                </div>
              )
            })
          )}
        </div>

        <Button
          onClick={handleSendToFriends}
          disabled={sending || friends.length === 0}
          className="w-full bg-[#7C3AED] hover:bg-purple-700 text-white font-bold rounded-xl h-11"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" /> 선택한 친구에게 보내기
              {selected.length > 0 ? ` (${selected.length})` : ""}
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
