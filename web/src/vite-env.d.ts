/// <reference types="vite/client" />

interface MocoCallRuntimeConfig {
  apiBaseUrl?: string;
}

interface Window {
  __MOCOCALL_CONFIG__?: MocoCallRuntimeConfig;
}
