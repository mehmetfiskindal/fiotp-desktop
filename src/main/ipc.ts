import { ipcMain, dialog, BrowserWindow } from "electron";
import type { FiotpService } from "@developersailor/fiotp";
import { VaultLockedError } from "@developersailor/fiotp";
import { Session, vaultExists, vaultPath } from "./session.js";
import { guarded } from "./errors.js";

const session = new Session();

function service(): FiotpService {
  const current = session.current;
  if (!current) {
    throw new VaultLockedError();
  }
  return current;
}

interface AddAccountPayload {
  uri?: string;
  type?: "totp" | "hotp";
  issuer?: string;
  account?: string;
  secret?: string;
  algorithm?: "SHA1" | "SHA256" | "SHA512";
  digits?: number;
  period?: number;
  counter?: number;
}

function stripSecret<T extends { secret?: string }>(account: T): Omit<T, "secret"> {
  const { secret: _secret, ...view } = account;
  return view;
}

export function registerIpcHandlers(): void {
  ipcMain.handle("session:status", () =>
    guarded(async () => ({
      hasVault: await vaultExists(),
      vaultPath: vaultPath(),
      unlocked: session.current !== null,
    })),
  );

  ipcMain.handle(
    "session:open",
    (_event, payload: { password: string; create: boolean }) =>
      guarded(async () => {
        await session.open(payload.password, payload.create);
        return { ok: true } as const;
      }),
  );

  ipcMain.handle("session:lock", () =>
    guarded(() => {
      session.lock();
      return { ok: true } as const;
    }),
  );

  ipcMain.handle("accounts:list", () =>
    guarded(() => service().listAccounts({ hideSecrets: true })),
  );

  ipcMain.handle("accounts:add", (_event, payload: AddAccountPayload) =>
    guarded(async () => {
      const svc = service();
      const account =
        payload.uri !== undefined
          ? svc.addAccount(payload.uri)
          : svc.addAccount({
              type: payload.type ?? "totp",
              issuer: payload.issuer ?? "",
              account: payload.account ?? "",
              secret: payload.secret ?? "",
              algorithm: payload.algorithm,
              digits: payload.digits,
              period: payload.period,
              counter: payload.counter,
            });
      await svc.save();
      return stripSecret(account);
    }),
  );

  ipcMain.handle("accounts:addFromQr", (_event, pngBytes: Uint8Array) =>
    guarded(async () => {
      const svc = service();
      const account = svc.addAccountFromQr(pngBytes);
      await svc.save();
      return stripSecret(account);
    }),
  );

  ipcMain.handle("accounts:remove", (_event, id: string) =>
    guarded(async () => {
      const svc = service();
      const removed = svc.removeAccount(id);
      await svc.save();
      return { ok: removed } as const;
    }),
  );

  ipcMain.handle("accounts:verify", (_event, payload: { id: string; token: string }) =>
    guarded(async () => ({
      valid: await service().verifyCode(payload.id, payload.token),
    })),
  );

  ipcMain.handle("accounts:qrSvg", (_event, id: string) =>
    guarded(() => service().getQrSvg(id)),
  );

  ipcMain.handle("codes:getAll", () =>
    guarded(() => {
      const svc = service();
      return svc.listAccounts({ hideSecrets: true }).map((account) => ({
        id: account.id,
        ...svc.getCode(account.id),
      }));
    }),
  );

  ipcMain.handle("migration:import", (_event, payload: { uri: string }) =>
    guarded(async () => {
      const svc = service();
      const result = svc.importMigration(payload.uri);
      await svc.save();
      return result;
    }),
  );

  ipcMain.handle(
    "passwd:change",
    (_event, payload: { currentPassword: string; newPassword: string }) =>
      guarded(() =>
        service().changeMasterPassword(payload.currentPassword, payload.newPassword),
      ),
  );

  // Yedek dışa aktarma: native kaydet diyaloğu ile şifreli kasa içeriğini yazar.
  ipcMain.handle("backup:export", () =>
    guarded(async () => {
      const svc = service();
      const result = await dialog.showSaveDialog({
        title: "Kasa yedeğini kaydet",
        defaultPath: "kasa-backup.json",
        filters: [{ name: "fiotp Yedeği", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true } as const;
      const backup = await svc.exportBackup();
      const { writeFile } = await import("node:fs/promises");
      await writeFile(result.filePath, backup, {
        encoding: "utf8",
        mode: 0o600,
      });
      return { canceled: false, path: result.filePath } as const;
    }),
  );

  // Yedek içe aktarma: native aç diyaloğu ile dosyayı okur ve merge/replace uygular.
  ipcMain.handle(
    "backup:import",
    (_event, payload: { password: string; mode: "merge" | "replace" }) => {
      const window = BrowserWindow.getFocusedWindow();
      return guarded(async () => {
        const result = await dialog.showOpenDialog(window!, {
          title: "Yedek dosyasını seç",
          filters: [{ name: "fiotp Yedeği", extensions: ["json"] }],
          properties: ["openFile"],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true, added: 0 } as const;
        }
        const { readFile } = await import("node:fs/promises");
        const backupJson = await readFile(result.filePaths[0]!, "utf8");
        const added = await service().importBackup(
          backupJson,
          payload.password,
          payload.mode,
        );
        return { canceled: false, added } as const;
      });
    },
  );
}
