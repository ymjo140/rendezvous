"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Flame, Trophy, Check, Crown } from "lucide-react"
import {
  getGameProfile,
  recordActivity,
  getLeaderboard,
  type GameProfile,
  type LeaderboardEntry,
} from "@/lib/game"

export function GameProfileCard() {
  const [profile, setProfile] = useState<GameProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])

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
      const lb = await getLeaderboard()
      if (active) setLeaderboard(lb)
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

  return (
    <div className="px-5 mb-2">
      <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
        <CardContent className="p-5 space-y-4">
          {/* 스트릭 + 레벨 */}
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
              <div className="text-xs font-bold text-[#F5A623]">Lv.{profile.level}</div>
              <div className="text-[10px] text-gray-400">{profile.xp.toLocaleString()} XP</div>
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

          {/* 뱃지(도장깨기) */}
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
              {profile.badges.map((b) => (
                <div
                  key={b.key}
                  title={`${b.title} · ${b.desc}`}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl transition-all ${
                    b.earned
                      ? "bg-amber-50 border border-amber-200"
                      : "bg-gray-50 border border-gray-100 grayscale opacity-40"
                  }`}
                >
                  {b.emoji}
                </div>
              ))}
            </div>
          </div>

          {/* 친구 리그 (XP 랭킹) */}
          {leaderboard.length > 1 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Crown className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold text-gray-600">친구 리그</span>
              </div>
              <div className="space-y-1">
                {leaderboard.slice(0, 5).map((e) => (
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
                      {e.name}
                      {e.is_me && <span className="text-[10px] text-[#F5A623] ml-1">나</span>}
                    </span>
                    {e.streak_count > 0 && (
                      <span className="text-[10px] text-orange-500 font-bold">🔥{e.streak_count}</span>
                    )}
                    <span className="text-xs font-bold text-[#F5A623]">Lv.{e.level}</span>
                    <span className="text-[11px] text-gray-400 w-14 text-right">{e.xp.toLocaleString()} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
