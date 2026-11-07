/* =============================================================
   LEONE — application (routeur, rendu, formulaires, admin, FR/EN)
   ============================================================= */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const THEMES = ["sunset", "tricolore", "ocean", "neon", "forest"];
  const AV_COLORS = ["#7b5cff", "#ff5a1f", "#19b5a5", "#ff4f8b", "#1d3fbb", "#2f9e5b"];
  const EMPTY_STATS = { headcount: 0, replies: 0, brought: {}, attendees: [] };

  /* ---------------- Langue ---------------- */
  const LANG_KEY = "leone.lang";
  let lang = (() => {
    try { const s = localStorage.getItem(LANG_KEY); if (s === "fr" || s === "en") return s; } catch (e) { /* ignore */ }
    return (navigator.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
  })();
  const locale = () => (lang === "fr" ? "fr-FR" : "en-GB");

  function t(key, vars = {}) {
    const dict = window.I18N[lang] || {};
    const s = key in dict ? dict[key] : (window.I18N.fr[key] ?? key);
    if (typeof s !== "string") return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  }
  function tp(key, n, vars = {}) {
    const plural = lang === "fr" ? n > 1 : n !== 1;
    return t(`${key}_${plural ? "pl" : "sg"}`, { n, ...vars });
  }
  const loc = (obj, field) => (lang === "en" && obj && obj[`${field}_en`]) || (obj ? obj[field] : "") || "";
  const locOpts = (q) => (lang === "en" && q.options_en && q.options_en.length === (q.options || []).length ? q.options_en : q.options || []);
  const errMsg = (err) => t(`err.${err && err.code}`) !== `err.${err && err.code}` ? t(`err.${err.code}`) : t("load.error");

  function applyStatic() {
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
    $$("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    $$(".lang [data-lang]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.lang === lang);
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    });
  }
  $$(".lang [data-lang]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.lang === lang) return;
    lang = b.dataset.lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
    applyStatic();
    route(true);
  }));

  /* ---------------- Mémo local des événements auxquels j'ai répondu (affichage seulement) ---------------- */
  const ANS_KEY = "leone.answered";
  const answered = {
    get() { try { return JSON.parse(localStorage.getItem(ANS_KEY) || "[]"); } catch (e) { return []; } },
    has(id) { return this.get().includes(id); },
    add(id) { try { const a = this.get(); if (!a.includes(id)) localStorage.setItem(ANS_KEY, JSON.stringify([...a, id])); } catch (e) { /* ignore */ } }
  };

  /* ---------------- Dates ---------------- */
  const toDate = (s) => (s ? new Date(s) : null);
  const fmtDay = (d) => d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
  const fmtTime = (d) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const fmtShortMonth = (d) => d.toLocaleDateString(locale(), { month: "short" }).replace(".", "");
  const isPast = (ev) => (toDate(ev.end) || new Date(toDate(ev.start).getTime() + 3 * 3600e3)) < new Date();
  const sortByStart = (a, b) => toDate(a.start) - toDate(b.start);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const initials = (name) => (name ? name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() : "?");
  const avColor = (name) => AV_COLORS[[...(name || "?")].reduce((n, c) => n + c.charCodeAt(0), 0) % AV_COLORS.length];

  /* ---------------- Toast ---------------- */
  let toastT;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("is-on"), 4200);
  }

  /* ---------------- Reveal ---------------- */
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      }), { threshold: 0.08 })
    : null;
  const observeReveals = (root = document) =>
    $$(".reveal:not(.is-in)", root).forEach((el) => (io ? io.observe(el) : el.classList.add("is-in")));

  /* ---------------- Carte événement ---------------- */
  function cardHTML(ev, st) {
    const d = toDate(ev.start);
    const theme = THEMES.includes(ev.theme) ? ev.theme : "sunset";
    return `
      <a class="card th-${theme} reveal ${isPast(ev) ? "is-past" : ""}" href="#/event/${encodeURIComponent(ev.id)}">
        <div class="card-cover">
          <div class="card-date"><strong>${d.getDate()}</strong><span>${esc(fmtShortMonth(d))}</span></div>
          ${answered.has(ev.id) ? `<span class="card-badge">${esc(t("card.answered"))}</span>` : ""}
          <span class="card-emoji" aria-hidden="true">${esc(ev.emoji || "✨")}</span>
        </div>
        <div class="card-body">
          <h3>${esc(loc(ev, "title"))}</h3>
          <div class="card-meta">${esc(cap(fmtDay(d)))} · ${esc(fmtTime(d))}</div>
          ${loc(ev, "location") ? `<div class="card-meta">${esc(loc(ev, "location"))}</div>` : ""}
          <div class="card-foot"><span class="going-count">${esc(tp("participants", st.headcount))}</span><span aria-hidden="true">→</span></div>
        </div>
      </a>`;
  }

  /* ---------------- Accueil ---------------- */
  let countdownTimer;
  let currentFilter = "upcoming";
  async function renderHome() {
    const [events, stats] = await Promise.all([Store.listEvents(), Store.stats()]);
    const sorted = events.slice().sort(sortByStart);
    const upcoming = sorted.filter((e) => !isPast(e));
    const list = currentFilter === "past" ? sorted.filter(isPast).reverse() : upcoming;
    $("#eventList").innerHTML = list.length
      ? list.map((e) => cardHTML(e, stats[e.id] || EMPTY_STATS)).join("")
      : `<div class="empty">${esc(t(currentFilter === "past" ? "events.nonePast" : "events.noneUpcoming"))}</div>`;

    const next = upcoming[0];
    const nc = $("#nextCard");
    clearInterval(countdownTimer);
    nc.hidden = !next;
    if (!next) return;
    const d = toDate(next.start);
    nc.innerHTML = `
      <span class="tag tag-live">${esc(t("next.tag"))}</span>
      <h3>${esc(next.emoji || "")} ${esc(loc(next, "title"))}</h3>
      <p class="card-meta">${esc(cap(fmtDay(d)))} · ${esc(fmtTime(d))}</p>
      <div class="countdown">
        ${["d", "h", "m", "s"].map((u) => `<div><strong data-u="${u}">00</strong><span>${esc(t(`cd.${u}`))}</span></div>`).join("")}
      </div>
      <a class="btn btn-primary" href="#/event/${encodeURIComponent(next.id)}">${esc(t(answered.has(next.id) ? "next.answered" : "next.cta"))}</a>`;
    const tick = () => {
      const ms = Math.max(0, d - new Date());
      const u = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
      Object.entries(u).forEach(([k, v]) => { const el = $(`[data-u="${k}"]`, nc); if (el) el.textContent = String(v).padStart(2, "0"); });
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    currentFilter = b.dataset.filter;
    $$("#filters .chip").forEach((c) => { c.classList.toggle("is-active", c === b); c.setAttribute("aria-selected", c === b); });
    renderHome().then(() => observeReveals($("#eventList")));
  });

  /* ---------------- Page événement ---------------- */
  async function renderEvent(id, editing = false) {
    const root = $("#eventDetail");
    const ev = await Store.getEvent(id);
    if (!ev) {
      root.innerHTML = `<div class="page-head"><h1>${esc(t("ev.notFoundT"))}</h1><p class="lead">${esc(t("ev.notFoundP"))}</p><a class="btn btn-dark" href="#/">${esc(t("ev.back"))}</a></div>`;
      return;
    }
    const [stats, mine, pot] = await Promise.all([Store.stats(ev.id), Store.myResponse(ev.id), Store.getPot().catch(() => null)]);
    const funded = pot ? pot.entries.filter((e) => e.kind === "out" && e.eventId === ev.id) : [];
    const st = stats[ev.id] || EMPTY_STATS;
    if (mine) answered.add(ev.id);
    const d = toDate(ev.start), end = toDate(ev.end);
    const theme = THEMES.includes(ev.theme) ? ev.theme : "sunset";
    const past = isPast(ev);
    const items = ev.items || [];
    const itemLabel = (iid) => { const it = items.find((x) => x.id === iid); return it ? `${it.emoji || ""} ${loc(it, "label")}`.trim() : ""; };

    const needsHTML = items.map((it) => {
      const got = st.brought[it.id] || 0;
      const pct = it.needed ? Math.min(100, (got / it.needed) * 100) : 0;
      return `<div class="need ${got >= it.needed ? "is-full" : ""}">
          <span class="need-emoji" aria-hidden="true">${esc(it.emoji || "•")}</span>
          <span class="need-label">${esc(loc(it, "label"))}</span>
          <span class="need-count">${got}/${it.needed}</span>
          <span class="bar"><i data-w="${pct}"></i></span>
        </div>`;
    }).join("");

    const peopleHTML = st.attendees.map((a) => {
      const brings = Object.entries(a.items || {}).map(([iid, q]) => (itemLabel(iid) ? `${q}× ${esc(itemLabel(iid))}` : "")).filter(Boolean);
      if (a.other) brings.push(esc(a.other));
      const shown = a.name || t("neighbour");
      return `<li class="person ${a.name ? "" : "is-anon"}">
          <span class="av" style="background:${a.name ? avColor(a.name) : "#9a96b8"}">${a.name ? esc(initials(a.name)) : "·"}</span>
          <div>
            <div class="person-name">${esc(shown)} <span class="status ${esc(a.status)}">${esc(t(`status.${a.status}`))}</span>${a.guests > 0 ? ` <span class="person-sub">${esc(tp("guests", a.guests))}</span>` : ""}</div>
            ${brings.length ? `<div class="person-brings">${brings.join(" · ")}</div>` : ""}
          </div>
        </li>`;
    }).join("");

    root.innerHTML = `
      <div class="event-hero th-${theme}">
        <a class="back" href="#/">${esc(t("ev.back"))}</a>
        <div class="event-hero-inner">
          <span class="event-emoji" aria-hidden="true">${esc(ev.emoji || "✨")}</span>
          ${loc(ev, "category") || past ? `<p class="eyebrow">${esc(loc(ev, "category"))}${past ? (loc(ev, "category") ? " · " : "") + esc(t("ev.over")) : ""}</p>` : ""}
          <h1>${esc(loc(ev, "title"))}</h1>
          <div class="event-facts">
            <span class="fact">${esc(cap(fmtDay(d)))}</span>
            <span class="fact">${esc(fmtTime(d))}${end ? ` – ${esc(fmtTime(end))}` : ""}</span>
            ${loc(ev, "location") ? `<span class="fact">${esc(loc(ev, "location"))}</span>` : ""}
            <span class="fact">${esc(tp("participants", st.headcount))}${ev.capacity ? ` / ${Number(ev.capacity)}` : ""}</span>
          </div>
          ${loc(ev, "description") ? `<p class="desc">${esc(loc(ev, "description"))}</p>` : ""}
        </div>
      </div>

      <div class="block event-layout">
        <div>
          ${items.length ? `<div class="panel reveal"><h2>${esc(t("ev.needs"))}</h2><div class="needs">${needsHTML}</div></div>` : ""}
          ${funded.length ? `<div class="panel reveal"><h2>🪙 ${esc(t("pot.eventFunded"))}</h2>${ledgerHTML(funded, [], false)}<p class="ledger-total">${esc(money(funded.reduce((n, e) => n + e.cents, 0)))}</p><a class="link" href="#/pot">${esc(t("pot.see"))}</a></div>` : ""}
          <div class="panel reveal">
            <h2>${esc(t("ev.who"))} <span class="going-count">· ${esc(tp("responses", st.replies))}</span></h2>
            ${st.attendees.length ? `<ul class="people">${peopleHTML}</ul>` : `<p class="card-meta">${esc(t("ev.nobody"))}</p>`}
          </div>
        </div>
        <div class="sticky"><div class="panel" id="rsvpPanel"></div></div>
      </div>`;

    requestAnimationFrame(() => setTimeout(() => $$(".bar i", root).forEach((b) => (b.style.width = b.dataset.w + "%")), 150));

    const panel = $("#rsvpPanel");
    if (past) {
      panel.innerHTML = `<h2>${esc(t("ev.pastT"))}</h2><p class="card-meta">${esc(t("ev.pastP"))}</p>`;
    } else if (mine && !editing) {
      const brings = Object.entries(mine.items || {}).map(([iid, q]) => `${q}× ${itemLabel(iid)}`);
      if (mine.other) brings.push(mine.other);
      panel.innerHTML = `
        <div class="mine">
          <h2>${esc(t("mine.title"))}</h2>
          <p class="mine-status"><strong>${esc(mine.name)}</strong> <span class="status ${esc(mine.status)}">${esc(t(`status.${mine.status}`))}</span>${mine.guests > 0 ? ` · ${esc(tp("guests", mine.guests))}` : ""}</p>
          ${mine.status !== "no" ? `<p>${esc(brings.length ? t("mine.brings", { x: brings.join(", ") }) : t("mine.nothing"))}</p>` : ""}
          <p class="card-meta">${esc(t("mine.text"))}</p>
          <button class="btn" id="editMine">${esc(t("mine.edit"))}</button>
        </div>`;
      $("#editMine").onclick = () => renderEvent(id, true);
    } else {
      renderForm(panel, ev, st, editing ? mine : null);
    }
  }

  function renderForm(panel, ev, st, mine) {
    const items = ev.items || [];
    const fullNow = ev.capacity && st.headcount - (mine && mine.status === "yes" ? 1 + mine.guests : 0) >= ev.capacity;
    const status = mine ? mine.status : fullNow ? "maybe" : "yes";
    const picks = { ...((mine && mine.items) || {}) };

    const bringHTML = items.map((it) => {
      const others = (st.brought[it.id] || 0) - ((mine && mine.items && mine.items[it.id]) || 0);
      const left = Math.max(0, it.needed - others);
      const label = loc(it, "label");
      const q = picks[it.id] || 0;
      return `<div class="bring-item ${q > 0 ? "is-picked" : ""} ${left === 0 && !q ? "is-full" : ""}" data-item="${esc(it.id)}">
          <span class="em" aria-hidden="true">${esc(it.emoji || "•")}</span>
          <span class="lbl">${esc(label)}<span class="rest">${esc(left === 0 ? t("form.covered") : t("form.left", { n: left }))}</span></span>
          <span class="stepper">
            <button type="button" data-step="-1" aria-label="${esc(t("form.less", { x: label }))}">−</button>
            <output aria-live="polite">${q}</output>
            <button type="button" data-step="1" aria-label="${esc(t("form.more", { x: label }))}">+</button>
          </span>
        </div>`;
    }).join("");

    const questionsHTML = (ev.questions || []).map((qq) => {
      const name = `q_${esc(qq.id)}`;
      const val = (mine && mine.answers && mine.answers[qq.id]) || "";
      if (qq.type === "choice" && (qq.options || []).length) {
        return `<div class="field"><label for="${name}">${esc(loc(qq, "label"))}</label>
          <select id="${name}" name="${name}"><option value="">—</option>${locOpts(qq).map((o) => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
      }
      return `<div class="field"><label for="${name}">${esc(loc(qq, "label"))}</label><input type="text" id="${name}" name="${name}" maxlength="200" value="${esc(val)}"></div>`;
    }).join("");

    panel.innerHTML = `
      <h2>${esc(t("form.title"))}</h2>
      ${fullNow ? `<p class="notice">${esc(t("ev.full"))}</p>` : ""}
      <form class="form" id="rsvpForm" novalidate autocomplete="off">
        <div class="field">
          <label for="f_name">${esc(t("form.name"))}</label>
          <input type="text" id="f_name" name="fname" required maxlength="40" autocomplete="given-name" value="${esc(mine ? mine.name : "")}">
          <small>${esc(t("form.nameHint"))}</small>
        </div>
        <label class="check">
          <input type="checkbox" name="showName" ${mine && mine.showName ? "checked" : ""}>
          <span>${esc(t("form.showName"))}<small>${esc(t("form.showNameHint"))}</small></span>
        </label>
        <div class="field">
          <span class="label" id="lblComing">${esc(t("form.coming"))}</span>
          <div class="seg" role="radiogroup" aria-labelledby="lblComing">
            ${["yes", "maybe", "no"].map((s) => `<input type="radio" name="status" id="st_${s}" value="${s}" ${status === s ? "checked" : ""}><label for="st_${s}">${esc(t(`form.${s}`))}</label>`).join("")}
          </div>
        </div>
        <div class="when-coming">
          ${ev.allowGuests ? `<div class="field"><label for="f_guests">${esc(t("form.guests"))}</label><input type="number" id="f_guests" name="guests" min="0" max="10" value="${mine ? mine.guests : 0}" inputmode="numeric"></div>` : ""}
          ${items.length ? `<div class="field"><span class="label">${esc(t("form.bring"))}</span><div class="bring">${bringHTML}</div></div>` : ""}
          <div class="field"><label for="f_other">${esc(t("form.other"))}</label><input type="text" id="f_other" name="other" maxlength="120" placeholder="${esc(t("form.otherPh"))}" value="${esc(mine ? mine.other : "")}"></div>
        </div>
        ${questionsHTML}
        <div class="field">
          <label for="f_msg">${esc(t("form.msg"))}</label>
          <textarea id="f_msg" name="message" maxlength="300">${esc(mine ? mine.message : "")}</textarea>
          <small>🔒 ${esc(t("form.msgHint"))}</small>
        </div>
        <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit">${esc(t(mine ? "form.update" : "form.submit"))}</button>
          ${mine ? `<button class="btn" type="button" id="cancelEdit">${esc(t("form.cancelEdit"))}</button>` : ""}
        </div>
      </form>`;

    const form = $("#rsvpForm");
    const shownAt = Date.now();
    const toggleComing = () => ($(".when-coming", form).hidden = form.status.value === "no");
    toggleComing();
    $$("input[name=status]", form).forEach((r) => r.addEventListener("change", toggleComing));
    if (mine) $("#cancelEdit").onclick = () => renderEvent(ev.id);

    form.addEventListener("click", (e) => {
      const b = e.target.closest("[data-step]");
      if (!b) return;
      const row = b.closest(".bring-item");
      const iid = row.dataset.item;
      picks[iid] = Math.max(0, Math.min(20, (picks[iid] || 0) + Number(b.dataset.step)));
      $("output", row).textContent = picks[iid];
      row.classList.toggle("is-picked", picks[iid] > 0);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      // anti-robot : champ piège rempli → on fait semblant que tout va bien
      if (form.website.value) { panel.innerHTML = `<p>${esc(t("form.saved"))}</p>`; return; }
      if (Date.now() - shownAt < 2500) { toast(t("form.tooFast")); return; }
      const name = form.fname.value.replace(/\s+/g, " ").trim();
      if (!name) { form.fname.focus(); toast(t("form.needName")); return; }
      const answers = {};
      (ev.questions || []).forEach((qq) => { const el = form[`q_${qq.id}`]; if (el && el.value.trim()) answers[qq.id] = el.value.trim(); });
      const st2 = form.status.value;
      const payload = {
        eventId: ev.id, name, showName: form.showName.checked, status: st2,
        guests: form.guests ? Math.max(0, Math.min(10, parseInt(form.guests.value, 10) || 0)) : 0,
        items: st2 === "no" ? {} : Object.fromEntries(Object.entries(picks).filter(([, q]) => q > 0)),
        other: st2 === "no" ? "" : form.other.value.trim(),
        answers, message: form.message.value.trim(), lang
      };
      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      try {
        await Store.submitResponse(payload, Boolean(mine));
        answered.add(ev.id);
        toast(t(mine ? "form.updated" : "form.saved"));
        await renderEvent(ev.id);
        observeReveals($("#eventDetail"));
      } catch (err) {
        if (!err.code) console.error(err);
        btn.disabled = false;
        toast(errMsg(err));
        if (err.code === "ALREADY_ANSWERED") renderEvent(ev.id);
        if (err.code === "NAME_TAKEN") form.fname.focus();
      }
    });
  }

  /* ---------------- ORGANISER ---------------- */
  function renderAdminLock() {
    const account = Store.authMode === "account";
    $("#adminRoot").innerHTML = `
      <div class="admin-lock panel">
        <h2>🔐 ${esc(t("lock.title"))}</h2>
        <form class="form" id="lockForm">
          ${account ? `<div class="field"><label for="lk_email">${esc(t("lock.email"))}</label><input type="email" id="lk_email" autocomplete="username" required></div>` : ""}
          <div class="field"><label for="lk_pw">${esc(t(account ? "lock.password" : "lock.code"))}</label><input type="password" id="lk_pw" autocomplete="current-password" required></div>
          <button class="btn btn-primary" type="submit">${esc(t("lock.enter"))}</button>
        </form>
      </div>`;
    let fails = 0;
    $("#lockForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#lockForm button");
      btn.disabled = true;
      try {
        await Store.login(account ? $("#lk_email").value.trim() : "", $("#lk_pw").value);
        renderAdmin();
      } catch (err) {
        fails++;
        toast(errMsg(err));
        // ralentit les essais en série
        setTimeout(() => { btn.disabled = false; }, Math.min(30000, 1000 * 2 ** fails));
        $("#lk_pw").select();
      }
    });
  }

  async function renderAdmin(sub, id) {
    $("#adminRoot").onclick = null;
    if (!(await Store.isAdmin())) return renderAdminLock();
    if (sub === "new") return renderEditor(null);
    if (sub === "edit") return renderEditor(await Store.getEvent(id));
    if (sub === "responses") return renderResponses(id);
    if (sub === "proposals") return renderAdminProposals();
    if (sub === "pot") return renderAdminPot();

    const [events, stats] = await Promise.all([Store.listEvents(), Store.stats()]);
    const list = events.slice().sort(sortByStart).reverse();
    $("#adminRoot").innerHTML = `
      ${await adminTabs("events")}
      <div class="admin-bar">
        <h2>${esc(t("adm.my"))}</h2>
        <div class="admin-actions">
          ${Store.remote ? "" : `<button class="btn btn-sm" id="resetDemo">${esc(t("adm.reset"))}</button>`}
          <button class="btn btn-sm" id="logout">${esc(t("adm.logout"))}</button>
          <a class="btn btn-primary btn-sm" href="#/admin/new">${esc(t("adm.new"))}</a>
        </div>
      </div>
      <div class="admin-list">
        ${list.length ? list.map((ev) => {
          const s = stats[ev.id] || EMPTY_STATS, d = toDate(ev.start);
          return `<div class="admin-row">
            <span class="em">${esc(ev.emoji || "✨")}</span>
            <div><h3>${esc(loc(ev, "title"))}</h3><div class="meta">${esc(cap(fmtDay(d)))} ${esc(fmtTime(d))} · ${esc(tp("responses", s.replies))} · ${esc(tp("participants", s.headcount))}${isPast(ev) ? " · " + esc(t("adm.over")) : ""}${ev.title_en ? " · EN ✓" : ""}</div></div>
            <div class="admin-actions">
              <a class="btn btn-sm" href="#/event/${encodeURIComponent(ev.id)}">${esc(t("adm.view"))}</a>
              <a class="btn btn-sm" href="#/admin/responses/${encodeURIComponent(ev.id)}">${esc(t("adm.responses"))}</a>
              <a class="btn btn-sm" href="#/admin/edit/${encodeURIComponent(ev.id)}">${esc(t("adm.edit"))}</a>
              <button class="btn btn-sm" data-dup="${esc(ev.id)}">${esc(t("adm.dup"))}</button>
              <button class="btn btn-sm btn-danger" data-del="${esc(ev.id)}">${esc(t("adm.del"))}</button>
            </div>
          </div>`;
        }).join("") : `<div class="empty">${esc(t("adm.none"))}</div>`}
      </div>`;

    $("#logout").onclick = async () => { await Store.logout(); renderAdminLock(); };
    const rd = $("#resetDemo");
    if (rd) rd.onclick = () => { if (confirm(t("adm.resetConfirm"))) { Store.resetDemo(); try { localStorage.removeItem(ANS_KEY); } catch (e) { /* ignore */ } renderAdmin(); toast(t("adm.resetDone")); } };
    $("#adminRoot").onclick = async (e) => {
      const del = e.target.closest("[data-del]");
      const dup = e.target.closest("[data-dup]");
      try {
        if (del) {
          const ev = events.find((x) => x.id === del.dataset.del);
          if (ev && confirm(t("adm.delConfirm", { t: loc(ev, "title") }))) {
            await Store.deleteEvent(ev.id); toast(t("adm.deleted")); renderAdmin();
          }
        }
        if (dup) {
          const ev = events.find((x) => x.id === dup.dataset.dup);
          if (ev) {
            const copy = JSON.parse(JSON.stringify(ev));
            delete copy.id; delete copy.createdAt;
            copy.title += ` ${window.I18N.fr["adm.copy"]}`;
            if (copy.title_en) copy.title_en += ` ${window.I18N.en["adm.copy"]}`;
            const saved = await Store.saveEvent(copy);
            toast(t("adm.copied")); location.hash = `#/admin/edit/${encodeURIComponent(saved.id)}`;
          }
        }
      } catch (err) { console.error(err); toast(errMsg(err)); }
    };
  }

  function itemRowHTML(it = {}) {
    return `<div class="builder-row" data-row="item">
      <input type="text" name="i_emoji" value="${esc(it.emoji || "")}" placeholder="🍕" maxlength="4" aria-label="${esc(t("ed.emoji"))}">
      <input type="text" name="i_label" value="${esc(it.label || "")}" placeholder="${esc(t("ed.itemPh"))}" maxlength="60" aria-label="FR">
      <input type="text" class="en" name="i_label_en" value="${esc(it.label_en || "")}" placeholder="${esc(t("ed.itemEnPh"))}" maxlength="60" aria-label="EN">
      <input type="number" name="i_needed" value="${Number(it.needed) || 1}" min="1" max="99" aria-label="${esc(t("ed.qty"))}">
      <input type="hidden" name="i_id" value="${esc(it.id || "")}">
      <button type="button" class="icon-btn" data-remove aria-label="${esc(t("ed.remove"))}">✕</button>
    </div>`;
  }
  function questionRowHTML(q = {}) {
    const choice = q.type === "choice";
    return `<div class="builder-row q" data-row="question">
      <input type="text" name="q_label" value="${esc(q.label || "")}" placeholder="${esc(t("ed.qPh"))}" maxlength="100" aria-label="FR">
      <input type="text" name="q_label_en" value="${esc(q.label_en || "")}" placeholder="${esc(t("ed.qEnPh"))}" maxlength="100" aria-label="EN">
      <select name="q_type">
        <option value="text" ${choice ? "" : "selected"}>${esc(t("ed.qText"))}</option>
        <option value="choice" ${choice ? "selected" : ""}>${esc(t("ed.qChoice"))}</option>
      </select>
      <button type="button" class="icon-btn" data-remove aria-label="${esc(t("ed.remove"))}">✕</button>
      <input type="hidden" name="q_id" value="${esc(q.id || "")}">
      <input type="text" class="q-opts" name="q_opts" value="${esc((q.options || []).join(" | "))}" placeholder="${esc(t("ed.optsPh"))}" ${choice ? "" : "hidden"}>
      <input type="text" class="q-opts" name="q_opts_en" value="${esc((q.options_en || []).join(" | "))}" placeholder="${esc(t("ed.optsEnPh"))}" ${choice ? "" : "hidden"}>
    </div>`;
  }

  function renderEditor(ev) {
    const isNew = !ev;
    ev = ev || { theme: "sunset", allowGuests: true, items: [], questions: [], emoji: "🎉", ...(pendingDraft || {}) };
    pendingDraft = null;
    $("#adminRoot").innerHTML = `
      <div class="admin-bar"><h2>${esc(t(isNew ? "ed.newT" : "ed.editT"))}</h2><a class="btn btn-sm" href="#/admin">${esc(t("ed.back"))}</a></div>
      <form class="form panel" id="evForm">
        <div class="row-3">
          <div class="field"><label for="e_emoji">${esc(t("ed.emoji"))}</label><input type="text" id="e_emoji" name="emoji" value="${esc(ev.emoji)}" maxlength="4"></div>
          <div class="field span-2"><label for="e_title">${esc(t("ed.title"))}</label><input type="text" id="e_title" name="title" value="${esc(ev.title || "")}" required maxlength="80"></div>
        </div>
        <div class="row">
          <div class="field"><label for="e_cat">${esc(t("ed.cat"))}</label><input type="text" id="e_cat" name="category" value="${esc(ev.category || "")}" maxlength="30"></div>
          <div class="field"><label for="e_loc">${esc(t("ed.loc"))}</label><input type="text" id="e_loc" name="location" value="${esc(ev.location || "")}" maxlength="80" placeholder="${esc(t("ed.locPh"))}"></div>
        </div>
        <div class="row-3">
          <div class="field"><label for="e_start">${esc(t("ed.start"))}</label><input type="datetime-local" id="e_start" name="start" value="${esc(ev.start || "")}" required></div>
          <div class="field"><label for="e_end">${esc(t("ed.end"))}</label><input type="datetime-local" id="e_end" name="end" value="${esc(ev.end || "")}"></div>
          <div class="field"><label for="e_cap">${esc(t("ed.cap"))}</label><input type="number" id="e_cap" name="capacity" value="${ev.capacity || ""}" min="0" placeholder="${esc(t("ed.capPh"))}"></div>
        </div>
        <div class="field"><label for="e_desc">${esc(t("ed.desc"))}</label><textarea id="e_desc" name="description" rows="4" maxlength="2000">${esc(ev.description || "")}</textarea></div>
        <div class="row">
          <div class="field"><span class="label">${esc(t("ed.theme"))}</span>
            <div class="themes">${THEMES.map((th) => `<input type="radio" name="theme" id="th_${th}" value="${th}" ${ev.theme === th ? "checked" : ""}><label for="th_${th}" class="th-${th}" title="${th}"></label>`).join("")}</div>
          </div>
          <label class="check" style="align-self:end"><input type="checkbox" name="allowGuests" ${ev.allowGuests ? "checked" : ""}> <span>${esc(t("ed.guests"))}</span></label>
        </div>

        <details class="fieldset" ${ev.title_en ? "open" : ""}>
          <summary>${esc(t("ed.enLegend"))}</summary>
          <p class="card-meta">${esc(t("ed.enHint"))}</p>
          <div class="form">
            <div class="field"><label for="e_title_en">${esc(t("ed.titleEn"))}</label><input type="text" id="e_title_en" name="title_en" value="${esc(ev.title_en || "")}" maxlength="80"></div>
            <div class="row">
              <div class="field"><label for="e_cat_en">${esc(t("ed.catEn"))}</label><input type="text" id="e_cat_en" name="category_en" value="${esc(ev.category_en || "")}" maxlength="30"></div>
              <div class="field"><label for="e_loc_en">${esc(t("ed.locEn"))}</label><input type="text" id="e_loc_en" name="location_en" value="${esc(ev.location_en || "")}" maxlength="80"></div>
            </div>
            <div class="field"><label for="e_desc_en">${esc(t("ed.descEn"))}</label><textarea id="e_desc_en" name="description_en" rows="4" maxlength="2000">${esc(ev.description_en || "")}</textarea></div>
          </div>
        </details>

        <fieldset class="fieldset">
          <legend>${esc(t("ed.itemsLegend"))}</legend>
          <p class="card-meta">${esc(t("ed.itemsHint"))}</p>
          <div class="builder" id="itemsB">${(ev.items || []).map(itemRowHTML).join("")}</div>
          <div class="btn-row">
            <button type="button" class="btn btn-sm" id="addItem">${esc(t("ed.addItem"))}</button>
            <button type="button" class="btn btn-sm" data-preset="apero">${esc(t("ed.packApero"))}</button>
            <button type="button" class="btn btn-sm" data-preset="repas">${esc(t("ed.packRepas"))}</button>
            <button type="button" class="btn btn-sm" data-preset="matos">${esc(t("ed.packMatos"))}</button>
          </div>
        </fieldset>

        <fieldset class="fieldset">
          <legend>${esc(t("ed.qLegend"))}</legend>
          <div class="builder" id="questionsB">${(ev.questions || []).map(questionRowHTML).join("")}</div>
          <div class="btn-row"><button type="button" class="btn btn-sm" id="addQ">${esc(t("ed.addQ"))}</button></div>
        </fieldset>

        <div class="btn-row">
          <button class="btn btn-primary" type="submit">${esc(t(isNew ? "ed.publish" : "ed.save"))}</button>
          <a class="btn" href="#/admin">${esc(t("ed.cancel"))}</a>
        </div>
      </form>`;

    const iB = $("#itemsB"), qB = $("#questionsB"), form = $("#evForm");
    $("#addItem").onclick = () => { iB.insertAdjacentHTML("beforeend", itemRowHTML()); $("input[name=i_label]", iB.lastElementChild).focus(); };
    $("#addQ").onclick = () => { qB.insertAdjacentHTML("beforeend", questionRowHTML()); $("input[name=q_label]", qB.lastElementChild).focus(); };
    $$("[data-preset]", form).forEach((b) => (b.onclick = () =>
      t(`presets.${b.dataset.preset}`).forEach(([emoji, label, label_en, needed]) =>
        iB.insertAdjacentHTML("beforeend", itemRowHTML({ emoji, label, label_en, needed })))));
    form.addEventListener("click", (e) => { const r = e.target.closest("[data-remove]"); if (r) r.closest(".builder-row").remove(); });
    form.addEventListener("change", (e) => {
      if (e.target.name === "q_type") $$(".q-opts", e.target.closest(".builder-row")).forEach((o) => (o.hidden = e.target.value !== "choice"));
    });

    const splitOpts = (s) => s.split("|").map((x) => x.trim()).filter(Boolean);
    const slug = () => Store.uid().replace(/-/g, "").slice(0, 8);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.title.value.trim() || !form.start.value) { toast(t("ed.required")); return; }
      const items = $$("[data-row=item]", iB).map((r) => ({
        id: $("[name=i_id]", r).value || slug(),
        emoji: $("[name=i_emoji]", r).value.trim(),
        label: $("[name=i_label]", r).value.trim() || $("[name=i_label_en]", r).value.trim(),
        label_en: $("[name=i_label_en]", r).value.trim(),
        needed: Math.max(1, Math.min(99, parseInt($("[name=i_needed]", r).value, 10) || 1))
      })).filter((i) => i.label);
      const questions = $$("[data-row=question]", qB).map((r) => ({
        id: $("[name=q_id]", r).value || slug(),
        label: $("[name=q_label]", r).value.trim() || $("[name=q_label_en]", r).value.trim(),
        label_en: $("[name=q_label_en]", r).value.trim(),
        type: $("[name=q_type]", r).value,
        options: splitOpts($("[name=q_opts]", r).value),
        options_en: splitOpts($("[name=q_opts_en]", r).value)
      })).filter((q) => q.label);
      const data = {
        ...(isNew ? {} : ev),
        title: form.title.value.trim(), title_en: form.title_en.value.trim(),
        emoji: form.emoji.value.trim() || "✨",
        category: form.category.value.trim(), category_en: form.category_en.value.trim(),
        location: form.location.value.trim(), location_en: form.location_en.value.trim(),
        start: form.start.value, end: form.end.value,
        capacity: Math.max(0, parseInt(form.capacity.value, 10) || 0),
        description: form.description.value.trim(), description_en: form.description_en.value.trim(),
        theme: form.theme.value || "sunset",
        allowGuests: form.allowGuests.checked,
        items, questions
      };
      try {
        const saved = await Store.saveEvent(data);
        toast(t(isNew ? "ed.published" : "ed.savedMsg"));
        location.hash = `#/event/${encodeURIComponent(saved.id)}`;
      } catch (err) {
        console.error(err); toast(err.code === "AUTH" ? errMsg(err) : t("ed.error"));
      }
    });
  }

  /** Repère les prénoms proches (même premier mot) : aide à repérer les doublons. */
  function similarNames(rs) {
    const key = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().split(" ")[0];
    const groups = {};
    rs.forEach((r) => { const k = key(r.name); (groups[k] = groups[k] || []).push(r.name); });
    return Object.values(groups).filter((g) => g.length > 1).map((g) => g.join(" / "));
  }

  async function renderResponses(id) {
    const ev = await Store.getEvent(id);
    if (!ev) { location.hash = "#/admin"; return; }
    const rs = await Store.listResponses(id);
    const items = ev.items || [];
    const brought = {};
    rs.filter((r) => r.status !== "no").forEach((r) => Object.entries(r.items || {}).forEach(([k, q]) => (brought[k] = (brought[k] || 0) + q)));
    const headcount = rs.filter((r) => r.status === "yes").reduce((n, r) => n + 1 + (r.guests || 0), 0);
    const itemName = (iid) => { const it = items.find((x) => x.id === iid); return it ? loc(it, "label") : iid; };
    const qs = ev.questions || [];
    const cells = (r) => [
      new Date(r.createdAt).toLocaleString(locale()), r.name, t(r.showName ? "rs.public" : "rs.hidden"), t(`status.${r.status}`), r.guests || 0,
      Object.entries(r.items || {}).map(([k, q]) => `${q}× ${itemName(k)}`).join(", "), r.other || "",
      ...qs.map((q) => (r.answers || {})[q.id] || ""), r.message || ""
    ];
    const head = [t("col.date"), t("col.name"), t("col.visibility"), t("col.status"), t("col.guests"), t("col.brings"), t("col.other"), ...qs.map((q) => loc(q, "label")), t("col.msg")];
    const similar = similarNames(rs);

    $("#adminRoot").innerHTML = `
      <div class="admin-bar">
        <h2>${esc(ev.emoji || "")} ${esc(loc(ev, "title"))} · ${esc(t("rs.title"))}</h2>
        <div class="admin-actions"><button class="btn btn-sm" id="csv">${esc(t("rs.csv"))}</button><a class="btn btn-sm" href="#/admin">${esc(t("ed.back"))}</a></div>
      </div>
      <div class="mini-stats">
        <div><strong>${headcount}</strong><span>${esc(t("rs.expected"))}</span></div>
        <div><strong>${rs.filter((r) => r.status === "maybe").length}</strong><span>${esc(t("rs.maybe"))}</span></div>
        <div><strong>${rs.filter((r) => r.status === "no").length}</strong><span>${esc(t("rs.absent"))}</span></div>
      </div>
      <p class="card-meta">${esc(t("rs.modHint"))}</p>
      ${similar.length ? `<p class="notice">⚠ ${esc(t("rs.dupWarn", { x: similar.join(" · ") }))}</p>` : ""}
      ${items.length ? `<div class="panel" style="margin-bottom:24px"><h2>${esc(t("rs.recap"))}</h2><div class="needs">${items.map((it) => {
        const got = brought[it.id] || 0;
        return `<div class="need ${got >= it.needed ? "is-full" : ""}"><span class="need-emoji">${esc(it.emoji || "•")}</span><span class="need-label">${esc(loc(it, "label"))}</span><span class="need-count">${got}/${it.needed}</span><span class="bar"><i style="width:${Math.min(100, (got / it.needed) * 100)}%"></i></span></div>`;
      }).join("")}</div></div>` : ""}
      <div class="table-wrap">
        <table>
          <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}<th></th></tr></thead>
          <tbody>${rs.length ? rs.map((r) => `<tr>${cells(r).map((c) => `<td>${esc(c)}</td>`).join("")}
            <td class="row-actions">
              <button class="btn btn-sm" data-vis="${esc(r.id)}" data-show="${r.showName ? "0" : "1"}">${esc(t(r.showName ? "rs.hide" : "rs.show"))}</button>
              <button class="btn btn-sm btn-danger" data-delr="${esc(r.id)}" data-name="${esc(r.name)}">${esc(t("rs.del"))}</button>
            </td></tr>`).join("") : `<tr><td colspan="${head.length + 1}">${esc(t("rs.none"))}</td></tr>`}</tbody>
        </table>
      </div>`;

    $("#csv").onclick = () => {
      // neutralise les formules Excel (=, +, -, @) : protection contre l'injection CSV
      const q = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
      const csv = [head, ...rs.map(cells)].map((l) => l.map(q).join(";")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      a.download = `leone-${ev.id}-${lang === "fr" ? "reponses" : "replies"}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    $("#adminRoot").onclick = async (e) => {
      const del = e.target.closest("[data-delr]");
      const vis = e.target.closest("[data-vis]");
      try {
        if (del && confirm(t("rs.delConfirm", { name: del.dataset.name }))) {
          await Store.deleteResponse(del.dataset.delr); toast(t("rs.deleted")); renderResponses(id);
        }
        if (vis) { await Store.setShowName(vis.dataset.vis, vis.dataset.show === "1"); renderResponses(id); }
      } catch (err) { console.error(err); toast(errMsg(err)); }
    };
  }

  /* ---------------- Argent & comptes ---------------- */
  const money = (cents) => new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR" }).format((cents || 0) / 100);
  const parseEuros = (v) => Math.round(parseFloat(String(v).replace(/\s/g, "").replace(",", ".")) * 100) || 0;
  const fmtDate = (s) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : "");
  function potTotals(entries) {
    const inn = entries.filter((e) => e.kind === "in").reduce((n, e) => n + e.cents, 0);
    const out = entries.filter((e) => e.kind === "out").reduce((n, e) => n + e.cents, 0);
    return { inn, out, balance: inn - out };
  }
  /** Liste des mouvements. withDelete : boutons de suppression (organisateurs). */
  function ledgerHTML(entries, events, withDelete) {
    return `<ul class="ledger">${entries.map((e) => {
      const ev = e.eventId && events.find((x) => x.id === e.eventId);
      return `<li class="ledger-row ${e.kind}">
        <span class="ledger-sign" aria-hidden="true">${e.kind === "in" ? "+" : "−"}</span>
        <div class="ledger-main">
          <div class="ledger-label">${esc(loc(e, "label"))}</div>
          <div class="ledger-sub">${esc(t(e.kind === "in" ? "pot.in" : "pot.out"))} · ${esc(fmtDate(e.date))}${ev ? ` · <a href="#/event/${encodeURIComponent(ev.id)}">${esc(t("pot.forEvent", { x: loc(ev, "title") }))}</a>` : ""}</div>
        </div>
        <span class="ledger-amount"><span class="sr-only">${esc(t(e.kind === "in" ? "pot.in" : "pot.out"))} </span>${esc(money(e.cents))}</span>
        ${withDelete ? `<button class="icon-btn" data-delpot="${esc(e.id)}" aria-label="${esc(t("adm.del"))}">✕</button>` : ""}
      </li>`;
    }).join("")}</ul>`;
  }
  const safeHost = (url) => { try { const u = new URL(url); return u.protocol === "https:" ? u.hostname : ""; } catch (e) { return ""; } };

  /* ---------------- Pot commun (public) ---------------- */
  async function renderPot() {
    const [{ settings, entries }, events] = await Promise.all([Store.getPot(), Store.listEvents()]);
    const tot = potTotals(entries);
    const host = settings.url ? safeHost(settings.url) : "";
    const pct = settings.goal > 0 ? Math.min(100, (tot.inn / (settings.goal * 100)) * 100) : 0;
    $("#potRoot").innerHTML = `
      <div class="pot-layout">
        <div class="pot-card reveal">
          <span class="pot-coin" aria-hidden="true"></span>
          <p class="pot-label">${esc(t("pot.balance"))}</p>
          <p class="pot-balance">${esc(money(tot.balance))}</p>
          ${settings.goal > 0 ? `<div class="pot-goal"><span class="bar"><i data-w="${pct}"></i></span><span>${esc(t("pot.collected", { x: money(tot.inn), y: money(settings.goal * 100) }))}</span></div>` : ""}
          ${loc(settings, "description") ? `<p class="pot-desc">${esc(loc(settings, "description"))}</p>` : ""}
          ${host ? `<a class="btn btn-primary" href="${esc(settings.url)}" target="_blank" rel="noopener noreferrer">${esc(t("pot.give"))} ↗</a>
                    <p class="pot-via">🔒 ${esc(t("pot.via", { host }))}</p>`
                 : `<p class="notice">${esc(t("pot.closed"))}</p>`}
        </div>
        <div class="panel reveal">
          <h2>${esc(t("pot.ledger"))}</h2>
          <p class="card-meta">${esc(t("pot.ledgerHint"))}</p>
          ${entries.length ? ledgerHTML(entries, events, false) : `<p class="card-meta" style="margin-top:12px">${esc(t("pot.noEntries"))}</p>`}
        </div>
      </div>`;
    requestAnimationFrame(() => setTimeout(() => $$("#potRoot .bar i").forEach((b) => (b.style.width = b.dataset.w + "%")), 150));
  }

  /* ---------------- Proposer (public) ---------------- */
  function renderPropose() {
    const root = $("#proposeRoot");
    root.innerHTML = `
      <form class="form panel" id="propForm" novalidate autocomplete="off">
        <div class="field"><label for="p_title">${esc(t("prop.what"))}</label><input type="text" id="p_title" name="ptitle" maxlength="80" required placeholder="${esc(t("prop.whatPh"))}"></div>
        <div class="field"><label for="p_desc">${esc(t("prop.desc"))}</label><textarea id="p_desc" name="pdesc" maxlength="1000" placeholder="${esc(t("prop.descPh"))}"></textarea></div>
        <div class="row">
          <div class="field"><label for="p_when">${esc(t("prop.when"))}</label><input type="text" id="p_when" name="pwhen" maxlength="80" placeholder="${esc(t("prop.whenPh"))}"></div>
          <div class="field"><label for="p_name">${esc(t("prop.name"))}</label><input type="text" id="p_name" name="pname" maxlength="40" autocomplete="given-name"><small>🔒 ${esc(t("prop.nameHint"))}</small></div>
        </div>
        <div class="field"><label for="p_needs">${esc(t("prop.needs"))}</label><input type="text" id="p_needs" name="pneeds" maxlength="300" placeholder="${esc(t("prop.needsPh"))}"></div>
        <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
        <div class="btn-row"><button class="btn btn-primary" type="submit">${esc(t("prop.send"))}</button></div>
      </form>`;
    const form = $("#propForm");
    const shownAt = Date.now();
    const thanks = () => {
      root.innerHTML = `<div class="panel success"><span class="big">💡</span><h2>${esc(t("prop.thanksT"))}</h2><p>${esc(t("prop.thanksP"))}</p><button class="btn" id="propAgain">${esc(t("prop.another"))}</button></div>`;
      $("#propAgain").onclick = renderPropose;
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (form.website.value) return thanks();
      if (Date.now() - shownAt < 3000) { toast(t("form.tooFast")); return; }
      const title = form.ptitle.value.replace(/\s+/g, " ").trim();
      if (title.length < 3) { form.ptitle.focus(); toast(t("prop.needTitle")); return; }
      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      try {
        await Store.submitProposal({
          title, description: form.pdesc.value.trim(), whenText: form.pwhen.value.trim(),
          needs: form.pneeds.value.trim(), name: form.pname.value.trim(), lang
        });
        thanks();
      } catch (err) {
        if (!err.code) console.error(err);
        btn.disabled = false;
        toast(errMsg(err));
      }
    });
  }

  /* ---------------- Organiser : onglets ---------------- */
  let pendingDraft = null;
  async function adminTabs(active) {
    let n = 0;
    try { n = (await Store.listProposals()).filter((p) => p.status === "new").length; } catch (e) { /* ignore */ }
    const tab = (key, href, label) =>
      `<a class="chip ${active === key ? "is-active" : ""}" href="${href}" ${active === key ? 'aria-current="page"' : ""}>${esc(label)}</a>`;
    return `<nav class="admin-tabs" aria-label="${esc(t("nav.admin"))}">
      ${tab("events", "#/admin", t("adm.tabEvents"))}
      ${tab("proposals", "#/admin/proposals", t("adm.tabProposals") + (n ? ` (${n})` : ""))}
      ${tab("pot", "#/admin/pot", t("adm.tabPot"))}
    </nav>`;
  }

  async function renderAdminProposals() {
    const list = await Store.listProposals();
    const order = { new: 0, accepted: 1, rejected: 2 };
    list.sort((a, b) => order[a.status] - order[b.status]);
    $("#adminRoot").innerHTML = `
      ${await adminTabs("proposals")}
      <div class="admin-list">
        ${list.length ? list.map((p) => `
          <article class="proposal ${esc(p.status)}">
            <div class="proposal-head">
              <h3>${esc(p.title)}</h3>
              <span class="tag tag-${esc(p.status)}">${esc(t(`ap.${p.status}`))}</span>
            </div>
            ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ""}
            <p class="card-meta">
              ${p.whenText ? `${esc(t("ap.when", { x: p.whenText }))}<br>` : ""}
              ${p.needs ? `${esc(t("ap.needs", { x: p.needs }))}<br>` : ""}
              ${esc(t("ap.by", { x: p.name || t("ap.anon") }))} · ${esc(new Date(p.createdAt).toLocaleDateString(locale()))}${p.lang === "en" ? " · EN" : ""}
            </p>
            <div class="admin-actions">
              ${p.status !== "accepted" ? `<button class="btn btn-sm btn-primary" data-pcreate="${esc(p.id)}">${esc(t("ap.create"))}</button>` : ""}
              ${p.status === "new" ? `<button class="btn btn-sm" data-pstatus="rejected" data-pid="${esc(p.id)}">${esc(t("ap.reject"))}</button>`
                                   : `<button class="btn btn-sm" data-pstatus="new" data-pid="${esc(p.id)}">${esc(t("ap.reopen"))}</button>`}
              <button class="btn btn-sm btn-danger" data-pdel="${esc(p.id)}">${esc(t("ap.del"))}</button>
            </div>
          </article>`).join("") : `<div class="empty">${esc(t("ap.none"))}</div>`}
      </div>`;
    $("#adminRoot").onclick = async (e) => {
      const c = e.target.closest("[data-pcreate]"), st = e.target.closest("[data-pstatus]"), d = e.target.closest("[data-pdel]");
      try {
        if (c) {
          const p = list.find((x) => x.id === c.dataset.pcreate);
          await Store.setProposalStatus(p.id, "accepted");
          const extra = [p.whenText && t("ap.when", { x: p.whenText }), p.needs && t("ap.needs", { x: p.needs })].filter(Boolean).join("\n");
          const desc = [p.description, extra].filter(Boolean).join("\n\n");
          pendingDraft = p.lang === "en" ? { title: p.title, title_en: p.title, description: desc, description_en: desc } : { title: p.title, description: desc };
          location.hash = "#/admin/new";
        }
        if (st) { await Store.setProposalStatus(st.dataset.pid, st.dataset.pstatus); renderAdminProposals(); }
        if (d && confirm(t("ap.delConfirm"))) { await Store.deleteProposal(d.dataset.pdel); renderAdminProposals(); }
      } catch (err) { console.error(err); toast(errMsg(err)); }
    };
  }

  async function renderAdminPot() {
    const [{ settings, entries }, events] = await Promise.all([Store.getPot(), Store.listEvents()]);
    const tot = potTotals(entries);
    const today = new Date().toISOString().slice(0, 10);
    $("#adminRoot").innerHTML = `
      ${await adminTabs("pot")}
      <div class="mini-stats">
        <div><strong>${esc(money(tot.balance))}</strong><span>${esc(t("pot.balance"))}</span></div>
        <div><strong>${esc(money(tot.inn))}</strong><span>${esc(t("pot.in"))}</span></div>
        <div><strong>${esc(money(tot.out))}</strong><span>${esc(t("pot.out"))}</span></div>
      </div>
      <div class="event-layout">
        <div>
          <form class="form panel" id="potEntryForm" novalidate>
            <h2>${esc(t("apot.add"))}</h2>
            <div class="row">
              <div class="field"><span class="label">${esc(t("apot.kind"))}</span>
                <div class="seg seg-2">
                  <input type="radio" name="kind" id="k_in" value="in" checked><label for="k_in">+ ${esc(t("pot.in"))}</label>
                  <input type="radio" name="kind" id="k_out" value="out"><label for="k_out">− ${esc(t("pot.out"))}</label>
                </div>
              </div>
              <div class="field"><label for="pe_amount">${esc(t("apot.amount"))}</label><input type="text" id="pe_amount" name="amount" inputmode="decimal" placeholder="25,00" required></div>
            </div>
            <div class="field"><label for="pe_label">${esc(t("apot.label"))}</label><input type="text" id="pe_label" name="label" maxlength="120" placeholder="${esc(t("apot.labelPh"))}" required></div>
            <div class="field"><label for="pe_label_en">${esc(t("apot.labelEn"))}</label><input type="text" id="pe_label_en" name="label_en" maxlength="120"></div>
            <div class="row">
              <div class="field"><label for="pe_date">${esc(t("apot.date"))}</label><input type="date" id="pe_date" name="date" value="${today}"></div>
              <div class="field"><label for="pe_event">${esc(t("apot.event"))}</label>
                <select id="pe_event" name="eventId"><option value="">${esc(t("apot.noEvent"))}</option>
                  ${events.slice().sort(sortByStart).reverse().map((ev) => `<option value="${esc(ev.id)}">${esc(ev.emoji || "")} ${esc(loc(ev, "title"))}</option>`).join("")}
                </select></div>
            </div>
            <div class="btn-row"><button class="btn btn-primary" type="submit">${esc(t("apot.addBtn"))}</button></div>
          </form>
          <div class="panel">
            <h2>${esc(t("pot.ledger"))}</h2>
            ${entries.length ? ledgerHTML(entries, events, true) : `<p class="card-meta">${esc(t("pot.noEntries"))}</p>`}
          </div>
        </div>
        <form class="form panel" id="potSettingsForm" novalidate>
          <h2>${esc(t("apot.settings"))}</h2>
          <div class="field"><label for="ps_url">${esc(t("apot.url"))}</label><input type="url" id="ps_url" name="url" value="${esc(settings.url)}" placeholder="https://www.helloasso.com/…"><small>${esc(t("apot.urlHint"))}</small></div>
          <div class="field"><label for="ps_goal">${esc(t("apot.goal"))}</label><input type="number" id="ps_goal" name="goal" min="0" step="1" value="${settings.goal || ""}"></div>
          <div class="field"><label for="ps_desc">${esc(t("apot.desc"))}</label><textarea id="ps_desc" name="description" maxlength="600">${esc(settings.description)}</textarea></div>
          <div class="field"><label for="ps_desc_en">${esc(t("apot.descEn"))}</label><textarea id="ps_desc_en" name="description_en" maxlength="600">${esc(settings.description_en)}</textarea></div>
          <div class="btn-row"><button class="btn btn-primary" type="submit">${esc(t("apot.save"))}</button><a class="btn" href="#/pot">${esc(t("adm.view"))}</a></div>
        </form>
      </div>`;

    $("#potSettingsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const url = f.url.value.trim();
      if (url && !safeHost(url)) { toast(t("apot.badUrl")); f.url.focus(); return; }
      try {
        await Store.savePotSettings({ url, goal: f.goal.value, description: f.description.value.trim(), description_en: f.description_en.value.trim() });
        toast(t("apot.saved"));
      } catch (err) { console.error(err); toast(err.code === "INVALID" ? t("apot.badUrl") : errMsg(err)); }
    });
    $("#potEntryForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const cents = parseEuros(f.amount.value);
      if (cents <= 0 || !f.label.value.trim()) { toast(t("apot.invalid")); return; }
      try {
        await Store.addPotEntry({ kind: f.kind.value, cents, label: f.label.value, label_en: f.label_en.value, date: f.date.value, eventId: f.eventId.value });
        toast(t("apot.added"));
        renderAdminPot();
      } catch (err) { console.error(err); toast(err.code === "INVALID" ? t("apot.invalid") : errMsg(err)); }
    });
    $("#adminRoot").onclick = async (e) => {
      const d = e.target.closest("[data-delpot]");
      if (d && confirm(t("apot.delConfirm"))) {
        try { await Store.deletePotEntry(d.dataset.delpot); renderAdminPot(); } catch (err) { console.error(err); toast(errMsg(err)); }
      }
    };
  }

  /* ---------------- Routeur ---------------- */
  async function route(keepScroll) {
    const h = location.hash;
    if (h && !h.startsWith("#/")) return; // ancre interne (ex : #main)
    let parts;
    try { parts = h.replace(/^#\/?/, "").split("/").map(decodeURIComponent); } catch (e) { parts = []; }
    const [name = "", sub, id] = parts;
    const v = ["event", "admin", "propose", "pot"].includes(name) ? name : "home";

    $$(".view").forEach((s) => (s.hidden = s.dataset.view !== v));
    $$("[data-nav]").forEach((a) => {
      const on = a.dataset.nav === (v === "event" ? "home" : v);
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (keepScroll !== true) window.scrollTo(0, 0);
    if (v !== "home") clearInterval(countdownTimer);

    try {
      if (v === "home") await renderHome();
      if (v === "event") await renderEvent(sub);
      if (v === "admin") await renderAdmin(sub, id);
      if (v === "propose") renderPropose();
      if (v === "pot") await renderPot();
    } catch (err) {
      console.error(err);
      toast(errMsg(err));
    }
    const h1 = v === "event" ? $("#eventDetail h1") : null;
    document.title = h1 ? `${h1.textContent} · LEONE` : t("meta.title");
    observeReveals();
  }

  /* ---------------- Header ---------------- */
  let lastY = 0;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    $("#topbar").classList.toggle("is-hidden", y > lastY && y > 200);
    lastY = y;
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

  applyStatic();
  window.addEventListener("hashchange", () => route());
  route();
})();
