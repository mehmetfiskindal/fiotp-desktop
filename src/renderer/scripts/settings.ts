import { invoke } from "./api";
import { renderNav } from "./nav";

renderNav("settings");

// Kilit kontrolü
invoke(() => window.fiotp.sessionStatus()).catch(() => {
  location.href = "index.html";
});

// ---- Master parola ----
const passwdForm = document.querySelector<HTMLFormElement>("#passwd-form")!;
const passwdMsg = document.querySelector<HTMLElement>("#passwd-msg")!;

passwdForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  passwdMsg.hidden = true;
  const current = document.querySelector<HTMLInputElement>("#current-password")!.value;
  const next = document.querySelector<HTMLInputElement>("#new-password")!.value;
  const confirm = document.querySelector<HTMLInputElement>("#confirm-new-password")!.value;

  if (next !== confirm) {
    passwdMsg.textContent = "Yeni parolalar eşleşmiyor.";
    passwdMsg.className = "alert error";
    passwdMsg.hidden = false;
    return;
  }

  try {
    await invoke(() => window.fiotp.passwdChange(current, next));
    passwdMsg.textContent = "Master parola değiştirildi.";
    passwdMsg.className = "alert success";
    passwdForm.reset();
  } catch (error) {
    passwdMsg.textContent = (error as Error).message;
    passwdMsg.className = "alert error";
  }
  passwdMsg.hidden = false;
});

// ---- Yedek dışa aktarma (native kaydet diyaloğu) ----
document.querySelector<HTMLButtonElement>("#export-button")!.addEventListener(
  "click",
  async () => {
    try {
      const result = await invoke(() => window.fiotp.backupExport());
      if (!result.canceled && result.path) {
        alert(`Yedek kaydedildi: ${result.path}`);
      }
    } catch (error) {
      alert((error as Error).message);
    }
  },
);

// ---- Yedek içe aktarma (native aç diyaloğu) ----
const importForm = document.querySelector<HTMLFormElement>("#import-form")!;
const importMsg = document.querySelector<HTMLElement>("#import-msg")!;

importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  importMsg.hidden = true;
  const password = document.querySelector<HTMLInputElement>("#backup-password")!.value;
  const mode = document.querySelector<HTMLSelectElement>("#backup-mode")!.value as
    | "merge"
    | "replace";

  try {
    const result = await invoke(() => window.fiotp.backupImport(password, mode));
    if (result.canceled) return;
    importMsg.textContent = `${result.added} hesap içe aktarıldı.`;
    importMsg.className = "alert success";
    importForm.reset();
  } catch (error) {
    importMsg.textContent = (error as Error).message;
    importMsg.className = "alert error";
  }
  importMsg.hidden = false;
});

// ---- Kilitle ----
document.querySelector<HTMLButtonElement>("#lock-button")!.addEventListener(
  "click",
  async () => {
    await invoke(() => window.fiotp.sessionLock()).catch(() => undefined);
    location.href = "index.html";
  },
);
