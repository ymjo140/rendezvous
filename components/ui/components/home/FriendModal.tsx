import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CheckCircle2 } from "lucide-react"

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
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add friends</DialogTitle>
          <DialogDescription className="hidden">Select friends to include.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {aiPersonas.map((f) => (
            <div
              key={f.id}
              onClick={() => onToggleFriend(f)}
              className="flex items-center gap-3 p-2 hover:bg-gray-50 cursor-pointer border rounded-lg"
            >
              <Avatar>
                <AvatarFallback>{f.name[0]}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-bold">{f.name}</div>
                <div className="text-xs text-gray-500">{f.locationName}</div>
              </div>
              {selectedFriends.find((sf) => sf.id === f.id) && (
                <CheckCircle2 className="ml-auto w-4 h-4 text-purple-600" />
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
