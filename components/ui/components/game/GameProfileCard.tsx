"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Flame, Trophy, Check, Crown, BadgeCheck, UserPlus } from "lucide-react"
import {
  getGameProfile,
  recordActivity,
  getLeaderboard,
  getCuratorRanking,
  setFeaturedBadge,
  type GameProfile,
  type GameBadge,
  type LeaderboardData,
  type CuratorRankItem,
} from "@/lib/game"
import { shareInvite } from "@/lib/kakao"

export function GameProfileCard() {
  const [profile, setProfile] = useState<GameProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [league, setLeague] = useState<LeaderboardData | null>(null)
  const [following, setFollowing] = useState<CuratorRankItem[]>([])
  const [leagueTab, setLeagueTab] = useState<"friends" | "following">("friends")
  const [selectedBadge, setSelectedBadge] = useState<GameBadge | null>(null)
  const [settlementDismissed, setSettlementDismissed] = useState(false)

  useEffect(() => {
    let active = true
    const init = async () => {
      // 앱(마이페이지) 진입 = 일일 로그인 → 스트릭/퀘스트 갱신 후 최신 프로필
      const afterLogin = await recordActivity("daily_login")
      if (!active) return
      if (afterLogin) {
        setProfile(afterLogin)
        setLoading(false)
      } else {
        const p = await getGameProfile()
        if (!active) return
        setProfile(p)
        setLoading(false)
      }
      const [lb, fr] = await Promise.all([getLeaderboard(), getCuratorRanking("following", 10)])
      if (active) {
        setLeague(lb)
        setFollowing(fr)
      }
    }
    init()
    return () => {
      active = false
    }
  }, [])

  if (loading || !profile) {
    return (
      <div className="px-5 mb-2">
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
          <CardContent className="p-5">
            <div className="text-sm text-gray-400">게임 진행도 불러오는 중...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const pct = Math.round((profile.level_progress / profile.level_total) * 100)
  const featured = profile.featured_badge
    ? profile.badges.find((b) => b.key === profile.featured_badge)
    : null

  const entries = league?.entries || []
  const me = entries.find((e) => e.is_me)
  const above = me && me.rank > 1 ? entries[me.rank - 2] : null
  const below = me && me.rank < entries.length ? entries[me.rank] : null

  const pickFeatured = async (b: GameBadge) => {
    if (!b.earned) return
    const ok = await setFeaturedBadge(b.key)
    if (ok) setProfile({ ...profile, featured_badge: b.key })
  }

  const invite = async () => {
    try {
      const raw = localStorage.getItem("user")
      const u = raw ? JSON.parse(raw) : null
      if (u?.id) await shareInvite({ inviterId: Number(u.id), inviterName: u.name })
    } catch {}
  }

  return (
    <div className="px-5 mb-2">
      <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
        <CardContent className="p-5 space-y-4">
          {/* 스트릭 + 레벨 + 대표 뱃지 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Flame
                  className={`w-9 h-9 ${profile.streak_count > 0 ? "text-orange-500 fill-orange-400" : "text-gray-300"}`}
                />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-gray-900 leading-none">
                  {profile.streak_count}
                  <span className="text-sm font-bold text-gray-500 ml-1">일 연속</span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">최고 {profile.best_streak}일 · 오늘도 탐험해요!</div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1">
                {featured && <span title={featured.title}>{featured.emoji}</span>}
                <span className="text-xs font-bold text-[#F5A623]">Lv.{profile.level}</span>
              </div>
              <div className="text-[10px] text-gray-400">{profile.xp.toLocaleString()} XP</div>
              <div className="text-[10px] text-[#14B8A6] font-bold">이번 주 +{profile.weekly_xp}</div>
            </div>
          </div>

          {/* 레벨 진행바 */}
          <div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#F5A623] to-[#14B8A6] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-400 mt-1 text-right">
              다음 레벨까지 {profile.xp_to_next} XP
            </div>
          </div>

          {/* 일일 퀘스트 */}
          <div>
            <div className="text-xs font-bold text-gray-600 mb-2">오늘의 퀘스트</div>
            <div className="space-y-2">
              {profile.quests.map((q) => {
                const qpct = Math.round((q.progress / q.goal) * 100)
                return (
                  <div key={q.key} className="flex items-center gap-2.5">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        q.done ? "bg-[#14B8A6] text-white" : "bg-gray-100 text-gray-300"
                      }`}
                    >
                      <Check className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${q.done ? "text-gray-400 line-through" : "text-gray-700"}`}>
                          {q.title}
                        </span>
                        <span className="text-[10px] font-bold text-[#F5A623]">+{q.reward}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full ${q.done ? "bg-[#14B8A6]" : "bg-[#F5A623]"}`}
                          style={{ width: `${qpct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 뱃지(도장깨기) — 탭하면 조건/진행도, 획득 뱃지는 대표 설정 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold text-gray-600">뱃지</span>
              </div>
              <span className="text-[10px] text-gray-400">
                {profile.earned_badge_count}/{profile.badges.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.badges.map((b) => {
                const bpct = b.goal > 0 ? Math.round((b.progress / b.goal) * 100) : 0
                return (
                  <button
                    key={b.key}
                    onClick={() => setSelectedBadge(selectedBadge?.key === b.key ? null : b)}
                    className={`w-11 rounded-2xl flex flex-col items-center pt-1.5 pb-1 transition-all ${
                      selectedBadge?.key === b.key ? "ring-2 ring-[#F5A623]" : ""
                    } ${
                      b.earned
                        ? "bg-amber-50 border border-amber-200"
                        : "bg-gray-50 border border-gray-100"
                    }`}
                  >
                    <span className={`text-xl leading-none ${b.earned ? "" : "grayscale opacity-40"}`}>{b.emoji}</span>
                    {!b.earned && (
                      <span className="mt-1 h-1 w-7 rounded-full bg-gray-200 overflow-hidden">
                        <span className="block h-full bg-[#F5A623]" style={{ width: `${bpct}%` }} />
                      </span>
                    )}
                    {b.earned && profile.featured_badge === b.key && (
                      <span className="text-[8px] text-[#F5A623] font-bold leading-none mt-0.5">대표</span>
                    )}
                  </button>
                )
              })}
            </div>
            {selectedBadge && (
              <div className="mt-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 flex items-center gap-2.5">
                <span className={`text-2xl ${selectedBadge.earned ? "" : "grayscale opacity-50"}`}>{selectedBadge.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-gray-800">{selectedBadge.title}</div>
                  <div className="text-[10px] text-gray-500">
                    {selectedBadge.desc} · {selectedBadge.earned ? "획득!" : `${selectedBadge.progress}/${selectedBadge.goal}`}
                  </div>
                </div>
                {selectedBadge.earned && profile.featured_badge !== selectedBadge.key && (
                  <button
                    onClick={() => pickFeatured(selectedBadge)}
                    className="text-[10px] font-bold text-white bg-[#F5A623] rounded-lg px-2 py-1.5 flex-shrink-0"
                  >
                    대표로
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 리그: 친구(주간 XP) | 팔로잉(영향력) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold text-gray-600">리그</span>
                <span className="text-[10px] text-gray-400">· 월요일 리셋</span>
              </div>
              <div className="flex rounded-lg bg-gray-100 p-0.5">
                <button
                  onClick={() => setLeagueTab("friends")}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                    leagueTab === "friends" ? "bg-white shadow-sm text-gray-900" : "text-gray-400"
                  }`}
                >
                  👥 친구
                </button>
                <button
                  onClick={() => setLeagueTab("following")}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                    leagueTab === "following" ? "bg-white shadow-sm text-gray-900" : "text-gray-400"
                  }`}
                >
                  ⭐ 팔로잉
                </button>
              </div>
            </div>

            {/* 지난주 정산 배너 */}
            {leagueTab === "friends" && league?.settlement && !settlementDismissed && (
              <div
                className={`mb-2 rounded-xl px-3 py-2 text-xs flex items-center justify-between ${
                  league.settlement.i_won
                    ? "bg-amber-50 border border-amber-200 text-amber-800"
                    : "bg-gray-50 border border-gray-100 text-gray-600"
                }`}
              >
                <span>
                  {league.settlement.i_won
                    ? `🥇 지난주 리그 우승! (${league.settlement.my_xp} XP)`
                    : `지난주 리그 ${league.settlement.my_rank ?? "-"}위 (${league.settlement.my_xp} XP)`}
                </span>
                <button onClick={() => setSettlementDismissed(true)} className="text-[10px] text-gray-400 ml-2">
                  닫기
                </button>
              </div>
            )}

            {leagueTab === "friends" ? (
              entries.length > 1 ? (
                <div className="space-y-1">
                  {entries.slice(0, 5).map((e) => (
                    <div
                      key={e.user_id}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${
                        e.is_me ? "bg-amber-50 border border-amber-100" : ""
                      }`}
                    >
                      <span
                        className={`w-5 text-center text-xs font-extrabold ${
                          e.rank === 1
                            ? "text-amber-500"
                            : e.rank === 2
                              ? "text-gray-400"
                              : e.rank === 3
                                ? "text-orange-400"
                                : "text-gray-300"
                        }`}
                      >
                        {e.rank}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">
                        {e.crown && <span className="mr-0.5" title="지난주 우승">👑</span>}
                        {e.featured_badge && <span className="mr-0.5" title={e.featured_badge.title}>{e.featured_badge.emoji}</span>}
                        {e.name}
                        {e.is_me && <span className="text-[10px] text-[#F5A623] ml-1">나</span>}
                      </span>
                      {e.streak_count > 0 && (
                        <span className="text-[10px] text-orange-500 font-bold">🔥{e.streak_count}</span>
                      )}
                      <span className="text-xs font-bold text-[#14B8A6] w-16 text-right">+{e.weekly_xp} XP</span>
                    </div>
                  ))}
                  {me && (above || below) && (
                    <div className="text-[10px] text-gray-500 px-3 pt-1">
                      {above && above.weekly_xp >= me.weekly_xp
                        ? `🔺 ${above.name}까지 ${above.weekly_xp - me.weekly_xp + 1} XP`
                        : below
                          ? `🔻 ${below.name}이(가) ${me.weekly_xp - below.weekly_xp} XP 차로 추격 중`
                          : null}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={invite}
                  className="w-full rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-3 py-3 text-xs text-amber-700 font-medium flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" /> 친구를 초대하면 주간 리그가 시작돼요
                </button>
              )
            ) : following.length > 0 ? (
              <div className="space-y-1">
                {following.slice(0, 5).map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${
                      c.is_me ? "bg-amber-50 border border-amber-100" : ""
                    }`}
                  >
                    <span
                      className={`w-5 text-center text-xs font-extrabold ${
                        c.rank === 1 ? "text-amber-500" : c.rank <= 3 ? "text-gray-400" : "text-gray-300"
                      }`}
                    >
                      {c.rank}
                    </span>
                    <span className="text-base">{c.avatar}</span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate flex items-center gap-0.5">
                      {c.name}
                      {c.verified && <BadgeCheck className="w-3.5 h-3.5 text-[#F5A623] flex-shrink-0" />}
                      {c.is_me && <span className="text-[10px] text-[#F5A623]">나</span>}
                    </span>
                    <span className="text-[10px] text-gray-400">팔로워 {c.follower_count}</span>
                    <span className="text-xs font-bold text-[#14B8A6] w-12 text-right">{c.weekly_score}점</span>
                  </div>
                ))}
                <div className="text-[10px] text-gray-400 px-3 pt-1">
                  이번 주 영향력 = 새 팔로워×5 + 리스트 좋아요×2 + 댓글×1
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-400 px-3 py-2">
                큐레이터를 팔로우하면 영향력 랭킹이 보여요. 탐색 탭에서 발견해보세요!
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
