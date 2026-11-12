-- OPCIONAL: referidos con conteo automático (gratis en supabase.com).
-- Pega esto en Supabase → SQL Editor → Run. Luego copia la URL y la "anon key" a onyx.config.json.

create table if not exists public.referrals (
  player_uuid  text primary key,          -- un apoyo por cuenta de Minecraft
  player_name  text,
  studio_code  text not null,
  created_at   timestamptz not null default now()
);

alter table public.referrals enable row level security;

-- El launcher solo puede AÑADIR apoyos (no leer la tabla ni borrar).
drop policy if exists "insertar referidos" on public.referrals;
create policy "insertar referidos" on public.referrals for insert to anon with check (
  char_length(studio_code) between 2 and 24 and char_length(player_uuid) between 30 and 40
);

-- Rankings públicos (solo números por estudio)
create or replace view public.referral_ranking_all as
  select upper(studio_code) as studio_code, count(*)::int as players
  from public.referrals group by upper(studio_code);

create or replace view public.referral_ranking_month as
  select upper(studio_code) as studio_code, count(*)::int as players
  from public.referrals where created_at >= date_trunc('month', now())
  group by upper(studio_code);

grant select on public.referral_ranking_all, public.referral_ranking_month to anon;
