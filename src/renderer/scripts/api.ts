import type { IpcError } from "../../preload/index";

/** Kodu 3+3 haneli gruplara ayırır. */
export function formatCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

/**
 * IPC çağrısını sarmalar; main process'ten gelen hata nesnesini
 * `lockedVault` bayrağı taşıyan istisnaya çevirir.
 */
export async function invoke<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const ipcError = error as IpcError & { message?: string };
    if (ipcError.lockedVault || /\[VAULT_LOCKED\]/.test(ipcError.message ?? "")) {
      location.href = "index.html";
      throw new Error(ipcError.message ?? "Kasa kilitli");
    }
    // message "[KOD] ..." biçimindeyse öneği temizle.
    const match = /^\[([A-Z_]+)\]\s*(.*)$/.exec(ipcError.message ?? "");
    const message = match ? match[2] : ipcError.message;
    throw Object.assign(new Error(message ?? "Bilinmeyen hata"), {
      retryAfterMs: ipcError.retryAfterMs,
      code: ipcError.code ?? match?.[1],
    });
  }
}
