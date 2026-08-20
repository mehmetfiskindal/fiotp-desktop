import { FiotpService } from "@developersailor/fiotp";
import { app } from "electron";
import { homedir } from "node:os";
import { join } from "node:path";
import { access, readFile, writeFile } from "node:fs/promises";

interface Prefs {
  vaultPath?: string;
}

function prefsPath(): string {
  return join(app.getPath("userData"), "prefs.json");
}

function defaultVaultPath(): string {
  return join(homedir(), ".config", "fiotp", "kasa.json");
}

async function readPrefs(): Promise<Prefs> {
  try {
    return JSON.parse(await readFile(prefsPath(), "utf8")) as Prefs;
  } catch {
    return {};
  }
}

let cachedVaultPath: string | null = null;

/** Kasa yolunu belirler: env değişkeni > kullanıcının son seçtiği konum > varsayılan. */
export async function vaultPath(): Promise<string> {
  if (process.env.FIOTP_VAULT) return process.env.FIOTP_VAULT;
  if (cachedVaultPath === null) {
    const prefs = await readPrefs();
    cachedVaultPath = prefs.vaultPath ?? defaultVaultPath();
  }
  return cachedVaultPath;
}

/** Aktif kasa konumunu değiştirir ve bir sonraki açılış için kalıcı olarak kaydeder. */
export async function setVaultPath(path: string): Promise<void> {
  cachedVaultPath = path;
  if (!process.env.FIOTP_VAULT) {
    await writeFile(prefsPath(), JSON.stringify({ vaultPath: path }, null, 2), "utf8");
  }
}

/** Kasa dosyası mevcut mu? */
export async function vaultExists(): Promise<boolean> {
  try {
    await access(await vaultPath());
    return true;
  } catch {
    return false;
  }
}

/** Uygulama ömrü boyunca yaşayan tek oturum. */
export class Session {
  private service: FiotpService | null = null;

  public get current(): FiotpService | null {
    if (this.service !== null && !this.service.isUnlocked) {
      this.service = null;
    }
    return this.service;
  }

  public async open(masterPassword: string, create: boolean): Promise<void> {
    const path = await vaultPath();
    this.service = create
      ? await FiotpService.create(path, masterPassword)
      : await FiotpService.open(path, masterPassword);
  }

  public lock(): void {
    this.service?.lock();
    this.service = null;
  }
}
