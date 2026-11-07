-- =============================================================
-- LEONE — schéma Supabase sécurisé
-- À coller dans Supabase > SQL Editor > New query > Run
-- (réexécutable sans risque)
--
-- Principes :
--  * Les événements sont publics en lecture, modifiables uniquement
--    par les organisateurs (comptes Supabase Auth listés dans `admins`).
--  * Les réponses ne sont PAS lisibles directement : le public ne voit
--    qu'un résumé (via public_event_stats) — prénom seulement si la
--    personne a donné son accord, jamais le message ni les réponses aux
--    questions, qui restent réservés aux organisateurs.
--  * Une seule réponse par appareil et par prénom pour chaque événement,
--    vérifié côté serveur (contraintes UNIQUE + fonctions contrôlées).
--  * Tout est validé côté serveur : événement existant et non terminé,
--    longueurs, objets autorisés, quantités, places max, limite d'envois.
-- =============================================================

-- ---------- Tables ----------
create table if not exists public.events (
  id          text primary key check (length(id) between 1 and 64),
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.responses (
  id           uuid primary key default gen_random_uuid(),
  event_id     text not null references public.events(id) on delete cascade,
  name         text not null check (length(name) between 1 and 40),
  name_key     text not null,
  show_name    boolean not null default false,
  status       text not null check (status in ('yes', 'maybe', 'no')),
  guests       int  not null default 0 check (guests between 0 and 10),
  items        jsonb not null default '{}'::jsonb,
  other        text not null default '' check (length(other) <= 120),
  answers      jsonb not null default '{}'::jsonb,
  message      text not null default '' check (length(message) <= 300),
  lang         text not null default 'fr' check (lang in ('fr', 'en')),
  device_hash  text not null,
  ip_hash      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (event_id, device_hash),
  unique (event_id, name_key)
);
create index if not exists responses_event_idx on public.responses(event_id);
create index if not exists responses_ip_idx on public.responses(ip_hash, created_at);

-- Organisateurs : ajoute ici l'UUID des comptes créés dans Authentication > Users
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- Helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- prénom normalisé : minuscules, sans accents ni ponctuation, espaces réduits
create or replace function public.leone_name_key(p text) returns text
language sql immutable as $$
  select trim(regexp_replace(regexp_replace(
           lower(translate(coalesce(p, ''),
             'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
             'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')),
           '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g'));
$$;

create or replace function public.leone_hash(p text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

-- heure de fin (heure de Paris ; 3 h après le début si pas de fin)
create or replace function public.leone_event_end(d jsonb) returns timestamptz
language sql immutable as $$
  select coalesce(
    nullif(d->>'end', '')::timestamp,
    (d->>'start')::timestamp + interval '3 hours'
  ) at time zone 'Europe/Paris';
$$;

create or replace function public.leone_client_ip_hash() returns text
language plpgsql stable as $$
declare
  h json;
  ip text;
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;
  ip := split_part(coalesce(h->>'x-forwarded-for', h->>'x-real-ip', ''), ',', 1);
  if ip = '' then return null; end if;
  return public.leone_hash('leone-ip:' || trim(ip));
end;
$$;

-- ---------- RLS ----------
alter table public.events    enable row level security;
alter table public.responses enable row level security;
alter table public.admins    enable row level security;

-- nettoyage des anciennes politiques (version précédente, trop permissive)
drop policy if exists "events read"       on public.events;
drop policy if exists "events write"      on public.events;
drop policy if exists "events update"     on public.events;
drop policy if exists "events delete"     on public.events;
drop policy if exists "responses read"    on public.responses;
drop policy if exists "responses insert"  on public.responses;
drop policy if exists "responses delete"  on public.responses;
drop policy if exists "events admin"      on public.events;
drop policy if exists "responses admin"   on public.responses;
drop policy if exists "admins self"       on public.admins;

create policy "events read"      on public.events    for select using (true);
create policy "events admin"     on public.events    for all    using (public.is_admin()) with check (public.is_admin());
create policy "responses admin"  on public.responses for all    using (public.is_admin()) with check (public.is_admin());
create policy "admins self"      on public.admins    for select using (user_id = auth.uid());

revoke all on public.responses from anon;
revoke all on public.admins from anon;

-- ---------- Résumé public d'un événement ----------
create or replace function public.public_event_stats(p_event_id text default null)
returns table (event_id text, headcount int, replies int, brought jsonb, attendees jsonb)
language sql stable security definer set search_path = public as $$
  select e.id,
    coalesce((select sum(1 + r.guests) from responses r where r.event_id = e.id and r.status = 'yes'), 0)::int,
    (select count(*) from responses r where r.event_id = e.id)::int,
    coalesce((
      select jsonb_object_agg(k, total) from (
        select it.key as k, sum((it.value)::int) as total
        from responses r, jsonb_each_text(r.items) it
        where r.event_id = e.id and r.status <> 'no'
        group by it.key
      ) s
    ), '{}'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',   case when r.show_name then r.name end,
               'status', r.status,
               'guests', r.guests,
               'items',  case when r.status <> 'no' then r.items else '{}'::jsonb end,
               'other',  case when r.status <> 'no' then r.other else '' end
             ) order by r.created_at desc)
      from responses r where r.event_id = e.id
    ), '[]'::jsonb)
  from events e
  where p_event_id is null or e.id = p_event_id;
$$;

-- ---------- Ma réponse (retrouvée grâce au secret de l'appareil) ----------
create or replace function public.my_response(p_event_id text, p_device text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'eventId', r.event_id, 'name', r.name, 'showName', r.show_name,
    'status', r.status, 'guests', r.guests, 'items', r.items, 'other', r.other,
    'answers', r.answers, 'message', r.message, 'createdAt', r.created_at, 'updatedAt', r.updated_at)
  from responses r
  where r.event_id = p_event_id
    and length(coalesce(p_device, '')) between 32 and 128
    and r.device_hash = public.leone_hash(p_device);
$$;

-- ---------- Envoyer / modifier sa réponse ----------
-- Erreurs renvoyées (champ "message") :
--   INVALID, EVENT_NOT_FOUND, EVENT_CLOSED, ALREADY_ANSWERED,
--   NAME_TAKEN, FULL, RATE_LIMIT, NOT_FOUND
create or replace function public.submit_response(
  p_event_id text, p_device text, p_name text, p_show_name boolean,
  p_status text, p_guests int, p_items jsonb, p_other text,
  p_answers jsonb, p_message text, p_lang text, p_update boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev        jsonb;
  dev_hash  text;
  ip        text;
  nkey      text;
  clean_items   jsonb := '{}'::jsonb;
  clean_answers jsonb := '{}'::jsonb;
  k text; v text; q int;
  existing  responses%rowtype;
  taken     int;
  cap       int;
  g         int := coalesce(p_guests, 0);
  rid       uuid;
begin
  -- appareil
  if p_device is null or p_device !~ '^[0-9a-f]{32,128}$' then raise exception 'INVALID'; end if;
  dev_hash := public.leone_hash(p_device);

  -- événement
  select data into ev from events where id = p_event_id;
  if ev is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if public.leone_event_end(ev) < now() then raise exception 'EVENT_CLOSED'; end if;

  -- champs
  p_name := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  nkey := public.leone_name_key(p_name);
  if length(p_name) not between 1 and 40 or nkey = '' then raise exception 'INVALID'; end if;
  if p_status not in ('yes', 'maybe', 'no') then raise exception 'INVALID'; end if;
  if g < 0 or g > 10 then raise exception 'INVALID'; end if;
  if coalesce((ev->>'allowGuests')::boolean, false) = false or p_status = 'no' then g := 0; end if;
  p_other   := left(trim(coalesce(p_other, '')), 120);
  p_message := left(trim(coalesce(p_message, '')), 300);
  if p_lang not in ('fr', 'en') then p_lang := 'fr'; end if;

  -- objets : uniquement ceux de l'événement, quantités 1..20
  if p_status <> 'no' and jsonb_typeof(p_items) = 'object' then
    for k, v in select * from jsonb_each_text(p_items) loop
      if not exists (select 1 from jsonb_array_elements(coalesce(ev->'items', '[]'::jsonb)) it where it->>'id' = k) then
        raise exception 'INVALID';
      end if;
      if v !~ '^\d{1,2}$' then raise exception 'INVALID'; end if;
      q := v::int;
      if q > 20 then raise exception 'INVALID'; end if;
      if q > 0 then clean_items := clean_items || jsonb_build_object(k, q); end if;
    end loop;
  end if;
  if p_status = 'no' then p_other := ''; end if;

  -- réponses aux questions : uniquement les questions de l'événement
  if jsonb_typeof(p_answers) = 'object' then
    for k, v in select * from jsonb_each_text(p_answers) loop
      if exists (select 1 from jsonb_array_elements(coalesce(ev->'questions', '[]'::jsonb)) qq where qq->>'id' = k)
         and length(trim(v)) > 0 then
        clean_answers := clean_answers || jsonb_build_object(k, left(trim(v), 200));
      end if;
    end loop;
  end if;

  select * into existing from responses where event_id = p_event_id and device_hash = dev_hash;

  if p_update then
    if existing.id is null then raise exception 'NOT_FOUND'; end if;
  else
    if existing.id is not null then raise exception 'ALREADY_ANSWERED'; end if;
    -- limite : 15 réponses / 10 min depuis une même connexion
    ip := public.leone_client_ip_hash();
    if ip is not null and (select count(*) from responses
        where ip_hash = ip and created_at > now() - interval '10 minutes') >= 15 then
      raise exception 'RATE_LIMIT';
    end if;
  end if;

  -- prénom déjà utilisé par quelqu'un d'autre
  if exists (select 1 from responses where event_id = p_event_id and name_key = nkey
             and (existing.id is null or id <> existing.id)) then
    raise exception 'NAME_TAKEN';
  end if;

  -- places max
  cap := coalesce(nullif(ev->>'capacity', '')::int, 0);
  if cap > 0 and p_status = 'yes' then
    select coalesce(sum(1 + guests), 0) into taken from responses
      where event_id = p_event_id and status = 'yes' and (existing.id is null or id <> existing.id);
    if taken + 1 + g > cap then raise exception 'FULL'; end if;
  end if;

  if p_update then
    update responses set name = p_name, name_key = nkey, show_name = coalesce(p_show_name, false),
      status = p_status, guests = g, items = clean_items, other = p_other, answers = clean_answers,
      message = p_message, lang = p_lang, updated_at = now()
    where id = existing.id
    returning id into rid;
  else
    insert into responses (event_id, name, name_key, show_name, status, guests, items, other,
                           answers, message, lang, device_hash, ip_hash)
    values (p_event_id, p_name, nkey, coalesce(p_show_name, false), p_status, g, clean_items, p_other,
            clean_answers, p_message, p_lang, dev_hash, ip)
    returning id into rid;
  end if;

  return jsonb_build_object('id', rid);
exception
  when unique_violation then
    -- course entre deux envois simultanés
    raise exception 'ALREADY_ANSWERED';
end;
$$;

-- ---------- Droits ----------
revoke all on function public.public_event_stats(text) from public;
revoke all on function public.my_response(text, text) from public;
revoke all on function public.submit_response(text, text, text, boolean, text, int, jsonb, text, jsonb, text, text, boolean) from public;
revoke all on function public.leone_client_ip_hash() from public;
grant execute on function public.public_event_stats(text) to anon, authenticated;
grant execute on function public.my_response(text, text) to anon, authenticated;
grant execute on function public.submit_response(text, text, text, boolean, text, int, jsonb, text, jsonb, text, text, boolean) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- -------------------------------------------------------------
-- Exemple : match de l'Équipe de France, jeudi 12 novembre 2026
-- -------------------------------------------------------------
insert into public.events (id, data) values (
  'match-france',
  $json${
    "title": "Match de l'Équipe de France",
    "title_en": "France national team match",
    "emoji": "⚽",
    "category": "Match",
    "category_en": "Match",
    "theme": "tricolore",
    "start": "2026-11-12T20:15",
    "end": "2026-11-12T23:00",
    "location": "Salle commune · RDC",
    "location_en": "Common room · ground floor",
    "description": "On regarde les Bleus tous ensemble sur grand écran. Rendez-vous 30 min avant le coup d'envoi (20h45).\n\nChacun ramène un petit quelque chose de la liste.",
    "description_en": "We're watching Les Bleus together on the big screen. Meet 30 min before kick-off (8:45 pm).\n\nEveryone brings a little something from the list.",
    "capacity": 40,
    "allowGuests": true,
    "items": [
      {"id": "chips", "emoji": "🥨", "label": "Chips & biscuits apéro (paquet)", "label_en": "Chips & snacks (bag)", "needed": 6},
      {"id": "pizza", "emoji": "🍕", "label": "Pizzas", "label_en": "Pizzas", "needed": 5},
      {"id": "softs", "emoji": "🥤", "label": "Softs (bouteille 1,5 L)", "label_en": "Soft drinks (1.5 L bottle)", "needed": 6},
      {"id": "bieres", "emoji": "🍺", "label": "Bières (pack)", "label_en": "Beer (pack)", "needed": 4},
      {"id": "dessert", "emoji": "🍰", "label": "Dessert / gâteau", "label_en": "Dessert / cake", "needed": 2},
      {"id": "gobelets", "emoji": "🥤", "label": "Gobelets, assiettes & serviettes", "label_en": "Cups, plates & napkins", "needed": 2},
      {"id": "chaises", "emoji": "🪑", "label": "Chaise pliante", "label_en": "Folding chair", "needed": 8},
      {"id": "enceinte", "emoji": "🔊", "label": "Enceinte Bluetooth", "label_en": "Bluetooth speaker", "needed": 1},
      {"id": "multiprise", "emoji": "🔌", "label": "Multiprise / rallonge", "label_en": "Power strip / extension cord", "needed": 2},
      {"id": "deco", "emoji": "🇫🇷", "label": "Drapeaux & maquillage tricolore", "label_en": "Flags & tricolour face paint", "needed": 3}
    ],
    "questions": [
      {"id": "prono", "label": "Ton pronostic (score final) ?", "label_en": "Your prediction (final score)?", "type": "text", "options": [], "options_en": []}
    ],
    "createdAt": "2026-11-07T12:00:00Z"
  }$json$::jsonb
) on conflict (id) do nothing;

-- -------------------------------------------------------------
-- Donner les droits organisateur (à faire une fois par organisateur)
-- 1. Authentication > Users > Add user (email + mot de passe)
-- 2. Exécuter, en remplaçant l'email :
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'organisateur@exemple.fr'
--    on conflict do nothing;
-- Pense à désactiver les inscriptions publiques :
--    Authentication > Providers > Email > "Allow new users to sign up" = off
-- -------------------------------------------------------------
