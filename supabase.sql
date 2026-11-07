-- =============================================================
-- LEONE — schéma Supabase
-- À coller dans Supabase > SQL Editor > New query > Run
-- =============================================================

create table if not exists public.events (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.responses (
  id          text primary key,
  event_id    text not null references public.events(id) on delete cascade,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists responses_event_idx on public.responses(event_id);

alter table public.events    enable row level security;
alter table public.responses enable row level security;

-- Lecture publique : tout le monde voit les événements et les réponses
drop policy if exists "events read"    on public.events;
drop policy if exists "responses read" on public.responses;
create policy "events read"    on public.events    for select using (true);
create policy "responses read" on public.responses for select using (true);

-- Tout le monde peut répondre à un événement
drop policy if exists "responses insert" on public.responses;
create policy "responses insert" on public.responses for insert with check (true);

-- ⚠ TEMPORAIRE (avant la phase modération) :
-- la gestion des événements est ouverte à la clé anon, protégée
-- seulement par le code PIN côté site. À remplacer par une vraie
-- authentification (Supabase Auth) lors de la mise en place de la modération.
drop policy if exists "events write"       on public.events;
drop policy if exists "events update"      on public.events;
drop policy if exists "events delete"      on public.events;
drop policy if exists "responses delete"   on public.responses;
create policy "events write"     on public.events    for insert with check (true);
create policy "events update"    on public.events    for update using (true);
create policy "events delete"    on public.events    for delete using (true);
create policy "responses delete" on public.responses for delete using (true);

-- -------------------------------------------------------------
-- Exemple : match de l'Équipe de France, jeudi 12 novembre 2026
-- -------------------------------------------------------------
insert into public.events (id, data) values (
  'match-france',
  $json${
    "title": "Match de l'Équipe de France",
    "title_en": "France national team match",
    "category_en": "Match",
    "location_en": "Common room · residence ground floor",
    "description_en": "Les Bleus are playing on Thursday night and we're watching it all together on the big screen! Meet 30 minutes before kick-off (8:45 pm) to settle in. Jerseys, flags and blue-white-red face paint strongly encouraged. 🇫🇷\n\nHow it works: everyone brings a little something from the list so nobody pays for everything.",
    "emoji": "⚽",
    "category": "Match",
    "theme": "tricolore",
    "start": "2026-11-12T20:15",
    "end": "2026-11-12T23:00",
    "location": "Salle commune · RDC de la résidence",
    "description": "Les Bleus jouent jeudi soir et on le regarde tous ensemble sur grand écran ! Rendez-vous 30 minutes avant le coup d'envoi (20h45) pour s'installer. Maillots, drapeaux et maquillage bleu-blanc-rouge fortement encouragés. 🇫🇷\n\nLe principe : chacun ramène un petit quelque chose de la liste pour que personne ne paie tout.",
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
      {"id": "prono", "label": "Ton pronostic (score final) ?", "label_en": "Your prediction (final score)?", "type": "text", "options": []},
      {"id": "place", "label": "Tu préfères être…", "label_en": "You'd rather be…", "type": "choice", "options": ["Devant, au plus près de l'écran", "Au fond, tranquille", "Peu importe"], "options_en": ["Up front, close to the screen", "At the back, chilling", "Don't mind"]}
    ],
    "createdAt": "2026-11-07T12:00:00Z"
  }$json$::jsonb
) on conflict (id) do nothing;
