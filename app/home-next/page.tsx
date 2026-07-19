"use client"

// ─────────────────────────────────────────────────────────────
// 🧪 [redesign/group-home] 새 홈 프로토타입 — "모임·단체 중심 발견"
// 기존 탭 홈(app/page.tsx)은 그대로 두고, 이 라우트에서만 새 구성을 실험한다.
// 지금은 mock 데이터로 "구성(뼈대)"만 확인하는 단계. API 연결은 다음.
// 확정되면 홈 라우트를 이쪽으로 스왑한다.
// ─────────────────────────────────────────────────────────────

import React from "react"
import { Search, Sparkles, Plus, RotateCw, Users, MapPin, Bookmark, ChevronRight, BadgeCheck } from "lucide-react"

// ── mock ─────────────────────────────────────────────────────
const TASTE_MATCHES = [
  { emoji: "🍷", name: "성수 와인 한잔 모임", verified: true, members: 24, match: 87, title: "퇴근하고 와인 한잔 하기 좋은 집", area: "성수", count: 8, saves: 312 },
  { emoji: "🍜", name: "라멘 원정대", verified: true, members: 41, match: 81, title: "줄 서서라도 먹는 라멘 성지", area: "홍대·마포", count: 12, saves: 508 },
]

const MY_GROUPS = [
  { emoji: "🍞", name: "빵 탐방 동아리", n: 18 },
  { emoji: "🍺", name: "금요일 맥주회", n: 9 },
]

const CONTEXT_RACKS: { label: string; tag: string; items: { emoji: string; name: string; by: string; revisit: number }[] }[] = [
  {
    label: "요즘 뜨는 회식 리스트", tag: "회식",
    items: [
      { emoji: "🥩", name: "팀 회식 실패 없는 고깃집", by: "강남 직장인 모임", revisit: 14 },
      { emoji: "🍲", name: "부장님도 만족한 한정식", by: "판교 개발팀", revisit: 9 },
    ],
  },
  {
    label: "데이트하기 좋은", tag: "데이트",
    items: [
      { emoji: "🍝", name: "분위기 좋은 파스타집", by: "연남 데이트 모임", revisit: 11 },
      { emoji: "🍮", name: "기념일에 가는 디저트", by: "성수 카페 투어", revisit: 7 },
    ],
  },
]

const TRENDING = [
  { rank: 1, emoji: "🍢", name: "성수 포차 감성 이자카야 8곳", by: "성수 와인 한잔 모임", up: true },
  { rank: 2, emoji: "☕", name: "혼자 오래 있기 좋은 카페", by: "재택러 카페 지도", up: true },
  { rank: 3, emoji: "🌮", name: "이태원 세계음식 리스트", by: "먹부림 원정대", up: false },
]

export default function HomeNextPage() {
  const hasGroups = MY_GROUPS.length > 0

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-24">
      {/* 프로토타입 배너 */}
      <div className="bg-violet-600 px-4 py-1.5 text-center text-[11px] font-medium text-white">
        🧪 새 홈 프로토타입 · /home-next · 실험용
      </div>

      {/* ① 검색바 — 맥락 탐색 입구 */}
      <div className="sticky top-0 z-10 bg-white px-4 pb-2 pt-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <Search className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-400">성수 데이트, 강남 회식…</span>
        </div>
      </div>

      {/* ③ 취향 매칭 히어로 — 신규 유저도 온보딩 취향으로 바로 채워짐 (결정 B) */}
      <section className="px-4 pt-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <h2 className="text-[15px] font-semibold text-slate-900">나와 입맛 겹치는 모임 리스트</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
          {TASTE_MATCHES.map((g) => (
            <article key={g.name} className="w-[260px] shrink-0 rounded-2xl border border-slate-100 p-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-xl">{g.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-sm font-semibold text-slate-900">{g.name}</span>
                    {g.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet-500" />}
                  </div>
                  <div className="text-[11px] text-slate-400">멤버 {g.members}명 · 방문 인증</div>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-violet-50 px-2.5 py-1.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-violet-500 text-[11px] font-bold text-violet-600">{g.match}%</span>
                <span className="text-[11px] leading-tight text-violet-700">입맛이 <b>{g.match}% 겹쳐요</b><br />좋아할 확률이 높아요</span>
              </div>

              <div className="mt-2.5 text-sm font-medium text-slate-800">{g.title}</div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                <MapPin className="h-3 w-3" />{g.area} · {g.count}곳
                <span className="mx-0.5">·</span>
                <Bookmark className="h-3 w-3" />담은 사람 {g.saves}명
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ② 내 모임 — 없으면 "모임 만들기" 유도 (결정 B: 모임 생성 유도) */}
      <section className="px-4 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-slate-500" />
            <h2 className="text-[15px] font-semibold text-slate-900">내 모임</h2>
          </div>
          <button className="text-[12px] font-medium text-violet-600">모임 찾기</button>
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {hasGroups && MY_GROUPS.map((m) => (
            <button key={m.name} className="flex w-[92px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-slate-100 p-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-xl">{m.emoji}</span>
              <span className="w-full truncate text-center text-[11px] font-medium text-slate-700">{m.name}</span>
            </button>
          ))}
          {/* 모임 만들기 유도 카드 — 강조 */}
          <button className="flex w-[150px] shrink-0 flex-col items-start justify-center gap-1 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 p-3 text-left">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white"><Plus className="h-4 w-4" /></span>
            <span className="text-[12px] font-semibold text-violet-700">우리 모임 만들기</span>
            <span className="text-[10px] leading-tight text-violet-500">맛집 리스트를 함께 쌓아요</span>
          </button>
        </div>
      </section>

      {/* ④ 맥락별 랙 — 발견의 본체 */}
      {CONTEXT_RACKS.map((rack) => (
        <section key={rack.tag} className="px-4 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-slate-900">{rack.label}</h2>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {rack.items.map((it) => (
              <article key={it.name} className="w-[190px] shrink-0 rounded-2xl border border-slate-100 p-3">
                <div className="flex h-24 w-full items-center justify-center rounded-xl bg-slate-50 text-4xl">{it.emoji}</div>
                <div className="mt-2 text-[13px] font-semibold leading-tight text-slate-900">{it.name}</div>
                <div className="mt-1 text-[11px] text-slate-400">by {it.by}</div>
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  <RotateCw className="h-2.5 w-2.5" />재방문 {it.revisit}명
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {/* ⑤ 실시간 급상승 */}
      <section className="px-4 pb-6 pt-6">
        <h2 className="mb-2 text-[15px] font-semibold text-slate-900">🔥 실시간 급상승 리스트</h2>
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {TRENDING.map((t) => (
            <div key={t.rank} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="w-4 text-center text-sm font-bold text-violet-600">{t.rank}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-lg">{t.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-slate-900">{t.name}</div>
                <div className="truncate text-[11px] text-slate-400">by {t.by}</div>
              </div>
              <span className={`text-[11px] font-bold ${t.up ? "text-rose-500" : "text-slate-300"}`}>{t.up ? "▲" : "—"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
