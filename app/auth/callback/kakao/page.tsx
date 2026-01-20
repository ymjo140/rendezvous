"use client"

import React, { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"


const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")

// 1. ?ㅼ젣 濡쒖쭅???닿릿 而댄룷?뚰듃 (useSearchParams ?ъ슜)
function KakaoCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const code = searchParams.get("code")
  const [status, setStatus] = useState("移댁뭅??濡쒓렇??泥섎━ 以?..")

  useEffect(() => {
    if (code) {
      fetch(`${API_URL}/api/auth/kakao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      })
      .then(res => res.json())
      .then(data => {
        if (data.access_token) {
          localStorage.setItem("token", data.access_token)
          
          // ?뙚 濡쒓렇?????ъ슜???뺣낫 ?뺤씤 (?⑤낫???꾩슂 ?щ? 泥댄겕)
          fetch(`${API_URL}/api/users/me`, {
            headers: { "Authorization": `Bearer ${data.access_token}` }
          })
          .then(res => res.json())
          .then(user => {
            // ?꾩튂媛 誘몄꽕???곹깭?닿굅?? ?대쫫???먮룞?앹꽦(User_...)??寃쎌슦 ?⑤낫?⑹쑝濡?
            if (!user.location_name || user.location_name === "?꾩튂 誘몄꽕?? || user.name.startsWith("User_")) {
                router.push("/onboarding")
            } else {
                router.push("/")
            }
          })
        } else {
          alert("濡쒓렇???ㅽ뙣")
          router.push("/login")
        }
      })
      .catch(() => {
        alert("?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.")
        router.push("/login")
      })
    }
  }, [code, router])

  return (
    <div className="flex h-screen items-center justify-center bg-white flex-col gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-[#7C3AED]" />
      <p className="text-gray-500 font-bold">{status}</p>
    </div>
  )
}

// 2. 硫붿씤 ?섏씠吏 而댄룷?뚰듃 (Suspense濡?媛먯떥湲?
export default function KakaoCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-white flex-col gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#7C3AED]" />
        <p className="text-gray-500 font-bold">濡쒕뵫 以?..</p>
      </div>
    }>
      <KakaoCallbackContent />
    </Suspense>
  )
}

