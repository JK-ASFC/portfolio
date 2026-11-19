/* =============================================================
   LEONE — mode TV : carrousel d'infos pour l'écran de la salle commune
   Page tv.html (aussi accessible par #/tv). Affiche en boucle, sans clic :
   infos, prochains événements, sondages, idées, petites annonces,
   puis une page « Bienvenue » animée de 20 secondes (QR WhatsApp + Instagram).
   Uniquement des données déjà publiques sur le site, jamais de prénoms.
   Télécommande / clavier : ◀ ▶ diapo précédente / suivante, OK ou Espace = pause.
   ============================================================= */
(function () {
  "use strict";
  const W = 1920, H = 1080;
  const WELCOME_MS = 20e3;       // durée de la page « Bienvenue »
  const GREET_MS = 2500;         // un « bienvenue » dans une nouvelle langue toutes les 2,5 s
  const REFRESH_MS = 5 * 60e3;   // données rechargées toutes les 5 min
  const RETRY_MS = 60e3;         // nouvel essai après une coupure réseau
  const RELOAD_MS = 6 * 3600e3;  // page rechargée toutes les 6 h (mises à jour du site)
  // luminosité réduite si personne ne touche la télécommande pendant ce délai (minutes) ;
  // réglable dans l'adresse : tv.html?veille=5 (de 0.1 à 240 min) ;
  // tv.html?veille=0 : désactivée ici (l'écran d'accueil LEONE de la TV s'en charge)
  const DIM_AFTER_MS = (() => {
    const p = new URLSearchParams(location.search).get("veille");
    if (p === "0") return Infinity;
    const v = parseFloat(p);
    return (v >= 0.1 && v <= 240 ? v : 10) * 60e3;
  })();
  const WAKE_GAP_MS = 20e3;      // horloge figée plus de 20 s = la TV était éteinte / en veille
  const THEMES = ["sunset", "tricolore", "ocean", "neon", "forest"];
  const AD_KINDS = {
    lend: ["🔁", "Je prête", "Lending"], give: ["🎁", "Je donne", "Giving away"],
    seek: ["🔍", "Je cherche", "Looking for"], help: ["🤝", "Coup de main", "Helping hand"]
  };
  // les 20 langues du site
  const GREETINGS = [
    ["Bienvenue", "Français"], ["Welcome", "English"], ["Bienvenidos", "Español"], ["Bem-vindos", "Português"],
    ["Benvenuti", "Italiano"], ["Willkommen", "Deutsch"], ["Witamy", "Polski"], ["Добро пожаловать", "Русский"],
    ["Ласкаво просимо", "Українська"], ["Hoş geldiniz", "Türkçe"], ["أهلاً وسهلاً", "العربية", "rtl"], ["स्वागत है", "हिन्दी"],
    ["Chào mừng", "Tiếng Việt"], ["Selamat datang", "Bahasa Melayu"], ["欢迎", "中文"], ["ようこそ", "日本語"],
    ["환영합니다", "한국어"], ["Boyei malamu", "Lingála"], ["Byenvini", "Kréyòl Gwadloup · Matinik"]
  ];
  let greetIdx = 0; // langue affichée par la page « Bienvenue »
  const FLOATERS = ["🎉", "🍕", "🎶", "⚽", "🥳", "☀️", "💬", "🎲", "🍰", "🌴", "🎈", "✨", "🍹", "📣"];
  const ICON_WA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"/></svg>';
  const ICON_IG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM16.5 2h-9A5.5 5.5 0 0 0 2 7.5v9A5.5 5.5 0 0 0 7.5 22h9a5.5 5.5 0 0 0 5.5-5.5v-9A5.5 5.5 0 0 0 16.5 2Zm3.7 14.5a3.7 3.7 0 0 1-3.7 3.7h-9a3.7 3.7 0 0 1-3.7-3.7v-9a3.7 3.7 0 0 1 3.7-3.7h9a3.7 3.7 0 0 1 3.7 3.7Z"/></svg>';

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cfg = window.LEONE_CONFIG || {};
  const SITE = new URL("./", location.href).href; // https://…/portfolio/
  const SITE_LABEL = SITE.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // mêmes règles que le site : seuls les liens d'invitation officiels sont acceptés
  const WA_URL = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(String(cfg.whatsappUrl || "")) ? cfg.whatsappUrl : "";
  const IG_URL = /^https:\/\/(ig\.me|(www\.)?instagram\.com)\/[A-Za-z0-9_./?=-]+$/.test(String(cfg.instagramGroupUrl || "")) ? cfg.instagramGroupUrl : "";

  /* ---------------- Outils ---------------- */
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const clip = (s, n) => {
    s = String(s || "").replace(/\s+\n/g, "\n").trim();
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
  };
  // version anglaise affichée en petit, seulement si elle existe et diffère du français
  const enOf = (fr, en) => (en && String(en).trim() && String(en).trim() !== String(fr || "").trim() ? String(en) : "");
  const toDate = (s) => (s ? new Date(s) : null);
  const evEnd = (ev) => toDate(ev.end) || new Date(toDate(ev.start).getTime() + 3 * 3600e3);
  const fmtDay = (d) => cap(d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
  const fmtTime = (d) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const safe = (p, fallback) => Promise.resolve(p).then((x) => x, (e) => { console.warn("LEONE TV", e); return fallback; });
  function relDay(d) {
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const n = Math.round((day(d) - day(new Date())) / 864e5);
    if (n <= 0) return ["Aujourd'hui", "Today"];
    if (n === 1) return ["Demain", "Tomorrow"];
    return [`Dans ${n} jours`, `In ${n} days`];
  }

  const qrSvg = (url, label) => {
    try { return LEONE_QR.svg(url, { dark: "#14123a", light: "#fffaf0", label }); }
    catch (e) { console.warn("LEONE TV : QR", e); return ""; }
  };
  const qrPage = (hash, fr, en) => `<aside class="qr-card">
      <div class="qr">${qrSvg(SITE + hash, fr)}</div>
      <p class="qr-fr">${esc(fr)}</p>
      <p class="qr-en">${esc(en)}</p>
    </aside>`;

  /* ---------------- Données ---------------- */
  let data = null;
  let online = true;

  async function load() {
    const events = await Store.listEvents(); // échoue hors connexion : on garde les données précédentes
    const [stats, infos, ideas, polls, ads, guide] = await Promise.all([
      safe(Store.stats(), {}), safe(Store.listAnnouncements(), []),
      safe(Store.listPublicProposals(), []), safe(Store.listPolls(), []), safe(Store.listClassifieds(), []),
      safe(Store.listGuide(), [])
    ]);
    data = {
      events: events.slice().sort((a, b) => toDate(a.start) - toDate(b.start)),
      stats: stats || {}, infos: infos || [], ideas: ideas || [], polls: polls || [], ads: ads || [], guide: guide || []
    };
  }

  /* ---------------- Diapositives ---------------- */
  function eventSlide(ev, st) {
    st = st || { headcount: 0, brought: {} };
    const d = toDate(ev.start), end = toDate(ev.end);
    const live = d <= new Date();
    const theme = THEMES.includes(ev.theme) ? ev.theme : "sunset";
    const when = live ? ["En ce moment", "Happening now"] : relDay(d);
    const title = ev.title || "", titleEn = enOf(title, ev.title_en);
    const n = Number(st.headcount) || 0;

    const items = (ev.items || []).filter((it) => it.needed > 0).map((it) => ({ it, got: (st.brought || {})[it.id] || 0 }));
    const missing = items.filter((x) => x.got < x.it.needed)
      .sort((a, b) => (b.it.needed - b.got) - (a.it.needed - a.got)).slice(0, 3);
    const needs = items.length ? `
      <div class="tv-panel needs">
        <h3>Il manque <span class="en">· Still needed</span></h3>
        ${missing.length ? missing.map((x) => {
          const pct = Math.min(100, Math.round((x.got / x.it.needed) * 100));
          return `<div class="need"><span class="need-emoji">${esc(x.it.emoji || "•")}</span><span class="need-label">${esc(x.it.label)}</span><span class="need-count">${x.got}/${x.it.needed}</span><span class="bar"><i style="width:${pct}%"></i></span></div>`;
        }).join("") : `<p class="all-set">✅ Tout est prévu ! <span class="en">· All set!</span></p>`}
      </div>` : ev.description ? `<div class="tv-panel desc"><p>${esc(clip(ev.description, 230))}</p></div>` : "";

    const countdown = live
      ? `<div class="tv-panel live-now"><strong>C'est maintenant !</strong><span class="en">It's on now!</span></div>`
      : `<div class="tv-panel countdown" data-cd="${d.getTime()}">${["j", "h", "min", "s"].map((u) => `<div><strong data-u="${u}">00</strong><span>${u}</span></div>`).join("")}</div>`;

    const facts = [
      `📅 ${fmtDay(d)}`,
      `🕖 ${fmtTime(d)}${end ? ` – ${fmtTime(end)}` : ""}`,
      ev.location ? `📍 ${clip(ev.location, 40)}` : "",
      `👥 ${n}${ev.capacity ? ` / ${Number(ev.capacity)}` : ""} participant${n > 1 ? "s" : ""}`
    ].filter(Boolean);

    return {
      chip: ["📅", "Prochain événement", "Next event"], dur: 16000, theme,
      html: `<div class="s-grid">
        <div class="s-main">
          <p class="eyebrow"><span class="pill ${live ? "pill-live" : ""}">${esc(when[0])} <span class="en">· ${esc(when[1])}</span></span>${ev.category ? `<span class="cat">${esc(clip(ev.category, 40))}</span>` : ""}</p>
          <div class="ev-head">
            <span class="ev-emoji">${esc(ev.emoji || "✨")}</span>
            <div class="ev-titles"><h1 class="s-title ${title.length <= 16 ? "" : title.length <= 30 ? "t-m" : "t-l"}">${esc(clip(title, 56))}</h1>${titleEn ? `<p class="s-sub">${esc(clip(titleEn, 70))}</p>` : ""}</div>
          </div>
          <div class="facts">${facts.map((f) => `<span class="fact">${esc(f)}</span>`).join("")}</div>
          <div class="ev-row">${countdown}${needs}</div>
        </div>
        ${qrPage(`#/event/${encodeURIComponent(ev.id)}`, "Scanne pour répondre", "Scan to RSVP")}
      </div>`
    };
  }

  function infoSlide(a) {
    const title = a.title || "", titleEn = enOf(title, a.title_en);
    const body = a.body || "", bodyEn = enOf(body, a.body_en);
    return {
      chip: a.important ? ["⚠️", "Important", ""] : ["📢", "Info", "Notice"],
      dur: Math.min(25000, 12000 + (title.length + body.length) * 25),
      theme: a.important ? "alert" : "neon",
      html: `<div class="s-grid">
        <div class="s-main">
          <div class="tv-panel info ${a.important ? "is-important" : ""}">
            <h1 class="s-title">${esc(clip(title, 90))}</h1>
            ${titleEn ? `<p class="s-sub">${esc(clip(titleEn, 100))}</p>` : ""}
            ${body ? `<p class="s-body">${esc(clip(body, 520))}</p>` : ""}
            ${bodyEn ? `<p class="s-body en">${esc(clip(bodyEn, 260))}</p>` : ""}
          </div>
        </div>
        ${qrPage("#/infos", "Toutes les infos", "All notices")}
      </div>`
    };
  }

  function pollSlide(p) {
    const total = Number(p.total) || 0;
    const opts = (p.options || []).map((o) => ({ label: o.label, n: Number((p.counts || {})[o.id]) || 0 }));
    const top = opts.reduce((m, o) => Math.max(m, o.n), 0);
    const qEn = enOf(p.question, p.question_en);
    return {
      chip: ["🗳️", "Sondage", "Poll"], dur: 14000, theme: "ocean",
      html: `<div class="s-grid">
        <div class="s-main"><div class="tv-panel poll">
          <h1 class="s-title">${esc(clip(p.question, 120))}</h1>
          ${qEn ? `<p class="s-sub">${esc(clip(qEn, 120))}</p>` : ""}
          <ul class="poll-opts">${opts.slice(0, 6).map((o) => {
            const pct = total ? Math.round((o.n / total) * 100) : 0;
            return `<li class="${top && o.n === top ? "is-lead" : ""}"><span class="po-label">${esc(clip(o.label, 50))}</span><span class="po-pct">${pct} %</span><span class="bar"><i style="width:${pct}%"></i></span></li>`;
          }).join("")}</ul>
          <p class="poll-meta">🗳️ ${total} vote${total > 1 ? "s" : ""}${p.endsAt ? ` · fin le ${esc(new Date(p.endsAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}` : ""}</p>
        </div></div>
        ${qrPage("#/polls", "Vote depuis ton téléphone", "Vote from your phone")}
      </div>`
    };
  }

  function ideasSlide(ideas) {
    return {
      chip: ["💡", "Idées des résidents", "Residents' ideas"], dur: 14000, theme: "sunset",
      html: `<div class="s-grid">
        <div class="s-main"><div class="ideas">${ideas.map((p, i) => `
          <div class="tv-panel idea">
            <span class="idea-rank">${i + 1}</span>
            <div class="idea-text">
              <h3>${esc(clip(p.title, 70))}${p.status === "accepted" ? ` <span class="pill pill-ok">✓ Acceptée</span>` : ""}</h3>
              ${p.description ? `<p>${esc(clip(p.description, 130))}</p>` : ""}
            </div>
            <div class="idea-votes"><span>👍 ${Number(p.likes) || 0}</span><span>👎 ${Number(p.dislikes) || 0}</span></div>
          </div>`).join("")}</div></div>
        ${qrPage("#/propose", "Propose ou vote", "Suggest or vote")}
      </div>`
    };
  }

  function adsSlide(ads) {
    return {
      chip: ["🤝", "Petites annonces", "Classifieds"], dur: 14000, theme: "forest",
      html: `<div class="s-grid">
        <div class="s-main"><div class="ads">${ads.map((a) => {
          const k = AD_KINDS[a.kind] || AD_KINDS.help;
          const img = a.photoPath ? Store.uploadUrl(a.photoPath) : "";
          return `<div class="tv-panel ad">
            ${img ? `<img class="ad-img" src="${esc(img)}" alt="" decoding="async">` : `<span class="ad-emoji">${k[0]}</span>`}
            <div class="ad-text"><p class="ad-kind">${k[0]} ${esc(k[1])} <span class="en">· ${esc(k[2])}</span></p><h3>${esc(clip(a.title, 60))}</h3>${a.body ? `<p class="ad-body">${esc(clip(a.body, 100))}</p>` : ""}</div>
          </div>`;
        }).join("")}</div></div>
        ${qrPage("#/ads", "Voir les annonces", "See all ads")}
      </div>`
    };
  }

  /* ---- Page « Bienvenue » : 20 s, animée ---- */
  function socialCard(kind, url) {
    const wa = kind === "wa";
    return `<div class="social-card ${wa ? "is-wa" : "is-ig"}">
        <p class="social-head"><span class="social-ico">${wa ? ICON_WA : ICON_IG}</span>${wa ? "WhatsApp" : "Instagram"}</p>
        <div class="qr">${qrSvg(url, wa ? "Groupe WhatsApp" : "Instagram")}</div>
        <p class="qr-fr">${wa ? "Rejoins le groupe" : "Suis la résidence"}</p>
        <p class="qr-en">${wa ? "Join the group chat" : "Follow the residence"}</p>
      </div>`;
  }

  function welcomeSlide() {
    const cards = [WA_URL ? socialCard("wa", WA_URL) : "", IG_URL ? socialCard("ig", IG_URL) : ""];
    const any = WA_URL || IG_URL;
    const floaters = FLOATERS.map((e, i) =>
      `<span style="left:${(i * 7.3 + 3) % 96}%;animation-duration:${16 + ((i * 5) % 11)}s;animation-delay:-${(i * 3.7) % 18}s">${e}</span>`).join("");
    return {
      kind: "welcome", chip: ["👋", "Bienvenue", "Welcome"], dur: WELCOME_MS, theme: "sunset",
      html: `<div class="s-welcome">
        <div class="w-floaters" aria-hidden="true">${floaters}</div>
        <div class="w-sun" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="w-greet-box">
          <p class="w-greet" data-greet>${esc(GREETINGS[0][0])}</p>
          <p class="w-lang" data-lang>${esc(GREETINGS[0][1])}</p>
        </div>
        <p class="w-tag">à la résidence <strong>LEONE</strong> <span class="en">· to LEONE residence</span></p>
        <div class="w-row">
          ${cards[0]}
          <div class="w-join">
            <span class="w-phone" aria-hidden="true">📱</span>
            <p class="w-join-fr">${any ? "Rejoins-nous !" : "Le site de la résidence"}</p>
            <p class="w-join-en">${any ? "Join us!" : "Residence website"}</p>
            <p class="w-join-hint">${any ? "Ouvre l'appareil photo et scanne" : ""}</p>
            ${any ? `<p class="w-join-hint en">Open your camera and scan</p>` : `<div class="qr w-site-qr">${qrSvg(SITE, "LEONE")}</div>`}
            <p class="w-site">🌐 ${esc(SITE_LABEL)}</p>
          </div>
          ${cards[1]}
        </div>
      </div>`,
      // un « bienvenue » dans chaque langue du site, à tour de rôle
      onShow(el) {
        const greet = $("[data-greet]", el), lang = $("[data-lang]", el), box = greet.parentNode;
        let swapT = null; // la rotation reprend là où elle s'était arrêtée (greetIdx)
        const fit = () => {
          greet.style.fontSize = "";
          const max = box.clientWidth, w = greet.scrollWidth;
          if (w > max) greet.style.fontSize = Math.floor((parseFloat(getComputedStyle(greet).fontSize) * max) / w) + "px";
        };
        const show = (k) => {
          const [word, name, dir] = GREETINGS[k];
          greet.textContent = word; lang.textContent = name;
          greet.dir = dir || "ltr";
          fit();
          box.classList.remove("is-out", "is-in");
          void box.offsetWidth; // relance l'animation d'entrée
          box.classList.add("is-in");
        };
        show(greetIdx);
        const iv = setInterval(() => {
          box.classList.remove("is-in");
          box.classList.add("is-out");
          swapT = setTimeout(() => { greetIdx = (greetIdx + 1) % GREETINGS.length; show(greetIdx); }, 450);
        }, GREET_MS);
        return () => { clearInterval(iv); clearTimeout(swapT); };
      }
    };
  }

  /* ---- Mode d'emploi : une diapo par partie (« ## Intertitre ») de chaque article ---- */
  // mise en forme du site : ## intertitre, - liste, 1. étape, **gras**, > encadré, [photo 2]
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  function guideSections(a) {
    const sections = [];
    let cur = { heading: "", lines: [], photos: [] };
    String(a.body || "").split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      let m;
      if ((m = line.match(/^##\s+(.+)/))) { if (cur.heading || cur.lines.length) sections.push(cur); cur = { heading: m[1], lines: [], photos: [] }; }
      else if ((m = line.match(/^\[photo\s*(\d{1,2})\]$/i))) cur.photos.push(Number(m[1]) - 1);
      else cur.lines.push(line);
    });
    if (cur.heading || cur.lines.length) sections.push(cur);
    return sections.filter((s) => s.lines.length || s.photos.length);
  }
  function guideBodyHTML(lines) {
    let html = "", list = null, used = 0;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const line of lines) {
      if (used > 520) break; // reste lisible à 3 m : le détail est sur le site (QR code)
      let m, tag = null, text = line;
      if ((m = line.match(/^\d+[.)]\s+(.+)/))) { tag = "ol"; text = m[1]; }
      else if ((m = line.match(/^[-•]\s+(.+)/))) { tag = "ul"; text = m[1]; }
      if (tag) { if (list !== tag) { close(); html += `<${tag}>`; list = tag; } html += `<li>${inline(clip(text, 140))}</li>`; }
      else if ((m = line.match(/^>\s*(.+)/))) { close(); html += `<p class="callout">${inline(clip(m[1], 200))}</p>`; }
      else { close(); html += `<p>${inline(clip(text, 240))}</p>`; }
      used += text.length;
    }
    close();
    return html;
  }
  function guideSlides(articles) {
    const out = [];
    articles.slice(0, 3).forEach((a) => {
      const parts = guideSections(a).slice(0, 6);
      const titleEn = enOf(a.title, a.title_en);
      parts.forEach((p, n) => {
        const photo = (a.photos || [])[p.photos[0]];
        const url = photo ? Store.guidePhotoUrl(photo.path) : "";
        const len = p.lines.join(" ").length;
        out.push({
          key: `guide:${a.id}:${n}`, chip: ["📖", "Mode d'emploi", "How-to"], theme: "ocean",
          dur: Math.max(12000, Math.min(22000, 9000 + len * 30)),
          html: `<div class="s-grid">
            <div class="s-main"><div class="tv-panel guide">
              <div class="guide-text">
                <p class="guide-eyebrow">${esc(a.emoji || "📘")} ${esc(clip(a.title, 60))}${parts.length > 1 ? ` · ${n + 1}/${parts.length}` : ""}${titleEn && !p.heading ? ` <span class="en">· ${esc(clip(titleEn, 50))}</span>` : ""}</p>
                <h1 class="s-title">${esc(clip(p.heading || a.title, 70))}</h1>
                <div class="guide-body">${guideBodyHTML(p.lines)}</div>
              </div>
              ${url ? `<figure class="guide-photo"><img src="${esc(url)}" alt="" decoding="async">${photo.caption ? `<figcaption>${esc(clip(photo.caption, 60))}</figcaption>` : ""}</figure>` : ""}
            </div></div>
            ${qrPage("#/guide", "Le mode d'emploi complet", "Full guide")}
          </div>`
        });
      });
    });
    return out.slice(0, 8);
  }

  function buildSlides() {
    if (!data) return [Object.assign(welcomeSlide(), { key: "welcome" })];
    const now = new Date();
    const s = [];
    const add = (key, slide) => s.push(Object.assign(slide, { key }));
    const infos = data.infos.slice(0, 4);
    infos.filter((a) => a.important).forEach((a) => add(`info:${a.id}`, infoSlide(a)));
    data.events.filter((e) => evEnd(e) > now).slice(0, 3).forEach((e) => add(`ev:${e.id}`, eventSlide(e, data.stats[e.id])));
    infos.filter((a) => !a.important).forEach((a) => add(`info:${a.id}`, infoSlide(a)));
    data.polls.filter((p) => !(p.endsAt && new Date(p.endsAt) < now)).slice(0, 2).forEach((p) => add(`poll:${p.id}`, pollSlide(p)));
    const ideas = data.ideas.slice(0, 3);
    if (ideas.length) add("ideas", ideasSlide(ideas));
    const ads = data.ads.filter((a) => !a.expiresAt || new Date(a.expiresAt) > now).slice(0, 4);
    if (ads.length) add("ads", adsSlide(ads));
    guideSlides(data.guide).forEach((g) => s.push(g));
    add("welcome", welcomeSlide());
    return s;
  }

  /* ---------------- Carrousel ---------------- */
  const stage = $("#stage"), slidesEl = $("#slides"), dotsEl = $("#tvDots"), chipEl = $("#tvChip"), progEl = $("#tvProgress");
  let slides = [], idx = 0, timer = null, paused = false, dirty = false, stopShown = null;
  const bootAt = Date.now();

  function render() {
    slides = buildSlides();
    slidesEl.innerHTML = slides.map((s) => `<section class="slide th-${esc(s.theme || "sunset")}" aria-hidden="true">${s.html}</section>`).join("");
    dotsEl.innerHTML = slides.length > 1 ? slides.map(() => "<i></i>").join("") : "";
    dirty = false;
  }

  function go(i, instant) {
    if (stopShown) { stopShown(); stopShown = null; }
    idx = (i + slides.length) % slides.length;
    if (instant) slidesEl.classList.add("instant"); // mise à jour sur place : pas de fondu
    [...slidesEl.children].forEach((el, k) => { el.classList.toggle("is-on", k === idx); el.setAttribute("aria-hidden", String(k !== idx)); });
    if (instant) { void slidesEl.offsetWidth; slidesEl.classList.remove("instant"); }
    [...dotsEl.children].forEach((el, k) => el.classList.toggle("is-on", k === idx));
    const s = slides[idx];
    const [emoji, fr, en] = s.chip;
    chipEl.innerHTML = `<span class="chip-emoji">${emoji}</span> ${esc(fr)}${en && en !== fr ? ` <span class="en">· ${esc(en)}</span>` : ""}`;
    stage.classList.toggle("is-welcome", s.kind === "welcome");
    if (s.onShow) stopShown = s.onShow(slidesEl.children[idx]);
    tick();
    restartTimer();
  }

  function next() {
    if (idx + 1 >= slides.length) {
      // fin de boucle : moment idéal pour recharger la page ou prendre les nouvelles données
      if (Date.now() - bootAt > RELOAD_MS && navigator.onLine !== false) { location.reload(); return; }
      if (dirty) render();
      go(0);
    } else go(idx + 1);
  }

  function restartTimer() {
    clearTimeout(timer);
    progEl.style.transition = "none";
    progEl.style.transform = "scaleX(0)";
    void progEl.offsetWidth; // relance l'animation de la barre
    if (paused) return;
    const dur = slides[idx].dur;
    progEl.style.transition = `transform ${dur}ms linear`;
    progEl.style.transform = "scaleX(1)";
    timer = setTimeout(next, dur);
  }

  /* ---------------- Veille : luminosité réduite, réveil sur « Bienvenue » ---------------- */
  const dimEl = $("#tvDim");
  let lastInput = Date.now(), lastTick = Date.now(), dimmed = false, hiddenAt = 0;

  function setDim(on) {
    dimmed = on;
    dimEl.classList.toggle("is-on", on);
  }

  // TV rallumée (ou page revenue au premier plan) : pleine luminosité, données fraîches, page « Bienvenue »
  function onWake() {
    lastInput = lastTick = Date.now(); // évite un second réveil au tic suivant
    setDim(false);
    if (dirty) render();
    go(slides.length - 1); // la page « Bienvenue » est toujours la dernière
    if (window.Store) refresh();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt) { hiddenAt = 0; onWake(); }
  });

  /* ---------------- Horloge et compte à rebours ---------------- */
  function tick() {
    const nowMs = Date.now();
    // la page ne tourne pas pendant que la TV est en veille : un « trou » dans l'horloge = réveil
    if (nowMs - lastTick > WAKE_GAP_MS) { lastTick = nowMs; onWake(); return; }
    lastTick = nowMs;
    if (!dimmed && nowMs - lastInput > DIM_AFTER_MS) setDim(true);
    const now = new Date();
    $("#tvTime").textContent = fmtTime(now);
    $("#tvDate").textContent = fmtDay(now);
    const el = slidesEl.children[idx];
    const cd = el && el.querySelector("[data-cd]");
    if (!cd) return;
    const ms = Math.max(0, Number(cd.dataset.cd) - now.getTime());
    const u = { j: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, min: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
    Object.keys(u).forEach((k) => { const x = cd.querySelector(`[data-u="${k}"]`); if (x) x.textContent = String(u[k]).padStart(2, "0"); });
  }

  function status() {
    const el = $("#tvStatus");
    el.textContent = paused ? "⏸ Pause · OK pour reprendre" : online ? "" : "📡 Hors ligne · Offline";
    el.classList.toggle("is-warn", paused || !online);
  }

  /* ---------------- Rafraîchissement ---------------- */
  let refreshT = null, lastSig = "";
  async function refresh() {
    clearTimeout(refreshT);
    try { await load(); online = true; } catch (e) { online = false; console.warn("LEONE TV : chargement", e); }
    status();
    const sig = data ? JSON.stringify(data) : "";
    if (sig && sig !== lastSig) {
      lastSig = sig;
      const cur = slides[idx];
      // nouveautés (événement ajouté, info publiée…) : affichées tout de suite, sur place,
      // sauf pendant la page « Bienvenue » (prises en compte quand elle se termine)
      if (!cur || cur.kind === "welcome") dirty = true;
      else {
        render();
        const i = slides.findIndex((s) => s.key === cur.key);
        go(i >= 0 ? i : Math.min(idx, slides.length - 1), true);
      }
    }
    refreshT = setTimeout(refresh, online ? REFRESH_MS : RETRY_MS);
  }
  window.addEventListener("online", () => refresh());

  /* ---------------- Écran ---------------- */
  function fit() {
    // zone d'affichage réelle (innerWidth peut être faussé par le zoom des WebView de TV)
    const de = document.documentElement;
    const s = Math.min((de.clientWidth || window.innerWidth) / W, (de.clientHeight || window.innerHeight) / H);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  window.addEventListener("resize", fit);

  // garder l'écran allumé (navigateurs qui le permettent)
  async function keepAwake() {
    try { if ("wakeLock" in navigator && document.visibilityState === "visible") await navigator.wakeLock.request("screen"); } catch (e) { /* ignore */ }
  }
  document.addEventListener("visibilitychange", keepAwake);

  // une image qui ne charge pas : on la masque plutôt que d'afficher une icône cassée
  slidesEl.addEventListener("error", (e) => {
    if (e.target && e.target.tagName === "IMG") e.target.classList.add("is-broken");
  }, true);

  document.addEventListener("keydown", (e) => {
    lastInput = Date.now();
    // écran assombri : la première touche rallume seulement, sans changer de diapo
    if (dimmed) { setDim(false); e.preventDefault(); return; }
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowDown" || k === "MediaTrackNext" || k === "MediaFastForward") next();
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "MediaTrackPrevious" || k === "MediaRewind") go(idx - 1);
    else if (k === "Enter" || k === " " || k === "MediaPlayPause") { paused = !paused; status(); restartTimer(); }
    else return;
    e.preventDefault();
  });

  $("#tvUrl").textContent = `🌐 ${SITE_LABEL}`;
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* ignore : fonctionne aussi sans */ });
  }

  fit();
  keepAwake();
  render();
  go(0);
  setInterval(tick, 1000);
  if (window.Store) refresh();
  else { online = false; status(); }
})();
