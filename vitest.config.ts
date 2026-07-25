import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // Los bundles de DigitalPersona se importan vía `?url` (asset URL de
      // Vite). El resolver de vitest intenta resolver el paquete real y
      // truena ("no known conditions"), y vi.mock no alcanza a interceptar
      // specifiers con query — los aliaseamos a un stub que exporta un
      // string, igual que haría `?url` en build.
      {
        find: /^@digitalpersona\/(fingerprint|websdk)\?url$/,
        replacement: path.resolve(__dirname, "./src/test/sdkUrlStub.ts"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
