"use client"

// 🧪 [redesign/group-home] 내 크루 탭 — "우리" 축.
// 내가 속한 크루 + 크루 만들기 + 취향 맞는 크루 추천 (/api/home/feed 재활용).

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Users, Plus, ChevronRight, Sparkles } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { TabBar } from "../tab-bar"

type Crew = { id: string; title: string; icon: string; members: number; lists: number; visibility?: string }

const VIS_LABEL: Record<string, string> = {
  private: "🔒 우리끼리", list_only: "📋 리스트만 공개", public: "🌟 크루 공개", open: "💬 오픈",
}

export default function CrewsTabPage() {
  const router = useRouter()
  const [mine, setMine] = useState<Crew[]>([])
  const [suggest, setSuggest] = useState<Crew[]>([])
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(true)

  useEffect(() => {
    fetchWithAuth("/api/home/feed")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setMine(d.my_crews || [])
        setSuggest(d.crew_suggestions || [])
        setLoggedIn(!!d.logged_in)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-24">
      <div className="bg-violet-600 px-4 py-1.5 text-center text-[11px] font-medium text-white">
        🧪 새 홈 프로토타입 · 내 크루
      </div>

      <div className="px-4 pt-4">
        <h1 className="text-lg font-bold text-slate-900">내 크루</h1>
        <p className="mt-0.5 text-[12px] text-slate-400">취향으로 뭉쳐 맛집 리스트를 함께 쌓는 무리</p>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : mine.length === 0 ? (
          /* 크루 없음 → 생성 유도 (결정 B) */
          <div className="rounded-3xl bg-violet-50 px-5 py-8 text-center">
            <div className="text-4xl">👥</div>
            <h2 className="mt-3 text-[15px] font-bold text-violet-900">아직 크루가 없어요</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-violet-500">
              {loggedIn
                ? "친구·동아리·회사 팀과 크루를 만들고\n우리만의 맛집 리스트를 쌓아보세요."
                : "로그인하면 내 크루를 만들고 관리할 수 있어요."}
            </p>
            <button
              onClick={() => router.push(loggedIn ? "/home-next/crew-new" : "/login")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-violet-600 px-5 py-3 text-[14px] font-semibold text-white"
            >
              <Plus className="h-4 w-4" />{loggedIn ? "우리 크루 만들기" : "로그인하기"}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {mine.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/home-next/crew/${c.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 p-3.5 text-left"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-2xl">{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-slate-900">{c.title}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    멤버 {c.members} · 리스트 {c.lists}
                    {c.visibility && ` · ${VIS_LABEL[c.visibility] || ""}`}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            ))}
            <button
              onClick={() => router.push("/home-next/crew-new")}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 py-3.5 text-[13px] font-semibold text-violet-700"
            >
              <Plus className="h-4 w-4" />크루 추가하기
            </button>
          </div>
        )}
      </div>

      {/* 취향 맞는 크루 추천 — 가입 유도 */}
      {suggest.length > 0 && (
        <div className="px-4 pt-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-[15px] font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-violet-500" />이런 크루는 어때?
          </h2>
          <div className="space-y-2">
            {suggest.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/home-next/crew/${c.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl">{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-800">{c.title}</span>
                  <span className="text-[11px] text-slate-400">멤버 {c.members} · 공개 리스트 {c.lists}</span>
                </span>
                <Users className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      )}

      <TabBar />
    </div>
  )
}
