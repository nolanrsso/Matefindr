-- Réglages globaux du site (une seule ligne, singleton) -- mode maintenance :
-- coupe l'accès au site à tout le monde SAUF au(x) compte(s) Discord listé(s).
-- À EXÉCUTER MANUELLEMENT dans le SQL Editor du projet Supabase (pdhffpxssagclexttfox).

create table if not exists public.site_settings (
  id int primary key default 1,
  maintenance_mode boolean not null default false,
  -- Discord tag(s) autorisé(s) à utiliser le site pendant la maintenance (ex: 'alonemaxing').
  maintenance_allowed_tag text,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

insert into public.site_settings (id) values (1)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

-- Lecture publique (anon + authenticated) : tout le monde doit pouvoir savoir si le
-- site est en maintenance AVANT même de se connecter.
drop policy if exists "site_settings_select_all" on public.site_settings;
create policy "site_settings_select_all" on public.site_settings
  for select using (true);

-- Aucune policy insert/update/delete pour anon/authenticated : seul admin.html
-- (clé service_role, qui bypass RLS) peut modifier ce réglage.
