import { FiotpError, TooManyAttemptsError, VaultLockedError } from "@developersailor/fiotp";

/** Renderer'a taşınan hata nesnesi; koda göre ayrıştırılır. */
export interface IpcError {
  code: string;
  message: string;
  retryAfterMs?: number;
  lockedVault?: boolean;
}

/** Handler'ların ortak sonuç zarfı; hata değer olarak taşınır. */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: IpcError };

/**
 * Handler'ların ortak sarmalayıcısı: istisnayı sonuç zarfına çevirir.
 * Electron IPC istisnaları serileştirirken özellik kaybettiğinden hata,
 * reddedilen promise yerine `ok: false` değeri olarak döner.
 */
export async function guarded<T>(operation: () => Promise<T> | T): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return { ok: false, error: toIpcError(error) };
  }
}

/** Bir `FiotpError`'u IPC üzerinden taşınabilir nesneye çevirir. */
function toIpcError(error: unknown): IpcError {
  if (error instanceof FiotpError) {
    const ipcError: IpcError = { code: error.code, message: error.message };
    if (error instanceof TooManyAttemptsError) {
      ipcError.retryAfterMs = error.retryAfterMs;
    }
    if (error instanceof VaultLockedError) {
      ipcError.lockedVault = true;
    }
    return ipcError;
  }
  console.error(error);
  return { code: "internal", message: "Beklenmeyen bir hata oluştu" };
}
