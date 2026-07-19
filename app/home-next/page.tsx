"use client"

// ─────────────────────────────────────────────────────────────
// 🧪 [redesign/group-home] 새 홈 프로토타입 — "크루·리스트 중심 발견"
// 기존 탭 홈(app/page.tsx)은 그대로 두고, 이 라우트에서만 새 구성을 실험한다.
// /api/home/feed 실데이터 우선, 비었으면 mock 폴백 (데모·오프라인에서도 뼈대 확인 가능).
// 확정되면 홈 라우트를 이쪽으로 스왑한다.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Sparkles, Plus, RotateCw, Users, MapPin, Bookmark, ChevronRight, BadgeCheck } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

// ── 서버 응답 타입 (/api/home/feed) ──────────────────────────
type ListBy = { kind: "crew" | "curator"; id: string | number | null; name: string; icon: string; members?: number }
type ListCard = {
  folder_id: number; name: string; icon: string; description: string
  context_tag: string | null; item_count: number; saves: number; revisit: number
  area: string; match: number | null; by: ListBy
}
type Crew = { id: string; title: string; icon: string; members: number; lists: number }
type Rack = { tag: string; label: string; emoji: string; items: ListCard[] }
type Feed = {
  taste_matched: ListCard[]; my_crews: Crew[]; crew_suggestions: Crew[]
  racks: Rack[]; trending: (ListCard & { rank: number; up: boolean })[]
  logged_in: boolean; has_taste: boolean
}

// ── mock 폴백 (API 비었을 때 뼈대 확인용) ─────────────────────
const MOCK: Feed = {
  logged_in: false,
  has_taste: false,
  taste_matched: [
    { folder_id: -1, name: "퇴근하고 와인 한잔 하기 좋은 집", icon: "🍷", description: "", context_tag: "drink", item_count: 8, saves: 312, revisit: 19, area: "성수동", match: 87, by: { kind: "crew", id: "m1", name: "성수 와인 크루", icon: "🍷", members: 24 } },
    { folder_id: -2, name: "줄 서서라도 먹는 라멘 성지", icon: "🍜", description: "", context_tag: "solo", item_count: 12, saves: 508, revisit: 31, area: "연남동", match: 81, by: { kind: "crew", id: "m2", name: "라멘 원정 크루", icon: "🍜", members: 41 } },
  ],
  my_crews: [
    { id: "c1", title: "빵 탐방 크루", icon: "🍞", members: 18, lists: 4 },
    { id: "c2", title: "금요일 맥주 크루", icon: "🍺", members: 9, lists: 2 },
  ],
  crew_suggestions: [],
  racks: [
    { tag: "work", label: "회식 실패 없는", emoji: "🥂", items: [
      { folder_id: -3, name: "팀 회식 실패 없는 고깃집", icon: "🥩", description: "", context_tag: "work", item_count: 6, saves: 120, revisit: 14, area: "역삼동", match: null, by: { kind: "crew", id: "m3", name: "강남 직장인 크루", icon: "🏢", members: 33 } },
      { folder_id: -4, name: "부장님도 만족한 한정식", icon: "🍲", description: "", context_tag: "work", item_count: 5, saves: 88, revisit: 9, area: "판교", match: null, by: { kind: "crew", id: "m4", name: "판교 개발자 크루", icon: "💻", members: 21 } },
    ]},
    { tag: "date", label: "데이트하기 좋은", emoji: "💕", items: [
      { folder_id: -5, name: "분위기 좋은 파스타집", icon: "🍝", description: "", context_tag: "date", item_count: 7, saves: 204, revisit: 11, area: "연남동", match: null, by: { kind: "crew", id: "m5", name: "연남 데이트 크루", icon: "💕", members: 12 } },
      { folder_id: -6, name: "기념일에 가는 디저트", icon: "🍮", description: "", context_tag: "date", item_count: 5, saves: 96, revisit: 7, area: "성수동", match: null, by: { kind: "crew", id: "m6", name: "성수 카페 크루", icon: "☕", members: 15 } },
    ]},
  ],
  trending: [
    { folder_id: -7, rank: 1, up: true, name: "성수 포차 감성 이자카야 8곳", icon: "🍢", description: "", context_tag: "drink", item_count: 8, saves: 77, revisit: 12, area: "성수동", match: null, by: { kind: "crew", id: "m1", name: "성수 와인 크루", icon: "🍷", members: 24 } },
    { folder_id: -8, rank: 2, up: true, name: "혼자 오래 있기 좋은 카페", icon: "☕", description: "", context_tag: "cafe", item_count: 9, saves: 65, revisit: 8, area: "망원동", match: null, by: { kind: "curator", id: null, name: "재택러 카페 크루", icon: "🧑‍💻" } },
    { folder_id: -9, rank: 3, up: false, name: "이태원 세계음식 리스트", icon: "🌮", description: "", context_tag: "friends", item_count: 11, saves: 51, revisit: 6, area: "이태원동", match: null, by: { kind: "curator", id: null, name: "먹부림 원정 크루", icon: "🌮" } },
  ],
}

export default function HomeNextPage() {
  const router = useRouter()
  const [feed, setFeed] = useState<Feed>(MOCK)
  const [live, setLive] = useState(false)

  useEffect(() => {
    let alive = true
    fetchWithAuth("/api/home/feed")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Feed | null) => {
        if (!alive || !d) return
        // 실데이터가 하나라도 있으면 교체, 완전 빈 응답이면 mock 유지
        const hasAny = (d.taste_matched?.length || 0) + (d.racks?.length || 0) + (d.trending?.length || 0) > 0
        if (hasAny) {
          setFeed({
            ...d,
            my_crews: d.my_crews?.length ? d.my_crews : [],
            racks: d.racks?.length ? d.racks : MOCK.racks,
          })
          setLive(true)
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const crews = feed.my_crews

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-24">
      {/* 프로토타입 배너 */}
      <div className="bg-violet-600 px-4 py-1.5 text-center text-[11px] font-medium text-white">
        🧪 새 홈 프로토타입 · /home-next · {live ? "실데이터" : "mock"}
      </div>

      {/* ① 검색바 — 지역 × 맥락 탐색 입구 */}
      <div className="sticky top-0 z-10 bg-white px-4 pb-2 pt-3">
        <button
          onClick={() => router.push("/home-next/search")}
          className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left"
        >
          <Search className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-400">성수 데이트, 강남 회식…</span>
        </button>
      </div>

      {/* ② 취향 매칭 히어로 — 온보딩 취향만 있어도 신규 유저에게 바로 노출 */}
      <section className="px-4 pt-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <h2 className="text-[15px] font-semibold text-slate-900">
            {feed.has_taste ? "나와 입맛 겹치는 크루의 리스트" : "요즘 많이 담는 리스트"}
          </h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
          {feed.taste_matched.map((g) => (
            <article
              key={g.folder_id}
              onClick={() => {
                if (g.by.kind === "crew" && g.by.id) router.push(`/home-next/crew/${g.by.id}`)
                else if (g.folder_id > 0) router.push(`/lists/${g.folder_id}`)
              }}
              className="w-[260px] shrink-0 cursor-pointer rounded-2xl border border-slate-100 p-3.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-xl">{g.by.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-sm font-semibold text-slate-900">{g.by.name}</span>
                    {g.by.kind === "crew" && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet-500" />}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {g.by.kind === "crew" ? `멤버 ${g.by.members}명 · 크루` : "큐레이터"}
                  </div>
                </div>
              </div>

              {g.match !== null && (
                <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-violet-50 px-2.5 py-1.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-violet-500 text-[11px] font-bold text-violet-600">{g.match}%</span>
                  <span className="text-[11px] leading-tight text-violet-700">입맛이 <b>{g.match}% 겹쳐요</b><br />좋아할 확률이 높아요</span>
                </div>
              )}

              <div className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
                <span>{g.icon}</span><span className="truncate">{g.name}</span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                <MapPin className="h-3 w-3" />{g.area || "여러 지역"} · {g.item_count}곳
                <span className="mx-0.5">·</span>
                <Bookmark className="h-3 w-3" />담은 사람 {g.saves}명
              </div>
              {g.revisit > 0 && (
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  <RotateCw className="h-2.5 w-2.5" />재방문 의사 {g.revisit}명
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ③ 내 크루 — 없으면 "크루 만들기" 유도 (결정 B: 크루 생성이 목표) */}
      <section className="px-4 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-slate-500" />
            <h2 className="text-[15px] font-semibold text-slate-900">내 크루</h2>
          </div>
          <button className="text-[12px] font-medium text-violet-600">크루 찾기</button>
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {crews.map((m) => (
            <button
              key={m.id}
              onClick={() => router.push(`/home-next/crew/${m.id}`)}
              className="flex w-[92px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-slate-100 p-3"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-xl">{m.icon}</span>
              <span className="w-full truncate text-center text-[11px] font-medium text-slate-700">{m.title}</span>
            </button>
          ))}
          {/* 크루 만들기 유도 카드 — "사람 모으기"가 아니라 "리스트 쌓기"가 상품 */}
          <button
            onClick={() => router.push("/home-next/crew-new")}
            className="flex w-[150px] shrink-0 flex-col items-start justify-center gap-1 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 p-3 text-left"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white"><Plus className="h-4 w-4" /></span>
            <span className="text-[12px] font-semibold text-violet-700">우리 크루 만들기</span>
            <span className="text-[10px] leading-tight text-violet-500">맛집 리스트를 함께 쌓아요</span>
          </button>
        </div>
        {/* 크루 추천 (가입 유도) */}
        {feed.crew_suggestions.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {feed.crew_suggestions.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/home-next/crew/${c.id}`)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5"
              >
                <span className="text-sm">{c.icon}</span>
                <span className="text-[11px] font-medium text-slate-700">{c.title}</span>
                <span className="text-[10px] text-slate-400">리스트 {c.lists}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ④ 맥락별 랙 — 발견의 본체 (context_tag 기반) */}
      {feed.racks.map((rack) => (
        <section key={rack.tag} className="px-4 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-slate-900">{rack.emoji} {rack.label}</h2>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {rack.items.map((it) => (
              <article key={it.folder_id} className="w-[190px] shrink-0 rounded-2xl border border-slate-100 p-3">
                <div className="flex h-24 w-full items-center justify-center rounded-xl bg-slate-50 text-4xl">{it.icon}</div>
                <div className="mt-2 truncate text-[13px] font-semibold leading-tight text-slate-900">{it.name}</div>
                <div className="mt-1 truncate text-[11px] text-slate-400">by {it.by.name}</div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {it.revisit > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      <RotateCw className="h-2.5 w-2.5" />재방문 {it.revisit}명
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                    <Bookmark className="h-2.5 w-2.5" />{it.saves}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {/* ⑤ 실시간 급상승 */}
      {feed.trending.length > 0 && (
        <section className="px-4 pb-6 pt-6">
          <h2 className="mb-2 text-[15px] font-semibold text-slate-900">🔥 실시간 급상승 리스트</h2>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
            {feed.trending.map((t) => (
              <div key={t.folder_id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="w-4 text-center text-sm font-bold text-violet-600">{t.rank}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-lg">{t.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-slate-900">{t.name}</div>
                  <div className="truncate text-[11px] text-slate-400">by {t.by.name}</div>
                </div>
                <span className={`text-[11px] font-bold ${t.up ? "text-rose-500" : "text-slate-300"}`}>{t.up ? "▲" : "—"}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
