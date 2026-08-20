import { FiotpService } from "@developersailor/fiotp";
import { homedir } from "node:os";
import { join } from "node:path";
import { access } from "node:fs/promises";

/** Kasa yolunu ortam değişkeninden veya varsayılan konumdan belirler. */
export function vaultPath(): string {
  return process.env.FIOTP_VAULT ?? join(homedir(), ".config", "fiotp", "kasa.json");
}

/** Kasa dosyası mevcut mu? */
export async function vaultExists(): Promise<boolean> {
  try {
    await access(vaultPath());
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
    const path = vaultPath();
    this.service = create
      ? await FiotpService.create(path, masterPassword)
      : await FiotpService.open(path, masterPassword);
  }

  public lock(): void {
    this.service?.lock();
    this.service = null;
  }
}
