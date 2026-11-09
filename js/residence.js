/* =============================================================
   LEONE — vie de la résidence : inventaire, informations, mode d'emploi
   Chaque fonction reçoit "c" : les outils partagés fournis par app.js
   (t, tp, esc, loc, toast, locale, $, $$, errMsg, adminTabs…).
   ============================================================= */
window.LEONE_EXT = (function () {
  const DISMISSED_KEY = "leone.dismissedPopups";
  const dismissed = {
    get() { try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch (e) { return []; } },
    add(id) { try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...this.get().filter((x) => x !== id), id].slice(-200))); } catch (e) { /* ignore */ } }
  };
  const fmtDateTime = (c, iso) => (iso ? new Date(iso).toLocaleString(c.locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  const fmtDay = (c, iso) => (iso ? new Date(iso).toLocaleDateString(c.locale(), { day: "numeric", month: "long", year: "numeric" }) : "");
  /** "2026-11-09T18:30" (heure locale) <-> ISO */
  const toLocalInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

  /* =================== INVENTAIRE =================== */
  let invQuery = "";
  async function renderInventory(c) {
    const root = c.$("#inventoryRoot");
    const [{ groups, items }, admin] = await Promise.all([Store.getInventory(), Store.isAdmin()]);
    const byName = (a, b) => c.loc(a, "name").localeCompare(c.loc(b, "name"), c.locale());

    const groupHTML = (g) => {
      const list = items.filter((i) => i.groupId === g.id).sort(byName);
      return `
        <section class="inv-group reveal" aria-labelledby="inv-${c.esc(g.id)}">
          <header class="inv-head">
            <span class="inv-emoji" aria-hidden="true">${c.esc(g.emoji || "📦")}</span>
            <h2 id="inv-${c.esc(g.id)}">${c.esc(c.loc(g, "name"))}</h2>
            <span class="inv-count">${c.esc(c.tp("inv.items", list.length))}</span>
            ${admin ? `<button class="icon-btn" data-delgroup="${c.esc(g.id)}" data-name="${c.esc(c.loc(g, "name"))}" aria-label="${c.esc(c.t("inv.delGroup"))}">✕</button>` : ""}
          </header>
          ${list.length ? `<ul class="inv-list">${list.map((it) => `
            <li class="inv-item ${it.qty === 0 ? "is-out" : ""}" data-search="${c.esc(`${it.name} ${it.name_en}`.toLowerCase())}">
              <span class="inv-name">${c.esc(c.loc(it, "name"))}</span>
              ${admin ? `
                <span class="stepper">
                  <button type="button" data-qty="-1" data-id="${c.esc(it.id)}" aria-label="${c.esc(c.t("form.less", { x: c.loc(it, "name") }))}">−</button>
                  <output>${it.qty}</output>
                  <button type="button" data-qty="1" data-id="${c.esc(it.id)}" aria-label="${c.esc(c.t("form.more", { x: c.loc(it, "name") }))}">+</button>
                </span>
                <button class="icon-btn" data-delitem="${c.esc(it.id)}" data-name="${c.esc(c.loc(it, "name"))}" aria-label="${c.esc(c.t("inv.remove"))}">✕</button>`
              : `<span class="inv-qty">${it.qty === 0 ? c.esc(c.t("inv.out")) : `×${it.qty}`}</span>`}
            </li>`).join("")}</ul>`
          : `<p class="card-meta inv-empty">${c.esc(c.t("inv.empty"))}</p>`}
          ${admin ? `
            <form class="inv-add" data-group="${c.esc(g.id)}" autocomplete="off">
              <input type="text" name="name" maxlength="60" placeholder="${c.esc(c.t("inv.itemPh"))}" aria-label="${c.esc(c.t("inv.itemPh"))}" required>
              <input type="text" name="name_en" maxlength="60" placeholder="EN" aria-label="${c.esc(c.t("inv.itemEn"))}">
              <input type="number" name="qty" min="0" max="999" value="1" aria-label="${c.esc(c.t("inv.qty"))}">
              <button class="btn btn-sm btn-primary" type="submit">${c.esc(c.t("inv.add"))}</button>
            </form>` : ""}
        </section>`;
    };

    root.innerHTML = `
      <div class="inv-toolbar">
        <input type="search" id="invSearch" value="${c.esc(invQuery)}" placeholder="${c.esc(c.t("inv.search"))}" aria-label="${c.esc(c.t("inv.search"))}">
        ${admin ? `<p class="card-meta">✏️ ${c.esc(c.t("inv.adminHint"))}</p>` : `<p class="card-meta">${c.esc(c.t("inv.hint"))}</p>`}
      </div>
      <div class="inv-grid">${groups.map(groupHTML).join("") || `<div class="empty">${c.esc(c.t("inv.noGroups"))}</div>`}</div>
      ${admin ? `
        <form class="panel inv-newgroup" id="invNewGroup" autocomplete="off">
          <h2>${c.esc(c.t("inv.newGroup"))}</h2>
          <div class="inv-add">
            <input type="text" name="emoji" maxlength="4" value="📦" aria-label="Emoji" class="inv-emoji-input">
            <input type="text" name="name" maxlength="40" placeholder="${c.esc(c.t("inv.groupPh"))}" aria-label="${c.esc(c.t("inv.groupPh"))}" required>
            <input type="text" name="name_en" maxlength="40" placeholder="EN" aria-label="${c.esc(c.t("inv.groupEn"))}">
            <button class="btn btn-sm btn-primary" type="submit">${c.esc(c.t("inv.add"))}</button>
          </div>
        </form>` : ""}`;

    // recherche : filtre à l'écran, sans recharger
    const search = c.$("#invSearch");
    const applyFilter = () => {
      const q = invQuery.trim().toLowerCase();
      c.$$(".inv-group", root).forEach((g) => {
        let n = 0;
        c.$$(".inv-item", g).forEach((li) => { const ok = !q || li.dataset.search.includes(q); li.hidden = !ok; if (ok) n++; });
        g.hidden = Boolean(q) && n === 0 && !admin;
      });
    };
    search.oninput = () => { invQuery = search.value; applyFilter(); };
    applyFilter();
    if (!admin) return;

    const save = async (fn, okMsg) => {
      try { await fn(); if (okMsg) c.toast(okMsg); } catch (err) { if (!err.code) console.error(err); c.toast(c.errMsg(err)); }
      await renderInventory(c); c.observeReveals(root);
    };
    root.onclick = (e) => {
      const q1 = e.target.closest("[data-qty]");
      if (q1) {
        const it = items.find((i) => i.id === q1.dataset.id);
        const out = q1.parentElement.querySelector("output");
        const next = Math.max(0, Math.min(999, it.qty + Number(q1.dataset.qty)));
        if (next === it.qty) return;
        it.qty = next; out.textContent = next; // affichage immédiat
        q1.closest(".inv-item").classList.toggle("is-out", next === 0);
        Store.setInventoryQty(it.id, next).catch((err) => { c.toast(c.errMsg(err)); renderInventory(c); });
        return;
      }
      const di = e.target.closest("[data-delitem]");
      if (di && confirm(c.t("inv.removeConfirm", { x: di.dataset.name }))) return save(() => Store.deleteInventoryItem(di.dataset.delitem), c.t("inv.removed"));
      const dg = e.target.closest("[data-delgroup]");
      if (dg && confirm(c.t("inv.delGroupConfirm", { x: dg.dataset.name }))) return save(() => Store.deleteInventoryGroup(dg.dataset.delgroup), c.t("inv.groupDeleted"));
    };
    root.onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.id === "invNewGroup") return save(() => Store.addInventoryGroup({ emoji: f.emoji.value, name: f.name.value, name_en: f.name_en.value }), c.t("inv.groupAdded"));
      if (f.dataset.group) return save(() => Store.addInventoryItem({ groupId: f.dataset.group, name: f.name.value, name_en: f.name_en.value, qty: f.qty.value }), c.t("inv.added"));
    };
  }

  /* =================== INFORMATIONS =================== */
  const noticeHTML = (c, a, compact) => `
    <article class="notice-card ${a.important ? "is-important" : ""} ${compact ? "is-compact" : ""}">
      <div class="notice-top">
        ${a.important ? `<span class="tag tag-important">${c.esc(c.t("infos.important"))}</span>` : ""}
        <span class="notice-date">${c.esc(fmtDay(c, a.startsAt))}</span>
      </div>
      <h3>${c.esc(c.loc(a, "title"))}</h3>
      ${c.loc(a, "body") ? `<p class="notice-body">${c.esc(c.loc(a, "body"))}</p>` : ""}
    </article>`;

  async function renderInfos(c) {
    const root = c.$("#infosRoot");
    const list = await Store.listAnnouncements();
    root.innerHTML = list.length
      ? `<div class="notice-list">${list.map((a) => noticeHTML(c, a, false)).join("")}</div>`
      : `<div class="empty">${c.esc(c.t("infos.none"))}</div>`;
  }

  /** Bandeau des messages permanents sur l'accueil. */
  async function renderHomeNotices(c) {
    const box = c.$("#homeNotices");
    if (!box) return;
    let list = [];
    try { list = (await Store.listAnnouncements()).filter((a) => a.kind === "permanent"); } catch (e) { /* ignore */ }
    box.innerHTML = list.length ? `
      <div class="home-notices">
        ${list.slice(0, 3).map((a) => `
          <a class="home-notice ${a.important ? "is-important" : ""}" href="#/infos">
            <span aria-hidden="true">${a.important ? "⚠️" : "📢"}</span>
            <span><strong>${c.esc(c.loc(a, "title"))}</strong>${c.loc(a, "body") ? ` — ${c.esc(c.loc(a, "body").slice(0, 120))}${c.loc(a, "body").length > 120 ? "…" : ""}` : ""}</span>
          </a>`).join("")}
        ${list.length > 3 ? `<a class="link" href="#/infos">${c.esc(c.t("infos.seeAll"))}</a>` : ""}
      </div>` : "";
  }

  /** Affiche, une seule fois par appareil, les messages pop-up en cours. */
  let popupBusy = false;
  async function showPopups(c) {
    if (popupBusy || location.hash.startsWith("#/admin")) return;
    let queue = [];
    try { queue = (await Store.listAnnouncements()).filter((a) => a.kind === "popup" && !dismissed.get().includes(a.id)); } catch (e) { return; }
    if (!queue.length) return;
    popupBusy = true;
    let dlg = c.$("#noticeDialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "noticeDialog";
      dlg.className = "notice-dialog";
      document.body.appendChild(dlg);
    }
    const next = () => {
      const a = queue.shift();
      if (!a) { popupBusy = false; if (dlg.open) dlg.close(); return; }
      dlg.innerHTML = `
        <div class="notice-dialog-box ${a.important ? "is-important" : ""}" role="document">
          <span class="notice-dialog-ico" aria-hidden="true">${a.important ? "⚠️" : "📢"}</span>
          <h2>${c.esc(c.loc(a, "title"))}</h2>
          ${c.loc(a, "body") ? `<p class="notice-body">${c.esc(c.loc(a, "body"))}</p>` : ""}
          <button class="btn btn-primary" data-ok>${c.esc(c.t("infos.ok"))}</button>
        </div>`;
      dlg.querySelector("[data-ok]").onclick = () => { dismissed.add(a.id); next(); };
      dlg.oncancel = (e) => { e.preventDefault(); dismissed.add(a.id); next(); };
      if (!dlg.open) dlg.showModal();
      dlg.querySelector("[data-ok]").focus();
    };
    next();
  }

  /* Organiser → Infos */
  async function renderAdminInfos(c, tabsHTML, editId) {
    const root = c.$("#adminRoot");
    const all = await Store.listAnnouncements(true);
    const edit = editId ? all.find((a) => a.id === editId) : null;
    const now = Date.now();
    const state = (a) => new Date(a.startsAt).getTime() > now ? "scheduled" : a.endsAt && new Date(a.endsAt).getTime() <= now ? "ended" : "live";
    root.innerHTML = `
      ${tabsHTML}
      <div class="event-layout">
        <form class="form panel" id="annForm" novalidate>
          <h2>${c.esc(c.t(edit ? "ainf.editT" : "ainf.newT"))}</h2>
          <div class="field"><span class="label">${c.esc(c.t("ainf.kind"))}</span>
            <div class="seg seg-2">
              <input type="radio" name="kind" id="an_perm" value="permanent" ${!edit || edit.kind === "permanent" ? "checked" : ""}><label for="an_perm">📌 ${c.esc(c.t("ainf.permanent"))}</label>
              <input type="radio" name="kind" id="an_pop" value="popup" ${edit && edit.kind === "popup" ? "checked" : ""}><label for="an_pop">💬 ${c.esc(c.t("ainf.popup"))}</label>
            </div>
            <small>${c.esc(c.t("ainf.kindHint"))}</small>
          </div>
          <label class="check"><input type="checkbox" name="important" ${edit && edit.important ? "checked" : ""}><span>${c.esc(c.t("ainf.important"))}</span></label>
          <div class="field"><label for="an_title">${c.esc(c.t("ainf.title"))}</label><input type="text" id="an_title" name="title" maxlength="100" required value="${c.esc(edit ? edit.title : "")}"></div>
          <div class="field"><label for="an_body">${c.esc(c.t("ainf.body"))}</label><textarea id="an_body" name="body" maxlength="2000">${c.esc(edit ? edit.body : "")}</textarea></div>
          <details class="fieldset" ${edit && (edit.title_en || edit.body_en) ? "open" : ""}>
            <summary>🇬🇧 ${c.esc(c.t("ainf.english"))}</summary>
            <div class="form">
              <div class="field"><label for="an_title_en">${c.esc(c.t("ainf.titleEn"))}</label><input type="text" id="an_title_en" name="title_en" maxlength="100" value="${c.esc(edit ? edit.title_en : "")}"></div>
              <div class="field"><label for="an_body_en">${c.esc(c.t("ainf.bodyEn"))}</label><textarea id="an_body_en" name="body_en" maxlength="2000">${c.esc(edit ? edit.body_en : "")}</textarea></div>
            </div>
          </details>
          <div class="row">
            <div class="field"><label for="an_start">${c.esc(c.t("ainf.start"))}</label><input type="datetime-local" id="an_start" name="start" value="${c.esc(toLocalInput(edit ? edit.startsAt : new Date().toISOString()))}"></div>
            <div class="field"><label for="an_end">${c.esc(c.t("ainf.end"))}</label><input type="datetime-local" id="an_end" name="end" value="${c.esc(toLocalInput(edit ? edit.endsAt : null))}"><small>${c.esc(c.t("ainf.endHint"))}</small></div>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" type="submit">${c.esc(c.t(edit ? "ed.save" : "ainf.publish"))}</button>
            ${edit ? `<button class="btn" type="button" id="annCancel">${c.esc(c.t("ed.cancel"))}</button>` : ""}
          </div>
        </form>
        <div class="panel">
          <h2>${c.esc(c.t("ainf.list"))}</h2>
          ${all.length ? `<ul class="ann-list">${all.map((a) => `
            <li class="ann-row ${a.important ? "is-important" : ""}">
              <div>
                <div class="ann-title">${a.kind === "popup" ? "💬" : "📌"} ${c.esc(a.title)}</div>
                <div class="ann-sub">
                  <span class="tag tag-${state(a)}">${c.esc(c.t(`ainf.${state(a)}`))}</span>
                  ${c.esc(fmtDateTime(c, a.startsAt))}${a.endsAt ? ` → ${c.esc(fmtDateTime(c, a.endsAt))}` : ""}${a.title_en ? " · EN ✓" : ""}
                </div>
              </div>
              <div class="admin-actions">
                <button class="btn btn-sm" data-annedit="${c.esc(a.id)}">${c.esc(c.t("adm.edit"))}</button>
                <button class="btn btn-sm btn-danger" data-anndel="${c.esc(a.id)}">${c.esc(c.t("adm.del"))}</button>
              </div>
            </li>`).join("")}</ul>` : `<p class="card-meta">${c.esc(c.t("infos.none"))}</p>`}
        </div>
      </div>`;

    const form = c.$("#annForm");
    if (edit) c.$("#annCancel").onclick = () => renderAdminInfos(c, tabsHTML);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!form.title.value.trim()) { c.toast(c.t("ainf.needTitle")); form.title.focus(); return; }
      const startsAt = fromLocalInput(form.start.value) || new Date().toISOString();
      const endsAt = fromLocalInput(form.end.value);
      if (endsAt && new Date(endsAt) <= new Date(startsAt)) { c.toast(c.t("ainf.badDates")); return; }
      try {
        await Store.saveAnnouncement({
          id: edit && edit.id, kind: form.kind.value, important: form.important.checked,
          title: form.title.value, title_en: form.title_en.value, body: form.body.value, body_en: form.body_en.value, startsAt, endsAt
        });
        c.toast(c.t(edit ? "ed.savedMsg" : "ainf.published"));
        renderAdminInfos(c, tabsHTML);
      } catch (err) { if (!err.code) console.error(err); c.toast(c.errMsg(err)); }
    };
    root.onclick = async (e) => {
      const ed = e.target.closest("[data-annedit]"), del = e.target.closest("[data-anndel]");
      if (ed) { await renderAdminInfos(c, tabsHTML, ed.dataset.annedit); window.scrollTo(0, 0); }
      if (del && confirm(c.t("ainf.delConfirm"))) {
        try { await Store.deleteAnnouncement(del.dataset.anndel); renderAdminInfos(c, tabsHTML); } catch (err) { c.toast(c.errMsg(err)); }
      }
    };
  }

  /* =================== MODE D'EMPLOI =================== */
  function renderGuide(c) {
    c.$("#guideRoot").innerHTML = `
      <div class="panel guide-soon">
        <span class="big" aria-hidden="true">📖</span>
        <h2>${c.esc(c.t("guide.soonT"))}</h2>
        <p>${c.esc(c.t("guide.soonP"))}</p>
        <p class="guide-langs" aria-label="${c.esc(c.t("guide.langs"))}">🇫🇷 🇬🇧 🇪🇸 🇮🇹 🇩🇪 🇵🇹 🇸🇦 🇨🇳</p>
      </div>`;
  }

  return { renderInventory, renderInfos, renderHomeNotices, showPopups, renderAdminInfos, renderGuide };
})();
