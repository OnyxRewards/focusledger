import { invoke as tauriInvoke } from "@tauri-apps/api/core";

declare global {
  interface Window {
    focusLedger?: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    };
  }
}

export function invoke<T = unknown>(command: string, args?: Record<string, unknown>) {
  if (window.focusLedger) {
    return window.focusLedger.invoke<T>(command, args);
  }
  return tauriInvoke<T>(command, args);
}
