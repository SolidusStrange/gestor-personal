# Mi Progreso — hábitos y tareas personales

Aplicación web personal desarrollada con HTML, CSS y JavaScript nativo, autenticación Supabase y PostgreSQL.

## Qué contiene

- `index.html`: estructura del dashboard, tareas, hábitos, experiencia y formularios.
- `styles.css`: estilos, componentes reutilizables y modo responsive.
- `app.js`: estado de la aplicación, renderizado, CRUD y conexión con las tablas/RPC de Supabase.
- `login.html` / `login.css`: acceso y configuración inicial de contraseña.
- `auth.js`: inicio de sesión por invitación y configuración de contraseña.
- `supabase-config.js`: URL del proyecto y publishable key (no contiene claves secretas).
- `theme.js`: preferencia local de modo claro/nocturno.
- `01_personal_schema.sql`: tablas, RLS, índices y funciones RPC de XP.

## Puesta en marcha

1. En Supabase SQL Editor ejecuta `01_personal_schema.sql` una sola vez.
2. Invita las cuentas desde Authentication → Users. El registro público no se utiliza.
3. En Authentication → URL Configuration agrega las rutas de login y redirect de tu hosting.
4. Publica los archivos HTML, CSS y JS en GitHub Pages o ejecuta con Live Server.
5. Abre `login.html` para autenticarte.

> El SQL crea tablas `personal_*` independientes. No modifica `categories`, `tasks` ni otras tablas del gestor administrativo anterior.

## Sistema de experiencia

### Tareas

- Fácil: 10 XP
- Media: 20 XP
- Difícil: 35 XP
- Muy difícil: 50 XP

La complejidad queda guardada en la tarea. La función PostgreSQL `complete_personal_task` calcula y concede los XP. Un índice único por usuario y clave de evento evita que desmarcar y volver a marcar una tarea genere XP adicionales.

### Hábitos

- Fácil: 5 XP
- Media: 10 XP
- Difícil: 15 XP
- Muy difícil: 20 XP

Frecuencias: diaria, lunes a viernes y semanal. La tabla `personal_habit_logs` impide registrar el mismo hábito más de una vez por período. `complete_personal_habit` concede XP de manera transaccional.

### Niveles

Cada 100 XP acumulados se avanza un nivel. El cálculo se hace desde el total de `personal_xp_events`; el navegador no puede escribir ni modificar esos eventos directamente.

## Seguridad

- Todas las tablas tienen RLS activado.
- Cada fila tiene `user_id` vinculado a `auth.users`.
- `personal_xp_events` y `personal_habit_logs` son de solo lectura para el cliente; las funciones RPC insertan los registros.
- No publicar `sb_secret_`, `service_role` ni la contraseña de PostgreSQL.

## Reglas de negocio

- Completar una tarea entrega XP una única vez en su vida útil. Reabrirla no revierte los XP y volver a completarla no los duplica.
- Un hábito entrega XP una vez por día (o una vez por semana cuando su frecuencia es semanal).
- Eliminar una tarea no elimina XP que ya se ganó; el historial conserva el nombre de la acción.
- El tema visual se guarda en `localStorage` bajo `mi-progreso-theme`.

## Publicación

Para GitHub Pages sube el contenido de esta carpeta a la raíz del repositorio. Configura `Site URL` como `https://TU-USUARIO.github.io/TU-REPOSITORIO/login.html` y agrega `https://TU-USUARIO.github.io/TU-REPOSITORIO/**` a las Redirect URLs de Supabase.
