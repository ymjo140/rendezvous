/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  // 배포 전 새 API를 로컬에서 화면으로 확인할 때만 쓴다.
  // CSP의 connect-src가 'self'와 배포 도메인만 허용해서 브라우저가 localhost:8000을
  // 직접 못 부른다. 그래서 같은 오리진(/api/...)으로 받아 개발서버가 대신 넘긴다.
  // LOCAL_API_PROXY가 없으면 이 블록은 아예 안 붙어서 배포에는 영향이 없다.
  async rewrites() {
    const target = process.env.LOCAL_API_PROXY
    if (!target) return []
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }]
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://openapi.map.naver.com https://oapi.map.naver.com https://*.pstatic.net https://*.vercel-scripts.com https://t1.kakaocdn.net https://developers.kakao.com https://js.sentry-cdn.com https://browser.sentry-cdn.com; " +
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
              "img-src 'self' data: blob: https://*.pstatic.net https://*.naver.com https://images.unsplash.com http://k.kakaocdn.net https://*.kakao.com https://*.supabase.co; " +
              "media-src 'self' blob: https://*.supabase.co; " +
              "worker-src 'self' blob:; " +
              "connect-src 'self' https://*.onrender.com wss://*.onrender.com https://*.trycloudflare.com wss://*.trycloudflare.com https://kr-col-ext.nelo.navercorp.com https://*.naver.com https://*.pstatic.net https://kapi.kakao.com https://kauth.kakao.com https://sharer.kakao.com https://*.ingest.sentry.io https://*.sentry.io; " +
              "font-src 'self' data: https://cdn.jsdelivr.net; " +
              "object-src 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self' https://sharer.kakao.com https://kauth.kakao.com https://accounts.kakao.com; " +
              "frame-ancestors 'none'; " +
              "upgrade-insecure-requests;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
