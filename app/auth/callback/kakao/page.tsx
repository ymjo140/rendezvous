"use client"

import React, { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { linkReferral } from "@/hooks/use-friends"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "")

// 카톡 초대링크로 가입/로그인한 경우 초대자와 친구 연결 (실패해도 무시)
async function consumeInviteRef() {
  try {
    const ref = window.localStorage.getItem("invite_ref")
    if (ref && /^\d+$/.test(ref)) {
      await linkReferral(Number(ref))
    }
  } catch {
    // 무시 (초대 연결 실패가 로그인 흐름을 막지 않도록)
  } finally {
    window.localStorage.removeItem("invite_ref")
  }
}

// 크루 초대 링크로 가입/로그인한 경우 자동 합류 → 합류한 크루 id 반환 (실패해도 무시)
async function consumeCrewInvite(token: string): Promise<string | null> {
  try {
    const cid = window.localStorage.getItem("invite_crew")
    if (!cid) return null
    const res = await fetch(`${API_URL}/api/crews/${cid}/join`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    })
    return res.ok ? cid : null
  } catch {
    return null
  } finally {
    window.localStorage.removeItem("invite_crew")
  }
}

function KakaoCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const code = searchParams.get("code")
  const [status, setStatus] = useState("카카오 로그인 처리 중...")

  useEffect(() => {
    if (!code) return

    fetch(`${API_URL}/api/auth/kakao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: `${window.location.origin}/auth/callback/kakao` })
    })
      .then(res => res.json())
      .then(data => {
        if (data.access_token) {
          localStorage.setItem("token", data.access_token)

          fetch(`${API_URL}/api/users/me`, {
            headers: { "Authorization": `Bearer ${data.access_token}` }
          })
            .then(res => res.json())
            .then(async user => {
              await consumeInviteRef()
              const joinedCrew = await consumeCrewInvite(data.access_token)
              if (!user.location_name || user.location_name === "위치 미설정" || user.name.startsWith("User_")) {
                router.push("/onboarding")
              } else if (joinedCrew) {
                router.push(`/home-next/crew/${joinedCrew}?joined=1`)
              } else {
                router.push("/")
              }
            })
        } else {
          console.error("kakao login failed:", data)
          alert(`로그인 실패: ${data?.detail || "잠시 후 다시 시도해주세요."}`)
          router.push("/login")
        }
      })
      .catch((err) => {
        console.error(err)
        alert("서버 오류가 발생했습니다.")
        router.push("/login")
      })
  }, [code, router])

  return (
    <div className="flex h-screen items-center justify-center bg-white flex-col gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-[#F5A623]" />
      <p className="text-gray-500 font-bold">{status}</p>
    </div>
  )
}

export default function KakaoCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-white flex-col gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-[#F5A623]" />
          <p className="text-gray-500 font-bold">로딩 중...</p>
        </div>
      }
    >
      <KakaoCallbackContent />
    </Suspense>
  )
}
