"use client"

import { Award, BookOpen, MapPin, Star } from "lucide-react"
import { CrewAvatar } from "@/components/ui/crew-avatar"
import type { ShowcaseTab } from "@/components/ui/crew-showcase"

type LoungeMember = {
  id: number
  name: string
  avatar: string
  avatar_id?: string | null
  gender?: string | null
  is_host: boolean
}

type CrewLoungeProps = {
  title: string
  members: LoungeMember[]
  visitVerified: boolean
  memberVisits: number
  memberRevisits: number
  onOpenShowcase?: (tab: ShowcaseTab) => void
  onOpenRanking?: () => void
}

export function CrewLounge({
  title,
  members,
  visitVerified,
  memberVisits,
  memberRevisits,
  onOpenShowcase,
  onOpenRanking,
}: CrewLoungeProps) {
  const seated = members.slice(0, 5)

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-[#eadbc7] bg-[#fffaf2]">
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-[#b88a5a]">OUR CREW LOUNGE</p>
          <h2 className="mt-0.5 text-[16px] font-bold text-[#3e3025]">{title}의 라운지</h2>
          <p className="mt-1 text-[11px] text-[#8b7664]">함께 다녀온 기록이 공간을 채워요.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#8a633e] shadow-sm">
          <Award className="h-3.5 w-3.5 text-[#d59a3a]" />
          {visitVerified ? "방문 인증" : "기록을 만드는 중"}
        </div>
      </div>

      <div className="mx-3 mt-3 rounded-[22px] border border-[#eadbc7] bg-[#f8eee0] px-2 pt-4">
        <div className="relative flex min-h-[174px] items-end justify-center gap-1">
          <div className="absolute left-1/2 top-1/2 h-20 w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-[#e5cdae] bg-[#ead0ae]/60 shadow-inner" />
          <div className="absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="text-[10px] font-bold text-[#8f6b4c]">함께한 테이블</div>
            <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-[#a4876b]">
              <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{memberVisits}회 방문</span>
              <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3" />{memberRevisits}회 재방문</span>
            </div>
          </div>

          <div className="relative z-[2] flex w-full items-end justify-center gap-0.5">
            {seated.map((member) => (
              <div key={member.id} className="flex w-[19%] min-w-0 flex-col items-center">
                <CrewAvatar
                  memberId={member.id}
                  avatarId={member.avatar_id}
                  gender={member.gender}
                  name={member.name}
                  size="md"
                  mode="full"
                  className="drop-shadow-[0_4px_3px_rgba(120,80,40,0.16)]"
                />
                <span className="mt-0.5 w-full truncate text-center text-[9px] font-medium text-[#806b57]">
                  {member.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 px-3 py-3">
        <button type="button" onClick={() => onOpenShowcase?.("visits")} className="flex flex-col items-center gap-1 rounded-xl bg-white/80 py-2 text-[10px] font-semibold text-[#806b57] transition-colors hover:bg-white">
          <MapPin className="h-4 w-4 text-[#d59a3a]" />
          방문 기록
        </button>
        <button type="button" onClick={() => onOpenShowcase?.("posts")} className="flex flex-col items-center gap-1 rounded-xl bg-white/80 py-2 text-[10px] font-semibold text-[#806b57] transition-colors hover:bg-white">
          <BookOpen className="h-4 w-4 text-[#d59a3a]" />
          리뷰 보관함
        </button>
        <button type="button" onClick={() => onOpenShowcase?.("lists")} className="flex flex-col items-center gap-1 rounded-xl bg-white/80 py-2 text-[10px] font-semibold text-[#806b57] transition-colors hover:bg-white">
          <Star className="h-4 w-4 text-[#d59a3a]" />
          추천 장소
        </button>
        <button type="button" onClick={() => onOpenRanking?.()} className="flex flex-col items-center gap-1 rounded-xl bg-white/80 py-2 text-[10px] font-semibold text-[#806b57] transition-colors hover:bg-white">
          <Award className="h-4 w-4 text-[#d59a3a]" />
          크루 랭킹
        </button>
      </div>
    </section>
  )
}
