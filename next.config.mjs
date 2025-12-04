/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            // 👇 ws, http, https 및 네이버 관련 모든 도메인 허용
            value: "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://oapi.map.naver.com http://oapi.map.naver.com *.map.naver.com *.map.naver.net *.pstatic.net https://v0-we-meet-app-features.vercel.app/auth/callback/kakao; img-src 'self' data: blob: *.map.naver.com *.map.naver.net *.pstatic.net http://static.naver.net https://v0-we-meet-app-features.vercel.app/auth/callback/kakao; connect-src 'self' *.map.naver.com *.map.naver.net *.pstatic.net https://kr-col-ext.nelo.navercorp.com https://v0-we-meet-app-features.vercel.app/auth/callback/kakao https://wemeet-backend-xqlo.onrender.com https://wemeet-backend-xqlo.onrender.com ws://localhost:8000;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;