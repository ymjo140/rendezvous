"use client"

import React from "react"

/** 크루들의 동네 — 가운데가 우리 크루, 아래가 놀러갈 수 있는 다른 크루.
 *
 *  아이러브커피의 '친구 카페 방문'이 이 구조다. 내 가게를 키우고, 친구 가게에 놀러가고,
 *  가면 서로 이득이 있다. 그게 그 게임의 바이럴 엔진이었다.
 *
 *  우리한테 특히 잘 맞는 이유: 공개 리스트·팔로우·좋아요·랭킹이 이미 다 만들어져 있는데
 *  **쓸 이유가 없어서 죽어 있다.** 리스트를 공개해도 돌아오는 게 없으니 아무도 안 만들고,
 *  만든 게 없으니 아무도 안 본다. 방문이 그 이유를 만든다.
 *
 *  ── 그림에 대해
 *  처음엔 SVG로 도형을 각지게 배치해 픽셀아트 흉내를 냈는데 조잡했다. 진짜 픽셀아트는
 *  격자에 점을 찍은 것이고 그 질감은 도형으로 안 나온다. 그래서 PNG 스프라이트로 바꿨다
 *  (public/pixel/). 만드는 방법은 scratchpad/gen_pixel_style.py 참고 —
 *  **5단계를 한 장에 나란히 그리게 해야** 그림체가 통일된다. 따로 뽑으면 5개가 다 다르다.
 *
 *  확대는 image-rendering: pixelated로 한다. 미리 줄여 저장하면 도트가 뭉개진다.
 */

export type Member = { id: number; name: string; avatar: string; is_host: boolean }
export type NeighborCrew = { id: string; title: string; icon: string; members: number; lists?: number }

/** 등급 → 스프라이트 번호. 가게가 커지고 셰프 옷이 바뀐다. */
const TIER_STAGE: Record<string, number> = {
  "골목식당": 1, "동네 맛집": 2, "지역 대표": 3, "미식가의 집": 4, "미슐랭": 5,
}
const stageOf = (tier: string) => TIER_STAGE[tier] || 1

const PIXEL: React.CSSProperties = { imageRendering: "pixelated" }

export function CrewVillage({
  title, icon, tier, members, unlocked, total, onEnter,
}: {
  title: string; icon: string | null; tier: string
  members: Member[]; unlocked: number; total: number
  onEnter?: () => void
}) {
  const stage = stageOf(tier)
  // 등급이 오를수록 가게가 커 보여야 한다 — 원본 크기 차이에 더해 표시 배율도 키운다
  const shopH = [0, 92, 108, 124, 140, 156][stage]

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-100">
      {/* 하늘 */}
      <div className="relative h-[248px] bg-gradient-to-b from-[#9FD6ED] to-[#DCF0F7]">
        {/* 구름 — 도트 느낌을 깨지 않게 단순한 사각형 조합 */}
        <div className="absolute left-6 top-6 h-3 w-12 rounded-none bg-white/85" />
        <div className="absolute left-9 top-3 h-3 w-7 bg-white/85" />
        <div className="absolute right-10 top-4 h-3 w-10 bg-white/80" />

        {/* 간판 */}
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border-2 border-[#C2620F] bg-white/95 px-3 py-1">
          <span className="text-[12px] font-extrabold text-[#C2620F]">
            {icon || "🍽️"} {title.length > 10 ? title.slice(0, 10) + "…" : title}
          </span>
        </div>

        {/* 가게 + 셰프 — 땅 위에 세운다 */}
        <div className="absolute inset-x-0 bottom-[52px] flex items-end justify-center gap-1">
          <button
            type="button"
            onClick={onEnter}
            className="active:scale-95"
            aria-label="우리 크루 들어가기"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/pixel/shop-${stage}.png`} alt="" style={{ ...PIXEL, height: shopH }} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/pixel/chef-${stage}.png`} alt="" style={{ ...PIXEL, height: 74 }} />
        </div>

        {/* 땅 */}
        <div className="absolute inset-x-0 bottom-0 h-[52px] bg-[#7CC85F]">
          <div className="h-[5px] w-full bg-[#66B24B]" />
          <div className="absolute inset-x-0 bottom-0 h-[26px] bg-[#8B6B45]" />
        </div>

        {/* 멤버 — 땅 위에 선다 */}
        <div className="absolute inset-x-0 bottom-1 flex items-end justify-center gap-3 px-3">
          {members.slice(0, 5).map((m) => (
            <div key={m.id} className="flex flex-col items-center">
              <span className="text-[17px] leading-none">{m.avatar}</span>
              <span className="mt-0.5 rounded-full bg-white/92 px-1.5 text-[9px] font-bold text-[#5C4A32]">
                {m.is_host ? "👑" : ""}{m.name.length > 4 ? m.name.slice(0, 4) : m.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 수집 현황 — 그림 위에 얹어 화면을 안 먹게 */}
      <div className="absolute right-2.5 top-2.5 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-bold text-amber-800 shadow-sm">
        메뉴 {unlocked}/{total}
      </div>
    </div>
  )
}

/** 다른 크루 놀러가기 — 아이러브커피의 '친구 카페' 줄. */
export function NeighborStrip({
  crews, onVisit,
}: { crews: NeighborCrew[]; onVisit: (id: string) => void }) {
  if (crews.length === 0) return null
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between px-0.5">
        <h3 className="text-[13.5px] font-bold text-slate-900">다른 크루 놀러가기</h3>
        <span className="text-[11px] text-gray-400">리스트를 구경하고 담아보세요</span>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
        {crews.map((c, i) => (
          <button
            key={c.id}
            onClick={() => onVisit(c.id)}
            className="w-[106px] flex-shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-white text-left active:scale-95"
          >
            <div className="flex h-[70px] items-end justify-center bg-gradient-to-b from-[#CDEBF5] to-[#DFF3E4]">
              {/* 이웃 가게 그림은 돌려쓴다 — 남의 등급까지 받아오면 요청이 크루 수만큼 는다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/pixel/shop-${(i % 4) + 1}.png`} alt="" style={{ ...PIXEL, height: 56 }} />
            </div>
            <div className="px-2 py-1.5">
              <div className="truncate text-[11.5px] font-bold text-gray-800">
                {c.icon} {c.title}
              </div>
              <div className="text-[10px] text-gray-400">
                멤버 {c.members}{typeof c.lists === "number" ? ` · 리스트 ${c.lists}` : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
