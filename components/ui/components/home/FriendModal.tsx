"use client"

import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CheckCircle2 } from "lucide-react"
import { useFriends } from "@/hooks/use-friends"

type FriendModalProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  aiPersonas: any[]
  selectedFriends: any[]
  onToggleFriend: (friend: any) => void
}

export const FriendModal = ({
  isOpen,
  onOpenChange,
  aiPersonas,
  selectedFriends,
  onToggleFriend,
}: FriendModalProps) => {
  const { friends } = useFriends()
  const isSelected = (id: any) => selectedFriends.some((sf) => sf.id === id)

  const Row = ({ f }: { f: any }) => (
    <div
      onClick={() => onToggleFriend(f)}
      className="flex items-center gap-3 p-2 hover:bg-gray-50 cursor-pointer border rounded-lg"
    >
      <Avatar>
        <AvatarFallback className="bg-amber-50 text-[#F5A623] font-bold">
          {f.name?.[0] || "?"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="font-bold truncate">{f.name}</div>
        <div className="text-xs text-gray-500 truncate">{f.locationName || "내 친구"}</div>
      </div>
      {isSelected(f.id) && <CheckCircle2 className="ml-auto w-4 h-4 text-amber-600" />}
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>친구 선택</DialogTitle>
          <DialogDescription className="hidden">함께 만날 친구를 선택하세요.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {/* 실제 친구 (마이페이지에서 추가/초대) */}
          {friends.length > 0 ? (
            <>
              <div className="text-xs font-bold text-gray-500 px-1">내 친구</div>
              {friends.map((f) => (
                <Row
                  key={`fr-${f.id}`}
                  f={{ id: f.id, name: f.name, location: f.location, locationName: "내 친구" }}
                />
              ))}
            </>
          ) : (
            <div className="text-xs text-gray-400 px-1 py-2 bg-gray-50 rounded-lg">
              아직 추가한 친구가 없어요. 마이페이지에서 카톡으로 초대하거나 검색해 추가해보세요.
            </div>
          )}

          {/* 예시 친구 (위치 데모용) */}
          {aiPersonas?.length > 0 && (
            <>
              <div className="text-xs font-bold text-gray-400 px-1 pt-2">예시 친구 (위치 데모)</div>
              {aiPersonas.map((f) => (
                <Row key={`ai-${f.id}`} f={f} />
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
