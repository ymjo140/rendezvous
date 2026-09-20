"use client"

// 🏘️ 우리 크루 탭 — 크루들의 동네.
//
// 지도 탭을 대체한다. 지도는 19줄짜리 껍데기(구 홈탭 래퍼)였고, 중간지점 추천은
// 이미 채팅·투표 안에 있어서 탭이 없어도 흐름이 안 끊긴다.
//
// 구조는 아이러브커피를 따랐다:
//   가운데 = 우리 크루 건물 (등급에 따라 커지고 층이 는다)
//   그 위  = 퀘스트 버튼 (화면을 안 먹고 배지로 알린다)
//   다른 크루 탭 = 공개 크루 탐색과 교류 기록
//   우리 크루 탭 = 현재 크루의 리스트 · 방문기록 · 게시물
//
// '우리 크루'는 보여주는 곳, '내 크루'는 운영하는 곳(채팅·예약·제휴)이다.
// 놀러온 사람이 볼 게 여기 다 있어야 '다른 크루 놀러가기'가 성립한다.
//
// '다른 크루 놀러가기'가 이 화면의 핵심이다. 공개 리스트·팔로우·좋아요·랭킹이 이미
// 다 만들어져 있는데 쓸 이유가 없어서 죽어 있었다. 방문이 그 이유를 만든다.

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, BookOpen, ChevronDown, Compass, Loader2, MapPin, Settings2, Trophy, Users } from "lucide-react"
import { useCrewResource } from "@/lib/use-crew-resource"
import { CrewLoadError } from "@/components/ui/crew-load-error"
import { CrewShowcase, type ShowcaseCommand } from "@/components/ui/crew-showcase"
import { CrewRanking } from "@/components/ui/crew-ranking"
import { CrewExchange } from "@/components/ui/crew-exchange"
import { CrewMissions } from "@/components/ui/crew-missions"
import { CrewVillage, type HeroPlace, type Member, type NeighborCrew } from "@/components/ui/crew-village"
import { TabBar } from "../tab-bar"

type Crew = { id: string; title: string; icon: string; members: number; lists?: number }
type TownSection = "mine" | "ranking" | "discover"

const LAST_CREW_KEY = "kitchen_last_crew"

export default function KitchenTabPage() {
  const router = useRouter()
  const feed = useCrewResource<{ my_crews: Crew[]; crew_suggestions: NeighborCrew[] }>("/api/home/feed")
  const crews = feed.data?.my_crews || []
  const neighbors = feed.data?.crew_suggestions || []
  const [sel, setSel] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [section, setSection] = useState<TownSection>("mine")
  const loading = feed.loading
  useEffect(() => {
    if (!feed.data) return
    let last: string | null = null
    try { last = localStorage.getItem(LAST_CREW_KEY) } catch { /* optional preference */ }
    const mine = feed.data.my_crews || []
    setSel(old => mine.some(c => c.id === old) ? old : mine.find(c => c.id === last)?.id ?? mine[0]?.id ?? null)
  }, [feed.data])

  const pick = (id: string) => {
    setSel(id)
    setPicking(false)
    try { localStorage.setItem(LAST_CREW_KEY, id) } catch { /* noop */ }
  }

  const current = crews.find((c) => c.id === sel)

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md bg-[#fcfbf8] pb-16">
      <div className="sticky top-0 z-10 flex h-[60px] items-center gap-2 border-b border-[#eee9e1] bg-[#fcfbf8]/95 px-4 backdrop-blur">
        <div>
          <span className="block text-[10px] font-extrabold tracking-[0.14em] text-[#b17b4f]">RENDEZVOUS CREW</span>
          <span className="mt-0.5 block text-[17px] font-black tracking-[-0.04em] text-slate-900">우리 크루</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => router.push("/crews")}
            className="flex items-center gap-1 rounded-full border border-slate-100 bg-white px-2.5 py-1.5 text-[12px] font-bold text-gray-600 shadow-sm"
            aria-label="크루 관리"
          >
            <Settings2 className="h-3.5 w-3.5" />
            관리
          </button>
          {crews.length > 1 && current && (
            <button
              onClick={() => setPicking((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-slate-100 bg-white px-2.5 py-1.5 text-[12px] font-bold text-gray-700 shadow-sm"
            >
              <span>{current.icon}</span>
              <span className="max-w-[100px] truncate">{current.title}</span>
              <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${picking ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {picking && (
        <div className="border-b border-gray-100 bg-white px-4 py-2 shadow-sm">
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

      <div className="px-4 pt-3">
        <p className="mb-2 px-1 text-[11.5px] leading-relaxed text-slate-500">크루원과 함께 방문하고, 다녀온 기록으로 서로의 취향을 증명해보세요.</p>
      <div className="flex border-b border-[#e9e4dc]">
        {([
          { key: "mine", label: "우리 크루", icon: Users },
          { key: "ranking", label: "랭킹", icon: Trophy },
          { key: "discover", label: "다른 크루", icon: Compass },
        ] as const).map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setSection(tab.key)}
              className={`relative flex flex-1 items-center justify-center gap-1 py-3 text-[12px] font-bold transition-colors ${section === tab.key ? "text-[#8b552e]" : "text-slate-400"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {section === tab.key && <span className="absolute inset-x-5 -bottom-px h-0.5 rounded-full bg-[#e9a23b]" />}
            </button>
          )
        })}
      </div>
      </div>

      {(feed.refreshing || (feed.error && feed.data)) && (
        <div className="mx-4 mt-2 flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-2 text-[10.5px] text-slate-400" role={feed.error ? "status" : "status"}>
          {feed.refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
          {feed.error ? "마지막으로 확인된 크루 기록을 보여드리고 있어요." : "최신 크루 기록을 확인하는 중이에요."}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중
        </div>
      ) : feed.error && !feed.data ? <CrewLoadError message={feed.error} retry={feed.reload} /> : section === "ranking" ? (
        <div className="px-4 pt-3">
          <CrewRanking />
        </div>
      ) : section === "discover" ? (
        <div className="px-4 pt-3">
          <CrewDirectory crews={neighbors} groupId={sel ?? undefined} />
        </div>
      ) : !sel ? (
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
          {current && <KitchenContent key={current.id} crew={current} />}
        </div>
      )}

      <TabBar />
    </div>
  )
}


type Kitchen = {
  tier: string
  tier_desc?: string | null
  next_tier?: { name: string; need: number; remain: number } | null
  total_visits?: number
  member_count?: number
  current_user_id?: number | null
  member_sort?: "recent_contribution"
  members: Member[]
  unlocked_count: number
  total_count: number
  regulars?: { place_id: number; name: string; visits: number; last_date: string; menu: string }[]
  hero_place?: HeroPlace | null
  menus: { key: string; title: string; unlocked: boolean; place_name: string | null; image: string }[]
}
function KitchenContent({ crew }: { crew: Crew }) {
  const router = useRouter()
  const { data, loading, error, refreshing, reload } = useCrewResource<Kitchen>(`/api/groups/${encodeURIComponent(crew.id)}/kitchen`)
  const [showcaseCommand, setShowcaseCommand] = useState<ShowcaseCommand | null>(null)

  const focusShowcase = (target: ShowcaseCommand["target"]) => {
    setShowcaseCommand({ target, nonce: Date.now() })
  }

  if (loading) return <p role="status" className="py-12 text-center text-sm text-gray-500">크루 기록을 불러오는 중…</p>
  if (error && !data) return <CrewLoadError message={error} retry={reload} />
  if (!data) return null
  const regularCount = data.regulars?.length ?? 0
  return <>
    {(refreshing || error) && (
      <div className="mb-2 flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[10.5px] text-slate-400" role="status">
        {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
        {error ? "마지막으로 확인된 크루 기록을 보여드리고 있어요." : "최신 크루 기록을 확인하는 중이에요."}
      </div>
    )}
    <div className="relative">
      <CrewVillage
        title={crew.title}
        icon={crew.icon}
        tier={data.tier}
        tierDesc={data.tier_desc}
        nextTier={data.next_tier}
        members={data.members}
        unlocked={data.unlocked_count}
        total={data.total_count}
        totalVisits={data.total_visits ?? 0}
        regularCount={regularCount}
        heroPlace={data.hero_place}
        memberCount={data.member_count ?? crew.members}
        onEnter={() => router.push(`/crew/${encodeURIComponent(crew.id)}`)}
      />
      <CrewMissions
        groupId={crew.id}
        onMenuDex={() => focusShowcase("menu")}
        onVisits={() => focusShowcase("visits")}
      />
    </div>
    <CrewNextAction
      nextTier={data.next_tier}
      unlocked={data.unlocked_count}
      totalVisits={data.total_visits ?? 0}
      regularCount={regularCount}
      onDiscover={() => router.push("/feed")}
      onArchive={() => router.push(`/crew/${encodeURIComponent(crew.id)}`)}
    />
    <CrewShowcase groupId={crew.id} menus={data.menus} command={showcaseCommand} />
  </>
}

function CrewNextAction({
  nextTier,
  unlocked,
  totalVisits,
  regularCount,
  onDiscover,
  onArchive,
}: {
  nextTier?: { name: string; need: number; remain: number } | null
  unlocked: number
  totalVisits: number
  regularCount: number
  onDiscover: () => void
  onArchive: () => void
}) {
  return (
    <section className="mt-5 border-y border-[#eee9e1] py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[#a36b3b]">다음 기록</p>
          <h3 className="mt-1 text-[16px] font-black tracking-[-0.03em] text-[#24201d]">
            {nextTier ? `다음 등급까지 ${nextTier.remain}곳 남았어요` : "우리 크루의 기록이 완성됐어요"}
          </h3>
        </div>
        <span className="shrink-0 pt-1 text-[10.5px] text-[#9b928b]">{totalVisits}회 방문 · {regularCount}곳 단골</span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-[#756d67]">
        {nextTier
          ? `새로운 장소를 함께 방문하고 평가하면 ${nextTier.name} 기록으로 이어져요.`
          : "새로운 장소를 발견하거나 단골집을 다시 방문해 기록을 계속 쌓아보세요."}
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onDiscover} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#2b2622] py-2.5 text-[12px] font-bold text-white">
          <MapPin className="h-3.5 w-3.5" /> 장소 고르기
        </button>
        <button type="button" onClick={onArchive} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#e8e1d9] bg-white py-2.5 text-[12px] font-bold text-[#594f49]">
          <BookOpen className="h-3.5 w-3.5" /> 기록 보기
        </button>
      </div>
      <p className="mt-2 text-center text-[10.5px] text-[#a39a93]">저장한 장소 {unlocked}곳 · 방문 후 평가하면 기록이 완성돼요</p>
    </section>
  )
}


function CrewDirectory({ crews, groupId }: { crews: NeighborCrew[]; groupId?: string }) {
  const router = useRouter()

  return (
    <section aria-label="다른 크루" className="space-y-3">
      <div>
        <h2 className="text-[16px] font-bold text-slate-900">다른 크루 둘러보기</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
          공개 크루의 리스트와 방문 기록을 구경하고, 좋은 장소를 우리 리스트에 담아보세요.
        </p>
      </div>
      {crews.length === 0 ? (
        <div className="border-y border-[#eee9e1] px-4 py-8 text-center">
          <Compass className="mx-auto h-6 w-6 text-[#c9b7a5]" />
          <p className="mt-2 text-[13px] font-bold text-[#4b433e]">아직 둘러볼 공개 크루가 없어요.</p>
          <p className="mt-1 text-[11.5px] text-[#9b928b]">공개 크루와 방문 기록이 쌓이면 여기에 보여요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {crews.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/crew/${encodeURIComponent(c.id)}`)}
              className="flex w-full items-center gap-3 border-b border-[#eee9e1] py-3 text-left transition-colors first:border-t hover:bg-[#fffaf2]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f7f1e8] text-xl">{c.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-slate-900">{c.title}</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  멤버 {c.members}{typeof c.lists === "number" ? ` · 공개 리스트 ${c.lists}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-0.5 text-[11px] font-bold text-[#a36b3b]">둘러보기 <ArrowRight className="h-3.5 w-3.5" /></span>
            </button>
          ))}
        </div>
      )}
      {groupId && <CrewExchange groupId={groupId} />}
    </section>
  )
}
