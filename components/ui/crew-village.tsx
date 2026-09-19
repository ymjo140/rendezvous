"use client"

import React from "react"
import { ArrowUpRight, Award, ChevronRight, Users, X } from "lucide-react"
import { CrewAvatar } from "@/components/ui/crew-avatar"

/**
 * 크루 마을의 시각적 기준점.
 *
 * 3D 이동이나 게임식 조작은 넣지 않는다. 한 장의 고정된 동네 장면 위에
 * 실제 크루 데이터(등급·방문·멤버)를 겹쳐 보여줘서, 서비스의 기록이 쌓이는
 * 느낌만 남긴다. 배경은 public/crew/village-hero.webp에서 관리한다.
 */

export type Member = {
  id: number
  name: string
  avatar: string
  avatar_id?: string | null
  gender?: string | null
  pose_id?: string | null
  is_host: boolean
  is_current_user?: boolean
  contribution?: {
    score: number
    recent_score: number
    verified_visits: number
    unique_places: number
    menu_types: number
    records: number
    last_activity?: string | null
  }
}

export type NeighborCrew = {
  id: string
  title: string
  icon: string
  members: number
  lists?: number
}

export type HeroPlace = {
  id: number
  name: string
  category?: string | null
  address?: string | null
  image?: string | null
  visits?: number
  last_visit?: string | null
}

type NextTier = { name: string; need: number; remain: number } | null | undefined

const CARD_BG = "url('/crew/village-hero.webp')"

export function CrewVillage({
  title,
  icon,
  tier,
  tierDesc,
  nextTier,
  members,
  unlocked,
  total,
  totalVisits = 0,
  regularCount = 0,
  heroPlace,
  memberCount,
  onEnter,
}: {
  title: string
  icon: string | null
  tier: string
  tierDesc?: string | null
  nextTier?: NextTier
  members: Member[]
  unlocked: number
  total: number
  totalVisits?: number
  regularCount?: number
  heroPlace?: HeroPlace | null
  memberCount?: number
  onEnter?: () => void
}) {
  const [membersOpen, setMembersOpen] = React.useState(false)
  const progress = nextTier
    ? Math.min(100, Math.round((unlocked / Math.max(nextTier.need, 1)) * 100))
    : 100
  // 대표 멤버는 최근 기여도 순으로 서버에서 정렬한다. 캐릭터 크기는
  // 인원에 따라 축소하지 않고, 전체 멤버는 별도 목록에서 확인하게 한다.
  const visibleMembers = members.slice(0, 4)
  const totalMemberCount = Math.max(memberCount ?? members.length, members.length)
  const remainingMembers = Math.max(0, totalMemberCount - visibleMembers.length)

  const sceneImage = heroPlace?.image || "/crew/village-hero.webp"
  const headline = heroPlace?.name || title
  const sceneEyebrow = heroPlace ? `대표 방문 장소 · ${title}` : `우리 크루 · ${title}`

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#e6d8c5] bg-white shadow-[0_12px_34px_rgba(100,70,40,0.12)]">
      <div className="relative h-[292px] overflow-hidden bg-[#ead9c2]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${sceneImage})` }}
          aria-label={heroPlace?.name ? `${heroPlace.name} 가게 앞` : "우리 크루 장소 장면"}
          role="img"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-[#4a3424]/20" />

        <div className="relative z-10 flex items-center justify-end gap-2 px-4 pt-4">
          <span className="rounded-full border border-white/90 bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#71472b] shadow-sm">
            {icon || "🍽️"} {tier}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-[112px] bg-[#d7b27f]/55" />
        <div className="absolute inset-x-3 bottom-1 z-10 flex min-h-[128px] items-end justify-center gap-1">
          {visibleMembers.length > 0 ? visibleMembers.map((member) => (
            <div key={member.id} className="flex w-1/4 min-w-0 flex-col items-center justify-end">
              <CrewAvatar
                memberId={member.id}
                avatarId={member.avatar_id}
                gender={member.gender}
                poseId={member.pose_id}
                name={member.name}
                size="md"
                mode="full"
                className="h-[112px] w-[84px] drop-shadow-[0_5px_4px_rgba(88,55,30,0.28)]"
              />
              <span className="-mt-0.5 max-w-full truncate rounded-full border border-white/90 bg-white px-2 py-1 text-[9px] font-bold text-[#503a2d] shadow-sm">
                {member.is_host ? "👑 " : ""}{member.name}
              </span>
            </div>
          )) : (
            <div className="mb-4 flex flex-col items-center justify-center rounded-2xl bg-white/90 px-6 py-3 text-center text-[10px] text-[#765b47]">
              <Users className="mb-1 h-4 w-4 text-[#c07a38]" />
              멤버를 초대하면 이곳에 함께 기록돼요
            </div>
          )}
        </div>
      </div>

      <div className="bg-white px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-[#f1e7da] pb-2.5">
          <span className="inline-flex min-w-0 items-center gap-1 text-[10px] font-bold text-[#9b7455]">
            <Award className="h-3.5 w-3.5 shrink-0 text-[#d59a3a]" />
            대표 멤버 · 최근 기여도 순
          </span>
          {totalMemberCount > 0 && (
            <button
              type="button"
              onClick={() => setMembersOpen(true)}
              className="shrink-0 rounded-full bg-[#fff7e7] px-2.5 py-1.5 text-[10px] font-bold text-[#a86613] transition-colors hover:bg-[#ffefc9]"
            >
              {remainingMembers > 0 ? `전체 멤버 +${remainingMembers}명` : `멤버 ${totalMemberCount}명`}
            </button>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.12em] text-[#b17b4f]">{sceneEyebrow}</p>
            <h2 className="mt-1 text-[21px] font-black leading-tight tracking-[-0.04em] text-[#35261e]">{headline}</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#715644]">
              {heroPlace
                ? `${heroPlace.category || "장소"}${heroPlace.address ? ` · ${heroPlace.address}` : ""}`
                : "아직 대표 방문 장소가 없어요. 첫 방문을 기록하면 가게 앞 장면이 생겨요."}
            </p>
          </div>
          <button
            type="button"
            onClick={onEnter}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#3a2b23] px-3 py-2 text-[11px] font-bold text-white shadow-sm transition-transform active:scale-95"
          >
            기록 열기 <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-3 rounded-xl bg-[#fff8ed] px-3 py-2.5 text-[11px] leading-relaxed text-[#735844]">
          {tierDesc || "우리만의 방문 기록을 차곡차곡 쌓아보세요."}
        </p>

        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <Metric label="새로운 장소" value={unlocked} />
          <Metric label="메뉴 도감" value={`${unlocked}/${total}`} />
          <Metric label="단골집" value={regularCount} />
          <Metric label="함께 방문" value={totalVisits} />
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-[#8b6f5c]">
          <span>다음 등급까지 {nextTier ? `${nextTier.remain}가지` : "모든 기록 완료"}</span>
          <div className="ml-3 h-1.5 max-w-[120px] flex-1 overflow-hidden rounded-full bg-[#ead9c5]">
            <div className="h-full rounded-full bg-[#e79c47] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {membersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#24170f]/45 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="크루 멤버 목록"
          onClick={() => setMembersOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-[26px] bg-white shadow-[0_20px_60px_rgba(39,24,13,0.25)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#f1e7da] px-4 py-4">
              <div>
                <p className="text-[10px] font-extrabold tracking-[0.14em] text-[#b17b4f]">CREW MEMBERS</p>
                <h3 className="mt-1 text-[17px] font-black text-[#35261e]">{title} · 멤버 {totalMemberCount}명</h3>
                <p className="mt-1 text-[10.5px] text-[#967860]">대표 멤버는 최근 30일 기여도를 우선해 보여줘요.</p>
              </div>
              <button
                type="button"
                onClick={() => setMembersOpen(false)}
                className="rounded-full bg-[#fff8ed] p-2 text-[#9b7455]"
                aria-label="멤버 목록 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[58vh] space-y-1.5 overflow-y-auto px-3 py-3">
              {members.map((member, index) => {
                const contribution = member.contribution
                const detail = contribution && contribution.score > 0
                  ? `기여 ${contribution.score}점 · 방문 ${contribution.verified_visits}회 · 기록 ${contribution.records}개`
                  : "아직 활동 기록이 없어요"
                return (
                  <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-[#f2eadf] bg-[#fffdf9] px-3 py-2.5">
                    <span className="w-5 text-center text-[11px] font-black text-[#c69a69]">{index + 1}</span>
                    <CrewAvatar
                      memberId={member.id}
                      avatarId={member.avatar_id}
                      gender={member.gender}
                      poseId={member.pose_id}
                      name={member.name}
                      size="sm"
                      mode="portrait"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-bold text-[#4a3527]">
                        {member.is_host ? "👑 " : ""}{member.name}{member.is_current_user ? " · 나" : ""}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-[#a1846b]">{detail}</div>
                    </div>
                    {contribution && contribution.score > 0 && (
                      <span className="shrink-0 rounded-full bg-[#fff3d8] px-2 py-1 text-[10px] font-black text-[#b5741c]">{contribution.score}</span>
                    )}
                  </div>
                )
              })}
              {members.length < totalMemberCount && (
                <p className="px-2 pt-1 text-center text-[10px] text-[#a1846b]">멤버 목록을 불러오는 중이거나 일부 멤버가 비공개 상태예요.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-[14px] font-black text-[#3e2c20]">{value}</div>
      <div className="mt-0.5 text-[9.5px] font-medium text-[#a1846b]">{label}</div>
    </div>
  )
}

/** 다른 크루의 공개 공간을 둘러보는 가로 탐색 스트립. */
export function NeighborStrip({
  crews,
  onVisit,
}: { crews: NeighborCrew[]; onVisit: (id: string) => void }) {
  if (crews.length === 0) return null
  return (
    <section className="mt-5">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <p className="text-[10px] font-extrabold tracking-[0.14em] text-[#b17b4f]">CREW EXCHANGE</p>
          <h3 className="mt-0.5 text-[16px] font-black tracking-[-0.03em] text-slate-900">다른 크루의 기록 구경하기</h3>
        </div>
        <span className="pb-0.5 text-[10.5px] text-slate-400">좋은 곳은 우리 리스트로</span>
      </div>
      <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]" style={{ WebkitOverflowScrolling: "touch" }}>
        {crews.map((crew, index) => (
          <button
            key={crew.id}
            type="button"
            onClick={() => onVisit(crew.id)}
            className="group w-[160px] shrink-0 overflow-hidden rounded-[20px] border border-slate-100 bg-white text-left shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition-transform active:scale-[.98]"
          >
            <div
              className="relative h-[84px] bg-cover bg-center"
              style={{ backgroundImage: CARD_BG, backgroundPosition: `${42 + (index % 3) * 18}% center` }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#33231b]/70 via-transparent to-transparent" />
              <span className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-xl border border-white/70 bg-white/90 text-lg shadow-sm">
                {crew.icon || "🍽️"}
              </span>
              <span className="absolute right-2 top-2 rounded-full bg-white/88 px-2 py-1 text-[9px] font-bold text-[#785035]">
                공개 기록
              </span>
            </div>
            <div className="px-3 py-2.5">
              <div className="truncate text-[12px] font-bold text-slate-900">{crew.title}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                <span>{crew.members}명 멤버</span>
                {typeof crew.lists === "number" && <><span>·</span><span>리스트 {crew.lists}</span></>}
              </div>
              <div className="mt-2 inline-flex items-center gap-0.5 text-[10px] font-bold text-[#b46b32]">
                둘러보기 <ChevronRight className="h-3 w-3" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
