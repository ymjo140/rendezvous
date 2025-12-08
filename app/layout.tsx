// app/layout.tsx

import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "WeMeet",
  description: "AI Group Recommendation",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 👇 [추가됨] 보안 정책 강제 설정 (WebSocket 허용 포함) */}
        
        
        {/* ✅ [기존 유지] 사용자님이 주신 새 ID와 ncpKeyId 적용 */}
        <Script 
          strategy="beforeInteractive" 
          src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=djsgmvkn5q`} 
        />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}