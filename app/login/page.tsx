"use client"

import React, { useEffect } from "react"
import Link from "next/link"
import { MessageCircle } from "lucide-react"

export default function LoginPage() {
  // 카톡 초대링크(?ref=초대자id)로 들어온 경우, 로그인 후 친구 연결을 위해 저장
  useEffect(() => {
    if (typeof window === "undefined") return
    const ref = new URLSearchParams(window.location.search).get("ref")
    if (ref && /^\d+$/.test(ref)) {
      window.localStorage.setItem("invite_ref", ref)
    }
  }, [])

  const kakaoRestApiKey =
    process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY ?? "ee65ae84782ed20fc6df3256de747e74"
  const redirectUri =
    process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI ??
    "https://v0-we-meet-app-features.vercel.app/auth/callback/kakao"
  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${kakaoRestApiKey}&redirect_uri=${redirectUri}&response_type=code`

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4 font-['Pretendard']">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        
        {/* 로고 영역 */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black text-[#F5A623]">랑데부</h1>
          <p className="text-gray-500">친구들과 더 쉽고 편하게 만나세요!</p>
        </div>

        {/* 카카오 로그인 버튼 */}
        <button 
          onClick={() => window.location.href = kakaoAuthUrl}
          className="w-full h-14 rounded-2xl bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold text-lg shadow-sm flex items-center justify-center gap-2 transition-all"
        >
          <MessageCircle className="w-6 h-6 fill-black border-none" />
          카카오로 3초 만에 시작하기
        </button>

        {/* 약관 동의 고지 (스토어/카카오 검수 요건) */}
        <p className="text-[11px] text-gray-400 text-center leading-relaxed">
          로그인 시{" "}
          <Link href="/terms" className="underline text-gray-500">이용약관</Link>
          {" "}및{" "}
          <Link href="/privacy" className="underline text-gray-500">개인정보처리방침</Link>
          에 동의하게 됩니다.
        </p>

      </div>
    </div>
  )
}