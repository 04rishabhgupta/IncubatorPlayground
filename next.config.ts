import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return undefined;
  }
})();

/**
 * Security headers on every response. No Content-Security-Policy yet: the
 * app talks to Supabase over HTTPS and WebSockets and uses Next's inline
 * scripts, so a CSP needs its own careful pass (Phase 8 follow-up).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Browsers ignore this over plain http (local development).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // Company registration uploads a logo of up to 2 MB plus form fields.
      bodySizeLimit: "3mb",
    },
  },
  images: {
    // Public Supabase Storage objects (company logos, team avatars).
    remotePatterns: supabaseHost
      ? [
          {
            protocol: supabaseHost === "127.0.0.1" ? "http" : "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
