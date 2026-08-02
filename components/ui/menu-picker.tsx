"use client"

import React from "react"
import { Check, ChevronRight, Loader2 } from "lucide-react"

/** 좋아하는 메뉴를 고르는 화면. 온보딩과 취향 설정 두 곳에서 같이 쓴다.
 *
 *  '한식·일식' 같은 굵은 말은 취향 축이 못 된다 — DB에서 '한식'만 46,541곳(37%)이라
 *  그걸로 만든 축은 아무 데나 가깝다. 그래서 국밥·곱창·칼국수 같은 메뉴 단위로 받는다.
 *
 *  대분류를 먼저 보여주고 누른 것만 펼친다. 25개를 한 번에 깔면 스크롤만 길다.
 *  대분류 자체는 못 고른다 — 고르게 하면 위의 '한식 37%' 문제로 되돌아간다.
 *
 *  최대 3개인 이유: 취향 시트가 덩어리를 3개까지만 저장한다(MAX_FACETS).
 *  더 고르게 해놓고 뒤에서 버리면 안 되니 화면에서 막는다.
 *  (배달앱들도 가게당 3개까지다 — 쿠팡이츠·요기요·배민 모두.)
 */

export type MenuCard = { key: string; title: string; image: string }
export type MenuGroup = { name: string; menus: MenuCard[] }

/** enabled=false면 안 받는다 — 취향 모달은 마이페이지에 늘 렌더돼 있어서,
 *  그냥 두면 마이페이지를 열 때마다 쓰지도 않을 요청이 나간다.
 *  한 번 받으면 다시 안 받는다(목록이 고정 25개라 바뀔 일이 없다). */
export function useMenuGroups(apiUrl: string, enabled = true) {
  const [groups, setGroups] = React.useState<MenuGroup[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!enabled || groups.length > 0) return
    let alive = true
    setLoading(true)
    fetch(`${apiUrl}/api/onboarding/menus`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.groups) setGroups(d.groups) })
      .catch(() => { /* 실패해도 흐름은 계속된다 — 취향은 나중에 행동으로 쌓인다 */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [apiUrl, enabled, groups.length])

  return { groups, loading }
}

export function MenuPicker({
  groups,
  loading,
  picked,
  onToggle,
  max = 3,
}: {
  groups: MenuGroup[]
  loading: boolean
  picked: string[]
  onToggle: (key: string) => void
  max?: number
}) {
  const [openGroup, setOpenGroup] = React.useState<string | null>(null)
  const all = React.useMemo(() => groups.flatMap((g) => g.menus), [groups])
  const chips = picked
    .map((k) => all.find((m) => m.key === k))
    .filter(Boolean) as MenuCard[]

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> 메뉴를 불러오는 중
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 고른 것은 항상 위에 남긴다 — 다른 대분류를 열어도 뭘 골랐는지 보여야 한다 */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onToggle(m.key)}
              className="flex items-center gap-1 rounded-full bg-[#F5A623] px-2.5 py-1 text-[11.5px] font-bold text-white"
            >
              {m.title}
              <span className="text-white/80">✕</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {groups.map((g) => {
          const open = openGroup === g.name
          const inGroup = g.menus.filter((m) => picked.indexOf(m.key) >= 0).length
          return (
            <div key={g.name} className="overflow-hidden rounded-xl border border-gray-100">
              <button
                type="button"
                onClick={() => setOpenGroup(open ? null : g.name)}
                className={`flex w-full items-center gap-2 px-3.5 py-3 text-left transition-colors ${open ? "bg-amber-50/60" : "bg-white"}`}
              >
                <span className="text-[14px] font-bold text-gray-900">{g.name}</span>
                {inGroup > 0 && (
                  <span className="rounded-full bg-[#F5A623] px-1.5 text-[10.5px] font-bold text-white">{inGroup}</span>
                )}
                <span className="ml-auto text-[11.5px] text-gray-400">{g.menus.length}종</span>
                <ChevronRight className={`h-4 w-4 text-gray-300 transition-transform ${open ? "rotate-90" : ""}`} />
              </button>

              {open && (
                <div className="grid grid-cols-3 gap-2 border-t border-gray-100 p-2.5">
                  {g.menus.map((m) => {
                    const on = picked.indexOf(m.key) >= 0
                    const full = !on && picked.length >= max
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => onToggle(m.key)}
                        disabled={full}
                        className={`relative overflow-hidden rounded-xl text-left transition-all ${
                          on ? "ring-2 ring-[#F5A623]" : full ? "opacity-40" : "ring-1 ring-gray-100"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.image} alt="" className="aspect-square w-full object-cover bg-gray-100" loading="lazy" />
                        {on && (
                          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#F5A623]">
                            <Check className="h-3 w-3 text-white" strokeWidth={3} />
                          </span>
                        )}
                        <span className="block px-1.5 py-1.5 text-[11.5px] font-bold leading-tight text-gray-800">
                          {m.title}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {groups.length > 0 && (
        <p className="text-[11px] text-gray-400">사진은 메뉴를 나타내는 대표 이미지입니다</p>
      )}
    </div>
  )
}

/** 이미 max개면 더 못 고르고, 고른 걸 다시 누르면 빠진다. */
export function toggleMenuKey(prev: string[], key: string, max = 3) {
  return prev.indexOf(key) >= 0
    ? prev.filter((k) => k !== key)
    : prev.length >= max ? prev : prev.concat(key)
}
