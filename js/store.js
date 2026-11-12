/*
 * Couche de données LEONE
 * - Mode Supabase (partagé, sécurisé) si js/config.js est rempli
 * - Sinon mode démo (localStorage du navigateur), qui applique les mêmes règles
 *
 * Erreurs possibles (err.code) : INVALID, EVENT_NOT_FOUND, EVENT_CLOSED,
 * ALREADY_ANSWERED, NAME_TAKEN, FULL, RATE_LIMIT, NOT_FOUND, AUTH, NETWORK
 */
(function () {
  const cfg = window.LEONE_CONFIG || {};
  const REMOTE = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const BASE = REMOTE ? cfg.supabaseUrl.replace(/\/+$/, "").replace(/\/rest\/v1$/, "") : "";
  const LS_EVENTS = "leone.events.v3";
  const LS_RESP = "leone.responses.v3";
  const LS_DEVICE = "leone.device";
  const LS_PROPOSALS = "leone.proposals.v1";
  const LS_VOTES = "leone.votes.v1";
  const LS_GUIDE = "leone.guide.v1";
  const LS_PHOTOS = "leone.photos.v1";
  const LS_ADS = "leone.ads.v1";
  const LS_REPORTS = "leone.reports.v1";
  const LS_POLLS = "leone.polls.v1";
  const LS_POLL_VOTES = "leone.pollVotes.v1";
  const LS_PUSH = "leone.push.v1";
  const LS_PUSH_SUB = "leone.pushSub.v1";
  const isClosed = (p) => Boolean(p.endsAt && new Date(p.endsAt) < new Date());
  const LS_POT = "leone.pot.v1";
  const LS_POT_ENTRIES = "leone.potEntries.v1";
  const LS_INV_GROUPS = "leone.invGroups.v1";
  const LS_INV_ITEMS = "leone.invItems.v1";
  const LS_ANNOUNCE = "leone.announcements.v1";
  const DEFAULT_GROUPS = [
    { id: "frigo", name: "Frigo", name_en: "Fridge", emoji: "🧊", sort: 1 },
    { id: "tiroir", name: "Tiroir", name_en: "Drawer", emoji: "🗄️", sort: 2 },
    { id: "lave-vaisselle", name: "Lave-vaisselle", name_en: "Dishwasher", emoji: "🍽️", sort: 3 }
  ];
  const hashLocal = (s) => s.slice(0, 16); // mode démo : pas besoin d'empreinte réelle
  const SS_SESSION = "leone.session";

  const fail = (code) => Object.assign(new Error(code), { code });
  const uid = () =>
    crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

  /* ---------- Identifiant secret de l'appareil (anti-doublon) ---------- */
  let memDevice = null;
  function device() {
    try {
      let d = localStorage.getItem(LS_DEVICE);
      if (!/^[0-9a-f]{64}$/.test(d || "")) {
        d = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(LS_DEVICE, d);
      }
      return d;
    } catch (e) {
      if (!memDevice) memDevice = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
      return memDevice;
    }
  }

  /* ---------- Règles communes ---------- */
  const nameKey = (s) =>
    String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const eventEnd = (ev) => {
    const end = ev.end ? new Date(ev.end) : new Date(new Date(ev.start).getTime() + 3 * 3600e3);
    return end;
  };

  /* ---------- Exemple : match de l'équipe de France (jeudi prochain) ---------- */
  function nextThursday() {
    const d = new Date();
    let diff = (4 - d.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    return d;
  }
  function at(date, h, m) {
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function seedEvents() {
    const thu = nextThursday();
    return [{
      id: "match-france",
      title: "Match de l'Équipe de France",
      title_en: "France national team match",
      emoji: "⚽",
      category: "Match",
      category_en: "Match",
      theme: "tricolore",
      start: at(thu, 20, 15),
      end: at(thu, 23, 0),
      location: "Salle commune · RDC",
      location_en: "Common room · ground floor",
      description: "On regarde les Bleus tous ensemble sur grand écran. Rendez-vous 30 min avant le coup d'envoi (20h45).\n\nChacun ramène un petit quelque chose de la liste.",
      description_en: "We're watching Les Bleus together on the big screen. Meet 30 min before kick-off (8:45 pm).\n\nEveryone brings a little something from the list.",
      capacity: 40,
      allowGuests: true,
      items: [
        { id: "chips", emoji: "🥨", label: "Chips & biscuits apéro (paquet)", label_en: "Chips & snacks (bag)", needed: 6 },
        { id: "pizza", emoji: "🍕", label: "Pizzas", label_en: "Pizzas", needed: 5 },
        { id: "softs", emoji: "🥤", label: "Softs (bouteille 1,5 L)", label_en: "Soft drinks (1.5 L bottle)", needed: 6 },
        { id: "bieres", emoji: "🍺", label: "Bières (pack)", label_en: "Beer (pack)", needed: 4 },
        { id: "dessert", emoji: "🍰", label: "Dessert / gâteau", label_en: "Dessert / cake", needed: 2 },
        { id: "gobelets", emoji: "🥤", label: "Gobelets, assiettes & serviettes", label_en: "Cups, plates & napkins", needed: 2 },
        { id: "chaises", emoji: "🪑", label: "Chaise pliante", label_en: "Folding chair", needed: 8 },
        { id: "enceinte", emoji: "🔊", label: "Enceinte Bluetooth", label_en: "Bluetooth speaker", needed: 1 },
        { id: "multiprise", emoji: "🔌", label: "Multiprise / rallonge", label_en: "Power strip / extension cord", needed: 2 },
        { id: "deco", emoji: "🇫🇷", label: "Drapeaux & maquillage tricolore", label_en: "Flags & tricolour face paint", needed: 3 }
      ],
      questions: [
        { id: "prono", label: "Ton pronostic (score final) ?", label_en: "Your prediction (final score)?", type: "text", options: [], options_en: [] }
      ],
      createdAt: new Date().toISOString()
    }];
  }

  /* ---------- Local (démo) ---------- */
  const local = {
    read(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
    },
    write(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* stockage indisponible */ }
    },
    events() {
      let evs = this.read(LS_EVENTS, null);
      if (!evs) { evs = seedEvents(); this.write(LS_EVENTS, evs); }
      return evs;
    },
    responses() { return this.read(LS_RESP, []); }
  };

  function localStats(ev, all) {
    const rs = all.filter((r) => r.eventId === ev.id);
    const brought = {};
    rs.filter((r) => r.status !== "no").forEach((r) =>
      Object.entries(r.items || {}).forEach(([k, q]) => (brought[k] = (brought[k] || 0) + q)));
    return {
      headcount: rs.filter((r) => r.status === "yes").reduce((n, r) => n + 1 + r.guests, 0),
      replies: rs.length,
      brought,
      attendees: rs.slice().reverse().map((r) => ({
        name: r.showName ? r.name : null, status: r.status, guests: r.guests,
        items: r.status === "no" ? {} : r.items, other: r.status === "no" ? "" : r.other
      }))
    };
  }

  /** Mêmes validations que la fonction SQL submit_response. */
  function localSubmit(p, isUpdate) {
    const ev = local.events().find((e) => e.id === p.eventId);
    if (!ev) throw fail("EVENT_NOT_FOUND");
    if (eventEnd(ev) < new Date()) throw fail("EVENT_CLOSED");
    const name = String(p.name || "").replace(/\s+/g, " ").trim();
    const key = nameKey(name);
    if (!name || name.length > 40 || !key) throw fail("INVALID");
    if (!["yes", "maybe", "no"].includes(p.status)) throw fail("INVALID");
    let guests = Number(p.guests) || 0;
    if (guests < 0 || guests > 10) throw fail("INVALID");
    if (!ev.allowGuests || p.status === "no") guests = 0;
    const items = {};
    if (p.status !== "no") {
      for (const [k, q] of Object.entries(p.items || {})) {
        if (!(ev.items || []).some((i) => i.id === k) || !Number.isInteger(q) || q < 0 || q > 20) throw fail("INVALID");
        if (q > 0) items[k] = q;
      }
    }
    const answers = {};
    for (const [k, v] of Object.entries(p.answers || {})) {
      if ((ev.questions || []).some((q) => q.id === k) && String(v).trim()) answers[k] = String(v).trim().slice(0, 200);
    }

    const all = local.responses();
    const dev = device();
    const mine = all.find((r) => r.eventId === ev.id && r.device === dev);
    if (isUpdate && !mine) throw fail("NOT_FOUND");
    if (!isUpdate && mine) throw fail("ALREADY_ANSWERED");
    if (all.some((r) => r.eventId === ev.id && r.nameKey === key && r !== mine)) throw fail("NAME_TAKEN");
    if (ev.capacity > 0 && p.status === "yes") {
      const taken = all.filter((r) => r.eventId === ev.id && r.status === "yes" && r !== mine)
        .reduce((n, r) => n + 1 + r.guests, 0);
      if (taken + 1 + guests > ev.capacity) throw fail("FULL");
    }
    const now = new Date().toISOString();
    const row = {
      ...(mine || { id: uid(), eventId: ev.id, device: dev, createdAt: now }),
      name, nameKey: key, showName: Boolean(p.showName), status: p.status, guests, items,
      other: p.status === "no" ? "" : String(p.other || "").trim().slice(0, 120),
      answers, message: String(p.message || "").trim().slice(0, 300), lang: p.lang === "en" ? "en" : "fr",
      updatedAt: now
    };
    if (mine) all[all.indexOf(mine)] = row; else all.push(row);
    local.write(LS_RESP, all);
    return { id: row.id };
  }
  const publicMine = (r) => r && ({
    id: r.id, eventId: r.eventId, name: r.name, showName: r.showName, status: r.status, guests: r.guests,
    items: r.items, other: r.other, answers: r.answers, message: r.message, createdAt: r.createdAt, updatedAt: r.updatedAt
  });

  /* ---------- Supabase (REST, sans SDK) ---------- */
  function readSession() { try { return JSON.parse(sessionStorage.getItem(SS_SESSION) || "null"); } catch (e) { return null; } }
  function writeSession(s) { try { s ? sessionStorage.setItem(SS_SESSION, JSON.stringify(s)) : sessionStorage.removeItem(SS_SESSION); } catch (e) { /* ignore */ } }

  async function authFetch(path, body) {
    let res;
    try {
      res = await fetch(`${BASE}/auth/v1/${path}`, {
        method: "POST",
        headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (e) { throw fail("NETWORK"); }
    if (!res.ok) throw fail("AUTH");
    const j = await res.json();
    const s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, email: j.user && j.user.email };
    writeSession(s);
    return s;
  }
  async function token() {
    let s = readSession();
    if (!s) return null;
    if (s.expires_at - Date.now() < 60e3) {
      try { s = await authFetch("token?grant_type=refresh_token", { refresh_token: s.refresh_token }); }
      catch (e) { writeSession(null); return null; }
    }
    return s.access_token;
  }

  async function sb(path, opts = {}, asUser = false) {
    const bearer = (asUser && (await token())) || cfg.supabaseAnonKey;
    let res;
    try {
      res = await fetch(`${BASE}/rest/v1/${path}`, {
        ...opts,
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...(opts.headers || {})
        }
      });
    } catch (e) { throw fail("NETWORK"); }
    const txt = await res.text();
    if (!res.ok) {
      let msg = "", code = "";
      try { const j = JSON.parse(txt); msg = j.message || ""; code = j.code || ""; } catch (e) { /* ignore */ }
      const known = ["INVALID", "EVENT_NOT_FOUND", "EVENT_CLOSED", "ALREADY_ANSWERED", "NAME_TAKEN", "FULL", "NOT_STARTED", "CLOSED", "RATE_LIMIT", "NOT_FOUND"];
      if (known.includes(msg)) throw fail(msg);
      // table ou fonction absente : supabase.sql n'a pas été relancé après une mise à jour du site
      if (["PGRST205", "PGRST202", "42P01", "42883"].includes(code) || res.status === 404 || /could not find|does not exist/i.test(msg)) {
        console.warn("LEONE : base de données à mettre à jour (relancer supabase.sql) —", code, msg);
        throw fail("DB_OUTDATED");
      }
      if (res.status === 401 || res.status === 403) throw fail("AUTH");
      throw fail("INVALID");
    }
    return txt ? JSON.parse(txt) : null;
  }
  const rpc = (fn, args, asUser) => sb(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }, asUser);
  const rowToEvent = (r) => ({ ...r.data, id: r.id });
  const rowToResp = (r) => ({
    id: r.id, eventId: r.event_id, name: r.name, showName: r.show_name, status: r.status, guests: r.guests,
    items: r.items, other: r.other, answers: r.answers, message: r.message, lang: r.lang,
    createdAt: r.created_at, updatedAt: r.updated_at
  });

  /* ---------- API publique ---------- */
  const Store = {
    remote: REMOTE,

    async listEvents() {
      if (!REMOTE) return local.events();
      return (await sb("events?select=id,data&order=created_at.asc")).map(rowToEvent);
    },

    async getEvent(id) {
      if (!REMOTE) return local.events().find((e) => e.id === id) || null;
      const rows = await sb(`events?select=id,data&id=eq.${encodeURIComponent(id)}`);
      return rows[0] ? rowToEvent(rows[0]) : null;
    },

    /** Résumé public : { [eventId]: { headcount, replies, brought, attendees } } */
    async stats(eventId) {
      if (!REMOTE) {
        const all = local.responses(), out = {};
        local.events().filter((e) => !eventId || e.id === eventId).forEach((e) => (out[e.id] = localStats(e, all)));
        return out;
      }
      const rows = await rpc("public_event_stats", { p_event_id: eventId || null });
      const out = {};
      rows.forEach((r) => (out[r.event_id] = { headcount: r.headcount, replies: r.replies, brought: r.brought || {}, attendees: r.attendees || [] }));
      return out;
    },

    /** La réponse déjà envoyée depuis cet appareil (ou null). */
    async myResponse(eventId) {
      if (!REMOTE) return publicMine(local.responses().find((r) => r.eventId === eventId && r.device === device())) || null;
      return (await rpc("my_response", { p_event_id: eventId, p_device: device() })) || null;
    },

    async submitResponse(p, isUpdate = false) {
      if (!REMOTE) return localSubmit(p, isUpdate);
      return rpc("submit_response", {
        p_event_id: p.eventId, p_device: device(), p_name: p.name, p_show_name: Boolean(p.showName),
        p_status: p.status, p_guests: p.guests, p_items: p.items, p_other: p.other,
        p_answers: p.answers, p_message: p.message, p_lang: p.lang, p_update: isUpdate
      });
    },

    /* ----- Organisateurs ----- */
    authMode: REMOTE ? "account" : "pin",

    async login(email, password) {
      if (!REMOTE) {
        if (password !== String(cfg.demoPin || "")) throw fail("AUTH");
        writeSession({ demo: true, expires_at: Date.now() + 8 * 3600e3 });
        return true;
      }
      await authFetch("token?grant_type=password", { email, password });
      const ok = await rpc("is_admin", {}, true);
      if (!ok) { writeSession(null); throw fail("AUTH"); }
      return true;
    },

    async isAdmin() {
      const s = readSession();
      if (!s) return false;
      if (!REMOTE) return Boolean(s.demo && s.expires_at > Date.now());
      if (!(await token())) return false;
      try { return Boolean(await rpc("is_admin", {}, true)); } catch (e) { return false; }
    },

    async logout() {
      if (REMOTE) {
        const tk = await token();
        if (tk) fetch(`${BASE}/auth/v1/logout`, { method: "POST", headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${tk}` } }).catch(() => {});
      }
      writeSession(null);
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
      if (isNew) await sb("events", { method: "POST", body: JSON.stringify({ id, data }) }, true);
      else await sb(`events?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ data }) }, true);
      return event;
    },

    async deleteEvent(id) {
      if (!REMOTE) {
        local.write(LS_EVENTS, local.events().filter((e) => e.id !== id));
        local.write(LS_RESP, local.responses().filter((r) => r.eventId !== id));
        return;
      }
      await sb(`events?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, true);
    },

    /** Réponses complètes (organisateurs seulement). */
    async listResponses(eventId) {
      if (!REMOTE) return local.responses().filter((r) => r.eventId === eventId).map(publicMine);
      const rows = await sb(`responses?select=*&event_id=eq.${encodeURIComponent(eventId)}&order=created_at.asc`, {}, true);
      return rows.map(rowToResp);
    },

    async deleteResponse(id) {
      if (!REMOTE) { local.write(LS_RESP, local.responses().filter((r) => r.id !== id)); return; }
      await sb(`responses?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, true);
    },

    /** Masquer / afficher le prénom d'une réponse (modération). */
    async setShowName(id, show) {
      if (!REMOTE) {
        const all = local.responses();
        const r = all.find((x) => x.id === id);
        if (r) { r.showName = show; local.write(LS_RESP, all); }
        return;
      }
      await sb(`responses?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ show_name: show }) }, true);
    },

    /* ----- Propositions ----- */
    async submitProposal(p) {
      const title = String(p.title || "").replace(/\s+/g, " ").trim();
      if (title.length < 3 || title.length > 80) throw fail("INVALID");
      if (!REMOTE) {
        const all = local.read(LS_PROPOSALS, []);
        const dev = hashLocal(device());
        const recent = all.filter((x) => x.device === dev && Date.now() - new Date(x.createdAt) < 864e5);
        if (recent.length >= 3) throw fail("RATE_LIMIT");
        all.unshift({
          id: uid(), title, description: String(p.description || "").trim().slice(0, 1000),
          whenText: String(p.whenText || "").trim().slice(0, 80), needs: String(p.needs || "").trim().slice(0, 300),
          name: String(p.name || "").trim().slice(0, 40), lang: p.lang, status: "new", device: dev, createdAt: new Date().toISOString()
        });
        local.write(LS_PROPOSALS, all);
        return true;
      }
      await rpc("submit_proposal", {
        p_device: device(), p_title: title, p_description: p.description, p_when: p.whenText,
        p_needs: p.needs, p_name: p.name, p_lang: p.lang
      });
      return true;
    },

    /** Idées déjà proposées, visibles par tous (sans prénom ni besoins). */
    async listPublicProposals() {
      if (!REMOTE) {
        const votes = local.read(LS_VOTES, {});
        const score = (p) => { const v = votes[p.id] || {}; return Object.values(v).reduce((n, x) => n + x, 0); };
        const dev = hashLocal(device());
        return local.read(LS_PROPOSALS, []).filter((p) => p.status !== "rejected")
          .sort((a, b) => (b.status === "accepted") - (a.status === "accepted") || score(b) - score(a) || (b.createdAt || "").localeCompare(a.createdAt || ""))
          .slice(0, 60).map((p) => {
            const v = Object.values(votes[p.id] || {});
            return { id: p.id, title: p.title, description: (p.description || "").slice(0, 200), status: p.status, createdAt: p.createdAt,
              likes: v.filter((x) => x === 1).length, dislikes: v.filter((x) => x === -1).length, myVote: (votes[p.id] || {})[dev] || 0 };
          });
      }
      const rows = await rpc("public_proposals", { p_device: device() });
      return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, status: r.status, createdAt: r.created_at, likes: r.likes, dislikes: r.dislikes, myVote: r.my_vote }));
    },

    /** Vote 👍 (1) / 👎 (-1) / retrait (0). Renvoie { likes, dislikes, myVote }. */
    async voteProposal(id, value) {
      if (![-1, 0, 1].includes(value)) throw fail("INVALID");
      if (!REMOTE) {
        const p = local.read(LS_PROPOSALS, []).find((x) => x.id === id && x.status !== "rejected");
        if (!p) throw fail("NOT_FOUND");
        const votes = local.read(LS_VOTES, {});
        const dev = hashLocal(device());
        votes[id] = votes[id] || {};
        if (value === 0) delete votes[id][dev]; else votes[id][dev] = value;
        local.write(LS_VOTES, votes);
        const v = Object.values(votes[id]);
        return { likes: v.filter((x) => x === 1).length, dislikes: v.filter((x) => x === -1).length, myVote: value };
      }
      const r = await rpc("vote_proposal", { p_id: id, p_device: device(), p_value: value });
      return { likes: r.likes, dislikes: r.dislikes, myVote: r.my_vote };
    },

    async listProposals() {
      const count = (votes, id, val) => votes.filter((v) => v.proposalId === id && v.value === val).length;
      if (!REMOTE) {
        const all = local.read(LS_VOTES, {});
        const votes = Object.entries(all).flatMap(([pid, m]) => Object.values(m).map((value) => ({ proposalId: pid, value })));
        return local.read(LS_PROPOSALS, []).map((p) => ({ ...p, likes: count(votes, p.id, 1), dislikes: count(votes, p.id, -1) }));
      }
      const [rows, votesRaw] = await Promise.all([
        sb("proposals?select=id,title,description,when_text,needs,name,lang,status,created_at&order=created_at.desc", {}, true),
        sb("proposal_votes?select=proposal_id,value", {}, true).catch(() => [])
      ]);
      const votes = votesRaw.map((v) => ({ proposalId: v.proposal_id, value: v.value }));
      return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, whenText: r.when_text, needs: r.needs, name: r.name, lang: r.lang, status: r.status, createdAt: r.created_at,
        likes: count(votes, r.id, 1), dislikes: count(votes, r.id, -1) }));
    },

    async setProposalStatus(id, status) {
      if (!REMOTE) {
        const all = local.read(LS_PROPOSALS, []);
        const x = all.find((y) => y.id === id);
        if (x) { x.status = status; local.write(LS_PROPOSALS, all); }
        return;
      }
      await sb(`proposals?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }, true);
    },

    async deleteProposal(id) {
      if (!REMOTE) { local.write(LS_PROPOSALS, local.read(LS_PROPOSALS, []).filter((x) => x.id !== id)); return; }
      await sb(`proposals?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, true);
    },

    /* ----- Pot commun ----- */
    async getPot() {
      const empty = { url: "", goal: 0, description: "", description_en: "" };
      // lien par défaut (js/config.js) tant qu'aucun lien n'est réglé dans Organiser → Pot commun
      const withDefault = (st) => ({ ...st, url: st.url || cfg.potUrl || "" });
      if (!REMOTE) {
        const entries = local.read(LS_POT_ENTRIES, []).slice()
          .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
        return { settings: withDefault({ ...empty, ...local.read(LS_POT, {}) }), entries: entries.map((e) => ({ ...e, receiptUrl: e.receipt || null })) };
      }
      const [set, rows] = await Promise.all([
        sb("settings?select=data&key=eq.pot"),
        sb("pot_entries?select=*&order=entry_date.desc,created_at.desc")
      ]);
      return {
        settings: withDefault({ ...empty, ...((set[0] && set[0].data) || {}) }),
        entries: rows.map((r) => ({
          id: r.id, kind: r.kind, cents: r.amount_cents, label: r.label, label_en: r.label_en, date: r.entry_date,
          eventId: r.event_id, createdAt: r.created_at, receiptPath: r.receipt_path || null,
          receiptUrl: r.receipt_path ? `${BASE}/storage/v1/object/public/receipts/${r.receipt_path}` : null
        }))
      };
    },

    async savePotSettings(data) {
      const url = String(data.url || "").trim();
      if (url && !/^https:\/\/[^\s"<>]+$/.test(url)) throw fail("INVALID");
      const clean = {
        url, goal: Math.max(0, Math.round(Number(data.goal) || 0)),
        description: String(data.description || "").slice(0, 600), description_en: String(data.description_en || "").slice(0, 600)
      };
      if (!REMOTE) { local.write(LS_POT, clean); return; }
      await sb("settings?key=eq.pot", { method: "PATCH", body: JSON.stringify({ data: clean, updated_at: new Date().toISOString() }) }, true);
    },

    /**
     * Ré-encode une photo en JPEG (max 1600 px) : allège le fichier et supprime
     * toutes les métadonnées (position GPS, appareil…). Erreur IMAGE si illisible.
     */
    async compressImage(file, maxSide = 1600, quality = 0.82) {
      if (!file || !/^image\//.test(file.type || "image/")) throw fail("IMAGE");
      if (file.size > 25 * 1024 * 1024) throw fail("IMAGE");
      let bmp;
      try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { throw fail("IMAGE"); }
      const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close && bmp.close();
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", quality));
      if (!blob) throw fail("IMAGE");
      return blob;
    },

    /** Envoie une photo (ticket ou mode d'emploi) et renvoie sa référence (chemin Storage, ou image en mode démo). */
    async uploadReceipt(file, bucket = "receipts") {
      if (!["receipts", "guide"].includes(bucket)) throw fail("INVALID");
      if (!REMOTE) {
        const blob = await this.compressImage(file, 900, 0.7);
        return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(fail("IMAGE")); r.readAsDataURL(blob); });
      }
      const blob = await this.compressImage(file);
      if (blob.size > 3 * 1024 * 1024) throw fail("IMAGE");
      const path = `${new Date().getFullYear()}/${crypto.randomUUID ? crypto.randomUUID() : uid()}.jpg`;
      const tk = await token();
      if (!tk) throw fail("AUTH");
      let res;
      try {
        res = await fetch(`${BASE}/storage/v1/object/${bucket}/${path}`, {
          method: "POST",
          headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${tk}`, "Content-Type": "image/jpeg", "x-upsert": "false" },
          body: blob
        });
      } catch (e) { throw fail("NETWORK"); }
      if (!res.ok) throw fail(res.status === 401 || res.status === 403 ? "AUTH" : "UPLOAD");
      return path;
    },

    async removeReceipt(path, bucket = "receipts") {
      if (!REMOTE || !path || !/^[0-9]{4}\/[0-9a-f-]{36}\.jpg$/.test(path)) return;
      const tk = await token();
      if (!tk) return;
      try {
        await fetch(`${BASE}/storage/v1/object/${bucket}/${path}`, { method: "DELETE", headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${tk}` } });
      } catch (e) { /* le fichier orphelin pourra être supprimé depuis Supabase */ }
    },

    /* ----- Mode d'emploi ----- */
    /** Adresse affichable d'une photo : image du site, photo démo (data:) ou stockage « guide ». */
    guidePhotoUrl(path) {
      if (!path) return "";
      if (/^img\/guide\/[a-z0-9._-]+$/.test(path) || path.startsWith("data:image/")) return path;
      if (REMOTE && /^[0-9]{4}\/[0-9a-f-]{36}\.jpg$/.test(path)) return `${BASE}/storage/v1/object/public/guide/${path}`;
      return "";
    },

    /** Articles du mode d'emploi ; all = true (organisateurs) : y compris les articles masqués. */
    async listGuide(all = false) {
      let rows;
      if (!REMOTE) rows = local.read(LS_GUIDE, null) || (window.LEONE_GUIDE_SEED || []);
      else {
        const raw = await sb("guide_articles?select=*&order=sort.asc,created_at.asc", {}, all);
        rows = raw.map((a) => ({ id: a.id, emoji: a.emoji, title: a.title, title_en: a.title_en, body: a.body, body_en: a.body_en,
          photos: a.photos || [], sort: a.sort, published: a.published, createdAt: a.created_at, updatedAt: a.updated_at }));
      }
      rows = rows.slice().sort((a, b) => a.sort - b.sort || (a.createdAt || "").localeCompare(b.createdAt || ""));
      return all ? rows : rows.filter((a) => a.published);
    },

    async saveGuideArticle(a) {
      const clean = {
        emoji: String(a.emoji || "📘").trim().slice(0, 8) || "📘",
        title: String(a.title || "").trim().slice(0, 100), title_en: String(a.title_en || "").trim().slice(0, 100),
        body: String(a.body || "").slice(0, 10000), body_en: String(a.body_en || "").slice(0, 10000),
        photos: (a.photos || []).slice(0, 12).map((p) => ({ path: p.path, caption: String(p.caption || "").slice(0, 200), caption_en: String(p.caption_en || "").slice(0, 200) })),
        published: a.published !== false,
        sort: Number.isFinite(a.sort) ? a.sort : Date.now() % 1000000,
        updatedAt: new Date().toISOString()
      };
      if (!clean.title) throw fail("INVALID");
      if (!REMOTE) {
        const all = local.read(LS_GUIDE, null) || (window.LEONE_GUIDE_SEED || []).slice();
        const i = all.findIndex((x) => x.id === a.id);
        if (i >= 0) all[i] = { ...all[i], ...clean }; else all.push({ ...clean, id: uid(), createdAt: new Date().toISOString() });
        local.write(LS_GUIDE, all);
        if ((local.read(LS_GUIDE, []) || []).length !== all.length) throw fail("STORAGE");
        return;
      }
      const body = JSON.stringify({ emoji: clean.emoji, title: clean.title, title_en: clean.title_en, body: clean.body, body_en: clean.body_en,
        photos: clean.photos, published: clean.published, sort: clean.sort, updated_at: clean.updatedAt });
      if (a.id) await sb(`guide_articles?id=eq.${encodeURIComponent(a.id)}`, { method: "PATCH", body }, true);
      else await sb("guide_articles", { method: "POST", body }, true);
    },

    async deleteGuideArticle(a) {
      if (!REMOTE) { local.write(LS_GUIDE, (local.read(LS_GUIDE, null) || (window.LEONE_GUIDE_SEED || [])).filter((x) => x.id !== a.id)); return; }
      await sb(`guide_articles?id=eq.${encodeURIComponent(a.id)}`, { method: "DELETE" }, true);
      for (const p of a.photos || []) await this.removeReceipt(p.path, "guide");
    },

    /** Échange l'ordre de deux articles. */
    async swapGuideOrder(a, b) {
      const sa = a.sort, sb2 = b.sort === sa ? sa + 1 : b.sort;
      await this.saveGuideArticle({ ...a, sort: sb2 });
      await this.saveGuideArticle({ ...b, sort: sa });
    },

    async addPotEntry(e, receiptFile) {
      const row = {
        kind: e.kind === "out" ? "out" : "in",
        cents: Math.round(Number(e.cents) || 0),
        label: String(e.label || "").trim().slice(0, 120),
        label_en: String(e.label_en || "").trim().slice(0, 120),
        date: e.date || new Date().toISOString().slice(0, 10),
        eventId: e.eventId || null
      };
      if (row.cents <= 0 || row.cents > 10000000 || !row.label) throw fail("INVALID");
      const receipt = receiptFile ? await this.uploadReceipt(receiptFile) : null;
      if (!REMOTE) {
        const all = local.read(LS_POT_ENTRIES, []);
        all.push({ ...row, id: uid(), receipt, createdAt: new Date().toISOString() });
        local.write(LS_POT_ENTRIES, all);
        if (receipt && local.read(LS_POT_ENTRIES, []).length !== all.length) throw fail("STORAGE");
        return;
      }
      try {
        await sb("pot_entries", { method: "POST", body: JSON.stringify({
          kind: row.kind, amount_cents: row.cents, label: row.label, label_en: row.label_en,
          entry_date: row.date, event_id: row.eventId, receipt_path: receipt
        }) }, true);
      } catch (err) { await this.removeReceipt(receipt); throw err; }
    },

    /** Ajoute (ou remplace) le ticket d'un mouvement existant. */
    async attachReceipt(entry, file) {
      const receipt = await this.uploadReceipt(file);
      if (!REMOTE) {
        const all = local.read(LS_POT_ENTRIES, []);
        const x = all.find((y) => y.id === entry.id);
        if (x) x.receipt = receipt;
        local.write(LS_POT_ENTRIES, all);
        if ((local.read(LS_POT_ENTRIES, []).find((y) => y.id === entry.id) || {}).receipt !== receipt) throw fail("STORAGE");
        return;
      }
      try {
        await sb(`pot_entries?id=eq.${encodeURIComponent(entry.id)}`, { method: "PATCH", body: JSON.stringify({ receipt_path: receipt }) }, true);
      } catch (err) { await this.removeReceipt(receipt); throw err; }
      if (entry.receiptPath) await this.removeReceipt(entry.receiptPath);
    },

    async deletePotEntry(entry) {
      if (!REMOTE) { local.write(LS_POT_ENTRIES, local.read(LS_POT_ENTRIES, []).filter((x) => x.id !== entry.id)); return; }
      await sb(`pot_entries?id=eq.${encodeURIComponent(entry.id)}`, { method: "DELETE" }, true);
      await this.removeReceipt(entry.receiptPath);
    },

    /* ----- Inventaire ----- */
    async getInventory() {
      if (!REMOTE) {
        const groups = local.read(LS_INV_GROUPS, null) || DEFAULT_GROUPS;
        return { groups: groups.slice().sort((a, b) => a.sort - b.sort), items: local.read(LS_INV_ITEMS, []) };
      }
      const [groups, items] = await Promise.all([
        sb("inventory_groups?select=id,name,name_en,emoji,sort&order=sort.asc,created_at.asc"),
        sb("inventory_items?select=id,group_id,name,name_en,qty,updated_at&order=name.asc")
      ]);
      return { groups, items: items.map((i) => ({ id: i.id, groupId: i.group_id, name: i.name, name_en: i.name_en, qty: i.qty, updatedAt: i.updated_at })) };
    },

    async addInventoryGroup(g) {
      const name = String(g.name || "").trim().slice(0, 40);
      if (!name) throw fail("INVALID");
      const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "groupe";
      const row = { id: `${slug}-${uid().replace(/-/g, "").slice(0, 4)}`, name, name_en: String(g.name_en || "").trim().slice(0, 40), emoji: String(g.emoji || "📦").trim().slice(0, 8) || "📦", sort: Date.now() % 100000 };
      if (!REMOTE) {
        const groups = local.read(LS_INV_GROUPS, null) || DEFAULT_GROUPS.slice();
        groups.push(row); local.write(LS_INV_GROUPS, groups); return row;
      }
      await sb("inventory_groups", { method: "POST", body: JSON.stringify(row) }, true);
      return row;
    },

    async deleteInventoryGroup(id) {
      if (!REMOTE) {
        local.write(LS_INV_GROUPS, (local.read(LS_INV_GROUPS, null) || DEFAULT_GROUPS).filter((g) => g.id !== id));
        local.write(LS_INV_ITEMS, local.read(LS_INV_ITEMS, []).filter((i) => i.groupId !== id));
        return;
      }
      await sb(`inventory_groups?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, true);
    },

    async addInventoryItem(it) {
      const row = {
        groupId: it.groupId, name: String(it.name || "").trim().slice(0, 60), name_en: String(it.name_en || "").trim().slice(0, 60),
        qty: Math.max(0, Math.min(999, parseInt(it.qty, 10) || 1))
      };
      if (!row.name || !row.groupId) throw fail("INVALID");
      if (!REMOTE) {
        const items = local.read(LS_INV_ITEMS, []);
        items.push({ ...row, id: uid(), updatedAt: new Date().toISOString() });
        local.write(LS_INV_ITEMS, items); return;
      }
      await sb("inventory_items", { method: "POST", body: JSON.stringify({ group_id: row.groupId, name: row.name, name_en: row.name_en, qty: row.qty }) }, true);
    },

    async setInventoryQty(id, qty) {
      qty = Math.max(0, Math.min(999, parseInt(qty, 10) || 0));
      if (!REMOTE) {
        const items = local.read(LS_INV_ITEMS, []);
        const x = items.find((i) => i.id === id);
        if (x) { x.qty = qty; x.updatedAt = new Date().toISOString(); local.write(LS_INV_ITEMS, items); }
        return;
      }
      await sb(`inventory_items?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ qty, updated_at: new Date().toISOString() }) }, true);
    },

    async deleteInventoryItem(id) {
      if (!REMOTE) { local.write(LS_INV_ITEMS, local.read(LS_INV_ITEMS, []).filter((i) => i.id !== id)); return; }
      await sb(`inventory_items?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, true);
    },

    /* ----- Informations (messages permanents / pop-up) ----- */
    /** Messages en cours ; all=true (organisateurs) : tous, y compris programmés ou expirés. */
    async listAnnouncements(all = false) {
      const now = Date.now();
      const active = (a) => new Date(a.startsAt).getTime() <= now && (!a.endsAt || new Date(a.endsAt).getTime() > now);
      let rows;
      if (!REMOTE) rows = local.read(LS_ANNOUNCE, []);
      else {
        const raw = await sb("announcements?select=*&order=important.desc,created_at.desc", {}, all);
        rows = raw.map((a) => ({ id: a.id, kind: a.kind, important: a.important, title: a.title, title_en: a.title_en, body: a.body, body_en: a.body_en, startsAt: a.starts_at, endsAt: a.ends_at, createdAt: a.created_at }));
      }
      rows = rows.slice().sort((a, b) => (b.important - a.important) || (b.createdAt || "").localeCompare(a.createdAt || ""));
      return all ? rows : rows.filter(active);
    },

    async saveAnnouncement(a) {
      const row = {
        kind: a.kind === "popup" ? "popup" : "permanent", important: Boolean(a.important),
        title: String(a.title || "").trim().slice(0, 100), title_en: String(a.title_en || "").trim().slice(0, 100),
        body: String(a.body || "").trim().slice(0, 2000), body_en: String(a.body_en || "").trim().slice(0, 2000),
        startsAt: a.startsAt || new Date().toISOString(), endsAt: a.endsAt || null
      };
      if (!row.title) throw fail("INVALID");
      if (row.endsAt && new Date(row.endsAt) <= new Date(row.startsAt)) throw fail("INVALID");
      if (!REMOTE) {
        const all = local.read(LS_ANNOUNCE, []);
        const i = all.findIndex((x) => x.id === a.id);
        if (i >= 0) all[i] = { ...all[i], ...row }; else all.push({ ...row, id: uid(), createdAt: new Date().toISOString() });
        local.write(LS_ANNOUNCE, all); return;
      }
      const body = JSON.stringify({ kind: row.kind, important: row.important, title: row.title, title_en: row.title_en, body: row.body, body_en: row.body_en, starts_at: row.startsAt, ends_at: row.endsAt });
      if (a.id) await sb(`announcements?id=eq.${encodeURIComponent(a.id)}`, { method: "PATCH", body }, true);
      else await sb("announcements", { method: "POST", body }, true);
    },

    async deleteAnnouncement(id) {
      if (!REMOTE) { local.write(LS_ANNOUNCE, local.read(LS_ANNOUNCE, []).filter((x) => x.id !== id)); return; }
      await sb(`announcements?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, true);
    },

    /* =================== Communauté : photos, annonces, signalements, sondages, notifications =================== */
    /** Envoie une photo de résident dans le stockage public « uploads » (gallery/, reports/, ads/). */
    async uploadPublic(file, prefix) {
      if (!["gallery", "reports", "ads"].includes(prefix)) throw fail("INVALID");
      if (!REMOTE) {
        const blob = await this.compressImage(file, 700, 0.6);
        return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(fail("IMAGE")); r.readAsDataURL(blob); });
      }
      const blob = await this.compressImage(file);
      if (blob.size > 3 * 1024 * 1024) throw fail("IMAGE");
      const path = `${prefix}/${new Date().getFullYear()}/${crypto.randomUUID ? crypto.randomUUID() : uid()}.jpg`;
      let res;
      try {
        res = await fetch(`${BASE}/storage/v1/object/uploads/${path}`, {
          method: "POST",
          headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}`, "Content-Type": "image/jpeg", "x-upsert": "false" },
          body: blob
        });
      } catch (e) { throw fail("NETWORK"); }
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        console.warn("Envoi photo refusé", res.status, msg);
        if (/bucket not found/i.test(msg)) throw fail("DB_OUTDATED"); // supabase.sql pas relancé
        if (res.status === 413 || /too large|size/i.test(msg)) throw fail("IMAGE");
        if (/row-level security|unauthorized|403/i.test(msg) || res.status === 403) throw fail("RATE_LIMIT");
        throw fail("UPLOAD");
      }
      return path;
    },
    /** Adresse affichable d'une photo de résident (vide si le chemin est inattendu). */
    uploadUrl(path) {
      if (!path) return "";
      if (path.startsWith("data:image/")) return path;
      if (REMOTE && /^(gallery|reports|ads)\/[0-9]{4}\/[0-9a-f-]{36}\.jpg$/.test(path)) return `${BASE}/storage/v1/object/public/uploads/${path}`;
      return "";
    },
    async removeUpload(path) {
      if (!REMOTE || !path || !/^(gallery|reports|ads)\/[0-9]{4}\/[0-9a-f-]{36}\.jpg$/.test(path)) return;
      const tk = await token();
      if (!tk) return;
      try { await fetch(`${BASE}/storage/v1/object/uploads/${path}`, { method: "DELETE", headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${tk}` } }); } catch (e) { /* ignore */ }
    },

    /* ----- Galerie ----- */
    async listPhotos(eventId) {
      if (!REMOTE) return local.read(LS_PHOTOS, []).filter((p) => p.eventId === eventId && p.status === "approved");
      return (await rpc("public_photos", { p_event_id: eventId })).map((p) => ({ id: p.id, path: p.path, caption: p.caption, createdAt: p.created_at }));
    },
    async submitPhoto(eventId, file, caption) {
      if (!REMOTE) {
        const ev = local.events().find((e) => e.id === eventId);
        if (!ev) throw fail("EVENT_NOT_FOUND");
        if (new Date(ev.start) > new Date()) throw fail("NOT_STARTED");
        const all = local.read(LS_PHOTOS, []);
        const dev = hashLocal(device());
        if (all.filter((p) => p.device === dev && Date.now() - new Date(p.createdAt) < 864e5).length >= 15) throw fail("RATE_LIMIT");
        const path = await this.uploadPublic(file, "gallery");
        all.push({ id: uid(), eventId, path, caption: String(caption || "").slice(0, 140), status: "pending", device: dev, createdAt: new Date().toISOString() });
        local.write(LS_PHOTOS, all);
        if (local.read(LS_PHOTOS, []).length !== all.length) throw fail("STORAGE");
        return;
      }
      const path = await this.uploadPublic(file, "gallery");
      await rpc("submit_photo", { p_event_id: eventId, p_device: device(), p_path: path, p_caption: String(caption || "").slice(0, 140) });
    },
    async adminAddPhoto(eventId, file, caption) {
      const cap = String(caption || "").replace(/\s+/g, " ").trim().slice(0, 140);
      if (!REMOTE) {
        if (!local.events().some((e) => e.id === eventId)) throw fail("EVENT_NOT_FOUND");
        const path = await this.uploadPublic(file, "gallery");
        const all = local.read(LS_PHOTOS, []);
        all.push({ id: uid(), eventId, path, caption: cap, status: "approved", device: "admin", createdAt: new Date().toISOString() });
        local.write(LS_PHOTOS, all);
        if (local.read(LS_PHOTOS, []).length !== all.length) throw fail("STORAGE");
        return;
      }
      if (!(await token())) throw fail("AUTH");
      const path = await this.uploadPublic(file, "gallery");
      await sb("event_photos", { method: "POST", body: JSON.stringify({ event_id: eventId, path, caption: cap, status: "approved", device_hash: "admin" }) }, true);
    },
    async adminListPhotos() {
      if (!REMOTE) return local.read(LS_PHOTOS, []);
      const rows = await sb("event_photos?select=id,event_id,path,caption,status,created_at&order=created_at.desc&limit=300", {}, true);
      return rows.map((p) => ({ id: p.id, eventId: p.event_id, path: p.path, caption: p.caption, status: p.status, createdAt: p.created_at }));
    },
    async setPhotoStatus(id, status) {
      if (!REMOTE) { const all = local.read(LS_PHOTOS, []); const p = all.find((x) => x.id === id); if (p) p.status = status; local.write(LS_PHOTOS, all); return; }
      await sb(`event_photos?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }, true);
    },
    async deletePhoto(photo) {
      if (!REMOTE) { local.write(LS_PHOTOS, local.read(LS_PHOTOS, []).filter((x) => x.id !== photo.id)); return; }
      await sb(`event_photos?id=eq.${encodeURIComponent(photo.id)}`, { method: "DELETE" }, true);
      await this.removeUpload(photo.path);
    },

    /* ----- Petites annonces ----- */
    async listClassifieds() {
      if (!REMOTE) {
        const dev = hashLocal(device());
        return local.read(LS_ADS, []).filter((a) => new Date(a.expiresAt) > new Date())
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((a) => ({ ...a, isMine: a.device === dev }));
      }
      return (await rpc("public_classifieds", { p_device: device() })).map((a) => ({
        id: a.id, kind: a.kind, title: a.title, body: a.body, contact: a.contact, name: a.name, photoPath: a.photo_path,
        createdAt: a.created_at, expiresAt: a.expires_at, isMine: a.is_mine }));
    },
    async postClassified(a, photoFile) {
      const title = String(a.title || "").replace(/\s+/g, " ").trim();
      if (!["lend", "give", "seek", "help"].includes(a.kind) || title.length < 3 || title.length > 80) throw fail("INVALID");
      if (!REMOTE) {
        const all = local.read(LS_ADS, []);
        const dev = hashLocal(device());
        if (all.filter((x) => x.device === dev && Date.now() - new Date(x.createdAt) < 864e5).length >= 3) throw fail("RATE_LIMIT");
        const photoPath = photoFile ? await this.uploadPublic(photoFile, "ads") : null;
        const now = new Date();
        all.push({ id: uid(), kind: a.kind, title, body: String(a.body || "").trim().slice(0, 600), contact: String(a.contact || "").trim().slice(0, 80),
          name: String(a.name || "").trim().slice(0, 40), photoPath, device: dev, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 864e5).toISOString() });
        local.write(LS_ADS, all);
        if (local.read(LS_ADS, []).length !== all.length) throw fail("STORAGE");
        return;
      }
      const photoPath = photoFile ? await this.uploadPublic(photoFile, "ads") : null;
      await rpc("post_classified", { p_device: device(), p_kind: a.kind, p_title: title, p_body: a.body, p_contact: a.contact, p_name: a.name, p_photo: photoPath });
    },
    async removeClassified(ad) {
      if (!REMOTE) { local.write(LS_ADS, local.read(LS_ADS, []).filter((x) => x.id !== ad.id)); return; }
      if (ad.isMine) await rpc("remove_classified", { p_id: ad.id, p_device: device() });
      else await sb(`classifieds?id=eq.${encodeURIComponent(ad.id)}`, { method: "DELETE" }, true);
      if (!ad.isMine) await this.removeUpload(ad.photoPath);
    },

    /* ----- Signalements ----- */
    async listReports() {
      if (!REMOTE) {
        return local.read(LS_REPORTS, []).filter((r) => !r.hidden && (r.status !== "fixed" || Date.now() - new Date(r.updatedAt) < 14 * 864e5))
          .sort((a, b) => (a.status === "fixed") - (b.status === "fixed") || b.createdAt.localeCompare(a.createdAt));
      }
      return (await rpc("public_reports", {})).map((r) => ({ id: r.id, category: r.category, location: r.location, body: r.body, photoPath: r.photo_path,
        status: r.status, adminNote: r.admin_note, createdAt: r.created_at, updatedAt: r.updated_at }));
    },
    async submitReport(r, photoFile) {
      const body = String(r.body || "").trim();
      const cats = ["electricity", "water", "heating", "elevator", "cleanliness", "security", "other"];
      if (!cats.includes(r.category) || body.length < 5 || body.length > 800) throw fail("INVALID");
      if (!REMOTE) {
        const all = local.read(LS_REPORTS, []);
        const dev = hashLocal(device());
        if (all.filter((x) => x.device === dev && Date.now() - new Date(x.createdAt) < 864e5).length >= 5) throw fail("RATE_LIMIT");
        const photoPath = photoFile ? await this.uploadPublic(photoFile, "reports") : null;
        const now = new Date().toISOString();
        all.push({ id: uid(), category: r.category, location: String(r.location || "").trim().slice(0, 80), body, name: String(r.name || "").trim().slice(0, 40),
          photoPath, status: "new", adminNote: "", hidden: false, device: dev, createdAt: now, updatedAt: now });
        local.write(LS_REPORTS, all);
        if (local.read(LS_REPORTS, []).length !== all.length) throw fail("STORAGE");
        return;
      }
      const photoPath = photoFile ? await this.uploadPublic(photoFile, "reports") : null;
      await rpc("submit_report", { p_device: device(), p_category: r.category, p_location: r.location, p_body: body, p_name: r.name, p_photo: photoPath });
    },
    async adminListReports() {
      if (!REMOTE) return local.read(LS_REPORTS, []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const rows = await sb("reports?select=id,category,location,body,name,photo_path,status,admin_note,hidden,created_at,updated_at&order=created_at.desc&limit=300", {}, true);
      return rows.map((r) => ({ id: r.id, category: r.category, location: r.location, body: r.body, name: r.name, photoPath: r.photo_path, status: r.status,
        adminNote: r.admin_note, hidden: r.hidden, createdAt: r.created_at, updatedAt: r.updated_at }));
    },
    async updateReport(id, patch) {
      const clean = {};
      if (patch.status) clean.status = patch.status;
      if ("adminNote" in patch) clean.admin_note = String(patch.adminNote || "").slice(0, 300);
      if ("hidden" in patch) clean.hidden = Boolean(patch.hidden);
      clean.updated_at = new Date().toISOString();
      if (!REMOTE) {
        const all = local.read(LS_REPORTS, []); const r = all.find((x) => x.id === id);
        if (r) Object.assign(r, { status: clean.status || r.status, adminNote: "admin_note" in clean ? clean.admin_note : r.adminNote, hidden: "hidden" in clean ? clean.hidden : r.hidden, updatedAt: clean.updated_at });
        local.write(LS_REPORTS, all); return;
      }
      await sb(`reports?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(clean) }, true);
    },
    async deleteReport(r) {
      if (!REMOTE) { local.write(LS_REPORTS, local.read(LS_REPORTS, []).filter((x) => x.id !== r.id)); return; }
      await sb(`reports?id=eq.${encodeURIComponent(r.id)}`, { method: "DELETE" }, true);
      await this.removeUpload(r.photoPath);
    },

    /* ----- Sondages ----- */
    async listPolls() {
      if (!REMOTE) {
        const votes = local.read(LS_POLL_VOTES, {});
        const dev = hashLocal(device());
        return local.read(LS_POLLS, []).filter((p) => p.published).map((p) => {
          const v = votes[p.id] || {};
          const counts = {};
          Object.values(v).forEach((o) => (counts[o] = (counts[o] || 0) + 1));
          return { ...p, counts, total: Object.keys(v).length, myChoice: v[dev] || null };
        }).sort((a, b) => (isClosed(a) - isClosed(b)) || b.createdAt.localeCompare(a.createdAt));
      }
      return (await rpc("public_polls", { p_device: device() })).map((p) => ({ id: p.id, question: p.question, question_en: p.question_en, options: p.options,
        endsAt: p.ends_at, createdAt: p.created_at, counts: p.counts || {}, total: p.total, myChoice: p.my_choice }));
    },
    async votePoll(id, option) {
      if (!REMOTE) {
        const p = local.read(LS_POLLS, []).find((x) => x.id === id && x.published);
        if (!p) throw fail("NOT_FOUND");
        if (isClosed(p)) throw fail("CLOSED");
        if (option && !p.options.some((o) => o.id === option)) throw fail("INVALID");
        const votes = local.read(LS_POLL_VOTES, {});
        const dev = hashLocal(device());
        votes[id] = votes[id] || {};
        if (option) votes[id][dev] = option; else delete votes[id][dev];
        local.write(LS_POLL_VOTES, votes);
        return;
      }
      await rpc("vote_poll", { p_id: id, p_device: device(), p_option: option || "" });
    },
    async adminListPolls() {
      if (!REMOTE) {
        const votes = local.read(LS_POLL_VOTES, {});
        return local.read(LS_POLLS, []).map((p) => { const counts = {}; Object.values(votes[p.id] || {}).forEach((o) => (counts[o] = (counts[o] || 0) + 1)); return { ...p, counts, total: Object.keys(votes[p.id] || {}).length }; })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
      const [rows, votes] = await Promise.all([
        sb("polls?select=*&order=created_at.desc", {}, true),
        sb("poll_votes?select=poll_id,option_id", {}, true).catch(() => [])
      ]);
      return rows.map((p) => {
        const counts = {}; let total = 0;
        votes.filter((v) => v.poll_id === p.id).forEach((v) => { counts[v.option_id] = (counts[v.option_id] || 0) + 1; total++; });
        return { id: p.id, question: p.question, question_en: p.question_en, options: p.options, endsAt: p.ends_at, published: p.published, createdAt: p.created_at, counts, total };
      });
    },
    async savePoll(p) {
      const options = (p.options || []).map((o, i) => ({ id: o.id || `o${i + 1}${Math.random().toString(36).slice(2, 6)}`, label: String(o.label || "").trim().slice(0, 80), label_en: String(o.label_en || "").trim().slice(0, 80) }))
        .filter((o) => o.label);
      const row = { question: String(p.question || "").trim().slice(0, 160), question_en: String(p.question_en || "").trim().slice(0, 160), options,
        endsAt: p.endsAt || null, published: p.published !== false };
      if (row.question.length < 3 || options.length < 2 || options.length > 8) throw fail("INVALID");
      if (!REMOTE) {
        const all = local.read(LS_POLLS, []);
        const i = all.findIndex((x) => x.id === p.id);
        if (i >= 0) all[i] = { ...all[i], ...row }; else all.push({ ...row, id: uid(), createdAt: new Date().toISOString() });
        local.write(LS_POLLS, all); return;
      }
      const body = JSON.stringify({ question: row.question, question_en: row.question_en, options: row.options, ends_at: row.endsAt, published: row.published });
      if (p.id) await sb(`polls?id=eq.${encodeURIComponent(p.id)}`, { method: "PATCH", body }, true);
      else await sb("polls", { method: "POST", body }, true);
    },
    async deletePoll(id) {
      if (!REMOTE) { local.write(LS_POLLS, local.read(LS_POLLS, []).filter((x) => x.id !== id)); return; }
      await sb(`polls?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, true);
    },

    /* ----- Notifications ----- */
    async getPushKey() {
      if (!REMOTE) return (local.read(LS_PUSH, {}) || {}).vapidPublic || "";
      const r = await sb("settings?select=data&key=eq.push").catch(() => []);
      return (r[0] && r[0].data && r[0].data.vapidPublic) || "";
    },
    async savePushKey(vapidPublic) {
      if (!/^[A-Za-z0-9_-]{80,100}$/.test(vapidPublic)) throw fail("INVALID");
      if (!REMOTE) { local.write(LS_PUSH, { vapidPublic }); return; }
      await sb("settings?key=eq.push", { method: "PATCH", body: JSON.stringify({ data: { vapidPublic }, updated_at: new Date().toISOString() }) }, true);
    },
    async pushSubscribe(sub, lang) {
      const j = sub.toJSON();
      if (!REMOTE) { local.write(LS_PUSH_SUB, { endpoint: j.endpoint, lang }); return; }
      await rpc("push_subscribe", { p_device: device(), p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_lang: lang });
    },
    async pushUnsubscribe(endpoint) {
      if (!REMOTE) { try { localStorage.removeItem(LS_PUSH_SUB); } catch (e) { /* ignore */ } return; }
      await rpc("push_unsubscribe", { p_endpoint: endpoint }).catch(() => {});
    },
    async pushCount() {
      if (!REMOTE) return local.read(LS_PUSH_SUB, null) ? 1 : 0;
      const rows = await sb("push_subscriptions?select=endpoint", {}, true);
      return rows.length;
    },
    /** Envoie une notification à tous les abonnés (fonction Supabase « notify »). */
    async sendPush(msg) {
      if (!REMOTE) throw fail("PUSH_DEMO");
      const tk = await token();
      if (!tk) throw fail("AUTH");
      let res;
      try {
        res = await fetch(`${BASE}/functions/v1/notify`, {
          method: "POST",
          headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
          body: JSON.stringify(msg)
        });
      } catch (e) { throw fail("PUSH_SERVER"); }
      const out = await res.json().catch(() => ({}));
      if (res.status === 403) throw fail("AUTH");
      if (res.status === 404) throw fail("PUSH_SERVER");
      if (!res.ok) throw fail(out.error === "VAPID_MISSING" ? "PUSH_KEYS" : "PUSH_SERVER");
      return out;
    },

    resetDemo() {
      if (REMOTE) return;
      local.write(LS_EVENTS, seedEvents());
      local.write(LS_RESP, []);
      [LS_PROPOSALS, LS_VOTES, LS_GUIDE, LS_PHOTOS, LS_ADS, LS_REPORTS, LS_POLLS, LS_POLL_VOTES, LS_POT, LS_POT_ENTRIES, LS_INV_GROUPS, LS_INV_ITEMS, LS_ANNOUNCE].forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
    },

    uid
  };

  window.Store = Store;
})();
