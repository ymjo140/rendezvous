"use client"

import { fetchWithAuth } from "@/lib/api-client"

// 듀오링고식 게이미피케이션 — XP/레벨/🔥스트릭/일일퀘스트/뱃지.
// 캐시(₩)와 분리된 게임 진행도(현금 아님).

export type GameQuest = {
  key: string
  title: string
  goal: number
  progress: number
  done: boolean
  reward: number
}

export type GameBadge = {
  key: string
  emoji: string
  title: string
  desc: string
  earned: boolean
  goal: number
  progress: number
}

export type GameProfile = {
  xp: number
  level: number
  level_progress: number
  level_total: number
  xp_to_next: number
  streak_count: number
  best_streak: number
  active_today: boolean
  weekly_xp: number
  week: string | null
  featured_badge: string | null
  quests: GameQuest[]
  badges: GameBadge[]
  earned_badge_count: number
  // record_activity 응답에만 포함
  gained_xp?: number
  leveled_up?: boolean
  completed_quests?: string[]
  new_badges?: { key: string; emoji?: string; title?: string }[]
}

export async function getGameProfile(): Promise<GameProfile | null> {
  try {
    const res = await fetchWithAuth("/api/game/profile")
    if (!res.ok) return null
    return (await res.json()) as GameProfile
  } catch {
    return null
  }
}

export type GameActionType = "daily_login" | "explore" | "recommend" | "review" | "reserve" | "share" | "midpoint"

export type CelebrationDetail = {
  gained_xp?: number
  leveled_up?: boolean
  level?: number
  completed_quests?: string[]
  new_badges?: { key: string; emoji?: string; title?: string }[]
}

/** 레벨업/뱃지/퀘스트 완료 시 전역 축하 이벤트 발사. <GameCelebration/>이 수신. */
function maybeCelebrate(p: GameProfile) {
  if (typeof window === "undefined") return
  const worthy = p.leveled_up || (p.new_badges && p.new_badges.length > 0) || (p.completed_quests && p.completed_quests.length > 0)
  if (!worthy) return
  const detail: CelebrationDetail = {
    gained_xp: p.gained_xp,
    leveled_up: p.leveled_up,
    level: p.level,
    completed_quests: p.completed_quests,
    new_badges: p.new_badges,
  }
  window.dispatchEvent(new CustomEvent("game:celebrate", { detail }))
}

/** 활동 기록(fire-and-forget). 실패해도 UX를 막지 않는다. 성공 시 축하 연출 트리거. */
export async function recordActivity(action: GameActionType): Promise<GameProfile | null> {
  try {
    const res = await fetchWithAuth("/api/game/activity", {
      method: "POST",
      body: JSON.stringify({ action_type: action }),
    })
    if (!res.ok) return null
    const p = (await res.json()) as GameProfile
    maybeCelebrate(p)
    return p
  } catch {
    return null
  }
}

export type LeaderboardEntry = {
  rank: number
  user_id: number
  name: string
  weekly_xp: number
  xp: number
  level: number
  streak_count: number
  featured_badge: { key: string; emoji: string; title: string } | null
  crown: boolean
  is_me: boolean
}

export type LeagueSettlement = {
  week: string
  i_won: boolean
  my_rank: number | null
  my_xp: number
  top: { name: string; xp: number; is_me: boolean }[]
}

export type LeaderboardData = {
  week: string
  entries: LeaderboardEntry[]
  settlement: LeagueSettlement | null
  new_badges: { key: string; emoji?: string; title?: string }[]
}

export async function getLeaderboard(): Promise<LeaderboardData | null> {
  try {
    const res = await fetchWithAuth("/api/game/leaderboard")
    if (!res.ok) return null
    const data = (await res.json()) as LeaderboardData
    // 정산에서 리그 뱃지를 새로 땄으면 축하 연출
    if (data?.new_badges && data.new_badges.length > 0 && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("game:celebrate", { detail: { new_badges: data.new_badges } })
      )
    }
    return data
  } catch {
    return null
  }
}

export async function setFeaturedBadge(badgeKey: string): Promise<boolean> {
  try {
    const res = await fetchWithAuth("/api/game/featured-badge", {
      method: "POST",
      body: JSON.stringify({ badge_key: badgeKey }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ⭐ 큐레이터 주간 영향력 랭킹 (팔로잉 탭 / 금주의 큐레이터)
export type CuratorRankItem = {
  rank: number
  id: number
  name: string
  avatar: string
  tagline: string
  verified: boolean
  weekly_score: number
  weekly_new_followers: number
  weekly_list_likes: number
  follower_count: number
  list_count: number
  featured_badge: { emoji: string; title: string } | null
  is_following: boolean
  is_me: boolean
}

export async function getCuratorRanking(
  scope: "all" | "following",
  limit = 10
): Promise<CuratorRankItem[]> {
  try {
    const res = await fetchWithAuth(`/api/curators/ranking?scope=${scope}&limit=${limit}`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.items) ? data.items : []
  } catch {
    return []
  }
}
