import type { Metadata } from "next";
import "./globals.css";
// 👇 1. Next.js 스크립트 컴포넌트 불러오기 (필수!)
import Script from "next/script";

export const metadata: Metadata = {
  title: "WeMeet - 우리 만남의 시작",
  description: "중간 지점 찾기 및 장소 추천 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" as="style" crossOrigin="anonymous" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.8/dist/web/static/pretendard.css" />
      </head>
      <body className="font-['Pretendard'] antialiased bg-[#F3F4F6] text-gray-900">
        {children}

        {/* 👇 2. 네이버 지도 API 스크립트 로드 (여기가 핵심!) */}
        {/* strategy="beforeInteractive": 페이지 로드 전에 스크립트를 먼저 불러옵니다. */}
        <Script
  strategy="beforeInteractive"
  src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=9v6ryi96pr"
/>
      </body>
    </html>
  );
}