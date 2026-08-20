import { invoke } from "./api";

const statusEl = document.querySelector<HTMLElement>("#vault-status")!;
const form = document.querySelector<HTMLFormElement>("#unlock-form")!;
const passwordInput = document.querySelector<HTMLInputElement>("#password")!;
const confirmInput = document.querySelector<HTMLInputElement>("#confirm-password")!;
const confirmField = document.querySelector<HTMLElement>("#confirm-field")!;
const submitButton = document.querySelector<HTMLButtonElement>("#submit")!;
const errorEl = document.querySelector<HTMLElement>("#error")!;
const createHint = document.querySelector<HTMLElement>("#create-hint")!;
const heading = document.querySelector<HTMLHeadingElement>("h1")!;

let createMode = false;
let lockTimer: ReturnType<typeof setInterval> | null = null;

async function loadStatus(): Promise<void> {
  const status = await invoke(() => window.fiotp.sessionStatus());
  if (status.unlocked) {
    location.href = "accounts.html";
    return;
  }
  if (!status.hasVault) {
    createMode = true;
    heading.textContent = "Yeni Kasa Oluştur";
    createHint.hidden = false;
    confirmField.hidden = false;
  }
  statusEl.textContent = status.vaultPath;
}

function showError(message: string): void {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function startLockCountdown(ms: number): void {
  const disable = (remaining: number) => {
    submitButton.disabled = true;
    submitButton.textContent = `Kilitli (${Math.ceil(remaining / 1000)} sn)`;
  };
  let remaining = ms;
  disable(remaining);
  lockTimer = setInterval(() => {
    remaining -= 1000;
    if (remaining <= 0) {
      clearInterval(lockTimer!);
      lockTimer = null;
      submitButton.disabled = false;
      submitButton.textContent = createMode ? "Kasayı Oluştur" : "Kilidi Aç";
      errorEl.hidden = true;
    } else {
      disable(remaining);
    }
  }, 1000);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  submitButton.disabled = true;

  const password = passwordInput.value;
  if (createMode && password !== confirmInput.value) {
    showError("Parolalar eşleşmiyor.");
    submitButton.disabled = false;
    return;
  }

  try {
    await invoke(() => window.fiotp.sessionOpen(password, createMode));
    location.href = "accounts.html";
  } catch (error) {
    const err = error as Error & { retryAfterMs?: number };
    if (err.retryAfterMs !== undefined) {
      showError("Çok fazla başarısız deneme. Lütfen bekleyin.");
      startLockCountdown(err.retryAfterMs);
    } else {
      showError(err.message);
      submitButton.disabled = false;
    }
  }
});

loadStatus();
