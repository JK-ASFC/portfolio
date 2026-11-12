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
               'name',   null::text,  -- site public : les prénoms ne sont jamais affichés (seuls les organisateurs les voient)
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
-- Site public : plus aucun prénom affiché publiquement (recommandation de confidentialité)
update public.responses set show_name = false where show_name;

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
    update responses set name = p_name, name_key = nkey, show_name = false,
      status = p_status, guests = g, items = clean_items, other = p_other, answers = clean_answers,
      message = p_message, lang = p_lang, updated_at = now()
    where id = existing.id
    returning id into rid;
  else
    insert into responses (event_id, name, name_key, show_name, status, guests, items, other,
                           answers, message, lang, device_hash, ip_hash)
    values (p_event_id, p_name, nkey, false, p_status, g, clean_items, p_other,
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

-- =============================================================
-- PROPOSITIONS D'ÉVÉNEMENTS (envoyées par les résidents)
-- Visibles uniquement par les organisateurs.
-- =============================================================
create table if not exists public.proposals (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(title) between 3 and 80),
  description  text not null default '' check (length(description) <= 1000),
  when_text    text not null default '' check (length(when_text) <= 80),
  needs        text not null default '' check (length(needs) <= 300),
  name         text not null default '' check (length(name) <= 40),
  lang         text not null default 'fr' check (lang in ('fr', 'en')),
  status       text not null default 'new' check (status in ('new', 'accepted', 'rejected')),
  device_hash  text not null,
  ip_hash      text,
  created_at   timestamptz not null default now()
);
create index if not exists proposals_device_idx on public.proposals(device_hash, created_at);
alter table public.proposals enable row level security;
drop policy if exists "proposals admin" on public.proposals;
create policy "proposals admin" on public.proposals for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.proposals from anon;

-- Erreurs : INVALID, RATE_LIMIT
create or replace function public.submit_proposal(
  p_device text, p_title text, p_description text, p_when text, p_needs text, p_name text, p_lang text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  dev_hash text;
  ip text;
  rid uuid;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{32,128}$' then raise exception 'INVALID'; end if;
  dev_hash := public.leone_hash(p_device);
  p_title := trim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  if length(p_title) not between 3 and 80 then raise exception 'INVALID'; end if;
  -- 3 propositions / 24 h par appareil, 10 / heure par connexion
  if (select count(*) from proposals where device_hash = dev_hash and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'RATE_LIMIT';
  end if;
  ip := public.leone_client_ip_hash();
  if ip is not null and (select count(*) from proposals where ip_hash = ip and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into proposals (title, description, when_text, needs, name, lang, device_hash, ip_hash)
  values (p_title,
          left(trim(coalesce(p_description, '')), 1000),
          left(trim(coalesce(p_when, '')), 80),
          left(trim(coalesce(p_needs, '')), 300),
          left(trim(coalesce(p_name, '')), 40),
          case when p_lang = 'en' then 'en' else 'fr' end,
          dev_hash, ip)
  returning id into rid;
  return jsonb_build_object('id', rid);
end;
$$;
-- ---------- Votes 👍 / 👎 sur les idées ----------
-- Un vote par appareil et par idée (empreinte du secret de l'appareil, comme pour les réponses).
create table if not exists public.proposal_votes (
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  device_hash  text not null,
  value        smallint not null check (value in (-1, 1)),
  ip_hash      text,
  created_at   timestamptz not null default now(),
  primary key (proposal_id, device_hash)
);
create index if not exists proposal_votes_ip_idx on public.proposal_votes(ip_hash, created_at);
alter table public.proposal_votes enable row level security;
drop policy if exists "proposal votes admin" on public.proposal_votes;
create policy "proposal votes admin" on public.proposal_votes for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.proposal_votes from anon;

-- Liste publique des idées déjà proposées (sans prénom ni besoins), avec les votes.
-- Les propositions refusées ou supprimées par un organisateur disparaissent.
drop function if exists public.public_proposals();
create or replace function public.public_proposals(p_device text default null)
returns table (id uuid, title text, description text, status text, created_at timestamptz,
               likes int, dislikes int, my_vote int)
language sql stable security definer set search_path = public as $$
  select p.id, p.title, left(p.description, 200), p.status, p.created_at,
    (select count(*) from proposal_votes v where v.proposal_id = p.id and v.value = 1)::int,
    (select count(*) from proposal_votes v where v.proposal_id = p.id and v.value = -1)::int,
    coalesce((select v.value from proposal_votes v where v.proposal_id = p.id
              and p_device ~ '^[0-9a-f]{32,128}$' and v.device_hash = public.leone_hash(p_device)), 0)::int
  from proposals p
  where p.status in ('new', 'accepted')
  order by (p.status = 'accepted') desc,
    ((select coalesce(sum(v.value), 0) from proposal_votes v where v.proposal_id = p.id)) desc,
    p.created_at desc
  limit 60;
$$;
revoke all on function public.public_proposals(text) from public;
grant execute on function public.public_proposals(text) to anon, authenticated;

-- Voter : 1 = 👍, -1 = 👎, 0 = retirer son vote. Erreurs : INVALID, NOT_FOUND, RATE_LIMIT
create or replace function public.vote_proposal(p_id uuid, p_device text, p_value int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  dev_hash text;
  ip text;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{32,128}$' or p_value not in (-1, 0, 1) then
    raise exception 'INVALID';
  end if;
  if not exists (select 1 from proposals where id = p_id and status in ('new', 'accepted')) then
    raise exception 'NOT_FOUND';
  end if;
  dev_hash := public.leone_hash(p_device);
  -- limite : 120 votes / 10 min depuis une même connexion
  ip := public.leone_client_ip_hash();
  if ip is not null and (select count(*) from proposal_votes
      where ip_hash = ip and created_at > now() - interval '10 minutes') >= 120 then
    raise exception 'RATE_LIMIT';
  end if;
  if p_value = 0 then
    delete from proposal_votes where proposal_id = p_id and device_hash = dev_hash;
  else
    insert into proposal_votes (proposal_id, device_hash, value, ip_hash)
    values (p_id, dev_hash, p_value, ip)
    on conflict (proposal_id, device_hash) do update set value = excluded.value, created_at = now(), ip_hash = excluded.ip_hash;
  end if;
  return jsonb_build_object(
    'likes', (select count(*) from proposal_votes where proposal_id = p_id and value = 1),
    'dislikes', (select count(*) from proposal_votes where proposal_id = p_id and value = -1),
    'my_vote', p_value);
end;
$$;
revoke all on function public.vote_proposal(uuid, text, int) from public;
grant execute on function public.vote_proposal(uuid, text, int) to anon, authenticated;

revoke all on function public.submit_proposal(text, text, text, text, text, text, text) from public;
grant execute on function public.submit_proposal(text, text, text, text, text, text, text) to anon, authenticated;

-- =============================================================
-- POT COMMUN
-- Le site n'encaisse rien lui-même : il renvoie vers la cagnotte
-- (HelloAsso, Lydia…) et affiche une comptabilité transparente
-- tenue par les organisateurs (entrées / dépenses, sans nom de donateur).
-- =============================================================
create table if not exists public.settings (
  key         text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  -- lien de cagnotte : vide ou https:// uniquement
  constraint settings_pot_url check (
    key <> 'pot' or coalesce(data->>'url', '') = '' or (data->>'url') ~ '^https://[^\s"<>]+$'
  )
);
alter table public.settings enable row level security;
drop policy if exists "settings read"  on public.settings;
drop policy if exists "settings admin" on public.settings;
create policy "settings read"  on public.settings for select using (true);
create policy "settings admin" on public.settings for all using (public.is_admin()) with check (public.is_admin());
insert into public.settings (key, data)
values ('pot', '{"url": "https://revolut.me/kvin7qt5u", "goal": 0, "description": "", "description_en": ""}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.pot_entries (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('in', 'out')),
  amount_cents  int  not null check (amount_cents > 0 and amount_cents <= 10000000),
  label         text not null check (length(label) between 1 and 120),
  label_en      text not null default '' check (length(label_en) <= 120),
  entry_date    date not null default current_date,
  event_id      text references public.events(id) on delete set null,
  created_at    timestamptz not null default now()
);
alter table public.pot_entries enable row level security;
drop policy if exists "pot read"  on public.pot_entries;
drop policy if exists "pot admin" on public.pot_entries;
create policy "pot read"  on public.pot_entries for select using (true);
create policy "pot admin" on public.pot_entries for all using (public.is_admin()) with check (public.is_admin());

-- Lien de cagnotte par défaut (Revolut de l'organisateur), seulement s'il n'y en a pas déjà un
update public.settings
   set data = jsonb_set(data, '{url}', '"https://revolut.me/kvin7qt5u"')
 where key = 'pot' and coalesce(data->>'url', '') = '';

-- =============================================================
-- TICKETS DE CAISSE (preuves d'achat)
-- Photos stockées dans le bucket public "receipts" (Supabase Storage).
-- Lecture publique (transparence), envoi / suppression : organisateurs.
-- Le site ré-encode les photos en JPEG avant l'envoi (métadonnées GPS supprimées).
-- =============================================================
alter table public.pot_entries add column if not exists receipt_path text;
alter table public.pot_entries drop constraint if exists pot_entries_receipt_path_check;
alter table public.pot_entries add constraint pot_entries_receipt_path_check
  check (receipt_path is null or receipt_path ~ '^[0-9]{4}/[0-9a-f-]{36}\.jpg$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', true, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

drop policy if exists "receipts admin insert" on storage.objects;
drop policy if exists "receipts admin update" on storage.objects;
drop policy if exists "receipts admin delete" on storage.objects;
create policy "receipts admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_admin());
create policy "receipts admin update" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.is_admin());
create policy "receipts admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_admin());

-- =============================================================
-- INVENTAIRE (frigo, tiroir, lave-vaisselle…)
-- Lecture publique, modification réservée aux organisateurs.
-- =============================================================
create table if not exists public.inventory_groups (
  id          text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name        text not null check (length(name) between 1 and 40),
  name_en     text not null default '' check (length(name_en) <= 40),
  emoji       text not null default '📦' check (length(emoji) <= 8),
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create table if not exists public.inventory_items (
  id          uuid primary key default gen_random_uuid(),
  group_id    text not null references public.inventory_groups(id) on delete cascade,
  name        text not null check (length(name) between 1 and 60),
  name_en     text not null default '' check (length(name_en) <= 60),
  qty         int  not null default 1 check (qty between 0 and 999),
  updated_at  timestamptz not null default now()
);
create index if not exists inventory_items_group_idx on public.inventory_items(group_id);
alter table public.inventory_groups enable row level security;
alter table public.inventory_items  enable row level security;
drop policy if exists "inventory groups read"  on public.inventory_groups;
drop policy if exists "inventory groups admin" on public.inventory_groups;
drop policy if exists "inventory items read"   on public.inventory_items;
drop policy if exists "inventory items admin"  on public.inventory_items;
create policy "inventory groups read"  on public.inventory_groups for select using (true);
create policy "inventory groups admin" on public.inventory_groups for all using (public.is_admin()) with check (public.is_admin());
create policy "inventory items read"   on public.inventory_items  for select using (true);
create policy "inventory items admin"  on public.inventory_items  for all using (public.is_admin()) with check (public.is_admin());

insert into public.inventory_groups (id, name, name_en, emoji, sort) values
  ('frigo', 'Frigo', 'Fridge', '🧊', 1),
  ('tiroir', 'Tiroir', 'Drawer', '🗄️', 2),
  ('lave-vaisselle', 'Lave-vaisselle', 'Dishwasher', '🍽️', 3)
on conflict (id) do nothing;

-- =============================================================
-- INFORMATIONS (messages permanents et pop-up pour les résidents)
-- Le public ne voit que les messages en cours (début passé, fin non atteinte).
-- =============================================================
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'permanent' check (kind in ('permanent', 'popup')),
  important   boolean not null default false,
  title       text not null check (length(title) between 1 and 100),
  title_en    text not null default '' check (length(title_en) <= 100),
  body        text not null default '' check (length(body) <= 2000),
  body_en     text not null default '' check (length(body_en) <= 2000),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint announcements_dates check (ends_at is null or ends_at > starts_at)
);
alter table public.announcements enable row level security;
drop policy if exists "announcements read"  on public.announcements;
drop policy if exists "announcements admin" on public.announcements;
create policy "announcements read" on public.announcements for select
  using (starts_at <= now() and (ends_at is null or ends_at > now()));
create policy "announcements admin" on public.announcements for all using (public.is_admin()) with check (public.is_admin());


-- =============================================================
-- MODE D'EMPLOI (articles rédigés par les organisateurs, avec photos)
-- Lecture publique des articles publiés ; écriture réservée aux organisateurs.
-- =============================================================
-- photos : liste de {path, caption, caption_en} ; path = image du site (img/guide/…)
-- ou photo envoyée dans le stockage « guide » (AAAA/uuid.jpg)
create or replace function public.leone_valid_photos(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 12 and coalesce((
    select bool_and(
      jsonb_typeof(e) = 'object'
      and (e->>'path') ~ '^(img/guide/[a-z0-9._-]+|[0-9]{4}/[0-9a-f-]{36}\.jpg)$'
      and length(coalesce(e->>'caption', '')) <= 200
      and length(coalesce(e->>'caption_en', '')) <= 200)
    from jsonb_array_elements(p) e), true);
$$;

create table if not exists public.guide_articles (
  id          uuid primary key default gen_random_uuid(),
  emoji       text not null default '📘' check (length(emoji) <= 8),
  title       text not null check (length(title) between 1 and 100),
  title_en    text not null default '' check (length(title_en) <= 100),
  body        text not null default '' check (length(body) <= 10000),
  body_en     text not null default '' check (length(body_en) <= 10000),
  photos      jsonb not null default '[]'::jsonb check (public.leone_valid_photos(photos)),
  sort        int  not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.guide_articles enable row level security;
drop policy if exists "guide read"  on public.guide_articles;
drop policy if exists "guide admin" on public.guide_articles;
create policy "guide read"  on public.guide_articles for select using (published);
create policy "guide admin" on public.guide_articles for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guide', 'guide', true, 3145728, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];
drop policy if exists "guide photos admin insert" on storage.objects;
drop policy if exists "guide photos admin update" on storage.objects;
drop policy if exists "guide photos admin delete" on storage.objects;
create policy "guide photos admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'guide' and public.is_admin());
create policy "guide photos admin update" on storage.objects for update to authenticated
  using (bucket_id = 'guide' and public.is_admin());
create policy "guide photos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'guide' and public.is_admin());

-- Premier article : le chauffage au sol (créé une seule fois, modifiable ensuite dans Organiser)
insert into public.guide_articles (id, emoji, title, title_en, body, body_en, photos, sort)
values ('9e1f0c2a-6b1d-4c55-9a51-0c1e5e0a7a01', '🌡️', 'Chauffage au sol : le thermostat', 'Underfloor heating: the thermostat',
  $g$Le chauffage au sol de la résidence est activé. La température se règle avec le **thermostat de ton logement**.

## La règle d'or : laisse la molette sur AUTO
En position **AUTO**, le thermostat chauffe tout seul : **confort** la journée, **économie** la nuit. Tu n'as rien d'autre à faire.

## Régler ta température de confort
1. Tourne la molette sur **☀ (Confort)**.
2. Règle la température avec les touches **+** et **−** (de 10 à 30 °C, 19 °C par défaut), puis valide.
3. Remets la molette sur **AUTO**.

## Les positions de la molette
[photo 1]
- **AUTO** : suit le programme (position normale)
- **☀ Soleil** : confort en continu
- **☾ Lune** : économie en continu
- **❄ Flocon** : hors-gel (7 °C)
- **⏻ Arrêt** : chauffage coupé (été)
- **🕓 PROG** : heure et programme réglés par le gestionnaire, **n'y touche pas**

## Lire l'écran
[photo 2]
1. **Heure**
2. **☀ Soleil** : période confort en cours. **☾ Lune** : période économie.
3. **Petite flamme** (ou « ON ») : le chauffage tourne. Éteinte ? C'est normal, la température demandée est atteinte.
4. **Barre du bas** : le programme de la journée, de 0 h à 24 h.
5. **Chiffres 1 à 7** : le jour de la semaine (1 = lundi).
6. **Boutons** : 🧳 mode absence · ⏳ température temporaire (de 30 min à 72 h) · bouton HEAT/COOL, ne pas toucher · **i** pour passer de la température de la pièce à la température demandée.

## Bon à savoir
> Le chauffage collectif est réglé à **19 °C maximum**, comme l'impose la réglementation. Mettre le thermostat plus haut ne chauffe ni plus vite ni plus fort.

Après la mise en route, la température met un peu de temps à s'installer. Si au bout de **48 heures** la température de ton logement n'a pas changé, contacte le gestionnaire de la résidence.$g$,
  $g$Underfloor heating is now on in the residence. You set the temperature with the **thermostat in your apartment**.

## The golden rule: leave the dial on AUTO
On **AUTO**, the thermostat does everything by itself: **comfort** during the day, **eco** at night. You don't need to do anything else.

## Set your comfort temperature
1. Turn the dial to **☀ (Comfort)**.
2. Set the temperature with the **+** and **−** buttons (10 to 30 °C, 19 °C by default), then confirm.
3. Turn the dial back to **AUTO**.

## Dial positions
[photo 1]
- **AUTO**: follows the schedule (normal position)
- **☀ Sun**: comfort all the time
- **☾ Moon**: eco all the time
- **❄ Snowflake**: frost protection (7 °C)
- **⏻ Off**: heating off (summer)
- **🕓 PROG**: clock and schedule set by the building manager, **please don't change**

## Reading the screen
[photo 2]
1. **Clock**
2. **☀ Sun**: comfort period. **☾ Moon**: eco period.
3. **Small flame** (or “ON”): the heating is running. Off? That's normal, the requested temperature has been reached.
4. **Bottom bar**: today's schedule, from 0 h to 24 h.
5. **Numbers 1 to 7**: day of the week (1 = Monday).
6. **Buttons**: 🧳 away mode · ⏳ temporary temperature (30 min to 72 h) · HEAT/COOL button, don't touch · **i** to switch between room temperature and requested temperature.

## Good to know
> The central heating supply is capped at **19 °C**, the maximum allowed by French regulations. Setting the thermostat higher won't heat faster or warmer.

After start-up, the temperature takes a little while to settle. If after **48 hours** your apartment's temperature hasn't changed, contact the building manager.$g$,
  $g$[{"path": "img/guide/thermostat-molette.jpg", "caption": "La molette du thermostat", "caption_en": "The thermostat dial"}, {"path": "img/guide/thermostat-ecran.jpg", "caption": "L'écran du thermostat (repères 1 à 6)", "caption_en": "The thermostat screen (markers 1 to 6)"}]$g$::jsonb, 1)
on conflict (id) do nothing;

-- =============================================================
-- ENVOIS DE PHOTOS PAR LES RÉSIDENTS (galerie, signalements, annonces)
-- Stockage public « uploads » : JPEG ré-encodé par le site, 3 Mo max,
-- noms aléatoires imprévisibles, plafond global d'envois par heure.
-- Une photo n'apparaît sur le site qu'une fois rattachée par une fonction contrôlée
-- (et, pour la galerie, validée par un organisateur).
-- =============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 3145728, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

create or replace function public.leone_upload_allowed(p_name text) returns boolean
language sql stable security definer set search_path = public, storage as $$
  select coalesce(p_name, '') ~ '^(gallery|reports|ads)/[0-9]{4}/[0-9a-f-]{36}\.jpg$'
     and (select count(*) from storage.objects
          where bucket_id = 'uploads' and created_at > now() - interval '1 hour') < 80;
$$;
create or replace function public.leone_upload_exists(p_name text) returns boolean
language sql stable security definer set search_path = public, storage as $$
  select exists (select 1 from storage.objects where bucket_id = 'uploads' and name = p_name);
$$;
drop policy if exists "uploads public insert" on storage.objects;
drop policy if exists "uploads admin delete" on storage.objects;
create policy "uploads public insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'uploads' and public.leone_upload_allowed(name));
create policy "uploads admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and public.is_admin());

-- =============================================================
-- GALERIE PHOTOS DES ÉVÉNEMENTS (validées par un organisateur)
-- =============================================================
create table if not exists public.event_photos (
  id          uuid primary key default gen_random_uuid(),
  event_id    text not null references public.events(id) on delete cascade,
  path        text not null unique check (path ~ '^gallery/[0-9]{4}/[0-9a-f-]{36}\.jpg$'),
  caption     text not null default '' check (length(caption) <= 140),
  status      text not null default 'pending' check (status in ('pending', 'approved')),
  device_hash text not null,
  ip_hash     text,
  created_at  timestamptz not null default now()
);
create index if not exists event_photos_event_idx on public.event_photos(event_id, status);
alter table public.event_photos enable row level security;
drop policy if exists "event photos admin" on public.event_photos;
create policy "event photos admin" on public.event_photos for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.event_photos from anon;

create or replace function public.public_photos(p_event_id text)
returns table (id uuid, path text, caption text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.path, p.caption, p.created_at from event_photos p
  where p.event_id = p_event_id and p.status = 'approved' order by p.created_at;
$$;

-- Erreurs : INVALID, EVENT_NOT_FOUND, NOT_STARTED, RATE_LIMIT
create or replace function public.submit_photo(p_event_id text, p_device text, p_path text, p_caption text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dev text; ev jsonb; rid uuid;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{32,128}$' then raise exception 'INVALID'; end if;
  if coalesce(p_path, '') !~ '^gallery/[0-9]{4}/[0-9a-f-]{36}\.jpg$' or not public.leone_upload_exists(p_path) then raise exception 'INVALID'; end if;
  select data into ev from events where id = p_event_id;
  if ev is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if ((ev->>'start')::timestamp at time zone 'Europe/Paris') > now() then raise exception 'NOT_STARTED'; end if;
  dev := public.leone_hash(p_device);
  if (select count(*) from event_photos where device_hash = dev and created_at > now() - interval '24 hours') >= 15 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into event_photos (event_id, path, caption, device_hash, ip_hash)
  values (p_event_id, p_path, left(trim(coalesce(p_caption, '')), 140), dev, public.leone_client_ip_hash())
  returning id into rid;
  return jsonb_build_object('id', rid);
end;
$$;

-- =============================================================
-- PETITES ANNONCES ENTRE VOISINS (publiées tout de suite, 30 jours)
-- L'auteur peut retirer son annonce depuis son appareil ; les organisateurs peuvent tout supprimer.
-- =============================================================
create table if not exists public.classifieds (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('lend', 'give', 'seek', 'help')),
  title       text not null check (length(title) between 3 and 80),
  body        text not null default '' check (length(body) <= 600),
  contact     text not null default '' check (length(contact) <= 80),
  name        text not null default '' check (length(name) <= 40),
  photo_path  text check (photo_path is null or photo_path ~ '^ads/[0-9]{4}/[0-9a-f-]{36}\.jpg$'),
  device_hash text not null,
  ip_hash     text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);
alter table public.classifieds enable row level security;
drop policy if exists "classifieds admin" on public.classifieds;
create policy "classifieds admin" on public.classifieds for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.classifieds from anon;

create or replace function public.public_classifieds(p_device text default null)
returns table (id uuid, kind text, title text, body text, contact text, name text, photo_path text,
               created_at timestamptz, expires_at timestamptz, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.title, c.body, c.contact, c.name, c.photo_path, c.created_at, c.expires_at,
         (coalesce(p_device, '') ~ '^[0-9a-f]{32,128}$' and c.device_hash = public.leone_hash(p_device))
  from classifieds c where c.expires_at > now() order by c.created_at desc limit 100;
$$;

create or replace function public.post_classified(p_device text, p_kind text, p_title text, p_body text,
                                                  p_contact text, p_name text, p_photo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dev text; ip text; rid uuid;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{32,128}$' then raise exception 'INVALID'; end if;
  if p_kind not in ('lend', 'give', 'seek', 'help') then raise exception 'INVALID'; end if;
  p_title := trim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  if length(p_title) not between 3 and 80 then raise exception 'INVALID'; end if;
  if p_photo is not null and p_photo <> '' and (p_photo !~ '^ads/[0-9]{4}/[0-9a-f-]{36}\.jpg$' or not public.leone_upload_exists(p_photo)) then
    raise exception 'INVALID';
  end if;
  dev := public.leone_hash(p_device);
  if (select count(*) from classifieds where device_hash = dev and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'RATE_LIMIT';
  end if;
  ip := public.leone_client_ip_hash();
  if ip is not null and (select count(*) from classifieds where ip_hash = ip and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into classifieds (kind, title, body, contact, name, photo_path, device_hash, ip_hash)
  values (p_kind, p_title, left(trim(coalesce(p_body, '')), 600), left(trim(coalesce(p_contact, '')), 80),
          left(trim(coalesce(p_name, '')), 40), nullif(p_photo, ''), dev, ip)
  returning id into rid;
  return jsonb_build_object('id', rid);
end;
$$;

create or replace function public.remove_classified(p_id uuid, p_device text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_device is null or p_device !~ '^[0-9a-f]{32,128}$' then raise exception 'INVALID'; end if;
  delete from classifieds where id = p_id and device_hash = public.leone_hash(p_device);
  if not found then raise exception 'NOT_FOUND'; end if;
  return true;
end;
$$;

-- =============================================================
-- SIGNALEMENTS DE PROBLÈMES (suivi public, sans nom)
-- =============================================================
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('electricity', 'water', 'heating', 'elevator', 'cleanliness', 'security', 'other')),
  location    text not null default '' check (length(location) <= 80),
  body        text not null check (length(body) between 5 and 800),
  name        text not null default '' check (length(name) <= 40),
  photo_path  text check (photo_path is null or photo_path ~ '^reports/[0-9]{4}/[0-9a-f-]{36}\.jpg$'),
  status      text not null default 'new' check (status in ('new', 'forwarded', 'fixed')),
  admin_note  text not null default '' check (length(admin_note) <= 300),
  hidden      boolean not null default false,
  device_hash text not null,
  ip_hash     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "reports admin" on public.reports;
create policy "reports admin" on public.reports for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.reports from anon;

-- Liste publique : ni nom ni empreinte ; les problèmes réparés restent visibles 14 jours
create or replace function public.public_reports()
returns table (id uuid, category text, location text, body text, photo_path text, status text,
               admin_note text, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.category, r.location, r.body, r.photo_path, r.status, r.admin_note, r.created_at, r.updated_at
  from reports r
  where not r.hidden and (r.status <> 'fixed' or r.updated_at > now() - interval '14 days')
  order by (r.status = 'fixed'), r.created_at desc limit 100;
$$;

create or replace function public.submit_report(p_device text, p_category text, p_location text, p_body text,
                                                p_name text, p_photo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dev text; ip text; rid uuid;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{32,128}$' then raise exception 'INVALID'; end if;
  if p_category not in ('electricity', 'water', 'heating', 'elevator', 'cleanliness', 'security', 'other') then raise exception 'INVALID'; end if;
  p_body := trim(coalesce(p_body, ''));
  if length(p_body) not between 5 and 800 then raise exception 'INVALID'; end if;
  if p_photo is not null and p_photo <> '' and (p_photo !~ '^reports/[0-9]{4}/[0-9a-f-]{36}\.jpg$' or not public.leone_upload_exists(p_photo)) then
    raise exception 'INVALID';
  end if;
  dev := public.leone_hash(p_device);
  if (select count(*) from reports where device_hash = dev and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'RATE_LIMIT';
  end if;
  ip := public.leone_client_ip_hash();
  if ip is not null and (select count(*) from reports where ip_hash = ip and created_at > now() - interval '1 hour') >= 15 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into reports (category, location, body, name, photo_path, device_hash, ip_hash)
  values (p_category, left(trim(coalesce(p_location, '')), 80), p_body, left(trim(coalesce(p_name, '')), 40), nullif(p_photo, ''), dev, ip)
  returning id into rid;
  return jsonb_build_object('id', rid);
end;
$$;

-- =============================================================
-- SONDAGES (créés par les organisateurs, un vote par appareil)
-- =============================================================
create or replace function public.leone_valid_poll_options(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 2 and 8 and coalesce((
    select bool_and(jsonb_typeof(e) = 'object' and (e->>'id') ~ '^[a-z0-9]{1,12}$'
                    and length(coalesce(e->>'label', '')) between 1 and 80 and length(coalesce(e->>'label_en', '')) <= 80)
    from jsonb_array_elements(p) e), false);
$$;
create table if not exists public.polls (
  id          uuid primary key default gen_random_uuid(),
  question    text not null check (length(question) between 3 and 160),
  question_en text not null default '' check (length(question_en) <= 160),
  options     jsonb not null check (public.leone_valid_poll_options(options)),
  ends_at     timestamptz,
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);
create table if not exists public.poll_votes (
  poll_id     uuid not null references public.polls(id) on delete cascade,
  device_hash text not null,
  option_id   text not null,
  ip_hash     text,
  created_at  timestamptz not null default now(),
  primary key (poll_id, device_hash)
);
create index if not exists poll_votes_ip_idx on public.poll_votes(ip_hash, created_at);
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
drop policy if exists "polls admin" on public.polls;
drop policy if exists "poll votes admin" on public.poll_votes;
create policy "polls admin" on public.polls for all using (public.is_admin()) with check (public.is_admin());
create policy "poll votes admin" on public.poll_votes for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.polls from anon;
revoke all on public.poll_votes from anon;

create or replace function public.public_polls(p_device text default null)
returns table (id uuid, question text, question_en text, options jsonb, ends_at timestamptz, created_at timestamptz,
               counts jsonb, total int, my_choice text)
language sql stable security definer set search_path = public as $$
  select p.id, p.question, p.question_en, p.options, p.ends_at, p.created_at,
    coalesce((select jsonb_object_agg(option_id, n) from (select option_id, count(*) n from poll_votes v where v.poll_id = p.id group by option_id) s), '{}'::jsonb),
    (select count(*) from poll_votes v where v.poll_id = p.id)::int,
    (select v.option_id from poll_votes v where v.poll_id = p.id
       and coalesce(p_device, '') ~ '^[0-9a-f]{32,128}$' and v.device_hash = public.leone_hash(p_device))
  from polls p where p.published
  order by (p.ends_at is not null and p.ends_at < now()), p.created_at desc limit 30;
$$;

-- Voter (p_option vide = retirer son vote). Erreurs : INVALID, NOT_FOUND, CLOSED, RATE_LIMIT
create or replace function public.vote_poll(p_id uuid, p_device text, p_option text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pl polls%rowtype; dev text; ip text;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{32,128}$' then raise exception 'INVALID'; end if;
  select * into pl from polls where id = p_id and published;
  if pl.id is null then raise exception 'NOT_FOUND'; end if;
  if pl.ends_at is not null and pl.ends_at < now() then raise exception 'CLOSED'; end if;
  dev := public.leone_hash(p_device);
  if coalesce(p_option, '') = '' then
    delete from poll_votes where poll_id = p_id and device_hash = dev;
  else
    if not exists (select 1 from jsonb_array_elements(pl.options) e where e->>'id' = p_option) then raise exception 'INVALID'; end if;
    ip := public.leone_client_ip_hash();
    if ip is not null and (select count(*) from poll_votes where ip_hash = ip and created_at > now() - interval '10 minutes') >= 120 then
      raise exception 'RATE_LIMIT';
    end if;
    insert into poll_votes (poll_id, device_hash, option_id, ip_hash) values (p_id, dev, p_option, ip)
    on conflict (poll_id, device_hash) do update set option_id = excluded.option_id, created_at = now();
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================
-- NOTIFICATIONS (appli installée sur Android / iPhone)
-- Abonnements enregistrés par le site ; envoi par la fonction Supabase « notify »
-- (supabase/functions/notify), réservée aux organisateurs.
-- =============================================================
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  p256dh      text not null check (length(p256dh) between 20 and 200),
  auth        text not null check (length(auth) between 8 and 100),
  lang        text not null default 'fr' check (length(lang) <= 10),
  device_hash text not null,
  created_at  timestamptz not null default now()
);
-- adresse d'abonnement : https uniquement, 800 caractères max
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_check;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_check
  check (endpoint ~ '^https://[^\s"<>]+$' and length(endpoint) between 20 and 800);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push admin" on public.push_subscriptions;
create policy "push admin" on public.push_subscriptions for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.push_subscriptions from anon;

create or replace function public.push_subscribe(p_device text, p_endpoint text, p_p256dh text, p_auth text, p_lang text)
returns boolean language plpgsql security definer set search_path = public as $$
declare dev text;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{32,128}$' then raise exception 'INVALID'; end if;
  dev := public.leone_hash(p_device);
  if (select count(*) from push_subscriptions where device_hash = dev) >= 5 then
    delete from push_subscriptions where endpoint in (select endpoint from push_subscriptions where device_hash = dev order by created_at limit 1);
  end if;
  insert into push_subscriptions (endpoint, p256dh, auth, lang, device_hash)
  values (p_endpoint, p_p256dh, p_auth, left(coalesce(p_lang, 'fr'), 10), dev)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, device_hash = excluded.device_hash;
  return true;
end;
$$;
create or replace function public.push_unsubscribe(p_endpoint text)
returns boolean language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint returning true;
$$;

-- clé publique des notifications (générée dans Organiser → Tableau de bord)
insert into public.settings (key, data) values ('push', '{"vapidPublic": ""}'::jsonb) on conflict (key) do nothing;

-- =============================================================
-- RGPD : effacement par le résident + durées de conservation
-- =============================================================
-- Le résident efface lui-même sa réponse, depuis l'appareil qui l'a envoyée.
create or replace function public.delete_my_response(p_event_id text, p_device text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_device is null or p_device !~ '^[0-9a-f]{32,128}$' then raise exception 'INVALID'; end if;
  delete from responses where event_id = p_event_id and device_hash = public.leone_hash(p_device);
  return found;
end;
$$;

-- Effacement des données arrivées au bout de leur durée de conservation
-- (lancé automatiquement, une fois par jour, quand un organisateur ouvre le tableau de bord) :
--   réponses aux événements : 6 mois après l'événement ; idées : 12 mois ;
--   votes de sondage : 12 mois après la fin du sondage ; annonces : 30 jours après expiration ;
--   signalements : formulaire supprimé (renvoi vers le support Colonies) → effacés.
-- Renvoie aussi les photos à supprimer du stockage (le site les efface ensuite).
create or replace function public.admin_purge()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_resp int; n_prop int; n_votes int; n_ads int; n_rep int; p jsonb; paths jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'AUTH'; end if;
  delete from responses r using events e
   where r.event_id = e.id
     and (coalesce(nullif(e.data->>'end', ''), e.data->>'start')::timestamp at time zone 'Europe/Paris') < now() - interval '6 months';
  get diagnostics n_resp = row_count;
  delete from proposals where created_at < now() - interval '12 months';
  get diagnostics n_prop = row_count;
  delete from poll_votes v using polls pl
   where v.poll_id = pl.id and coalesce(pl.ends_at, pl.created_at) < now() - interval '12 months';
  get diagnostics n_votes = row_count;
  with d as (delete from classifieds where expires_at < now() - interval '30 days' returning photo_path)
  select count(*), coalesce(jsonb_agg(photo_path) filter (where photo_path is not null), '[]'::jsonb) into n_ads, p from d;
  paths := paths || p;
  with d as (delete from reports returning photo_path)
  select count(*), coalesce(jsonb_agg(photo_path) filter (where photo_path is not null), '[]'::jsonb) into n_rep, p from d;
  paths := paths || p;
  return jsonb_build_object('responses', n_resp, 'proposals', n_prop, 'pollVotes', n_votes, 'ads', n_ads, 'reports', n_rep, 'paths', paths);
end;
$$;
revoke all on function public.admin_purge() from public;
grant execute on function public.admin_purge() to authenticated;

-- ---------- Droits des fonctions publiques ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public_photos(text)', 'submit_photo(text, text, text, text)',
    'public_classifieds(text)', 'post_classified(text, text, text, text, text, text, text)', 'remove_classified(uuid, text)',
    'public_polls(text)', 'vote_poll(uuid, text, text)',
    'push_subscribe(text, text, text, text, text)', 'push_unsubscribe(text)',
    'delete_my_response(text, text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- Signalements : formulaire retiré (les résidents sont renvoyés vers le support Colonies)
revoke all on function public.submit_report(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.public_reports() from public, anon, authenticated;

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
