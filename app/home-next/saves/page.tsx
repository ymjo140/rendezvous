"use client"

// 🧪 [redesign/group-home] 저장 탭 — "나" 축(개인 폴더).
// 기존 폴더 시스템(/api/folders, /api/folders/{id}/items) 그대로 재활용.

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { MapPin, Globe, Lock } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"
import { TabBar } from "../tab-bar"

type Folder = {
  id: number; name: string; icon: string; color: string
  is_default: boolean; is_system: boolean; item_count: number
  is_public: boolean; description?: string | null
}
type Item = {
  id: number; item_type: string; place_id: number | null; post_id: string | null
  item_name?: string | null; item_image?: string | null; memo?: string | null
}

export default function SavesTabPage() {
  const router = useRouter()
  const [folders, setFolders] = useState<Folder[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [needLogin, setNeedLogin] = useState(false)

  useEffect(() => {
    fetchWithAuth("/api/folders")
      .then((r) => {
        if (r.status === 401) { setNeedLogin(true); return null }
        return r.ok ? r.json() : null
      })
      .then((d: Folder[] | null) => {
        if (!d) return
        setFolders(d)
        if (d.length > 0) setSel(d[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (sel == null) return
    setItemsLoading(true)
    fetchWithAuth(`/api/folders/${sel}/items`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Item[]) => setItems(d || []))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false))
  }, [sel])

  const selected = folders.find((f) => f.id === sel)

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-24">
      <div className="bg-violet-600 px-4 py-1.5 text-center text-[11px] font-medium text-white">
        🧪 새 홈 프로토타입 · 저장
      </div>

      <div className="px-4 pt-4">
        <h1 className="text-lg font-bold text-slate-900">저장</h1>
        <p className="mt-0.5 text-[12px] text-slate-400">내 폴더 — 공개로 켜면 큐레이터 리스트가 돼요</p>
      </div>

      {needLogin ? (
        <div className="px-4 pt-8 text-center">
          <div className="text-3xl">🔖</div>
          <p className="mt-2 text-sm text-slate-400">로그인하면 내 저장 폴더가 보여요.</p>
          <button onClick={() => router.push("/login")} className="mt-4 rounded-2xl bg-violet-600 px-5 py-2.5 text-[13px] font-semibold text-white">
            로그인하기
          </button>
        </div>
      ) : loading ? (
        <div className="py-16 text-center text-sm text-slate-400">불러오는 중...</div>
      ) : (
        <>
          {/* 폴더 칩 (색상 = 지도 핀 색과 동일) */}
          <div className="flex gap-2 overflow-x-auto px-4 pt-4 pb-1 [scrollbar-width:none]">
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => setSel(f.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium transition-colors ${
                  sel === f.id ? "text-white" : "bg-slate-100 text-slate-600"
                }`}
                style={sel === f.id ? { backgroundColor: f.color || "#7C3AED" } : undefined}
              >
                <span>{f.icon}</span>{f.name}
                <span className={sel === f.id ? "opacity-80" : "text-slate-400"}>{f.item_count}</span>
              </button>
            ))}
          </div>

          {/* 선택 폴더 정보 */}
          {selected && (
            <div className="flex items-center gap-1.5 px-4 pt-2 text-[11px] text-slate-400">
              {selected.is_public ? (
                <><Globe className="h-3 w-3 text-violet-400" /><span className="text-violet-500">공개 리스트 — 남들이 발견하고 담아갈 수 있어요</span></>
              ) : (
                <><Lock className="h-3 w-3" /><span>비공개 — 나만 볼 수 있어요</span></>
              )}
            </div>
          )}

          {/* 아이템 */}
          <div className="px-4 pt-3">
            {itemsLoading ? (
              <div className="py-12 text-center text-sm text-slate-300">불러오는 중...</div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 py-10 text-center">
                <p className="text-[13px] text-slate-400">이 폴더는 아직 비어있어요.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => { if (it.place_id) router.push(`/places/${it.place_id}`) }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 p-3 text-left"
                  >
                    {it.item_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.item_image} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-lg">
                        {it.item_type === "place" ? "📍" : "📝"}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-slate-900">{it.item_name || "저장한 항목"}</span>
                      {it.memo && <span className="block truncate text-[11px] text-slate-400">{it.memo}</span>}
                    </span>
                    {it.place_id && <MapPin className="h-4 w-4 shrink-0 text-slate-300" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <TabBar />
    </div>
  )
}
