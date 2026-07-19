"use client"

// 카카오 JS SDK 공유 헬퍼.
// - NEXT_PUBLIC_KAKAO_JS_KEY 가 있고 SDK가 로드돼 있으면 카카오톡 공유시트 사용
// - 키/SDK가 없으면 Web Share API → 클립보드 복사로 graceful 폴백 (앱이 안 깨짐)

declare global {
  interface Window {
    Kakao?: any
  }
}

const JS_KEY = (process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "").trim()

// 브랜드 OG 이미지가 준비되면 교체 권장. (카카오 공유는 imageUrl이 도달 가능해야 카드가 뜸)
const DEFAULT_SHARE_IMAGE =
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80&auto=format&fit=crop"

export function appOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin
  }
  return (process.env.NEXT_PUBLIC_APP_URL || "https://rendezvous.app").replace(/\/$/, "")
}

/** Kakao SDK가 로드됐고 JS키가 있으면 init 후 true 반환. */
export function isKakaoReady(): boolean {
  if (typeof window === "undefined") return false
  const k = window.Kakao
  if (!k || !JS_KEY) return false
  try {
    if (!k.isInitialized()) k.init(JS_KEY)
    return k.isInitialized()
  } catch {
    return false
  }
}

export type ShareResult = "kakao" | "shared" | "copied" | "none"

async function fallbackShare(title: string, text: string, url: string): Promise<ShareResult> {
  // 1) Web Share API (모바일 브라우저)
  try {
    const nav: any = typeof navigator !== "undefined" ? navigator : null
    if (nav?.share) {
      await nav.share({ title, text, url })
      return "shared"
    }
  } catch {
    // 사용자가 취소했거나 미지원 → 클립보드로
  }
  // 2) 클립보드 복사
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
    return "copied"
  } catch {
    return "none"
  }
}

/** 친구 초대: ref 파라미터가 붙은 가입 링크를 카톡으로 공유. */
export async function shareInvite(opts: {
  inviterId: number
  inviterName?: string
}): Promise<{ result: ShareResult; url: string }> {
  const url = `${appOrigin()}/login?ref=${opts.inviterId}`
  const title = "랑데부 초대장 💌"
  const desc = `${opts.inviterName || "친구"}님이 랑데부에 초대했어요. 우리 취향에 딱 맞는 만남 장소를 함께 찾아봐요!`

  if (isKakaoReady()) {
    try {
      window.Kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title,
          description: desc,
          imageUrl: DEFAULT_SHARE_IMAGE,
          link: { mobileWebUrl: url, webUrl: url },
        },
        buttons: [
          { title: "랑데부 시작하기", link: { mobileWebUrl: url, webUrl: url } },
        ],
      })
      return { result: "kakao", url }
    } catch {
      // SDK 호출 실패 → 폴백
    }
  }
  const result = await fallbackShare(title, desc, url)
  return { result, url }
}

export type SharePlace = { name: string; category?: string; address?: string }

/** 추천 결과 공유: 카톡 리스트 템플릿으로 추천 장소들을 전송. */
export async function shareRecommendation(opts: {
  regionName?: string
  places: SharePlace[]
  link?: string
}): Promise<{ result: ShareResult; url: string }> {
  const url = (opts.link || appOrigin()).replace(/\/$/, "")
  const title = opts.regionName ? `${opts.regionName} 추천 장소` : "랑데부 추천 장소 ✨"
  const top = opts.places.slice(0, 3)
  const names = top.map((p) => p.name).join(", ")
  const desc = names
    ? `${names}${opts.places.length > 3 ? ` 외 ${opts.places.length - 3}곳` : ""} 추천받았어요!`
    : "랑데부에서 우리 취향 맞춤 장소를 확인하세요!"

  if (isKakaoReady()) {
    try {
      const contents = top.map((p) => ({
        title: p.name,
        description: p.category || p.address || "추천 장소",
        imageUrl: DEFAULT_SHARE_IMAGE,
        link: { mobileWebUrl: url, webUrl: url },
      }))
      window.Kakao.Share.sendDefault({
        objectType: "list",
        headerTitle: title,
        headerLink: { mobileWebUrl: url, webUrl: url },
        contents:
          contents.length > 0
            ? contents
            : [
                {
                  title,
                  description: desc,
                  imageUrl: DEFAULT_SHARE_IMAGE,
                  link: { mobileWebUrl: url, webUrl: url },
                },
              ],
        buttons: [{ title: "랑데부에서 보기", link: { mobileWebUrl: url, webUrl: url } }],
      })
      return { result: "kakao", url }
    } catch {
      // 폴백
    }
  }
  const result = await fallbackShare(title, desc, url)
  return { result, url }
}


/** 크루 초대: 크루 프로필(?invite=1) 링크를 카톡으로 공유. 비로그인 수신자는 로그인 후 자동 합류. */
export async function shareCrewInvite(opts: {
  crewId: string
  crewTitle: string
  icon?: string
  memberCount?: number
}): Promise<{ result: ShareResult; url: string }> {
  const url = `${appOrigin()}/home-next/crew/${opts.crewId}?invite=1`
  const title = `${opts.icon || "🍽️"} ${opts.crewTitle} 크루 초대장`
  const desc = `우리 크루에서 맛집 리스트를 함께 쌓아요! 멤버 ${opts.memberCount || 1}명이 기다리고 있어요.`

  if (isKakaoReady()) {
    try {
      window.Kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title,
          description: desc,
          imageUrl: DEFAULT_SHARE_IMAGE,
          link: { mobileWebUrl: url, webUrl: url },
        },
        buttons: [{ title: "크루 합류하기", link: { mobileWebUrl: url, webUrl: url } }],
      })
      return { result: "kakao", url }
    } catch {
      // SDK 실패 → 폴백
    }
  }
  const result = await fallbackShare(title, desc, url)
  return { result, url }
}
