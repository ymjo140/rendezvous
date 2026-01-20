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
            value: "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://openapi.map.naver.com https://oapi.map.naver.com https://nrbe.pstatic.net https://*.vercel-scripts.com https://t1.kakaocdn.net https://developers.kakao.com; " +
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
              "img-src 'self' data: blob: https://*.pstatic.net https://*.naver.com https://images.unsplash.com http://k.kakaocdn.net https://*.kakao.com; " +
              "connect-src 'self' https://*.trycloudflare.com https://kr-col-ext.nelo.navercorp.com https://*.naver.com https://kapi.kakao.com https://kauth.kakao.com; " +
              "font-src 'self' data: https://cdn.jsdelivr.net; " +
              "object-src 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self'; " +
              "frame-ancestors 'none'; " +
              "upgrade-insecure-requests;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
