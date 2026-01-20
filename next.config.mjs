/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self';",
              // 카카오, 네이버 지도 등 외부 스크립트 허용
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://openapi.map.naver.com https://oapi.map.naver.com https://nrbe.pstatic.net https://*.vercel-scripts.com https://t1.kakaocdn.net https://developers.kakao.com;",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;", 
              // 이미지 소스에 카카오 프로필 등 허용
              "img-src 'self' data: blob: https://*.pstatic.net https://*.naver.com https://images.unsplash.com http://k.kakaocdn.net https://*.kakao.com;",
              // [핵심] 구버전(xqlo) + 신버전(4lza) + 카카오 API 모두 허용
              "default-src 'self'; connect-src 'self' https://*.trycloudflare.com;",
              "connect-src 'self' https://kr-col-ext.nelo.navercorp.com https://*.naver.com https://advertiser-senator-another-distinguished.trycloudflare.com wss://wemeet-backend-xqlo.onrender.com https://wemeet-backend-4lza.onrender.com wss://wemeet-backend-4lza.onrender.com https://kapi.kakao.com https://kauth.kakao.com;", 
              "font-src 'self' data: https://cdn.jsdelivr.net;",
              "object-src 'none';",
              "base-uri 'self';",
              "form-action 'self';",
              "frame-ancestors 'none';",
              "upgrade-insecure-requests;"
            ].join(' ').replace(/\n/g, ''),
          },
        ],
      },
    ];
  },
};

export default nextConfig;