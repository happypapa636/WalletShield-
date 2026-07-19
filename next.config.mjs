import path from "node:path"

/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV !== "production"

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
  `connect-src 'self' https://*.vercel-insights.com https://vitals.vercel-insights.com${isDevelopment ? " http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "upgrade-insecure-requests",
].join("; ")

const nextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: path.resolve(),
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
    ]
  },
}

export default nextConfig
