import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { env: { DATABASE_URL: "file:./prisma/test.db" }, fileParallelism: false },
});
