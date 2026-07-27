"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Wallet, Plus, Loader2, Receipt, CalendarCheck, X, MapPin } from "lucide-react"
import {
  getWallet,
  chargeCash,
  chargeBonus,
  getReservations,
  cancelReservation,
  won,
  type WalletInfo,
  type Reservation,
} from "@/lib/wallet"

const CHARGE_PRESETS = [10000, 30000, 50000, 100000]

/** 예약 당일 ±2시간 — 서버가 같은 창으로 검사하므로 버튼도 그때만 보여준다. */
function canCheckIn(r: Reservation): boolean {
  if (r.status !== "confirmed" || !r.place_id) return false
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  if (r.date !== today) return false
  const [hh, mm] = String(r.time || "0:0").split(":")
  const diff = Math.abs(now.getHours() * 60 + now.getMinutes() - (Number(hh) * 60 + Number(mm)))
  return diff <= 120
}

export function CashWalletCard() {
  const router = useRouter()
  const [wallet, setWallet] = useState<WalletInfo>({ balance: 0, history: [] })
  const [loading, setLoading] = useState(true)
  const [chargeOpen, setChargeOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [charging, setCharging] = useState<number | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])

  const refresh = async () => {
    try {
      const [w, r] = await Promise.all([getWallet(), getReservations()])
      setWallet(w)
      setReservations(r)
    } catch {
      /* 무시 */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleCharge = async (amount: number) => {
    setCharging(amount)
    try {
      await chargeCash(amount)
      await refresh()
      setChargeOpen(false)
    } catch {
      alert("충전에 실패했어요. 잠시 후 다시 시도해주세요.")
    } finally {
      setCharging(null)
    }
  }

  const handleCancel = async (r: Reservation) => {
    if (!confirm(`'${r.place_name}' 예약을 취소할까요? 예약금 ${won(r.deposit_amount)}이 환불됩니다.`)) return
    try {
      await cancelReservation(r.id)
      await refresh()
    } catch {
      alert("취소에 실패했어요.")
    }
  }

  // 과거 취소건은 숨기고, 그 외(확정/완료/노쇼)는 상태 배지와 함께 노출 → 사장님 상태변경이 보임
  const STATUS_LABEL: Record<string, string> = {
    confirmed: "예약 확정",
    completed: "방문 완료",
    cancelled: "취소됨",
    no_show: "노쇼",
  }
  const STATUS_STYLE: Record<string, string> = {
    confirmed: "bg-amber-100 text-amber-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-gray-100 text-gray-400",
    no_show: "bg-rose-100 text-rose-600",
  }
  const visibleReservations = reservations.filter((r) => r.status !== "cancelled")

  return (
    <div className="px-5 mb-2 space-y-3">
      {/* 충전 캐시 카드 */}
      <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F5A623] to-[#14B8A6] flex items-center justify-center text-white">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#F5A623]">충전 캐시</div>
                <div className="text-xl font-bold text-gray-900">
                  {loading ? "—" : won(wallet.balance)}
                </div>
              </div>
            </div>
            {/* 스토어 심사용 스위치: Vercel env NEXT_PUBLIC_HIDE_TOPUP=1 이면 모의 충전 숨김(실 PG 전까지) */}
            {process.env.NEXT_PUBLIC_HIDE_TOPUP === "1" ? (
              <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5">
                충전은 정식 오픈 때 열려요
              </span>
            ) : (
              <Button
                size="sm"
                onClick={() => setChargeOpen(true)}
                className="bg-[#F5A623] hover:bg-amber-700 rounded-xl h-9"
              >
                <Plus className="w-4 h-4 mr-1" /> 충전
              </Button>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px] text-gray-400">예약할 때 캐시로 결제하고, 취소하면 자동 환불돼요.</p>
            <button
              onClick={() => setHistoryOpen(true)}
              className="text-[11px] font-medium text-gray-500 hover:text-[#F5A623] flex items-center gap-1"
            >
              <Receipt className="w-3 h-3" /> 내역
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 내 예약 (상태 배지 — 사장님이 확정/완료/취소 시 반영됨) */}
      {visibleReservations.length > 0 && (
        <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarCheck className="w-4 h-4 text-[#14B8A6]" />
              <span className="text-sm font-bold text-gray-800">내 예약</span>
              <span className="text-xs text-gray-400">{visibleReservations.length}</span>
            </div>
            <div className="space-y-2">
              {visibleReservations.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-800 truncate">{r.place_name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[r.status] || "bg-gray-100 text-gray-500"}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {r.date} {r.time} · {r.party_size}명
                      {r.deposit_amount > 0 && ` · ${won(r.deposit_amount)}`}
                    </div>
                    {r.crew_title && (
                      <div className="text-[11px] text-indigo-500 mt-0.5">
                        {r.crew_icon} {r.crew_title} 크루 예약
                      </div>
                    )}
                  </div>
                  {canCheckIn(r) ? (
                    // 예약은 '오겠다는 의도'일 뿐이라, 실제로 왔는지는 여기서 따로 확인한다
                    <Button
                      size="sm"
                      onClick={() => router.push(`/checkin/${r.place_id}?rid=${r.id}`)}
                      className="h-8 flex-shrink-0 gap-1 rounded-lg bg-[#F5A623] text-xs font-bold text-white hover:bg-amber-600"
                    >
                      <MapPin className="h-3 w-3" /> 방문 체크인
                    </Button>
                  ) : r.status === "confirmed" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCancel(r)}
                      className="text-rose-500 hover:bg-rose-50 h-8 text-xs flex-shrink-0"
                    >
                      취소
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 충전 모달 */}
      <Dialog open={chargeOpen} onOpenChange={setChargeOpen}>
        <DialogContent className="sm:max-w-sm rounded-3xl font-['Pretendard']">
          <DialogHeader>
            <DialogTitle>캐시 충전</DialogTitle>
            <DialogDescription className="text-xs">
              충전한 캐시로 예약을 결제할 수 있어요. (현재 잔액 {won(wallet.balance)})
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {CHARGE_PRESETS.map((amt) => {
              const bonus = chargeBonus(amt)
              return (
                <Button
                  key={amt}
                  variant="outline"
                  disabled={charging !== null}
                  onClick={() => handleCharge(amt)}
                  className="h-16 rounded-xl flex flex-col gap-0.5 border-gray-200 hover:border-[#F5A623] hover:text-[#F5A623]"
                >
                  {charging === amt ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span className="text-base font-bold">{won(amt)}</span>
                      {bonus > 0 && (
                        <span className="text-[10px] font-bold text-[#14B8A6]">보너스 +{won(bonus)}</span>
                      )}
                    </>
                  )}
                </Button>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400 text-center">
            ※ 많이 충전할수록 보너스 캐시 ↑ · 데모용 모의 결제
          </p>
        </DialogContent>
      </Dialog>

      {/* 거래내역 모달 */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-sm rounded-3xl font-['Pretendard']">
          <DialogHeader>
            <DialogTitle>캐시 거래내역</DialogTitle>
            <DialogDescription className="hidden">캐시 충전/사용/환불 내역</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto py-1 space-y-1">
            {wallet.history.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-10">아직 거래내역이 없어요.</div>
            ) : (
              wallet.history.map((h) => (
                <div key={h.id} className="flex items-center justify-between px-1 py-2.5 border-b border-gray-50">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-800 truncate">{h.description}</div>
                    <div className="text-[10px] text-gray-400">{String(h.created_at).slice(0, 16).replace("T", " ")}</div>
                  </div>
                  <div className={`text-sm font-bold flex-shrink-0 ${h.amount >= 0 ? "text-[#14B8A6]" : "text-gray-700"}`}>
                    {h.amount >= 0 ? "+" : ""}
                    {won(h.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
