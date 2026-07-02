"use client"

import { fetchWithAuth } from "@/lib/api-client"

// 캐시(₩) 지갑 — 충전식 결제수단. 예약 시 사용, 취소 시 환불.
// 게임 XP/포인트와는 분리된 '현금성 캐시'.

export type CashHistory = {
  id: number
  amount: number // +충전/환불, -사용
  type: string // charge, use, reward, refund
  description: string
  created_at: string
}

export type WalletInfo = {
  balance: number
  history: CashHistory[]
}

export async function getWallet(): Promise<WalletInfo> {
  const res = await fetchWithAuth("/api/coins/wallet")
  if (!res.ok) throw new Error("지갑 조회 실패")
  return res.json()
}

/** 캐시 충전 (MVP: mock 결제 — 실제 PG 연동 자리). 금액별 보너스 포함. */
export async function chargeCash(
  amount: number,
  paymentMethod = "card",
): Promise<{ balance: number; charged?: number; bonus?: number }> {
  const res = await fetchWithAuth("/api/coins/charge", {
    method: "POST",
    body: JSON.stringify({ amount, payment_method: paymentMethod }),
  })
  if (!res.ok) throw new Error("충전 실패")
  return res.json()
}

/** 프론트 표기용 충전 보너스 계산(백엔드와 동일 규칙). */
export function chargeBonus(amount: number): number {
  if (amount >= 100000) return Math.floor(amount * 0.1)
  if (amount >= 50000) return Math.floor(amount * 0.05)
  if (amount >= 30000) return Math.floor(amount * 0.03)
  return 0
}

export type Reservation = {
  id: string
  place_id?: number | null
  place_name: string
  date: string
  time: string
  party_size: number
  deposit_amount: number
  status: "confirmed" | "cancelled" | "completed"
  table_label?: string | null
  created_at: string
}

export async function getReservations(): Promise<Reservation[]> {
  const res = await fetchWithAuth("/api/reservations")
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function createReservation(payload: {
  place_id?: number | null
  place_name: string
  date: string
  time: string
  party_size: number
  deposit_amount: number
  offer_rule_id?: number | null
  table_id?: number | null
  table_label?: string | null
}): Promise<Reservation> {
  const res = await fetchWithAuth("/api/reservations", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    let detail = "예약에 실패했습니다."
    try {
      const e = await res.json()
      if (e?.detail) detail = e.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return res.json()
}

export async function cancelReservation(id: string): Promise<{ status: string; refunded?: number; balance?: number }> {
  const res = await fetchWithAuth(`/api/reservations/${id}/cancel`, { method: "POST" })
  if (!res.ok) throw new Error("취소에 실패했습니다.")
  return res.json()
}

export const won = (n: number | undefined | null) => `${(n ?? 0).toLocaleString()}원`
