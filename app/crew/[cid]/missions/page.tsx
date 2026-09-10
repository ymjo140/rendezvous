"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { fetchWithAuth } from "@/lib/api-client"
import { crewActivityChanged, readApi, useCrewResource } from "@/lib/use-crew-resource"
import { CrewLoadError } from "@/components/ui/crew-load-error"
import { CrewMissions } from "@/components/ui/crew-missions"

type Place = { id: number; name: string; address: string }
type Options = { title: string; places: Place[]; lists: { id: number; name: string; crew_title: string; count: number }[] }

function MissionActions() {
  const { cid } = useParams<{ cid: string }>()
  const mode = useSearchParams().get("action") || "save"
  return <Actions key={`${cid}:${mode}`} cid={cid} mode={mode} />
}

function Actions({ cid, mode }: { cid: string; mode: string }) {
  const { data, loading, error, reload } = useCrewResource<Options>(`/api/groups/${encodeURIComponent(cid)}/mission-options`)
  const [query, setQuery] = useState("")
  const [searched, setSearched] = useState("")
  const search = useCrewResource<Place[]>(searched ? `/api/places/search?db_only=true&query=${encodeURIComponent(searched)}` : null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const borrow = mode === "borrow"
  const save = mode === "save"
  const act = async (id: number) => {
    if (busy) return
    setBusy(true); setActionError(null); setMessage(null)
    try {
      const result = await fetchWithAuth(borrow ? `/api/lists/${id}/save` : `/api/groups/${encodeURIComponent(cid)}/save-place`, {
        method: "POST", body: JSON.stringify(borrow ? { community_id: cid } : { place_id: id }),
      }).then(readApi<{ added?: number; saved?: boolean }>)
      const changed = borrow ? (result.added || 0) > 0 : result.saved
      setMessage(changed ? "크루 리스트에 담았어요. 아래 퀘스트에서 반영된 기록을 확인하세요." : "이미 담긴 장소예요. 새로 추가된 기록은 없어요.")
      crewActivityChanged()
    } catch (e) { setActionError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해주세요.") }
    finally { setBusy(false) }
  }
  const places = searched ? search.data || [] : data?.places || []
  return <main className="mx-auto min-h-screen max-w-md bg-white px-4 pb-12">
    <Link href={`/crew/${encodeURIComponent(cid)}`} className="inline-block py-4 text-sm text-gray-600">← 크루로 돌아가기</Link>
    <h1 className="text-xl font-bold">{borrow ? "다른 크루의 리스트 담기" : save ? "크루에 장소 저장하기" : "크루와 방문할 곳 고르기"}</h1>
    <p className="mt-2 text-sm text-gray-600">{data?.title || "이 크루"}의 퀘스트예요. {borrow ? "내가 속하지 않은 크루의 공개 리스트를 골라보세요." : save ? "직접 고른 장소가 이 크루의 리스트에 저장돼요." : "매장에서 멤버 2명 이상이 각자 QR 또는 직원 승인으로 인증해주세요. 같은 날 2시간 이내 확인해야 공동 방문이 돼요."}</p>
    {mode === "new_menu" && <p className="mt-2 text-sm text-amber-800">아직 해금하지 않은 메뉴 종류를 선택해주세요. 공동 방문이 확인되면 도감에 반영돼요.</p>}
    {mode === "regular" && <p className="mt-2 text-sm text-amber-800">크루가 3회 이상 함께 방문한 단골집에 다시 방문하면 완료돼요.</p>}
    {loading && <p role="status" className="py-6">불러오는 중…</p>}
    {error && <CrewLoadError message={error} retry={reload} />}
    {data && !borrow && <form onSubmit={e => { e.preventDefault(); setSearched(query.trim()) }} className="my-4 flex gap-2">
      <input aria-label="가게 이름 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="가게 이름 검색" maxLength={100} className="min-w-0 flex-1 rounded-xl border px-3 py-2" />
      <button className="rounded-xl bg-amber-100 px-4">검색</button>
    </form>}
    {search.loading && <p role="status">검색 중…</p>}
    {search.error && <CrewLoadError message={search.error} retry={search.reload} />}
    {actionError && <div role="alert" className="my-3 text-sm text-rose-700">{actionError}</div>}
    {message && <p role="status" className="my-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <div className="my-4 space-y-3">
      {data && borrow && data.lists.map(list => <article key={list.id} className="rounded-xl border p-4">
        <Link href={`/lists/${list.id}`} className="font-semibold underline">{list.name}</Link>
        <p className="my-2 text-sm text-gray-500">{list.crew_title} · {list.count}곳</p>
        <button disabled={busy} onClick={() => act(list.id)} className="rounded-lg bg-amber-100 px-3 py-2 text-sm disabled:opacity-50">이 크루에 리스트 담기</button>
      </article>)}
      {data && borrow && data.lists.length === 0 && <p className="py-6 text-sm text-gray-500">아직 담을 수 있는 다른 크루의 공개 리스트가 없어요.</p>}
      {data && !borrow && !search.loading && places.map(place => <article key={place.id} className="rounded-xl border p-4">
        <Link href={`/places/${place.id}`} className="font-semibold underline">{place.name}</Link>
        <p className="my-2 text-sm text-gray-500">{place.address}</p>
        {save ? <button disabled={busy} onClick={() => act(place.id)} className="rounded-lg bg-amber-100 px-3 py-2 text-sm disabled:opacity-50">이 크루에 저장</button>
          : <Link href={`/checkin/${place.id}?cid=${encodeURIComponent(cid)}`} className="inline-block rounded-lg bg-amber-100 px-3 py-2 text-sm">매장에서 방문 인증</Link>}
      </article>)}
      {data && !borrow && !search.loading && !search.error && places.length === 0 && <p className="py-6 text-sm text-gray-500">가게 이름을 검색해서 방문할 곳을 골라보세요.</p>}
    </div>
    {data && <div className="relative h-24 rounded-2xl bg-amber-50"><CrewMissions groupId={cid} /></div>}
  </main>
}

export default function MissionPage() { return <Suspense fallback={<p>불러오는 중…</p>}><MissionActions /></Suspense> }
