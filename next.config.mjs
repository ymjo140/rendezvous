/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
      return [
          {
              source: "/:path*",
              headers: [
                  {
                      key: "Content-Security-Policy",
                      value: [
                          "default-src 'self';",
                          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://openapi.map.naver.com https://oapi.map.naver.com;",
                          "style-src 'self' 'unsafe-inline';",
                          "img-src 'self' blob: data: https:;",
                          "font-src 'self' data:;",
                          // 👇 여기가 핵심! 백엔드 주소(https, wss)와 네이버 API를 허용
                          "connect-src 'self' https://wemeet-backend-xqlo.onrender.com wss://wemeet-backend-xqlo.onrender.com https://openapi.map.naver.com https://oapi.map.naver.com https://naveropenapi.apigw.ntruss.com;",
                          "frame-src 'self' https://kauth.kakao.com;",
                          "object-src 'none';",
                          "base-uri 'self';",
                          "form-action 'self';",
                          "frame-ancestors 'none';",
                          "upgrade-insecure-requests;"
                      ].join(" ").replace(/\n/g, ""),
                  },
              ],
          },
      ];
  },
};

export default nextConfig;