import { contextBridge, ipcRenderer } from "electron";

/** Hesap görünümü; secret asla renderer'a taşınmaz. */
export interface AccountView {
  id: string;
  type: "totp" | "hotp";
  issuer: string;
  account: string;
  algorithm: string;
  digits: number;
  period?: number;
  counter?: number;
  createdAt: number;
}

export interface CodeEntry {
  id: string;
  type: "totp" | "hotp";
  code: string;
  remainingSeconds?: number;
  periodSeconds?: number;
}

export interface SessionStatus {
  hasVault: boolean;
  vaultPath: string;
  unlocked: boolean;
}

export interface MigrationResult {
  added: number;
  skippedMd5: number;
  skippedInvalid: number;
}

export interface IpcError {
  code: string;
  message: string;
  retryAfterMs?: number;
  lockedVault?: boolean;
}

export interface FiotpApi {
  sessionStatus(): Promise<SessionStatus>;
  sessionOpen(password: string, create: boolean): Promise<{ ok: boolean }>;
  sessionLock(): Promise<{ ok: boolean }>;
  accountsList(): Promise<AccountView[]>;
  accountsAdd(payload: {
    uri?: string;
    type?: "totp" | "hotp";
    issuer?: string;
    account?: string;
    secret?: string;
    algorithm?: "SHA1" | "SHA256" | "SHA512";
    digits?: number;
    period?: number;
    counter?: number;
  }): Promise<AccountView>;
  accountsAddFromQr(pngBytes: Uint8Array): Promise<AccountView>;
  accountsRemove(id: string): Promise<{ ok: boolean }>;
  accountsVerify(id: string, token: string): Promise<{ valid: boolean }>;
  accountsQrSvg(id: string): Promise<string>;
  codesGetAll(): Promise<CodeEntry[]>;
  migrationImport(uri: string): Promise<MigrationResult>;
  passwdChange(currentPassword: string, newPassword: string): Promise<{ ok: boolean }>;
  backupExport(): Promise<{ canceled: boolean; path?: string }>;
  backupImport(
    password: string,
    mode: "merge" | "replace",
  ): Promise<{ canceled: boolean; added: number }>;
}

/**
 * IPC çağrısının sonuç zarfını açar; hata durumunda `IpcError` özelliklerini
 * taşıyan istisna fırlatır. Anahtar fikat: hata, değer olarak taşındığından
 * Electron'un istisna serileştirmesine tabi değildir.
 */
async function unwrap<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as
    | { ok: true; data: T }
    | { ok: false; error: IpcError };
  if (result.ok) return result.data;
  // Not: executeJavaScript gibi ikincil geçişlerde own-properties düşebildiğinden
  // code bilgisi message'a "[KOD]" öneki olarak da gömülür.
  const { code, message, ...rest } = result.error;
  throw Object.assign(new Error(`[${code}] ${message}`), { code, ...rest });
}

const api: FiotpApi = {
  sessionStatus: () => unwrap("session:status"),
  sessionOpen: (password, create) => unwrap("session:open", { password, create }),
  sessionLock: () => unwrap("session:lock"),
  accountsList: () => unwrap("accounts:list"),
  accountsAdd: (payload) => unwrap("accounts:add", payload),
  accountsAddFromQr: (pngBytes) => unwrap("accounts:addFromQr", pngBytes),
  accountsRemove: (id) => unwrap("accounts:remove", id),
  accountsVerify: (id, token) => unwrap("accounts:verify", { id, token }),
  accountsQrSvg: (id) => unwrap("accounts:qrSvg", id),
  codesGetAll: () => unwrap("codes:getAll"),
  migrationImport: (uri) => unwrap("migration:import", { uri }),
  passwdChange: (currentPassword, newPassword) =>
    unwrap("passwd:change", { currentPassword, newPassword }),
  backupExport: () => unwrap("backup:export"),
  backupImport: (password, mode) => unwrap("backup:import", { password, mode }),
};

contextBridge.exposeInMainWorld("fiotp", api);
