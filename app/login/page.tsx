"use client"

import React from "react"
import { MessageCircle } from "lucide-react"

export default function LoginPage() {
  const kakaoRestApiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY
  const redirectUri = process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI
  const isKakaoConfigured = Boolean(kakaoRestApiKey && redirectUri)
  const kakaoAuthUrl = isKakaoConfigured
    ? `https://kauth.kakao.com/oauth/authorize?client_id=${kakaoRestApiKey}&redirect_uri=${redirectUri}&response_type=code`
    : ""

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4 font-['Pretendard']">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        
        {/* 로고 영역 */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black text-[#7C3AED]">WeMeet</h1>
          <p className="text-gray-500">친구들과 더 쉽고 편하게 만나세요!</p>
        </div>

        {/* 카카오 로그인 버튼 */}
        <button
          onClick={() => {
            if (!isKakaoConfigured) {
              alert("카카오 로그인 설정이 필요합니다.")
              return
            }
            window.location.href = kakaoAuthUrl
          }}
          disabled={!isKakaoConfigured}
          className="w-full h-14 rounded-2xl bg-[#FEE500] hover:bg-[#FEE500]/90 text-black font-bold text-lg shadow-sm flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
        >
          <MessageCircle className="w-6 h-6 fill-black border-none" />
          카카오로 3초 만에 시작하기
        </button>

      </div>
    </div>
  )
}