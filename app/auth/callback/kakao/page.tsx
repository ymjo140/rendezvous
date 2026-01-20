"use client"

import React, { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")

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
      body: JSON.stringify({ code })
    })
      .then(res => res.json())
      .then(data => {
        if (data.access_token) {
          localStorage.setItem("token", data.access_token)

          fetch(`${API_URL}/api/users/me`, {
            headers: { "Authorization": `Bearer ${data.access_token}` }
          })
            .then(res => res.json())
            .then(user => {
              if (!user.location_name || user.location_name === "위치 미설정" || user.name.startsWith("User_")) {
                router.push("/onboarding")
              } else {
                router.push("/")
              }
            })
        } else {
          alert("로그인 실패")
          router.push("/login")
        }
      })
      .catch(() => {
        alert("서버 오류가 발생했습니다.")
        router.push("/login")
      })
  }, [code, router])

  return (
    <div className="flex h-screen items-center justify-center bg-white flex-col gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-[#7C3AED]" />
      <p className="text-gray-500 font-bold">{status}</p>
    </div>
  )
}

export default function KakaoCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-white flex-col gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-[#7C3AED]" />
          <p className="text-gray-500 font-bold">로딩 중...</p>
        </div>
      }
    >
      <KakaoCallbackContent />
    </Suspense>
  )
}
