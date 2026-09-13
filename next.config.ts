import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /** `pg` and the Neon driver must not be bundled — they carry native/ws deps */
  serverExternalPackages: ["pg", "@neondatabase/serverless", "bcryptjs"],
  /** the runtime migration runner reads drizzle/*.sql, so ship those files */
  outputFileTracingIncludes: {
    "/api/**/*": ["./drizzle/**/*"],
    "/api/migrations": ["./drizzle/**/*"],
    "/api/setup/status": ["./drizzle/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
