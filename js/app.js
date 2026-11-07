/* =============================================================
   LEONE — application (routeur, rendu, formulaires, admin, FR/EN)
   ============================================================= */
(function () {
  const cfg = window.LEONE_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const THEMES = ["sunset", "tricolore", "ocean", "neon", "forest"];
  const AV_COLORS = ["#7b5cff", "#ff5a1f", "#19b5a5", "#ff4f8b", "#1d3fbb", "#2f9e5b"];

  /* ---------------- Langue ---------------- */
  const LANG_KEY = "leone.lang";
  let lang = (() => {
    try { const s = localStorage.getItem(LANG_KEY); if (s === "fr" || s === "en") return s; } catch (e) { /* ignore */ }
    return (navigator.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
  })();
  const locale = () => (lang === "fr" ? "fr-FR" : "en-GB");

  /** Traduit une clé ; {var} remplacés par vars (non échappés : à échapper par l'appelant si besoin). */
  function t(key, vars = {}) {
    const dict = window.I18N[lang] || {};
    let s = key in dict ? dict[key] : (window.I18N.fr[key] ?? key);
    if (typeof s !== "string") return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  }
  /** Singulier / pluriel (en FR, 0 et 1 sont au singulier). */
  function tp(key, n, vars = {}) {
    const plural = lang === "fr" ? n > 1 : n !== 1;
    return t(`${key}_${plural ? "pl" : "sg"}`, { n, ...vars });
  }
  /** Champ d'un événement / item dans la langue courante, repli sur le français. */
  const loc = (obj, field) => (lang === "en" && obj && obj[`${field}_en`]) || (obj ? obj[field] : "") || "";
  const locOpts = (q) => (lang === "en" && q.options_en && q.options_en.length === (q.options || []).length ? q.options_en : q.options || []);
  const status = (s) => t(`status.${s}`);

  function applyStatic() {
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
    $$("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    $$(".lang [data-lang]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.lang === lang);
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    });
    const words = t("marquee");
    const run = words.map((w) => `<span>${esc(w)}</span><span>★</span>`).join("");
    $("#marquee").innerHTML = run + run;
  }
  $$(".lang [data-lang]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.lang === lang) return;
    lang = b.dataset.lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
    applyStatic();
    route(true);
  }));

  /* ---------------- Utilitaires date ---------------- */
  const toDate = (s) => (s ? new Date(s) : null);
  const fmtDay = (d) => d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
  const fmtTime = (d) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const fmtShortMonth = (d) => d.toLocaleDateString(locale(), { month: "short" }).replace(".", "");
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
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("is-on"), 3200);
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
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
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
          <span class="tag">${esc(loc(ev, "category") || t("card.event"))}</span>
          <h3>${esc(loc(ev, "title"))}</h3>
          <div class="card-meta">${esc(cap(fmtDay(d)))} · ${esc(fmtTime(d))}</div>
          <div class="card-meta">📍 ${esc(loc(ev, "location") || t("residence"))}</div>
          <div class="card-foot">
            <div class="avatars">${avs}</div>
            <span class="going-count">${headcount ? esc(tp("participants", headcount)) : esc(t("card.first"))}</span>
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
      : `<div class="empty">${esc(t("home.noEvents"))}</div>`;

    const next = upcoming[0];
    const nc = $("#nextCard");
    clearInterval(countdownTimer);
    if (next) {
      const d = toDate(next.start);
      const tl = tally(next, respFor(next.id));
      nc.innerHTML = `
        <span class="tag tag-live">${esc(t("next.tag"))}</span>
        <h3>${esc(next.emoji || "")} ${esc(loc(next, "title"))}</h3>
        <p class="card-meta">${esc(cap(fmtDay(d)))} · ${esc(fmtTime(d))}<br>📍 ${esc(loc(next, "location"))}</p>
        <div class="countdown">
          <div><strong data-u="d">0</strong><span>${esc(t("cd.d"))}</span></div>
          <div><strong data-u="h">0</strong><span>${esc(t("cd.h"))}</span></div>
          <div><strong data-u="m">0</strong><span>${esc(t("cd.m"))}</span></div>
          <div><strong data-u="s">0</strong><span>${esc(t("cd.s"))}</span></div>
        </div>
        <p class="card-meta">${tp("registered", tl.headcount)}</p>
        <a class="btn btn-primary" href="#/event/${encodeURIComponent(next.id)}">${esc(t("next.cta"))}</a>`;
      const tick = () => {
        const ms = Math.max(0, d - new Date());
        const u = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
        Object.entries(u).forEach(([k, v]) => { const el = $(`[data-u="${k}"]`, nc); if (el) el.textContent = String(v).padStart(2, "0"); });
      };
      tick();
      countdownTimer = setInterval(tick, 1000);
    } else {
      nc.innerHTML = `<span class="tag">${esc(t("next.noneTag"))}</span><h3>${esc(t("next.noneTitle"))}</h3><p class="card-meta">${esc(t("next.noneText"))}</p>`;
    }

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
      : `<div class="empty">${esc(t(currentFilter === "past" ? "events.nonePast" : "events.noneUpcoming"))}</div>`;
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
      root.innerHTML = `<div class="page-head"><h1>${esc(t("ev.notFoundT"))}</h1><p class="lead">${esc(t("ev.notFoundP"))}</p><a class="btn btn-dark" href="#/events">${esc(t("ev.backShort"))}</a></div>`;
      return;
    }
    const responses = await Store.listResponses(ev.id);
    const tl = tally(ev, responses);
    const d = toDate(ev.start), end = toDate(ev.end);
    const theme = THEMES.includes(ev.theme) ? ev.theme : "sunset";
    const past = isPast(ev);
    const full = ev.capacity && tl.headcount >= ev.capacity;
    const items = ev.items || [];

    const needsHTML = items.map((it) => {
      const got = tl.brought[it.id] || 0;
      const pct = it.needed ? Math.min(100, (got / it.needed) * 100) : 0;
      return `<div class="need ${got >= it.needed ? "is-full" : ""}">
          <span class="need-emoji" aria-hidden="true">${esc(it.emoji || "•")}</span>
          <span class="need-label">${esc(loc(it, "label"))}</span>
          <span class="need-count">${got}/${it.needed}</span>
          <span class="bar"><i data-w="${pct}"></i></span>
        </div>`;
    }).join("");

    const peopleHTML = responses.slice().reverse().map((r) => {
      const brings = Object.entries(r.items || {}).filter(([, q]) => q > 0).map(([iid, q]) => {
        const it = items.find((x) => x.id === iid);
        return it ? `${esc(it.emoji || "")} ${q}× ${esc(loc(it, "label"))}` : "";
      }).filter(Boolean);
      if (r.other) brings.push(`✨ ${esc(r.other)}`);
      const sub = [r.apartment ? esc(t("ev.apt", { a: r.apartment })) : "", r.guests > 0 ? esc(tp("guests", Number(r.guests))) : ""].filter(Boolean).join(" · ");
      return `<li class="person">
          <span class="av" style="background:${avColor(r.name)}">${esc(initials(r.name))}</span>
          <div>
            <div class="person-name">${esc(r.name)} <span class="status ${esc(r.status)}">${esc(status(r.status))}</span></div>
            ${sub ? `<div class="person-sub">${sub}</div>` : ""}
            ${brings.length && r.status !== "no" ? `<div class="person-brings">${esc(t("ev.brings"))} ${brings.join(", ")}</div>` : ""}
            ${r.message ? `<div class="person-msg">“${esc(r.message)}”</div>` : ""}
          </div>
        </li>`;
    }).join("");

    const bringHTML = items.map((it) => {
      const left = Math.max(0, it.needed - (tl.brought[it.id] || 0));
      const label = loc(it, "label");
      return `<div class="bring-item ${left === 0 ? "is-full" : ""}" data-item="${esc(it.id)}">
          <span class="em" aria-hidden="true">${esc(it.emoji || "•")}</span>
          <span class="lbl">${esc(label)}<span class="rest">${esc(left === 0 ? t("form.covered") : t("form.left", { n: left }))}</span></span>
          <span class="stepper">
            <button type="button" data-step="-1" aria-label="${esc(t("form.less", { x: label }))}">−</button>
            <output aria-live="polite">0</output>
            <button type="button" data-step="1" aria-label="${esc(t("form.more", { x: label }))}">+</button>
          </span>
        </div>`;
    }).join("");

    const questionsHTML = (ev.questions || []).map((q) => {
      const name = `q_${esc(q.id)}`;
      const label = esc(loc(q, "label"));
      if (q.type === "choice" && (q.options || []).length) {
        return `<div class="field"><label for="${name}">${label}</label>
          <select id="${name}" name="${name}"><option value="">—</option>${locOpts(q).map((o) => `<option>${esc(o)}</option>`).join("")}</select></div>`;
      }
      return `<div class="field"><label for="${name}">${label}</label><input type="text" id="${name}" name="${name}" maxlength="200"></div>`;
    }).join("");

    root.innerHTML = `
      <div class="event-hero th-${theme}">
        <a class="back" href="#/events">${esc(t("ev.back"))}</a>
        <div class="event-hero-inner">
          <span class="event-emoji" aria-hidden="true">${esc(ev.emoji || "✨")}</span>
          <p class="eyebrow" style="margin-top:14px">${esc(loc(ev, "category") || t("card.event"))}${past ? " · " + esc(t("ev.over")) : ""}</p>
          <h1>${esc(loc(ev, "title"))}</h1>
          <div class="event-facts">
            <span class="fact">📅 ${esc(cap(fmtDay(d)))}</span>
            <span class="fact">🕗 ${esc(fmtTime(d))}${end ? ` → ${esc(fmtTime(end))}` : ""}</span>
            <span class="fact">📍 ${esc(loc(ev, "location") || t("residence"))}</span>
            <span class="fact">👥 ${esc(tp("participants", tl.headcount))}${ev.capacity ? ` / ${Number(ev.capacity)}` : ""}</span>
          </div>
        </div>
      </div>

      <div class="block event-layout">
        <div>
          <div class="panel reveal">
            <h2>${esc(t("ev.program"))}</h2>
            <p class="desc">${esc(loc(ev, "description"))}</p>
          </div>
          ${items.length ? `<div class="panel reveal"><h2>${esc(t("ev.needs"))}</h2><div class="needs">${needsHTML}</div></div>` : ""}
          <div class="panel reveal">
            <h2>${esc(t("ev.who"))} <span class="going-count">(${esc(tp("responses", responses.length))})</span></h2>
            ${responses.length ? `<ul class="people">${peopleHTML}</ul>` : `<p class="card-meta">${esc(t("ev.nobody"))}</p>`}
          </div>
        </div>

        <div class="sticky">
          <div class="panel" id="rsvpPanel">
            ${past ? `<h2>${esc(t("ev.pastT"))}</h2><p>${esc(t("ev.pastP"))}</p>` : `
            <h2>${esc(t("form.title"))}</h2>
            ${full ? `<p class="tag" style="margin-bottom:12px;white-space:normal;width:auto">${esc(t("ev.full"))}</p>` : ""}
            <form class="form" id="rsvpForm" novalidate>
              <div class="row">
                <div class="field"><label for="f_name">${esc(t("form.name"))}</label><input type="text" id="f_name" name="name" required maxlength="40" autocomplete="given-name"></div>
                <div class="field"><label for="f_apt">${esc(t("form.apt"))}</label><input type="text" id="f_apt" name="apartment" maxlength="20" placeholder="${esc(t("form.aptPh"))}"></div>
              </div>
              <div class="field">
                <span class="label" id="lblComing">${esc(t("form.coming"))}</span>
                <div class="seg" role="radiogroup" aria-labelledby="lblComing">
                  <input type="radio" name="status" id="st_yes" value="yes" ${full ? "" : "checked"}><label for="st_yes">${esc(t("form.yes"))}</label>
                  <input type="radio" name="status" id="st_maybe" value="maybe" ${full ? "checked" : ""}><label for="st_maybe">${esc(t("form.maybe"))}</label>
                  <input type="radio" name="status" id="st_no" value="no"><label for="st_no">${esc(t("form.no"))}</label>
                </div>
              </div>
              ${ev.allowGuests ? `<div class="field"><label for="f_guests">${esc(t("form.guests"))}</label><input type="number" id="f_guests" name="guests" min="0" max="10" value="0"></div>` : ""}
              ${items.length ? `<div class="field" id="bringField"><span class="label">${esc(t("form.bring"))}</span><small>${esc(t("form.bringHint"))}</small><div class="bring">${bringHTML}</div></div>` : ""}
              <div class="field"><label for="f_other">${esc(t("form.other"))}</label><input type="text" id="f_other" name="other" maxlength="120" placeholder="${esc(t("form.otherPh"))}"></div>
              ${questionsHTML}
              <div class="field"><label for="f_msg">${esc(t("form.msg"))}</label><textarea id="f_msg" name="message" maxlength="300" placeholder="${esc(t("form.msgPh"))}"></textarea></div>
              <button class="btn btn-primary" type="submit">${esc(t("form.submit"))}</button>
            </form>`}
          </div>
        </div>
      </div>`;

    requestAnimationFrame(() => setTimeout(() => $$(".bar i", root).forEach((b) => (b.style.width = b.dataset.w + "%")), 150));

    const form = $("#rsvpForm");
    if (!form) return;
    const picks = {};
    form.addEventListener("click", (e) => {
      const b = e.target.closest("[data-step]");
      if (!b) return;
      const row = b.closest(".bring-item");
      const iid = row.dataset.item;
      picks[iid] = Math.max(0, Math.min(20, (picks[iid] || 0) + Number(b.dataset.step)));
      $("output", row).textContent = picks[iid];
      row.classList.toggle("is-picked", picks[iid] > 0);
    });
    $$("input[name=status]", form).forEach((r) => r.addEventListener("change", () => {
      const bf = $("#bringField");
      if (bf) bf.style.display = form.status.value === "no" ? "none" : "";
    }));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      if (!name) { form.name.focus(); toast(t("form.needName")); return; }
      const answers = {};
      (ev.questions || []).forEach((q) => { const el = form[`q_${q.id}`]; if (el && el.value.trim()) answers[q.id] = el.value.trim(); });
      const st = form.status.value;
      const resp = {
        eventId: ev.id,
        name,
        apartment: form.apartment.value.trim(),
        status: st,
        guests: form.guests ? Math.max(0, Math.min(10, Number(form.guests.value) || 0)) : 0,
        items: st === "no" ? {} : Object.fromEntries(Object.entries(picks).filter(([, q]) => q > 0)),
        other: form.other.value.trim(),
        answers,
        message: form.message.value.trim(),
        lang
      };
      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      try {
        await Store.addResponse(resp);
        const place = loc(ev, "location");
        $("#rsvpPanel").innerHTML = `<div class="success">
            <span class="big">${st === "no" ? "😢" : "🎉"}</span>
            <h2>${esc(t(st === "no" ? "form.noT" : "form.okT"))}</h2>
            <p>${st === "no" ? esc(t("form.noP")) : esc(t("form.okP", { name })) + (place ? " · " + esc(place) : "")}</p>
          </div>`;
        toast(t("form.saved"));
        setTimeout(() => renderEvent(id).then(() => observeReveals(root)), 2200);
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        toast(t("form.error"));
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
        <h2>${esc(t("lock.title"))}</h2>
        <p class="card-meta">${esc(t("lock.text"))}</p>
        <form class="form" id="lockForm">
          <div class="field"><label for="pin">${esc(t("lock.code"))}</label><input type="password" id="pin" autocomplete="current-password" required></div>
          <button class="btn btn-primary" type="submit">${esc(t("lock.enter"))}</button>
        </form>
      </div>`;
    $("#lockForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if ($("#pin").value === String(cfg.adminPin || "")) {
        try { sessionStorage.setItem(ADMIN_KEY, "1"); } catch (err) { /* ignore */ }
        renderAdmin();
      } else {
        toast(t("lock.wrong"));
        $("#pin").select();
      }
    });
  }

  async function renderAdmin(sub, id) {
    $("#adminRoot").onclick = null;
    if (!isAdmin()) return renderAdminLock();
    if (sub === "new") return renderEditor(null);
    if (sub === "edit") return renderEditor(await Store.getEvent(id));
    if (sub === "responses") return renderResponses(id);

    const { events } = await load();
    const list = events.slice().sort(sortByStart).reverse();
    $("#adminRoot").innerHTML = `
      <div class="admin-bar">
        <h2 style="margin:0">${esc(t("adm.my"))}</h2>
        <div class="admin-actions">
          ${Store.remote ? "" : `<button class="btn btn-sm" id="resetDemo">${esc(t("adm.reset"))}</button>`}
          <button class="btn btn-sm" id="logout">${esc(t("adm.logout"))}</button>
          <a class="btn btn-primary" href="#/admin/new">${esc(t("adm.new"))}</a>
        </div>
      </div>
      <div class="admin-list">
        ${list.length ? list.map((ev) => {
          const r = respFor(ev.id), tl = tally(ev, r), d = toDate(ev.start);
          return `<div class="admin-row">
            <span class="em">${esc(ev.emoji || "✨")}</span>
            <div><h3>${esc(loc(ev, "title"))}</h3><div class="meta">${esc(cap(fmtDay(d)))} ${esc(fmtTime(d))} · ${esc(tp("responses", r.length))} · ${esc(tp("participants", tl.headcount))}${isPast(ev) ? " · " + esc(t("adm.over")) : ""}${ev.title_en ? " · 🇬🇧" : ""}</div></div>
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

    $("#logout").onclick = () => { try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) { /* ignore */ } renderAdminLock(); };
    const rd = $("#resetDemo");
    if (rd) rd.onclick = () => { if (confirm(t("adm.resetConfirm"))) { Store.resetDemo(); renderAdmin(); toast(t("adm.resetDone")); } };
    $("#adminRoot").onclick = async (e) => {
      const del = e.target.closest("[data-del]");
      const dup = e.target.closest("[data-dup]");
      if (del) {
        const ev = cache.events.find((x) => x.id === del.dataset.del);
        if (ev && confirm(t("adm.delConfirm", { t: loc(ev, "title") }))) {
          await Store.deleteEvent(ev.id); toast(t("adm.deleted")); renderAdmin();
        }
      }
      if (dup) {
        const ev = cache.events.find((x) => x.id === dup.dataset.dup);
        if (ev) {
          const copy = JSON.parse(JSON.stringify(ev));
          delete copy.id; delete copy.createdAt;
          copy.title += ` ${window.I18N.fr["adm.copy"]}`;
          if (copy.title_en) copy.title_en += ` ${window.I18N.en["adm.copy"]}`;
          const saved = await Store.saveEvent(copy);
          toast(t("adm.copied")); location.hash = `#/admin/edit/${encodeURIComponent(saved.id)}`;
        }
      }
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
    ev = ev || { theme: "sunset", allowGuests: true, items: [], questions: [], emoji: "🎉", category: "Soirée", category_en: "Party" };
    $("#adminRoot").innerHTML = `
      <div class="admin-bar"><h2 style="margin:0">${esc(t(isNew ? "ed.newT" : "ed.editT"))}</h2><a class="btn btn-sm" href="#/admin">${esc(t("ed.back"))}</a></div>
      <form class="form panel" id="evForm">
        <div class="row-3">
          <div class="field"><label for="e_emoji">${esc(t("ed.emoji"))}</label><input type="text" id="e_emoji" name="emoji" value="${esc(ev.emoji)}" maxlength="4"></div>
          <div class="field span-2"><label for="e_title">🇫🇷 ${esc(t("ed.title"))}</label><input type="text" id="e_title" name="title" value="${esc(ev.title || "")}" required maxlength="80"></div>
        </div>
        <div class="row">
          <div class="field"><label for="e_cat">🇫🇷 ${esc(t("ed.cat"))}</label><input type="text" id="e_cat" name="category" value="${esc(ev.category || "")}" list="cats" maxlength="30">
            <datalist id="cats"><option>Match</option><option>Soirée</option><option>Repas partagé</option><option>Apéro</option><option>Jeux</option><option>Ciné</option><option>Sport</option><option>Anniversaire</option></datalist></div>
          <div class="field"><label for="e_loc">🇫🇷 ${esc(t("ed.loc"))}</label><input type="text" id="e_loc" name="location" value="${esc(ev.location || "")}" maxlength="80" placeholder="${esc(t("ed.locPh"))}"></div>
        </div>
        <div class="row-3">
          <div class="field"><label for="e_start">${esc(t("ed.start"))}</label><input type="datetime-local" id="e_start" name="start" value="${esc(ev.start || "")}" required></div>
          <div class="field"><label for="e_end">${esc(t("ed.end"))}</label><input type="datetime-local" id="e_end" name="end" value="${esc(ev.end || "")}"></div>
          <div class="field"><label for="e_cap">${esc(t("ed.cap"))}</label><input type="number" id="e_cap" name="capacity" value="${ev.capacity || ""}" min="0" placeholder="${esc(t("ed.capPh"))}"></div>
        </div>
        <div class="field"><label for="e_desc">🇫🇷 ${esc(t("ed.desc"))}</label><textarea id="e_desc" name="description" rows="5" maxlength="2000">${esc(ev.description || "")}</textarea></div>

        <fieldset class="fieldset">
          <legend>${esc(t("ed.enLegend"))}</legend>
          <p class="card-meta">${esc(t("ed.enHint"))}</p>
          <div class="form">
            <div class="field"><label for="e_title_en">${esc(t("ed.titleEn"))}</label><input type="text" id="e_title_en" name="title_en" value="${esc(ev.title_en || "")}" maxlength="80"></div>
            <div class="row">
              <div class="field"><label for="e_cat_en">${esc(t("ed.catEn"))}</label><input type="text" id="e_cat_en" name="category_en" value="${esc(ev.category_en || "")}" list="cats_en" maxlength="30">
                <datalist id="cats_en"><option>Match</option><option>Party</option><option>Potluck</option><option>Drinks</option><option>Games</option><option>Movie night</option><option>Sport</option><option>Birthday</option></datalist></div>
              <div class="field"><label for="e_loc_en">${esc(t("ed.locEn"))}</label><input type="text" id="e_loc_en" name="location_en" value="${esc(ev.location_en || "")}" maxlength="80"></div>
            </div>
            <div class="field"><label for="e_desc_en">${esc(t("ed.descEn"))}</label><textarea id="e_desc_en" name="description_en" rows="5" maxlength="2000">${esc(ev.description_en || "")}</textarea></div>
          </div>
        </fieldset>

        <div class="field"><span class="label">${esc(t("ed.theme"))}</span>
          <div class="themes">${THEMES.map((th) => `<input type="radio" name="theme" id="th_${th}" value="${th}" ${ev.theme === th ? "checked" : ""}><label for="th_${th}" class="th-${th}" title="${th}"></label>`).join("")}</div>
        </div>
        <label class="check"><input type="checkbox" name="allowGuests" ${ev.allowGuests ? "checked" : ""}> ${esc(t("ed.guests"))}</label>

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
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.title.value.trim() || !form.start.value) { toast(t("ed.required")); return; }
      const items = $$("[data-row=item]", iB).map((r) => ({
        id: $("[name=i_id]", r).value || Store.uid().slice(0, 8),
        emoji: $("[name=i_emoji]", r).value.trim(),
        label: $("[name=i_label]", r).value.trim() || $("[name=i_label_en]", r).value.trim(),
        label_en: $("[name=i_label_en]", r).value.trim(),
        needed: Math.max(1, Number($("[name=i_needed]", r).value) || 1)
      })).filter((i) => i.label);
      const questions = $$("[data-row=question]", qB).map((r) => ({
        id: $("[name=q_id]", r).value || Store.uid().slice(0, 8),
        label: $("[name=q_label]", r).value.trim() || $("[name=q_label_en]", r).value.trim(),
        label_en: $("[name=q_label_en]", r).value.trim(),
        type: $("[name=q_type]", r).value,
        options: splitOpts($("[name=q_opts]", r).value),
        options_en: splitOpts($("[name=q_opts_en]", r).value)
      })).filter((q) => q.label);
      const data = {
        ...(isNew ? {} : ev),
        title: form.title.value.trim(),
        title_en: form.title_en.value.trim(),
        emoji: form.emoji.value.trim() || "✨",
        category: form.category.value.trim(),
        category_en: form.category_en.value.trim(),
        location: form.location.value.trim(),
        location_en: form.location_en.value.trim(),
        start: form.start.value,
        end: form.end.value,
        capacity: Number(form.capacity.value) || 0,
        description: form.description.value.trim(),
        description_en: form.description_en.value.trim(),
        theme: form.theme.value || "sunset",
        allowGuests: form.allowGuests.checked,
        items,
        questions
      };
      try {
        const saved = await Store.saveEvent(data);
        toast(t(isNew ? "ed.published" : "ed.savedMsg"));
        location.hash = `#/event/${encodeURIComponent(saved.id)}`;
      } catch (err) {
        console.error(err); toast(t("ed.error"));
      }
    });
  }

  async function renderResponses(id) {
    const ev = await Store.getEvent(id);
    if (!ev) { location.hash = "#/admin"; return; }
    const rs = await Store.listResponses(id);
    const tl = tally(ev, rs);
    const items = ev.items || [];
    const itemName = (iid) => { const it = items.find((x) => x.id === iid); return it ? loc(it, "label") : iid; };
    const qs = ev.questions || [];
    const rows = rs.map((r) => ({
      r,
      cells: [
        new Date(r.createdAt).toLocaleString(locale()), r.name, r.apartment, status(r.status), r.guests || 0,
        Object.entries(r.items || {}).map(([k, q]) => `${q}× ${itemName(k)}`).join(", "), r.other || "",
        ...qs.map((q) => (r.answers || {})[q.id] || ""), r.message || ""
      ]
    }));
    const head = [t("col.date"), t("col.name"), t("col.apt"), t("col.status"), t("col.guests"), t("col.brings"), t("col.other"), ...qs.map((q) => loc(q, "label")), t("col.msg")];

    $("#adminRoot").innerHTML = `
      <div class="admin-bar">
        <h2 style="margin:0">${esc(ev.emoji || "")} ${esc(loc(ev, "title"))} — ${esc(t("rs.title"))}</h2>
        <div class="admin-actions"><button class="btn btn-sm" id="csv">${esc(t("rs.csv"))}</button><a class="btn btn-sm" href="#/admin">${esc(t("ed.back"))}</a></div>
      </div>
      <div class="stats" style="margin-bottom:24px">
        <div class="stat"><strong>${tl.headcount}</strong><span>${esc(t("rs.expected"))}</span></div>
        <div class="stat"><strong>${rs.filter((r) => r.status === "maybe").length}</strong><span>${esc(t("rs.maybe"))}</span></div>
        <div class="stat"><strong>${rs.filter((r) => r.status === "no").length}</strong><span>${esc(t("rs.absent"))}</span></div>
      </div>
      ${items.length ? `<div class="panel" style="margin-bottom:24px"><h2>${esc(t("rs.recap"))}</h2><div class="needs">${items.map((it) => {
        const got = tl.brought[it.id] || 0;
        return `<div class="need ${got >= it.needed ? "is-full" : ""}"><span class="need-emoji">${esc(it.emoji || "•")}</span><span class="need-label">${esc(loc(it, "label"))}</span><span class="need-count">${got}/${it.needed}</span><span class="bar"><i style="width:${Math.min(100, (got / it.needed) * 100)}%"></i></span></div>`;
      }).join("")}</div></div>` : ""}
      <div class="table-wrap">
        <table>
          <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}<th></th></tr></thead>
          <tbody>${rows.length ? rows.map(({ r, cells }) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}<td><button class="icon-btn" data-delr="${esc(r.id)}" aria-label="${esc(t("rs.delAria", { name: r.name }))}">🗑</button></td></tr>`).join("") : `<tr><td colspan="${head.length + 1}">${esc(t("rs.none"))}</td></tr>`}</tbody>
        </table>
      </div>`;

    $("#csv").onclick = () => {
      const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
      const csv = [head, ...rows.map((x) => x.cells)].map((l) => l.map(q).join(";")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      a.download = `leone-${ev.id}-${lang === "fr" ? "reponses" : "replies"}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    $("#adminRoot").onclick = async (e) => {
      const b = e.target.closest("[data-delr]");
      if (b && confirm(t("rs.delConfirm"))) { await Store.deleteResponse(b.dataset.delr); toast(t("rs.deleted")); renderResponses(id); }
    };
  }

  /* ---------------- Routeur ---------------- */
  async function route(keepScroll) {
    const h = location.hash;
    if (h && !h.startsWith("#/")) return; // ancre interne (ex : #main)
    const [name = "", sub, id] = h.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const known = ["home", "events", "event", "residence", "how", "admin"];
    const v = known.includes(name || "home") ? name || "home" : "home";

    $$(".view").forEach((s) => (s.hidden = s.dataset.view !== v));
    $$(".nav a").forEach((a) => a.classList.toggle("is-active", a.dataset.route === (v === "event" ? "events" : v)));
    closeMenu();
    if (keepScroll !== true) window.scrollTo(0, 0);
    if (v !== "home") clearInterval(countdownTimer);

    try {
      if (v === "home") await renderHome();
      if (v === "events") await renderEvents();
      if (v === "event") await renderEvent(sub);
      if (v === "admin") await renderAdmin(sub, id);
    } catch (err) {
      console.error(err);
      toast(t("load.error"));
    }
    document.title = v === "home" ? t("meta.title") : `${$(".nav a.is-active")?.textContent || "LEONE"} · LEONE`;
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

  applyStatic();
  window.addEventListener("hashchange", () => route());
  route();
})();
