/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false, // 지도 깜빡임 방지 (선택 사항)
    
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'Content-Security-Policy',
              value: [
                "default-src 'self';",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://openapi.map.naver.com https://oapi.map.naver.com https://nrbe.pstatic.net;",
                "style-src 'self' 'unsafe-inline';",
                "img-src 'self' data: blob: https://*.pstatic.net https://*.naver.com;",
                "connect-src 'self' https://kr-col-ext.nelo.navercorp.com https://*.naver.com;",
                "font-src 'self' data:;",
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