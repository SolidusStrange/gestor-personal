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
  const currentWeekStart = () => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10); };
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

  function renderTopbar() {
    const date = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
    $("#today-label").textContent = date.charAt(0).toUpperCase() + date.slice(1);
    $("#avatar").textContent = (state.user?.email || "U").charAt(0).toUpperCase();
    $("#avatar").title = state.user?.email || "Usuario";
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

  function renderLevel() {
    const total = state.xpEvents.reduce((sum, event) => sum + Number(event.xp_amount || 0), 0);
    const level = Math.floor(total / 100) + 1;
    const xpIntoLevel = total % 100;
    const progress = xpIntoLevel;
    $("#level-value").textContent = level;
    $("#xp-total").textContent = `${total} XP`;
    $("#xp-next").textContent = `${xpIntoLevel} / 100 XP para el siguiente nivel`;
    $("#level-progress").style.width = `${progress}%`;
    $("#level-caption").textContent = level === 1 ? "Cada acción suma experiencia." : `Has alcanzado el nivel ${level}. Sigue avanzando.`;
    $("#progress-xp-total").textContent = `${total} XP`;
    $("#progress-level-caption").textContent = `Nivel ${level} · ${xpIntoLevel}/100 XP hacia el siguiente nivel`;
    return total;
  }

  function taskRow(task, compact = false) {
    const category = state.categories.find(cat => cat.id === task.category_id);
    const done = Boolean(task.completed_at);
    const archived = Boolean(task.archived_at);
    return `<div class="task-row ${done ? "is-complete" : ""} ${archived ? "is-archived" : ""}" data-task-id="${task.id}">
      <label class="check-wrap"><input type="checkbox" data-action="toggle-task" ${done ? "checked" : ""} ${archived ? "disabled" : ""} aria-label="Completar ${escapeHtml(task.title)}"><span class="custom-check"></span></label>
      <div class="task-main"><div class="task-title">${escapeHtml(task.title)}</div>${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ""}<div class="task-meta">${category ? `<span class="category-chip" style="--chip-color:${escapeHtml(category.color)}">${escapeHtml(category.name)}</span>` : `<span class="muted">Sin categoría</span>`}<span>${task.due_date ? `Objetivo: ${fmtDate(task.due_date)}` : "Sin fecha objetivo"}</span><span class="difficulty-pill">${DIFFICULTY_LABEL[task.difficulty] || "Media"} · ${xpForTask(task.difficulty)} XP</span>${done ? `<span class="completed-label">Completada ${fmtDateTime(task.completed_at)}</span>` : ""}${archived ? `<span class="muted">Archivada ${fmtDateTime(task.archived_at)}</span>` : ""}</div></div>
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
    return `<div class="habit-compact" data-habit-id="${habit.id}"><div><strong>${escapeHtml(habit.title)}</strong><small>${habit.frequency === "weekly" ? "Una vez por semana" : habit.frequency === "weekdays" ? "Lunes a viernes" : "Todos los días"} · ${xpForHabit(habit.difficulty)} XP</small></div><button class="small ${done ? "secondary" : "primary"}" data-action="complete-habit" ${done || !isHabitScheduledToday(habit) ? "disabled" : ""}>${done ? "Hecho" : "Completar"}</button></div>`;
  }

  function renderHabits() {
    $("#habit-list").innerHTML = state.habits.map(habit => {
      const done = isHabitDoneThisPeriod(habit);
      const logs = state.habitLogs.filter(log => log.habit_id === habit.id).length;
      const freq = habit.frequency === "weekly" ? "Semanal" : habit.frequency === "weekdays" ? "Lunes a viernes" : "Diario";
      return `<article class="panel habit-card" data-habit-id="${habit.id}"><div class="habit-card-top"><span class="habit-symbol">↻</span><span class="difficulty-pill">${DIFFICULTY_LABEL[habit.difficulty]} · ${xpForHabit(habit.difficulty)} XP</span></div><h3>${escapeHtml(habit.title)}</h3><p class="muted">${escapeHtml(habit.description || freq)}</p><div class="habit-card-foot"><span class="muted">${freq} · ${logs} registros</span><button class="primary small" data-action="complete-habit" ${done || !isHabitScheduledToday(habit) ? "disabled" : ""}>${done ? "Completado" : "Completar hoy"}</button></div><div class="habit-card-actions"><button class="text-button" data-action="edit-habit">Editar</button><button class="text-button danger-text" data-action="delete-habit">Eliminar</button></div></article>`;
    }).join("") || `<div class="empty-state panel">Todavía no has creado hábitos. Empieza con uno pequeño y fácil de repetir.</div>`;
  }

  function renderProgress() {
    const taskEvents = state.xpEvents.filter(e => e.source_type === "task");
    const habitEvents = state.xpEvents.filter(e => e.source_type === "habit");
    $("#progress-task-count").textContent = taskEvents.length;
    $("#progress-habit-count").textContent = state.habitLogs.length;
    $("#xp-history").innerHTML = state.xpEvents.map(event => `<div class="history-row"><div class="history-symbol ${event.source_type}">${event.source_type === "task" ? "✓" : "↻"}</div><div class="history-main"><strong>${escapeHtml(event.title_snapshot)}</strong><small>${event.source_type === "task" ? "Tarea completada" : "Hábito registrado"} · ${fmtDate(event.event_date)}</small></div><strong class="history-xp">+${event.xp_amount} XP</strong></div>`).join("") || `<div class="empty-state">Todavía no has ganado experiencia. Completa una tarea o registra un hábito.</div>`;
  }

  function renderAll() {
    renderTopbar(); renderCategoryOptions(); renderLevel(); renderDashboard(); renderTasks(); renderHabits(); renderProgress();
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
