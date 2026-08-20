/** Üst gezinme çubuğunu sayfaya enjekte eder. */
export function renderNav(active: "accounts" | "add" | "settings"): void {
  const layout = document.querySelector<HTMLElement>(".layout")!;
  const header = document.createElement("header");
  header.className = "topbar";
  const items: Array<[string, string, typeof active]> = [
    ["accounts.html", "Hesaplar", "accounts"],
    ["add.html", "Ekle", "add"],
    ["settings.html", "Ayarlar", "settings"],
  ];
  header.innerHTML = `
    <a href="accounts.html" class="brand">
      <span class="logo">F</span> fiotp
    </a>
    <nav class="nav">
      ${items
        .map(
          ([href, label, key]) =>
            `<a href="${href}" class="${key === active ? "active" : ""}">${label}</a>`,
        )
        .join("")}
    </nav>
  `;
  layout.prepend(header);
}
