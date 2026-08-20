import jsQR from "jsqr";
import { invoke } from "./api";
import { renderNav } from "./nav";
import type { AccountView, MigrationResult } from "../../preload/index";

renderNav("add");

const tabs = document.querySelectorAll<HTMLButtonElement>(".tab-button")!;
const panels = document.querySelectorAll<HTMLElement>(".tab-panel")!;

const statusEl = document.querySelector<HTMLElement>("#add-status")!;
const errorEl = document.querySelector<HTMLElement>("#add-error")!;

// ---- Kamera ----
const startButton = document.querySelector<HTMLButtonElement>("#camera-start")!;
const stopButton = document.querySelector<HTMLButtonElement>("#camera-stop")!;
const video = document.querySelector<HTMLVideoElement>("#camera-video")!;
const cameraFrame = document.querySelector<HTMLElement>("#camera-frame")!;
const cameraHint = document.querySelector<HTMLElement>("#camera-hint")!;

let stream: MediaStream | null = null;
let scanTimer: ReturnType<typeof setInterval> | null = null;
let scanning = false;

function showStatus(message: string, kind: "success" | "error"): void {
  statusEl.textContent = message;
  statusEl.className = `alert ${kind}`;
  statusEl.hidden = false;
  if (kind === "success") {
    errorEl.hidden = true;
    setTimeout(() => {
      location.href = "accounts.html";
    }, 1200);
  }
}

async function startCamera(): Promise<void> {
  errorEl.hidden = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch {
    errorEl.textContent =
      "Kameraya erişilemedi. Cihazda bağlı bir kamera olduğundan emin olun.";
    errorEl.hidden = false;
    return;
  }

  video.srcObject = stream;
  await video.play();
  cameraHint.hidden = true;
  cameraFrame.classList.add("scanning");
  startButton.disabled = true;
  stopButton.disabled = false;
  scanning = true;
  scanTimer = setInterval(scanFrame, 120);
}

function stopCamera(): void {
  scanning = false;
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  cameraHint.hidden = false;
  cameraFrame.classList.remove("scanning");
  startButton.disabled = false;
  stopButton.disabled = true;
}

function scanFrame(): void {
  if (!scanning || video.readyState < video.HAVE_CURRENT_DATA) return;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 720 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "dontInvert",
  });
  if (result && result.data.length > 0) {
    void handleDecoded(result.data);
  }
}

async function handleDecoded(text: string): Promise<void> {
  stopCamera();
  try {
    if (text.startsWith("otpauth-migration://")) {
      const result = await invoke<MigrationResult>(() =>
        window.fiotp.migrationImport(text),
      );
      showStatus(
        `${result.added} hesap içe aktarıldı${result.skippedMd5 > 0 ? `, ${result.skippedMd5} MD5 hesap atlandı` : ""}.`,
        "success",
      );
    } else if (text.startsWith("otpauth://")) {
      const account = await invoke<AccountView>(() =>
        window.fiotp.accountsAdd({ uri: text }),
      );
      showStatus(`"${account.issuer || account.account}" eklendi.`, "success");
    } else {
      errorEl.textContent =
        "QR kod bir otpauth:// veya otpauth-migration:// URI'si içermiyor.";
      errorEl.hidden = false;
    }
  } catch (error) {
    errorEl.textContent = (error as Error).message;
    errorEl.hidden = false;
  }
}

startButton.addEventListener("click", () => void startCamera());
stopButton.addEventListener("click", stopCamera);
window.addEventListener("pagehide", stopCamera);

// ---- PNG yükleme ----
const pngForm = document.querySelector<HTMLFormElement>("#png-form")!;
const pngInput = document.querySelector<HTMLInputElement>("#png-file")!;

pngForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const file = pngInput.files?.[0];
  if (!file) {
    errorEl.textContent = "Önce bir PNG dosyası seçin.";
    errorEl.hidden = false;
    return;
  }
  try {
    const pngBytes = new Uint8Array(await file.arrayBuffer());
    const account = await invoke<AccountView>(() =>
      window.fiotp.accountsAddFromQr(pngBytes),
    );
    showStatus(`"${account.issuer || account.account}" eklendi.`, "success");
  } catch (error) {
    errorEl.textContent = (error as Error).message;
    errorEl.hidden = false;
  }
});

// ---- URI ----
const uriForm = document.querySelector<HTMLFormElement>("#uri-form")!;
const uriInput = document.querySelector<HTMLTextAreaElement>("#uri-input")!;

uriForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const uri = uriInput.value.trim();
  if (!uri) return;
  try {
    if (uri.startsWith("otpauth-migration://")) {
      const result = await invoke<MigrationResult>(() =>
        window.fiotp.migrationImport(uri),
      );
      showStatus(
        `${result.added} hesap içe aktarıldı${result.skippedMd5 > 0 ? `, ${result.skippedMd5} MD5 hesap atlandı` : ""}.`,
        "success",
      );
    } else {
      const account = await invoke<AccountView>(() =>
        window.fiotp.accountsAdd({ uri }),
      );
      showStatus(`"${account.issuer || account.account}" eklendi.`, "success");
    }
  } catch (error) {
    errorEl.textContent = (error as Error).message;
    errorEl.hidden = false;
  }
});

// ---- Manuel form ----
const manualForm = document.querySelector<HTMLFormElement>("#manual-form")!;

manualForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const data = new FormData(manualForm);
  const payload: Record<string, unknown> = {
    type: data.get("type"),
    issuer: data.get("issuer"),
    account: data.get("account"),
    secret: data.get("secret"),
  };
  const algorithm = data.get("algorithm");
  if (algorithm && algorithm !== "default") payload.algorithm = algorithm;
  const digits = data.get("digits");
  if (digits && digits !== "default") payload.digits = Number(digits);
  const period = data.get("period");
  if (period) payload.period = Number(period);
  const counter = data.get("counter");
  if (data.get("type") === "hotp" && counter) payload.counter = Number(counter);

  try {
    const account = await invoke<AccountView>(() =>
      window.fiotp.accountsAdd(payload as Parameters<typeof window.fiotp.accountsAdd>[0]),
    );
    showStatus(`"${account.issuer || account.account}" eklendi.`, "success");
  } catch (error) {
    errorEl.textContent = (error as Error).message;
    errorEl.hidden = false;
  }
});

// ---- Sekmeler ----
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    for (const t of tabs) t.classList.toggle("active", t === tab);
    for (const panel of panels) {
      panel.hidden = panel.id !== tab.dataset.panel;
    }
    if (tab.dataset.panel !== "tab-camera" && scanning) stopCamera();
  });
}

// Kilit kontrolü
invoke(() => window.fiotp.sessionStatus()).catch(() => {
  location.href = "index.html";
});
