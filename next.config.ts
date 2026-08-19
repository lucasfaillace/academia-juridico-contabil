import type { NextConfig } from "next";

const noStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
];

const publicEdgeCacheHeaders = [
  { key: "CDN-Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=86400" },
  { key: "Cloudflare-CDN-Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=86400" },
];

const reportOnlyPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "media-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  async headers() {
    return [
      { source: "/(.*)", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy },
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
