"use client"

import { useRouter } from "next/navigation"
import { Award, ChevronRight, Loader2, ShieldCheck, Users } from "lucide-react"
import { useCrewResource } from "@/lib/use-crew-resource"
import { CrewLoadError } from "@/components/ui/crew-load-error"

type RankingItem = {
  rank: number
  community_id: string
  title: string
  icon: string
  member_count: number
  follower_count: number
  like_count: number
  list_count: number
  score: number
  visibility: string
}

type RankingResponse = {
  count: number
  items: RankingItem[]
}

export function CrewRanking() {
  const router = useRouter()
  const { data, loading, error, reload } = useCrewResource<RankingResponse>("/api/group-ranking?limit=5")

  if (loading && !data) {
    return (
      <section aria-label="크루 랭킹" className="rounded-3xl border border-slate-100 bg-white p-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> 크루 랭킹을 불러오는 중…
        </div>
      </section>
    )
  }

  if (error && !data) {
    return <CrewLoadError message={error} retry={reload} />
  }

  const items = data?.items ?? []

  return (
    <section aria-label="크루 랭킹" className="rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
          <Award className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-slate-900">공개 크루 랭킹</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            공개 리스트를 쌓고 팔로워가 늘수록 순위가 올라가요.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-amber-700">
          활동 신호
        </span>
      </div>

      {items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-amber-200 bg-white/70 px-4 py-6 text-center">
          <ShieldCheck className="mx-auto h-5 w-5 text-amber-300" />
          <p className="mt-2 text-[12px] font-semibold text-slate-600">랭킹을 만들 데이터가 쌓이는 중이에요.</p>
          <p className="mt-1 text-[11px] text-slate-400">공개 크루가 리스트와 방문 기록을 쌓으면 여기에 보여요.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {items.map((item) => (
            <button
              key={item.community_id}
              type="button"
              onClick={() => router.push(`/crew/${encodeURIComponent(item.community_id)}`)}
              className="flex w-full items-center gap-2.5 rounded-2xl bg-white px-3 py-2.5 text-left transition-colors hover:bg-amber-50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[12px] font-bold text-amber-800">
                {item.rank <= 3 ? ["🥇", "🥈", "🥉"][item.rank - 1] : item.rank}
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-lg">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-slate-900">{item.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-400">
                  <span className="inline-flex items-center gap-0.5"><Users className="h-3 w-3" />{item.member_count}명</span>
                  <span>·</span>
                  <span>{item.list_count}개 리스트</span>
                  <span>·</span>
                  <span>팔로워 {item.follower_count}</span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
