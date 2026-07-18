"use client"

// 네이버 지도 저장 리스트 가져오기 — 공유 링크 붙여넣기 → 미리보기(매칭) → 일괄 저장
import React, { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, Check, MapPin } from "lucide-react"
import { fetchWithAuth } from "@/lib/api-client"

interface PreviewItem {
    sid: string | null
    name: string
    address: string | null
    lat: number | null
    lng: number | null
    mcid: string | null
    mcid_name: string | null
    matched: { place_id: number; name: string } | null
}

interface PreviewData {
    folder_name: string
    owner_nick?: string | null
    total: number
    matched: number
    items: PreviewItem[]
}

export function NaverImportSheet({
    open,
    onClose,
    onImported,
}: {
    open: boolean
    onClose: () => void
    onImported: () => void
}) {
    const [url, setUrl] = useState("")
    const [loading, setLoading] = useState(false)
    const [committing, setCommitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [preview, setPreview] = useState<PreviewData | null>(null)
    const [checked, setChecked] = useState<Set<number>>(new Set())
    const [done, setDone] = useState<{ folder_name: string; saved: number } | null>(null)

    const allChecked = preview ? checked.size === preview.items.length : false

    const reset = () => {
        setUrl(""); setPreview(null); setChecked(new Set()); setError(null); setDone(null)
    }

    const handleClose = () => { reset(); onClose() }

    const loadPreview = async () => {
        if (!url.trim()) { setError("네이버 지도 공유 링크를 붙여넣어 주세요."); return }
        setLoading(true); setError(null)
        try {
            const res = await fetchWithAuth("/api/import/naver/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data?.detail || "리스트를 불러오지 못했어요."); return }
            setPreview(data)
            setChecked(new Set(data.items.map((_: PreviewItem, i: number) => i)))
        } catch {
            setError("리스트를 불러오지 못했어요. 네트워크를 확인해 주세요.")
        } finally {
            setLoading(false)
        }
    }

    const toggle = (i: number) => {
        setChecked(prev => {
            const next = new Set(prev)
            if (next.has(i)) next.delete(i); else next.add(i)
            return next
        })
    }

    const commit = async () => {
        if (!preview || checked.size === 0) return
        setCommitting(true); setError(null)
        try {
            const items = preview.items
                .filter((_, i) => checked.has(i))
                .map(it => ({
                    sid: it.sid, name: it.name, address: it.address,
                    lat: it.lat, lng: it.lng, mcid: it.mcid, mcid_name: it.mcid_name,
                    place_id: it.matched?.place_id ?? null,
                }))
            const res = await fetchWithAuth("/api/import/naver/commit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder_name: preview.folder_name, items }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data?.detail || "저장에 실패했어요."); return }
            setDone({ folder_name: data.folder_name, saved: data.saved })
            onImported()
        } catch {
            setError("저장에 실패했어요. 잠시 후 다시 시도해 주세요.")
        } finally {
            setCommitting(false)
        }
    }

    const summary = useMemo(() => {
        if (!preview) return null
        return `${preview.total}곳 발견 · ${preview.matched}곳은 랑데부에 이미 있는 가게예요`
    }, [preview])

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
            <DialogContent className="max-w-md max-h-[85dvh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                        <span className="text-lg">🧡</span> 네이버 지도 맛집 가져오기
                    </DialogTitle>
                </DialogHeader>

                {done ? (
                    <div className="p-8 text-center space-y-3">
                        <div className="text-4xl">🎉</div>
                        <div className="font-bold text-gray-800">{done.saved}곳을 가져왔어요!</div>
                        <div className="text-sm text-gray-500">
                            내 저장 폴더 <span className="font-bold">‘{done.folder_name}’</span>에 담겼어요.<br />
                            공개하면 나만의 맛집 리스트로 자랑할 수 있어요.
                        </div>
                        <Button onClick={handleClose} className="w-full mt-2 bg-[#14B8A6] hover:bg-[#0d9488] text-white font-bold rounded-xl">
                            확인
                        </Button>
                    </div>
                ) : !preview ? (
                    <div className="p-5 space-y-4">
                        <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
                            <span className="font-bold">가져오는 방법</span><br />
                            네이버 지도 앱 → <span className="font-bold">저장</span> → 리스트 선택 →{" "}
                            <span className="font-bold">공유</span> → 링크 복사 → 아래에 붙여넣기
                        </div>
                        <textarea
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder={"[네이버지도]\n맛집\nhttps://naver.me/..."}
                            rows={3}
                            className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/40 resize-none"
                        />
                        {error && <div className="text-xs text-red-500 font-medium">{error}</div>}
                        <Button
                            onClick={loadPreview}
                            disabled={loading}
                            className="w-full bg-[#03C75A] hover:bg-[#02b152] text-white font-bold rounded-xl h-11"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "리스트 불러오기"}
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="px-5 py-3 border-b border-gray-100 space-y-1">
                            <div className="font-bold text-gray-800 text-sm">‘{preview.folder_name}’</div>
                            <div className="text-xs text-gray-500">{summary}</div>
                            <button
                                onClick={() => setChecked(allChecked ? new Set() : new Set(preview.items.map((_, i) => i)))}
                                className="text-xs font-bold text-[#14B8A6]"
                            >
                                {allChecked ? "전체 해제" : "전체 선택"}
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-2 divide-y divide-gray-50">
                            {preview.items.map((it, i) => (
                                <button
                                    key={i}
                                    onClick={() => toggle(i)}
                                    className="w-full flex items-center gap-3 py-2.5 text-left"
                                >
                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${checked.has(i) ? "bg-[#14B8A6] border-[#14B8A6]" : "border-gray-300"}`}>
                                        {checked.has(i) && <Check className="w-3.5 h-3.5 text-white" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium text-gray-800 truncate">{it.name}</div>
                                        <div className="text-[11px] text-gray-400 truncate flex items-center gap-1">
                                            <MapPin className="w-3 h-3 shrink-0" />
                                            {it.address || it.mcid_name || ""}
                                        </div>
                                    </div>
                                    {it.matched ? (
                                        <span className="text-[10px] font-bold text-teal-600 bg-teal-50 rounded-full px-2 py-0.5 shrink-0">랑데부 등록됨</span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-gray-400 bg-gray-50 rounded-full px-2 py-0.5 shrink-0">새 장소</span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="p-4 border-t border-gray-100 space-y-2">
                            {error && <div className="text-xs text-red-500 font-medium">{error}</div>}
                            <Button
                                onClick={commit}
                                disabled={committing || checked.size === 0}
                                className="w-full bg-[#14B8A6] hover:bg-[#0d9488] text-white font-bold rounded-xl h-11"
                            >
                                {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : `${checked.size}곳 가져오기`}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
