import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /auth and /api calls to Flask during local development
    // so you don't hit CORS issues while building
    proxy: {
      "/auth": "http://localhost:5000",
      "/api": "http://localhost:5000",
    },
  },
});