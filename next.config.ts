import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: every signed-in page is per-user and dynamic, so it would only add
  // Suspense boilerplate. Revisit if we add public, cacheable pages.
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
