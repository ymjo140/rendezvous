"use client"

import Image from "next/image"
import { avatarIdForMember, CREW_AVATARS, type CrewAvatarId } from "@/lib/crew-avatars"

type CrewAvatarProps = {
  memberId: number
  avatarId?: string | null
  gender?: string | null
  name?: string
  size?: "sm" | "md" | "lg"
  mode?: "portrait" | "full"
  className?: string
}

const SIZE_CLASS = {
  sm: "h-11 w-11",
  md: "h-24 w-16",
  lg: "h-36 w-24",
} as const

export function CrewAvatar({
  memberId,
  avatarId,
  gender,
  name,
  size = "sm",
  mode = "portrait",
  className = "",
}: CrewAvatarProps) {
  const selectedId: CrewAvatarId = avatarIdForMember(memberId, avatarId, gender)
  const avatar = CREW_AVATARS[selectedId]
  const boxClass = [
    "relative block shrink-0 overflow-hidden",
    SIZE_CLASS[size],
    mode === "portrait" ? "rounded-full bg-slate-50 ring-1 ring-white" : "",
    className,
  ].filter(Boolean).join(" ")

  return (
    <span className={boxClass} data-avatar-id={selectedId} data-avatar-gender={gender || "unknown"}>
      <Image
        src={avatar.src}
        alt={name ? name + " 아바타" : avatar.label}
        fill
        sizes={size === "lg" ? "96px" : size === "md" ? "64px" : "44px"}
        className={`${mode === "portrait" ? "object-cover object-top" : "object-contain object-bottom"} [image-rendering:pixelated]`}
        priority={size === "lg"}
      />
    </span>
  )
}
