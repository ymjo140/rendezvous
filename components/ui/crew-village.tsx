"use client"

import React from "react"
import { ArrowUpRight, ChevronRight, MapPin, Users } from "lucide-react"
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
  is_host: boolean
}

export type NeighborCrew = {
  id: string
  title: string
  icon: string
  members: number
  lists?: number
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
  onEnter?: () => void
}) {
  const progress = nextTier
    ? Math.min(100, Math.round((unlocked / Math.max(nextTier.need, 1)) * 100))
    : 100
  // 모바일에서는 멤버를 한 줄에 3명까지만 크게 보여준다. 나머지는 +N으로
  // 접어서 캐릭터가 작아지거나 카드 밖으로 밀리지 않게 한다.
  const visibleMembers = members.slice(0, 3)
  const remainingMembers = Math.max(0, members.length - visibleMembers.length)

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#e6d8c5] bg-[#f1e2ce] shadow-[0_12px_34px_rgba(100,70,40,0.12)]">
      <div
        className="relative overflow-hidden bg-cover bg-center px-4 pb-4"
        style={{ backgroundImage: CARD_BG }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,250,241,.12)_0%,rgba(255,249,239,.05)_35%,rgba(45,30,20,.12)_64%,rgba(37,26,18,.58)_100%)]" />

        <div className="relative z-[1] flex items-center justify-between gap-2 pt-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/82 px-2.5 py-1.5 text-[10px] font-extrabold tracking-[0.13em] text-[#5e4533] shadow-sm backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e59843]" /> OUR CREW
          </span>
          <span className="rounded-full border border-white/70 bg-[#fffaf2]/90 px-2.5 py-1.5 text-[11px] font-bold text-[#89552d] shadow-sm backdrop-blur-sm">
            {icon || "🍽️"} {tier}
          </span>
        </div>

        {/* 텍스트·도감은 grid로 배치한다. 예전처럼 absolute로 고정하지 않아
            작은 화면에서 도감이 제목과 멤버 창을 덮지 않는다. */}
        <div className="relative z-[1] mt-8 grid grid-cols-1 gap-3 min-[430px]:grid-cols-[minmax(0,1fr)_126px] min-[430px]:items-end">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[#7e5c44]">함께 고르고, 실제로 다녀온 기록</p>
            <h2 className="mt-1.5 text-[23px] font-black leading-[1.12] tracking-[-0.04em] text-[#35261e] drop-shadow-[0_1px_0_rgba(255,255,255,.5)]">
              {title}
            </h2>
            <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-[#624737]">
              {tierDesc || "우리만의 방문 기록을 차곡차곡 쌓아보세요."}
            </p>
            <button
              type="button"
              onClick={onEnter}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#3a2b23] px-3.5 py-2 text-[11px] font-bold text-white shadow-md transition-transform active:scale-95"
            >
              크루 기록 열기 <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="w-full rounded-2xl border border-white/65 bg-white/76 p-2.5 shadow-sm backdrop-blur-md min-[430px]:w-[126px]">
            <div className="flex items-center justify-between text-[10px] font-bold text-[#6f4c34]">
              <span>메뉴 도감</span><span>{unlocked}/{total}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ead9c5]">
              <div className="h-full rounded-full bg-[#e79c47] transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1.5 text-[9.5px] leading-snug text-[#8b6f5c]">
              {nextTier ? `다음 등급까지 ${nextTier.remain}가지` : "모든 메뉴를 기록했어요"}
            </p>
          </div>
        </div>

        {/* 멤버 창도 일반 흐름에 포함시킨다. 캐릭터가 콘텐츠를 가리지 않고
            카드 높이가 멤버 수와 화면 폭에 맞춰 함께 늘어난다. */}
        <div className="relative z-[2] mt-4 rounded-[22px] border border-white/70 bg-[#fffaf2]/92 px-3 pb-2.5 pt-1.5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[#80634d]">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-[#c87b36]" /> 함께한 멤버 {members.length}명</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-[#c87b36]" /> 방문 {totalVisits}회</span>
          </div>
          <div className="mt-1.5 grid min-h-[104px] grid-cols-3 items-end gap-1">
            {visibleMembers.length > 0 ? visibleMembers.map((member) => (
              <div key={member.id} className="flex min-w-0 flex-col items-center">
                <CrewAvatar
                  memberId={member.id}
                  avatarId={member.avatar_id}
                  gender={member.gender}
                  name={member.name}
                  size="md"
                  mode="full"
                  className="h-[96px] w-[72px] drop-shadow-[0_5px_4px_rgba(88,55,30,0.18)]"
                />
                <span className="mt-[-1px] max-w-full truncate rounded-full bg-white/75 px-1.5 text-[9px] font-semibold text-[#755a45]">
                  {member.is_host ? "👑 " : ""}{member.name}
                </span>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-2 text-center text-[10px] text-[#a4866d]">
                <Users className="mb-1 h-4 w-4 text-[#d1ae8b]" />
                멤버를 초대하면<br />이곳에 함께 기록돼요
              </div>
            )}
            {remainingMembers > 0 && (
              <span className="col-span-3 justify-self-center rounded-full border border-white/80 bg-[#3a2b23] px-2 py-1 text-[9px] font-bold text-white shadow-sm">
                +{remainingMembers}명 더 보기
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-[#ead8c1] bg-[#fffaf2] px-2 py-2.5">
        <Metric label="새로운 장소" value={unlocked} />
        <Metric label="단골집" value={regularCount} />
        <Metric label="다음 기록" value={nextTier ? `${nextTier.remain}곳` : "완료"} />
      </div>
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
