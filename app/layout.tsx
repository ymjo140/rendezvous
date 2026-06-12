import type { Metadata, Viewport } from "next";
import "./globals.css";
// 👇 1. Next.js 스크립트 컴포넌트 불러오기 (필수!)
import Script from "next/script";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "랑데부 - 우리 만남의 시작",
  description: "중간 지점 찾기 및 장소 추천 서비스",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "랑데부",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F5A623",
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
        <Providers>{children}</Providers>

        {/* 👇 2. 네이버 지도 API 스크립트 로드 (여기가 핵심!) */}
        {/* strategy="beforeInteractive": 페이지 로드 전에 스크립트를 먼저 불러옵니다. */}
        <Script
  strategy="beforeInteractive"
  src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=kcplwdse1o"
/>
        {/* 👇 3. 카카오 JS SDK (카톡 친구 초대 / 추천 공유). 키는 lib/kakao.ts에서 lazy init */}
        <Script
          strategy="afterInteractive"
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
          integrity="sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEuu4jK2vxfAAD0eZxzCKakxg55G4"
          crossOrigin="anonymous"
        />
      </body>
    </html>
  );
}
