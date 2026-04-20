import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 6060,
    strictPort: true, // Fail if 6060 is not available
  }
});
