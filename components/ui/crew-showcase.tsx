"use client"

import React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { BookOpen, Camera, ChevronRight, Clock3, Loader2, Lock, MapPin, ShieldCheck, Star } from "lucide-react"
import { useCrewResource } from "@/lib/use-crew-resource"
import { CrewLoadError } from "@/components/ui/crew-load-error"
import { stockCandidates } from "@/lib/stock-image"

/** 크루의 얼굴 — 리스트 · 방문기록 · 게시물.
 *
 *  '우리 크루'는 보여주는 곳, '내 크루'는 운영하는 곳(채팅·예약·제휴)으로 갈랐다.
 *  놀러온 사람이 볼 게 여기 다 있어야 '다른 크루 놀러가기'가 성립한다.
 *
 *  도감은 인증 방문과 방문 가게 수가 쌓이는 누적 레벨을 먼저 보여주고,
 *  메뉴 카드는 접어서 상세로 연다. 잠긴 카드를 처음부터 펼치면 기록보다
 *  빈칸이 먼저 보이기 때문에, 지금 해야 할 행동과 수집 결과를 분리한다.
 */

type List = { id: number; name: string; description: string | null; count: number; cover_image: string | null }
type Visit = { place_id: number; name: string; address: string | null; visits: number; last_date: string; menu: string; is_regular: boolean }
type VisitArchiveItem = {
  id: string
  place_id: number
  place_name: string
  visit_date_kst: string
  occurred_at: string
  participant_count: number
  source_label: "location" | "signed_qr" | "merchant_approval" | "mixed" | "unknown"
  visit_number: number
  revisit: boolean
}
type VisitSummary = {
  observed: boolean
  visits: number
  unique_places: number
  revisits: number
  regular_places: number
  last_visit: string
  source_counts: Record<string, number>
}
type Post = { id: string; content: string | null; image: string | null; place_name: string; author: string; created_at: string; likes: number }
type Menu = {
  key: string; title: string; group?: string; unlocked: boolean; place_name: string | null; image: string
  visits?: number; unique_places?: number; score?: number; level?: number; next_goal?: number | null
  remaining?: number; progress?: number
}

// 인증 방문 1회와 새로운 방문 가게 1곳을 각각 한 칸으로 쌓는다.
// 화면에서 두 원천을 함께 보여주므로, 레벨 진행이 무엇으로 올라가는지 숨기지 않는다.
const DEX_LEVEL_GOALS = [0, 3, 8, 15, 25, 40]

const TABS = [
  { key: "visits", label: "방문기록" },
  { key: "lists", label: "리스트" },
  { key: "posts", label: "게시물" },
] as const

export type ShowcaseTab = (typeof TABS)[number]["key"]
export type ShowcaseCommand = { target: "menu" | "visits"; nonce: number }

export function CrewShowcase({
  groupId,
  menus,
  activeTab,
  onTabChange,
  command,
}: {
  groupId: string
  menus?: Menu[]
  activeTab?: ShowcaseTab
  onTabChange?: (tab: ShowcaseTab) => void
  command?: ShowcaseCommand | null
}) {
  const router = useRouter()
  const [internalTab, setInternalTab] = React.useState<ShowcaseTab>("visits")
  const tab = activeTab ?? internalTab
  const { data: d, loading, error, refreshing, reload } = useCrewResource<{ lists: List[]; visits: Visit[]; posts: Post[]; visit_archive?: VisitArchiveItem[]; visit_summary?: VisitSummary | null }>(`/api/groups/${encodeURIComponent(groupId)}/showcase`)
  const [dexOpen, setDexOpen] = React.useState(false)

  React.useEffect(() => {
    if (!command || !d) return
    if (command.target === "menu") {
      // 플로팅 도감 버튼은 접힌 도감을 열고 그 위치로 이동한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDexOpen(true)
    }
    if (command.target === "visits") {
      setInternalTab("visits")
    }
    const targetId = command.target === "menu" ? "crew-menu-codex" : "crew-showcase"
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [command, d])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중
      </div>
    )
  }
  if (error && !d) return <CrewLoadError message={error} retry={reload} />
  if (!d) return null

  const count = { visits: d.visits.length, lists: d.lists.length, posts: d.posts.length }
  const unlockedCount = (menus || []).filter((m) => m.unlocked).length
  const verifiedVisits = Math.max(0, d.visit_summary?.visits ?? 0)
  const visitedPlaces = Math.max(0, d.visit_summary?.unique_places ?? 0)
  const dexProgress = getDexProgress(verifiedVisits, visitedPlaces)

  return (
    <section id="crew-showcase" className="mt-5 scroll-mt-20 border-t border-[#eee9e1] pt-5">
      {(refreshing || error) && (
        <div className="mb-3 flex items-center gap-1.5 text-[10.5px] text-[#9b928b]" role="status">
          {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
          {error ? "마지막으로 확인된 기록을 보여드리고 있어요." : "최신 기록을 확인하는 중이에요."}
        </div>
      )}
      <div className="flex gap-5 border-b border-[#eee9e1]" role="tablist" aria-label="크루 기록">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setInternalTab(t.key)
              onTabChange?.(t.key)
            }}
            role="tab"
            aria-selected={tab === t.key}
            className={`relative pb-3 text-[13px] font-bold transition-colors ${
              tab === t.key ? "text-[#8b552e]" : "text-[#aaa19a]"
            }`}
          >
            {t.label} {count[t.key] > 0 && <span className="ml-0.5 text-[11px]">{count[t.key]}</span>}
            {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#e9a23b]" />}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tab === "visits" && (
          <div className="space-y-3">
            {d.visit_summary && (
            <div className="border-b border-[#eee9e1] pb-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#4b433e]"><ShieldCheck className="h-4 w-4 text-[#a36b3b]" /> 실제 방문 기록</span>
                  {d.visit_summary.observed && <span className="text-[10.5px] text-[#9b928b]">인증된 방문만 집계</span>}
                </div>
                {d.visit_summary.observed ? (
                  <div className="mt-3 grid grid-cols-3 divide-x divide-[#eee9e1]">
                    <ArchiveMetric label="함께 방문" value={`${d.visit_summary.visits}회`} />
                    <ArchiveMetric label="새로운 장소" value={`${d.visit_summary.unique_places}곳`} />
                    <ArchiveMetric label="재방문" value={`${d.visit_summary.revisits}회`} />
                  </div>
                ) : (
                  <p className="mt-2 text-[11.5px] leading-relaxed text-[#8d837b]">
                    실제 방문이 확인되면 이곳에 남아요. 예약·방문 의향·기존 체크인은 포함하지 않아요.
                  </p>
                )}
              </div>
            )}

            {d.visit_archive && d.visit_archive.length > 0 && (
              <div>
                <p className="mb-0.5 text-[11px] font-bold text-[#8d837b]">최근 방문 인증</p>
                <div className="divide-y divide-[#eee9e1]">
                  {d.visit_archive.map((v) => (
                    <div key={v.id} className="flex items-center gap-2.5 py-3">
                      <PlaceThumbnail name={v.place_name} className="h-11 w-11" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold text-[#39322d]">{v.place_name}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#8d837b]">
                          <Clock3 className="h-3 w-3 text-[#b8aea5]" />
                          {v.visit_date_kst} · {v.participant_count}명 · {v.source_label === "location" ? "위치 인증" : v.source_label === "signed_qr" ? "QR 인증" : v.source_label === "merchant_approval" ? "점주 승인" : v.source_label === "mixed" ? "복합 인증" : "인증 확인"}
                        </div>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-bold ${v.revisit ? "text-[#a36b3b]" : "text-[#52745d]"}`}>
                        {v.revisit ? `재방문 ${v.visit_number}` : "첫 방문"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {d.visits.length === 0 ? (
              <Empty
                icon={<MapPin className="h-5 w-5" />}
                title="아직 함께 간 곳이 없어요"
                text="장소를 저장하고 다녀온 뒤 체크인하면, 크루의 첫 방문 기록이 이곳에 남아요."
                action={{ href: "/feed", label: "장소 탐색하기" }}
              />
            ) : (
              <div>
                <p className="mb-0.5 text-[11px] font-bold text-[#8d837b]">장소별 요약</p>
                <div className="divide-y divide-[#eee9e1]">
                  {d.visits.map((v) => (
                    <button
                      key={v.place_id}
                      onClick={() => router.push(`/places/${v.place_id}`)}
                      className="flex w-full items-center gap-2.5 py-3 text-left transition-colors hover:bg-[#fffaf2]"
                    >
                      <PlaceThumbnail name={v.name} category={v.menu} className="h-12 w-12" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold text-[#39322d]">{v.name}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#8d837b]">
                          {v.is_regular ? <Star className="h-3 w-3 text-[#e9a23b]" fill="#e9a23b" /> : <MapPin className="h-3 w-3 text-[#b8aea5]" />}
                          {v.menu} · 마지막 {v.last_date}
                        </div>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-bold ${v.is_regular ? "text-[#a36b3b]" : "text-[#9b928b]"}`}>
                        {v.is_regular ? "단골집" : `${v.visits}회`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "lists" && (
            d.lists.length === 0 ? (
            <Empty
              icon={<BookOpen className="h-5 w-5" />}
              title="아직 공개 리스트가 없어요"
              text="가고 싶은 곳을 모아두면 다른 크루도 이 기록을 발견할 수 있어요."
              action={{ href: "/feed", label: "장소 탐색하기" }}
            />
          ) : (
            <div className="divide-y divide-[#eee9e1]">
              {d.lists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => router.push(`/lists/${l.id}`)}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-[#fffaf2]"
                >
                  {l.cover_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.cover_image} alt="" className="h-11 w-11 flex-shrink-0 rounded-2xl object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[#f7f1e8] text-[#a36b3b]"><BookOpen className="h-4 w-4" /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-[#39322d]">{l.name}</div>
                    <div className="truncate text-[11px] text-[#8d837b]">
                      {l.count}곳{l.description ? ` · ${l.description}` : ""}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#b8aea5]" />
                </button>
              ))}
            </div>
          )
        )}

        {tab === "posts" && (
            d.posts.length === 0 ? (
            <Empty
              icon={<Camera className="h-5 w-5" />}
              title="아직 리뷰 사진이 없어요"
              text="다녀온 가게에 사진과 한 줄 평을 남기면 크루의 기록이 더 선명해져요."
              action={{ href: "/feed", label: "장소 탐색하기" }}
            />
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {d.posts.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-2xl bg-[#f7f4ef]">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center text-[11px] text-[#9b928b]">
                      사진 없음
                    </div>
                  )}
                  <div className="px-1.5 py-1">
                    <div className="truncate text-[10.5px] font-bold text-[#4b433e]">{p.place_name}</div>
                    <div className="truncate text-[9.5px] text-[#9b928b]">{p.author}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* 메뉴 도감 — 누적 레벨을 먼저 보여주고, 카드 목록은 필요할 때 연다. */}
      {menus && menus.length > 0 && (
        <div id="crew-menu-codex" className="mt-5 scroll-mt-20 border-t border-[#eee9e1] pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-[#a36b3b]" />
                <span className="text-[11px] font-bold text-[#a36b3b]">메뉴 도감</span>
                <span className="rounded-full bg-[#f7f1e8] px-2 py-0.5 text-[10px] font-black text-[#8b552e]">Lv.{dexProgress.level}</span>
              </div>
              <h3 className="mt-1 text-[16px] font-black tracking-[-0.03em] text-[#2f2925]">우리 크루의 맛집 기록</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[#8d837b]">인증 방문과 새로운 가게가 쌓일수록 도감 레벨이 올라가요.</p>
            </div>
            <button
              type="button"
              onClick={() => setDexOpen((v) => !v)}
              aria-expanded={dexOpen}
              className="flex shrink-0 items-center gap-1 rounded-full border border-[#eee1d1] bg-[#fffaf2] px-2.5 py-1.5 text-[10.5px] font-bold text-[#8b552e]"
            >
              메뉴 {unlockedCount}/{menus.length}
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${dexOpen ? "rotate-90" : ""}`} />
            </button>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <span className="text-[26px] font-black tracking-[-0.06em] text-[#2f2925]">{dexProgress.score}</span>
              <span className="ml-1 text-[11px] font-bold text-[#8d837b]">누적 활동</span>
            </div>
            <span className="pb-1 text-[10.5px] font-bold text-[#a36b3b]">
              {dexProgress.nextGoal === null ? "최고 레벨" : `다음 레벨까지 ${dexProgress.remaining}칸`}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-[#eee9e1]"
            role="progressbar"
            aria-label="메뉴 도감 레벨 진행도"
            aria-valuemin={0}
            aria-valuemax={dexProgress.nextGoal ?? Math.max(dexProgress.score, 1)}
            aria-valuenow={dexProgress.score}
          >
            <span className="block h-full rounded-full bg-[#e9a23b] transition-[width] duration-500" style={{ width: `${Math.round(dexProgress.progress * 100)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10.5px] text-[#9b928b]">
            <span>인증 방문 {verifiedVisits}회</span>
            <span>방문 가게 {visitedPlaces}곳</span>
          </div>

          {dexOpen && (
            <div className="mt-4 border-t border-[#eee9e1] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#8d837b]">발견한 메뉴</span>
                <span className="text-[10.5px] text-[#b0a69e]">방문한 가게에서 자동으로 쌓여요</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
              {[...menus].sort((a, b) => Number(b.unlocked) - Number(a.unlocked)).map((m) => (
                  <div key={m.key} className="overflow-hidden rounded-lg">
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.image}
                      alt=""
                      loading="lazy"
                      className={`aspect-square w-full object-cover bg-gray-100 ${m.unlocked ? "" : "grayscale opacity-40"}`}
                    />
                    <span className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[8px] font-black leading-none ${m.unlocked ? "bg-[#2f2925]/80 text-white" : "bg-black/45 text-white/85"}`}>
                      Lv.{m.level ?? (m.unlocked ? 2 : 1)}
                    </span>
                    {!m.unlocked && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Lock className="h-3.5 w-3.5 text-white drop-shadow" />
                      </span>
                    )}
                  </div>
                  <div className={`px-1 py-1 text-[9.5px] font-bold leading-tight ${m.unlocked ? "text-gray-700" : "text-gray-400"}`}>
                    {m.title}
                  </div>
                  <div className="px-1 pb-1 text-[8.5px] leading-tight text-[#a29a93]">
                    가게 {m.unique_places ?? 0}곳 · 방문 {m.visits ?? 0}회
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function getDexProgress(visits: number, places: number) {
  const score = Math.max(0, Math.floor(visits)) + Math.max(0, Math.floor(places))
  let levelIndex = 0
  for (let i = 1; i < DEX_LEVEL_GOALS.length; i += 1) {
    if (score < DEX_LEVEL_GOALS[i]) break
    levelIndex = i
  }

  const currentGoal = DEX_LEVEL_GOALS[levelIndex]
  const nextGoal = DEX_LEVEL_GOALS[levelIndex + 1] ?? null
  const progress = nextGoal === null
    ? 1
    : Math.min(1, Math.max(0, (score - currentGoal) / (nextGoal - currentGoal)))

  return {
    score,
    level: levelIndex + 1,
    nextGoal,
    remaining: nextGoal === null ? 0 : Math.max(0, nextGoal - score),
    progress,
  }
}

function ArchiveMetric({ label, value }: { label: string; value: string }) {
  return <div className="px-2 text-center"><div className="text-[14px] font-black text-[#4b433e]">{value}</div><div className="mt-0.5 text-[10px] text-[#9b928b]">{label}</div></div>
}

function PlaceThumbnail({ name, category, className }: { name: string; category?: string | null; className: string }) {
  const src = stockCandidates(name, category)[0]
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-2xl bg-[#f3efe8] ${className}`}>
      {/* 대표 이미지는 실제 매장 사진이 아니라 메뉴·업종을 설명하는 이미지임을 주변 문맥에서 알린다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
    </div>
  )
}

function Empty({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-2xl border border-[#eee9e1] bg-white px-4 py-6 text-center">
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-2xl bg-[#f7f1e8] text-[#b18a63]">{icon}</span>
      <p className="mt-2.5 text-[13px] font-bold text-[#4b433e]">{title}</p>
      <p className="mx-auto mt-1 max-w-[260px] text-[11.5px] leading-relaxed text-[#9b928b]">{text}</p>
      {action && (
        <Link href={action.href} className="mt-3 inline-flex rounded-xl bg-[#2b2622] px-3.5 py-2.5 text-[11.5px] font-bold text-white">
          {action.label}
        </Link>
      )}
    </div>
  )
}
