import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests target pure logic (frame parsing, session reducers), not React
    // rendering, so plain Node is enough — no jsdom dependency needed.
    environment: "node",
    include: ["src/test/**/*.test.ts", "src/test/**/*.test.tsx"],
  },
});
