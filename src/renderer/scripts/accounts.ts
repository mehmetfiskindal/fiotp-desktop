import { invoke, formatCode } from "./api";
import { renderNav } from "./nav";
import type { AccountView, CodeEntry } from "../../preload/index";

renderNav("accounts");

const grid = document.querySelector<HTMLElement>("#accounts-grid")!;
const emptyEl = document.querySelector<HTMLElement>("#empty-state")!;
const qrDialog = document.querySelector<HTMLDialogElement>("#qr-dialog")!;
const qrTitle = document.querySelector<HTMLElement>("#qr-title")!;
const qrImage = document.querySelector<HTMLElement>("#qr-image")!;

let accounts: AccountView[] = [];
let codes = new Map<string, CodeEntry>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function accountCard(account: AccountView): HTMLElement {
  const card = document.createElement("div");
  card.className = "card account-card";
  card.dataset.id = account.id;

  const issuer = account.issuer || account.account || "Adsız";
  const label = account.issuer ? account.account : "";

  card.innerHTML = `
    <div class="account-head">
      <div>
        <div class="account-issuer"></div>
        <div class="account-label"></div>
      </div>
      <span class="badge">${account.type}</span>
    </div>
    <div class="code-display mono">------</div>
    <div class="progress-track"><div class="progress-fill"></div></div>
    <div class="remaining"></div>
    <div class="account-actions">
      <button class="ghost" data-action="qr">QR</button>
      <button class="ghost" data-action="verify">Doğrula</button>
      <button class="ghost danger" data-action="remove">Sil</button>
    </div>
    <form class="verify-inline" hidden>
      <input type="text" inputmode="numeric" autocomplete="one-time-code"
             placeholder="6 haneli kod" maxlength="10" />
      <button type="submit" class="primary">Kontrol</button>
    </form>
  `;

  card.querySelector<HTMLElement>(".account-issuer")!.textContent = issuer;
  card.querySelector<HTMLElement>(".account-label")!.textContent = label;

  return card;
}

function renderAccounts(): void {
  grid.innerHTML = "";
  emptyEl.hidden = accounts.length > 0;

  for (const account of accounts) {
    const card = accountCard(account);
    grid.appendChild(card);

    card.querySelector<HTMLButtonElement>('[data-action="qr"]')!.addEventListener(
      "click",
      () => void showQr(account),
    );
    card
      .querySelector<HTMLButtonElement>('[data-action="verify"]')!
      .addEventListener("click", () => {
        const form = card.querySelector<HTMLFormElement>(".verify-inline")!;
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector("input")!.focus();
      });
    card
      .querySelector<HTMLButtonElement>('[data-action="remove"]')!
      .addEventListener("click", () => void removeAccount(account));

    const verifyForm = card.querySelector<HTMLFormElement>(".verify-inline")!;
    verifyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = verifyForm.querySelector<HTMLInputElement>("input")!;
      const button = verifyForm.querySelector<HTMLButtonElement>("button")!;
      button.disabled = true;
      try {
        const result = await invoke(() =>
          window.fiotp.accountsVerify(account.id, input.value.trim()),
        );
        input.value = "";
        alert(result.valid ? "Kod doğru." : "Kod yanlış.");
        if (result.valid && account.type === "hotp") {
          await refreshAccounts();
        }
      } catch (error) {
        alert((error as Error).message);
      } finally {
        button.disabled = false;
      }
    });
  }

  updateCards();
}

function updateCards(): void {
  for (const card of grid.querySelectorAll<HTMLElement>(".account-card")) {
    const code = codes.get(card.dataset.id!);
    if (!code) continue;

    const codeEl = card.querySelector<HTMLElement>(".code-display")!;
    codeEl.textContent = formatCode(code.code);

    const fill = card.querySelector<HTMLElement>(".progress-fill")!;
    const remainingEl = card.querySelector<HTMLElement>(".remaining")!;

    if (code.type === "totp" && code.remainingSeconds !== undefined) {
      const period = code.periodSeconds ?? 30;
      fill.style.width = `${(code.remainingSeconds / period) * 100}%`;
      fill.classList.toggle("low", code.remainingSeconds <= 5);
      remainingEl.textContent = `${code.remainingSeconds} sn`;
    } else {
      fill.style.width = "100%";
      remainingEl.textContent = "tek kullanımlık";
    }
  }
}

async function refreshAccounts(): Promise<void> {
  accounts = await invoke(() => window.fiotp.accountsList());
  renderAccounts();
}

async function pollCodes(): Promise<void> {
  try {
    const entries = await invoke(() => window.fiotp.codesGetAll());
    codes = new Map(entries.map((entry) => [entry.id, entry]));
    updateCards();
  } catch {
    // kilitlendiğinde invoke zaten index.html'e yönlendirir
  }
}

async function showQr(account: AccountView): Promise<void> {
  try {
    const svg = await invoke(() => window.fiotp.accountsQrSvg(account.id));
    qrImage.innerHTML = svg;
    qrTitle.textContent = `${account.issuer || account.account} — otpauth URI`;
    qrDialog.showModal();
  } catch (error) {
    alert(`QR alınamadı: ${(error as Error).message}`);
  }
}

async function removeAccount(account: AccountView): Promise<void> {
  if (!confirm(`"${account.issuer || account.account}" hesabı silinsin mi?`)) {
    return;
  }
  try {
    await invoke(() => window.fiotp.accountsRemove(account.id));
    await refreshAccounts();
  } catch (error) {
    alert((error as Error).message);
  }
}

qrDialog.addEventListener("click", (event) => {
  if (event.target === qrDialog) qrDialog.close();
});

// Kilit kontrolü: giriş sayfası değilsek oturum var mı bak.
invoke(() => window.fiotp.sessionStatus())
  .then((status) => {
    if (!status.unlocked) {
      location.href = "index.html";
      return;
    }
    return refreshAccounts()
      .then(() => pollCodes())
      .then(() => {
        pollTimer = setInterval(() => void pollCodes(), 1000);
      });
  })
  .catch(() => {
    location.href = "index.html";
  });

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !pollTimer) {
    void pollCodes();
    pollTimer = setInterval(() => void pollCodes(), 1000);
  } else if (document.visibilityState === "hidden" && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
