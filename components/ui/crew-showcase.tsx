"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Loader2, MapPin, Star, Lock, ChevronRight } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

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
type Post = { id: string; content: string | null; image: string | null; place_name: string; author: string; created_at: string; likes: number }
type Menu = { key: string; title: string; unlocked: boolean; place_name: string | null; image: string }

const TABS = [
  { key: "visits", label: "방문기록" },
  { key: "lists", label: "리스트" },
  { key: "posts", label: "게시물" },
] as const

export function CrewShowcase({ groupId, menus }: { groupId: string; menus?: Menu[] }) {
  const router = useRouter()
  const [tab, setTab] = React.useState<(typeof TABS)[number]["key"]>("visits")
  const [d, setD] = React.useState<{ lists: List[]; visits: Visit[]; posts: Post[] } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [dexOpen, setDexOpen] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    fetchWithAuth(`/api/groups/${groupId}/showcase`)
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => { if (alive && x) setD(x) })
      .catch(() => { /* 못 불러와도 마을은 보여야 한다 */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [groupId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중
      </div>
    )
  }
  if (!d) return null

  const count = { visits: d.visits.length, lists: d.lists.length, posts: d.posts.length }
  const unlockedCount = (menus || []).filter((m) => m.unlocked).length

  return (
    <section className="mt-4">
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
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
          d.visits.length === 0 ? (
            <Empty text="아직 함께 간 곳이 없어요. 다녀와서 체크인하면 여기 쌓입니다." />
          ) : (
            <div className="space-y-1.5">
              {d.visits.map((v) => (
                <button
                  key={v.place_id}
                  onClick={() => router.push(`/places/${v.place_id}`)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${
                    v.is_regular ? "border-amber-200 bg-amber-50/50" : "border-gray-100 bg-white"
                  }`}
                >
                  {v.is_regular
                    ? <Star className="h-4 w-4 flex-shrink-0 text-[#F5A623]" fill="#F5A623" />
                    : <MapPin className="h-4 w-4 flex-shrink-0 text-gray-300" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-gray-900">{v.name}</div>
                    <div className="text-[11px] text-gray-500">
                      {v.menu} · 마지막 {v.last_date}
                      {v.is_regular && <span className="ml-1 font-bold text-amber-700">단골집</span>}
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-[11.5px] font-bold text-gray-400">{v.visits}회</span>
                </button>
              ))}
            </div>
          )
        )}

        {tab === "lists" && (
          d.lists.length === 0 ? (
            <Empty text="아직 만든 리스트가 없어요. 가고 싶은 곳을 모아 리스트로 만들어보세요." />
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
            <Empty text="아직 올린 게시물이 없어요. 다녀온 가게에 사진을 올리면 여기 모입니다." />
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

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-[12px] leading-relaxed text-gray-400">
      {text}
    </p>
  )
}
