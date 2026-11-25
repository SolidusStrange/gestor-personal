-- MI PROGRESO: esquema independiente para tareas, hábitos y experiencia.
-- Usa tablas con prefijo personal_ para no modificar el gestor administrativo.
-- Ejecutar una sola vez en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.personal_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 45),
  color text not null default '#6e9d91',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists personal_categories_name_unique
  on public.personal_categories (user_id, lower(trim(name)));
create index if not exists personal_categories_user_idx on public.personal_categories(user_id, sort_order, name);

create table if not exists public.personal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid null references public.personal_categories(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '',
  due_date date null,
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard','epic')),
  completed_at timestamptz null,
  archived_at timestamptz null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_tasks_user_status_idx on public.personal_tasks(user_id, archived_at, completed_at, due_date);
create index if not exists personal_tasks_category_idx on public.personal_tasks(category_id);

create table if not exists public.personal_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 100),
  description text not null default '',
  frequency text not null default 'daily' check (frequency in ('daily','weekdays','weekly')),
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard','epic')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_habits_user_active_idx on public.personal_habits(user_id, is_active, title);

create table if not exists public.personal_habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.personal_habits(id) on delete cascade,
  completed_on date not null default current_date,
  period_start date not null,
  created_at timestamptz not null default now(),
  unique(habit_id, period_start)
);
create index if not exists personal_habit_logs_user_date_idx on public.personal_habit_logs(user_id, completed_on desc);

create table if not exists public.personal_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  source_type text not null check (source_type in ('task','habit')),
  source_id uuid not null,
  title_snapshot text not null,
  xp_amount integer not null check (xp_amount > 0),
  event_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique(user_id, event_key)
);
create index if not exists personal_xp_events_user_date_idx on public.personal_xp_events(user_id, created_at desc);

-- Actualización común de updated_at.
create or replace function public.personal_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists personal_categories_updated_at on public.personal_categories;
create trigger personal_categories_updated_at before update on public.personal_categories for each row execute function public.personal_set_updated_at();
drop trigger if exists personal_tasks_updated_at on public.personal_tasks;
create trigger personal_tasks_updated_at before update on public.personal_tasks for each row execute function public.personal_set_updated_at();
drop trigger if exists personal_habits_updated_at on public.personal_habits;
create trigger personal_habits_updated_at before update on public.personal_habits for each row execute function public.personal_set_updated_at();

-- Impide asociar una tarea a una categoría propiedad de otra cuenta.
create or replace function public.personal_validate_task_category_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.personal_categories c where c.id = new.category_id and c.user_id = new.user_id
  ) then raise exception 'La categoría no pertenece a esta cuenta.'; end if;
  return new;
end; $$;
drop trigger if exists personal_tasks_category_owner on public.personal_tasks;
create trigger personal_tasks_category_owner before insert or update of category_id, user_id on public.personal_tasks for each row execute function public.personal_validate_task_category_owner();

-- RLS: cada usuario solo puede consultar y administrar sus propios datos.
alter table public.personal_categories enable row level security;
alter table public.personal_tasks enable row level security;
alter table public.personal_habits enable row level security;
alter table public.personal_habit_logs enable row level security;
alter table public.personal_xp_events enable row level security;

drop policy if exists personal_categories_select_own on public.personal_categories;
create policy personal_categories_select_own on public.personal_categories for select to authenticated using (user_id = auth.uid());
drop policy if exists personal_categories_insert_own on public.personal_categories;
create policy personal_categories_insert_own on public.personal_categories for insert to authenticated with check (user_id = auth.uid());
drop policy if exists personal_categories_update_own on public.personal_categories;
create policy personal_categories_update_own on public.personal_categories for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists personal_categories_delete_own on public.personal_categories;
create policy personal_categories_delete_own on public.personal_categories for delete to authenticated using (user_id = auth.uid());

drop policy if exists personal_tasks_select_own on public.personal_tasks;
create policy personal_tasks_select_own on public.personal_tasks for select to authenticated using (user_id = auth.uid());
drop policy if exists personal_tasks_insert_own on public.personal_tasks;
create policy personal_tasks_insert_own on public.personal_tasks for insert to authenticated with check (user_id = auth.uid());
drop policy if exists personal_tasks_update_own on public.personal_tasks;
create policy personal_tasks_update_own on public.personal_tasks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists personal_tasks_delete_own on public.personal_tasks;
create policy personal_tasks_delete_own on public.personal_tasks for delete to authenticated using (user_id = auth.uid());

drop policy if exists personal_habits_select_own on public.personal_habits;
create policy personal_habits_select_own on public.personal_habits for select to authenticated using (user_id = auth.uid());
drop policy if exists personal_habits_insert_own on public.personal_habits;
create policy personal_habits_insert_own on public.personal_habits for insert to authenticated with check (user_id = auth.uid());
drop policy if exists personal_habits_update_own on public.personal_habits;
create policy personal_habits_update_own on public.personal_habits for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists personal_habits_delete_own on public.personal_habits;
create policy personal_habits_delete_own on public.personal_habits for delete to authenticated using (user_id = auth.uid());

drop policy if exists personal_habit_logs_select_own on public.personal_habit_logs;
create policy personal_habit_logs_select_own on public.personal_habit_logs for select to authenticated using (user_id = auth.uid());
drop policy if exists personal_xp_events_select_own on public.personal_xp_events;
create policy personal_xp_events_select_own on public.personal_xp_events for select to authenticated using (user_id = auth.uid());

-- Los puntos se calculan en PostgreSQL, no se aceptan desde el navegador.
create or replace function public.complete_personal_task(p_task_id uuid, p_local_date date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_task public.personal_tasks%rowtype; v_xp integer; v_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  select * into v_task from public.personal_tasks where id = p_task_id and user_id = auth.uid() for update;
  if not found then raise exception 'La tarea no existe o no pertenece a tu cuenta.'; end if;
  if v_task.archived_at is not null then raise exception 'No puedes completar una tarea archivada.'; end if;
  if v_task.completed_at is not null then return 0; end if;
  update public.personal_tasks set completed_at = now() where id = p_task_id and user_id = auth.uid();
  v_xp := case v_task.difficulty when 'easy' then 10 when 'medium' then 20 when 'hard' then 35 when 'epic' then 50 else 20 end;
  insert into public.personal_xp_events(user_id,event_key,source_type,source_id,title_snapshot,xp_amount,event_date)
  values(auth.uid(),'task:'||p_task_id::text,'task',p_task_id,v_task.title,v_xp,p_local_date)
  on conflict (user_id,event_key) do nothing returning id into v_event_id;
  if v_event_id is null then return 0; end if;
  return v_xp;
end; $$;

create or replace function public.complete_personal_habit(p_habit_id uuid, p_local_date date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_habit public.personal_habits%rowtype; v_xp integer; v_period_start date; v_log_id uuid; v_event_id uuid; v_key text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  select * into v_habit from public.personal_habits where id = p_habit_id and user_id = auth.uid() and is_active = true for update;
  if not found then raise exception 'El hábito no existe o está inactivo.'; end if;
  if v_habit.frequency = 'weekdays' and extract(isodow from p_local_date) > 5 then raise exception 'Este hábito está programado de lunes a viernes.'; end if;
  v_period_start := case when v_habit.frequency = 'weekly' then date_trunc('week', p_local_date)::date else p_local_date end;
  insert into public.personal_habit_logs(user_id,habit_id,completed_on,period_start)
  values(auth.uid(),p_habit_id,p_local_date,v_period_start)
  on conflict (habit_id,period_start) do nothing returning id into v_log_id;
  if v_log_id is null then return 0; end if;
  v_xp := case v_habit.difficulty when 'easy' then 5 when 'medium' then 10 when 'hard' then 15 when 'epic' then 20 else 10 end;
  v_key := 'habit:'||p_habit_id::text||':'||v_period_start::text;
  insert into public.personal_xp_events(user_id,event_key,source_type,source_id,title_snapshot,xp_amount,event_date)
  values(auth.uid(),v_key,'habit',p_habit_id,v_habit.title,v_xp,p_local_date)
  on conflict (user_id,event_key) do nothing returning id into v_event_id;
  if v_event_id is null then return 0; end if;
  return v_xp;
end; $$;

revoke all on function public.complete_personal_task(uuid,date) from public;
revoke all on function public.complete_personal_habit(uuid,date) from public;
grant execute on function public.complete_personal_task(uuid,date) to authenticated;
grant execute on function public.complete_personal_habit(uuid,date) to authenticated;

grant select, insert, update, delete on public.personal_categories to authenticated;
grant select, insert, update, delete on public.personal_tasks to authenticated;
grant select, insert, update, delete on public.personal_habits to authenticated;
grant select on public.personal_habit_logs to authenticated;
grant select on public.personal_xp_events to authenticated;

-- Sin categorías iniciales: cada usuario crea las suyas.
