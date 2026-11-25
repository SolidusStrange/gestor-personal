/* Autenticación por invitación con Supabase Auth. */
(() => {
  "use strict";
  const client = window.supabaseClient;
  const loginView = document.getElementById("login-view");
  const setupView = document.getElementById("password-setup-view");
  const feedback = document.getElementById("auth-feedback");
  const loginForm = document.getElementById("login-form");
  const setupForm = document.getElementById("password-setup-form");
  function message(text, kind = "") {
    feedback.textContent = text;
    feedback.classList.toggle("error", kind === "error");
    feedback.classList.toggle("success", kind === "success");
  }
  function showSetup() { loginView.classList.add("hidden"); setupView.classList.remove("hidden"); message("Invitación verificada. Establece tu contraseña.", "success"); }
  async function initialize() {
    if (!client) { message("No se pudo cargar Supabase. Revisa tu conexión.", "error"); return; }
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const invite = [query.get("type"), hash.get("type")].some(v => v === "invite" || v === "recovery") || query.has("code");
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (invite && data.session) { showSetup(); return; }
    if (data.session) { location.replace("index.html"); return; }
    if (invite) message("El enlace no pudo validarse. Solicita una nueva invitación.", "error");
  }
  loginForm.addEventListener("submit", async e => {
    e.preventDefault(); const button = document.getElementById("login-submit");
    button.disabled = true; message("Verificando credenciales…");
    try {
      const { error } = await client.auth.signInWithPassword({ email: loginForm.elements.email.value.trim(), password: loginForm.elements.password.value });
      if (error) throw error;
      message("Acceso correcto. Abriendo tu espacio…", "success"); location.replace("index.html");
    } catch (error) { message(error.message || "No se pudo iniciar sesión.", "error"); button.disabled = false; }
  });
  setupForm.addEventListener("submit", async e => {
    e.preventDefault(); const button = document.getElementById("password-setup-submit");
    const password = setupForm.elements.password.value;
    if (password.length < 8) return message("La contraseña debe tener al menos 8 caracteres.", "error");
    if (password !== setupForm.elements["password-confirm"].value) return message("Las contraseñas no coinciden.", "error");
    button.disabled = true; message("Guardando contraseña…");
    const { error } = await client.auth.updateUser({ password });
    if (error) { message(error.message, "error"); button.disabled = false; return; }
    message("Contraseña guardada. Abriendo tu espacio…", "success"); location.replace("index.html");
  });
  client?.auth.onAuthStateChange(event => { if (event === "PASSWORD_RECOVERY") showSetup(); });
  initialize().catch(error => message(error.message || "Error de autenticación.", "error"));
})();
