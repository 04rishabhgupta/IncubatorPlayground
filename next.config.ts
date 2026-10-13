import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
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
