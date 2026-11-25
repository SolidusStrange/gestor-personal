/*
 * MI PROGRESO — lógica de la aplicación.
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
  const CATEGORY_COLORS = ["#6e9d91", "#8b83b8", "#c48b5b", "#678db1", "#b4778d", "#8c9c61", "#6f9ca5"];
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
  const AVATAR_OPTIONS = [
    { emoji: "🧭", color: "#477f73", name: "Explorador" },
    { emoji: "🦊", color: "#bd7548", name: "Zorro" },
    { emoji: "🐺", color: "#64748b", name: "Lobo" },
    { emoji: "🐉", color: "#557c57", name: "Dragón" },
    { emoji: "🦉", color: "#8b75a7", name: "Búho" },
    { emoji: "🐼", color: "#536b78", name: "Panda" },
    { emoji: "🐱", color: "#b4778d", name: "Gato" },
    { emoji: "🦄", color: "#9475a8", name: "Unicornio" },
    { emoji: "🛡️", color: "#648b9d", name: "Guardían" },
    { emoji: "🔥", color: "#b85c48", name: "Fénix" },
    { emoji: "🌙", color: "#5f6e9d", name: "Lunar" },
    { emoji: "🌳", color: "#64805b", name: "Roble" }
  ];
  const state = { user: null, categories: [], tasks: [], habits: [], habitLogs: [], xpEvents: [], view: "dashboard", loading: false };

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
  const xpForTask = difficulty => TASK_XP[difficulty] ?? 20;
  const xpForHabit = difficulty => HABIT_XP[difficulty] ?? 10;
  const toLocalISO = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const fromLocalISO = value => { const [y, m, d] = String(value).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const currentWeekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toLocalISO(d); };
  const isHabitDoneThisPeriod = habit => state.habitLogs.some(log => log.habit_id === habit.id && (habit.frequency === "weekly" ? log.period_start === currentWeekStart() : log.completed_on === todayISO()));
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
    const results = await Promise.all([
      db.from("personal_categories").select("*").order("sort_order").order("name"),
      db.from("personal_tasks").select("*").order("sort_order").order("created_at", { ascending: false }),
      db.from("personal_habits").select("*").eq("is_active", true).order("created_at", { ascending: false }),
      db.from("personal_habit_logs").select("*").order("completed_on", { ascending: false }),
      db.from("personal_xp_events").select("*").order("created_at", { ascending: false })
    ]);
    for (const result of results) if (result.error) throw result.error;
    [state.categories, state.tasks, state.habits, state.habitLogs, state.xpEvents] = results.map(result => result.data || []);
    setCloud("Sincronizado", true);
    renderAll();
  }

  function setView(view) {
    state.view = view;
    const titles = { dashboard: "Resumen", tasks: "Tareas", habits: "Hábitos", progress: "Experiencia" };
    $$(".view").forEach(section => { section.hidden = section.id !== `${view}-view`; });
    $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    $("#page-title").textContent = titles[view] || "Resumen";
  }

  function getAvatarPreferences() {
    const metadata = state.user?.user_metadata || {};
    const fallback = AVATAR_OPTIONS[0];
    return {
      emoji: AVATAR_OPTIONS.some(item => item.emoji === metadata.avatar_emoji) ? metadata.avatar_emoji : fallback.emoji,
      color: AVATAR_OPTIONS.find(item => item.emoji === metadata.avatar_emoji)?.color || fallback.color
    };
  }

  function renderTopbar() {
    const date = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
    $("#today-label").textContent = date.charAt(0).toUpperCase() + date.slice(1);
    const prefs = getAvatarPreferences();
    $("#avatar").textContent = prefs.emoji;
    $("#avatar").style.background = prefs.color;
    $("#avatar").style.color = "#ffffff";
    $("#avatar").title = `Avatar de ${state.user?.email || "tu cuenta"}. Pulsa para personalizar.`;
  }

  function renderCategoryOptions() {
    const current = $("#task-category").value;
    $("#task-category").innerHTML = `<option value="">Sin categoría</option>` + state.categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join("");
    if (state.categories.some(cat => cat.id === current)) $("#task-category").value = current;
    const filter = $("#task-category-filter");
    if (filter) {
      const selected = filter.value || "all";
      filter.innerHTML = `<option value="all">Todas las categorías</option><option value="none">Sin categoría</option>` + state.categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join("");
      if ([...filter.options].some(option => option.value === selected)) filter.value = selected;
    }
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
    $("#level-value").textContent = progression.level;
    $("#xp-total").textContent = `${total} XP`;
    $("#xp-next").textContent = `${progression.inLevel} / ${progression.needed} XP para el siguiente nivel`;
    $("#level-progress").style.width = `${progression.percent}%`;
    $("#level-caption").textContent = `Siguiente nivel: ${progression.needed - progression.inLevel} XP restantes.`;
    $("#rank-badge").innerHTML = `${progression.rank.symbol} ${progression.rank.name}`;
    $("#rank-next-caption").textContent = nextText;
    $("#level-emblem").textContent = progression.rank.symbol;
    $("#progress-xp-total").textContent = `${total} XP`;
    $("#progress-level-caption").textContent = `Nivel ${progression.level} · ${progression.inLevel}/${progression.needed} XP hacia el siguiente nivel`;
    renderRankLadder(progression);
    return total;
  }

  function taskRow(task, compact = false) {
    const category = state.categories.find(cat => cat.id === task.category_id);
    const done = Boolean(task.completed_at);
    const archived = Boolean(task.archived_at);
    return `<div class="task-row difficulty-${task.difficulty || "medium"} ${done ? "is-complete" : ""} ${archived ? "is-archived" : ""}" data-task-id="${task.id}">
      <label class="check-wrap"><input type="checkbox" data-action="toggle-task" ${done ? "checked" : ""} ${archived ? "disabled" : ""} aria-label="Completar ${escapeHtml(task.title)}"><span class="custom-check"></span></label>
      <div class="task-main"><div class="task-title">${escapeHtml(task.title)}</div>${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ""}<div class="task-meta">${category ? `<span class="category-chip" style="--chip-color:${escapeHtml(category.color)}">${escapeHtml(category.name)}</span>` : `<span class="muted">Sin categoría</span>`}<span>${task.due_date ? `Objetivo: ${fmtDate(task.due_date)}` : "Sin fecha objetivo"}</span><span class="difficulty-pill difficulty-${task.difficulty || "medium"}">${DIFFICULTY_LABEL[task.difficulty] || "Media"} · ${xpForTask(task.difficulty)} XP</span>${done ? `<span class="completed-label">Completada ${fmtDateTime(task.completed_at)}</span>` : ""}${archived ? `<span class="muted">Archivada ${fmtDateTime(task.archived_at)}</span>` : ""}</div></div>
      ${compact ? "" : `<div class="task-actions"><button class="icon-button" data-action="edit-task" title="Editar" aria-label="Editar">✎</button>${archived ? `<button class="icon-button" data-action="restore-task" title="Restaurar">↶</button>` : `<button class="icon-button" data-action="archive-task" title="Archivar">▣</button>`}<button class="icon-button danger-text" data-action="delete-task" title="Eliminar definitivamente">×</button></div>`}
    </div>`;
  }

  function renderDashboard() {
    const totalXp = state.xpEvents.filter(event => event.event_date === todayISO()).reduce((sum, event) => sum + Number(event.xp_amount), 0);
    const todayTasks = state.tasks.filter(task => task.completed_at && localDateFromTimestamp(task.completed_at) === todayISO());
    const activeTasks = state.tasks.filter(task => !task.archived_at && !task.completed_at).sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
    const todaysHabits = state.habits.filter(isHabitScheduledToday);
    const completedHabits = todaysHabits.filter(isHabitDoneThisPeriod);
    $("#today-done").textContent = `${todayTasks.length}/${state.tasks.filter(t => !t.archived_at && (!t.due_date || t.due_date <= todayISO())).length}`;
    $("#today-xp").textContent = `+${totalXp} XP ganados hoy`;
    $("#habit-done").textContent = `${completedHabits.length}/${todaysHabits.length}`;
    $("#habit-streak").textContent = completedHabits.length ? "Buen trabajo. Mantén la constancia." : "Un día a la vez.";
    $("#dashboard-task-list").innerHTML = activeTasks.slice(0, 6).map(task => taskRow(task, true)).join("") || `<div class="empty-state">No tienes tareas pendientes. Crea una para empezar.</div>`;
    $("#dashboard-habit-list").innerHTML = todaysHabits.slice(0, 6).map(habit => habitCompact(habit)).join("") || `<div class="empty-state">Todavía no has creado hábitos.</div>`;
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
    $("#category-strip").innerHTML = state.categories.map(cat => `<div class="category-manage-row"><span class="category-dot" style="background:${escapeHtml(cat.color)}"></span><span>${escapeHtml(cat.name)}</span><span class="muted">${state.tasks.filter(t => t.category_id === cat.id && !t.archived_at).length} tareas</span><button class="icon-button danger-text" data-action="delete-category" data-category-id="${cat.id}" title="Eliminar categoría">×</button></div>`).join("") || `<div class="empty-state">Aún no tienes categorías.</div>`;
  }

  function habitCompact(habit) {
    const done = isHabitDoneThisPeriod(habit);
    return `<div class="habit-compact" data-habit-id="${habit.id}"><div><strong>${escapeHtml(habit.title)}</strong><small><span class="difficulty-dot difficulty-${habit.difficulty || "medium"}"></span>${habit.frequency === "weekly" ? "Una vez por semana" : habit.frequency === "weekdays" ? "Lunes a viernes" : "Todos los días"} · ${xpForHabit(habit.difficulty)} XP</small></div><button class="small ${done ? "secondary" : "primary"}" data-action="complete-habit" ${done || !isHabitScheduledToday(habit) ? "disabled" : ""}>${done ? "Hecho" : "Completar"}</button></div>`;
  }

  function renderHabits() {
    $("#habit-list").innerHTML = state.habits.map(habit => {
      const done = isHabitDoneThisPeriod(habit);
      const logs = state.habitLogs.filter(log => log.habit_id === habit.id).length;
      const freq = habit.frequency === "weekly" ? "Semanal" : habit.frequency === "weekdays" ? "Lunes a viernes" : "Diario";
      return `<article class="panel habit-card" data-habit-id="${habit.id}"><div class="habit-card-top"><span class="habit-symbol">↻</span><span class="difficulty-pill difficulty-${habit.difficulty || "medium"}">${DIFFICULTY_LABEL[habit.difficulty]} · ${xpForHabit(habit.difficulty)} XP</span></div><h3>${escapeHtml(habit.title)}</h3><p class="muted">${escapeHtml(habit.description || freq)}</p><div class="habit-card-foot"><span class="muted">${freq} · ${logs} registros</span><button class="primary small" data-action="complete-habit" ${done || !isHabitScheduledToday(habit) ? "disabled" : ""}>${done ? "Completado" : "Completar hoy"}</button></div><div class="habit-card-actions"><button class="text-button" data-action="edit-habit">Editar</button><button class="text-button danger-text" data-action="delete-habit">Eliminar</button></div></article>`;
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

  function buildHabitWeeklySeries(weeksToShow) {
    const current = weekStartFor(new Date());
    const weeks = [];
    for (let offset = weeksToShow - 1; offset >= 0; offset -= 1) {
      const monday = new Date(current);
      monday.setDate(monday.getDate() - (offset * 7));
      const weekStart = toLocalISO(monday);
      const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
      const weekEnd = toLocalISO(sunday);
      let expected = 0;
      let completed = 0;
      for (const habit of state.habits) {
        const createdOn = habitCreatedOn(habit);
        if (habit.frequency === "weekly") {
          if (createdOn <= weekEnd) {
            expected += 1;
            if (state.habitLogs.some(log => log.habit_id === habit.id && log.period_start === weekStart)) completed += 1;
          }
          continue;
        }
        for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
          const day = new Date(monday); day.setDate(day.getDate() + dayOffset);
          const iso = toLocalISO(day);
          const weekday = day.getDay();
          const scheduled = habit.frequency === "daily" || (habit.frequency === "weekdays" && weekday !== 0 && weekday !== 6);
          if (!scheduled || iso < createdOn) continue;
          expected += 1;
          if (state.habitLogs.some(log => log.habit_id === habit.id && log.completed_on === iso)) completed += 1;
        }
      }
      weeks.push({ weekStart, expected, completed, percent: expected ? Math.round((completed / expected) * 100) : null });
    }
    return weeks;
  }

  function renderHabitChart() {
    const host = $("#habit-chart");
    if (!host) return;
    const range = Number($("#habit-chart-range")?.value || 8);
    const series = buildHabitWeeklySeries(range);
    const valid = series.map((item, index) => ({ ...item, index })).filter(item => item.expected > 0);
    if (!valid.length) {
      host.innerHTML = `<div class="empty-state">Registra algunos hábitos para comenzar a ver tu evolución semanal.</div>`;
      $("#habit-chart-summary").textContent = "Sin datos todavía";
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
    const totalCompleted = latest.completed;
    const totalExpected = latest.expected;
    const periodLabel = latest.weekStart === currentWeekStart() ? "Semana en curso" : "Última semana registrada";
    $("#habit-chart-summary").textContent = `${periodLabel}: ${latest.percent}% · ${totalCompleted} de ${totalExpected} registros programados`;
  }

  function renderAvatarPicker() {
    const prefs = getAvatarPreferences();
    const preview = $("#profile-avatar-preview");
    if (preview) { preview.textContent = prefs.emoji; preview.style.background = prefs.color; }
    const picker = $("#avatar-picker");
    if (!picker) return;
    picker.innerHTML = AVATAR_OPTIONS.map(option => `<button type="button" class="avatar-choice ${prefs.emoji === option.emoji ? "is-selected" : ""}" data-avatar-emoji="${option.emoji}" data-avatar-color="${option.color}" aria-label="Avatar ${option.name}" aria-pressed="${prefs.emoji === option.emoji}"><span style="background:${option.color}">${option.emoji}</span><small>${option.name}</small></button>`).join("");
  }

  async function saveAvatar(button) {
    const emoji = button.dataset.avatarEmoji;
    const color = button.dataset.avatarColor;
    const metadata = state.user?.user_metadata || {};
    $("#avatar-save-status").textContent = "Guardando avatar…";
    $$("#avatar-picker button").forEach(item => { item.disabled = true; });
    try {
      const { data, error } = await db.auth.updateUser({ data: { ...metadata, avatar_emoji: emoji, avatar_color: color } });
      if (error) throw error;
      state.user = data.user;
      renderTopbar(); renderAvatarPicker();
      $("#avatar-save-status").textContent = "Avatar guardado en tu cuenta.";
    } catch (error) {
      $("#avatar-save-status").textContent = "No se pudo guardar el avatar. Inténtalo nuevamente.";
      handleError(error);
    } finally {
      $$("#avatar-picker button").forEach(item => { item.disabled = false; });
    }
  }

  function renderProgress() {
    const taskEvents = state.xpEvents.filter(e => e.source_type === "task");
    const habitEvents = state.xpEvents.filter(e => e.source_type === "habit");
    $("#progress-task-count").textContent = taskEvents.length;
    $("#progress-habit-count").textContent = state.habitLogs.length;
    $("#xp-history").innerHTML = state.xpEvents.map(event => `<div class="history-row"><div class="history-symbol ${event.source_type}">${event.source_type === "task" ? "✓" : "↻"}</div><div class="history-main"><strong>${escapeHtml(event.title_snapshot)}</strong><small>${event.source_type === "task" ? "Tarea completada" : "Hábito registrado"} · ${fmtDate(event.event_date)}</small></div><strong class="history-xp">+${event.xp_amount} XP</strong></div>`).join("") || `<div class="empty-state">Todavía no has ganado experiencia. Completa una tarea o registra un hábito.</div>`;
    renderAvatarPicker();
  }

  function renderAll() {
    renderTopbar(); renderCategoryOptions(); renderLevel(); renderDashboard(); renderTasks(); renderHabits(); renderProgress(); renderHabitChart();
  }

  function openDialog(id) { const dialog = document.getElementById(id); if (dialog && !dialog.open) dialog.showModal(); }
  function closeDialog(id) { const dialog = document.getElementById(id); if (dialog?.open) dialog.close(); }
  function resetTaskForm() { $("#task-form").reset(); $("#task-form").elements.id.value = ""; $("#task-dialog-title").textContent = "Crear tarea"; $("#task-xp-hint").textContent = "La experiencia se entrega una sola vez al completar la tarea."; }
  function openTask(task = null) {
    const form = $("#task-form"); form.reset(); form.elements.id.value = task?.id || "";
    $("#task-dialog-title").textContent = task ? "Editar tarea" : "Crear tarea";
    form.elements.title.value = task?.title || ""; form.elements.description.value = task?.description || "";
    form.elements.due_date.value = task?.due_date || ""; form.elements.category_id.value = task?.category_id || "";
    form.elements.difficulty.value = task?.difficulty || "medium";
    updateTaskXpHint(); openDialog("task-dialog");
  }
  function updateTaskXpHint() { const value = $("#task-difficulty").value; $("#task-xp-hint").textContent = `Al completar esta tarea recibirás ${xpForTask(value)} XP. Se otorgan una sola vez.`; }
  function openHabit(habit = null) {
    const form = $("#habit-form"); form.reset(); form.elements.id.value = habit?.id || "";
    $("#habit-dialog-title").textContent = habit ? "Editar hábito" : "Crear hábito";
    form.elements.title.value = habit?.title || ""; form.elements.description.value = habit?.description || "";
    form.elements.frequency.value = habit?.frequency || "daily"; form.elements.difficulty.value = habit?.difficulty || "medium";
    updateHabitXpHint(); openDialog("habit-dialog");
  }
  function updateHabitXpHint() { $("#habit-xp-hint").textContent = `Al registrar este hábito recibirás ${xpForHabit($("#habit-form").elements.difficulty.value)} XP, una vez por período.`; }

  async function saveTask(event) {
    event.preventDefault(); const form = event.currentTarget; const id = form.elements.id.value;
    const payload = { user_id: state.user.id, title: form.elements.title.value.trim(), description: form.elements.description.value.trim(), due_date: form.elements.due_date.value || null, category_id: form.elements.category_id.value || null, difficulty: form.elements.difficulty.value };
    if (!payload.title) return;
    const button = $("#task-save-button"); button.disabled = true;
    try {
      const result = id ? await db.from("personal_tasks").update(payload).eq("id", id).select().single() : await db.from("personal_tasks").insert(payload).select().single();
      if (result.error) throw result.error;
      closeDialog("task-dialog"); setNotice(id ? "Tarea actualizada." : "Tarea creada."); await loadData();
    } catch (error) { handleError(error); } finally { button.disabled = false; }
  }
  async function saveCategory(event) {
    event.preventDefault(); const form = event.currentTarget; const name = form.elements.name.value.trim();
    if (!name) return;
    try {
      const color = CATEGORY_COLORS[state.categories.length % CATEGORY_COLORS.length];
      const { error } = await db.from("personal_categories").insert({ user_id: state.user.id, name, color, sort_order: state.categories.length });
      if (error) { if (error.code === "23505") throw new Error("Ya existe una categoría con ese nombre."); throw error; }
      closeDialog("category-dialog"); form.reset(); setNotice("Categoría creada."); await loadData();
    } catch (error) { handleError(error); }
  }
  async function saveHabit(event) {
    event.preventDefault(); const form = event.currentTarget; const id = form.elements.id.value;
    const payload = { user_id: state.user.id, title: form.elements.title.value.trim(), description: form.elements.description.value.trim(), frequency: form.elements.frequency.value, difficulty: form.elements.difficulty.value, is_active: true };
    try {
      const result = id ? await db.from("personal_habits").update(payload).eq("id", id).select().single() : await db.from("personal_habits").insert(payload).select().single();
      if (result.error) throw result.error;
      closeDialog("habit-dialog"); setNotice(id ? "Hábito actualizado." : "Hábito creado."); await loadData();
    } catch (error) { handleError(error); }
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
  async function completeHabit(habit) {
    try {
      const { data, error } = await db.rpc("complete_personal_habit", { p_habit_id: habit.id, p_local_date: todayISO() });
      if (error) throw error;
      setNotice(data > 0 ? `Hábito registrado: +${data} XP.` : "Este hábito ya fue registrado en el período actual.");
      await loadData();
    } catch (error) { handleError(error); }
  }
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
    if (!confirm(`¿Eliminar la categoría “${category.name}”? Las tareas asociadas quedarán sin categoría.`)) return;
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
    if (button.dataset.action === "complete-habit") completeHabit(habit);
    if (button.dataset.action === "edit-habit") openHabit(habit);
    if (button.dataset.action === "delete-habit") deleteHabit(habit);
  }

  function bindEvents() {
    $$(".nav-item").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
    $$('[data-view-link]').forEach(button => button.addEventListener("click", () => setView(button.dataset.viewLink)));
    $$('[data-open-task]').forEach(button => button.addEventListener("click", () => openTask()));
    $$('[data-open-habit]').forEach(button => button.addEventListener("click", () => openHabit()));
    $$('[data-close]').forEach(button => button.addEventListener("click", () => closeDialog(button.dataset.close)));
    $("#create-category-open").addEventListener("click", () => openDialog("category-dialog"));
    $("#task-form").addEventListener("submit", saveTask);
    $("#category-form").addEventListener("submit", saveCategory);
    $("#habit-form").addEventListener("submit", saveHabit);
    $("#task-difficulty").addEventListener("change", updateTaskXpHint);
    $("#habit-form").elements.difficulty.addEventListener("change", updateHabitXpHint);
    $("#task-search").addEventListener("input", renderTasks);
    $("#task-filter").addEventListener("change", renderTasks);
    $("#task-category-filter").addEventListener("change", renderTasks);
    $("#task-list").addEventListener("click", handleTaskAction);
    $("#category-strip").addEventListener("click", event => { const button = event.target.closest('[data-action="delete-category"]'); if (button) deleteCategory(button.dataset.categoryId); });
    $("#habit-list").addEventListener("click", handleHabitAction);
    $("#dashboard-task-list").addEventListener("change", event => { const checkbox = event.target.closest('[data-action="toggle-task"]'); if (checkbox) { const row = checkbox.closest("[data-task-id]"); const task = state.tasks.find(item => item.id === row.dataset.taskId); if (task) toggleTask(task); } });
    $("#task-list").addEventListener("change", event => { const checkbox = event.target.closest('[data-action="toggle-task"]'); if (checkbox) { const row = checkbox.closest("[data-task-id]"); const task = state.tasks.find(item => item.id === row.dataset.taskId); if (task) toggleTask(task); } });
    $("#dashboard-habit-list").addEventListener("click", handleHabitAction);
    $("#habit-chart-range").addEventListener("change", renderHabitChart);
    $("#avatar-picker").addEventListener("click", event => { const button = event.target.closest("[data-avatar-emoji]"); if (button) saveAvatar(button); });
    $("#avatar").addEventListener("click", () => setView("progress"));
    $("#logout-button").addEventListener("click", async () => { await db.auth.signOut(); location.replace("login.html"); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") $$("dialog[open]").forEach(dialog => dialog.close()); });
  }

  async function initialize() {
    showGate("Comprobando tu sesión…", true);
    try {
      const user = await requireSession(); if (!user) return;
      bindEvents();
      await loadData();
      setView("dashboard");
      showGate("", false);
      db.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_OUT" || !session) location.replace("login.html"); });
    } catch (error) {
      console.error(error); showGate(error.message || "No se pudo preparar tu espacio.", true);
      $("#app-gate-message").textContent = `${error.message || "Error de conexión."} Revisa que hayas ejecutado 01_personal_schema.sql en Supabase.`;
    }
  }
  initialize();
})();
