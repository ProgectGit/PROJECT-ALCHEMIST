create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  idea text not null,
  status text not null default 'draft' check (status in ('draft', 'planned', 'active', 'done', 'archived')),
  progress integer not null default 0 check (progress between 0 and 100),
  difficulty integer not null default 1 check (difficulty between 1 and 10),
  risk integer not null default 1 check (risk between 1 and 10),
  time_estimate text,
  stack_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_analysis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  summary text not null,
  business_goal text,
  target_audience text,
  main_features jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  monetization jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  estimated_complexity integer not null default 1 check (estimated_complexity between 1 and 10),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_at timestamptz not null default now()
);

create table if not exists public.project_roadmaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage integer not null check (stage between 1 and 5),
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_architecture (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  frontend text,
  backend text,
  database_layer text,
  ai_layer text,
  hosting text,
  automation text,
  database_design jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_stack (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  technology text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_created_at on public.projects(created_at desc);
create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_projects_stack_keywords on public.projects using gin(stack_keywords);
create index if not exists idx_project_tasks_project_id on public.project_tasks(project_id);
create index if not exists idx_project_roadmaps_project_id on public.project_roadmaps(project_id);
create index if not exists idx_project_stack_project_id on public.project_stack(project_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.project_analysis enable row level security;
alter table public.project_requirements enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_roadmaps enable row level security;
alter table public.project_architecture enable row level security;
alter table public.project_stack enable row level security;

drop policy if exists "Public read projects" on public.projects;
drop policy if exists "Public insert projects" on public.projects;
drop policy if exists "Public update projects" on public.projects;
drop policy if exists "Public read project_analysis" on public.project_analysis;
drop policy if exists "Public insert project_analysis" on public.project_analysis;
drop policy if exists "Public read project_requirements" on public.project_requirements;
drop policy if exists "Public insert project_requirements" on public.project_requirements;
drop policy if exists "Public read project_tasks" on public.project_tasks;
drop policy if exists "Public insert project_tasks" on public.project_tasks;
drop policy if exists "Public update project_tasks" on public.project_tasks;
drop policy if exists "Public read project_roadmaps" on public.project_roadmaps;
drop policy if exists "Public insert project_roadmaps" on public.project_roadmaps;
drop policy if exists "Public read project_architecture" on public.project_architecture;
drop policy if exists "Public insert project_architecture" on public.project_architecture;
drop policy if exists "Public read project_stack" on public.project_stack;
drop policy if exists "Public insert project_stack" on public.project_stack;

create policy "Public read projects" on public.projects for select to anon using (true);
create policy "Public insert projects" on public.projects for insert to anon with check (true);
create policy "Public update projects" on public.projects for update to anon using (true) with check (true);

create policy "Public read project_analysis" on public.project_analysis for select to anon using (true);
create policy "Public insert project_analysis" on public.project_analysis for insert to anon with check (true);

create policy "Public read project_requirements" on public.project_requirements for select to anon using (true);
create policy "Public insert project_requirements" on public.project_requirements for insert to anon with check (true);

create policy "Public read project_tasks" on public.project_tasks for select to anon using (true);
create policy "Public insert project_tasks" on public.project_tasks for insert to anon with check (true);
create policy "Public update project_tasks" on public.project_tasks for update to anon using (true) with check (true);

create policy "Public read project_roadmaps" on public.project_roadmaps for select to anon using (true);
create policy "Public insert project_roadmaps" on public.project_roadmaps for insert to anon with check (true);

create policy "Public read project_architecture" on public.project_architecture for select to anon using (true);
create policy "Public insert project_architecture" on public.project_architecture for insert to anon with check (true);

create policy "Public read project_stack" on public.project_stack for select to anon using (true);
create policy "Public insert project_stack" on public.project_stack for insert to anon with check (true);
