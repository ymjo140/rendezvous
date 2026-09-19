"use client"

import Image from "next/image"
import {
  avatarIdForMember,
  CREW_AVATARS,
  normalizeCrewPoseId,
  type CrewAvatarId,
  type CrewPoseId,
} from "@/lib/crew-avatars"

type CrewAvatarProps = {
  memberId: number
  avatarId?: string | null
  gender?: string | null
  name?: string
  poseId?: string | null
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
  poseId,
  size = "sm",
  mode = "portrait",
  className = "",
}: CrewAvatarProps) {
  const selectedId: CrewAvatarId = avatarIdForMember(memberId, avatarId, gender)
  const avatar = CREW_AVATARS[selectedId]
  const selectedPose: CrewPoseId = normalizeCrewPoseId(poseId)
  const poseClass = mode === "full" ? POSE_CLASS[selectedPose] : ""
  const boxClass = [
    "relative shrink-0",
    SIZE_CLASS[size],
    mode === "portrait"
      ? "block overflow-hidden rounded-full bg-slate-50 ring-1 ring-white"
      : "flex items-end justify-center overflow-visible",
    poseClass,
    className,
  ].filter(Boolean).join(" ")

  const imageProps = {
    src: avatar.src,
    alt: name ? name + " 아바타" : avatar.label,
    sizes: size === "lg" ? "144px" : size === "md" ? "112px" : "44px",
    priority: size === "lg",
  }

  return (
    <span
      className={boxClass}
      data-avatar-id={selectedId}
      data-avatar-gender={gender || "unknown"}
      data-pose-id={selectedPose}
    >
      {mode === "portrait" ? (
      <Image
        {...imageProps}
        alt={imageProps.alt}
        fill
        className="object-cover object-top [image-rendering:pixelated]"
      />
      ) : (
        <Image
          {...imageProps}
          alt={imageProps.alt}
          width={avatar.width}
          height={avatar.height}
          className="h-full w-auto max-w-none object-contain object-bottom [image-rendering:pixelated]"
        />
      )}
    </span>
  )
}

const POSE_CLASS: Record<CrewPoseId, string> = {
  stand: "",
  wave: "crew-pose-wave",
  bread: "crew-pose-bread",
  heart: "crew-pose-heart",
}
