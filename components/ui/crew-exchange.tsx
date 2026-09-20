"use client"

import Link from "next/link"
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Loader2 } from "lucide-react"
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
  const tone = direction === "in" ? "bg-[#f2f6f3] text-[#52745d]" : "bg-[#fff4df] text-[#a36b3b]"
  return (
    <Link
      href={"/lists/" + item.list_id}
      className="flex items-center gap-2.5 border-b border-[#eee9e1] py-3 transition-colors hover:bg-[#fffaf2]"
    >
      <span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-xl " + tone}>
        {direction === "in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-[#39322d]">
          {item.crew_icon} {item.crew_title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-[#8d837b]">
          {item.list_name} · 장소 {item.added_count}곳
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-[#aaa19a]">
        {item.created_at ? item.created_at.slice(0, 10).replaceAll("-", ".") : ""}
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  )
}

export function CrewExchange({ groupId }: { groupId: string }) {
  const { data, loading, error, refreshing, reload } = useCrewResource<ExchangeResponse>(
    "/api/groups/" + encodeURIComponent(groupId) + "/exchange",
  )

  if (loading && !data) {
    return (
      <section className="mt-5 border-t border-[#eee9e1] pt-4">
        <div className="flex items-center gap-2 text-[12px] text-[#9b928b]">
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
    <section className="mt-5 border-t border-[#eee9e1] pt-5">
      {(refreshing || error) && (
        <div className="mb-3 flex items-center gap-1.5 text-[10.5px] text-[#9b928b]" role="status">
          {refreshing && <Loader2 className="h-3 w-3 animate-spin" />}
          {error ? "마지막으로 확인된 교류 기록을 보여드리고 있어요." : "최신 교류 기록을 확인하는 중이에요."}
        </div>
      )}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-black tracking-[-0.03em] text-[#24201d]">크루 교류</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[#756d67]">
            다른 크루의 기록이 우리 크루의 다음 장소가 됩니다.
          </p>
        </div>
        {data.observed && (
          <span className="shrink-0 text-[11px] font-bold text-[#a36b3b]">{data.summary.incoming_crews + data.summary.outgoing_crews}개 크루</span>
        )}
      </div>

      {data.observed ? (
        <>
          <div className="mt-4 grid grid-cols-2 divide-x divide-[#eee9e1] border-y border-[#eee9e1] py-3">
            <div className="px-2 text-center first:pl-0">
              <div className="text-[15px] font-black text-[#52745d]">{data.summary.incoming_places}</div>
              <div className="mt-0.5 text-[10.5px] text-[#8d837b]">담아온 장소</div>
            </div>
            <div className="px-2 text-center last:pr-0">
              <div className="text-[15px] font-black text-[#a36b3b]">{data.summary.outgoing_places}</div>
              <div className="mt-0.5 text-[10.5px] text-[#8d837b]">이어진 장소</div>
            </div>
          </div>

          {hasIncoming && (
            <div className="mt-3">
              <p className="mb-0.5 text-[11px] font-bold text-[#8d837b]">다른 크루에서 담아온 리스트</p>
              <div>
                {data.incoming.map((item) => <ExchangeRow key={item.id} item={item} direction="in" />)}
              </div>
            </div>
          )}

          {hasOutgoing && (
            <div className="mt-3">
              <p className="mb-0.5 text-[11px] font-bold text-[#8d837b]">우리 리스트에서 이어진 기록</p>
              <div>
                {data.outgoing.map((item) => <ExchangeRow key={item.id} item={item} direction="out" />)}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mt-4 border-y border-[#eee9e1] py-4">
          <p className="text-[13px] font-bold text-[#4b433e]">아직 교류 기록이 없어요.</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#8d837b]">
            다른 크루의 리스트에서 좋은 곳을 발견하면 우리 크루의 첫 교류가 시작돼요.
          </p>
          {data.can_borrow && (
            <Link
              href={"/crew/" + encodeURIComponent(groupId) + "/missions?action=borrow"}
              className="mt-3 inline-flex items-center gap-1 rounded-xl bg-[#2b2622] px-3.5 py-2.5 text-[11.5px] font-bold text-white"
            >
              다른 크루 리스트 둘러보기 <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
