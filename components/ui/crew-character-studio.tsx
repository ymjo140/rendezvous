"use client"

import { useMemo, useState } from "react"
import { Check, Save, ShoppingBag } from "lucide-react"
import { CrewAvatar } from "@/components/ui/crew-avatar"
import { fetchWithAuth } from "@/lib/api-client"
import {
  CREW_AVATARS,
  normalizeCrewAvatarId,
  normalizeCrewGender,
  type CrewAvatarId,
  type CrewGender,
} from "@/lib/crew-avatars"

type CrewCharacterStudioProps = {
  userId: number
  userName: string
  gender?: string | null
  avatarId?: string | null
  onSaved: (data: { gender: string; avatarId: CrewAvatarId }) => void
}

const GENDER_OPTIONS: Array<{ value: CrewGender; label: string }> = [
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
  { value: "other", label: "기타" },
]

function defaultAvatarFor(gender: CrewGender): CrewAvatarId {
  if (gender === "female") return "female-brown-short"
  if (gender === "other") return "male-black-short"
  return "male-black-short"
}

export function CrewCharacterStudio({
  userId,
  userName,
  gender,
  avatarId,
  onSaved,
}: CrewCharacterStudioProps) {
  const catalog = useMemo(() => Object.values(CREW_AVATARS), [])
  const initialGender = normalizeCrewGender(gender)
  const initialAvatar = normalizeCrewAvatarId(avatarId)
  const initialSelection = initialAvatar && (
    initialGender === "unknown" ||
    initialGender === "other" ||
    CREW_AVATARS[initialAvatar].gender === initialGender
  ) ? initialAvatar : defaultAvatarFor(initialGender)

  const [selectedGender, setSelectedGender] = useState<CrewGender>(initialGender)
  const [selectedAvatar, setSelectedAvatar] = useState<CrewAvatarId>(initialSelection)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const visibleCatalog = selectedGender === "male" || selectedGender === "female"
    ? catalog.filter((item) => item.gender === selectedGender)
    : catalog
  const chooseGender = (next: CrewGender) => {
    setSelectedGender(next)
    const current = CREW_AVATARS[selectedAvatar]
    if ((next === "male" || next === "female") && current.gender !== next) {
      const first = catalog.find((item) => item.gender === next)
      if (first) setSelectedAvatar(first.id)
    }
    setSavedMessage(null)
  }

  const chooseAvatar = (next: CrewAvatarId) => {
    const definition = CREW_AVATARS[next]
    setSelectedAvatar(next)
    if (selectedGender === "unknown" || selectedGender === "other") {
      setSelectedGender(definition.gender)
    }
    setSavedMessage(null)
  }

  const handleSave = async () => {
    if (selectedGender === "unknown" || saving) {
      setSavedMessage("성별을 먼저 선택해주세요.")
      return
    }
    setSaving(true)
    setSavedMessage(null)
    try {
      const res = await fetchWithAuth("/api/users/me/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender: selectedGender, avatar_id: selectedAvatar }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail.detail || "캐릭터 설정을 저장하지 못했어요.")
      }
      const data = await res.json()
      const savedAvatar = normalizeCrewAvatarId(data.avatar_id) || selectedAvatar
      setSelectedAvatar(savedAvatar)
      setSavedMessage("저장했어요. 크루 화면에도 곧 반영됩니다.")
      onSaved({ gender: data.gender || selectedGender, avatarId: savedAvatar })
    } catch (error) {
      setSavedMessage(error instanceof Error ? error.message : "저장에 실패했어요.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-5 mb-3 overflow-hidden rounded-3xl border border-[#eadbc7] bg-[#fffaf2] shadow-sm">
      <div className="border-b border-[#f0e5d8] bg-gradient-to-br from-[#fff8ec] to-[#f7efe6] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.14em] text-[#b17b4f]">MY CREW CHARACTER</p>
            <h3 className="mt-1 text-[18px] font-black tracking-[-0.04em] text-[#3e2c20]">내 캐릭터 설정</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-[#90745d]">
              {userName}님의 성별과 외형을 직접 고르면<br />모든 크루 화면에서 같은 캐릭터로 보여요.
            </p>
          </div>
          <div className="flex h-28 w-24 shrink-0 items-end justify-center overflow-hidden rounded-2xl border border-white/80 bg-[#ead8c1] shadow-inner">
            <CrewAvatar
              memberId={userId}
              avatarId={selectedAvatar}
              gender={selectedGender}
              name={userName}
              size="lg"
              mode="full"
              className="h-28 w-20"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-[#eadfd2] p-1">
          {GENDER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => chooseGender(option.value)}
              className={`rounded-xl px-2 py-2 text-[11px] font-bold transition-colors ${
                selectedGender === option.value
                  ? "bg-white text-[#8a542c] shadow-sm"
                  : "text-[#a4876b] hover:bg-white/60"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#4b382b]">
              <ShoppingBag className="h-4 w-4 text-[#d58b35]" /> 캐릭터 상점
            </div>
            <p className="mt-1 text-[10px] text-[#a4876b]">검정·갈색·노랑 머리와 짧은 머리·파마·장발을 골라보세요.</p>
          </div>
          <span className="rounded-full bg-[#fff1c9] px-2 py-1 text-[9px] font-bold text-[#b27421]">6종 무료</span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {visibleCatalog.map((item) => {
            const selected = item.id === selectedAvatar
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseAvatar(item.id)}
                className={`relative flex min-w-0 flex-col items-center rounded-2xl border px-1.5 pb-2 pt-2 text-center transition-all ${
                  selected
                    ? "border-[#d58b35] bg-[#fff5df] ring-2 ring-[#f3c878]/50"
                    : "border-[#eee2d4] bg-white hover:border-[#e2c49c]"
                }`}
              >
                {selected && <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#d58b35] text-white"><Check className="h-2.5 w-2.5" /></span>}
                <CrewAvatar memberId={userId} avatarId={item.id} gender={item.gender} name={item.label} size="md" mode="full" className="h-24 w-16" />
                <span className="mt-1 line-clamp-2 min-h-[24px] text-[9px] font-semibold leading-tight text-[#725942]">{item.hairColor === "black" ? "검정" : item.hairColor === "brown" ? "갈색" : "노랑"} · {item.hairstyle === "short" ? "짧은 머리" : item.hairstyle === "perm" ? "파마" : item.hairstyle === "long" ? "장발" : "단발"}</span>
                <span className="mt-1 text-[8px] font-bold text-[#c58b4b]">무료 · 선택</span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-[#e6d4bf] bg-[#fffaf5] p-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-[#c78439]" />
            <div className="text-[12px] font-bold text-[#5f4635]">상점 이용 안내</div>
            <span className="ml-auto rounded-full bg-[#fff1c9] px-2 py-1 text-[9px] font-bold text-[#b27421]">무료 보유</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-[#9b8068]">
            지금 보이는 6종은 모두 무료로 바로 장착할 수 있어요. 선택 후 저장하면 내 크루와 프로필에 즉시 반영됩니다. 헤어·의상·소품은 다음 컬렉션으로 확장합니다.
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#3f3027] px-3 py-2.5 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-[#2f241e] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" /> {saving ? "저장 중..." : "캐릭터 저장"}
          </button>
          {savedMessage && <span className="max-w-[48%] text-[9px] leading-snug text-[#8d6d52]">{savedMessage}</span>}
        </div>
      </div>
    </section>
  )
}
