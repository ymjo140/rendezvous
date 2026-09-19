export type CrewAvatarId =
  | "male-black-short"
  | "female-brown-short"
  | "male-brown-short"
  | "female-yellow-perm"
  | "female-black-long"
  | "male-yellow-short"

type LegacyCrewAvatarId =
  | "black-short"
  | "yellow-perm"
  | "brown-short"
  | "black-long"
  | "yellow-short"
  | "brown-bob"

export type CrewGender = "male" | "female" | "other" | "unknown"

export type CrewPoseId = "stand" | "wave" | "bread" | "heart"

export type CrewPoseDefinition = {
  id: CrewPoseId
  label: string
  icon: string
  priceLabel: string
}

// 1차에는 통짜 캐릭터와 충돌하지 않도록 포즈 카탈로그·장착 상태만 먼저 제공한다.
// 실제 포즈 PNG는 같은 기준선으로 제작한 다음 컬렉션에서 교체한다.
export const CREW_POSES: Record<CrewPoseId, CrewPoseDefinition> = {
  stand: { id: "stand", label: "차분히 서기", icon: "🧍", priceLabel: "무료" },
  wave: { id: "wave", label: "손 흔들기", icon: "👋", priceLabel: "무료" },
  bread: { id: "bread", label: "빵 들기", icon: "🥖", priceLabel: "무료" },
  heart: { id: "heart", label: "하트 포즈", icon: "🫶", priceLabel: "준비 중" },
}

export type CrewAvatarDefinition = {
  id: CrewAvatarId
  label: string
  gender: "male" | "female"
  hairColor: "black" | "brown" | "yellow"
  hairstyle: "short" | "perm" | "long" | "bob"
  src: string
  // The source canvas is intentionally kept so full-body renders can use the
  // same baseline without object-contain shrinking narrow canvases.
  width: number
  height: number
}

export const CREW_AVATARS: Record<CrewAvatarId, CrewAvatarDefinition> = {
  "male-black-short": {
    id: "male-black-short",
    label: "남성 · 검정 짧은 머리",
    gender: "male",
    hairColor: "black",
    hairstyle: "short",
    src: "/crew/avatars/v2/crew-avatar-male-black-short.png",
    width: 159,
    height: 256,
  },
  "female-brown-short": {
    id: "female-brown-short",
    label: "여성 · 갈색 짧은 머리",
    gender: "female",
    hairColor: "brown",
    hairstyle: "short",
    src: "/crew/avatars/v2/crew-avatar-female-brown-short.png",
    width: 257,
    height: 256,
  },
  "male-brown-short": {
    id: "male-brown-short",
    label: "남성 · 갈색 짧은 머리",
    gender: "male",
    hairColor: "brown",
    hairstyle: "short",
    src: "/crew/avatars/v2/crew-avatar-male-brown-short.png",
    width: 151,
    height: 256,
  },
  "female-yellow-perm": {
    id: "female-yellow-perm",
    label: "여성 · 노랑 파마",
    gender: "female",
    hairColor: "yellow",
    hairstyle: "perm",
    src: "/crew/avatars/v2/crew-avatar-female-yellow-perm.png",
    width: 209,
    height: 256,
  },
  "female-black-long": {
    id: "female-black-long",
    label: "여성 · 검정 장발",
    gender: "female",
    hairColor: "black",
    hairstyle: "long",
    src: "/crew/avatars/v2/crew-avatar-female-black-long.png",
    width: 230,
    height: 256,
  },
  "male-yellow-short": {
    id: "male-yellow-short",
    label: "남성 · 노랑 짧은 머리",
    gender: "male",
    hairColor: "yellow",
    hairstyle: "short",
    src: "/crew/avatars/v2/crew-avatar-male-yellow-short.png",
    width: 249,
    height: 256,
  },
}

const MALE_AVATAR_ORDER: CrewAvatarId[] = [
  "male-black-short",
  "male-brown-short",
  "male-yellow-short",
]

const FEMALE_AVATAR_ORDER: CrewAvatarId[] = [
  "female-yellow-perm",
  "female-black-long",
  "female-brown-short",
]

const LEGACY_AVATAR_ALIASES: Record<LegacyCrewAvatarId, CrewAvatarId> = {
  "black-short": "male-black-short",
  "yellow-perm": "female-yellow-perm",
  "brown-short": "male-brown-short",
  "black-long": "female-black-long",
  "yellow-short": "male-yellow-short",
  "brown-bob": "female-brown-short",
}

export function normalizeCrewGender(value: string | null | undefined): CrewGender {
  const normalized = String(value || "").trim().toLowerCase()
  if (["남성", "남자", "male", "man", "m"].includes(normalized)) return "male"
  if (["여성", "여자", "female", "woman", "f"].includes(normalized)) return "female"
  if (["기타", "other", "non-binary", "nonbinary"].includes(normalized)) return "other"
  return "unknown"
}

export function normalizeCrewAvatarId(value: string | null | undefined): CrewAvatarId | null {
  if (!value) return null
  if (Object.prototype.hasOwnProperty.call(CREW_AVATARS, value)) return value as CrewAvatarId
  if (Object.prototype.hasOwnProperty.call(LEGACY_AVATAR_ALIASES, value)) {
    return LEGACY_AVATAR_ALIASES[value as LegacyCrewAvatarId]
  }
  return null
}

export function isCrewAvatarId(value: string | null | undefined): boolean {
  return normalizeCrewAvatarId(value) !== null
}

export function normalizeCrewPoseId(value: string | null | undefined): CrewPoseId {
  if (value === "wave" || value === "bread" || value === "heart") return value
  return "stand"
}

export function avatarIdForMember(
  memberId: number,
  requested?: string | null,
  genderValue?: string | null,
): CrewAvatarId {
  const gender = normalizeCrewGender(genderValue)
  const requestedId = normalizeCrewAvatarId(requested)

  // 명시된 아바타가 성별 정보와 충돌하면 무시한다. 이전 버전의
  // memberId 기반 배정 때문에 이름과 캐릭터가 뒤바뀌는 문제를 막는다.
  if (requestedId && (gender === "unknown" || gender === "other" || CREW_AVATARS[requestedId].gender === gender)) {
    return requestedId
  }

  const order = gender === "female"
    ? FEMALE_AVATAR_ORDER
    : gender === "male"
      ? MALE_AVATAR_ORDER
      // 성별을 아직 설정하지 않은 사용자를 memberId로 여성/남성처럼
      // 추정하지 않는다. 명시적 선택이 없을 때는 공통 기본 캐릭터를
      // 보여주고, 마이페이지에서 본인이 직접 고르게 한다.
      : (["male-black-short"] as CrewAvatarId[])
  const index = Math.abs(memberId) % order.length
  return order[index]
}
