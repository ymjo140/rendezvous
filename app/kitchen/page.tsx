"use client"

// 🏘️ 우리 크루 탭 — 크루들의 동네.
//
// 지도 탭을 대체한다. 지도는 19줄짜리 껍데기(구 홈탭 래퍼)였고, 중간지점 추천은
// 이미 채팅·투표 안에 있어서 탭이 없어도 흐름이 안 끊긴다.
//
// 구조는 아이러브커피를 따랐다:
//   가운데 = 우리 크루 건물 (등급에 따라 커지고 층이 는다)
//   그 위  = 퀘스트 버튼 (화면을 안 먹고 배지로 알린다)
//   아래   = 다른 크루 놀러가기 → 그 크루의 리스트를 본다
//   그 밑  = 리스트 · 방문기록 · 게시물 (크루의 얼굴)
//
// '우리 크루'는 보여주는 곳, '내 크루'는 운영하는 곳(채팅·예약·제휴)이다.
// 놀러온 사람이 볼 게 여기 다 있어야 '다른 크루 놀러가기'가 성립한다.
//
// '다른 크루 놀러가기'가 이 화면의 핵심이다. 공개 리스트·팔로우·좋아요·랭킹이 이미
// 다 만들어져 있는데 쓸 이유가 없어서 죽어 있었다. 방문이 그 이유를 만든다.

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ChevronDown, Users } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { CrewShowcase } from "@/components/ui/crew-showcase"
import { CrewMissions } from "@/components/ui/crew-missions"
import { CrewVillage, NeighborStrip, type Member, type NeighborCrew } from "@/components/ui/crew-village"
import { TabBar } from "../tab-bar"

type Crew = { id: string; title: string; icon: string; members: number }

const LAST_CREW_KEY = "kitchen_last_crew"

export default function KitchenTabPage() {
  const router = useRouter()
  const [crews, setCrews] = useState<Crew[]>([])
  const [neighbors, setNeighbors] = useState<NeighborCrew[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(true)

  // 마을 그림에 쓸 값 — /kitchen에서 받아 아래 쇼케이스(도감)까지 같이 쓴다
  const [tier, setTier] = useState("골목식당")
  const [members, setMembers] = useState<Member[]>([])
  const [unlocked, setUnlocked] = useState(0)
  const [total, setTotal] = useState(25)
  const [menus, setMenus] = useState<any[]>([])

  useEffect(() => {
    let alive = true
    fetchWithAuth("/api/home/feed")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return
        const mine: Crew[] = d?.my_crews || []
        setCrews(mine)
        setNeighbors(d?.crew_suggestions || [])
        let last: string | null = null
        try { last = localStorage.getItem(LAST_CREW_KEY) } catch { /* noop */ }
        const found = mine.find((c) => c.id === last)
        setSel(found ? found.id : mine[0]?.id ?? null)
      })
      .catch(() => { /* 로그인 전이면 아래 안내가 뜬다 */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const pick = (id: string) => {
    setSel(id)
    setPicking(false)
    try { localStorage.setItem(LAST_CREW_KEY, id) } catch { /* noop */ }
  }

  // 마을 그림에 쓸 등급·멤버·해금 수. 도감(menus)도 같이 받아 아래로 넘긴다.
  useEffect(() => {
    if (!sel) return
    let alive = true
    fetchWithAuth(`/api/groups/${sel}/kitchen`)
      .then((r) => (r.ok ? r.json() : null))
      .then((k) => {
        if (!alive || !k) return
        setTier(k.tier)
        setMembers(k.members || [])
        setUnlocked(k.unlocked_count)
        setTotal(k.total_count)
        setMenus(k.menus || [])
      })
      .catch(() => { /* 마을이 기본 등급으로 뜬다 */ })
    return () => { alive = false }
  }, [sel])

  const current = crews.find((c) => c.id === sel)

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-white pb-16">
      <div className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-4 backdrop-blur">
        <span className="font-bold text-gray-900">우리 크루</span>
        {crews.length > 1 && current && (
          <button
            onClick={() => setPicking((v) => !v)}
            className="ml-auto flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-[12px] font-bold text-gray-700"
          >
            <span>{current.icon}</span>
            <span className="max-w-[120px] truncate">{current.title}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${picking ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {picking && (
        <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-2">
          {crews.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] ${
                c.id === sel ? "font-bold text-amber-700" : "text-gray-700"
              }`}
            >
              <span>{c.icon}</span>
              <span className="flex-1 truncate">{c.title}</span>
              <span className="text-[11px] text-gray-400">멤버 {c.members}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중
        </div>
      ) : !sel ? (
        // 크루가 없으면 이 화면이 성립하지 않는다. 여기서 만들게 안내한다.
        <div className="flex flex-col items-center gap-3 px-8 py-24 text-center">
          <Users className="h-10 w-10 text-gray-300" />
          <p className="text-[15px] font-bold text-gray-900">아직 크루가 없어요</p>
          <p className="text-[12.5px] leading-relaxed text-gray-500">
            크루를 만들고 함께 다녀오면 우리 크루의 가게가 자랍니다.
            혼자서는 만들 수 없는 기록이에요.
          </p>
          <button
            onClick={() => router.push("/crews")}
            className="mt-1 rounded-xl bg-[#F5A623] px-5 py-2.5 text-[13.5px] font-bold text-white"
          >
            크루 만들러 가기
          </button>
        </div>
      ) : (
        <div className="px-4 pt-3">
          {/* 마을 + 그 위에 뜬 퀘스트 버튼 */}
          <div className="relative">
            <CrewVillage
              title={current?.title || "우리 크루"}
              icon={current?.icon || null}
              tier={tier}
              members={members}
              unlocked={unlocked}
              total={total}
              onEnter={() => router.push(`/groups/${sel}`)}
            />
            <CrewMissions groupId={sel} />
          </div>

          <NeighborStrip crews={neighbors} onVisit={(id) => router.push(`/groups/${id}`)} />

          <CrewShowcase groupId={sel} menus={menus} />
        </div>
      )}

      <TabBar />
    </div>
  )
}
