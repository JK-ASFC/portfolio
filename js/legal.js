/* LEONE — Confidentialité & mentions légales (RGPD, loi Informatique et Libertés, LCEN).
   Texte de référence en français ; version anglaise pour les résidents étrangers.
   Les autres langues affichent la version anglaise (le français fait foi). */
(function () {
  "use strict";
  const UPDATED = "2026-11-12";
  const SUPPORT = { mail: "support@livecolonies.com", help: "https://support.livecolonies.com/fr/" };

  function contactHTML(c, lang) {
    const cfg = window.LEONE_CONFIG || {};
    const mail = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(cfg.contactEmail || "") ? cfg.contactEmail : "";
    const ig = /^[A-Za-z0-9_.]{1,30}$/.test(String(cfg.creatorInstagram || "").replace(/^@/, "")) ? String(cfg.creatorInstagram).replace(/^@/, "") : "";
    const parts = [];
    if (mail) parts.push(`<a href="mailto:${c.esc(mail)}">${c.esc(mail)}</a>`);
    if (ig) parts.push(`${lang === "fr" ? "message privé Instagram" : "Instagram direct message"} <a href="https://www.instagram.com/${c.esc(ig)}/" target="_blank" rel="noopener noreferrer">@${c.esc(ig)}</a>`);
    return parts.join(lang === "fr" ? " ou " : " or ") || (lang === "fr" ? "via le groupe WhatsApp de la résidence" : "via the residence WhatsApp group");
  }
  function publisher(c, lang) {
    const cfg = window.LEONE_CONFIG || {};
    const name = String(cfg.publisherName || "").trim().slice(0, 80);
    if (name) return `${c.esc(name)}, ${lang === "fr" ? "résident, à titre personnel et non professionnel" : "resident, acting in a personal, non-professional capacity"}`;
    return lang === "fr" ? "Un résident de la résidence, particulier agissant à titre personnel et non professionnel" : "A resident of the building, a private individual acting in a personal, non-professional capacity";
  }

  const FR = (c) => `
    <p class="legal-updated">Dernière mise à jour : 12 novembre 2026</p>
    <div class="notice legal-aff"><strong>Site non affilié à Colonies.</strong> LEONE est une initiative personnelle et bénévole d'un résident pour organiser des événements entre voisins. Il n'est ni géré, ni validé, ni financé par Colonies, et Colonies ne reçoit rien de ce qui est envoyé ici. Pour toute demande liée à ton logement : <a href="#/report">contacter le support Colonies</a>.</div>

    <h2>1. Mentions légales</h2>
    <dl class="legal-dl">
      <dt>Éditeur et directeur de la publication</dt><dd>${publisher(c, "fr")}.</dd>
      <dt>Contact</dt><dd>${contactHTML(c, "fr")}.</dd>
      <dt>Hébergement du site</dt><dd>GitHub Pages — GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis (github.com).</dd>
      <dt>Base de données et fichiers</dt><dd>Supabase, Inc. (supabase.com), prestataire technique agissant comme sous-traitant.</dd>
    </dl>
    <p>Mentions établies conformément à l'article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN).</p>

    <h2>2. Protection des données personnelles</h2>
    <p>Ce site respecte le Règlement (UE) 2016/679 (RGPD) et la loi n° 78-17 du 6 janvier 1978 « Informatique et Libertés ». Il collecte le moins de données possible : <strong>pas de compte résident, pas de nom de famille, pas de numéro de chambre, pas de cookie publicitaire ni de mesure d'audience.</strong></p>

    <h3>2.1 Responsable du traitement</h3>
    <p>L'éditeur du site (voir ci-dessus), joignable ${contactHTML(c, "fr")}. Aucun délégué à la protection des données n'est désigné (non obligatoire pour ce site).</p>

    <h3>2.2 Données traitées, finalités, bases légales et durées</h3>
    <div class="table-wrap"><table class="legal-table">
      <thead><tr><th>Quoi</th><th>Données</th><th>Pourquoi</th><th>Base légale (art. 6 RGPD)</th><th>Conservation</th></tr></thead>
      <tbody>
        <tr><td>Réponse à un événement</td><td>Prénom, présence, nombre d'invités, ce que tu apportes, réponses aux questions, message aux organisateurs</td><td>Organiser l'événement (effectifs, courses). Ton prénom et ton message ne sont vus que par les organisateurs ; le public voit seulement « Un·e voisin·e », la présence et ce qui est apporté.</td><td>Consentement (6.1.a) — tu choisis de répondre, et tu peux supprimer ta réponse.</td><td>Supprimée 6 mois après l'événement.</td></tr>
        <tr><td>Idées d'événements</td><td>Titre, description, période, besoins, prénom facultatif</td><td>Recueillir et classer les idées. Titre et description sont publics ; prénom et besoins restent privés.</td><td>Consentement (6.1.a)</td><td>12 mois.</td></tr>
        <tr><td>Votes (idées, sondages)</td><td>Choix + identifiant technique anonyme de l'appareil</td><td>Compter une voix par appareil.</td><td>Consentement (6.1.a)</td><td>12 mois.</td></tr>
        <tr><td>Petites annonces</td><td>Titre, détails, moyen de contact choisi, prénom facultatif, photo</td><td>Entraide entre voisins (contenu public).</td><td>Consentement (6.1.a)</td><td>En ligne 30 jours, effacée 30 jours après expiration (ou dès que tu la retires).</td></tr>
        <tr><td>Photos d'événements</td><td>Photo, légende</td><td>Galerie des événements, après validation. Les métadonnées (dont la position GPS) sont supprimées avant l'envoi.</td><td>Consentement (6.1.a)</td><td>Jusqu'au retrait par un organisateur ou sur simple demande.</td></tr>
        <tr><td>Notifications</td><td>Adresse technique d'abonnement fournie par ton navigateur, langue</td><td>T'envoyer les annonces d'événements que tu as demandées.</td><td>Consentement (6.1.a)</td><td>Jusqu'à ta désinscription.</td></tr>
        <tr><td>Sécurité, anti-abus</td><td>Empreinte (hachage SHA-256) d'un identifiant aléatoire stocké sur ton appareil et de ton adresse IP — jamais l'adresse IP en clair</td><td>Éviter les doublons, les envois massifs et les abus.</td><td>Intérêt légitime (6.1.f) : sécurité du service.</td><td>Même durée que le contenu concerné.</td></tr>
        <tr><td>Comptes organisateurs</td><td>E-mail, mot de passe (stocké sous forme hachée)</td><td>Accès à l'espace Organiser.</td><td>Intérêt légitime (6.1.f)</td><td>Tant que la personne est organisatrice.</td></tr>
      </tbody>
    </table></div>
    <p><strong>Pot commun :</strong> les paiements se font directement sur Revolut, qui agit sous sa propre responsabilité (voir sa politique de confidentialité). Ce site n'enregistre aucune donnée bancaire ni le nom des donateurs : le journal publié est anonyme et accompagné des tickets d'achat.</p>
    <p><strong>Hébergeur :</strong> comme tout serveur web, GitHub peut enregistrer l'adresse IP des visiteurs dans ses journaux techniques, à des fins de sécurité (voir la déclaration de confidentialité de GitHub).</p>

    <h3>2.3 Stockage sur ton appareil</h3>
    <p>Le site n'utilise <strong>aucun cookie</strong>. Il enregistre dans le stockage local de ton navigateur : un identifiant aléatoire d'appareil (anti-doublon), la langue choisie, les messages déjà lus et les événements auxquels tu as répondu ; l'application installée garde aussi une copie des pages pour fonctionner hors connexion. Ces éléments sont strictement nécessaires au service que tu demandes et sont donc dispensés de consentement (article 82 de la loi Informatique et Libertés). Tu peux les effacer à tout moment en supprimant les données du site dans ton navigateur. Les polices de caractères sont hébergées sur le site lui-même : aucun appel n'est fait à Google.</p>

    <h3>2.4 Destinataires</h3>
    <p>Seuls les organisateurs bénévoles du site accèdent aux données non publiques. Prestataires techniques (sous-traitants, art. 28 RGPD) : GitHub (hébergement), Supabase (base de données, fichiers, envoi des notifications). Pour les notifications, le service de ton navigateur (Google, Apple ou Mozilla) achemine le message. <strong>Aucune donnée n'est vendue, utilisée pour de la publicité ni transmise à Colonies.</strong></p>

    <h3>2.5 Transferts hors de l'Union européenne</h3>
    <p>GitHub et Supabase sont des sociétés américaines : des données peuvent être traitées aux États-Unis. Ces transferts sont encadrés par les garanties prévues aux articles 45 et 46 du RGPD (décision d'adéquation « EU-US Data Privacy Framework » et/ou clauses contractuelles types de la Commission européenne).</p>

    <h3>2.6 Sécurité</h3>
    <p>Connexion chiffrée (HTTPS) ; règles d'accès en base de données limitant chaque visiteur à ce qui est public ; espace organisateur protégé par compte ; photos ré-encodées ; limitation du nombre d'envois.</p>

    <h3>2.7 Tes droits</h3>
    <p>Tu disposes des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité (articles 15 à 21 du RGPD), du droit de retirer ton consentement à tout moment (sans remettre en cause ce qui a été fait avant), et du droit de définir des directives sur le sort de tes données après ton décès (article 85 de la loi Informatique et Libertés).</p>
    <ul>
      <li><strong>Directement sur le site :</strong> modifier ou supprimer ta réponse depuis la page de l'événement, retirer ton annonce, désactiver les notifications (page Appli &amp; notifications).</li>
      <li><strong>Pour tout le reste :</strong> écris à l'éditeur, ${contactHTML(c, "fr")}. Réponse sous un mois au plus (article 12 du RGPD).</li>
      <li><strong>Réclamation :</strong> tu peux saisir la CNIL — 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 — <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer">www.cnil.fr/fr/plaintes</a>.</li>
    </ul>
    <p>Aucune décision automatisée ni aucun profilage n'est réalisé. Le site s'adresse aux résidents majeurs ; un mineur de moins de 15 ans ne doit pas y laisser de données sans l'accord d'un parent (article 45 de la loi Informatique et Libertés).</p>

    <h2>3. Règles de publication — le site est public</h2>
    <p>Tout ce qui est publié ici est visible par n'importe qui sur Internet. <strong>Ne publie jamais :</strong></p>
    <ul>
      <li>de code d'accès, digicode, code de boîte à clés ou mot de passe Wi-Fi ;</li>
      <li>de nom de famille, de numéro de chambre ou d'appartement, de numéro de téléphone ou d'adresse e-mail (les tiens ou ceux d'autres résidents) ;</li>
      <li>d'information sur la santé, la religion, les opinions ou la vie privée de quelqu'un ;</li>
      <li>de photo d'une personne reconnaissable sans son accord (droit à l'image, article 9 du Code civil).</li>
    </ul>
    <p>Les contenus contraires à ces règles ou manifestement illicites sont retirés dès qu'ils sont signalés (article 6 de la LCEN). Pour signaler un contenu ou demander le retrait d'une photo : ${contactHTML(c, "fr")}.</p>

    <h2>4. Propriété intellectuelle</h2>
    <p>Les photos restent la propriété de leurs auteurs, qui en autorisent l'affichage sur le site et peuvent en demander le retrait à tout moment. Les polices Audiowide, Space Grotesk et Space Mono sont utilisées sous licence SIL Open Font License 1.1.</p>`;

  const EN = (c) => `
    <p class="legal-updated">Last updated: 12 November 2026 · The French version is the reference text.</p>
    <div class="notice legal-aff"><strong>Not affiliated with Colonies.</strong> LEONE is a personal, volunteer initiative by a resident to organise events between neighbours. It is not run, approved or funded by Colonies, and Colonies receives nothing sent here. For anything about your accommodation: <a href="#/report">contact Colonies support</a>.</div>

    <h2>1. Legal notice</h2>
    <dl class="legal-dl">
      <dt>Publisher and editor</dt><dd>${publisher(c, "en")}.</dd>
      <dt>Contact</dt><dd>${contactHTML(c, "en")}.</dd>
      <dt>Website hosting</dt><dd>GitHub Pages — GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA (github.com).</dd>
      <dt>Database and files</dt><dd>Supabase, Inc. (supabase.com), technical provider acting as a processor.</dd>
    </dl>
    <p>Notice provided under Article 6 of French law no. 2004-575 of 21 June 2004 (LCEN).</p>

    <h2>2. Personal data</h2>
    <p>This site complies with the GDPR (Regulation (EU) 2016/679) and the French Data Protection Act. It collects as little as possible: <strong>no resident account, no surname, no room number, no advertising cookies and no analytics.</strong></p>

    <h3>2.1 Controller</h3>
    <p>The publisher (see above), reachable ${contactHTML(c, "en")}. No data protection officer has been appointed (not required for this site).</p>

    <h3>2.2 Data, purposes, legal bases and retention</h3>
    <div class="table-wrap"><table class="legal-table">
      <thead><tr><th>What</th><th>Data</th><th>Why</th><th>Legal basis (GDPR art. 6)</th><th>Retention</th></tr></thead>
      <tbody>
        <tr><td>Event reply</td><td>First name, attendance, number of guests, what you bring, answers, message to organisers</td><td>Organising the event. Your first name and message are only seen by organisers; the public only sees “A neighbour”, attendance and what is brought.</td><td>Consent (6.1.a) — you choose to reply and can delete your reply.</td><td>Deleted 6 months after the event.</td></tr>
        <tr><td>Event ideas</td><td>Title, description, timing, needs, optional first name</td><td>Collecting ideas. Title and description are public; first name and needs stay private.</td><td>Consent (6.1.a)</td><td>12 months.</td></tr>
        <tr><td>Votes (ideas, polls)</td><td>Choice + anonymous technical device identifier</td><td>One vote per device.</td><td>Consent (6.1.a)</td><td>12 months.</td></tr>
        <tr><td>Classified ads</td><td>Title, details, chosen contact method, optional first name, photo</td><td>Neighbour-to-neighbour help (public content).</td><td>Consent (6.1.a)</td><td>Online 30 days, erased 30 days after expiry (or as soon as you remove it).</td></tr>
        <tr><td>Event photos</td><td>Photo, caption</td><td>Event gallery, after approval. Metadata (including GPS location) is removed before upload.</td><td>Consent (6.1.a)</td><td>Until removed by an organiser or on request.</td></tr>
        <tr><td>Notifications</td><td>Technical subscription address provided by your browser, language</td><td>Sending the event updates you asked for.</td><td>Consent (6.1.a)</td><td>Until you unsubscribe.</td></tr>
        <tr><td>Security, anti-abuse</td><td>Hash (SHA-256) of a random identifier stored on your device and of your IP address — never the IP address in clear</td><td>Preventing duplicates, mass posting and abuse.</td><td>Legitimate interest (6.1.f): service security.</td><td>Same as the related content.</td></tr>
        <tr><td>Organiser accounts</td><td>Email, password (stored hashed)</td><td>Access to the Organiser area.</td><td>Legitimate interest (6.1.f)</td><td>While the person is an organiser.</td></tr>
      </tbody>
    </table></div>
    <p><strong>Shared fund:</strong> payments are made directly on Revolut, which acts under its own responsibility (see its privacy policy). This site stores no bank details and no donor names: the published ledger is anonymous and backed by purchase receipts.</p>
    <p><strong>Host:</strong> like any web server, GitHub may log visitors' IP addresses for security purposes (see GitHub's privacy statement).</p>

    <h3>2.3 Storage on your device</h3>
    <p>The site uses <strong>no cookies</strong>. It keeps in your browser's local storage: a random device identifier (anti-duplicate), your chosen language, messages already read and events you replied to; the installed app also keeps a copy of the pages to work offline. These are strictly necessary for the service you request and therefore exempt from consent (Article 82 of the French Data Protection Act). You can erase them at any time by clearing the site's data in your browser. Fonts are hosted on the site itself: no request is made to Google.</p>

    <h3>2.4 Recipients</h3>
    <p>Only the site's volunteer organisers can access non-public data. Technical processors (GDPR art. 28): GitHub (hosting), Supabase (database, files, sending notifications). For notifications, your browser's push service (Google, Apple or Mozilla) delivers the message. <strong>No data is sold, used for advertising or passed on to Colonies.</strong></p>

    <h3>2.5 Transfers outside the EU</h3>
    <p>GitHub and Supabase are US companies: data may be processed in the United States. These transfers rely on the safeguards of GDPR Articles 45 and 46 (EU-US Data Privacy Framework adequacy decision and/or the European Commission's standard contractual clauses).</p>

    <h3>2.6 Security</h3>
    <p>Encrypted connection (HTTPS); database access rules limiting visitors to public content; account-protected Organiser area; re-encoded photos; rate limits.</p>

    <h3>2.7 Your rights</h3>
    <p>You have the rights of access, rectification, erasure, restriction, objection and portability (GDPR Articles 15 to 21), the right to withdraw consent at any time (without affecting what was done before), and the right to set instructions for your data after your death (Article 85 of the French Data Protection Act).</p>
    <ul>
      <li><strong>Directly on the site:</strong> edit or delete your reply on the event page, remove your ad, turn off notifications (App &amp; notifications page).</li>
      <li><strong>For anything else:</strong> write to the publisher, ${contactHTML(c, "en")}. Reply within one month at most (GDPR Article 12).</li>
      <li><strong>Complaints:</strong> you can contact the CNIL (French data protection authority) — 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France — <a href="https://www.cnil.fr/en/complaints" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>.</li>
    </ul>
    <p>No automated decision-making or profiling takes place. The site is meant for adult residents; children under 15 must not leave data here without a parent's consent.</p>

    <h2>3. Posting rules — this site is public</h2>
    <p>Anything posted here can be seen by anyone on the Internet. <strong>Never post:</strong></p>
    <ul>
      <li>access codes, door codes, key-box codes or Wi-Fi passwords;</li>
      <li>surnames, room or flat numbers, phone numbers or email addresses (yours or other residents');</li>
      <li>information about someone's health, religion, opinions or private life;</li>
      <li>photos of an identifiable person without their consent (image rights, French Civil Code Article 9).</li>
    </ul>
    <p>Content breaking these rules or clearly unlawful is removed as soon as it is reported. To report content or ask for a photo to be removed: ${contactHTML(c, "en")}.</p>

    <h2>4. Intellectual property</h2>
    <p>Photos remain the property of their authors, who allow them to be displayed on the site and may ask for their removal at any time. The Audiowide, Space Grotesk and Space Mono fonts are used under the SIL Open Font License 1.1.</p>`;

  function render(c) {
    const root = c.$("#legalRoot");
    const fr = c.lang() === "fr" || String(c.lang()).startsWith("gcf");
    root.innerHTML = `<article class="legal" lang="${fr ? "fr" : "en"}">${fr ? FR(c) : EN(c)}</article>`;
  }

  window.LEONE_LEGAL = { render, SUPPORT, UPDATED };
})();
