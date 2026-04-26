/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIDECAR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.json" {
  const value: any;
  export default value;
}
