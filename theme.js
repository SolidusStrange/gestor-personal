/* Tema claro/nocturno. La preferencia se almacena localmente por navegador. */
(() => {
  "use strict";
  const KEY = "mi-progreso-theme";
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const buttons = [...document.querySelectorAll(".theme-toggle")];
  function apply(theme, persist = true) {
    const dark = theme === "dark";
    root.dataset.theme = dark ? "dark" : "light";
    buttons.forEach(btn => {
      const label = btn.querySelector(".theme-toggle-label");
      const icon = btn.querySelector(".theme-icon");
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", dark ? "Activar modo claro" : "Activar modo nocturno");
      btn.title = dark ? "Cambiar a modo claro" : "Cambiar a modo nocturno";
      if (label) label.textContent = dark ? "Modo claro" : "Modo nocturno";
      if (icon) icon.textContent = dark ? "☀" : "☾";
    });
    if (meta) meta.content = dark ? "#151b20" : "#f3f5f7";
    if (persist) { try { localStorage.setItem(KEY, dark ? "dark" : "light"); } catch (_) {} }
  }
  let initial = "light";
  try { initial = localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch (_) {}
  buttons.forEach(btn => btn.addEventListener("click", () => apply(root.dataset.theme === "dark" ? "light" : "dark")));
  window.addEventListener("storage", e => { if (e.key === KEY) apply(e.newValue, false); });
  apply(initial, false);
})();
