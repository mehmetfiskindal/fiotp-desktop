import { app, shell, BrowserWindow, protocol, net } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerIpcHandlers } from "./ipc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Üretimde renderer dosyalarını güvenli bir custom protokolden sunar;
// getUserMedia'nın secure context gereksinimi böylece garanti edilir.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } },
]);

function createWindow(): void {
  const window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 480,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: "fiotp",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.on("ready-to-show", () => window.show());

  // Dış bağlantılar varsayılan tarayıcıda açılır; uygulama içinde yeni pencere açılmaz.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Kamera izni yalnızca uygulama içi sayfalara verilir.
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === "media");
    },
  );

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// Tek örnek kilidi: iki pencere aynı kasayı eşzamanlı yazmasın.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const windows = BrowserWindow.getAllWindows();
    const window = windows[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  void app.whenReady().then(async () => {
    registerIpcHandlers();

    if (process.env.FIOTP_SMOKE === "ipc") {
      createWindow();
      const [win] = BrowserWindow.getAllWindows();
      await new Promise<void>((resolve) => {
        win.webContents.once("did-finish-load", () => resolve());
      });
      const script = `
        (async () => {
          const out = [];
          const s0 = await window.fiotp.sessionStatus();
          out.push('status.unlocked=' + s0.unlocked);
          await window.fiotp.sessionOpen('test-parola-123', false);
          const accounts = await window.fiotp.accountsList();
          out.push('accounts=' + accounts.length);
          out.push('issuer=' + (accounts[0] && accounts[0].issuer));
          const codes = await window.fiotp.codesGetAll();
          out.push('code=' + /^[0-9]{6}$/.test(codes[0] ? codes[0].code : ''));
          const svg = await window.fiotp.accountsQrSvg(accounts[0].id);
          out.push('qrSvg=' + svg.startsWith('<svg'));
          const v = await window.fiotp.accountsVerify(accounts[0].id, '000000');
          out.push('verifyWrong=' + v.valid);
          const v2 = await window.fiotp.accountsVerify(accounts[0].id, codes[0].code);
          out.push('verifyRight=' + v2.valid);
          await window.fiotp.sessionLock();
          try { await window.fiotp.accountsList(); out.push('lockCheck=HATA'); }
          catch (e) { out.push('lockCheck=' + JSON.stringify({ code: e && e.code, message: e && e.message })); }
          // PNG QR: baytları okuyup IPC ile main'e taşı
          const pngBytes = new Uint8Array(await (await fetch('file:///tmp/opencode/fiotp-desk-e2e/qr2.png')).arrayBuffer());
          await window.fiotp.sessionOpen('test-parola-123', false);
          const qrAccount = await window.fiotp.accountsAddFromQr(pngBytes);
          out.push('pngQr=' + (qrAccount.issuer === 'Test'));
          return out.join(' | ');
        })()
      `;
      let result: string;
      try {
        result = await Promise.race([
          win.webContents.executeJavaScript(script),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("executeJavaScript timeout")), 20000),
          ),
        ]);
      } catch (error) {
        result = `IPC-SMOKE HATA: ${String(error)}`;
      }
      console.log("fiotp-desktop ipc:", result);
      app.exit(0);
      return;
    }

    if (process.env.FIOTP_SMOKE) {
      console.log("fiotp-desktop: app ready");
      createWindow();
      const windows = BrowserWindow.getAllWindows();
      console.log("fiotp-desktop: windows =", windows.length);
      const win = windows[0];
      win?.webContents.once("did-finish-load", () => {
        console.log("fiotp-desktop: renderer loaded:", win.webContents.getURL());
      });
      setTimeout(() => app.exit(0), 3000);
      return;
    }

    if (!process.env.ELECTRON_RENDERER_URL) {
      protocol.handle("app", (request) => {
        const url = new URL(request.url);
        const filePath = join(__dirname, "../renderer", url.pathname);
        return net.fetch(pathToFileURL(filePath).toString());
      });
    }

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
