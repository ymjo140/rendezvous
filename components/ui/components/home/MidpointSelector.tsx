import React from "react"
import { MapPin, Trash2, Users, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

type MidpointSelectorProps = {
  includeMe: boolean
  myLocationInput: string
  selectedFriends: any[]
  manualInputs: { text: string; lat?: number; lng?: number }[]
  onToggleFriend: (friend: any) => void
  onManualInputChange: (idx: number, value: string) => void
  onManualSelect: (idx: number, place: any) => void
  onRemoveManualInput: (idx: number) => void
  onAddManualInput: () => void
  onOpenFriendModal: () => void
  onIncludeMeChange: (value: boolean) => void
  onSearch: () => void
  PlaceAutocompleteComponent: React.ComponentType<{
    value: string
    onChange: (value: string) => void
    onSelect: (place: any) => void
    placeholder: string
  }>
}

export const MidpointSelector = ({
  includeMe,
  myLocationInput,
  selectedFriends,
  manualInputs,
  onToggleFriend,
  onManualInputChange,
  onManualSelect,
  onRemoveManualInput,
  onAddManualInput,
  onOpenFriendModal,
  onIncludeMeChange,
  onSearch,
  PlaceAutocompleteComponent,
}: MidpointSelectorProps) => {
  return (
    <div className="absolute bottom-4 left-4 right-4 bg-white rounded-3xl p-5 shadow-lg border border-gray-100 z-20">
      <h2 className="text-lg font-bold mb-3">Where are you meeting?</h2>
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {includeMe && (
          <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl">
            <span className="text-xl">Me</span>
            <span className="flex-1 text-sm">{myLocationInput}</span>
            <button onClick={() => onIncludeMeChange(false)}>
              <Trash2 className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        )}
        {selectedFriends.map((f) => (
          <div key={f.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl">
            <Avatar className="w-8 h-8">
              <AvatarFallback>{f.name[0]}</AvatarFallback>
            </Avatar>
            <span className="flex-1 text-sm">{f.name}</span>
            <button onClick={() => onToggleFriend(f)}>
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        ))}
        {manualInputs.map((val, i) => (
          <div key={i} className="flex items-start gap-3 p-2 bg-gray-50 rounded-xl relative z-50">
            <MapPin className="w-5 h-5 text-gray-400 mt-1.5" />
            <div className="flex-1">
              <PlaceAutocompleteComponent
                value={val.text}
                onChange={(v) => onManualInputChange(i, v)}
                onSelect={(place) => onManualSelect(i, place)}
                placeholder="Enter a place (e.g., Gangnam)"
              />
            </div>
            <button onClick={() => onRemoveManualInput(i)} className="mt-1">
              <Trash2 className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button variant="outline" onClick={onOpenFriendModal}>
          <Users className="w-4 h-4 mr-2" />Friends
        </Button>
        <Button variant="outline" onClick={onAddManualInput}>
          <Plus className="w-4 h-4 mr-2" />Add place
        </Button>
      </div>
      {!includeMe && (
        <button onClick={() => onIncludeMeChange(true)} className="text-xs text-gray-500 mt-2 underline w-full">
          + Add my location
        </button>
      )}
      <Button
        className="w-full mt-3 h-12 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold"
        onClick={onSearch}
      >
        Find midpoint
      </Button>
    </div>
  )
}
