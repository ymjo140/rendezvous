// 취향 유형(페르소나) — 규칙 기반(AI/Gemini 불필요).
// user.preferences(분위기/음식/예산)로부터 MBTI식 "유형" 라벨을 만든다.
// 마이페이지 카드 + 홈 추천 헤더에서 공용으로 사용.

export type VibePersona = { key: string; emoji: string; title: string; desc: string }

export const VIBE_PERSONAS: VibePersona[] = [
  { key: "고급진", emoji: "🥂", title: "프리미엄 미식가", desc: "분위기와 퀄리티를 중시하는 타입" },
  { key: "가성비", emoji: "💸", title: "가성비 헌터", desc: "합리적인 가격에 진심인 실속파" },
  { key: "힙한", emoji: "🕶️", title: "힙스터 탐험가", desc: "남들 모르는 핫플을 찾아다니는 타입" },
  { key: "인스타감성", emoji: "📸", title: "인스타 감성러", desc: "눈으로 먼저 먹는 비주얼 중시파" },
  { key: "감성적인", emoji: "🎨", title: "감성 무드메이커", desc: "분위기 있는 공간을 사랑하는 타입" },
  { key: "뷰맛집", emoji: "🌆", title: "뷰 사냥꾼", desc: "창밖 풍경까지 맛으로 즐기는 타입" },
  { key: "조용한", emoji: "🤫", title: "조용한 힐링러", desc: "차분하고 프라이빗한 공간 선호" },
  { key: "야외", emoji: "🌿", title: "야외 자연파", desc: "탁 트인 공간에서 여유를 즐기는 타입" },
  { key: "이국적인", emoji: "🌍", title: "세계 미식 탐험가", desc: "새로운 맛을 두려워하지 않는 타입" },
  { key: "깔끔한", emoji: "✨", title: "클린 미니멀리스트", desc: "깔끔하고 정돈된 공간 선호" },
]

export type TasteType = {
  emoji: string
  title: string
  desc: string
  foods: string[]
  vibes: string[]
  alcohol: string[]
  spendLabel: string | null
}

export function getTasteType(preferences: any): TasteType | null {
  if (!preferences) return null
  const foods: string[] = Array.isArray(preferences.foods) ? preferences.foods : []
  const vibes: string[] = Array.isArray(preferences.vibes) ? preferences.vibes : []
  const alcohol: string[] = Array.isArray(preferences.alcohol) ? preferences.alcohol : []
  const spend: number = typeof preferences.avg_spend === "number" ? preferences.avg_spend : 0
  if (foods.length === 0 && vibes.length === 0) return null

  const persona =
    VIBE_PERSONAS.find((p) => vibes.includes(p.key)) ?? {
      emoji: "🍽️",
      title: "올라운더 미식가",
      desc: "다양한 맛과 분위기를 즐기는 타입",
    }

  const spendLabel =
    spend >= 50000 ? "하이엔드" : spend >= 30000 ? "미디엄" : spend > 0 ? "가성비" : null

  return { ...persona, foods, vibes, alcohol, spendLabel }
}

/** 헤더 등에 쓸 짧은 라벨(이모지+제목). 취향 없으면 null. */
export function getPersonaLabel(preferences: any): { emoji: string; title: string } | null {
  const t = getTasteType(preferences)
  if (!t) return null
  return { emoji: t.emoji, title: t.title }
}
