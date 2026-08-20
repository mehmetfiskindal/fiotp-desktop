# fiotp-desktop

[fiotp](https://github.com/mehmetfiskindal/fiotp) iki faktörlü kimlik doğrulama
kasası için Electron tabanlı masaüstü uygulaması.

Web sürümünün (fiotp-web) yerleşimini ve akışlarını korur; HTTP katmanı yerine
tip güvenli Electron IPC kullanır. Kasa şifrelemesi ve gizli anahtarlar main
process'te kalır, renderer'a asla taşınmaz.

## Özellikler

- **Kasa açma/oluşturma**: CLI ile paylaşılan `~/.config/fiotp/kasa.json`
  varsayılan konumdur; kilit ekranından **"Var Olan Kasayı Aç…"** veya
  **"Yeni Konumda Oluştur…"** ile farklı bir konumdaki (ör. bir senkron
  klasöründeki) kasa dosyası seçilebilir. Seçim kalıcıdır ve bir sonraki
  açılışta hatırlanır; `FIOTP_VAULT` ortam değişkeni tanımlıysa her zaman
  önceliklidir.
- **Canlı TOTP kodları**: saniyede bir yenilenir, kalan süre göstergeli
- **HOTP desteği**: tek kullanımlık kod + doğrulamada otomatik sayaç ilerlemesi
- **Kamera ile QR taraması**: `getUserMedia` + jsQR; `otpauth://` ve
  `otpauth-migration://` (Google Authenticator dışa aktarımı) okunur
- **PNG QR yükleme**: sunucu tarafında (main process) `decodeQrFromPng` ile
- **URI yapıştırma** ve **manuel hesap girişi** (algoritma, hane, periyot, sayaç)
- **QR gösterimi**: hesap başına otpauth URI'sinin SVG QR kodu
- **Kod doğrulama**: girilen kodun geçerliliğini kontrol eder
- **Ayarlar**: master parola değiştirme, **native diyaloglarla** yedek
  al/yükle (merge/replace), oturumu kilitleme
- **Güvenlik**: `contextIsolation` + `sandbox` açık, `nodeIntegration` kapalı,
  her sayfada CSP, yalnız kamera izni verilen `setPermissionRequestHandler`,
  tek örnek kilidi, 5 dakika hareketsizlikte otomatik kilit, throttling'de
  geri sayımlı buton

## Mimari

```
Renderer (vanilla TS)              Main process (Node)
─────────────────────              ──────────────────
4 HTML sayfası        ──IPC──▶     ipc.ts → FiotpService
  ├─ canlı kod akışı                └─ VaultManager (AES-256-GCM)
  ├─ jsQR kamera taraması                └─ ~/.config/fiotp/kasa.json
  └─ preload: contextBridge        (CLI/web ile aynı kasa)
```

- IPC handler'ları `{ ok, data | error }` zarfı döner; hata `FiotpError`
  kodlarını (`VAULT_LOCKED`, `TOO_MANY_ATTEMPTS` + `retryAfterMs`, …) korur.
- `secret` alanı hiçbir IPC yanıtında renderer'a dönmez.

## Geliştirme

```bash
npm install
npm run dev        # HMR'lı geliştirme
npm run typecheck  # tip denetimi
npm run build      # üretim derlemesi (out/)
```

### Ortam değişkenleri

| Değişken      | Varsayılan                   | Açıklama             |
| ------------- | ---------------------------- | -------------------- |
| `FIOTP_VAULT` | (kullanıcının son seçtiği kasa) | Kasa dosyasının yolu; tanımlıysa UI'daki kasa seçimini geçersiz kılar |

Kasa yolu önceliği: `FIOTP_VAULT` env değişkeni → kullanıcının kilit
ekranından en son seçtiği konum (`<userData>/prefs.json`'da saklanır) →
`~/.config/fiotp/kasa.json`.

### Duman testi (headless)

```bash
FIOTP_VAULT=/tmp/test-kasa.json FIOTP_SMOKE=ipc npx electron out/main/index.js --no-sandbox
```

## Paketleme

```bash
npm run dist:linux  # AppImage
npm run dist:win    # NSIS kurulum (Windows)
npm run dist:mac    # dmg (macOS)
```

- Linux: AppImage (`release/fiotp-0.1.0.AppImage`)
- Windows/macOS hedefleri tanımlıdır; bu Linux makinede cross-build üretilebilir
  ancak gerçek doğrulama hedef platformda yapılmalıdır.
- macOS paketi imzasızdır.

## Notlar

- CLI aynı anda kasayı açarsa eşzamanlı yazma riski düşüktür; kasa atomik
  yazılır ve her yazmada `.bak` yedeği tutulur.
- Throttle sayacı bellekte tutulur (fiotp çekirdek davranışı).
- Uygulama ikonu `build/icon.png`'den türetilir (512×512).
