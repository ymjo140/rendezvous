export type CrewAvatarId =
  | "black-short"
  | "yellow-perm"
  | "brown-short"
  | "black-long"
  | "yellow-short"
  | "brown-bob"

export type CrewAvatarDefinition = {
  id: CrewAvatarId
  label: string
  hairColor: "black" | "brown" | "yellow"
  hairstyle: "short" | "perm" | "long" | "bob"
  src: string
}

export const CREW_AVATARS: Record<CrewAvatarId, CrewAvatarDefinition> = {
  "black-short": {
    id: "black-short",
    label: "검정 짧은 머리",
    hairColor: "black",
    hairstyle: "short",
    src: "/crew/avatars/crew-avatar-black-short.png",
  },
  "yellow-perm": {
    id: "yellow-perm",
    label: "노랑 파마",
    hairColor: "yellow",
    hairstyle: "perm",
    src: "/crew/avatars/crew-avatar-yellow-perm.png",
  },
  "brown-short": {
    id: "brown-short",
    label: "갈색 짧은 머리",
    hairColor: "brown",
    hairstyle: "short",
    src: "/crew/avatars/crew-avatar-brown-short.png",
  },
  "black-long": {
    id: "black-long",
    label: "검정 장발",
    hairColor: "black",
    hairstyle: "long",
    src: "/crew/avatars/crew-avatar-black-long.png",
  },
  "yellow-short": {
    id: "yellow-short",
    label: "노랑 짧은 머리",
    hairColor: "yellow",
    hairstyle: "short",
    src: "/crew/avatars/crew-avatar-yellow-short.png",
  },
  "brown-bob": {
    id: "brown-bob",
    label: "갈색 단발",
    hairColor: "brown",
    hairstyle: "bob",
    src: "/crew/avatars/crew-avatar-brown-bob.png",
  },
}

const AVATAR_ORDER: CrewAvatarId[] = [
  "black-short",
  "yellow-perm",
  "brown-short",
  "black-long",
  "yellow-short",
  "brown-bob",
]

export function isCrewAvatarId(value: string | null | undefined): value is CrewAvatarId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(CREW_AVATARS, value))
}

export function avatarIdForMember(memberId: number, requested?: string | null): CrewAvatarId {
  if (isCrewAvatarId(requested)) return requested
  const index = Math.abs(memberId) % AVATAR_ORDER.length
  return AVATAR_ORDER[index]
}
