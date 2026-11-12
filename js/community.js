/* =============================================================
   LEONE — communauté : agenda, galerie, annonces, signalements,
   sondages, appli installable + notifications, tableau de bord.
   Chaque fonction reçoit "c" : les outils partagés fournis par app.js.
   ============================================================= */
window.LEONE_COMM = (function () {
  const HONEYPOT = '<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>';
  const fmtDay = (c, iso) => (iso ? new Date(iso).toLocaleDateString(c.locale(), { day: "numeric", month: "long" }) : "");
  const safe = (p, fallback) => p.then((v) => v, () => fallback);

  /* ================= 1. AGENDA ================= */
  const icsEsc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = (line) => { const out = []; let l = line; while (l.length > 72) { out.push(l.slice(0, 72)); l = " " + l.slice(72); } out.push(l); return out.join("\r\n"); };
  // "2026-11-12T20:15" (heure de Paris) -> "20261112T201500"
  const icsLocal = (s) => s.replace(/[-:]/g, "").slice(0, 13) + "00";
  const plusHours = (s, h) => new Date(new Date(s + ":00Z").getTime() + h * 3600e3).toISOString().slice(0, 16);
  const eventUrl = (ev) => `${location.href.split("#")[0]}#/event/${encodeURIComponent(ev.id)}`;

  function buildIcs(c, ev) {
    const end = ev.end || plusHours(ev.start, 3);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LEONE//Evenements//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VTIMEZONE", "TZID:Europe/Paris",
      "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
      "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT", `UID:${ev.id}@leone`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Paris:${icsLocal(ev.start)}`, `DTEND;TZID=Europe/Paris:${icsLocal(end)}`,
      `SUMMARY:${icsEsc(`${ev.emoji || ""} ${c.loc(ev, "title")}`.trim())}`,
      `LOCATION:${icsEsc(c.loc(ev, "location"))}`,
      `DESCRIPTION:${icsEsc(`${c.loc(ev, "description")}\n\n${eventUrl(ev)}`.trim())}`,
      `URL:${eventUrl(ev)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT2H", `DESCRIPTION:${icsEsc(c.loc(ev, "title"))}`, "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ];
    return lines.map(fold).join("\r\n") + "\r\n";
  }
  function googleUrl(c, ev) {
    const end = ev.end || plusHours(ev.start, 3);
    const q = new URLSearchParams({
      action: "TEMPLATE", text: `${ev.emoji || ""} ${c.loc(ev, "title")}`.trim(),
      dates: `${icsLocal(ev.start)}/${icsLocal(end)}`, ctz: "Europe/Paris",
      details: `${c.loc(ev, "description")}\n\n${eventUrl(ev)}`.trim(), location: c.loc(ev, "location")
    });
    return `https://calendar.google.com/calendar/render?${q}`;
  }
  /** Boutons « Ajouter à mon agenda » d'une page d'événement. */
  function calendarHTML(c, ev) {
    return `<div class="cal-box">
        <span class="cal-label">📅 ${c.esc(c.t("cal.add"))}</span>
        <div class="btn-row">
          <a class="btn btn-sm" href="${c.esc(googleUrl(c, ev))}" target="_blank" rel="noopener noreferrer">Google ↗</a>
          <button type="button" class="btn btn-sm" data-ics>${c.esc(c.t("cal.ics"))}</button>
        </div>
        <small>${c.esc(c.t("cal.reminder"))}</small>
      </div>`;
  }
  function bindCalendar(c, root, ev) {
    const b = c.$("[data-ics]", root);
    if (!b) return;
    b.onclick = () => {
      const url = URL.createObjectURL(new Blob([buildIcs(c, ev)], { type: "text/calendar;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `leone-${ev.id}.ics`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
  }

  /* ================= 2. GALERIE (page d'un événement) ================= */
  function zoomHandler(c, root) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-zoom]");
      if (!b) return;
      let dlg = c.$("#photoDialog");
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "photoDialog"; dlg.className = "receipt-dialog";
        document.body.appendChild(dlg);
        dlg.addEventListener("click", (ev) => { if (ev.target === dlg || ev.target.closest("[data-close]")) dlg.close(); });
      }
      dlg.innerHTML = `<div class="receipt-box"><button class="icon-btn receipt-close" data-close aria-label="${c.esc(c.t("pot.close"))}">✕</button>
        <img src="${c.esc(b.dataset.zoom)}" alt="${c.esc(b.dataset.cap || "")}">${b.dataset.cap ? `<p>${c.esc(b.dataset.cap)}</p>` : ""}</div>`;
      if (!dlg.open) dlg.showModal();
    });
  }
  async function renderGallery(c, ev, box) {
    if (!box) return;
    const started = new Date(ev.start) <= new Date();
    const photos = await safe(Store.listPhotos(ev.id), []);
    if (!started && !photos.length) { box.innerHTML = ""; return; }
    box.innerHTML = `
      <div class="panel reveal">
        <div class="list-head"><h2>📸 ${c.esc(c.t("gal.title"))}</h2>
          ${started ? `<label class="btn btn-sm btn-primary file-btn">${c.esc(c.t("gal.add"))}<input type="file" accept="image/*" multiple hidden id="galUpload"></label>` : ""}</div>
        ${photos.length ? `<div class="gallery-grid">${photos.map((p) => `
          <button type="button" class="gallery-item" data-zoom="${c.esc(Store.uploadUrl(p.path))}" data-cap="${c.esc(p.caption)}">
            <img src="${c.esc(Store.uploadUrl(p.path))}" alt="${c.esc(p.caption)}" loading="lazy"></button>`).join("")}</div>`
        : `<p class="card-meta">${c.esc(c.t("gal.none"))}</p>`}
        ${started ? `<small class="card-meta">${c.esc(c.t("gal.hint"))}</small>` : ""}
      </div>`;
    zoomHandler(c, box);
    if (!started) return;
    c.$("#galUpload").onchange = async (e) => {
      const files = [...e.target.files].slice(0, 10);
      e.target.value = "";
      if (!files.length) return;
      c.toast(c.t("apot.uploading"));
      let ok = 0;
      for (const f of files) {
        try { await Store.submitPhoto(ev.id, f, ""); ok++; }
        catch (err) { if (!err.code) console.error(err); c.toast(c.errMsg(err)); if (err.code === "RATE_LIMIT") break; }
      }
      if (ok) c.toast(c.tp("gal.sent", ok));
    };
  }

  /* ================= GALERIE (onglet) ================= */
  let galFilter = "all";
  async function renderGalleryPage(c) {
    const root = c.$("#galleryRoot");
    const [events, admin] = await Promise.all([Store.listEvents(), Store.isAdmin()]);
    const now = new Date();
    const evs = [...events].sort((a, b) => String(b.start).localeCompare(String(a.start)));
    const lists = await Promise.all(evs.map((e) => safe(Store.listPhotos(e.id), [])));
    const groups = evs.map((e, i) => ({ ev: e, photos: lists[i] })).filter((g) => g.photos.length);
    // l'organisateur peut rattacher à n'importe quel événement ; les résidents, à un événement commencé
    const choices = admin ? evs : evs.filter((e) => new Date(e.start) <= now);
    if (galFilter !== "all" && !groups.some((g) => g.ev.id === galFilter)) galFilter = "all";
    const label = (e) => `${e.emoji || ""} ${c.loc(e, "title")} · ${fmtDay(c, e.start)}`.trim();
    const shown = galFilter === "all" ? groups : groups.filter((g) => g.ev.id === galFilter);
    const total = groups.reduce((n, g) => n + g.photos.length, 0);
    root.innerHTML = `
      <form class="panel photo-add" id="galAddForm" novalidate>
        <h2>📸 ${c.esc(c.t("galp.addT"))}</h2>
        ${choices.length ? `
        <div class="row">
          <div class="field"><label for="ga_event">${c.esc(c.t("galp.event"))}</label>
            <select id="ga_event">${choices.map((e) => `<option value="${c.esc(e.id)}" ${e === (choices.find((x) => new Date(x.start) <= now) || choices[0]) ? "selected" : ""}>${c.esc(label(e))}</option>`).join("")}</select></div>
          <div class="field"><label for="ga_cap">${c.esc(c.t("galp.caption"))}</label><input type="text" id="ga_cap" maxlength="140"></div>
        </div>
        <div class="photo-add-actions">
          <label class="btn btn-primary file-btn">＋ ${c.esc(c.t("galp.choose"))}<input type="file" accept="image/*" multiple hidden id="ga_files"></label>
          <span class="card-meta" id="ga_status" aria-live="polite"></span>
        </div>
        <small class="card-meta">${c.esc(admin ? c.t("galp.adminHint") : c.t("gal.hint"))}</small>`
        : `<p class="card-meta">${c.esc(c.t("galp.noEvent"))}</p>`}
      </form>
      ${groups.length > 1 ? `<div class="filters" role="tablist" aria-label="${c.esc(c.t("galp.event"))}">
        <button class="chip ${galFilter === "all" ? "is-active" : ""}" data-gf="all" role="tab" aria-selected="${galFilter === "all"}">${c.esc(c.t("galp.all"))} (${total})</button>
        ${groups.map((g) => `<button class="chip ${galFilter === g.ev.id ? "is-active" : ""}" data-gf="${c.esc(g.ev.id)}" role="tab" aria-selected="${galFilter === g.ev.id}">${c.esc(`${g.ev.emoji || ""} ${c.loc(g.ev, "title")}`.trim())} (${g.photos.length})</button>`).join("")}
      </div>` : ""}
      ${shown.length ? shown.map((g) => `
        <section class="gal-group">
          <div class="list-head"><h2>${c.esc(label(g.ev))}</h2><a class="link" href="#/event/${encodeURIComponent(g.ev.id)}">${c.esc(c.t("galp.see"))} →</a></div>
          <div class="gallery-grid">${g.photos.map((p) => `
            <button type="button" class="gallery-item" data-zoom="${c.esc(Store.uploadUrl(p.path))}" data-cap="${c.esc(p.caption ? `${p.caption} — ${label(g.ev)}` : label(g.ev))}">
              <img src="${c.esc(Store.uploadUrl(p.path))}" alt="${c.esc(p.caption || label(g.ev))}" loading="lazy"></button>`).join("")}</div>
        </section>`).join("") : `<div class="empty">${c.esc(c.t("galp.none"))}</div>`}`;
    zoomHandler(c, root);
    root.querySelectorAll("[data-gf]").forEach((b) => { b.onclick = () => { galFilter = b.dataset.gf; renderGalleryPage(c); }; });
    const inp = c.$("#ga_files");
    if (!inp) return;
    inp.onchange = async (e) => {
      const files = [...e.target.files].slice(0, admin ? 20 : 10);
      e.target.value = "";
      if (!files.length) return;
      const eventId = c.$("#ga_event").value, cap = c.$("#ga_cap").value, out = c.$("#ga_status");
      inp.disabled = true;
      let ok = 0;
      for (const [i, f] of files.entries()) {
        out.textContent = `${c.t("galp.sending")} ${i + 1}/${files.length}`;
        try {
          if (admin) await Store.adminAddPhoto(eventId, f, cap);
          else await Store.submitPhoto(eventId, f, cap);
          ok++;
        } catch (err) {
          if (!err.code) console.error(err);
          c.toast(c.errMsg(err));
          if (["RATE_LIMIT", "AUTH", "STORAGE", "DB_OUTDATED", "NOT_STARTED"].includes(err.code)) break;
        }
      }
      inp.disabled = false;
      out.textContent = "";
      if (!ok) return;
      if (admin) { galFilter = eventId; c.toast(c.tp("galp.published", ok)); renderGalleryPage(c); }
      else { c.toast(c.tp("gal.sent", ok)); c.$("#ga_cap").value = ""; }
    };
  }

  /* ================= 3. PETITES ANNONCES ================= */
  const AD_KINDS = ["lend", "give", "seek", "help"];
  const AD_EMOJI = { lend: "🔁", give: "🎁", seek: "🔍", help: "🤝" };
  let adFilter = "all";
  async function renderAds(c) {
    const root = c.$("#adsRoot");
    const list = await Store.listClassifieds();
    const shown = adFilter === "all" ? list : list.filter((a) => a.kind === adFilter);
    root.innerHTML = `
      <div class="list-head">
        <div class="filters" role="tablist" aria-label="${c.esc(c.t("ads.kind"))}">
          ${["all", ...AD_KINDS].map((k) => `<button class="chip ${adFilter === k ? "is-active" : ""}" data-adf="${k}" role="tab" aria-selected="${adFilter === k}">${k === "all" ? c.esc(c.t("ads.all")) : `${AD_EMOJI[k]} ${c.esc(c.t(`ads.k.${k}`))}`}</button>`).join("")}
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="adToggle" aria-expanded="false" aria-controls="adForm">＋ ${c.esc(c.t("ads.new"))}</button>
      </div>
      <form class="form panel" id="adForm" hidden novalidate autocomplete="off">
        <div class="field"><span class="label">${c.esc(c.t("ads.kind"))}</span>
          <div class="seg seg-4">${AD_KINDS.map((k, i) => `<input type="radio" name="kind" id="adk_${k}" value="${k}" ${i === 0 ? "checked" : ""}><label for="adk_${k}">${AD_EMOJI[k]} ${c.esc(c.t(`ads.k.${k}`))}</label>`).join("")}</div>
        </div>
        <div class="field"><label for="ad_title">${c.esc(c.t("ads.titleL"))}</label><input type="text" id="ad_title" name="title" maxlength="80" required placeholder="${c.esc(c.t("ads.titlePh"))}"></div>
        <div class="field"><label for="ad_body">${c.esc(c.t("ads.body"))}</label><textarea id="ad_body" name="body" maxlength="600"></textarea></div>
        <div class="row">
          <div class="field"><label for="ad_contact">${c.esc(c.t("ads.contact"))}</label><input type="text" id="ad_contact" name="contact" maxlength="80" placeholder="${c.esc(c.t("ads.contactPh"))}"><small>⚠️ ${c.esc(c.t("ads.contactHint"))}</small></div>
          <div class="field"><label for="ad_name">${c.esc(c.t("ads.name"))}</label><input type="text" id="ad_name" name="name" maxlength="40" autocomplete="given-name"></div>
        </div>
        <div class="field receipt-field"><label for="ad_photo">📷 ${c.esc(c.t("ads.photo"))}</label><input type="file" id="ad_photo" name="photo" accept="image/*"></div>
        ${HONEYPOT}
        <div class="btn-row"><button class="btn btn-primary" type="submit">${c.esc(c.t("ads.send"))}</button><button class="btn" type="button" id="adCancel">${c.esc(c.t("form.cancelEdit"))}</button></div>
      </form>
      ${shown.length ? `<div class="ad-grid">${shown.map((a) => `
        <article class="ad-card kind-${c.esc(a.kind)}">
          ${a.photoPath && Store.uploadUrl(a.photoPath) ? `<button type="button" class="ad-photo" data-zoom="${c.esc(Store.uploadUrl(a.photoPath))}" data-cap="${c.esc(a.title)}"><img src="${c.esc(Store.uploadUrl(a.photoPath))}" alt="" loading="lazy"></button>` : ""}
          <div class="ad-body">
            <span class="tag">${AD_EMOJI[a.kind]} ${c.esc(c.t(`ads.k.${a.kind}`))}</span>
            <h3>${c.esc(a.title)}</h3>
            ${a.body ? `<p class="notice-body">${c.esc(a.body)}</p>` : ""}
            ${a.contact ? `<p class="ad-contact">📩 ${c.esc(a.contact)}</p>` : ""}
            <p class="card-meta">${a.name ? `${c.esc(c.t("ads.by", { x: a.name }))} · ` : ""}${c.esc(fmtDay(c, a.createdAt))} · ${c.esc(c.t("ads.expires", { x: fmtDay(c, a.expiresAt) }))}</p>
            ${a.isMine ? `<button type="button" class="btn btn-sm btn-danger" data-adrm="${c.esc(a.id)}">${c.esc(c.t("ads.remove"))}</button>` : ""}
          </div>
        </article>`).join("")}</div>`
      : `<div class="empty">${c.esc(c.t("ads.none"))}</div>`}`;

    const form = c.$("#adForm"), toggle = c.$("#adToggle");
    const setOpen = (o) => { form.hidden = !o; toggle.setAttribute("aria-expanded", String(o)); if (o) c.$("#ad_title").focus(); };
    toggle.onclick = () => setOpen(form.hidden);
    c.$("#adCancel").onclick = () => setOpen(false);
    const shownAt = Date.now();
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (form.website.value) return setOpen(false);
      if (Date.now() - shownAt < 2500) { c.toast(c.t("form.tooFast")); return; }
      if (form.title.value.trim().length < 3) { c.toast(c.t("ads.needTitle")); form.title.focus(); return; }
      const btn = c.$("button[type=submit]", form);
      btn.disabled = true;
      try {
        await Store.postClassified({ kind: form.kind.value, title: form.title.value, body: form.body.value, contact: form.contact.value, name: form.name.value }, form.photo.files[0] || null);
        c.toast(c.t("ads.posted"));
        adFilter = "all";
        renderAds(c);
      } catch (err) { if (!err.code) console.error(err); btn.disabled = false; c.toast(c.errMsg(err)); }
    };
    root.onclick = async (e) => {
      const f = e.target.closest("[data-adf]"), rm = e.target.closest("[data-adrm]");
      if (f) { adFilter = f.dataset.adf; renderAds(c); }
      if (rm && confirm(c.t("ads.removeConfirm"))) {
        try { await Store.removeClassified(list.find((a) => a.id === rm.dataset.adrm)); c.toast(c.t("ads.removed")); renderAds(c); }
        catch (err) { c.toast(c.errMsg(err)); }
      }
    };
    if (!root.dataset.zoomBound) { zoomHandler(c, root); root.dataset.zoomBound = "1"; }
  }

  /* ================= 4. SIGNALEMENTS ================= */
  const REP_CATS = ["electricity", "water", "heating", "elevator", "cleanliness", "security", "other"];
  const REP_EMOJI = { electricity: "💡", water: "💧", heating: "🌡️", elevator: "🛗", cleanliness: "🧹", security: "🔒", other: "❓" };
  const REP_STATUS_EMOJI = { new: "🟠", forwarded: "🔵", fixed: "🟢" };
  async function renderReports(c) {
    const root = c.$("#reportRoot");
    const list = await Store.listReports();
    root.innerHTML = `
      <p class="notice rep-urgent">🚨 ${c.esc(c.t("rep.urgent"))}</p>
      <div class="event-layout">
        <form class="form panel" id="repForm" novalidate autocomplete="off">
          <h2>${c.esc(c.t("rep.formT"))}</h2>
          <div class="row">
            <div class="field"><label for="rep_cat">${c.esc(c.t("rep.cat"))}</label>
              <select id="rep_cat" name="category">${REP_CATS.map((k) => `<option value="${k}">${REP_EMOJI[k]} ${c.esc(c.t(`rep.c.${k}`))}</option>`).join("")}</select></div>
            <div class="field"><label for="rep_loc">${c.esc(c.t("rep.loc"))}</label><input type="text" id="rep_loc" name="location" maxlength="80" placeholder="${c.esc(c.t("rep.locPh"))}"></div>
          </div>
          <div class="field"><label for="rep_body">${c.esc(c.t("rep.body"))}</label><textarea id="rep_body" name="body" maxlength="800" required placeholder="${c.esc(c.t("rep.bodyPh"))}"></textarea></div>
          <div class="field receipt-field"><label for="rep_photo">📷 ${c.esc(c.t("rep.photo"))}</label><input type="file" id="rep_photo" name="photo" accept="image/*"></div>
          <div class="field"><label for="rep_name">${c.esc(c.t("rep.name"))}</label><input type="text" id="rep_name" name="name" maxlength="40" autocomplete="given-name"><small>🔒 ${c.esc(c.t("rep.nameHint"))}</small></div>
          ${HONEYPOT}
          <div class="btn-row"><button class="btn btn-primary" type="submit">${c.esc(c.t("rep.send"))}</button></div>
        </form>
        <div class="panel">
          <h2>${c.esc(c.t("rep.list"))}</h2>
          ${list.length ? `<ul class="rep-list">${list.map((r) => `
            <li class="rep-item status-${c.esc(r.status)}">
              <div class="rep-head">
                <strong>${REP_EMOJI[r.category] || "❓"} ${c.esc(c.t(`rep.c.${r.category}`))}${r.location ? ` · ${c.esc(r.location)}` : ""}</strong>
                <span class="tag tag-rep-${c.esc(r.status)}">${REP_STATUS_EMOJI[r.status]} ${c.esc(c.t(`rep.s.${r.status}`))}</span>
              </div>
              <p class="notice-body">${c.esc(r.body)}</p>
              ${r.photoPath && Store.uploadUrl(r.photoPath) ? `<button type="button" class="rep-photo" data-zoom="${c.esc(Store.uploadUrl(r.photoPath))}"><img src="${c.esc(Store.uploadUrl(r.photoPath))}" alt="" loading="lazy"></button>` : ""}
              ${r.adminNote ? `<p class="rep-note">💬 ${c.esc(c.t("rep.note", { x: r.adminNote }))}</p>` : ""}
              <span class="card-meta">${c.esc(fmtDay(c, r.createdAt))}</span>
            </li>`).join("")}</ul>` : `<p class="card-meta">${c.esc(c.t("rep.none"))}</p>`}
        </div>
      </div>`;
    const form = c.$("#repForm");
    const shownAt = Date.now();
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (form.website.value) return;
      if (Date.now() - shownAt < 2500) { c.toast(c.t("form.tooFast")); return; }
      if (form.body.value.trim().length < 5) { c.toast(c.t("rep.needBody")); form.body.focus(); return; }
      const btn = c.$("button[type=submit]", form);
      btn.disabled = true;
      try {
        await Store.submitReport({ category: form.category.value, location: form.location.value, body: form.body.value, name: form.name.value }, form.photo.files[0] || null);
        c.toast(c.t("rep.sent"));
        renderReports(c);
      } catch (err) { if (!err.code) console.error(err); btn.disabled = false; c.toast(c.errMsg(err)); }
    };
    if (!root.dataset.zoomBound) { zoomHandler(c, root); root.dataset.zoomBound = "1"; }
  }

  /* ================= 5. SONDAGES ================= */
  const pollClosed = (p) => Boolean(p.endsAt && new Date(p.endsAt) < new Date());
  function pollHTML(c, p) {
    const closed = pollClosed(p);
    const opts = p.options.map((o) => {
      const n = p.counts[o.id] || 0, pct = p.total ? Math.round((n / p.total) * 100) : 0, mine = p.myChoice === o.id;
      return `<button type="button" class="poll-opt ${mine ? "is-mine" : ""}" data-poll="${c.esc(p.id)}" data-opt="${c.esc(o.id)}" ${closed ? "disabled" : ""} aria-pressed="${mine}">
          <span class="poll-fill" style="width:${pct}%"></span>
          <span class="poll-label">${mine ? "✓ " : ""}${c.esc(c.loc(o, "label"))}</span>
          <span class="poll-pct">${pct}%</span>
        </button>`;
    }).join("");
    return `<article class="poll-card ${closed ? "is-closed" : ""}">
        <h3>${c.esc(c.loc(p, "question"))}</h3>
        <div class="poll-opts">${opts}</div>
        <p class="card-meta">${c.esc(c.tp("poll.votes", p.total))}${closed ? ` · ${c.esc(c.t("poll.closed"))}` : p.endsAt ? ` · ${c.esc(c.t("poll.endsOn", { x: fmtDay(c, p.endsAt) }))}` : ""}</p>
      </article>`;
  }
  async function renderPolls(c, boxSel = "#pollsRoot", onlyOpen = false, limit = 30) {
    const root = c.$(boxSel);
    if (!root) return;
    let list = await safe(Store.listPolls(), []);
    if (onlyOpen) list = list.filter((p) => !pollClosed(p));
    list = list.slice(0, limit);
    if (boxSel === "#homePolls") {
      root.innerHTML = list.length ? `<div class="home-polls"><h2 class="home-polls-title">🗳️ ${c.esc(c.t("poll.home"))}</h2>${list.map((p) => pollHTML(c, p)).join("")}</div>` : "";
    } else {
      root.innerHTML = list.length ? `<div class="poll-grid">${list.map((p) => pollHTML(c, p)).join("")}</div>` : `<div class="empty">${c.esc(c.t("poll.none"))}</div>`;
    }
    root.onclick = async (e) => {
      const b = e.target.closest("[data-poll]");
      if (!b || b.disabled) return;
      const p = list.find((x) => x.id === b.dataset.poll);
      const next = p.myChoice === b.dataset.opt ? "" : b.dataset.opt;
      try { await Store.votePoll(p.id, next); renderPolls(c, boxSel, onlyOpen, limit); }
      catch (err) { c.toast(c.errMsg(err)); }
    };
  }

  /* ================= 6. APPLI INSTALLABLE + NOTIFICATIONS ================= */
  let installEvt = null;
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function initPwa(c) {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("LEONE : service worker", e));
    }
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; if (location.hash === "#/app") renderApp(c); });
    window.addEventListener("appinstalled", () => { installEvt = null; c.toast(c.t("app.installed")); });
  }
  const b64ToBytes = (b64) => { const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (ch) => ch.charCodeAt(0)); };
  async function currentSub() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }
  async function renderApp(c) {
    const root = c.$("#appRoot");
    const pushOk = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const [key, sub] = await Promise.all([safe(Store.getPushKey(), ""), safe(currentSub(), null)]);
    let notif;
    if (!pushOk) notif = `<p class="notice">${c.esc(c.t(isIOS() && !isStandalone() ? "app.iosFirst" : "app.unsupported"))}</p>`;
    else if (!key) notif = `<p class="card-meta">${c.esc(c.t("app.notReady"))}</p>`;
    else if (Notification.permission === "denied") notif = `<p class="notice">${c.esc(c.t("app.denied"))}</p>`;
    else notif = sub
      ? `<p class="app-ok">${c.esc(c.t("app.enabled"))}</p><button class="btn" id="pushOff">🔕 ${c.esc(c.t("app.off"))}</button>`
      : `<button class="btn btn-primary" id="pushOn">🔔 ${c.esc(c.t("app.on"))}</button>`;
    root.innerHTML = `
      <div class="app-grid">
        <section class="panel">
          <h2>📲 ${c.esc(c.t("app.installT"))}</h2>
          ${isStandalone() ? `<p class="app-ok">${c.esc(c.t("app.installed"))}</p>` : `
            ${installEvt ? `<button class="btn btn-primary" id="installBtn">⬇️ ${c.esc(c.t("app.installBtn"))}</button>` : ""}
            <div class="app-steps ${isIOS() ? "is-first" : ""}">
              <h3>🍏 ${c.esc(c.t("app.iosSteps"))}</h3>
              <ol><li>${c.esc(c.t("app.ios1"))}</li><li>${c.esc(c.t("app.ios2"))}</li><li>${c.esc(c.t("app.ios3"))}</li></ol>
            </div>
            <div class="app-steps">
              <h3>🤖 ${c.esc(c.t("app.androidSteps"))}</h3>
              <ol><li>${c.esc(c.t("app.and1"))}</li><li>${c.esc(c.t("app.and2"))}</li></ol>
            </div>`}
        </section>
        <section class="panel">
          <h2>🔔 ${c.esc(c.t("app.notifT"))}</h2>
          <p>${c.esc(c.t("app.notifLead"))}</p>
          ${notif}
          <small class="card-meta">🔒 ${c.esc(c.t("app.privacy"))}</small>
        </section>
      </div>`;
    const inst = c.$("#installBtn");
    if (inst) inst.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => null); installEvt = null; renderApp(c); };
    const on = c.$("#pushOn"), off = c.$("#pushOff");
    if (on) on.onclick = async () => {
      on.disabled = true;
      try {
        if ((await Notification.requestPermission()) !== "granted") { c.toast(c.t("app.denied")); return renderApp(c); }
        const reg = await navigator.serviceWorker.ready;
        const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
        await Store.pushSubscribe(s, c.lang());
        c.toast(c.t("app.enabled"));
      } catch (err) { console.warn(err); c.toast(c.t(err.code ? c.errMsg(err) : "app.unsupported")); }
      renderApp(c);
    };
    if (off) off.onclick = async () => {
      try { const s = await currentSub(); if (s) { await Store.pushUnsubscribe(s.endpoint); await s.unsubscribe(); } c.toast(c.t("app.disabled")); }
      catch (err) { console.warn(err); }
      renderApp(c);
    };
  }

  /* ================= ORGANISER : photos, annonces, signalements, sondages ================= */
  async function renderAdminPhotos(c, tabs) {
    const root = c.$("#adminRoot");
    const [photos, events] = await Promise.all([Store.adminListPhotos(), Store.listEvents()]);
    const title = (id) => { const ev = events.find((e) => e.id === id); return ev ? `${ev.emoji || ""} ${c.loc(ev, "title")}` : id; };
    const pending = photos.filter((p) => p.status === "pending"), approved = photos.filter((p) => p.status === "approved");
    const card = (p) => `
      <div class="mod-photo">
        <button type="button" class="gallery-item" data-zoom="${c.esc(Store.uploadUrl(p.path))}"><img src="${c.esc(Store.uploadUrl(p.path))}" alt="" loading="lazy"></button>
        <div class="card-meta">${c.esc(title(p.eventId))} · ${c.esc(fmtDay(c, p.createdAt))}</div>
        <div class="admin-actions">
          ${p.status === "pending" ? `<button class="btn btn-sm btn-primary" data-ok="${c.esc(p.id)}">✓ ${c.esc(c.t("amod.approve"))}</button>` : ""}
          <button class="btn btn-sm btn-danger" data-no="${c.esc(p.id)}">${c.esc(c.t(p.status === "pending" ? "amod.reject" : "amod.remove"))}</button>
        </div>
      </div>`;
    const evs = [...events].sort((a, b) => String(b.start).localeCompare(String(a.start)));
    const now = new Date();
    const pick = evs.find((e) => new Date(e.start) <= now) || evs[0];
    root.innerHTML = `${tabs}
      <form class="panel photo-add" id="photoAddForm" novalidate>
        <h2>📸 ${c.esc(c.t("amod.addT"))}</h2>
        <p class="card-meta">${c.esc(c.t("amod.addHint"))}</p>
        ${evs.length ? `
        <div class="row">
          <div class="field"><label for="pa_event">${c.esc(c.t("amod.event"))}</label>
            <select id="pa_event">${evs.map((e) => `<option value="${c.esc(e.id)}" ${pick && e.id === pick.id ? "selected" : ""}>${c.esc(`${e.emoji || ""} ${c.loc(e, "title")} · ${fmtDay(c, e.start)}`)}</option>`).join("")}</select></div>
          <div class="field"><label for="pa_cap">${c.esc(c.t("amod.caption"))}</label><input type="text" id="pa_cap" maxlength="140"></div>
        </div>
        <div class="photo-add-actions">
          <label class="btn btn-primary file-btn">＋ ${c.esc(c.t("amod.choose"))}<input type="file" accept="image/*" multiple hidden id="pa_files"></label>
          <span class="card-meta" id="pa_count" aria-live="polite"></span>
          <a class="btn btn-sm" id="pa_see" href="#/event/${c.esc(pick ? pick.id : "")}">${c.esc(c.t("amod.seeEvent"))} →</a>
          <a class="btn btn-sm" href="#/gallery">📸 ${c.esc(c.t("nav.gallery"))} →</a>
        </div>` : `<p class="card-meta">${c.esc(c.t("adm.none"))}</p>`}
      </form>
      <h2>${c.esc(c.t("amod.pending"))} (${pending.length})</h2>
      ${pending.length ? `<div class="mod-grid">${pending.map(card).join("")}</div>` : `<p class="card-meta">${c.esc(c.t("amod.nothing"))}</p>`}
      <h2 style="margin-top:28px">${c.esc(c.t("amod.approved"))} (${approved.length})</h2>
      ${approved.length ? `<div class="mod-grid">${approved.map(card).join("")}</div>` : `<p class="card-meta">${c.esc(c.t("amod.nothing"))}</p>`}`;
    zoomHandler(c, root);
    const sel = c.$("#pa_event");
    if (sel) sel.onchange = () => { c.$("#pa_see").href = "#/event/" + encodeURIComponent(sel.value); };
    const inp = c.$("#pa_files");
    if (inp) inp.onchange = async (e) => {
      const files = [...e.target.files].slice(0, 20);
      e.target.value = "";
      if (!files.length) return;
      const eventId = sel.value, cap = c.$("#pa_cap").value;
      const out = c.$("#pa_count");
      inp.disabled = true;
      let ok = 0;
      for (const [i, f] of files.entries()) {
        out.textContent = `${c.t("apot.uploading")} ${i + 1}/${files.length}`;
        try { await Store.adminAddPhoto(eventId, f, cap); ok++; }
        catch (err) { if (!err.code) console.error(err); c.toast(c.errMsg(err)); if (["RATE_LIMIT", "AUTH", "STORAGE"].includes(err.code)) break; }
      }
      inp.disabled = false;
      if (ok) { c.toast(c.tp("amod.added", ok)); renderAdminPhotos(c, tabs); }
      else out.textContent = "";
    };
    root.onclick = async (e) => {
      const ok = e.target.closest("[data-ok]"), no = e.target.closest("[data-no]");
      try {
        if (ok) await Store.setPhotoStatus(ok.dataset.ok, "approved");
        else if (no) { if (!confirm(c.t("amod.removeConfirm"))) return; await Store.deletePhoto(photos.find((p) => p.id === no.dataset.no)); }
        else return;
        renderAdminPhotos(c, tabs);
      } catch (err) { c.toast(c.errMsg(err)); }
    };
  }

  async function renderAdminAds(c, tabs) {
    const root = c.$("#adminRoot");
    const list = await Store.listClassifieds();
    root.innerHTML = `${tabs}
      <p class="card-meta">${c.esc(c.t("amod.adsHint"))}</p>
      <div class="admin-list">${list.length ? list.map((a) => `
        <div class="admin-row">
          <span class="em">${AD_EMOJI[a.kind]}</span>
          <div><h3>${c.esc(a.title)}</h3><div class="meta">${c.esc(c.t(`ads.k.${a.kind}`))}${a.name ? ` · ${c.esc(a.name)}` : ""} · ${c.esc(fmtDay(c, a.createdAt))}${a.contact ? ` · 📩 ${c.esc(a.contact)}` : ""}</div>${a.body ? `<p class="notice-body">${c.esc(a.body)}</p>` : ""}</div>
          <div class="admin-actions"><button class="btn btn-sm btn-danger" data-del="${c.esc(a.id)}">${c.esc(c.t("adm.del"))}</button></div>
        </div>`).join("") : `<div class="empty">${c.esc(c.t("ads.none"))}</div>`}</div>`;
    root.onclick = async (e) => {
      const d = e.target.closest("[data-del]");
      if (!d || !confirm(c.t("ads.removeConfirm"))) return;
      try { await Store.removeClassified({ ...list.find((a) => a.id === d.dataset.del), isMine: false }); renderAdminAds(c, tabs); } catch (err) { c.toast(c.errMsg(err)); }
    };
  }

  async function renderAdminReports(c, tabs) {
    const root = c.$("#adminRoot");
    const list = await Store.adminListReports();
    root.innerHTML = `${tabs}
      <div class="admin-list">${list.length ? list.map((r) => `
        <div class="admin-row rep-admin ${r.hidden ? "is-hidden-article" : ""}" data-id="${c.esc(r.id)}">
          <span class="em">${REP_EMOJI[r.category] || "❓"}</span>
          <div>
            <h3>${c.esc(c.t(`rep.c.${r.category}`))}${r.location ? ` · ${c.esc(r.location)}` : ""}</h3>
            <p class="notice-body">${c.esc(r.body)}</p>
            ${r.photoPath && Store.uploadUrl(r.photoPath) ? `<button type="button" class="rep-photo" data-zoom="${c.esc(Store.uploadUrl(r.photoPath))}"><img src="${c.esc(Store.uploadUrl(r.photoPath))}" alt=""></button>` : ""}
            <div class="meta">${c.esc(fmtDay(c, r.createdAt))}${r.name ? ` · ${c.esc(c.t("ap.by", { x: r.name }))}` : ""}${r.hidden ? ` · ${c.esc(c.t("ag.hidden"))}` : ""}</div>
            <div class="rep-controls">
              <select data-status aria-label="${c.esc(c.t("amod.status"))}">${["new", "forwarded", "fixed"].map((s) => `<option value="${s}" ${r.status === s ? "selected" : ""}>${REP_STATUS_EMOJI[s]} ${c.esc(c.t(`rep.s.${s}`))}</option>`).join("")}</select>
              <input type="text" data-note maxlength="300" placeholder="${c.esc(c.t("amod.notePh"))}" value="${c.esc(r.adminNote)}">
              <button class="btn btn-sm btn-primary" data-save>${c.esc(c.t("ed.save"))}</button>
            </div>
          </div>
          <div class="admin-actions">
            <button class="btn btn-sm" data-hide>${c.esc(c.t(r.hidden ? "ag.show" : "ag.hide"))}</button>
            <button class="btn btn-sm btn-danger" data-del>${c.esc(c.t("adm.del"))}</button>
          </div>
        </div>`).join("") : `<div class="empty">${c.esc(c.t("rep.none"))}</div>`}</div>`;
    zoomHandler(c, root);
    root.onclick = async (e) => {
      const row = e.target.closest("[data-id]");
      if (!row) return;
      const r = list.find((x) => x.id === row.dataset.id);
      try {
        if (e.target.closest("[data-save]")) { await Store.updateReport(r.id, { status: c.$("[data-status]", row).value, adminNote: c.$("[data-note]", row).value }); c.toast(c.t("ed.savedMsg")); }
        else if (e.target.closest("[data-hide]")) await Store.updateReport(r.id, { hidden: !r.hidden });
        else if (e.target.closest("[data-del]")) { if (!confirm(c.t("amod.removeConfirm"))) return; await Store.deleteReport(r); }
        else return;
        renderAdminReports(c, tabs);
      } catch (err) { c.toast(c.errMsg(err)); }
    };
  }

  async function renderAdminPolls(c, tabs) {
    const root = c.$("#adminRoot");
    const list = await Store.adminListPolls();
    root.innerHTML = `${tabs}
      <div class="event-layout">
        <form class="form panel" id="pollForm" novalidate>
          <h2>${c.esc(c.t("apoll.new"))}</h2>
          <div class="field"><label for="pl_q">${c.esc(c.t("apoll.question"))}</label><input type="text" id="pl_q" name="question" maxlength="160" required placeholder="${c.esc(c.t("apoll.questionPh"))}"></div>
          <div class="field"><label for="pl_q_en">${c.esc(c.t("apoll.questionEn"))}</label><input type="text" id="pl_q_en" name="question_en" maxlength="160"></div>
          <div class="field"><label for="pl_opts">${c.esc(c.t("apoll.options"))}</label><textarea id="pl_opts" name="options" rows="5" placeholder="${c.esc(c.t("apoll.optionsPh"))}"></textarea><small>${c.esc(c.t("apoll.optionsHint"))}</small></div>
          <div class="field"><label for="pl_end">${c.esc(c.t("apoll.end"))}</label><input type="datetime-local" id="pl_end" name="end"><small>${c.esc(c.t("ainf.endHint"))}</small></div>
          <div class="btn-row"><button class="btn btn-primary" type="submit">${c.esc(c.t("ainf.publish"))}</button></div>
        </form>
        <div class="panel">
          <h2>${c.esc(c.t("poll.title"))}</h2>
          ${list.length ? list.map((p) => `
            <div class="poll-admin" data-id="${c.esc(p.id)}">
              <strong>${c.esc(p.question)}</strong>
              <ul class="poll-results">${p.options.map((o) => { const n = p.counts[o.id] || 0, pct = p.total ? Math.round((n / p.total) * 100) : 0;
                return `<li><span>${c.esc(o.label)}</span><span class="bar"><i style="width:${pct}%"></i></span><span class="need-count">${n} · ${pct}%</span></li>`; }).join("")}</ul>
              <div class="meta card-meta">${c.esc(c.tp("poll.votes", p.total))} · ${c.esc(pollClosed(p) ? c.t("poll.closed") : p.published ? c.t("ag.published") : c.t("ag.hidden"))}</div>
              <div class="admin-actions">
                ${pollClosed(p) ? "" : `<button class="btn btn-sm" data-close>${c.esc(c.t("apoll.close"))}</button>`}
                <button class="btn btn-sm" data-pub>${c.esc(c.t(p.published ? "ag.hide" : "ag.show"))}</button>
                <button class="btn btn-sm btn-danger" data-del>${c.esc(c.t("adm.del"))}</button>
              </div>
            </div>`).join("") : `<p class="card-meta">${c.esc(c.t("poll.none"))}</p>`}
        </div>
      </div>`;
    const form = c.$("#pollForm");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const options = form.options.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8)
        .map((l) => { const [fr, en] = l.split("|").map((x) => (x || "").trim()); return { label: fr, label_en: en || "" }; });
      if (form.question.value.trim().length < 3 || options.length < 2) { c.toast(c.t("apoll.invalid")); return; }
      try {
        await Store.savePoll({ question: form.question.value, question_en: form.question_en.value, options, endsAt: form.end.value ? new Date(form.end.value).toISOString() : null });
        c.toast(c.t("ainf.published")); renderAdminPolls(c, tabs);
      } catch (err) { c.toast(c.errMsg(err)); }
    };
    root.onclick = async (e) => {
      const row = e.target.closest(".poll-admin");
      if (!row) return;
      const p = list.find((x) => x.id === row.dataset.id);
      try {
        if (e.target.closest("[data-close]")) await Store.savePoll({ ...p, endsAt: new Date().toISOString() });
        else if (e.target.closest("[data-pub]")) await Store.savePoll({ ...p, published: !p.published });
        else if (e.target.closest("[data-del]")) { if (!confirm(c.t("apoll.delConfirm"))) return; await Store.deletePoll(p.id); }
        else return;
        renderAdminPolls(c, tabs);
      } catch (err) { c.toast(c.errMsg(err)); }
    };
  }

  /* ================= 7. TABLEAU DE BORD ================= */
  const toB64Url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  /** Paire de clés VAPID (P-256) générée dans le navigateur : la clé privée ne quitte pas l'écran de l'organisateur. */
  async function generateVapid() {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = await crypto.subtle.exportKey("raw", kp.publicKey);
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    return { publicKey: toB64Url(pub), privateKey: jwk.d };
  }

  async function renderDashboard(c, tabs) {
    const root = c.$("#adminRoot");
    root.innerHTML = `${tabs}<p class="card-meta">…</p>`;
    const [events, stats, props, pot, inv, polls, photos, reports, ads, pushKey, subs] = await Promise.all([
      safe(Store.listEvents(), []), safe(Store.stats(), {}), safe(Store.listProposals(), []), safe(Store.getPot(), { entries: [], settings: {} }),
      safe(Store.getInventory(), { groups: [], items: [] }), safe(Store.adminListPolls(), []), safe(Store.adminListPhotos(), []),
      safe(Store.adminListReports(), []), safe(Store.listClassifieds(), []), safe(Store.getPushKey(), ""), safe(Store.pushCount(), 0)
    ]);
    const now = new Date();
    const endOf = (e) => (e.end ? new Date(e.end) : new Date(new Date(e.start).getTime() + 3 * 3600e3));
    const upcoming = events.filter((e) => endOf(e) >= now).sort((a, b) => new Date(a.start) - new Date(b.start));
    const replies = Object.values(stats).reduce((n, s) => n + (s.replies || 0), 0);
    const money = (cents) => new Intl.NumberFormat(c.locale(), { style: "currency", currency: "EUR" }).format((cents || 0) / 100);
    const inn = pot.entries.filter((e) => e.kind === "in").reduce((n, e) => n + e.cents, 0);
    const out = pot.entries.filter((e) => e.kind === "out").reduce((n, e) => n + e.cents, 0);
    const month = now.toISOString().slice(0, 7);
    const outMonth = pot.entries.filter((e) => e.kind === "out" && (e.date || "").startsWith(month)).reduce((n, e) => n + e.cents, 0);
    const noTicket = pot.entries.filter((e) => e.kind === "out" && !e.receiptUrl).length;
    const todo = [
      ["📸", c.t("dash.todoPhotos"), photos.filter((p) => p.status === "pending").length, "#/admin/photos"],
      ["🛠️", c.t("dash.todoReports"), reports.filter((r) => r.status === "new").length, "#/admin/reports"],
      ["💡", c.t("dash.todoIdeas"), props.filter((p) => p.status === "new").length, "#/admin/proposals"],
      ["🧾", c.t("dash.todoTickets"), noTicket, "#/admin/pot"]
    ];
    // participation : derniers et prochains événements (une seule série → une seule couleur, valeurs écrites)
    const recent = events.slice().sort((a, b) => new Date(b.start) - new Date(a.start)).slice(0, 8).reverse();
    const maxHead = Math.max(1, ...recent.map((e) => Math.max((stats[e.id] || {}).headcount || 0, e.capacity || 0)));
    const topIdeas = props.filter((p) => p.status !== "rejected").map((p) => ({ ...p, score: (p.likes || 0) - (p.dislikes || 0) }))
      .sort((a, b) => b.score - a.score).slice(0, 5);
    const outItems = inv.items.filter((i) => i.qty === 0);
    const openPolls = polls.filter((p) => !pollClosed(p) && p.published);

    root.innerHTML = `${tabs}
      <div class="kpi-row">
        <div class="kpi"><span class="kpi-v">${upcoming.length}</span><span class="kpi-l">${c.esc(c.t("dash.kUpcoming"))}</span></div>
        <div class="kpi"><span class="kpi-v">${replies}</span><span class="kpi-l">${c.esc(c.t("dash.kReplies"))}</span></div>
        <div class="kpi"><span class="kpi-v">${c.esc(money(inn - out))}</span><span class="kpi-l">${c.esc(c.t("pot.balance"))}</span></div>
        <div class="kpi"><span class="kpi-v">${subs}</span><span class="kpi-l">${c.esc(c.t("dash.kSubs"))}</span></div>
      </div>
      <div class="dash-grid">
        <section class="panel">
          <h2>✅ ${c.esc(c.t("dash.todo"))}</h2>
          <ul class="todo-list">${todo.map(([em, label, n, href]) => `<li><a href="${href}" class="${n ? "has-todo" : ""}"><span>${em} ${c.esc(label)}</span><strong>${n}</strong></a></li>`).join("")}</ul>
          <p class="card-meta">${c.esc(c.t("dash.adsActive", { n: ads.length }))} · <a href="#/admin/ads">${c.esc(c.t("adm.view"))}</a></p>
        </section>

        <section class="panel">
          <h2>📅 ${c.esc(c.t("dash.next"))}</h2>
          ${upcoming.length ? `<ul class="dash-events">${upcoming.slice(0, 4).map((e) => {
            const s = stats[e.id] || { headcount: 0, brought: {} };
            const need = (e.items || []).reduce((n, it) => n + it.needed, 0);
            const got = (e.items || []).reduce((n, it) => n + Math.min(it.needed, s.brought[it.id] || 0), 0);
            return `<li><a href="#/admin/responses/${encodeURIComponent(e.id)}"><strong>${c.esc(e.emoji || "")} ${c.esc(c.loc(e, "title"))}</strong></a>
              <span class="card-meta">${c.esc(fmtDay(c, e.start))} · ${c.esc(c.tp("participants", s.headcount))}${e.capacity ? ` / ${e.capacity}` : ""}${need ? ` · ${c.esc(c.t("dash.covered", { n: Math.round((got / need) * 100) }))}` : ""}</span></li>`;
          }).join("")}</ul>` : `<p class="card-meta">${c.esc(c.t("events.noneUpcoming"))}</p>`}
        </section>

        <section class="panel dash-wide">
          <h2>📊 ${c.esc(c.t("dash.participation"))}</h2>
          ${recent.length ? `<div class="hbar-chart" role="img" aria-label="${c.esc(c.t("dash.participation"))}">${recent.map((e) => {
            const h = (stats[e.id] || {}).headcount || 0;
            return `<div class="hbar-row" tabindex="0" title="${c.esc(`${c.loc(e, "title")} — ${c.tp("participants", h)}${e.capacity ? ` / ${e.capacity}` : ""}`)}">
                <span class="hbar-label">${c.esc(e.emoji || "")} ${c.esc(c.loc(e, "title"))}</span>
                <span class="hbar-track">${e.capacity ? `<i class="hbar-cap" style="left:${(e.capacity / maxHead) * 100}%"></i>` : ""}<i class="hbar-fill" style="width:${(h / maxHead) * 100}%"></i></span>
                <span class="hbar-value">${h}${e.capacity ? `<small>/${e.capacity}</small>` : ""}</span>
              </div>`;
          }).join("")}</div>
          <details class="dash-table"><summary>${c.esc(c.t("dash.tableView"))}</summary>
            <table><thead><tr><th>${c.esc(c.t("card.event"))}</th><th>${c.esc(c.t("col.date"))}</th><th>${c.esc(c.t("rs.expected"))}</th><th>${c.esc(c.t("ed.cap"))}</th></tr></thead>
            <tbody>${recent.map((e) => `<tr><td>${c.esc(c.loc(e, "title"))}</td><td>${c.esc(fmtDay(c, e.start))}</td><td>${(stats[e.id] || {}).headcount || 0}</td><td>${e.capacity || "—"}</td></tr>`).join("")}</tbody></table>
          </details>` : `<p class="card-meta">${c.esc(c.t("events.noneUpcoming"))}</p>`}
        </section>

        <section class="panel">
          <h2>💡 ${c.esc(c.t("dash.topIdeas"))}</h2>
          ${topIdeas.length ? `<ol class="dash-ideas">${topIdeas.map((p) => `<li><span>${c.esc(p.title)}</span><span class="card-meta">👍 ${p.likes || 0} · 👎 ${p.dislikes || 0}</span></li>`).join("")}</ol>` : `<p class="card-meta">${c.esc(c.t("ap.none"))}</p>`}
        </section>

        <section class="panel">
          <h2>🪙 ${c.esc(c.t("pot.title"))}</h2>
          <ul class="dash-kv">
            <li><span>${c.esc(c.t("pot.balance"))}</span><strong>${c.esc(money(inn - out))}</strong></li>
            <li><span>${c.esc(c.t("pot.in"))}</span><strong>${c.esc(money(inn))}</strong></li>
            <li><span>${c.esc(c.t("pot.out"))}</span><strong>${c.esc(money(out))}</strong></li>
            <li><span>${c.esc(c.t("dash.outMonth"))}</span><strong>${c.esc(money(outMonth))}</strong></li>
            <li><span>${c.esc(c.t("dash.noTicket"))}</span><strong class="${noTicket ? "warn-text" : ""}">${noTicket}</strong></li>
          </ul>
        </section>

        <section class="panel">
          <h2>📦 ${c.esc(c.t("dash.outItems"))}</h2>
          ${outItems.length ? `<ul class="dash-tags">${outItems.map((i) => { const g = inv.groups.find((x) => x.id === i.groupId); return `<li class="tag">${c.esc(g ? g.emoji : "📦")} ${c.esc(c.loc(i, "name"))}</li>`; }).join("")}</ul>` : `<p class="card-meta">${c.esc(c.t("dash.allStocked"))}</p>`}
          <a class="link" href="#/inventory">${c.esc(c.t("nav.inventory"))} →</a>
        </section>

        <section class="panel">
          <h2>🗳️ ${c.esc(c.t("poll.title"))}</h2>
          ${openPolls.length ? openPolls.slice(0, 3).map((p) => {
            const best = p.options.map((o) => ({ o, n: p.counts[o.id] || 0 })).sort((a, b) => b.n - a.n)[0];
            return `<p><strong>${c.esc(p.question)}</strong><br><span class="card-meta">${c.esc(c.tp("poll.votes", p.total))}${p.total ? ` · ${c.esc(c.t("dash.leading", { x: best.o.label, n: Math.round((best.n / p.total) * 100) }))}` : ""}</span></p>`;
          }).join("") : `<p class="card-meta">${c.esc(c.t("poll.none"))}</p>`}
          <a class="link" href="#/admin/polls">${c.esc(c.t("apoll.new"))} →</a>
        </section>

        <section class="panel dash-wide" id="pushPanel">
          <h2>🔔 ${c.esc(c.t("apush.title"))}</h2>
          ${pushKey ? `
            <p class="card-meta">${c.esc(c.tp("apush.subs", subs))}</p>
            <form class="form" id="pushForm" novalidate>
              <div class="row">
                <div class="field"><label for="pu_t">${c.esc(c.t("ainf.title"))}</label><input type="text" id="pu_t" name="title" maxlength="80" required></div>
                <div class="field"><label for="pu_t_en">${c.esc(c.t("ainf.titleEn"))}</label><input type="text" id="pu_t_en" name="title_en" maxlength="80"></div>
              </div>
              <div class="row">
                <div class="field"><label for="pu_b">${c.esc(c.t("ainf.body"))}</label><input type="text" id="pu_b" name="body" maxlength="240"></div>
                <div class="field"><label for="pu_b_en">${c.esc(c.t("ainf.bodyEn"))}</label><input type="text" id="pu_b_en" name="body_en" maxlength="240"></div>
              </div>
              <div class="field"><label for="pu_url">${c.esc(c.t("apush.link"))}</label>
                <select id="pu_url" name="url"><option value="#/">${c.esc(c.t("home.title"))}</option><option value="#/infos">${c.esc(c.t("nav.infos"))}</option><option value="#/polls">${c.esc(c.t("nav.polls"))}</option><option value="#/ads">${c.esc(c.t("nav.ads"))}</option>
                  ${upcoming.map((e) => `<option value="#/event/${c.esc(e.id)}">${c.esc(e.emoji || "")} ${c.esc(c.loc(e, "title"))}</option>`).join("")}</select></div>
              <div class="btn-row"><button class="btn btn-primary" type="submit">📣 ${c.esc(c.t("apush.send"))}</button></div>
            </form>
            <details class="fieldset"><summary>${c.esc(c.t("apush.keysT"))}</summary><p class="card-meta">${c.esc(c.t("apush.keysAgain"))}</p><button class="btn btn-sm" id="vapidGen">${c.esc(c.t("apush.gen"))}</button><div id="vapidOut"></div></details>`
          : `
            <p>${c.esc(c.t("apush.setup"))}</p>
            <ol class="setup-steps"><li>${c.esc(c.t("apush.s1"))}</li><li>${c.esc(c.t("apush.s2"))}</li><li>${c.esc(c.t("apush.s3"))}</li><li>${c.esc(c.t("apush.s4"))}</li></ol>
            <button class="btn btn-primary" id="vapidGen">🔑 ${c.esc(c.t("apush.gen"))}</button>
            <div id="vapidOut"></div>`}
        </section>
      </div>`;

    const gen = c.$("#vapidGen");
    if (gen) gen.onclick = async () => {
      if (pushKey && !confirm(c.t("apush.regenConfirm"))) return;
      try {
        const k = await generateVapid();
        await Store.savePushKey(k.publicKey);
        c.$("#vapidOut").innerHTML = `
          <div class="vapid-box">
            <p><strong>${c.esc(c.t("apush.copyT"))}</strong></p>
            <label>VAPID_PUBLIC_KEY<input type="text" readonly value="${c.esc(k.publicKey)}"></label>
            <label>VAPID_PRIVATE_KEY<input type="text" readonly value="${c.esc(k.privateKey)}"></label>
            <label>VAPID_SUBJECT<input type="text" readonly value="mailto:…"></label>
            <p class="card-meta">⚠️ ${c.esc(c.t("apush.privateWarn"))}</p>
          </div>`;
        c.$$("#vapidOut input").forEach((i) => i.addEventListener("focus", () => i.select()));
        c.toast(c.t("apush.keySaved"));
      } catch (err) { console.error(err); c.toast(c.errMsg(err)); }
    };
    const pf = c.$("#pushForm");
    if (pf) pf.onsubmit = async (e) => {
      e.preventDefault();
      if (!pf.title.value.trim()) { c.toast(c.t("ainf.needTitle")); return; }
      if (!confirm(c.t("apush.confirm", { n: subs }))) return;
      try {
        const r = await Store.sendPush({ title: pf.title.value, title_en: pf.title_en.value, body: pf.body.value, body_en: pf.body_en.value, url: pf.url.value });
        c.toast(c.t("apush.sent", { n: r.sent, total: r.total }));
        pf.reset();
      } catch (err) { c.toast(c.errMsg(err)); }
    };
  }

  return {
    calendarHTML, bindCalendar, renderGallery, renderGalleryPage, renderAds, renderReports, renderPolls, initPwa, renderApp,
    renderAdminPhotos, renderAdminAds, renderAdminReports, renderAdminPolls, renderDashboard
  };
})();
