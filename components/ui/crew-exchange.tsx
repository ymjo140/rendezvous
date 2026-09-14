"use client"

import Link from "next/link"
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Loader2, Sparkles } from "lucide-react"
import { useCrewResource } from "@/lib/use-crew-resource"
import { CrewLoadError } from "@/components/ui/crew-load-error"

type ExchangeItem = {
  id: string
  crew_id: string
  crew_title: string
  crew_icon: string
  list_id: number
  list_name: string
  added_count: number
  created_at: string
}

type ExchangeResponse = {
  visible: boolean
  observed: boolean
  status: "observed" | "collecting"
  can_borrow: boolean
  summary: {
    incoming_crews: number
    outgoing_crews: number
    incoming_places: number
    outgoing_places: number
  }
  incoming: ExchangeItem[]
  outgoing: ExchangeItem[]
}

function ExchangeRow({ item, direction }: { item: ExchangeItem; direction: "in" | "out" }) {
  const tone = direction === "in" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
  return (
    <Link
      href={"/lists/" + item.list_id}
      className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2.5 transition-colors hover:bg-amber-50"
    >
      <span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-xl " + tone}>
        {direction === "in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold text-slate-800">
          {item.crew_icon} {item.crew_title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
          {item.list_name} · 장소 {item.added_count}곳
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-slate-400">
        {item.created_at ? item.created_at.slice(0, 10).replaceAll("-", ".") : ""}
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  )
}

export function CrewExchange({ groupId }: { groupId: string }) {
  const { data, loading, error, reload } = useCrewResource<ExchangeResponse>(
    "/api/groups/" + encodeURIComponent(groupId) + "/exchange",
  )

  if (loading && !data) {
    return (
      <section className="mt-3 rounded-3xl border border-slate-100 bg-white p-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 크루 교류를 불러오는 중…
        </div>
      </section>
    )
  }
  if (error && !data) return <CrewLoadError message={error} retry={reload} />
  if (!data || !data.visible) return null

  const hasIncoming = data.incoming.length > 0
  const hasOutgoing = data.outgoing.length > 0

  return (
    <section className="mt-3 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-slate-900">크루 교류</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            다른 크루의 리스트가 우리 기록으로 이어지는 흐름이에요.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-indigo-600">
          {data.observed ? "관찰 중" : "기록 대기"}
        </span>
      </div>

      {data.observed ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/80 px-3 py-2.5">
              <div className="text-[15px] font-bold text-emerald-700">{data.summary.incoming_places}</div>
              <div className="text-[10px] text-slate-500">다른 크루에서 담아온 장소</div>
            </div>
            <div className="rounded-2xl bg-white/80 px-3 py-2.5">
              <div className="text-[15px] font-bold text-amber-700">{data.summary.outgoing_places}</div>
              <div className="text-[10px] text-slate-500">우리 리스트에서 이어진 장소</div>
            </div>
          </div>

          {hasIncoming && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-bold text-slate-500">우리가 담아온 기록</p>
              <div className="space-y-1.5">
                {data.incoming.map((item) => <ExchangeRow key={item.id} item={item} direction="in" />)}
              </div>
            </div>
          )}

          {hasOutgoing && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-bold text-slate-500">우리 리스트에서 이어진 기록</p>
              <div className="space-y-1.5">
                {data.outgoing.map((item) => <ExchangeRow key={item.id} item={item} direction="out" />)}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-indigo-200 bg-white/70 px-4 py-4 text-center">
          <p className="text-[12px] font-semibold text-slate-700">아직 다른 크루와 교류한 기록이 없어요.</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            공개 리스트에서 좋은 곳을 담아오면 우리 크루의 첫 교류 기록이 생겨요.
          </p>
          {data.can_borrow && (
            <Link
              href={"/crew/" + encodeURIComponent(groupId) + "/missions?action=borrow"}
              className="mt-3 inline-flex rounded-xl bg-indigo-100 px-3.5 py-2 text-[11.5px] font-bold text-indigo-700"
            >
              다른 크루 리스트 둘러보기
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
