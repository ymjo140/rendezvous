"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Camera, ChevronRight, Clock3, Loader2, Lock, MapPin, ShieldCheck, Star } from "lucide-react"
import { useCrewResource } from "@/lib/use-crew-resource"
import { CrewLoadError } from "@/components/ui/crew-load-error"
import { stockCandidates } from "@/lib/stock-image"

/** 크루의 얼굴 — 리스트 · 방문기록 · 게시물.
 *
 *  '우리 크루'는 보여주는 곳, '내 크루'는 운영하는 곳(채팅·예약·제휴)으로 갈랐다.
 *  놀러온 사람이 볼 게 여기 다 있어야 '다른 크루 놀러가기'가 성립한다.
 *
 *  25칸 메뉴 도감을 기본으로 깔지 않는 이유: 잠긴 22칸이 화면 대부분을 먹는다.
 *  안 가본 곳을 크게 보여줄 이유가 없고, 방문기록이 같은 걸 더 구체적으로 말한다 —
 *  '콩뼈숯뼈감자탕'이 '국밥·탕'보다 자랑거리다. 도감은 접어서 눌러야 열린다.
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
  source_label: "signed_qr" | "merchant_approval" | "mixed" | "unknown"
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
type Menu = { key: string; title: string; unlocked: boolean; place_name: string | null; image: string }

const TABS = [
  { key: "visits", label: "방문기록" },
  { key: "lists", label: "리스트" },
  { key: "posts", label: "게시물" },
] as const

export type ShowcaseTab = (typeof TABS)[number]["key"]

export function CrewShowcase({
  groupId,
  menus,
  activeTab,
  onTabChange,
}: {
  groupId: string
  menus?: Menu[]
  activeTab?: ShowcaseTab
  onTabChange?: (tab: ShowcaseTab) => void
}) {
  const router = useRouter()
  const [internalTab, setInternalTab] = React.useState<ShowcaseTab>("visits")
  const tab = activeTab ?? internalTab
  const { data: d, loading, error, refreshing, reload } = useCrewResource<{ lists: List[]; visits: Visit[]; posts: Post[]; visit_archive?: VisitArchiveItem[]; visit_summary?: VisitSummary | null }>(`/api/groups/${encodeURIComponent(groupId)}/showcase`)
  const [dexOpen, setDexOpen] = React.useState(false)


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

  return (
    <section id="crew-showcase" className="mt-4 scroll-mt-20">
      {(refreshing || error) && (
        <div className="mb-2 flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[10.5px] text-slate-400" role="status">
          {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
          {error ? "마지막으로 확인된 아카이브를 보여드리고 있어요." : "최신 아카이브를 확인하는 중이에요."}
        </div>
      )}
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setInternalTab(t.key)
              onTabChange?.(t.key)
            }}
            className={`flex-1 rounded-xl py-2 text-[12.5px] font-bold transition-colors ${
              tab === t.key ? "bg-amber-100 text-amber-800" : "bg-gray-50 text-gray-400"
            }`}
          >
            {t.label} {count[t.key] > 0 && <span className="ml-0.5">{count[t.key]}</span>}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tab === "visits" && (
          <div className="space-y-3">
            {d.visit_summary && (
            <div className="rounded-2xl border border-amber-100 bg-[linear-gradient(135deg,#fff8ec,#fff)] px-3.5 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-900"><ShieldCheck className="h-4 w-4 text-amber-600" /> 검증 방문 아카이브</span>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-amber-700 shadow-sm">
                    {d.visit_summary.observed ? "관찰 중" : "기록 대기"}
                  </span>
                </div>
                {d.visit_summary.observed ? (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <ArchiveMetric label="함께 방문" value={`${d.visit_summary.visits}회`} />
                    <ArchiveMetric label="새로운 장소" value={`${d.visit_summary.unique_places}곳`} />
                    <ArchiveMetric label="재방문" value={`${d.visit_summary.revisits}회`} />
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
                    실제 방문 인증 데이터가 쌓이면 이곳에 기록돼요. 예약·의향·기존 체크인은 포함하지 않아요.
                  </p>
                )}
              </div>
            )}

            {d.visit_archive && d.visit_archive.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-slate-500">최근 방문</p>
                <div className="space-y-1.5">
                  {d.visit_archive.map((v) => (
                    <div key={v.id} className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-2.5 py-2.5 shadow-[0_2px_8px_rgba(15,23,42,0.03)]">
                      <PlaceThumbnail name={v.place_name} className="h-11 w-11" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold text-gray-900">{v.place_name}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                          <Clock3 className="h-3 w-3 text-slate-300" />
                          {v.visit_date_kst} · {v.participant_count}명 · {v.source_label === "signed_qr" ? "QR 인증" : v.source_label === "merchant_approval" ? "점주 승인" : v.source_label === "mixed" ? "복합 인증" : "인증 확인"}
                        </div>
                      </div>
                      <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${v.revisit ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {v.revisit ? `재방문 ${v.visit_number}` : "첫 방문"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {d.visits.length === 0 ? (
              <Empty icon={<MapPin className="h-5 w-5" />} title="아직 함께 간 곳이 없어요" text="장소를 저장하고 다녀온 뒤 체크인하면, 크루의 첫 방문 기록이 이곳에 남아요." />
            ) : (
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-slate-500">장소별 요약</p>
                <div className="space-y-1.5">
                  {d.visits.map((v) => (
                    <button
                      key={v.place_id}
                      onClick={() => router.push(`/places/${v.place_id}`)}
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${
                        v.is_regular ? "border-amber-200 bg-amber-50/50" : "border-gray-100 bg-white"
                      }`}
                    >
                      <PlaceThumbnail name={v.name} category={v.menu} className="h-12 w-12" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold text-gray-900">{v.name}</div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                          {v.is_regular ? <Star className="h-3 w-3 text-[#F5A623]" fill="#F5A623" /> : <MapPin className="h-3 w-3 text-gray-300" />}
                          {v.menu} · 마지막 {v.last_date}
                        </div>
                      </div>
                      <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${v.is_regular ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"}`}>
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
            <Empty icon={<BookIcon />} title="아직 공개 리스트가 없어요" text="가고 싶은 곳을 모아두면 다른 크루도 이 기록을 발견할 수 있어요." />
          ) : (
            <div className="space-y-1.5">
              {d.lists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => router.push(`/lists/${l.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-left"
                >
                  {l.cover_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.cover_image} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-[16px]">📒</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-gray-900">{l.name}</div>
                    <div className="truncate text-[11px] text-gray-500">
                      {l.count}곳{l.description ? ` · ${l.description}` : ""}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
                </button>
              ))}
            </div>
          )
        )}

        {tab === "posts" && (
            d.posts.length === 0 ? (
            <Empty icon={<Camera className="h-5 w-5" />} title="아직 리뷰 사진이 없어요" text="다녀온 가게에 사진과 한 줄 평을 남기면 크루의 기록이 더 선명해져요." />
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {d.posts.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-xl border border-gray-100">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-gray-50 text-[11px] text-gray-400">
                      사진 없음
                    </div>
                  )}
                  <div className="px-1.5 py-1">
                    <div className="truncate text-[10.5px] font-bold text-gray-700">{p.place_name}</div>
                    <div className="truncate text-[9.5px] text-gray-400">{p.author}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* 메뉴 도감 — 접어둔다. 잠긴 칸이 화면을 먹지 않게. */}
      {menus && menus.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setDexOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-gray-100 px-3.5 py-2.5"
          >
            <span className="text-[13px] font-bold text-gray-800">메뉴 도감</span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-gray-400">
              {unlockedCount} / {menus.length}종
              <ChevronRight className={`h-4 w-4 transition-transform ${dexOpen ? "rotate-90" : ""}`} />
            </span>
          </button>
          {dexOpen && (
            <div className="mt-2 grid grid-cols-4 gap-1.5">
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
                    {!m.unlocked && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Lock className="h-3.5 w-3.5 text-white drop-shadow" />
                      </span>
                    )}
                  </div>
                  <div className={`px-1 py-1 text-[9.5px] font-bold leading-tight ${m.unlocked ? "text-gray-700" : "text-gray-400"}`}>
                    {m.title}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ArchiveMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/85 px-2 py-2 text-center"><div className="text-[13px] font-black text-amber-900">{value}</div><div className="mt-0.5 text-[9.5px] text-amber-700/70">{label}</div></div>
}

function PlaceThumbnail({ name, category, className }: { name: string; category?: string | null; className: string }) {
  const src = stockCandidates(name, category)[0]
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl bg-amber-50 ${className}`}>
      {/* 대표 이미지는 실제 매장 사진이 아니라 메뉴·업종을 설명하는 이미지임을 주변 문맥에서 알린다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
    </div>
  )
}

function BookIcon() {
  return <span className="text-lg" aria-hidden="true">📚</span>
}

function Empty({ icon, title, text }: { icon?: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-7 text-center">
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-300 shadow-sm">{icon}</span>
      <p className="mt-2.5 text-[12.5px] font-bold text-slate-600">{title}</p>
      <p className="mx-auto mt-1 max-w-[250px] text-[11px] leading-relaxed text-slate-400">{text}</p>
    </div>
  )
}
