"use client"

// 🧪 [redesign/group-home] 크루 프로필 — 집단 정체성 = 큐레이션 보증
// /api/groups/{cid} 재활용 + 방문 인증 배지(member_visits 기반) + 리스트 재방문 뱃지.

import React, { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, RotateCw, Users, Plus, BadgeCheck, Bookmark, Share2, Loader2 } from "lucide-react"
import { shareCrewInvite } from "@/lib/kakao"
import { VerifySheet, CREW_TYPE_META } from "../../verify-sheet"
import { fetchWithAuth } from "@/lib/api-client"

type CrewList = {
  id: number; name: string; icon: string; description: string
  item_count: number; like_count: number; comment_count: number
  context_tag: string | null; revisit: number
  preview: { place_id: number; name: string }[]
}
type Crew = {
  id: string; title: string; description: string; icon: string; visibility: string
  crew_type?: string; org_name?: string | null; verified_members?: number
  partnership_eligible?: boolean; partnership_track?: "org" | "activity" | null
  member_count: number; follower_count: number; like_count: number; list_count: number
  is_following: boolean; is_member: boolean; is_host: boolean
  members: { id: number; name: string; avatar: string; is_host: boolean }[]
  lists: CrewList[]
  member_visits: number; member_revisits: number; visit_verified: boolean
}

const TAG_LABEL: Record<string, string> = {
  date: "💕 데이트", work: "🥂 회식", drink: "🍶 술 한잔", cafe: "☕ 카페",
  solo: "🍚 혼밥", friends: "🍻 친구", family: "🍲 가족", special: "🎂 기념일",
}

const VIS_LABEL: Record<string, string> = {
  private: "🔒 우리끼리", list_only: "📋 리스트만 공개", public: "🌟 크루 공개", open: "💬 오픈 크루",
}

export default function CrewProfilePage() {
  const router = useRouter()
  const params = useParams<{ cid: string }>()
  const sp = useSearchParams()
  const justCreated = sp.get("created") === "1"
  const justJoined = sp.get("joined") === "1"
  const isInvite = sp.get("invite") === "1"
  const [crew, setCrew] = useState<Crew | null>(null)
  const [loading, setLoading] = useState(true)
  const [joinBusy, setJoinBusy] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [verifyNeed, setVerifyNeed] = useState<null | { kind: "university" | "company"; org: string }>(null)

  const doJoin = async () => {
    if (!params?.cid || joinBusy) return
    setJoinBusy(true)
    try {
      const res = await fetchWithAuth(`/api/crews/${params.cid}/join`, { method: "POST" })
      if (res.status === 401) { router.push(`/login?crew=${params.cid}`); return }
      if (res.status === 403) {
        const d = await res.json().catch(() => null)
        if (d?.detail?.code === "verify_required") {
          setVerifyNeed({ kind: d.detail.kind, org: d.detail.org_name || d.detail.domain || "" })
          return
        }
      }
      if (res.ok) {
        // 합류 성공 — 멤버 시점으로 다시 로드
        window.location.href = `/home-next/crew/${params.cid}?joined=1`
      }
    } catch { /* ignore */ } finally { setJoinBusy(false) }
  }

  const doInvite = async () => {
    if (!crew) return
    const { result } = await shareCrewInvite({ crewId: crew.id, crewTitle: crew.title, icon: crew.icon, memberCount: crew.member_count })
    if (result === "copied") { setShareMsg("초대 링크를 복사했어요 — 카톡에 붙여넣어 보내세요!"); setTimeout(() => setShareMsg(null), 3000) }
    else if (result === "none") { setShareMsg("공유를 지원하지 않는 환경이에요."); setTimeout(() => setShareMsg(null), 3000) }
  }

  useEffect(() => {
    if (!params?.cid) return
    fetchWithAuth(`/api/groups/${params.cid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCrew(d))
      .catch(() => setCrew(null))
      .finally(() => setLoading(false))
  }, [params?.cid])

  const follow = async () => {
    if (!crew) return
    try {
      const res = await fetchWithAuth(`/api/groups/${crew.id}/follow`, { method: crew.is_following ? "DELETE" : "POST" })
      if (res.ok) setCrew({ ...crew, is_following: !crew.is_following, follower_count: crew.follower_count + (crew.is_following ? -1 : 1) })
    } catch { /* ignore */ }
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-16">

      <div className="sticky top-0 z-10 flex items-center gap-2 bg-white px-4 py-3">
        <button onClick={() => router.back()} className="rounded-full p-1 text-slate-500">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-[15px] font-semibold text-slate-900">크루</span>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">불러오는 중...</div>
      ) : !crew ? (
        isInvite ? (
          <div className="px-4 py-16 text-center">
            <div className="text-4xl">💌</div>
            <h2 className="mt-3 text-[16px] font-bold text-slate-900">크루에 초대받았어요!</h2>
            <p className="mt-1.5 text-[12px] text-slate-400">비공개 크루라 합류하면 리스트가 보여요.</p>
            <button
              onClick={doJoin}
              disabled={joinBusy}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#F5A623] px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {joinBusy && <Loader2 className="h-4 w-4 animate-spin" />}크루 합류하기
            </button>
          </div>
        ) : (
          <div className="py-20 text-center text-sm text-slate-400">크루를 찾을 수 없어요.</div>
        )
      ) : (
        <>
          {justCreated && (
            <div className="mx-4 mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-center">
              <div className="text-2xl">🎉</div>
              <p className="mt-1 text-[13px] font-semibold text-amber-700">크루가 만들어졌어요!</p>
              <p className="mt-0.5 text-[11px] text-[#F5A623]">친구를 초대하고 맛집을 담으면 리스트가 자라나요.</p>
            </div>
          )}
          {justJoined && (
            <div className="mx-4 mb-3 rounded-2xl bg-emerald-50 px-4 py-3 text-center">
              <div className="text-2xl">🤝</div>
              <p className="mt-1 text-[13px] font-semibold text-emerald-700">{crew.title}에 합류했어요!</p>
              <p className="mt-0.5 text-[11px] text-emerald-500">이제 크루 리스트에 맛집을 함께 담을 수 있어요.</p>
            </div>
          )}

          {/* 헤더 */}
          <div className="px-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-3xl">{crew.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h1 className="truncate text-lg font-bold text-slate-900">{crew.title}</h1>
                  {crew.visit_verified && <BadgeCheck className="h-5 w-5 shrink-0 text-[#F5A623]" />}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                  {crew.crew_type && crew.crew_type !== "friends" && (
                    <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {CREW_TYPE_META[crew.crew_type]?.emoji} {crew.org_name || CREW_TYPE_META[crew.crew_type]?.label}
                      {(crew.verified_members ?? 0) > 0 && ` · 인증 ${crew.verified_members}명`}
                    </span>
                  )}
                  <span>{VIS_LABEL[crew.visibility] || crew.visibility}</span>
                </div>
              </div>
              {crew.is_member ? (
                <button
                  onClick={doInvite}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-[#F5A623] px-3.5 py-2 text-[12px] font-semibold text-white"
                >
                  <Share2 className="h-3.5 w-3.5" />초대
                </button>
              ) : isInvite ? (
                <button
                  onClick={doJoin}
                  disabled={joinBusy}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-[#F5A623] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  {joinBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}합류하기
                </button>
              ) : (
                <button
                  onClick={follow}
                  className={`shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold ${
                    crew.is_following ? "bg-slate-100 text-slate-500" : "bg-[#F5A623] text-white"
                  }`}
                >
                  {crew.is_following ? "팔로잉" : "팔로우"}
                </button>
              )}
            </div>
            {crew.description && <p className="mt-2.5 text-[13px] leading-relaxed text-slate-600">{crew.description}</p>}

            {/* 제휴 자격 — 소속 인증 or 활동 실적, 가게 제휴 딜 참여 조건 */}
            {crew.partnership_eligible ? (
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-50 px-3.5 py-2.5">
                <span className="text-lg">🤝</span>
                <p className="text-[12.5px] font-medium text-amber-800">
                  제휴 자격 크루 — 가게 제휴 딜에 참여할 수 있어요
                  <span className="ml-1 text-[10.5px] font-normal text-amber-600">
                    {crew.partnership_track === "org" ? "(소속 인증)" : "(활동 인증)"}
                  </span>
                </p>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl bg-slate-50 px-3.5 py-2.5">
                <p className="text-[12px] text-slate-500">
                  🤝 제휴 자격까지: <b>멤버 3명+ · 함께 방문 3회+</b>가 필요해요.
                  방문 기록이 쌓이면 자동으로 자격이 생겨요.
                </p>
              </div>
            )}

            {/* 방문 인증 배지 — 이 크루의 신뢰 근거 */}
            <div className={`mt-3 rounded-2xl px-3.5 py-3 ${crew.visit_verified ? "bg-emerald-50" : "bg-slate-50"}`}>
              {crew.visit_verified ? (
                <p className="text-[12.5px] font-medium text-emerald-700">
                  ✅ 방문 인증 크루 — 멤버들이 리스트 장소에 <b>실제 방문 {crew.member_visits}회</b>, 재방문 의사 {crew.member_revisits}회를 남겼어요.
                </p>
              ) : (
                <p className="text-[12.5px] text-slate-500">
                  아직 방문 인증 전이에요. 멤버가 리스트 장소를 방문하고 기록을 남기면 ✅ 인증 배지가 붙어요.
                </p>
              )}
            </div>

            {/* 지표 */}
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[
                { v: crew.member_count, l: "멤버" },
                { v: crew.list_count, l: "리스트" },
                { v: crew.follower_count, l: "팔로워" },
                { v: crew.member_revisits, l: "재방문" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl bg-slate-50 py-2.5 text-center">
                  <div className="text-[15px] font-bold text-slate-900">{s.v}</div>
                  <div className="text-[10px] text-slate-400">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 리스트 */}
          <div className="mt-5 px-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-slate-900">크루의 맛집 리스트</h2>
              {crew.is_member && (
                <button className="flex items-center gap-1 text-[12px] font-medium text-[#F5A623]">
                  <Plus className="h-3.5 w-3.5" />리스트 추가
                </button>
              )}
            </div>
            {crew.lists.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-10 text-center">
                <p className="text-[13px] text-slate-400">아직 리스트가 없어요.</p>
                {crew.is_member && <p className="mt-1 text-[11px] text-slate-300">첫 맛집 리스트를 만들어보세요!</p>}
              </div>
            ) : (
              <div className="space-y-2.5">
                {crew.lists.map((l) => (
                  <article
                    key={l.id}
                    onClick={() => router.push(`/lists/${l.id}`)}
                    className="cursor-pointer rounded-2xl border border-slate-100 p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl">{l.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-slate-900">{l.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span>{l.item_count}곳</span>
                          {l.context_tag && TAG_LABEL[l.context_tag] && (
                            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] text-[#F5A623]">{TAG_LABEL[l.context_tag]}</span>
                          )}
                          {l.revisit > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              <RotateCw className="h-2.5 w-2.5" />재방문 {l.revisit}명
                            </span>
                          )}
                        </div>
                      </div>
                      <Bookmark className="h-4 w-4 shrink-0 text-slate-300" />
                    </div>
                    {l.preview.length > 0 && (
                      <p className="mt-2 truncate text-[11.5px] text-slate-400">
                        {l.preview.map((p) => p.name).join(" · ")}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* 멤버 */}
          {crew.members.length > 0 && (
            <div className="mt-5 px-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-[15px] font-semibold text-slate-900">
                <Users className="h-4 w-4 text-slate-400" />멤버 {crew.member_count}
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {crew.members.map((m) => (
                  <div key={m.id} className="flex w-[70px] shrink-0 flex-col items-center gap-1">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-xl">{m.avatar}</span>
                    <span className="w-full truncate text-center text-[10px] text-slate-500">
                      {m.name}{m.is_host && " 👑"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {verifyNeed && (
        <VerifySheet
          kind={verifyNeed.kind}
          requireOrgName={verifyNeed.org}
          onClose={() => setVerifyNeed(null)}
          onDone={() => { setVerifyNeed(null); doJoin() }}
        />
      )}
      {shareMsg && (
        <div className="fixed bottom-6 left-1/2 z-50 max-w-[90%] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg">
          {shareMsg}
        </div>
      )}
    </div>
  )
}
