/*
 * Couche de données LEONE
 * - Mode Supabase (partagé) si js/config.js est rempli
 * - Sinon mode démo (localStorage du navigateur)
 *
 * Modèle :
 *   event    = { id, title, emoji, category, theme, start, end, location,
 *                description, capacity, allowGuests, items:[{id,label,emoji,needed}],
 *                questions:[{id,label,type:'text'|'choice',options:[]}], createdAt }
 *   response = { id, eventId, name, apartment, status:'yes'|'maybe'|'no', guests,
 *                items:{[itemId]:qty}, other, answers:{[questionId]:value},
 *                message, createdAt }
 */
(function () {
  const cfg = window.LEONE_CONFIG || {};
  const REMOTE = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const LS_EVENTS = "leone.events.v1";
  const LS_RESP = "leone.responses.v1";

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  /* ---------- Exemple : match de l'équipe de France (jeudi prochain) ---------- */
  function nextThursday() {
    const d = new Date();
    const day = d.getDay(); // 0 = dimanche, 4 = jeudi
    let diff = (4 - day + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    return d;
  }
  function at(date, h, m) {
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    // format local "YYYY-MM-DDTHH:mm" (pas d'UTC pour éviter les décalages)
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function seedEvents() {
    const thu = nextThursday();
    return [
      {
        id: "match-france",
        title: "Match de l'Équipe de France",
        emoji: "⚽",
        category: "Match",
        theme: "tricolore",
        start: at(thu, 20, 15),
        end: at(thu, 23, 0),
        location: "Salle commune · RDC de la résidence",
        description:
          "Les Bleus jouent jeudi soir et on le regarde tous ensemble sur grand écran ! " +
          "Rendez-vous 30 minutes avant le coup d'envoi (20h45) pour s'installer. " +
          "Maillots, drapeaux et maquillage bleu-blanc-rouge fortement encouragés. 🇫🇷\n\n" +
          "Le principe : chacun ramène un petit quelque chose de la liste pour que personne ne paie tout.",
        capacity: 40,
        allowGuests: true,
        items: [
          { id: "chips", emoji: "🥨", label: "Chips & biscuits apéro (paquet)", needed: 6 },
          { id: "pizza", emoji: "🍕", label: "Pizzas", needed: 5 },
          { id: "softs", emoji: "🥤", label: "Softs (bouteille 1,5 L)", needed: 6 },
          { id: "bieres", emoji: "🍺", label: "Bières (pack)", needed: 4 },
          { id: "dessert", emoji: "🍰", label: "Dessert / gâteau", needed: 2 },
          { id: "gobelets", emoji: "🥤", label: "Gobelets, assiettes & serviettes", needed: 2 },
          { id: "chaises", emoji: "🪑", label: "Chaise pliante", needed: 8 },
          { id: "enceinte", emoji: "🔊", label: "Enceinte Bluetooth", needed: 1 },
          { id: "multiprise", emoji: "🔌", label: "Multiprise / rallonge", needed: 2 },
          { id: "deco", emoji: "🇫🇷", label: "Drapeaux & maquillage tricolore", needed: 3 }
        ],
        questions: [
          { id: "prono", label: "Ton pronostic (score final) ?", type: "text", options: [] },
          {
            id: "place",
            label: "Tu préfères être…",
            type: "choice",
            options: ["Devant, au plus près de l'écran", "Au fond, tranquille", "Peu importe"]
          }
        ],
        createdAt: new Date().toISOString()
      }
    ];
  }

  /* ---------- Local (démo) ---------- */
  const local = {
    read(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    write(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* stockage indisponible */ }
    },
    events() {
      let evs = this.read(LS_EVENTS, null);
      if (!evs) {
        evs = seedEvents();
        this.write(LS_EVENTS, evs);
      }
      return evs;
    },
    responses() { return this.read(LS_RESP, []); }
  };

  /* ---------- Supabase (REST, sans SDK) ---------- */
  async function sb(path, opts = {}) {
    const res = await fetch(`${cfg.supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${cfg.supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(opts.headers || {})
      }
    });
    if (!res.ok) throw new Error(`Supabase ${res.status} : ${await res.text()}`);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }
  const rowToEvent = (r) => ({ ...r.data, id: r.id });
  const rowToResp = (r) => ({ ...r.data, id: r.id, eventId: r.event_id });

  /* ---------- API publique ---------- */
  const Store = {
    remote: REMOTE,

    async listEvents() {
      if (!REMOTE) return local.events();
      const rows = await sb("events?select=id,data&order=created_at.asc");
      return rows.map(rowToEvent);
    },

    async getEvent(id) {
      if (!REMOTE) return local.events().find((e) => e.id === id) || null;
      const rows = await sb(`events?select=id,data&id=eq.${encodeURIComponent(id)}`);
      return rows[0] ? rowToEvent(rows[0]) : null;
    },

    async saveEvent(ev) {
      const isNew = !ev.id;
      const event = { ...ev, id: ev.id || uid(), createdAt: ev.createdAt || new Date().toISOString() };
      if (!REMOTE) {
        const evs = local.events();
        const i = evs.findIndex((e) => e.id === event.id);
        if (i >= 0) evs[i] = event; else evs.push(event);
        local.write(LS_EVENTS, evs);
        return event;
      }
      const { id, ...data } = event;
      if (isNew) await sb("events", { method: "POST", body: JSON.stringify({ id, data }) });
      else await sb(`events?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ data }) });
      return event;
    },

    async deleteEvent(id) {
      if (!REMOTE) {
        local.write(LS_EVENTS, local.events().filter((e) => e.id !== id));
        local.write(LS_RESP, local.responses().filter((r) => r.eventId !== id));
        return;
      }
      await sb(`events?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    async listResponses(eventId) {
      if (!REMOTE) {
        const all = local.responses();
        return eventId ? all.filter((r) => r.eventId === eventId) : all;
      }
      const filter = eventId ? `&event_id=eq.${encodeURIComponent(eventId)}` : "";
      const rows = await sb(`responses?select=id,event_id,data&order=created_at.asc${filter}`);
      return rows.map(rowToResp);
    },

    async addResponse(resp) {
      const r = { ...resp, id: uid(), createdAt: new Date().toISOString() };
      if (!REMOTE) {
        const all = local.responses();
        all.push(r);
        local.write(LS_RESP, all);
        return r;
      }
      const { id, eventId, ...data } = r;
      await sb("responses", { method: "POST", body: JSON.stringify({ id, event_id: eventId, data }) });
      return r;
    },

    async deleteResponse(id) {
      if (!REMOTE) {
        local.write(LS_RESP, local.responses().filter((r) => r.id !== id));
        return;
      }
      await sb(`responses?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    resetDemo() {
      if (REMOTE) return;
      local.write(LS_EVENTS, seedEvents());
      local.write(LS_RESP, []);
    },

    uid
  };

  window.Store = Store;
})();
