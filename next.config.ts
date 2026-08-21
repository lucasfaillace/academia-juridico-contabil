import type { NextConfig } from "next";

const noStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
];

const publicEdgeCacheHeaders = [
  { key: "CDN-Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=86400" },
  { key: "Cloudflare-CDN-Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=86400" },
];

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "style-src-elem 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "script-src-elem 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "script-src-attr 'none'",
  "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "media-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]
    : []),
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  async headers() {
    return [
      { source: "/(.*)", headers: [
        ...securityHeaders,
      ] },
      { source: "/admin/:path*", headers: noStoreHeaders },
      { source: "/api/:path*", headers: noStoreHeaders },
      { source: "/blog", headers: noStoreHeaders },
      { source: "/", headers: publicEdgeCacheHeaders },
      { source: "/blog/:slug", headers: publicEdgeCacheHeaders },
      { source: "/publicacoes", headers: publicEdgeCacheHeaders },
    ];
  },
};

export default nextConfig;
