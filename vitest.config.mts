import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    include: ["tests/**/*.test.ts"],
    // The integration test needs local Supabase running; it only runs via `npm run test:int`.
    exclude: process.env.INTEGRATION ? ["node_modules/**"] : ["node_modules/**", "tests/**/*.integration.test.ts"],
    testTimeout: 30_000,
  },
});
