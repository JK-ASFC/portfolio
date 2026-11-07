/* =============================================================
   LEONE — application (routeur, rendu, formulaires, admin)
   ============================================================= */
(function () {
  const cfg = window.LEONE_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const THEMES = ["sunset", "tricolore", "ocean", "neon", "forest"];
  const AV_COLORS = ["#7b5cff", "#ff5a1f", "#19b5a5", "#ff4f8b", "#1d3fbb", "#2f9e5b"];
  const STATUS = { yes: "Je viens", maybe: "Peut-être", no: "Je ne peux pas" };

  /* ---------------- Utilitaires date ---------------- */
  const toDate = (s) => (s ? new Date(s) : null);
  const fmtDay = (d) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const fmtTime = (d) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const fmtShortMonth = (d) => d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
  const isPast = (ev) => {
    const end = toDate(ev.end) || new Date(toDate(ev.start).getTime() + 3 * 3600e3);
    return end < new Date();
  };
  const sortByStart = (a, b) => toDate(a.start) - toDate(b.start);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------------- Calculs ---------------- */
  function tally(ev, responses) {
    const going = responses.filter((r) => r.status !== "no");
    const yes = responses.filter((r) => r.status === "yes");
    const headcount = yes.reduce((n, r) => n + 1 + (Number(r.guests) || 0), 0);
    const brought = {};
    (ev.items || []).forEach((it) => (brought[it.id] = 0));
    going.forEach((r) => Object.entries(r.items || {}).forEach(([id, q]) => {
      if (id in brought) brought[id] += Number(q) || 0;
    }));
    return { going, yes, headcount, brought };
  }
  const initials = (name) => name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
  const avColor = (name) => AV_COLORS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AV_COLORS.length];

  /* ---------------- Toast ---------------- */
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("is-on"), 3200);
  }

  /* ---------------- Reveal + compteurs ---------------- */
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      }), { threshold: 0.12 })
    : null;
  function observeReveals(root = document) {
    $$(".reveal:not(.is-in)", root).forEach((el) => (io ? io.observe(el) : el.classList.add("is-in")));
  }
  function countUp(el, to) {
    const dur = 1200, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------------- Composants ---------------- */
  function cardHTML(ev, responses) {
    const d = toDate(ev.start);
    const { yes, headcount } = tally(ev, responses);
    const theme = THEMES.includes(ev.theme) ? ev.theme : "sunset";
    const avs = yes.slice(0, 4).map((r) => `<span style="background:${avColor(r.name)}">${esc(initials(r.name))}</span>`).join("");
    return `
      <a class="card th-${theme} reveal ${isPast(ev) ? "is-past" : ""}" href="#/event/${encodeURIComponent(ev.id)}">
        <div class="card-cover">
          <div class="card-date"><strong>${d.getDate()}</strong><span>${esc(fmtShortMonth(d))}</span></div>
          <span class="card-emoji" aria-hidden="true">${esc(ev.emoji || "✨")}</span>
        </div>
        <div class="card-body">
          <span class="tag">${esc(ev.category || "Événement")}</span>
          <h3>${esc(ev.title)}</h3>
          <div class="card-meta">${esc(cap(fmtDay(d)))} · ${esc(fmtTime(d))}</div>
          <div class="card-meta">📍 ${esc(ev.location || "Résidence LEONE")}</div>
          <div class="card-foot">
            <div class="avatars">${avs}</div>
            <span class="going-count">${headcount ? `${headcount} participant${headcount > 1 ? "s" : ""}` : "Sois le premier !"}</span>
          </div>
        </div>
      </a>`;
  }

  /* ---------------- Vues ---------------- */
  let cache = { events: [], responses: [] };
  async function load() {
    const [events, responses] = await Promise.all([Store.listEvents(), Store.listResponses()]);
    cache = { events, responses };
    return cache;
  }
  const respFor = (id) => cache.responses.filter((r) => r.eventId === id);

  let countdownTimer;
  async function renderHome() {
    const { events, responses } = await load();
    const upcoming = events.filter((e) => !isPast(e)).sort(sortByStart);
    $("#homeEvents").innerHTML = upcoming.length
      ? upcoming.slice(0, 3).map((e) => cardHTML(e, respFor(e.id))).join("")
      : `<div class="empty">Aucun événement prévu pour l'instant. Reviens vite !</div>`;

    // prochain événement + compte à rebours
    const next = upcoming[0];
    const nc = $("#nextCard");
    clearInterval(countdownTimer);
    if (next) {
      const d = toDate(next.start);
      const t = tally(next, respFor(next.id));
      nc.innerHTML = `
        <span class="tag tag-live">● Prochain événement</span>
        <h3>${esc(next.emoji || "")} ${esc(next.title)}</h3>
        <p class="card-meta">${esc(cap(fmtDay(d)))} · ${esc(fmtTime(d))}<br>📍 ${esc(next.location || "")}</p>
        <div class="countdown" id="cd">
          <div><strong data-u="d">0</strong><span>jours</span></div>
          <div><strong data-u="h">0</strong><span>heures</span></div>
          <div><strong data-u="m">0</strong><span>min</span></div>
          <div><strong data-u="s">0</strong><span>sec</span></div>
        </div>
        <p class="card-meta"><strong>${t.headcount}</strong> inscrit${t.headcount > 1 ? "s" : ""} pour l'instant</p>
        <a class="btn btn-primary" href="#/event/${encodeURIComponent(next.id)}">Je m'inscris →</a>`;
      const tick = () => {
        let ms = Math.max(0, d - new Date());
        const u = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
        Object.entries(u).forEach(([k, v]) => { const el = $(`[data-u="${k}"]`, nc); if (el) el.textContent = String(v).padStart(2, "0"); });
      };
      tick();
      countdownTimer = setInterval(tick, 1000);
    } else {
      nc.innerHTML = `<span class="tag">Calme plat</span><h3>Rien de prévu… pour l'instant</h3><p class="card-meta">Les prochains événements apparaîtront ici.</p>`;
    }

    // stats
    const itemsCount = responses.filter((r) => r.status !== "no")
      .reduce((n, r) => n + Object.values(r.items || {}).reduce((a, b) => a + (Number(b) || 0), 0), 0);
    const stats = { events: events.length, people: responses.length, items: itemsCount };
    $$("[data-count]").forEach((el) => {
      const v = stats[el.dataset.count];
      if (io) {
        const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { countUp(el, v); o.disconnect(); } });
        o.observe(el);
      } else el.textContent = v;
    });
  }

  let currentFilter = "upcoming";
  async function renderEvents() {
    const { events } = await load();
    let list = events.slice().sort(sortByStart);
    if (currentFilter === "upcoming") list = list.filter((e) => !isPast(e));
    if (currentFilter === "past") list = list.filter(isPast).reverse();
    $("#eventList").innerHTML = list.length
      ? list.map((e) => cardHTML(e, respFor(e.id))).join("")
      : `<div class="empty">${currentFilter === "past" ? "Pas encore d'événement passé." : "Aucun événement à venir pour l'instant."}</div>`;
  }
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    currentFilter = b.dataset.filter;
    $$("#filters .chip").forEach((c) => { c.classList.toggle("is-active", c === b); c.setAttribute("aria-selected", c === b); });
    renderEvents().then(() => observeReveals($("#eventList")));
  });

  /* ---------- Détail + formulaire de réponse ---------- */
  async function renderEvent(id) {
    const root = $("#eventDetail");
    const ev = await Store.getEvent(id);
    if (!ev) {
      root.innerHTML = `<div class="page-head"><h1>Oups…</h1><p class="lead">Cet événement n'existe pas (ou plus).</p><a class="btn btn-dark" href="#/events">Retour aux événements</a></div>`;
      return;
    }
    const responses = await Store.listResponses(ev.id);
    const t = tally(ev, responses);
    const d = toDate(ev.start), end = toDate(ev.end);
    const theme = THEMES.includes(ev.theme) ? ev.theme : "sunset";
    const past = isPast(ev);
    const full = ev.capacity && t.headcount >= ev.capacity;

    const needsHTML = (ev.items || []).map((it) => {
      const got = t.brought[it.id] || 0;
      const pct = it.needed ? Math.min(100, (got / it.needed) * 100) : 0;
      return `<div class="need ${got >= it.needed ? "is-full" : ""}">
          <span class="need-emoji" aria-hidden="true">${esc(it.emoji || "•")}</span>
          <span class="need-label">${esc(it.label)}</span>
          <span class="need-count">${got}/${it.needed}</span>
          <span class="bar"><i data-w="${pct}"></i></span>
        </div>`;
    }).join("");

    const peopleHTML = responses.slice().reverse().map((r) => {
      const brings = Object.entries(r.items || {}).filter(([, q]) => q > 0).map(([iid, q]) => {
        const it = (ev.items || []).find((x) => x.id === iid);
        return it ? `${esc(it.emoji || "")} ${q}× ${esc(it.label)}` : "";
      }).filter(Boolean);
      if (r.other) brings.push(`✨ ${esc(r.other)}`);
      return `<li class="person">
          <span class="av" style="background:${avColor(r.name)}">${esc(initials(r.name))}</span>
          <div>
            <div class="person-name">${esc(r.name)} <span class="status ${esc(r.status)}">${esc(STATUS[r.status] || "")}</span></div>
            <div class="person-sub">${r.apartment ? `Appart ${esc(r.apartment)}` : ""}${r.guests > 0 ? ` · +${Number(r.guests)} invité${r.guests > 1 ? "s" : ""}` : ""}</div>
            ${brings.length && r.status !== "no" ? `<div class="person-brings">Ramène : ${brings.join(", ")}</div>` : ""}
            ${r.message ? `<div class="person-msg">« ${esc(r.message)} »</div>` : ""}
          </div>
        </li>`;
    }).join("");

    const bringHTML = (ev.items || []).map((it) => {
      const left = Math.max(0, it.needed - (t.brought[it.id] || 0));
      return `<div class="bring-item ${left === 0 ? "is-full" : ""}" data-item="${esc(it.id)}" data-left="${left}">
          <span class="em" aria-hidden="true">${esc(it.emoji || "•")}</span>
          <span class="lbl">${esc(it.label)}<span class="rest">${left === 0 ? "Déjà couvert 🎉 (tu peux en ramener quand même)" : `Encore ${left} à trouver`}</span></span>
          <span class="stepper">
            <button type="button" data-step="-1" aria-label="Moins de ${esc(it.label)}">−</button>
            <output aria-live="polite">0</output>
            <button type="button" data-step="1" aria-label="Plus de ${esc(it.label)}">+</button>
          </span>
        </div>`;
    }).join("");

    const questionsHTML = (ev.questions || []).map((q) => {
      const name = `q_${esc(q.id)}`;
      if (q.type === "choice" && q.options?.length) {
        return `<div class="field"><label for="${name}">${esc(q.label)}</label>
          <select id="${name}" name="${name}"><option value="">—</option>${q.options.map((o) => `<option>${esc(o)}</option>`).join("")}</select></div>`;
      }
      return `<div class="field"><label for="${name}">${esc(q.label)}</label><input type="text" id="${name}" name="${name}" maxlength="200"></div>`;
    }).join("");

    root.innerHTML = `
      <div class="event-hero th-${theme}">
        <a class="back" href="#/events">← Tous les événements</a>
        <div class="event-hero-inner">
          <span class="event-emoji" aria-hidden="true">${esc(ev.emoji || "✨")}</span>
          <p class="eyebrow" style="margin-top:14px">${esc(ev.category || "Événement")}${past ? " · Terminé" : ""}</p>
          <h1>${esc(ev.title)}</h1>
          <div class="event-facts">
            <span class="fact">📅 ${esc(cap(fmtDay(d)))}</span>
            <span class="fact">🕗 ${esc(fmtTime(d))}${end ? ` → ${esc(fmtTime(end))}` : ""}</span>
            <span class="fact">📍 ${esc(ev.location || "Résidence LEONE")}</span>
            <span class="fact">👥 ${t.headcount}${ev.capacity ? ` / ${Number(ev.capacity)}` : ""} inscrit${t.headcount > 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      <div class="block event-layout">
        <div>
          <div class="panel reveal">
            <h2>Le programme</h2>
            <p class="desc">${esc(ev.description || "")}</p>
          </div>
          ${(ev.items || []).length ? `<div class="panel reveal"><h2>Ce qu'il nous faut</h2><div class="needs">${needsHTML}</div></div>` : ""}
          <div class="panel reveal">
            <h2>Qui vient ? <span class="going-count">(${responses.length} réponse${responses.length > 1 ? "s" : ""})</span></h2>
            ${responses.length ? `<ul class="people">${peopleHTML}</ul>` : `<p class="card-meta">Personne n'a encore répondu. Lance-toi !</p>`}
          </div>
        </div>

        <div class="sticky">
          <div class="panel" id="rsvpPanel">
            ${past ? `<h2>C'est terminé !</h2><p>Cet événement est passé. Merci à tous ceux qui sont venus 💛</p>` : `
            <h2>Je réponds</h2>
            ${full ? `<p class="tag" style="margin-bottom:12px">Complet — tu peux répondre « peut-être » pour la liste d'attente</p>` : ""}
            <form class="form" id="rsvpForm" novalidate>
              <div class="row">
                <div class="field"><label for="f_name">Prénom *</label><input type="text" id="f_name" name="name" required maxlength="40" autocomplete="given-name"></div>
                <div class="field"><label for="f_apt">Appart / étage</label><input type="text" id="f_apt" name="apartment" maxlength="20" placeholder="ex : B12"></div>
              </div>
              <div class="field">
                <span class="label">Tu viens ?</span>
                <div class="seg" role="radiogroup">
                  <input type="radio" name="status" id="st_yes" value="yes" ${full ? "" : "checked"}><label for="st_yes">Oui 🙌</label>
                  <input type="radio" name="status" id="st_maybe" value="maybe" ${full ? "checked" : ""}><label for="st_maybe">Peut-être</label>
                  <input type="radio" name="status" id="st_no" value="no"><label for="st_no">Non</label>
                </div>
              </div>
              ${ev.allowGuests ? `<div class="field"><label for="f_guests">Invités en plus de toi</label><input type="number" id="f_guests" name="guests" min="0" max="10" value="0"></div>` : ""}
              ${(ev.items || []).length ? `<div class="field" id="bringField"><span class="label">Je ramène…</span><small>Choisis dans la liste, les quantités restantes sont indiquées.</small><div class="bring">${bringHTML}</div></div>` : ""}
              <div class="field"><label for="f_other">Autre chose ?</label><input type="text" id="f_other" name="other" maxlength="120" placeholder="ex : un jeu de cartes, des glaçons…"></div>
              ${questionsHTML}
              <div class="field"><label for="f_msg">Un petit mot</label><textarea id="f_msg" name="message" maxlength="300" placeholder="Allez les Bleus !"></textarea></div>
              <button class="btn btn-primary" type="submit">Envoyer ma réponse →</button>
            </form>`}
          </div>
        </div>
      </div>`;

    // barres animées
    requestAnimationFrame(() => setTimeout(() => $$(".bar i", root).forEach((b) => (b.style.width = b.dataset.w + "%")), 150));

    const form = $("#rsvpForm");
    if (!form) return;
    const picks = {};
    form.addEventListener("click", (e) => {
      const b = e.target.closest("[data-step]");
      if (!b) return;
      const row = b.closest(".bring-item");
      const id = row.dataset.item;
      picks[id] = Math.max(0, Math.min(20, (picks[id] || 0) + Number(b.dataset.step)));
      $("output", row).textContent = picks[id];
      row.classList.toggle("is-picked", picks[id] > 0);
    });
    const toggleBring = () => {
      const no = form.status.value === "no";
      const bf = $("#bringField");
      if (bf) bf.style.display = no ? "none" : "";
    };
    $$("input[name=status]", form).forEach((r) => r.addEventListener("change", toggleBring));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      if (!name) { form.name.focus(); toast("Il nous faut au moins ton prénom 🙂"); return; }
      const answers = {};
      (ev.questions || []).forEach((q) => { const el = form[`q_${q.id}`]; if (el && el.value.trim()) answers[q.id] = el.value.trim(); });
      const status = form.status.value;
      const resp = {
        eventId: ev.id,
        name,
        apartment: form.apartment.value.trim(),
        status,
        guests: form.guests ? Math.max(0, Math.min(10, Number(form.guests.value) || 0)) : 0,
        items: status === "no" ? {} : Object.fromEntries(Object.entries(picks).filter(([, q]) => q > 0)),
        other: form.other.value.trim(),
        answers,
        message: form.message.value.trim()
      };
      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      try {
        await Store.addResponse(resp);
        $("#rsvpPanel").innerHTML = `<div class="success">
            <span class="big">${status === "no" ? "😢" : "🎉"}</span>
            <h2>${status === "no" ? "Dommage !" : "C'est noté !"}</h2>
            <p>${status === "no" ? "Merci d'avoir prévenu. Ce sera pour la prochaine !" : `Merci ${esc(name)}, à très vite${ev.location ? " · " + esc(ev.location) : ""}.`}</p>
          </div>`;
        toast("Réponse enregistrée ✓");
        setTimeout(() => renderEvent(id).then(() => observeReveals(root)), 2200);
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        toast("Erreur d'envoi, réessaie dans un instant.");
      }
    });
  }

  /* ---------------- ADMIN ---------------- */
  const ADMIN_KEY = "leone.admin";
  const isAdmin = () => { try { return sessionStorage.getItem(ADMIN_KEY) === "1"; } catch (e) { return false; } };

  function renderAdminLock() {
    $("#adminRoot").innerHTML = `
      <div class="admin-lock panel">
        <span class="event-emoji">🔐</span>
        <h2>Accès organisateur</h2>
        <p class="card-meta">Entre le code pour créer et gérer les événements.</p>
        <form class="form" id="lockForm">
          <div class="field"><label for="pin">Code</label><input type="password" id="pin" autocomplete="current-password" required></div>
          <button class="btn btn-primary" type="submit">Entrer</button>
        </form>
      </div>`;
    $("#lockForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if ($("#pin").value === String(cfg.adminPin || "")) {
        try { sessionStorage.setItem(ADMIN_KEY, "1"); } catch (err) { /* ignore */ }
        renderAdmin();
      } else {
        toast("Code incorrect");
        $("#pin").select();
      }
    });
  }

  async function renderAdmin(sub, id) {
    if (!isAdmin()) return renderAdminLock();
    if (sub === "new") return renderEditor(null);
    if (sub === "edit") return renderEditor(await Store.getEvent(id));
    if (sub === "responses") return renderResponses(id);

    const { events } = await load();
    const list = events.slice().sort(sortByStart).reverse();
    $("#adminRoot").innerHTML = `
      <div class="admin-bar">
        <h2 style="margin:0">Mes événements</h2>
        <div class="admin-actions">
          ${Store.remote ? "" : `<button class="btn btn-sm" id="resetDemo">Réinitialiser la démo</button>`}
          <button class="btn btn-sm" id="logout">Se déconnecter</button>
          <a class="btn btn-primary" href="#/admin/new">+ Nouvel événement</a>
        </div>
      </div>
      <div class="admin-list">
        ${list.length ? list.map((ev) => {
          const r = respFor(ev.id), t = tally(ev, r), d = toDate(ev.start);
          return `<div class="admin-row">
            <span class="em">${esc(ev.emoji || "✨")}</span>
            <div><h3>${esc(ev.title)}</h3><div class="meta">${esc(cap(fmtDay(d)))} ${esc(fmtTime(d))} · ${r.length} réponse${r.length > 1 ? "s" : ""} · ${t.headcount} participant${t.headcount > 1 ? "s" : ""}${isPast(ev) ? " · terminé" : ""}</div></div>
            <div class="admin-actions">
              <a class="btn btn-sm" href="#/event/${encodeURIComponent(ev.id)}">Voir</a>
              <a class="btn btn-sm" href="#/admin/responses/${encodeURIComponent(ev.id)}">Réponses</a>
              <a class="btn btn-sm" href="#/admin/edit/${encodeURIComponent(ev.id)}">Modifier</a>
              <button class="btn btn-sm" data-dup="${esc(ev.id)}">Dupliquer</button>
              <button class="btn btn-sm btn-danger" data-del="${esc(ev.id)}">Supprimer</button>
            </div>
          </div>`;
        }).join("") : `<div class="empty">Aucun événement. Crée le premier !</div>`}
      </div>`;

    $("#logout").onclick = () => { try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) { /* ignore */ } renderAdminLock(); };
    const rd = $("#resetDemo");
    if (rd) rd.onclick = () => { if (confirm("Remettre les données de démo (efface tout le reste) ?")) { Store.resetDemo(); renderAdmin(); toast("Démo réinitialisée"); } };
    $("#adminRoot").onclick = async (e) => {
      const del = e.target.closest("[data-del]");
      const dup = e.target.closest("[data-dup]");
      if (del) {
        const ev = cache.events.find((x) => x.id === del.dataset.del);
        if (ev && confirm(`Supprimer « ${ev.title} » et toutes ses réponses ?`)) {
          await Store.deleteEvent(ev.id); toast("Événement supprimé"); renderAdmin();
        }
      }
      if (dup) {
        const ev = cache.events.find((x) => x.id === dup.dataset.dup);
        if (ev) {
          const copy = JSON.parse(JSON.stringify(ev));
          delete copy.id; delete copy.createdAt; copy.title += " (copie)";
          const saved = await Store.saveEvent(copy);
          toast("Copie créée"); location.hash = `#/admin/edit/${encodeURIComponent(saved.id)}`;
        }
      }
    };
  }

  function itemRowHTML(it = {}) {
    return `<div class="builder-row" data-row="item">
      <input type="text" name="i_emoji" value="${esc(it.emoji || "")}" placeholder="🍕" maxlength="4" aria-label="Emoji">
      <input type="text" name="i_label" value="${esc(it.label || "")}" placeholder="ex : Pizzas" maxlength="60" aria-label="Objet ou nourriture">
      <input type="number" name="i_needed" value="${Number(it.needed) || 1}" min="1" max="99" aria-label="Quantité souhaitée">
      <input type="hidden" name="i_id" value="${esc(it.id || "")}">
      <button type="button" class="icon-btn" data-remove aria-label="Retirer">✕</button>
    </div>`;
  }
  function questionRowHTML(q = {}) {
    return `<div class="builder-row q" data-row="question">
      <input type="text" name="q_label" value="${esc(q.label || "")}" placeholder="ex : Allergies ?" maxlength="100" aria-label="Question">
      <select name="q_type" aria-label="Type de réponse">
        <option value="text" ${q.type !== "choice" ? "selected" : ""}>Texte libre</option>
        <option value="choice" ${q.type === "choice" ? "selected" : ""}>Choix</option>
      </select>
      <button type="button" class="icon-btn" data-remove aria-label="Retirer">✕</button>
      <input type="hidden" name="q_id" value="${esc(q.id || "")}">
      <input type="text" class="q-opts" name="q_opts" value="${esc((q.options || []).join(" | "))}" placeholder="Options séparées par |  (pour « Choix »)" ${q.type === "choice" ? "" : "hidden"}>
    </div>`;
  }

  function renderEditor(ev) {
    const isNew = !ev;
    ev = ev || { theme: "sunset", allowGuests: true, items: [], questions: [], emoji: "🎉", category: "Soirée" };
    $("#adminRoot").innerHTML = `
      <div class="admin-bar"><h2 style="margin:0">${isNew ? "Nouvel événement" : "Modifier l'événement"}</h2><a class="btn btn-sm" href="#/admin">← Retour</a></div>
      <form class="form panel" id="evForm">
        <div class="row-3">
          <div class="field"><label for="e_emoji">Emoji</label><input type="text" id="e_emoji" name="emoji" value="${esc(ev.emoji)}" maxlength="4"></div>
          <div class="field" style="grid-column: span 2"><label for="e_title">Titre *</label><input type="text" id="e_title" name="title" value="${esc(ev.title || "")}" required maxlength="80"></div>
        </div>
        <div class="row">
          <div class="field"><label for="e_cat">Catégorie</label><input type="text" id="e_cat" name="category" value="${esc(ev.category || "")}" list="cats" maxlength="30">
            <datalist id="cats"><option>Match</option><option>Soirée</option><option>Repas partagé</option><option>Apéro</option><option>Jeux</option><option>Ciné</option><option>Sport</option><option>Anniversaire</option></datalist></div>
          <div class="field"><label for="e_loc">Lieu</label><input type="text" id="e_loc" name="location" value="${esc(ev.location || "")}" maxlength="80" placeholder="Salle commune, toit, cour…"></div>
        </div>
        <div class="row-3">
          <div class="field"><label for="e_start">Début *</label><input type="datetime-local" id="e_start" name="start" value="${esc(ev.start || "")}" required></div>
          <div class="field"><label for="e_end">Fin</label><input type="datetime-local" id="e_end" name="end" value="${esc(ev.end || "")}"></div>
          <div class="field"><label for="e_cap">Places max</label><input type="number" id="e_cap" name="capacity" value="${ev.capacity || ""}" min="0" placeholder="illimité"></div>
        </div>
        <div class="field"><label for="e_desc">Description</label><textarea id="e_desc" name="description" rows="5" maxlength="2000">${esc(ev.description || "")}</textarea></div>
        <div class="field"><span class="label">Couleur de la carte</span>
          <div class="themes">${THEMES.map((t) => `<input type="radio" name="theme" id="th_${t}" value="${t}" ${ev.theme === t ? "checked" : ""}><label for="th_${t}" class="th-${t}" title="${t}"></label>`).join("")}</div>
        </div>
        <label class="check"><input type="checkbox" name="allowGuests" ${ev.allowGuests ? "checked" : ""}> Les résidents peuvent venir avec des invités</label>

        <fieldset class="fieldset">
          <legend>🧺 Ce que les gens peuvent ramener</legend>
          <p class="card-meta">Emoji · objet ou nourriture · quantité souhaitée</p>
          <div class="builder" id="itemsB">${(ev.items || []).map(itemRowHTML).join("")}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            <button type="button" class="btn btn-sm" id="addItem">+ Ajouter un élément</button>
            <button type="button" class="btn btn-sm" data-preset="apero">Pack apéro</button>
            <button type="button" class="btn btn-sm" data-preset="repas">Pack repas</button>
            <button type="button" class="btn btn-sm" data-preset="matos">Pack matériel</button>
          </div>
        </fieldset>

        <fieldset class="fieldset">
          <legend>❓ Questions en plus (optionnel)</legend>
          <div class="builder" id="questionsB">${(ev.questions || []).map(questionRowHTML).join("")}</div>
          <button type="button" class="btn btn-sm" id="addQ" style="margin-top:12px">+ Ajouter une question</button>
        </fieldset>

        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn btn-primary" type="submit">${isNew ? "Publier l'événement" : "Enregistrer"}</button>
          <a class="btn" href="#/admin">Annuler</a>
        </div>
      </form>`;

    const PRESETS = {
      apero: [["🥨", "Chips & biscuits apéro", 4], ["🥤", "Softs", 4], ["🍷", "Vin / bières", 3], ["🧀", "Fromage / charcuterie", 2]],
      repas: [["🥗", "Entrée / salade", 3], ["🍲", "Plat à partager", 4], ["🍰", "Dessert", 3], ["🥖", "Pain", 2], ["🍽️", "Assiettes & couverts", 2]],
      matos: [["🔊", "Enceinte", 1], ["🪑", "Chaises", 6], ["🔌", "Multiprise / rallonge", 2], ["💡", "Guirlande lumineuse", 2]]
    };
    const iB = $("#itemsB"), qB = $("#questionsB"), form = $("#evForm");
    $("#addItem").onclick = () => { iB.insertAdjacentHTML("beforeend", itemRowHTML()); $("input[name=i_label]", iB.lastElementChild).focus(); };
    $("#addQ").onclick = () => { qB.insertAdjacentHTML("beforeend", questionRowHTML()); $("input[name=q_label]", qB.lastElementChild).focus(); };
    $$("[data-preset]", form).forEach((b) => (b.onclick = () =>
      PRESETS[b.dataset.preset].forEach(([emoji, label, needed]) => iB.insertAdjacentHTML("beforeend", itemRowHTML({ emoji, label, needed })))));
    form.addEventListener("click", (e) => { const r = e.target.closest("[data-remove]"); if (r) r.closest(".builder-row").remove(); });
    form.addEventListener("change", (e) => {
      if (e.target.name === "q_type") $("[name=q_opts]", e.target.closest(".builder-row")).hidden = e.target.value !== "choice";
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.title.value.trim() || !form.start.value) { toast("Titre et date de début obligatoires"); return; }
      const items = $$("[data-row=item]", iB).map((r) => ({
        id: $("[name=i_id]", r).value || Store.uid().slice(0, 8),
        emoji: $("[name=i_emoji]", r).value.trim(),
        label: $("[name=i_label]", r).value.trim(),
        needed: Math.max(1, Number($("[name=i_needed]", r).value) || 1)
      })).filter((i) => i.label);
      const questions = $$("[data-row=question]", qB).map((r) => ({
        id: $("[name=q_id]", r).value || Store.uid().slice(0, 8),
        label: $("[name=q_label]", r).value.trim(),
        type: $("[name=q_type]", r).value,
        options: $("[name=q_opts]", r).value.split("|").map((s) => s.trim()).filter(Boolean)
      })).filter((q) => q.label);
      const data = {
        ...(isNew ? {} : ev),
        title: form.title.value.trim(),
        emoji: form.emoji.value.trim() || "✨",
        category: form.category.value.trim(),
        location: form.location.value.trim(),
        start: form.start.value,
        end: form.end.value,
        capacity: Number(form.capacity.value) || 0,
        description: form.description.value.trim(),
        theme: form.theme.value || "sunset",
        allowGuests: form.allowGuests.checked,
        items,
        questions
      };
      try {
        const saved = await Store.saveEvent(data);
        toast(isNew ? "Événement publié 🚀" : "Modifications enregistrées");
        location.hash = `#/event/${encodeURIComponent(saved.id)}`;
      } catch (err) {
        console.error(err); toast("Erreur lors de l'enregistrement");
      }
    });
  }

  async function renderResponses(id) {
    const ev = await Store.getEvent(id);
    if (!ev) { location.hash = "#/admin"; return; }
    const rs = await Store.listResponses(id);
    const t = tally(ev, rs);
    const itemName = (iid) => { const it = (ev.items || []).find((x) => x.id === iid); return it ? it.label : iid; };
    const qs = ev.questions || [];
    const rows = rs.map((r) => ({
      r,
      cells: [
        new Date(r.createdAt).toLocaleString("fr-FR"), r.name, r.apartment, STATUS[r.status] || r.status, r.guests || 0,
        Object.entries(r.items || {}).map(([k, q]) => `${q}× ${itemName(k)}`).join(", "), r.other || "",
        ...qs.map((q) => (r.answers || {})[q.id] || ""), r.message || ""
      ]
    }));
    const head = ["Date", "Prénom", "Appart", "Réponse", "Invités", "Ramène", "Autre", ...qs.map((q) => q.label), "Message"];

    $("#adminRoot").innerHTML = `
      <div class="admin-bar">
        <h2 style="margin:0">${esc(ev.emoji || "")} ${esc(ev.title)} — réponses</h2>
        <div class="admin-actions"><button class="btn btn-sm" id="csv">Exporter CSV</button><a class="btn btn-sm" href="#/admin">← Retour</a></div>
      </div>
      <div class="stats" style="margin-bottom:24px">
        <div class="stat"><strong>${t.headcount}</strong><span>personnes attendues</span></div>
        <div class="stat"><strong>${rs.filter((r) => r.status === "maybe").length}</strong><span>peut-être</span></div>
        <div class="stat"><strong>${rs.filter((r) => r.status === "no").length}</strong><span>absents</span></div>
      </div>
      ${(ev.items || []).length ? `<div class="panel" style="margin-bottom:24px"><h2>Récap des apports</h2><div class="needs">${(ev.items || []).map((it) => {
        const got = t.brought[it.id] || 0;
        return `<div class="need ${got >= it.needed ? "is-full" : ""}"><span class="need-emoji">${esc(it.emoji || "•")}</span><span class="need-label">${esc(it.label)}</span><span class="need-count">${got}/${it.needed}</span><span class="bar"><i style="width:${Math.min(100, (got / it.needed) * 100)}%"></i></span></div>`;
      }).join("")}</div></div>` : ""}
      <div class="table-wrap">
        <table>
          <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}<th></th></tr></thead>
          <tbody>${rows.length ? rows.map(({ r, cells }) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}<td><button class="icon-btn" data-delr="${esc(r.id)}" aria-label="Supprimer la réponse de ${esc(r.name)}">🗑</button></td></tr>`).join("") : `<tr><td colspan="${head.length + 1}">Aucune réponse pour l'instant.</td></tr>`}</tbody>
        </table>
      </div>`;

    $("#csv").onclick = () => {
      const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
      const csv = [head, ...rows.map((x) => x.cells)].map((l) => l.map(q).join(";")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      a.download = `leone-${ev.id}-reponses.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    $("#adminRoot").onclick = async (e) => {
      const b = e.target.closest("[data-delr]");
      if (b && confirm("Supprimer cette réponse ?")) { await Store.deleteResponse(b.dataset.delr); toast("Réponse supprimée"); renderResponses(id); }
    };
  }

  /* ---------------- Routeur ---------------- */
  async function route() {
    const h = location.hash;
    if (h && !h.startsWith("#/")) return; // ancre interne (ex : #main)
    const [name = "", sub, id] = h.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const view = name || "home";
    const known = ["home", "events", "event", "residence", "how", "admin"];
    const v = known.includes(view) ? view : "home";

    $$(".view").forEach((s) => (s.hidden = s.dataset.view !== v));
    $$(".nav a").forEach((a) => a.classList.toggle("is-active", a.dataset.route === (v === "event" ? "events" : v)));
    closeMenu();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    if (v !== "home") clearInterval(countdownTimer);

    try {
      if (v === "home") await renderHome();
      if (v === "events") await renderEvents();
      if (v === "event") await renderEvent(sub);
      if (v === "admin") await renderAdmin(sub, id);
    } catch (err) {
      console.error(err);
      toast("Impossible de charger les données. Vérifie la configuration.");
    }
    document.title = v === "home" ? "LEONE — Les événements de la résidence"
      : `${$(".nav a.is-active")?.textContent || "LEONE"} · LEONE`;
    observeReveals();
  }

  /* ---------------- Menu mobile & header ---------------- */
  const burger = $("#burger"), nav = $("#nav");
  function closeMenu() { nav.classList.remove("is-open"); burger.setAttribute("aria-expanded", "false"); }
  burger.addEventListener("click", () => {
    const open = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", String(open));
  });
  let lastY = 0;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    $("#topbar").classList.toggle("is-hidden", y > lastY && y > 200 && !nav.classList.contains("is-open"));
    lastY = y;
  }, { passive: true });

  // effet parallaxe léger du soleil dans le hero
  const sun = $(".sun");
  window.addEventListener("pointermove", (e) => {
    if (!sun || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const x = (e.clientX / innerWidth - 0.5) * 20, y = (e.clientY / innerHeight - 0.5) * 14;
    sun.style.translate = `${x}px ${y}px`;
  }, { passive: true });

  if (!Store.remote) {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem("leone.demoHidden") === "1"; } catch (e) { /* ignore */ }
    $("#demoBanner").hidden = dismissed;
    $("#demoClose").onclick = () => {
      $("#demoBanner").hidden = true;
      try { sessionStorage.setItem("leone.demoHidden", "1"); } catch (e) { /* ignore */ }
    };
  }
  window.addEventListener("hashchange", route);
  route();
})();
