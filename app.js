/*
 * MI PROGRESO V1.7 — misiones RPG, dificultad por estrellas y diario personal.
 * HTML define la estructura; este archivo gestiona estado, eventos,
 * validación, renderizado y comunicación con Supabase.
 */
(() => {
  "use strict";
  const db = window.supabaseClient;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const TASK_XP = { easy: 10, medium: 20, hard: 35, epic: 50 };
  const HABIT_XP = { easy: 5, medium: 10, hard: 15, epic: 20 };
  const DIFFICULTY_LABEL = { easy: "Fácil", medium: "Media", hard: "Difícil", epic: "Muy difícil" };
  const DIFFICULTY_SYMBOL = { easy: "○", medium: "◐", hard: "◆", epic: "★" };
  const DEFAULT_CATEGORY_COLOR = "#6e9d91";
  // El costo del siguiente nivel aumenta 25 XP por nivel: 100, 125, 150…
  const RANKS = [
    { level: 1, name: "Iniciado", symbol: "🌱", note: "Tus primeros pasos" },
    { level: 3, name: "Aprendiz", symbol: "📘", note: "Construyes la base" },
    { level: 5, name: "Explorador", symbol: "🧭", note: "Descubres tu ritmo" },
    { level: 8, name: "Constante", symbol: "🌿", note: "La repetición se vuelve hábito" },
    { level: 11, name: "Disciplinado", symbol: "🛡️", note: "Mantienes el compromiso" },
    { level: 14, name: "Veterano", symbol: "⚔️", note: "Tu progreso se consolida" },
    { level: 17, name: "Élite", symbol: "💠", note: "Destacas por constancia" },
    { level: 21, name: "Maestro", symbol: "🏅", note: "Dominas tu sistema" },
    { level: 26, name: "Leyenda", symbol: "👑", note: "Un recorrido excepcional" },
    { level: 31, name: "Mítico", symbol: "✨", note: "Un nivel extraordinario" }
  ];
  const ACHIEVEMENTS = [
    { id: "first_task", icon: "✓", title: "Primer paso", description: "Completa tu primera tarea.", kind: "achievement" },
    { id: "first_habit", icon: "↻", title: "Nueva rutina", description: "Registra tu primer hábito.", kind: "achievement" },
    { id: "first_mission", icon: "⚑", title: "Objetivo cumplido", description: "Completa tu primera misión semanal.", kind: "achievement" },
    { id: "mission_bronze_3", icon: "🥉", title: "Medalla de bronce", description: "Completa 3 misiones semanales consecutivas.", kind: "medal" },
    { id: "mission_silver_7", icon: "🥈", title: "Medalla de plata", description: "Completa 7 misiones semanales consecutivas.", kind: "medal" },
    { id: "mission_gold_10", icon: "🥇", title: "Medalla de oro", description: "Completa 10 misiones semanales consecutivas.", kind: "medal" },
    { id: "mission_platinum_15", icon: "🏆", title: "Medalla de platino", description: "Completa 15 misiones semanales consecutivas.", kind: "medal" },
    { id: "mission_diamond_25", icon: "💎", title: "Medalla de diamante", description: "Completa 25 misiones semanales consecutivas.", kind: "medal" },
    { id: "comeback", icon: "↗", title: "Volver al camino", description: "Completa una misión después de una semana no alcanzada.", kind: "achievement" },
    { id: "xp_1000", icon: "✧", title: "Primer millar", description: "Acumula 1.000 XP.", kind: "achievement" }
  ];
  const MISSION_MEDALS = [
    { id: "mission_bronze_3", threshold: 3, name: "Bronce", icon: "🥉" },
    { id: "mission_silver_7", threshold: 7, name: "Plata", icon: "🥈" },
    { id: "mission_gold_10", threshold: 10, name: "Oro", icon: "🥇" },
    { id: "mission_platinum_15", threshold: 15, name: "Platino", icon: "🏆" },
    { id: "mission_diamond_25", threshold: 25, name: "Diamante", icon: "💎" }
  ];
  const AVATAR_BUCKET = "mi-progreso-avatars";
  const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
  const state = { user: null, categories: [], tasks: [], habits: [], habitSteps: [], habitLogs: [], habitLogSteps: [], xpEvents: [], missionTemplates: [], missionWeeks: [], achievements: [], weeklyReviews: [], dailyJournalEntries: [], journalSelectedDate: null, reviewWeekStart: null, avatarUrl: null, currentLoggingHabitId: null, view: "dashboard", loading: false };

  const todayISO = () => {
    const d = new Date(); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const fmtDate = value => {
    if (!value) return "Sin fecha";
    const [y, m, d] = String(value).slice(0, 10).split("-");
    return y && m && d ? `${d}/${m}/${y}` : "Sin fecha";
  };
  const fmtDateTime = value => value ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "";
  const localDateFromTimestamp = value => { if (!value) return ""; const d = new Date(value); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,"0"); const day = String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; };
  const TASK_XP_STARS = { 1: 10, 2: 15, 3: 20, 4: 35, 5: 50 };
  const HABIT_XP_STARS = { 1: 5, 2: 7, 3: 10, 4: 15, 5: 20 };
  const LEGACY_STARS = { easy: 1, medium: 3, hard: 4, epic: 5 };
  const LEGACY_DIFFICULTY = { 1: "easy", 2: "medium", 3: "medium", 4: "hard", 5: "epic" };
  const getStars = (value, fallback = "medium") => {
    const number = Number(value);
    if (Number.isInteger(number) && number >= 1 && number <= 5) return number;
    return LEGACY_STARS[value] || LEGACY_STARS[fallback] || 3;
  };
  const legacyDifficultyForStars = stars => LEGACY_DIFFICULTY[getStars(stars)];
  const xpForTask = difficulty => TASK_XP_STARS[getStars(difficulty)] ?? TASK_XP[difficulty] ?? 20;
  const xpForHabit = difficulty => HABIT_XP_STARS[getStars(difficulty)] ?? HABIT_XP[difficulty] ?? 10;
  const toLocalISO = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const fromLocalISO = value => { const [y, m, d] = String(value).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const currentWeekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toLocalISO(d); };
  const addDaysISO = (value, days) => { const d = fromLocalISO(value); d.setDate(d.getDate() + days); return toLocalISO(d); };
  const formatWeek = (start, end) => `${fmtDate(start)} – ${fmtDate(end)}`;
  const getCurrentMission = () => state.missionWeeks.find(item => item.week_start === currentWeekStart()) || null;
  const getActiveMissionTemplate = () => state.missionTemplates.find(item => !item.ends_on) || null;
  const missionExpectedMax = habit => habit?.frequency === "weekly" ? 1 : habit?.frequency === "weekdays" ? 5 : 7;
  const missionTitle = habitTitle => `Completar ${habitTitle}`;
  const isHabitDoneThisPeriod = habit => state.habitLogs.some(log => log.habit_id === habit.id && log.is_success !== false && (habit.frequency === "weekly" ? log.period_start === currentWeekStart() : log.completed_on === todayISO()));
  const getHabitSteps = habitId => state.habitSteps.filter(step => step.habit_id === habitId).sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  const getMissionEligibleHabits = () => state.habits.filter(habit => (habit.habit_type || "positive") === "positive");
  const isHabitScheduledToday = habit => habit.frequency !== "weekdays" || ![0, 6].includes(new Date().getDay());
  const setNotice = (message, kind = "success") => {
    const el = $("#notice"); if (!el) return;
    el.textContent = message; el.className = `notice ${kind}`; el.hidden = false;
    window.clearTimeout(setNotice.timer); setNotice.timer = window.setTimeout(() => { el.hidden = true; }, 4200);
  };
  const setCloud = (message, ok = true) => { $("#cloud-status-text").textContent = message; $("#cloud-status").classList.toggle("offline", !ok); };
  const showGate = (message, visible = true) => { $("#app-gate-message").textContent = message; $("#app-gate").hidden = !visible; };
  const handleError = error => {
    console.error(error);
    const text = error?.message || "Ocurrió un error inesperado.";
    setNotice(text, "error");
  };

  async function requireSession() {
    if (!db) throw new Error("No se pudo inicializar Supabase. Revisa supabase-config.js.");
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    if (!data.session) { location.replace("login.html"); return null; }
    state.user = data.session.user;
    return state.user;
  }

  async function loadData() {
    setCloud("Sincronizando…", true);
    const { error: syncError } = await db.rpc("sync_personal_mission_weeks", { p_local_date: todayISO() });
    if (syncError) throw syncError;
    const { error: achievementSyncError } = await db.rpc("sync_personal_achievements");
    if (achievementSyncError) throw achievementSyncError;
    const results = await Promise.all([
      db.from("personal_categories").select("*").order("sort_order").order("name"),
      db.from("personal_tasks").select("*").order("sort_order").order("created_at", { ascending: false }),
      db.from("personal_habits").select("*").eq("is_active", true).order("created_at", { ascending: false }),
      db.from("personal_habit_steps").select("*").order("sort_order"),
      db.from("personal_habit_logs").select("*").order("completed_on", { ascending: false }),
      db.from("personal_habit_log_steps").select("*").order("sort_order"),
      db.from("personal_xp_events").select("*").order("created_at", { ascending: false }),
      db.from("personal_mission_templates").select("*").order("starts_on", { ascending: false }),
      db.from("personal_mission_weeks").select("*").order("week_start", { ascending: false }).limit(520),
      db.from("personal_achievements").select("*").order("unlocked_at", { ascending: true }),
      db.from("personal_weekly_reviews").select("*").order("week_start", { ascending: false }).limit(52),
      db.from("personal_daily_journal").select("*").order("entry_date", { ascending: false }).limit(120)
    ]);
    for (const result of results) if (result.error) throw result.error;
    [state.categories, state.tasks, state.habits, state.habitSteps, state.habitLogs, state.habitLogSteps, state.xpEvents, state.missionTemplates, state.missionWeeks, state.achievements, state.weeklyReviews, state.dailyJournalEntries] = results.map(result => result.data || []);
    setCloud("Sincronizado", true);
    renderAll();
  }

  function setView(view) {
    state.view = view;
    const titles = { dashboard: "Resumen", tasks: "Tareas", habits: "Hábitos", missions: "Misiones", progress: "Experiencia", review: "Diario y revisión" };
    $$(".view").forEach(section => { section.hidden = section.id !== `${view}-view`; });
    $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    $("#page-title").textContent = titles[view] || "Resumen";
  }

  function paintAvatar(containerSelector, imageSelector) {
    const container = $(containerSelector);
    const image = $(imageSelector);
    const fallback = container?.querySelector(".avatar-default");
    if (!container || !image || !fallback) return;
    if (state.avatarUrl) {
      if (image.src !== state.avatarUrl) image.src = state.avatarUrl;
      image.onerror = () => { image.onerror = null; refreshAvatarUrl(); };
      image.hidden = false;
      fallback.hidden = true;
      container.classList.add("has-avatar-image");
    } else {
      image.onerror = null;
      image.removeAttribute("src");
      image.hidden = true;
      fallback.hidden = false;
      container.classList.remove("has-avatar-image");
    }
  }

  function renderAvatarImage() {
    paintAvatar("#avatar", "#avatar-image");
    paintAvatar("#profile-avatar-preview", "#profile-avatar-image");
    paintAvatar("#dashboard-avatar-preview", "#dashboard-avatar-image");
  }

  async function refreshAvatarUrl() {
    const path = state.user?.user_metadata?.avatar_path;
    state.avatarUrl = null;
    if (!path) { renderAvatarImage(); return; }
    try {
      const { data, error } = await db.storage.from(AVATAR_BUCKET).createSignedUrl(path, 86400);
      if (error) throw error;
      state.avatarUrl = data?.signedUrl || null;
    } catch (error) {
      console.warn("No se pudo cargar la imagen de perfil:", error);
      const status = $("#avatar-save-status");
      if (status) status.textContent = "No se pudo cargar tu imagen. Puedes volver a subirla.";
    }
    renderAvatarImage();
  }

  function renderTopbar() {
    const date = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
    $("#today-label").textContent = date.charAt(0).toUpperCase() + date.slice(1);
    $("#avatar").title = `Imagen de perfil de ${state.user?.email || "tu cuenta"}. Pulsa para personalizar.`;
    renderAvatarImage();
  }

  function renderCategoryOptions() {
    const categoryOptions = `<option value="">Sin categoría</option>` + state.categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join("");
    for (const selector of ["#task-category", "#habit-category"]) {
      const select = $(selector);
      if (!select) continue;
      const current = select.value;
      select.innerHTML = categoryOptions;
      if (state.categories.some(cat => cat.id === current)) select.value = current;
    }
    for (const selector of ["#task-category-filter", "#habit-category-filter"]) {
      const filter = $(selector);
      if (!filter) continue;
      const selected = filter.value || "all";
      filter.innerHTML = `<option value="all">Todas las categorías</option><option value="none">Sin categoría</option>` + state.categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join("");
      filter.value = ["all", "none", ...state.categories.map(cat => cat.id)].includes(selected) ? selected : "all";
    }
  }

  function categoryStyle(category) {
    const color = category?.color || DEFAULT_CATEGORY_COLOR;
    return `--category-color:${escapeHtml(color)}`;
  }

  function difficultyMarkup(value, xp) {
    const stars = getStars(value);
    const filled = "★".repeat(stars);
    const empty = "☆".repeat(5 - stars);
    const rarity = ["", "common", "uncommon", "rare", "epic", "legendary"][stars];
    return `<span class="quest-ribbon quest-difficulty-ribbon rarity-${stars}" title="Dificultad: ${stars} de 5 estrellas" aria-label="Dificultad ${stars} de 5 estrellas"><span class="quest-stars" aria-hidden="true"><span class="quest-stars-filled">${filled}</span><span class="quest-stars-empty">${empty}</span></span><span class="quest-difficulty-label">${stars}/5</span>${Number.isFinite(xp) ? `<span class="quest-ribbon-xp">${xp} XP</span>` : ""}</span>`;
  }

  function categoryRibbon(category) {
    const color = category?.color || "#73808a";
    const name = category?.name || "Sin categoría";
    return `<span class="quest-ribbon quest-category-ribbon" style="--ribbon-color:${escapeHtml(color)}" title="Categoría: ${escapeHtml(name)}"><span class="quest-category-dot" aria-hidden="true"></span>${escapeHtml(name)}</span>`;
  }

  function questCompletionStamp(label, detail = "") {
    return `<div class="quest-completion-stamp" role="status"><span class="quest-stamp-check" aria-hidden="true">✓</span><span><strong>${escapeHtml(label)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span></div>`;
  }

  function xpAtLevel(level) {
    const steps = Math.max(0, level - 1);
    return (100 * steps) + (25 * steps * (steps - 1) / 2);
  }

  function getProgression(totalXp) {
    let level = 1;
    while (totalXp >= xpAtLevel(level + 1)) level += 1;
    const currentFloor = xpAtLevel(level);
    const nextFloor = xpAtLevel(level + 1);
    const inLevel = totalXp - currentFloor;
    const needed = nextFloor - currentFloor;
    const rankIndex = RANKS.reduce((found, rank, index) => level >= rank.level ? index : found, 0);
    return { level, inLevel, needed, percent: Math.min(100, (inLevel / needed) * 100), rankIndex, rank: RANKS[rankIndex], nextRank: RANKS[rankIndex + 1] || null };
  }

  function renderRankLadder(progression) {
    if (!$("#rank-ladder")) return;
    $("#current-rank-label").innerHTML = `${progression.rank.symbol} ${progression.rank.name}`;
    $("#rank-ladder").innerHTML = RANKS.map((rank, index) => {
      const unlocked = progression.level >= rank.level;
      const current = index === progression.rankIndex;
      return `<div class="rank-step ${unlocked ? "is-unlocked" : "is-locked"} ${current ? "is-current" : ""}">
        <span class="rank-step-symbol">${rank.symbol}</span><span class="rank-step-copy"><strong>${rank.name}</strong><small>${rank.note}</small></span>
        <span class="rank-step-level">Nivel ${rank.level} · ${xpAtLevel(rank.level).toLocaleString("es-CL")} XP</span><span class="rank-step-state">${current ? "Actual" : unlocked ? "Desbloqueado" : "Bloqueado"}</span>
      </div>`;
    }).join("");
  }

  function renderLevel() {
    const total = state.xpEvents.reduce((sum, event) => sum + Number(event.xp_amount || 0), 0);
    const progression = getProgression(total);
    const nextRankXp = progression.nextRank ? xpAtLevel(progression.nextRank.level) : null;
    const nextText = progression.nextRank
      ? `Siguiente rango: ${progression.nextRank.name} · ${nextRankXp.toLocaleString("es-CL")} XP`
      : "Has alcanzado el rango máximo.";
    const setText = (selector, value) => { const element = $(selector); if (element) element.textContent = value; };
    const setWidth = (selector, value) => { const element = $(selector); if (element) element.style.width = `${value}%`; };
    setText("#level-value", progression.level);
    setText("#xp-total", `${total} XP`);
    setText("#xp-next", `${progression.inLevel} / ${progression.needed} XP para el siguiente nivel`);
    setWidth("#level-progress", progression.percent);
    setText("#level-caption", `Siguiente nivel: ${progression.needed - progression.inLevel} XP restantes.`);
    setText("#rank-badge", `${progression.rank.symbol} ${progression.rank.name}`);
    setText("#rank-next-caption", nextText);
    setText("#level-emblem", progression.rank.symbol);
    setText("#progress-xp-total", `${total} XP`);
    setText("#progress-level-caption", `Nivel ${progression.level} · ${progression.inLevel}/${progression.needed} XP hacia el siguiente nivel`);
    renderRankLadder(progression);
    return total;
  }
  function taskRow(task, compact = false) {
    const category = state.categories.find(cat => cat.id === task.category_id);
    const stars = getStars(task.difficulty_stars ?? task.difficulty);
    const done = Boolean(task.completed_at);
    const archived = Boolean(task.archived_at);
    const completedStamp = done ? questCompletionStamp("MISIÓN COMPLETADA", fmtDateTime(task.completed_at)) : "";
    const ribbons = `<div class="quest-ribbon-group">${difficultyMarkup(stars, xpForTask(stars))}${categoryRibbon(category)}</div>`;
    return `<article class="task-row quest-card category-themed ${done ? "is-complete" : ""} ${archived ? "is-archived" : ""}" style="${categoryStyle(category)}" data-task-id="${task.id}">
      <label class="check-wrap quest-checkbox"><input type="checkbox" data-action="toggle-task" ${done ? "checked" : ""} ${archived ? "disabled" : ""} aria-label="Completar misión ${escapeHtml(task.title)}"><span class="custom-check"></span></label>
      <div class="task-main quest-main">
        <div class="quest-top-line"><span class="quest-kicker">MISIÓN PERSONAL</span>${ribbons}</div>
        <div class="task-title"><span>${escapeHtml(task.title)}</span></div>
        ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ""}
        ${completedStamp}
        <div class="task-meta"><span>${task.due_date ? `Objetivo: ${fmtDate(task.due_date)}` : "Sin fecha objetivo"}</span>${archived ? `<span class="muted">Archivada ${fmtDateTime(task.archived_at)}</span>` : ""}</div>
      </div>
      ${compact ? "" : `<div class="task-actions"><button class="icon-button" data-action="edit-task" title="Editar misión" aria-label="Editar misión">✎</button>${archived ? `<button class="icon-button" data-action="restore-task" title="Restaurar">↶</button>` : `<button class="icon-button" data-action="archive-task" title="Archivar">▣</button>`}<button class="icon-button danger-text" data-action="delete-task" title="Eliminar definitivamente">×</button></div>`}
    </article>`;
  }

  function formatCompletedDay(value) {
    if (!value) return "Fecha no disponible";
    const date = new Date(value);
    const formatted = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
    return formatted.charAt(0).toLocaleUpperCase("es-CL") + formatted.slice(1);
  }

  function formatXPEventDay(event) {
    const date = event.event_date ? fromLocalISO(String(event.event_date).slice(0, 10)) : new Date(event.created_at || Date.now());
    const dateLabel = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "short" }).format(date);
    const timeLabel = event.created_at ? new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.created_at)) : "";
    const capitalized = dateLabel.charAt(0).toLocaleUpperCase("es-CL") + dateLabel.slice(1);
    return timeLabel ? `${capitalized} · ${timeLabel}` : capitalized;
  }

  function renderDashboard() {
    const totalXp = state.xpEvents.reduce((sum, event) => sum + Number(event.xp_amount || 0), 0);
    const taskEvents = state.xpEvents.filter(event => event.source_type === "task");
    const weekStart = currentWeekStart();
    const weekEnd = addDaysISO(weekStart, 6);
    const weeklyTaskEvents = taskEvents.filter(event => event.event_date >= weekStart && event.event_date <= weekEnd);
    const progression = getProgression(totalXp);
    const currentHabitWeek = buildHabitWeeklySeries(1)[0];
    const userLabel = state.user?.user_metadata?.full_name || state.user?.email?.split("@")[0] || "Mi perfil";
    $("#dashboard-profile-name").textContent = userLabel;
    $("#dashboard-profile-subtitle").textContent = state.user?.email || "Tu espacio personal";
    $("#dashboard-profile-rank").textContent = `${progression.rank.symbol} ${progression.rank.name}`;
    $("#dashboard-profile-level").textContent = `Nivel ${progression.level}`;
    $("#dashboard-profile-xp").textContent = `${totalXp.toLocaleString("es-CL")} XP acumulados`;
    $("#dashboard-level-caption").textContent = progression.nextRank ? `Progreso hacia el nivel ${progression.level + 1}` : "Nivel máximo alcanzado";
    $("#dashboard-level-count").textContent = `${progression.inLevel} / ${progression.needed} XP`;
    $("#dashboard-level-progress").style.width = `${progression.percent}%`;

    $("#dashboard-stat-tasks").textContent = taskEvents.length.toLocaleString("es-CL");
    $("#dashboard-stat-tasks-note").textContent = "Completadas y registradas";
    $("#dashboard-stat-week-tasks").textContent = weeklyTaskEvents.length.toLocaleString("es-CL");
    $("#dashboard-stat-week-tasks-note").textContent = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;
    const habitEvents = state.xpEvents.filter(event => event.source_type === "habit" || event.source_type === "penalty");
    $("#dashboard-stat-habits").textContent = state.habitLogs.length.toLocaleString("es-CL");
    $("#dashboard-stat-habits-note").textContent = `${state.habits.length} hábitos activos · ${habitEvents.filter(event => event.source_type === "penalty").length} ajustes por límite`;
    $("#dashboard-stat-rate").textContent = currentHabitWeek?.expected ? `${currentHabitWeek.percent}%` : "—";
    $("#dashboard-stat-rate-note").textContent = currentHabitWeek?.expected ? `${currentHabitWeek.completed}/${currentHabitWeek.expected} registros programados` : "Sin datos todavía";
    $("#dashboard-stat-xp").textContent = `${totalXp.toLocaleString("es-CL")} XP`;
    $("#dashboard-stat-xp-note").textContent = `Nivel ${progression.level} · ${progression.rank.name}`;

    const achievements = getAchievements();
    const unlocked = achievements.filter(item => item.unlocked).sort((a, b) => String(b.unlockedAt || "").localeCompare(String(a.unlockedAt || "")));
    $("#dashboard-achievement-count").textContent = `${unlocked.length} / ${achievements.length}`;
    const featured = (unlocked.length ? unlocked.slice(0, 3) : achievements.filter(item => !item.unlocked).slice(0, 3));
    $("#dashboard-achievements").innerHTML = featured.map(item => `<div class="dashboard-achievement-item ${item.unlocked ? "is-unlocked" : "is-locked"}"><span class="dashboard-achievement-icon">${item.icon}</span><span><strong>${escapeHtml(item.title)}</strong><small>${item.unlocked ? `Desbloqueado${item.unlockedAt ? ` · ${fmtDate(item.unlockedAt)}` : ""}` : escapeHtml(item.description)}</small></span></div>`).join("") || `<div class="empty-state compact-empty">Tus primeros logros aparecerán aquí.</div>`;

    const activeTasks = state.tasks.filter(task => !task.archived_at && !task.completed_at).sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
    const todaysHabits = state.habits.filter(isHabitScheduledToday);
    $("#dashboard-task-list").innerHTML = activeTasks.slice(0, 6).map(task => taskRow(task, true)).join("") || `<div class="empty-state">No tienes tareas pendientes. Crea una para empezar.</div>`;
    $("#dashboard-habit-list").innerHTML = todaysHabits.slice(0, 6).map(habit => habitCompact(habit)).join("") || `<div class="empty-state">Todavía no has creado hábitos.</div>`;

    const recentTaskEvents = taskEvents.map(event => {
      const task = state.tasks.find(item => item.id === event.source_id);
      const sortDate = task?.completed_at || event.created_at || event.event_date;
      return { event, task, sortDate };
    }).sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate)).slice(0, 6);
    $("#dashboard-recent-completions").innerHTML = recentTaskEvents.map(({ event, task }) => {
      const category = task ? state.categories.find(item => item.id === task.category_id) : null;
      const dateLabel = task?.completed_at ? formatCompletedDay(task.completed_at) : formatXPEventDay(event);
      const detail = category ? ` · ${escapeHtml(category.name)}` : "";
      const tag = task ? difficultyMarkup(task.difficulty_stars ?? task.difficulty, null) : `<strong class="history-xp">${Number(event.xp_amount || 0) >= 0 ? "+" : ""}${Number(event.xp_amount || 0)} XP</strong>`;
      return `<div class="dashboard-recent-row"><span class="dashboard-recent-check" aria-hidden="true">✓</span><div class="dashboard-recent-copy"><strong>${escapeHtml(event.title_snapshot)}</strong><small>${dateLabel}${detail}</small></div>${tag}</div>`;
    }).join("") || `<div class="empty-state">Cuando completes tareas, aquí aparecerán las más recientes junto con el día y la hora.</div>`;
    renderDashboardAnalytics();
  }

  function renderTasks() {
    const search = $("#task-search").value.trim().toLocaleLowerCase("es");
    const filter = $("#task-filter").value;
    const catFilter = $("#task-category-filter").value;
    let rows = [...state.tasks];
    if (filter === "active") rows = rows.filter(t => !t.archived_at && !t.completed_at);
    else if (filter === "completed") rows = rows.filter(t => !t.archived_at && t.completed_at);
    else if (filter === "archived") rows = rows.filter(t => t.archived_at);
    else rows = rows.filter(t => !t.archived_at);
    if (catFilter === "none") rows = rows.filter(t => !t.category_id);
    else if (catFilter !== "all") rows = rows.filter(t => t.category_id === catFilter);
    if (search) rows = rows.filter(t => `${t.title} ${t.description}`.toLocaleLowerCase("es").includes(search));
    rows.sort((a, b) => Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at)) || (a.due_date || "9999").localeCompare(b.due_date || "9999"));
    $("#task-list").innerHTML = rows.map(task => taskRow(task)).join("") || `<div class="empty-state panel">No hay tareas para este filtro.</div>`;
    $("#category-strip").innerHTML = state.categories.map(cat => {
      const taskCount = state.tasks.filter(t => t.category_id === cat.id && !t.archived_at).length;
      const habitCount = state.habits.filter(h => h.category_id === cat.id).length;
      return `<div class="category-manage-row"><span class="category-dot" style="background:${escapeHtml(cat.color)}"></span><strong>${escapeHtml(cat.name)}</strong><span class="muted">${taskCount} tareas · ${habitCount} hábitos</span><button class="icon-button" data-action="edit-category" data-category-id="${cat.id}" title="Editar nombre o color" aria-label="Editar categoría">✎</button><button class="icon-button danger-text" data-action="delete-category" data-category-id="${cat.id}" title="Eliminar categoría">×</button></div>`;
    }).join("") || `<div class="empty-state">Aún no tienes categorías.</div>`;
  }

  function habitFrequencyLabel(habit) {
    return habit.frequency === "weekly" ? "Semanal" : habit.frequency === "weekdays" ? "Lunes a viernes" : "Diario";
  }

  function habitTrackingLabel(habit) {
    if (habit.habit_type === "negative") return `Límite: ${Number(habit.max_value).toLocaleString("es-CL")} ${escapeHtml(habit.unit || "minutos")}`;
    if (habit.tracking_mode === "quantity") return `Objetivo: ${Number(habit.target_value).toLocaleString("es-CL")} ${escapeHtml(habit.unit || "unidades")}`;
    if (habit.tracking_mode === "checklist") return `${getHabitSteps(habit.id).length} subtareas`;
    return "Registro simple";
  }

  function habitCompact(habit) {
    const done = isHabitDoneThisPeriod(habit);
    const currentPeriod = habit.frequency === "weekly" ? currentWeekStart() : todayISO();
    const currentLog = state.habitLogs.find(log => log.habit_id === habit.id && log.period_start === currentPeriod) || null;
    const editableRecord = habit.tracking_mode !== "simple";
    const disabled = !isHabitScheduledToday(habit) || (done && !editableRecord);
    const modeLabel = habit.habit_type === "negative" ? "Hábito a reducir" : habitTrackingLabel(habit);
    const buttonLabel = done ? (editableRecord ? "Actualizar" : "Listo") : currentLog ? "Actualizar" : "Registrar";
    const category = state.categories.find(cat => cat.id === habit.category_id);
    const stars = getStars(habit.difficulty_stars ?? habit.difficulty);
    return `<div class="habit-compact category-themed" style="${categoryStyle(category)}" data-habit-id="${habit.id}"><div><strong>${escapeHtml(habit.title)}</strong><small>${category ? `${escapeHtml(category.name)} · ` : "Sin categoría · "}${"★".repeat(stars)}${"☆".repeat(5-stars)} · ${habitFrequencyLabel(habit)} · ${modeLabel}</small>${done ? `<span class="compact-quest-done">✓ Completado</span>` : ""}</div><button class="small ${done ? "secondary" : "primary"}" data-action="record-habit" ${disabled ? "disabled" : ""}>${buttonLabel}</button></div>`;
  }

  function renderHabits() {
    const categoryFilter = $("#habit-category-filter")?.value || "all";
    const visibleHabits = state.habits.filter(habit => categoryFilter === "all" || (categoryFilter === "none" ? !habit.category_id : habit.category_id === categoryFilter));
    // Se mantiene un único tablero: las categorías identifican cada tarjeta mediante su listón,
    // pero no dividen ni reordenan la lista de hábitos.
    $("#habit-list").innerHTML = visibleHabits.map(habit => {
      const done = isHabitDoneThisPeriod(habit);
      const logs = state.habitLogs.filter(log => log.habit_id === habit.id).length;
      const freq = habitFrequencyLabel(habit);
      const steps = getHabitSteps(habit.id);
      const details = habit.habit_type === "negative"
        ? `Límite máximo: ${Number(habit.max_value).toLocaleString("es-CL")} ${escapeHtml(habit.unit || "minutos")}`
        : habit.tracking_mode === "quantity"
          ? `Objetivo: ${Number(habit.target_value).toLocaleString("es-CL")} ${escapeHtml(habit.unit || "unidades")}`
          : habit.tracking_mode === "checklist" ? `${steps.length} subtareas configuradas` : "Registro simple";
      const currentPeriod = habit.frequency === "weekly" ? currentWeekStart() : todayISO();
      const currentLog = state.habitLogs.find(log => log.habit_id === habit.id && log.period_start === currentPeriod) || null;
      let currentProgress = "";
      if (currentLog && habit.tracking_mode === "quantity") {
        const actual = Number(currentLog.quantity_value || 0);
        const target = habit.habit_type === "negative" ? Number(habit.max_value) : Number(habit.target_value);
        const resultLabel = habit.habit_type === "negative" ? (currentLog.is_success ? "Dentro del límite" : "Límite excedido") : (currentLog.is_success ? "Objetivo alcanzado" : "Avance parcial");
        currentProgress = `${actual.toLocaleString("es-CL")} / ${target.toLocaleString("es-CL")} ${escapeHtml(habit.unit || "unidades")} · ${resultLabel}`;
      } else if (currentLog && habit.tracking_mode === "checklist") {
        const logSteps = state.habitLogSteps.filter(item => item.habit_log_id === currentLog.id);
        const checked = logSteps.filter(item => item.is_checked).length;
        currentProgress = `${checked}/${logSteps.length || steps.length} subtareas marcadas${currentLog.is_success ? " · Rutina completa" : " · Avance parcial"}`;
      } else if (currentLog && currentLog.is_success) currentProgress = "Registrado para este período";
      const kindLabel = habit.habit_type === "negative" ? "HÁBITO A REDUCIR" : "RUTINA / HÁBITO";
      const category = state.categories.find(cat => cat.id === habit.category_id);
      const stars = getStars(habit.difficulty_stars ?? habit.difficulty);
      const ribbons = `<div class="quest-ribbon-group">${difficultyMarkup(stars, xpForHabit(stars))}${categoryRibbon(category)}</div>`;
      const stamp = done
        ? questCompletionStamp(habit.habit_type === "negative" ? "LÍMITE RESPETADO" : "HÁBITO COMPLETADO", currentLog ? fmtDate(currentLog.completed_on) : "")
        : habit.habit_type === "negative" && currentLog && !currentLog.is_success
          ? `<div class="quest-warning-stamp"><span aria-hidden="true">!</span> LÍMITE EXCEDIDO</div>` : "";
      const editableRecord = habit.tracking_mode !== "simple";
      const recordDisabled = !isHabitScheduledToday(habit) || (done && !editableRecord);
      const recordLabel = done ? (editableRecord ? "Actualizar" : "Completado") : currentLog ? "Actualizar" : "Registrar";
      return `<article class="panel habit-card quest-card category-themed ${done ? "is-complete" : ""}" style="${categoryStyle(category)}" data-habit-id="${habit.id}">
        <div class="quest-top-line"><span class="quest-kicker">${kindLabel}</span>${ribbons}</div>
        <div class="habit-card-title-row"><span class="habit-symbol" aria-hidden="true">${habit.habit_type === "negative" ? "↓" : "↻"}</span><div class="habit-card-title-copy"><h3>${escapeHtml(habit.title)}</h3><p class="muted">${escapeHtml(habit.description || freq)}</p></div></div>
        <div class="habit-card-details">${details}</div>
        ${stamp}
        ${currentProgress ? `<div class="habit-current-progress">${escapeHtml(currentProgress)}</div>` : ""}
        ${habit.tracking_mode === "checklist" && steps.length ? `<div class="habit-step-preview">${steps.slice(0, 4).map(step => `<span>${escapeHtml(step.title)}</span>`).join("")}${steps.length > 4 ? `<small>+${steps.length - 4} más</small>` : ""}</div>` : ""}
        <div class="habit-card-foot"><span class="muted">${freq} · ${logs} registros</span><button class="primary small" data-action="record-habit" ${recordDisabled ? "disabled" : ""}>${recordLabel}</button></div>
        <div class="habit-card-actions"><button class="text-button" data-action="edit-habit">Editar</button><button class="text-button danger-text" data-action="delete-habit">Eliminar</button></div>
      </article>`;
    }).join("") || `<div class="empty-state panel">Todavía no has creado hábitos. Empieza con uno pequeño y fácil de repetir.</div>`;
  }

  function weekStartFor(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function habitCreatedOn(habit) {
    return String(habit.created_at || "0000-01-01").slice(0, 10);
  }

  function getHabitWeekMetrics(habit, weekStart) {
    const weekEnd = addDaysISO(weekStart, 6);
    const effectiveEnd = weekStart === currentWeekStart() ? todayISO() : weekEnd;
    const createdOn = habitCreatedOn(habit);
    let expected = 0;
    let completed = 0;
    if (habit.frequency === "weekly") {
      if (createdOn <= weekEnd) {
        expected = 1;
        completed = state.habitLogs.some(log => log.habit_id === habit.id && log.period_start === weekStart && log.is_success !== false) ? 1 : 0;
      }
      return { expected, completed, percent: expected ? Math.round((completed / expected) * 100) : null };
    }
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const day = fromLocalISO(weekStart); day.setDate(day.getDate() + dayOffset);
      const iso = toLocalISO(day);
      if (iso > effectiveEnd) break;
      const scheduled = habit.frequency === "daily" || (habit.frequency === "weekdays" && ![0, 6].includes(day.getDay()));
      if (!scheduled || iso < createdOn) continue;
      expected += 1;
      if (state.habitLogs.some(log => log.habit_id === habit.id && log.completed_on === iso && log.is_success !== false)) completed += 1;
    }
    return { expected, completed, percent: expected ? Math.round((completed / expected) * 100) : null };
  }

  function buildHabitWeekBreakdown(weekStart = currentWeekStart()) {
    return state.habits.map(habit => ({ habit, ...getHabitWeekMetrics(habit, weekStart) }))
      .filter(item => item.expected > 0)
      .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.habit.title.localeCompare(b.habit.title, "es"));
  }

  function buildHabitWeeklySeries(weeksToShow, habitId = null, categoryId = "all") {
    const current = weekStartFor(new Date());
    const selectedHabits = state.habits.filter(habit => {
      const matchesHabit = !habitId || habit.id === habitId;
      const matchesCategory = categoryId === "all" || (categoryId === "none" ? !habit.category_id : habit.category_id === categoryId);
      return matchesHabit && matchesCategory;
    });
    const weeks = [];
    for (let offset = weeksToShow - 1; offset >= 0; offset -= 1) {
      const monday = new Date(current);
      monday.setDate(monday.getDate() - (offset * 7));
      const weekStart = toLocalISO(monday);
      let expected = 0;
      let completed = 0;
      for (const habit of selectedHabits) {
        const metrics = getHabitWeekMetrics(habit, weekStart);
        expected += metrics.expected;
        completed += metrics.completed;
      }
      weeks.push({ weekStart, expected, completed, percent: expected ? Math.round((completed / expected) * 100) : null });
    }
    return weeks;
  }

  function renderHabitChart(hostSelector = "#habit-chart", summarySelector = "#habit-chart-summary", rangeSelector = "#habit-chart-range", habitSelector = "#habit-chart-habit", categorySelector = "#habit-chart-category") {
    const host = $(hostSelector);
    const summary = $(summarySelector);
    if (!host || !summary) return;
    const range = Number($(rangeSelector)?.value || 8);
    const selectedHabitId = $(habitSelector)?.value || "all";
    const selectedHabit = selectedHabitId === "all" ? null : state.habits.find(habit => habit.id === selectedHabitId) || null;
    const selectedCategoryId = $(categorySelector)?.value || "all";
    const selectedCategory = selectedCategoryId === "all" ? null : selectedCategoryId === "none" ? { name: "Sin categoría" } : state.categories.find(category => category.id === selectedCategoryId) || null;
    const seriesCategory = selectedCategory?.color
      ? selectedCategory
      : selectedHabit?.category_id
        ? state.categories.find(category => category.id === selectedHabit.category_id) || null
        : null;
    host.style.setProperty("--chart-series-color", seriesCategory?.color || "");
    const series = buildHabitWeeklySeries(range, selectedHabit?.id || null, selectedCategoryId);
    const valid = series.map((item, index) => ({ ...item, index })).filter(item => item.expected > 0);
    if (!valid.length) {
      host.innerHTML = `<div class="empty-state">Registra algunos hábitos para comenzar a ver tu evolución semanal.</div>`;
      summary.textContent = "Sin datos todavía";
      return;
    }
    const width = 820, height = 270, left = 48, right = 20, top = 18, bottom = 44;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const xAt = index => left + (range <= 1 ? plotWidth / 2 : (index / (range - 1)) * plotWidth);
    const yAt = value => top + ((100 - value) / 100) * plotHeight;
    const grid = [0, 25, 50, 75, 100].map(value => {
      const y = yAt(value);
      return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="chart-grid-line"/><text x="${left-10}" y="${y+4}" class="chart-axis-label" text-anchor="end">${value}%</text>`;
    }).join("");
    const xLabels = series.map((item, index) => {
      const date = fromLocalISO(item.weekStart);
      const label = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" }).format(date).replace(".", "");
      return `<text x="${xAt(index)}" y="${height-13}" class="chart-axis-label" text-anchor="middle">${label}</text>`;
    }).join("");
    const points = valid.map(item => ({ ...item, x: xAt(item.index), y: yAt(item.percent) }));
    const path = points.length > 1 ? `<path d="${points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ")}" class="chart-line"/>` : "";
    const markers = points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="5" class="chart-point"><title>Semana del ${fmtDate(point.weekStart)}: ${point.percent}% (${point.completed}/${point.expected})</title></circle>`).join("");
    host.innerHTML = `<svg class="habit-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de línea del porcentaje semanal de cumplimiento de hábitos">${grid}${path}${markers}${xLabels}</svg>`;
    const latest = valid[valid.length - 1];
    const closedWeeks = valid.filter(item => item.weekStart < currentWeekStart());
    const avg = closedWeeks.length ? Math.round(closedWeeks.reduce((sum, item) => sum + item.percent, 0) / closedWeeks.length) : latest.percent;
    const periodLabel = latest.weekStart === currentWeekStart() ? "Semana actual hasta hoy" : "Última semana registrada";
    const subject = selectedHabit ? `${selectedHabit.title}: ` : selectedCategory ? `${selectedCategory.name}: ` : "Todos los hábitos: ";
    summary.textContent = `${subject}${periodLabel.toLocaleLowerCase("es-CL")}: ${latest.percent}% · ${latest.completed} de ${latest.expected} registros · promedio del período: ${avg}%`;
  }

  function renderHabitChartOptions() {
    const pairs = [
      { category: "#habit-chart-category", habit: "#habit-chart-habit" },
      { category: "#dashboard-chart-category", habit: "#dashboard-chart-habit" }
    ];
    for (const pair of pairs) {
      const categorySelect = $(pair.category);
      const habitSelect = $(pair.habit);
      if (!categorySelect || !habitSelect) continue;
      const currentCategory = categorySelect.value || "all";
      categorySelect.innerHTML = `<option value="all">Todas las categorías</option><option value="none">Sin categoría</option>` + state.categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("");
      categorySelect.value = ["all", "none", ...state.categories.map(category => category.id)].includes(currentCategory) ? currentCategory : "all";
      const currentHabit = habitSelect.value || "all";
      const filteredHabits = state.habits.filter(habit => categorySelect.value === "all" || (categorySelect.value === "none" ? !habit.category_id : habit.category_id === categorySelect.value));
      habitSelect.innerHTML = `<option value="all">Todos los hábitos</option>` + filteredHabits.map(habit => `<option value="${habit.id}">${escapeHtml(habit.title)}</option>`).join("");
      habitSelect.value = filteredHabits.some(habit => habit.id === currentHabit) ? currentHabit : "all";
    }
  }

  function renderDashboardAnalytics() {
    const history = buildHabitWeeklySeries(12).filter(item => item.expected > 0 && item.weekStart < currentWeekStart());
    const title = $("#dashboard-trend-title");
    const copy = $("#dashboard-trend-copy");
    if (!title || !copy) return;
    if (!history.length) {
      title.textContent = "Tu línea de base";
      copy.textContent = "Todavía no hay semanas completas para comparar. Registra tus hábitos y revisaremos la evolución cuando haya datos suficientes.";
    } else if (history.length === 1) {
      title.textContent = `Primera referencia: ${history[0].percent}%`;
      copy.textContent = `En la semana del ${fmtDate(history[0].weekStart)} completaste ${history[0].completed} de ${history[0].expected} registros programados. La próxima semana tendremos una comparación.`;
    } else {
      const previous = history[history.length - 2];
      const latest = history[history.length - 1];
      const delta = latest.percent - previous.percent;
      if (delta > 0) {
        title.textContent = `Mejoraste ${delta} puntos`;
        copy.textContent = `Tu cumplimiento subió de ${previous.percent}% a ${latest.percent}%. Identifica qué facilitó esa semana y procura repetirlo.`;
      } else if (delta < 0) {
        title.textContent = `Variación de ${Math.abs(delta)} puntos`;
        copy.textContent = `El cumplimiento pasó de ${previous.percent}% a ${latest.percent}%. Úsalo como información: quizá conviene cambiar el momento o reducir el primer paso.`;
      } else {
        title.textContent = `Ritmo estable: ${latest.percent}%`;
        copy.textContent = `Tu cumplimiento se mantuvo en ${latest.percent}%. Puedes conservar la meta y observar otra semana antes de modificarla.`;
      }
    }
    const breakdownHost = $("#dashboard-habit-breakdown");
    if (!breakdownHost) return;
    const breakdown = buildHabitWeekBreakdown();
    breakdownHost.innerHTML = breakdown.map(item => `<div class="dashboard-habit-row"><div class="dashboard-habit-row-head"><span title="${escapeHtml(item.habit.title)}">${escapeHtml(item.habit.title)}</span><strong>${item.percent}%</strong></div><div class="dashboard-habit-track"><span style="width:${item.percent}%"></span></div><small>${item.completed}/${item.expected} registros · ${item.habit.frequency === "weekly" ? "Semanal" : item.habit.frequency === "weekdays" ? "Lunes a viernes" : "Diario"}</small></div>`).join("") || `<div class="empty-state compact-empty">No hay hábitos programados para esta semana.</div>`;
  }

  async function prepareAvatarImage(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Elige una imagen PNG, JPG o WEBP.");
    }
    if (file.size > AVATAR_MAX_BYTES) throw new Error("La imagen supera el límite de 5 MB.");
    if (typeof createImageBitmap !== "function") throw new Error("Tu navegador no permite procesar esta imagen. Prueba con una versión actualizada.");
    const bitmap = await createImageBitmap(file);
    const maxSide = 512;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: true });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob) throw new Error("No se pudo procesar la imagen seleccionada.");
    return blob;
  }

  function setAvatarBusy(busy) {
    $("#avatar-file").disabled = busy;
    $("#avatar-remove").disabled = busy;
    if (busy) $("#avatar-save-status").textContent = "Actualizando imagen…";
  }

  async function uploadAvatar(file) {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const imageBlob = await prepareAvatarImage(file);
      const path = `${state.user.id}/avatar.webp`;
      const oldPath = state.user?.user_metadata?.avatar_path || null;
      const { error: uploadError } = await db.storage.from(AVATAR_BUCKET).upload(path, imageBlob, {
        contentType: "image/webp", upsert: true, cacheControl: "3600"
      });
      if (uploadError) throw uploadError;
      const metadata = { ...(state.user.user_metadata || {}), avatar_path: path, avatar_emoji: null, avatar_color: null };
      const { data, error } = await db.auth.updateUser({ data: metadata });
      if (error) throw error;
      state.user = data.user;
      if (oldPath && oldPath !== path) await db.storage.from(AVATAR_BUCKET).remove([oldPath]);
      await refreshAvatarUrl();
      $("#avatar-save-status").textContent = "Imagen de perfil guardada en tu cuenta.";
      setNotice("Imagen de perfil actualizada.");
    } catch (error) {
      $("#avatar-save-status").textContent = error.message || "No se pudo guardar la imagen.";
      handleError(error);
    } finally {
      $("#avatar-file").value = "";
      setAvatarBusy(false);
    }
  }

  async function resetAvatar() {
    const oldPath = state.user?.user_metadata?.avatar_path || null;
    if (!oldPath) { setNotice("Ya estás usando el avatar predeterminado.", "info"); return; }
    setAvatarBusy(true);
    try {
      const metadata = { ...(state.user.user_metadata || {}), avatar_path: null, avatar_emoji: null, avatar_color: null };
      const { data, error } = await db.auth.updateUser({ data: metadata });
      if (error) throw error;
      state.user = data.user;
      state.avatarUrl = null;
      renderAvatarImage();
      const { error: removeError } = await db.storage.from(AVATAR_BUCKET).remove([oldPath]);
      if (removeError) console.warn("La imagen anterior no se pudo eliminar del almacenamiento:", removeError);
      $("#avatar-save-status").textContent = "Avatar predeterminado restaurado.";
      setNotice("Avatar predeterminado restaurado.");
    } catch (error) {
      $("#avatar-save-status").textContent = "No se pudo restaurar el avatar.";
      handleError(error);
    } finally { setAvatarBusy(false); }
  }

  function renderProgress() {
    const taskEvents = state.xpEvents.filter(e => e.source_type === "task");
    const habitEvents = state.xpEvents.filter(e => e.source_type === "habit" || e.source_type === "penalty");
    $("#progress-task-count").textContent = taskEvents.length;
    $("#progress-habit-count").textContent = state.habitLogs.length;
    $("#xp-history").innerHTML = state.xpEvents.map(event => {
      const penalty = event.source_type === "penalty" || Number(event.xp_amount) < 0;
      const label = event.source_type === "task" ? "Tarea completada" : penalty ? "Límite excedido" : "Hábito registrado";
      const amount = Number(event.xp_amount || 0);
      return `<div class="history-row"><div class="history-symbol ${penalty ? "penalty" : event.source_type}">${event.source_type === "task" ? "✓" : penalty ? "−" : "↻"}</div><div class="history-main"><strong>${escapeHtml(event.title_snapshot)}</strong><small>${label} · ${fmtDate(event.event_date)}</small></div><strong class="history-xp ${penalty ? "history-xp-penalty" : ""}">${amount > 0 ? "+" : ""}${amount} XP</strong></div>`;
    }).join("") || `<div class="empty-state">Todavía no has ganado experiencia. Completa una tarea o registra un hábito.</div>`;
    renderAvatarImage();
  }

  function getMissionStreakData() {
    const byWeek = new Map(state.missionWeeks.map(item => [item.week_start, item]));
    const currentWeek = currentWeekStart();
    const current = byWeek.get(currentWeek);
    // La semana en curso aún no rompe una racha; se evalúa al finalizar el domingo.
    let cursor = current?.is_complete ? currentWeek : addDaysISO(currentWeek, -7);
    let currentStreak = 0;
    if (!getActiveMissionTemplate()) cursor = null;
    while (cursor && byWeek.get(cursor)?.is_complete) {
      currentStreak += 1;
      cursor = addDaysISO(cursor, -7);
    }
    const sorted = [...state.missionWeeks].sort((a, b) => a.week_start.localeCompare(b.week_start));
    let bestStreak = 0, run = 0, previous = null;
    for (const week of sorted) {
      if (week.is_complete) {
        run = previous && addDaysISO(previous.week_start, 7) === week.week_start ? run + 1 : 1;
        bestStreak = Math.max(bestStreak, run);
      } else run = 0;
      previous = week;
    }
    return { currentStreak, bestStreak };
  }

  function getAchievements() {
    const unlocked = new Map(state.achievements.map(item => [item.achievement_key, item.unlocked_at]));
    return ACHIEVEMENTS.map(item => ({ ...item, unlocked: unlocked.has(item.id), unlockedAt: unlocked.get(item.id) || null }));
  }

  function renderMissionProgressMarkup(mission, compact = false) {
    const habit = state.habits.find(item => item.id === mission.habit_id);
    const title = mission.title_snapshot || (habit ? missionTitle(habit.title) : "Misión semanal");
    const progress = Math.min(Number(mission.completed_count || 0), Number(mission.target_count || 1));
    const target = Number(mission.target_count || 1);
    const percent = Math.min(100, Math.round((progress / target) * 100));
    return `<div class="mission-title-row"><strong>${escapeHtml(title)}</strong><span class="mission-progress-count">${progress}/${target}</span></div>
      <div class="mission-progress-track"><div class="mission-progress-fill" style="width:${percent}%"></div></div>
      <div class="mission-progress-meta"><span>${percent}% completado</span><span>${mission.is_complete ? "Objetivo alcanzado" : `${Math.max(0, target-progress)} acciones restantes`}</span></div>${compact ? "" : `<p class="muted mission-detail-line">${escapeHtml(habit?.title || mission.title_snapshot)} · ${formatWeek(mission.week_start, mission.week_end)}</p>`}`;
  }

  function renderMissionSummary() {
    const host = $("#dashboard-mission-content");
    if (!host) return;
    const mission = getCurrentMission();
    if (!mission) {
      host.innerHTML = `<div class="mission-empty"><div><strong>Empieza con una meta alcanzable.</strong><p class="muted">Elige un hábito y decide cuántas veces quieres realizarlo esta semana.</p></div><button class="primary small" data-open-mission>Crear misión</button></div>`;
      return;
    }
    const status = mission.is_complete ? "Objetivo alcanzado" : "En curso";
    host.innerHTML = `${renderMissionProgressMarkup(mission, true)}<div class="mission-dashboard-footer"><span class="mission-status ${mission.is_complete ? "is-complete" : ""}">${status}</span><button class="text-button" data-view-link="missions">Revisar misión →</button></div>`;
  }

  function renderMissions() {
    const current = getCurrentMission();
    const title = $("#mission-current-title"), status = $("#mission-current-state"), desc = $("#mission-current-description");
    const progressHost = $("#mission-current-progress"), dates = $("#mission-current-dates"), emptyAction = $("#mission-empty-action");
    if (!current) {
      title.textContent = "Todavía no tienes una misión";
      status.textContent = "Sin configurar"; status.className = "mission-status";
      desc.textContent = getMissionEligibleHabits().length ? "Elige un hábito positivo y define cuántas veces quieres realizarlo esta semana." : "Primero crea un hábito positivo. Los hábitos a reducir se siguen por separado y no se convierten en misiones.";
      progressHost.innerHTML = `<div class="mission-unconfigured">${getMissionEligibleHabits().length ? "Tu misión aparecerá aquí cuando definas tu objetivo." : "Por ejemplo: leer 15 minutos o realizar tu rutina de movilidad."}</div>`;
      dates.textContent = "Semana actual"; emptyAction.textContent = getMissionEligibleHabits().length ? "Crear misión" : "Crear hábito positivo";
    } else {
      const linkedHabit = state.habits.find(item => item.id === current.habit_id);
      title.textContent = current.title_snapshot || (linkedHabit ? missionTitle(linkedHabit.title) : "Misión semanal");
      status.textContent = current.is_complete ? "Completada" : "En curso";
      status.className = `mission-status ${current.is_complete ? "is-complete" : ""}`;
      desc.textContent = current.is_complete ? "Objetivo alcanzado. Puedes descansar el resto de la semana o mantener tu ritmo." : `${current.target_count} registros durante esta semana. No necesitas cumplirlo todos los días.`;
      progressHost.innerHTML = renderMissionProgressMarkup(current, false);
      dates.textContent = formatWeek(current.week_start, current.week_end);
      emptyAction.textContent = "Ajustar próxima semana";
    }

    const streaks = getMissionStreakData();
    $("#mission-current-streak").textContent = streaks.currentStreak;
    $("#mission-best-streak").textContent = streaks.bestStreak;
    $("#mission-streak-caption").textContent = current
      ? (streaks.currentStreak
        ? `Llevas ${streaks.currentStreak} semana${streaks.currentStreak === 1 ? "" : "s"} exitosa${streaks.currentStreak === 1 ? "" : "s"} consecutiva${streaks.currentStreak === 1 ? "" : "s"}. La semana actual sigue abierta.`
        : "Completa tu primera misión semanal para iniciar una racha.")
      : (streaks.bestStreak ? `Tu mejor racha registrada es de ${streaks.bestStreak} semanas. Configura una nueva misión para retomar el ritmo.` : "Las semanas exitosas consecutivas mantienen tu racha.");

    const nextMedal = MISSION_MEDALS.find(medal => streaks.bestStreak < medal.threshold);
    const medalProgress = nextMedal ? Math.min(100, Math.round((streaks.currentStreak / nextMedal.threshold) * 100)) : 100;
    const medalHost = $("#mission-medal-progress");
    if (medalHost) {
      medalHost.innerHTML = `<div class="medal-progress-heading"><strong>${nextMedal ? `Siguiente medalla: ${nextMedal.icon} ${nextMedal.name}` : "Colección de medallas completada"}</strong><span>${nextMedal ? `${streaks.currentStreak}/${nextMedal.threshold} semanas` : "Diamante desbloqueado"}</span></div><div class="medal-progress-track"><span style="width:${medalProgress}%"></span></div><div class="medal-threshold-list">${MISSION_MEDALS.map(medal => `<span class="medal-threshold ${streaks.bestStreak >= medal.threshold ? "is-earned" : ""}" title="${medal.threshold} misiones consecutivas">${medal.icon}<small>${medal.threshold}</small></span>`).join("")}</div>`;
    }

    const history = [...state.missionWeeks].sort((a, b) => b.week_start.localeCompare(a.week_start)).slice(0, 12);
    $("#mission-history").innerHTML = history.map(item => {
      const isCurrent = item.week_start === currentWeekStart();
      const stateLabel = item.is_complete ? "Completada" : isCurrent ? "En curso" : "No alcanzada";
      const stateClass = item.is_complete ? "done" : isCurrent ? "active" : "missed";
      return `<div class="mission-history-row"><div class="mission-history-symbol ${stateClass}">${item.is_complete ? "✓" : isCurrent ? "◷" : "–"}</div><div class="mission-history-copy"><strong>${escapeHtml(item.title_snapshot)}</strong><small>${formatWeek(item.week_start, item.week_end)}</small></div><span class="mission-history-progress">${Math.min(item.completed_count, item.target_count)}/${item.target_count}</span><span class="mission-history-state ${stateClass}">${stateLabel}</span></div>`;
    }).join("") || `<div class="empty-state">Tu historial aparecerá después de configurar tu primera misión.</div>`;

    const achievements = getAchievements();
    const earned = achievements.filter(item => item.unlocked).length;
    $("#achievement-count").textContent = `${earned} / ${achievements.length}`;
    $("#achievement-grid").innerHTML = achievements.map(item => `<article class="achievement-card ${item.unlocked ? "is-unlocked" : "is-locked"}"><span class="achievement-icon">${item.icon}</span><div><strong>${item.title}</strong><p>${item.description}</p><small>${item.unlocked ? `Desbloqueado${item.unlockedAt ? ` · ${fmtDate(item.unlockedAt)}` : ""}` : "Por desbloquear"}</small></div></article>`).join("");
  }

  function renderMissionOptions() {
    const select = $("#mission-habit");
    if (!select) return;
    const active = getActiveMissionTemplate();
    const eligible = getMissionEligibleHabits();
    select.innerHTML = eligible.map(habit => `<option value="${habit.id}">${escapeHtml(habit.title)} · ${habitFrequencyLabel(habit)}</option>`).join("");
    if (active && eligible.some(item => item.id === active.habit_id)) select.value = active.habit_id;
    updateMissionTargetHint();
  }

  function updateMissionTargetHint() {
    const select = $("#mission-habit"), input = $("#mission-target");
    if (!select || !input) return;
    const habit = state.habits.find(item => item.id === select.value);
    const max = missionExpectedMax(habit);
    input.max = String(max);
    if (Number(input.value) > max) input.value = String(max);
    if (Number(input.value) < 1) input.value = "1";
    $("#mission-target-hint").textContent = habit?.frequency === "weekly"
      ? "Este hábito se programa una vez por semana; su objetivo máximo es 1 registro semanal."
      : habit?.frequency === "weekdays"
        ? "Este hábito se programa de lunes a viernes; puedes fijar una meta de 1 a 5 registros."
        : "Puedes elegir una meta flexible de 1 a 7 registros. No es necesario realizarlo todos los días.";
  }

  function openMissionDialog() {
    if (!getMissionEligibleHabits().length) {
      setView("habits"); setNotice("Crea primero un hábito positivo para convertirlo en una misión. Los hábitos a reducir no se usan como misión semanal.", "info");
      $("[data-open-habit]")?.click();
      return;
    }
    const active = getActiveMissionTemplate();
    $("#mission-form").reset();
    renderMissionOptions();
    if (active) {
      $("#mission-habit").value = active.habit_id;
      $("#mission-target").value = active.target_count;
    } else {
      const selected = getMissionEligibleHabits()[0];
      $("#mission-habit").value = selected.id;
      $("#mission-target").value = selected.frequency === "weekly" ? 1 : selected.frequency === "weekdays" ? 3 : 4;
    }
    updateMissionTargetHint();
    $("#mission-save-button").textContent = "Guardar objetivo";
    openDialog("mission-dialog");
  }

  async function saveMission(event) {
    event.preventDefault();
    const habit = state.habits.find(item => item.id === $("#mission-habit").value);
    const target = Number($("#mission-target").value);
    if (!habit) return setNotice("Selecciona un hábito válido.", "error");
    if (!Number.isInteger(target) || target < 1 || target > missionExpectedMax(habit)) return setNotice("La meta no coincide con la frecuencia del hábito.", "error");
    const active = getActiveMissionTemplate();
    const currentWeek = currentWeekStart();
    const currentSnapshotExists = Boolean(getCurrentMission());
    const effectiveStart = currentSnapshotExists ? addDaysISO(currentWeek, 7) : currentWeek;
    const previousWeek = addDaysISO(effectiveStart, -7);
    const saveButton = $("#mission-save-button");
    saveButton.disabled = true;
    try {
      const payload = {
        user_id: state.user.id, habit_id: habit.id, title: missionTitle(habit.title),
        target_count: target, starts_on: effectiveStart, ends_on: null
      };
      if (active && active.starts_on >= effectiveStart) {
        // Si la plantilla ya estaba programada para el lunes siguiente, se edita sin crear otra versión.
        const { error } = await db.from("personal_mission_templates").update({ habit_id: habit.id, title: payload.title, target_count: target, starts_on: effectiveStart, ends_on: null }).eq("id", active.id);
        if (error) throw error;
      } else {
        if (active) {
          const { error } = await db.from("personal_mission_templates").update({ ends_on: previousWeek }).eq("id", active.id);
          if (error) throw error;
        }
        const { error } = await db.from("personal_mission_templates").insert(payload);
        if (error) throw error;
      }
      closeDialog("mission-dialog");
      setNotice(currentSnapshotExists ? "Misión guardada. El nuevo objetivo comenzará la próxima semana." : "Misión semanal configurada.");
      await loadData();
    } catch (error) { handleError(error); await loadData(); }
    finally { saveButton.disabled = false; }
  }

  function getReviewWeekChoices() {
    const current = currentWeekStart();
    return Array.from({ length: 12 }, (_, index) => {
      const start = addDaysISO(current, -(index * 7));
      return { start, end: addDaysISO(start, 6) };
    });
  }

  function getMissionAdjustment() {
    const past = [...state.missionWeeks]
      .filter(item => item.week_start < currentWeekStart())
      .sort((a, b) => b.week_start.localeCompare(a.week_start));
    const lastTwo = past.slice(0, 2);
    const hasConsecutiveWeeks = lastTwo.length >= 2 && addDaysISO(lastTwo[1].week_start, 7) === lastTwo[0].week_start;
    const template = getActiveMissionTemplate();
    const habit = template ? state.habits.find(item => item.id === template.habit_id) : null;
    const max = missionExpectedMax(habit);
    if (hasConsecutiveWeeks && lastTwo.every(item => item.is_complete) && template && template.target_count < max) {
      return "Has alcanzado tus dos últimas misiones. Si el objetivo actual te resultó cómodo, puedes probar una repetición adicional la próxima semana. No es obligatorio aumentar la meta.";
    }
    if (hasConsecutiveWeeks && lastTwo.every(item => !item.is_complete)) {
      return "Las dos últimas metas quedaron pendientes. Considera reducir el objetivo en una repetición o cambiar el momento que activa el hábito. La idea es encontrar una meta sostenible.";
    }
    if (lastTwo.length && lastTwo[0].is_complete) {
      return "La última misión se cumplió. Mantén el mismo objetivo una semana más para confirmar que encaja con tu rutina antes de aumentarlo.";
    }
    if (lastTwo.length) {
      return "Observa qué parte de la rutina dificultó el objetivo. Mantén la meta o ajústala ligeramente; no necesitas compensar lo que no se hizo.";
    }
    return "Usa esta semana como referencia. Empieza con una meta pequeña y concreta, y deja que los registros te ayuden a calibrarla.";
  }

  function getSuccessStackSuggestion() {
    const completedWeeks = getReviewWeekChoices().filter(item => item.start < currentWeekStart()).slice(0, 3);
    if (completedWeeks.length < 3 || !state.habits.length) {
      return "Cuando un hábito se mantenga durante unas tres semanas, prueba añadir una acción conectada que puedas iniciar en menos de dos minutos.";
    }
    const stableHabit = state.habits.filter(habit => (habit.habit_type || "positive") === "positive").find(habit => completedWeeks.every(week => {
      const createdOn = habitCreatedOn(habit);
      const end = week.end;
      let expected = 0, completed = 0;
      if (habit.frequency === "weekly") {
        if (createdOn <= end) {
          expected = 1;
          completed = state.habitLogs.some(log => log.habit_id === habit.id && log.period_start === week.start && log.is_success !== false) ? 1 : 0;
        }
      } else {
        for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
          const day = fromLocalISO(week.start); day.setDate(day.getDate() + dayOffset);
          const iso = toLocalISO(day);
          const scheduled = habit.frequency === "daily" || (habit.frequency === "weekdays" && ![0, 6].includes(day.getDay()));
          if (!scheduled || iso < createdOn) continue;
          expected += 1;
          if (state.habitLogs.some(log => log.habit_id === habit.id && log.completed_on === iso && log.is_success !== false)) completed += 1;
        }
      }
      const minimumExpected = habit.frequency === "weekly" ? 1 : habit.frequency === "weekdays" ? 3 : 5;
      return expected >= minimumExpected && (completed / expected) >= 0.8;
    }));
    return stableHabit
      ? `“${stableHabit.title}” muestra constancia durante las últimas tres semanas. Podrías conectar después una acción breve (1–2 minutos), en el mismo lugar o momento, sin añadirla como una obligación grande.`
      : "Todavía no hay un hábito con tres semanas estables. Mantén el foco en la rutina actual antes de añadir otra conducta.";
  }

  function renderWeeklyReview() {
    const select = $("#review-week-select");
    if (!select) return;
    const choices = getReviewWeekChoices();
    if (!state.reviewWeekStart || !choices.some(item => item.start === state.reviewWeekStart)) {
      state.reviewWeekStart = addDaysISO(currentWeekStart(), -7);
    }
    const previousValue = state.reviewWeekStart;
    select.innerHTML = choices.map(item => {
      const label = item.start === currentWeekStart() ? `Semana actual · ${formatWeek(item.start, item.end)}` : formatWeek(item.start, item.end);
      return `<option value="${item.start}">${label}</option>`;
    }).join("");
    select.value = choices.some(item => item.start === previousValue) ? previousValue : choices[0].start;
    state.reviewWeekStart = select.value;

    const weekStart = state.reviewWeekStart;
    const weekEnd = addDaysISO(weekStart, 6);
    const series = buildHabitWeeklySeries(12).find(item => item.weekStart === weekStart) || { expected: 0, completed: 0, percent: null };
    const tasksCompleted = state.tasks.filter(task => task.completed_at).filter(task => {
      const day = localDateFromTimestamp(task.completed_at);
      return day >= weekStart && day <= weekEnd;
    }).length;
    const xpTotal = state.xpEvents.filter(event => event.event_date >= weekStart && event.event_date <= weekEnd)
      .reduce((sum, event) => sum + Number(event.xp_amount || 0), 0);
    const mission = state.missionWeeks.find(item => item.week_start === weekStart) || null;
    const currentWeek = weekStart === currentWeekStart();

    $("#review-habit-rate").textContent = series.percent === null ? "—" : `${series.percent}%`;
    $("#review-habit-detail").textContent = series.expected ? `${series.completed} de ${series.expected} registros programados` : "Sin hábitos programados";
    $("#review-task-count").textContent = String(tasksCompleted);
    $("#review-xp-total").textContent = `${xpTotal} XP`;
    $("#review-mission-state").textContent = !mission ? "Sin misión" : mission.is_complete ? "Completada" : currentWeek ? "En curso" : "No alcanzada";
    $("#review-mission-detail").textContent = mission ? `${mission.completed_count}/${mission.target_count} · ${escapeHtml(mission.title_snapshot || "Misión semanal")}` : "No había una misión configurada.";

    const insightTitle = $("#review-insight-title");
    const insightCopy = $("#review-insight-copy");
    if (!series.expected) {
      insightTitle.textContent = "Todavía no hay una línea de base";
      insightCopy.textContent = "Crea un hábito pequeño y específico. Durante una o dos semanas observa qué tan fácil resulta cumplirlo antes de fijar una meta exigente.";
    } else if (series.percent >= 80) {
      insightTitle.textContent = "Tu rutina está encontrando su ritmo";
      insightCopy.textContent = `Cumpliste ${series.percent}% de los registros programados. Conserva lo que te ayudó a lograrlo y evita cambiar demasiadas cosas a la vez.`;
    } else if (series.percent >= 50) {
      insightTitle.textContent = "Hay una base sobre la que trabajar";
      insightCopy.textContent = `Completaste ${series.completed} de ${series.expected} registros. Revisa qué días o momentos facilitaron la actividad y cuáles la hicieron más difícil.`;
    } else {
      insightTitle.textContent = "La semana aporta información útil";
      insightCopy.textContent = `Se completó el ${series.percent}% de lo programado. Prueba un disparador más claro, reduce el primer paso o ajusta la frecuencia a tu rutina real.`;
    }
    $("#review-adjustment-copy").textContent = getMissionAdjustment();
    $("#review-stacking-copy").textContent = getSuccessStackSuggestion();
    const saved = state.weeklyReviews.find(item => item.week_start === weekStart);
    $("#review-what-worked").value = saved?.what_worked || "";
    $("#review-obstacle").value = saved?.obstacle || "";
    $("#review-next-adjustment").value = saved?.next_adjustment || "";
    $("#review-save-status").textContent = saved?.updated_at ? `Última actualización: ${fmtDateTime(saved.updated_at)}` : "Todavía no has guardado apuntes para esta semana.";
    $("#review-edit-mission").disabled = !state.habits.length;
  }

  async function saveWeeklyReview(event) {
    event.preventDefault();
    const button = $("#review-save-button");
    const payload = {
      user_id: state.user.id,
      week_start: state.reviewWeekStart,
      what_worked: $("#review-what-worked").value.trim(),
      obstacle: $("#review-obstacle").value.trim(),
      next_adjustment: $("#review-next-adjustment").value.trim()
    };
    button.disabled = true;
    try {
      const { data, error } = await db.from("personal_weekly_reviews")
        .upsert(payload, { onConflict: "user_id,week_start" }).select().single();
      if (error) throw error;
      state.weeklyReviews = [data, ...state.weeklyReviews.filter(item => item.week_start !== data.week_start)];
      $("#review-save-status").textContent = `Guardado: ${fmtDateTime(data.updated_at)}`;
      setNotice("Revisión semanal guardada.");
    } catch (error) { handleError(error); }
    finally { button.disabled = false; }
  }

  function renderDailyJournal() {
    const dateInput = $("#daily-journal-date");
    if (!dateInput) return;
    if (!dateInput.value) dateInput.value = state.journalSelectedDate || todayISO();
    state.journalSelectedDate = dateInput.value;
    const entry = state.dailyJournalEntries.find(item => item.entry_date === state.journalSelectedDate) || null;
    $("#daily-journal-title").value = entry?.title || "";
    $("#daily-journal-content").value = entry?.content || "";
    $("#daily-journal-status").textContent = entry?.updated_at
      ? `Última actualización: ${fmtDateTime(entry.updated_at)}`
      : "Sin entrada guardada para este día. Puedes escribir una nota breve o extensa.";
    const history = state.dailyJournalEntries.slice(0, 12);
    $("#daily-journal-history").innerHTML = history.map(item => {
      const preview = String(item.content || "").replace(/\s+/g, " ").trim();
      const title = item.title?.trim() || "Entrada del día";
      return `<button type="button" class="journal-history-entry ${item.entry_date === state.journalSelectedDate ? "is-selected" : ""}" data-journal-date="${item.entry_date}"><span class="journal-history-date">${fmtDate(item.entry_date)}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(preview.slice(0, 110))}${preview.length > 110 ? "…" : ""}</small></button>`;
    }).join("") || `<div class="empty-state">Tus notas diarias aparecerán aquí. Puedes empezar con la de hoy.</div>`;
  }

  async function saveDailyJournal(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("#daily-journal-save");
    const entryDate = $("#daily-journal-date").value;
    const content = $("#daily-journal-content").value.trim();
    if (!entryDate) return setNotice("Selecciona la fecha de la entrada.", "error");
    if (!content) return setNotice("Escribe un mensaje antes de guardar.", "error");
    const payload = {
      user_id: state.user.id,
      entry_date: entryDate,
      title: $("#daily-journal-title").value.trim(),
      content
    };
    button.disabled = true;
    const previousLabel = button.textContent;
    button.textContent = "Guardando…";
    try {
      const { data, error } = await db.from("personal_daily_journal")
        .upsert(payload, { onConflict: "user_id,entry_date" }).select().single();
      if (error) throw error;
      state.dailyJournalEntries = [data, ...state.dailyJournalEntries.filter(item => item.entry_date !== data.entry_date)]
        .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
      renderDailyJournal();
      setNotice("Entrada del diario guardada.");
    } catch (error) {
      handleError(error);
    } finally {
      button.disabled = false;
      button.textContent = previousLabel;
    }
  }

  function renderAll() {
    renderTopbar(); renderCategoryOptions(); renderLevel(); renderDashboard(); renderTasks(); renderHabits(); renderProgress();
    renderHabitChartOptions();
    renderHabitChart("#habit-chart", "#habit-chart-summary", "#habit-chart-range", "#habit-chart-habit", "#habit-chart-category");
    renderHabitChart("#dashboard-habit-chart", "#dashboard-habit-chart-summary", "#dashboard-chart-range", "#dashboard-chart-habit", "#dashboard-chart-category");
    renderMissionSummary(); renderMissions(); renderMissionOptions(); renderWeeklyReview(); renderDailyJournal();
  }

  function openDialog(id) { const dialog = document.getElementById(id); if (dialog && !dialog.open) dialog.showModal(); }
  function closeDialog(id) { const dialog = document.getElementById(id); if (dialog?.open) dialog.close(); }
  function resetTaskForm() { $("#task-form").reset(); $("#task-form").elements.id.value = ""; $("#task-dialog-title").textContent = "Crear tarea"; $("#task-xp-hint").textContent = "La experiencia se entrega una sola vez al completar la tarea."; }
  function openTask(task = null) {
    const form = $("#task-form"); form.reset(); form.elements.id.value = task?.id || "";
    $("#task-dialog-title").textContent = task ? "Editar tarea" : "Crear tarea";
    form.elements.title.value = task?.title || ""; form.elements.description.value = task?.description || "";
    form.elements.due_date.value = task?.due_date || ""; form.elements.category_id.value = task?.category_id || "";
    form.elements.difficulty_stars.value = String(getStars(task?.difficulty_stars ?? task?.difficulty));
    updateTaskXpHint(); openDialog("task-dialog");
  }
  function updateTaskXpHint() { const value = Number($("#task-difficulty").value); $("#task-xp-hint").textContent = `Dificultad ${value}/5 estrellas. Al completar esta misión recibirás ${xpForTask(value)} XP, una sola vez.`; }
  function openHabit(habit = null) {
    const form = $("#habit-form"); form.reset(); form.elements.id.value = habit?.id || "";
    $("#habit-dialog-title").textContent = habit ? "Editar hábito" : "Crear hábito";
    form.elements.title.value = habit?.title || ""; form.elements.description.value = habit?.description || "";
    form.elements.category_id.value = habit?.category_id || "";
    form.elements.frequency.value = habit?.frequency || "daily"; form.elements.difficulty_stars.value = String(getStars(habit?.difficulty_stars ?? habit?.difficulty));
    form.elements.habit_type.value = habit?.habit_type || "positive";
    form.elements.tracking_mode.value = habit?.tracking_mode || "simple";
    form.elements.target_value.value = habit?.target_value ?? 10;
    form.elements.max_value.value = habit?.max_value ?? 60;
    form.elements.unit.value = habit?.unit || (habit?.habit_type === "negative" ? "minutos" : "repeticiones");
    form.elements.steps.value = getHabitSteps(habit?.id).map(step => step.title).join("\n");
    updateHabitConfigFields(); updateHabitXpHint(); openDialog("habit-dialog");
  }

  function updateHabitConfigFields() {
    const form = $("#habit-form");
    const type = form.elements.habit_type.value;
    const modeSelect = form.elements.tracking_mode;
    if (type === "negative") { modeSelect.value = "quantity"; modeSelect.disabled = true; }
    else modeSelect.disabled = false;
    const mode = modeSelect.value;
    const targetInput = form.elements.namedItem("target_value");
    const targetIsActive = type === "positive" && mode === "quantity";
    if (targetInput) {
      targetInput.required = targetIsActive;
      targetInput.disabled = !targetIsActive;
    }
    $("#habit-quantity-fields").hidden = !targetIsActive;
    $("#habit-negative-fields").hidden = type !== "negative";
    $("#habit-steps-fields").hidden = type !== "positive" || mode !== "checklist";
    $("#habit-unit-fields").hidden = mode !== "quantity";
    $("#habit-target-value-label").textContent = "Objetivo por registro";
    $("#habit-type-help").textContent = type === "negative"
      ? "Registra cuánto tiempo o cuántas veces ocurrió. Mantenerte dentro del límite suma XP; superarlo aplica una penalización pequeña."
      : "Elige una forma de registrar la actividad. Puedes empezar con un check y cambiar a cantidad o subtareas cuando lo necesites.";
  }

  function updateHabitXpHint() {
    const form = $("#habit-form");
    const xp = xpForHabit(Number(form.elements.difficulty_stars.value));
    const type = form.elements.habit_type.value;
    const mode = type === "negative" ? "quantity" : form.elements.tracking_mode.value;
    const text = type === "negative"
      ? `Mantenerte dentro del límite entrega hasta ${xp} XP. Superarlo descuenta 5 XP como máximo y nunca reduce tu saldo por debajo de 0.`
      : mode === "quantity"
        ? `Alcanzar el objetivo entrega ${xp} XP. Un registro parcial entrega experiencia proporcional al avance.`
        : mode === "checklist"
          ? `Completar todas las subtareas entrega ${xp} XP. Los avances parciales también suman experiencia proporcional.`
          : `Al registrar este hábito recibirás ${xp} XP, una vez por período.`;
    $("#habit-xp-hint").textContent = text;
  }

  function openHabitLog(habit) {
    if (!habit) return;
    state.currentLoggingHabitId = habit.id;
    const form = $("#habit-log-form"); form.reset();
    $("#habit-log-title").textContent = habit.title;
    $("#habit-log-frequency").textContent = `${habitFrequencyLabel(habit)} · ${habitTrackingLabel(habit)}`;
    const periodStart = habit.frequency === "weekly" ? currentWeekStart() : todayISO();
    const existingLog = state.habitLogs.find(log => log.habit_id === habit.id && log.period_start === periodStart) || null;
    $("#habit-log-simple").hidden = habit.tracking_mode !== "simple";
    $("#habit-log-quantity").hidden = habit.tracking_mode !== "quantity";
    $("#habit-log-checklist").hidden = habit.tracking_mode !== "checklist";
    const quantityLogInput = $("#habit-log-quantity-value");
    quantityLogInput.required = habit.tracking_mode === "quantity";
    quantityLogInput.disabled = habit.tracking_mode !== "quantity";
    $("#habit-log-quantity-caption").textContent = habit.habit_type === "negative" ? `Cantidad registrada (${habit.unit || "unidades"})` : `Cantidad realizada (${habit.unit || "unidades"})`;
    $("#habit-log-quantity-value").value = existingLog?.quantity_value ?? "";
    $("#habit-log-quantity-value").min = "0";
    $("#habit-log-quantity-hint").textContent = habit.habit_type === "negative"
      ? `Límite permitido: ${Number(habit.max_value).toLocaleString("es-CL")} ${habit.unit || "unidades"}. El valor puede ser igual al límite.`
      : `Objetivo: ${Number(habit.target_value).toLocaleString("es-CL")} ${habit.unit || "unidades"}. Si haces menos, quedará registrado como avance parcial.`;
    if (habit.tracking_mode === "checklist") {
      const previousRows = state.habitLogSteps.filter(item => item.habit_log_id === existingLog?.id && item.is_checked);
      const previousChecked = new Set(previousRows.map(item => item.step_id).filter(Boolean));
      const previousTitles = new Set(previousRows.map(item => String(item.title_snapshot || "").trim().toLocaleLowerCase("es")));
      const steps = getHabitSteps(habit.id);
      $("#habit-log-checklist-items").innerHTML = steps.map(step => `<label class="habit-log-step"><input type="checkbox" value="${step.id}" ${previousChecked.has(step.id) || previousTitles.has(String(step.title).trim().toLocaleLowerCase("es")) ? "checked" : ""}><span>${escapeHtml(step.title)}</span></label>`).join("") || `<p class="muted">Este hábito no tiene subtareas configuradas. Edita el hábito para agregarlas.</p>`;
      $("#habit-log-save").disabled = steps.length === 0;
    } else {
      $("#habit-log-save").disabled = false;
    }
    $("#habit-log-save").textContent = existingLog ? "Actualizar registro" : "Guardar registro";
    if (habit.tracking_mode === "checklist") updateHabitChecklistProgress();
    openDialog("habit-log-dialog");
  }

  function updateHabitChecklistProgress() {
    const inputs = $$("#habit-log-checklist-items input[type=checkbox]");
    const total = inputs.length;
    const checked = inputs.filter(input => input.checked).length;
    const percent = total ? Math.round((checked / total) * 100) : 0;
    const complete = total > 0 && checked === total;
    const panel = $("#habit-log-checklist-progress");
    if (panel) {
      panel.innerHTML = `<div class="habit-checklist-progress-top"><strong>${checked} de ${total} subtareas</strong><span>${percent}%</span></div><div class="habit-checklist-progress-track"><span style="width:${percent}%"></span></div><small>${complete ? "Rutina completa: al guardar se completará el hábito." : "Marca las actividades que realizaste."}</small>`;
    }
    const button = $("#habit-log-save");
    if (button) {
      button.disabled = total === 0;
      button.textContent = complete ? "Completar hábito" : "Guardar avance";
    }
  }

  async function saveHabitLog(event) {
    event.preventDefault();
    const habit = state.habits.find(item => item.id === state.currentLoggingHabitId);
    if (!habit) return;
    let quantity = null;
    let checkedStepIds = [];
    if (habit.tracking_mode === "quantity") {
      const input = $("#habit-log-quantity-value");
      if (!input) return setNotice("No se encontró el campo de cantidad. Cierra y vuelve a abrir el registro.", "error");
      const raw = input.value.trim();
      if (raw === "" || !Number.isFinite(Number(raw)) || Number(raw) < 0) return setNotice("Ingresa una cantidad válida, igual o mayor que cero.", "error");
      quantity = Number(raw);
    }
    if (habit.tracking_mode === "checklist") {
      checkedStepIds = $$("#habit-log-checklist-items input:checked").map(input => input.value);
      if (!getHabitSteps(habit.id).length) return setNotice("Agrega subtareas antes de registrar este hábito.", "error");
    }
    const button = $("#habit-log-save");
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Guardando…";
    try {
      const { data, error } = await db.rpc("record_personal_habit", {
        p_habit_id: habit.id,
        p_local_date: todayISO(),
        p_quantity: quantity,
        p_checked_step_ids: checkedStepIds
      });
      if (error) throw error;

      const delta = Number(data || 0);
      closeDialog("habit-log-dialog");
      if (delta > 0) setNotice(`Registro guardado: +${delta} XP.`);
      else if (delta < 0) {
        const overLimit = habit.habit_type === "negative" && quantity !== null && quantity > Number(habit.max_value);
        setNotice(overLimit ? `Límite excedido: ${delta} XP. El registro quedó guardado.` : `Registro actualizado: ${delta} XP de ajuste.`, "info");
      } else setNotice("Registro guardado. No hubo cambios de XP en esta actualización.", "info");

      try {
        await loadData();
      } catch (refreshError) {
        console.error("El registro se guardó, pero no se pudo actualizar la vista:", refreshError);
        setNotice("El registro se guardó. Recarga la página para actualizar los datos visibles.", "info");
      }
    } catch (error) {
      // No se recarga la aplicación al fallar el RPC: el diálogo conserva los checks/cantidad
      // y el botón se libera inmediatamente para permitir corregir y volver a intentar.
      handleError(error);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function saveTask(event) {
    event.preventDefault(); const form = event.currentTarget; const id = form.elements.id.value;
    const stars = Number(form.elements.difficulty_stars.value); const payload = { user_id: state.user.id, title: form.elements.title.value.trim(), description: form.elements.description.value.trim(), due_date: form.elements.due_date.value || null, category_id: form.elements.category_id.value || null, difficulty_stars: stars, difficulty: legacyDifficultyForStars(stars) };
    if (!payload.title) return;
    const button = $("#task-save-button"); button.disabled = true;
    try {
      const result = id ? await db.from("personal_tasks").update(payload).eq("id", id).select().single() : await db.from("personal_tasks").insert(payload).select().single();
      if (result.error) throw result.error;
      closeDialog("task-dialog"); setNotice(id ? "Tarea actualizada." : "Tarea creada."); await loadData();
    } catch (error) { handleError(error); } finally { button.disabled = false; }
  }
  function openCategory(category = null) {
    const form = $("#category-form");
    const dialog = $("#category-dialog");
    if (!form || !dialog) {
      setNotice("No se encontró el formulario de categorías. Recarga la página e inténtalo nuevamente.", "error");
      console.error("Falta #category-form o #category-dialog en index.html.");
      return;
    }

    // Usamos querySelector por nombre para evitar ambigüedades de propiedades
    // heredadas del formulario (por ejemplo, form.name o form.id).
    const idField = form.querySelector('[name="id"]');
    const nameField = form.querySelector('[name="name"]');
    const colorField = form.querySelector('[name="color"]');
    form.reset();
    idField.value = category?.id || "";
    nameField.value = category?.name || "";
    colorField.value = category?.color || DEFAULT_CATEGORY_COLOR;
    $("#category-dialog-title").textContent = category ? "Editar categoría" : "Nueva categoría";

    try {
      if (!dialog.open) dialog.showModal();
    } catch (error) {
      console.error("No se pudo abrir el diálogo de categorías:", error);
      setNotice("No se pudo abrir el formulario de categorías. Prueba recargando la página.", "error");
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.querySelector('[name="id"]').value;
    const name = form.querySelector('[name="name"]').value.trim();
    const color = form.querySelector('[name="color"]').value || DEFAULT_CATEGORY_COLOR;
    if (!state.user?.id) return setNotice("Tu sesión no está disponible. Vuelve a iniciar sesión.", "error");
    if (!name) return setNotice("Escribe un nombre para la categoría.", "error");

    const payload = {
      user_id: state.user.id,
      name,
      color,
      sort_order: id ? (state.categories.find(item => item.id === id)?.sort_order ?? 0) : state.categories.length
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Guardando…";
    try {
      const result = id
        ? await db.from("personal_categories").update({ name, color }).eq("id", id).select().single()
        : await db.from("personal_categories").insert(payload).select().single();
      if (result.error) {
        if (result.error.code === "23505") throw new Error("Ya existe una categoría con ese nombre.");
        throw result.error;
      }

      closeDialog("category-dialog");
      form.reset();
      setNotice(id ? "Categoría actualizada." : "Categoría creada.");
      try {
        await loadData();
      } catch (refreshError) {
        console.error("La categoría se guardó, pero no se pudo actualizar la vista:", refreshError);
        setNotice("La categoría se guardó. Recarga la página para actualizar las listas.", "info");
      }
    } catch (error) {
      handleError(error);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
  async function saveHabit(event) {
    event.preventDefault(); const form = event.currentTarget; const id = form.elements.id.value;
    const habitType = form.elements.habit_type.value;
    const trackingMode = habitType === "negative" ? "quantity" : form.elements.tracking_mode.value;
    const unit = form.elements.unit.value.trim() || (habitType === "negative" ? "minutos" : "unidades");
    const targetInput = form.elements.namedItem("target_value");
    if (trackingMode === "quantity" && habitType === "positive" && !targetInput) return setNotice("No se encontró el objetivo de cantidad. Recarga la página e inténtalo de nuevo.", "error");
    const targetValue = trackingMode === "quantity" && habitType === "positive" ? Number(targetInput.value) : 1;
    const maxValue = habitType === "negative" ? Number(form.elements.max_value.value) : null;
    const stepTitles = trackingMode === "checklist" ? [...new Set(form.elements.steps.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))] : [];
    if (trackingMode === "quantity" && habitType === "positive" && (!Number.isFinite(targetValue) || targetValue <= 0)) return setNotice("El objetivo debe ser mayor que cero.", "error");
    if (habitType === "negative" && (!Number.isFinite(maxValue) || maxValue < 0)) return setNotice("El límite máximo debe ser igual o mayor que cero.", "error");
    if (trackingMode === "checklist" && (stepTitles.length < 1 || stepTitles.length > 12)) return setNotice("Agrega entre 1 y 12 subtareas diferentes.", "error");
    if (stepTitles.some(step => step.length > 100)) return setNotice("Cada subtarea debe tener como máximo 100 caracteres.", "error");
    const payload = {
      user_id: state.user.id, title: form.elements.title.value.trim(), description: form.elements.description.value.trim(),
      category_id: form.elements.category_id.value || null,
      frequency: form.elements.frequency.value, difficulty_stars: Number(form.elements.difficulty_stars.value), difficulty: legacyDifficultyForStars(Number(form.elements.difficulty_stars.value)), is_active: true,
      habit_type: habitType, tracking_mode: trackingMode, target_value: targetValue, max_value: maxValue,
      unit, penalty_xp: 5
    };
    if (!payload.title) return;
    const saveButton = form.querySelector('button[type="submit"]'); saveButton.disabled = true;
    try {
      const result = id
        ? await db.from("personal_habits").update(payload).eq("id", id).select().single()
        : await db.from("personal_habits").insert(payload).select().single();
      if (result.error) throw result.error;
      const savedHabit = result.data;
      const { error: stepsError } = await db.rpc("replace_personal_habit_steps", { p_habit_id: savedHabit.id, p_titles: stepTitles });
      if (stepsError) throw stepsError;
      closeDialog("habit-dialog"); setNotice(id ? "Hábito actualizado." : "Hábito creado."); await loadData();
    } catch (error) { handleError(error); }
    finally { saveButton.disabled = false; }
  }

  async function toggleTask(task) {
    try {
      if (task.completed_at) {
        const { error } = await db.from("personal_tasks").update({ completed_at: null }).eq("id", task.id);
        if (error) throw error;
        setNotice("Tarea reabierta. La experiencia ya ganada se conserva.");
      } else {
        const { data, error } = await db.rpc("complete_personal_task", { p_task_id: task.id, p_local_date: todayISO() });
        if (error) throw error;
        setNotice(data > 0 ? `Tarea completada: +${data} XP.` : "Tarea completada. Esta tarea ya había entregado XP.");
      }
      await loadData();
    } catch (error) { handleError(error); await loadData(); }
  }
  function completeHabit(habit) { openHabitLog(habit); }
  async function archiveTask(task) {
    try { const { error } = await db.from("personal_tasks").update({ archived_at: new Date().toISOString() }).eq("id", task.id); if (error) throw error; setNotice("Tarea archivada."); await loadData(); }
    catch (error) { handleError(error); }
  }
  async function restoreTask(task) {
    try { const { error } = await db.from("personal_tasks").update({ archived_at: null }).eq("id", task.id); if (error) throw error; setNotice("Tarea restaurada."); await loadData(); }
    catch (error) { handleError(error); }
  }
  async function deleteTask(task) {
    if (!confirm(`¿Eliminar definitivamente “${task.title}”? La experiencia obtenida anteriormente se conservará en el historial.`)) return;
    try { const { error } = await db.from("personal_tasks").delete().eq("id", task.id); if (error) throw error; setNotice("Tarea eliminada."); await loadData(); }
    catch (error) { handleError(error); }
  }
  async function deleteCategory(id) {
    const category = state.categories.find(item => item.id === id); if (!category) return;
    if (!confirm(`¿Eliminar la categoría “${category.name}”? Las tareas y hábitos asociados quedarán sin categoría. Sus registros no se eliminarán.`)) return;
    try { const { error } = await db.from("personal_categories").delete().eq("id", id); if (error) throw error; setNotice("Categoría eliminada."); await loadData(); }
    catch (error) { handleError(error); }
  }
  async function deleteHabit(habit) {
    if (!confirm(`¿Eliminar el hábito “${habit.title}”? Sus registros de experiencia anteriores se conservarán.`)) return;
    try { const { error } = await db.from("personal_habits").delete().eq("id", habit.id); if (error) throw error; setNotice("Hábito eliminado."); await loadData(); }
    catch (error) { handleError(error); }
  }

  function handleTaskAction(event) {
    const button = event.target.closest("[data-action]"); const row = event.target.closest("[data-task-id]");
    if (!button || !row) return;
    const task = state.tasks.find(item => item.id === row.dataset.taskId); if (!task) return;
    switch (button.dataset.action) {
      case "edit-task": openTask(task); break;
      case "archive-task": archiveTask(task); break;
      case "restore-task": restoreTask(task); break;
      case "delete-task": deleteTask(task); break;
    }
  }
  function handleHabitAction(event) {
    const button = event.target.closest("[data-action]"); const card = event.target.closest("[data-habit-id]");
    if (!button || !card) return;
    const habit = state.habits.find(item => item.id === card.dataset.habitId); if (!habit) return;
    if (button.dataset.action === "complete-habit" || button.dataset.action === "record-habit") completeHabit(habit);
    if (button.dataset.action === "edit-habit") openHabit(habit);
    if (button.dataset.action === "delete-habit") deleteHabit(habit);
  }

  function bindEvents() {
    $$(".nav-item").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
    $$('[data-view-link]').forEach(button => button.addEventListener("click", () => setView(button.dataset.viewLink)));
    $$('[data-open-task]').forEach(button => button.addEventListener("click", () => openTask()));
    $$('[data-open-habit]').forEach(button => button.addEventListener("click", () => openHabit()));
    $$('[data-close]').forEach(button => button.addEventListener("click", () => closeDialog(button.dataset.close)));
    // Delegación: cualquier botón con data-open-category abre el mismo formulario.
    // Así evitamos depender de IDs distintos según la sección desde donde se invoque.
    document.addEventListener("click", event => {
      const trigger = event.target.closest("[data-open-category]");
      if (!trigger) return;
      event.preventDefault();
      openCategory();
    });
    $("#task-form").addEventListener("submit", saveTask);
    $("#category-form").addEventListener("submit", saveCategory);
    $("#habit-form").addEventListener("submit", saveHabit);
    $("#habit-log-form").addEventListener("submit", saveHabitLog);
    $("#habit-log-checklist-items").addEventListener("change", updateHabitChecklistProgress);
    $("#habit-checklist-select-all").addEventListener("click", () => { $$("#habit-log-checklist-items input[type=checkbox]").forEach(input => { input.checked = true; }); updateHabitChecklistProgress(); });
    $("#habit-checklist-clear").addEventListener("click", () => { $$("#habit-log-checklist-items input[type=checkbox]").forEach(input => { input.checked = false; }); updateHabitChecklistProgress(); });
    $("#task-difficulty").addEventListener("change", updateTaskXpHint);
    $("#habit-form").elements.difficulty_stars.addEventListener("change", updateHabitXpHint);
    $("#habit-form").elements.habit_type.addEventListener("change", () => { updateHabitConfigFields(); updateHabitXpHint(); });
    $("#habit-form").elements.tracking_mode.addEventListener("change", () => { updateHabitConfigFields(); updateHabitXpHint(); });
    $("#task-search").addEventListener("input", renderTasks);
    $("#task-filter").addEventListener("change", renderTasks);
    $("#task-category-filter").addEventListener("change", renderTasks);
    $("#habit-category-filter").addEventListener("change", renderHabits);
    $("#task-list").addEventListener("click", handleTaskAction);
    $("#category-strip").addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const category = state.categories.find(item => item.id === button.dataset.categoryId);
      if (!category) return;
      if (button.dataset.action === "delete-category") deleteCategory(category.id);
      if (button.dataset.action === "edit-category") openCategory(category);
    });
    $("#habit-list").addEventListener("click", handleHabitAction);
    $("#dashboard-task-list").addEventListener("change", event => { const checkbox = event.target.closest('[data-action="toggle-task"]'); if (checkbox) { const row = checkbox.closest("[data-task-id]"); const task = state.tasks.find(item => item.id === row.dataset.taskId); if (task) toggleTask(task); } });
    $("#task-list").addEventListener("change", event => { const checkbox = event.target.closest('[data-action="toggle-task"]'); if (checkbox) { const row = checkbox.closest("[data-task-id]"); const task = state.tasks.find(item => item.id === row.dataset.taskId); if (task) toggleTask(task); } });
    $("#dashboard-habit-list").addEventListener("click", handleHabitAction);
    $("#habit-chart-range").addEventListener("change", () => renderHabitChart("#habit-chart", "#habit-chart-summary", "#habit-chart-range", "#habit-chart-habit", "#habit-chart-category"));
    $("#habit-chart-habit").addEventListener("change", () => renderHabitChart("#habit-chart", "#habit-chart-summary", "#habit-chart-range", "#habit-chart-habit", "#habit-chart-category"));
    $("#habit-chart-category").addEventListener("change", () => { renderHabitChartOptions(); renderHabitChart("#habit-chart", "#habit-chart-summary", "#habit-chart-range", "#habit-chart-habit", "#habit-chart-category"); });
    $("#dashboard-chart-range").addEventListener("change", () => renderHabitChart("#dashboard-habit-chart", "#dashboard-habit-chart-summary", "#dashboard-chart-range", "#dashboard-chart-habit", "#dashboard-chart-category"));
    $("#dashboard-chart-habit").addEventListener("change", () => renderHabitChart("#dashboard-habit-chart", "#dashboard-habit-chart-summary", "#dashboard-chart-range", "#dashboard-chart-habit", "#dashboard-chart-category"));
    $("#dashboard-chart-category").addEventListener("change", () => { renderHabitChartOptions(); renderHabitChart("#dashboard-habit-chart", "#dashboard-habit-chart-summary", "#dashboard-chart-range", "#dashboard-chart-habit", "#dashboard-chart-category"); });
    $("#mission-config-open").addEventListener("click", openMissionDialog);
    $("#mission-empty-action").addEventListener("click", () => { if (!state.habits.length) { setView("habits"); $("[data-open-habit]")?.click(); } else openMissionDialog(); });
    $("#mission-form").addEventListener("submit", saveMission);
    $("#dashboard-mission-content").addEventListener("click", event => {
      if (event.target.closest("[data-open-mission]")) openMissionDialog();
      const link = event.target.closest("[data-view-link]");
      if (link) setView(link.dataset.viewLink);
    });
    $("#mission-habit").addEventListener("change", updateMissionTargetHint);
    $("#mission-target").addEventListener("input", updateMissionTargetHint);
    $("#avatar-file").addEventListener("change", event => uploadAvatar(event.target.files?.[0] || null));
    $("#avatar-remove").addEventListener("click", resetAvatar);
    $("#avatar").addEventListener("click", () => setView("progress"));
    $("#review-week-select").addEventListener("change", event => { state.reviewWeekStart = event.target.value; renderWeeklyReview(); });
    $("#weekly-review-form").addEventListener("submit", saveWeeklyReview);
    $("#daily-journal-form").addEventListener("submit", saveDailyJournal);
    $("#daily-journal-date").addEventListener("change", () => { state.journalSelectedDate = $("#daily-journal-date").value; renderDailyJournal(); });
    $("#daily-journal-history").addEventListener("click", event => {
      const entryButton = event.target.closest("[data-journal-date]");
      if (!entryButton) return;
      state.journalSelectedDate = entryButton.dataset.journalDate;
      $("#daily-journal-date").value = state.journalSelectedDate;
      renderDailyJournal();
    });
    $("#review-edit-mission").addEventListener("click", openMissionDialog);
    $("#logout-button").addEventListener("click", async () => { await db.auth.signOut(); location.replace("login.html"); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") $$("dialog[open]").forEach(dialog => dialog.close()); });
  }

  async function initialize() {
    showGate("Comprobando tu sesión…", true);
    try {
      const user = await requireSession(); if (!user) return;
      bindEvents();
      await refreshAvatarUrl();
      await loadData();
      setView("dashboard");
      showGate("", false);
      db.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_OUT" || !session) location.replace("login.html"); });
    } catch (error) {
      console.error(error); showGate(error.message || "No se pudo preparar tu espacio.", true);
      $("#app-gate-message").textContent = `${error.message || "Error de conexión."} Revisa que hayas aplicado 02_migration_v1_7_rpg_journal.sql y que las tablas personales de V1.2 a V1.6 existan.`;
    }
  }
  initialize();
})();
