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
  const LS_POT = "leone.pot.v1";
  const LS_POT_ENTRIES = "leone.potEntries.v1";
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
      let msg = "";
      try { msg = JSON.parse(txt).message || ""; } catch (e) { /* ignore */ }
      const known = ["INVALID", "EVENT_NOT_FOUND", "EVENT_CLOSED", "ALREADY_ANSWERED", "NAME_TAKEN", "FULL", "RATE_LIMIT", "NOT_FOUND"];
      if (known.includes(msg)) throw fail(msg);
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
        return local.read(LS_PROPOSALS, []).filter((p) => p.status !== "rejected")
          .sort((a, b) => (b.status === "accepted") - (a.status === "accepted") || (b.createdAt || "").localeCompare(a.createdAt || ""))
          .slice(0, 60).map((p) => ({ id: p.id, title: p.title, description: (p.description || "").slice(0, 200), status: p.status, createdAt: p.createdAt }));
      }
      const rows = await rpc("public_proposals", {});
      return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, status: r.status, createdAt: r.created_at }));
    },

    async listProposals() {
      if (!REMOTE) return local.read(LS_PROPOSALS, []);
      const rows = await sb("proposals?select=id,title,description,when_text,needs,name,lang,status,created_at&order=created_at.desc", {}, true);
      return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, whenText: r.when_text, needs: r.needs, name: r.name, lang: r.lang, status: r.status, createdAt: r.created_at }));
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

    /** Envoie un ticket et renvoie sa référence (chemin Storage, ou image en mode démo). */
    async uploadReceipt(file) {
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
        res = await fetch(`${BASE}/storage/v1/object/receipts/${path}`, {
          method: "POST",
          headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${tk}`, "Content-Type": "image/jpeg", "x-upsert": "false" },
          body: blob
        });
      } catch (e) { throw fail("NETWORK"); }
      if (!res.ok) throw fail(res.status === 401 || res.status === 403 ? "AUTH" : "UPLOAD");
      return path;
    },

    async removeReceipt(path) {
      if (!REMOTE || !path) return;
      const tk = await token();
      if (!tk) return;
      try {
        await fetch(`${BASE}/storage/v1/object/receipts/${path}`, { method: "DELETE", headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${tk}` } });
      } catch (e) { /* le fichier orphelin pourra être supprimé depuis Supabase */ }
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

    resetDemo() {
      if (REMOTE) return;
      local.write(LS_EVENTS, seedEvents());
      local.write(LS_RESP, []);
      [LS_PROPOSALS, LS_POT, LS_POT_ENTRIES].forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
    },

    uid
  };

  window.Store = Store;
})();
