# LEONE — les événements de la résidence

Site statique (HTML/CSS/JS, sans build), en 20 langues, hébergé sur GitHub Pages.
Les résidents consultent les événements, répondent et indiquent ce qu'ils ramènent.
Les organisateurs gèrent les événements depuis **Organiser**.

```
index.html        accueil (liste des événements), page événement, espace organisateur
css/style.css     style rétro-futuriste
js/i18n.js        traductions FR / EN
js/config.js      configuration (Supabase)
js/store.js       données : Supabase, ou mode démo (localStorage)
js/app.js         rendu, formulaires, modération
supabase.sql      schéma, sécurité (RLS + fonctions) et événement d'exemple
```

## Langues

20 langues : français, anglais, espagnol, portugais, italien, allemand, polonais, russe, ukrainien,
turc, arabe (de droite à gauche), hindi, vietnamien, malais, chinois, japonais, coréen, lingala,
créole guadeloupéen et créole martiniquais.

- **Bascule automatique** selon la langue de l'appareil (sinon anglais) ; choix manuel avec le menu 🌐,
  mémorisé sur l'appareil.
- Les textes vus par les résidents sont traduits dans chaque langue (`js/lang/<code>.js`, chargé à la
  demande). L'espace organisateur reste en français / anglais.
- Le contenu écrit par les organisateurs (événements, messages…) s'affiche en anglais (si la version
  anglaise est remplie) pour toutes les langues autres que le français.
- Ajouter ou corriger une langue : modifier `js/lang/<code>.js`, puis vérifier avec
  `node tools/check-i18n.js` (textes manquants, variables `{n}` / `{x}` cassées).
- ⚠ Lingala et créoles : traductions à faire relire par une personne dont c'est la langue.

## Mise en ligne (GitHub Pages)

1. Fusionner sur `main`.
2. **Settings → Pages → Deploy from a branch** → `main` / `(root)`.
3. Site publié sur `https://<utilisateur>.github.io/portfolio/`.

Sans Supabase, le site tourne en **mode démo** : chaque navigateur a ses propres données.

## Réseaux (`js/config.js`)

- `whatsappUrl` : le lien d'invitation du groupe WhatsApp. Il ajoute un bouton sur l'accueil et un lien en bas de page.
- `instagramGroupUrl` : le lien d'invitation du groupe Instagram. Pour l'obtenir dans Instagram : discussion de groupe → nom du groupe → **Inviter via un lien** → copier. On peut aussi mettre le lien d'un canal ou d'un compte. Le bouton reste masqué tant que ce champ est vide.
- `creatorInstagram` : le pseudo affiché en bas de page dans « Site créé par @… ».
- `publisherName`, `contactEmail` : l'éditeur et l'adresse de contact affichés sur la page « Confidentialité & mentions légales ».

## Base partagée et sécurisée (Supabase, gratuit)

1. Créer un projet sur <https://supabase.com>.
2. **SQL Editor** → coller `supabase.sql` → **Run** (réexécutable sans risque).
3. **Authentication → Providers → Email** : désactiver *Allow new users to sign up*.
4. **Authentication → Users → Add user** : créer le compte de chaque organisateur (email + mot de passe).
5. Donner les droits organisateur (SQL Editor) :
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'organisateur@exemple.fr'
   on conflict do nothing;
   ```
6. **Project Settings → API** : copier `Project URL` et la clé `anon public` dans `js/config.js`, puis commit.

## Propositions d'événements

Sur la **page d'accueil**, sous les événements, la section **« Idées des résidents »** liste les idées
en attente ou acceptées (titre, extrait, statut — jamais le prénom ni les besoins). Le bouton
**« Proposer une idée »** ouvre le formulaire sur place (titre, détails, quand, ce qu'il faudrait,
prénom facultatif). L'ancien lien `#/propose` mène à l'accueil, formulaire ouvert. Les organisateurs gèrent les
propositions dans Organiser → Propositions : refuser (l'idée disparaît de la liste publique),
supprimer, ou **Créer l'événement** (éditeur pré-rempli). Limite : 3 propositions / 24 h par appareil, 10 / heure par connexion.

**Votes 👍 / 👎** : chaque idée affiche ses « j'aime » et « je n'aime pas ». Un vote par appareil et par
idée (vérifié par la base, comme les réponses) ; recliquer retire le vote, on peut changer d'avis.
Les idées les plus appréciées remontent en tête de liste (les idées acceptées restent en premier).
Le détail de qui a voté quoi n'est jamais public ; les organisateurs voient les totaux dans
Organiser → Propositions. Limite : 120 votes / 10 min par connexion.

## Pot commun

Le site **n'encaisse aucun argent** et ne stocke aucune donnée bancaire. Il :
- renvoie vers une page de paiement externe (HelloAsso, Lydia, Leetchi…) réglée dans
  Organiser → Pot commun (lien `https://` uniquement, vérifié aussi par la base) ;
- affiche un **solde**, un **objectif** et des **comptes transparents** (entrées et dépenses saisies
  par les organisateurs, sans nom de donateur) ;
- indique sur la page d'un événement ce qui a été **pris en charge par le pot**.

Le lien par défaut est le Revolut de l'organisateur (`potUrl` dans `js/config.js`). La page précise
que **les virements arrivent sur un compte personnel** et affiche l'engagement de l'organisateur à
n'utiliser l'argent que pour les événements ; le visiteur doit cocher une case avant d'ouvrir le lien.

### Tickets de caisse

Chaque dépense peut recevoir la **photo de son ticket** (Organiser → Pot commun, à l'ajout ou après coup).
Les tickets sont publiés dans la section « Tickets de caisse » du pot et sur la page de l'événement ;
les dépenses sans ticket sont signalées « ticket manquant ».
- Photos ré-encodées en JPEG avant l'envoi : **métadonnées supprimées** (position GPS, appareil…).
- Stockage Supabase `receipts` : lecture publique, envoi/suppression réservés aux organisateurs,
  3 Mo max, JPEG uniquement. Pense à masquer nom et numéro de carte avant de photographier.

## Inventaire

Onglet **Plus → Inventaire** : les objets présents dans les espaces communs, rangés par espace
(🧊 Frigo, 🗄️ Tiroir, 🍽️ Lave-vaisselle au départ). Tout le monde consulte et peut rechercher un objet ;
un organisateur connecté modifie directement sur la page : quantités avec − / +, ajout et retrait
d'objets, ajout et suppression d'espaces. Un objet à 0 apparaît « épuisé ».

## Infos (messages aux résidents)

Les organisateurs publient des messages depuis **Organiser → Infos** :
- **Permanent** : visible dans l'onglet Infos et en bandeau sur l'accueil ;
- **Pop-up** : s'ouvre à l'arrivée sur le site, une seule fois par appareil (bouton « J'ai compris »).

Chaque message peut être marqué important, traduit en anglais, programmé (date de début) et
limité dans le temps (date de fin). Le public ne voit que les messages en cours.

## Mode d'emploi

Onglet **Plus → Mode d'emploi** : les consignes pratiques de la résidence, sous forme d'articles.
Premier article : **« Chauffage au sol : le thermostat »** (réglage, positions de la molette, lecture de
l'écran, règle des 19 °C, délai de 48 h), avec deux schémas sans texte (`img/guide/`).

Les organisateurs gèrent les articles dans **Organiser → Mode d'emploi** : créer, modifier, monter /
descendre, masquer / publier, supprimer. Chaque article a un titre et un texte (FR + EN facultatif)
et jusqu'à 12 **photos avec légende**, envoyées depuis le téléphone (ré-encodées, métadonnées GPS
supprimées, stockage Supabase `guide`). Mise en forme simple : `## intertitre`, `- liste`,
`1. étape`, `**gras**`, `> encadré`, `[photo 1]` pour placer une photo ; bouton **Aperçu**.
Le texte est échappé avant mise en forme (pas d'injection de code possible).
Les langues autres que le français affichent la version anglaise de l'article.

## Rappels avant un événement

Sur chaque événement à venir : **Ajouter à mon agenda**, avec deux options.
- **Google Agenda** : un lien direct.
- **iPhone / Outlook** : un fichier `.ics` à l'heure de Paris, avec un rappel automatique 2 h avant.

Les organisateurs peuvent aussi envoyer une **notification** de rappel (voir plus bas).

## Galerie photos

Onglet **Galerie** : toutes les photos, classées par événement, avec un filtre par événement. Le formulaire « Ajouter des photos » permet de choisir l'**événement de rattachement**. Un résident ne peut choisir qu'un événement déjà commencé, et ses photos attendent une validation. Un organisateur connecté sur le même appareil peut choisir n'importe quel événement, et ses photos sont publiées tout de suite.

Une fois l'événement commencé, chacun peut ajouter ses photos sur la page de l'événement.
- Les photos sont ré-encodées en JPEG sur le téléphone, ce qui supprime les métadonnées GPS. Taille maximale : 3 Mo.
- Elles restent invisibles tant qu'un organisateur ne les a pas validées dans **Organiser → Photos**.
- L'organisateur peut aussi ajouter ses propres photos dans **Organiser → Photos → Ajouter des photos** : il choisit l'événement, et ses photos sont publiées tout de suite, même avant le début de l'événement.

## Petites annonces

Onglet **Annonces** : Je prête, Je donne, Je cherche, Un coup de main.
- Une annonce a un titre, des détails, un moyen de contact (l'avertissement « pas de téléphone ni d'appartement » est affiché), un prénom facultatif et une photo.
- Elle expire au bout de 30 jours.
- L'auteur peut la retirer depuis son appareil. L'organisateur peut retirer n'importe quelle annonce (**Organiser → Annonces**).

## Un problème dans le logement → support Colonies

Le site **n'est pas affilié à Colonies** et ne transmet rien. L'onglet **Plus → Signaler un problème** renvoie donc vers le support officiel :
- la messagerie de l'espace locataire ;
- support@livecolonies.com ;
- https://support.livecolonies.com/fr/

Le rappel « urgence = 112 » reste affiché. L'ancien formulaire est désactivé côté base. Les anciens signalements enregistrés sont effacés à la première purge (voir RGPD).

## Sondages rapides

Les organisateurs créent un sondage dans **Organiser → Sondages** :
- une question, de 2 à 8 réponses (une par ligne, `français | anglais`) et une date de fin facultative ;
- une seule voix par appareil, modifiable ;
- le sondage en cours s'affiche aussi sur l'accueil.

## Appli (Android et iPhone) et notifications

Le site s'installe comme une application : la page **Plus → Appli & notifications** donne les étapes pour iPhone (Safari) et pour Android (Chrome).
- Les notifications fonctionnent sur Android et ordinateur.
- Sur iPhone, il faut **iOS 16.4 ou plus**, avec l'appli installée sur l'écran d'accueil.
- Aucune donnée personnelle n'est stockée : seulement l'adresse technique d'envoi.

Mise en service, une seule fois :
1. Relancer `supabase.sql` dans Supabase → SQL Editor.
2. Aller dans **Organiser → Tableau de bord → Notifications** et cliquer **Générer les clés**. La clé publique est enregistrée automatiquement.
3. Dans Supabase → Edge Functions → Secrets, ajouter :
   - `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` (les valeurs affichées à l'étape 2) ;
   - `VAPID_SUBJECT` = `mailto:` suivi de votre adresse.
4. Toujours dans Edge Functions, créer la fonction **`notify`** et y coller `supabase/functions/notify/index.ts`, puis la déployer.

Ensuite, le **Tableau de bord** permet d'envoyer une notification (titre, texte, page à ouvrir) à tous les abonnés.

## Tableau de bord organisateur

**Organiser** ouvre un tableau de bord qui regroupe :
- les chiffres clés : événements à venir, réponses, solde du pot, abonnés aux notifications ;
- une liste « À traiter » : photos à valider, nouvelles idées, dépenses sans ticket ;
- les prochains événements, avec la part des besoins couverts ;
- la participation par événement (graphique et tableau) ;
- les idées les plus aimées, le pot, les articles en rupture, les sondages ouverts ;
- l'envoi de notifications.

## Confidentialité, RGPD et mentions légales

- La page **#/legal** (« Confidentialité & mentions légales », lien en bas de chaque page) contient :
  - les mentions légales (LCEN) ;
  - le responsable du traitement ;
  - pour chaque donnée : la finalité, la base légale et la durée de conservation ;
  - le stockage sur l'appareil, les destinataires et les transferts hors UE ;
  - les droits RGPD, la CNIL et les règles de publication.
- Elle existe en français (texte de référence) et en anglais (toutes les autres langues).
- Dans `js/config.js`, renseigner :
  - `publisherName` (nom de l'éditeur) ;
  - `contactEmail` (adresse pour exercer ses droits).

  Sans eux, la page affiche « Un résident » et le contact Instagram.
- **Mention « non affilié à Colonies »** en bas de chaque page, sur la page légale et sur la page support.
- **Aucun prénom n'est affiché publiquement**. Le public voit « Un·e voisin·e » ; seuls les organisateurs voient les prénoms (la base l'impose aussi).
- **Pas de numéro de chambre, pas de compte, aucun cookie, aucun appel à Google** : les polices sont hébergées dans `fonts/`.
- **Alerte avant publication** : un texte qui ressemble à un numéro de chambre, un code, un mot de passe Wi-Fi, un téléphone ou un e-mail déclenche une confirmation. Cela vaut pour les réponses, les idées, les annonces et les légendes de photos. L'espace Organiser affiche le même rappel.
- **Droit à l'effacement en libre-service** : bouton « Supprimer ma réponse » sur la page de l'événement.
- **Durées de conservation** : la fonction `admin_purge`, lancée une fois par jour à l'ouverture du tableau de bord organisateur, efface :
  - les réponses, 6 mois après l'événement ;
  - les idées, après 12 mois ;
  - les votes de sondage, 12 mois après la fin du sondage ;
  - les annonces, 30 jours après leur expiration ;
  - les anciens signalements.
- Le message et les réponses aux questions ne sont visibles **que par les organisateurs**. Le public ne reçoit qu'un résumé.

## Anti-doublons et anti-triche

- Chaque appareil reçoit un identifiant secret aléatoire (stocké dans le navigateur, seule son
  empreinte SHA-256 est enregistrée). **Une réponse par appareil et par événement** : si la personne
  revient, le site affiche « Tu as déjà répondu » et propose de **modifier** sa réponse.
- On répond avec son **prénom** (champ libre, sans format imposé).
- **Un même prénom ne peut répondre qu'une fois par événement** (insensible aux accents, majuscules
  et ponctuation : « Marc » et « marc. » sont identiques). Le second « Marc » est invité à ajouter
  l'initiale de son nom (« Marc D. »).
- Côté organisateurs, seuls les cas douteux sont signalés (« Marc D. » / « Marc Du. ») ; deux homonymes
  bien distingués ne déclenchent pas d'alerte.
- Vérifié **côté serveur** (contraintes `UNIQUE` + fonction `submit_response`) : impossible de
  contourner en appelant l'API directement.
- Limite de 15 réponses / 10 min par connexion, champ piège anti-robots, délai minimum de saisie.
- Dans l'espace organisateur : prénoms proches signalés, suppression d'une réponse, masquage d'un prénom.

Limite connue : sans identification des résidents, une personne déterminée peut encore répondre
depuis un autre appareil / navigateur **avec un autre prénom**. Les organisateurs peuvent alors
supprimer la réponse. Pour aller plus loin : un code d'accès par événement, ou une connexion des
résidents par lien email.

## Sécurité côté serveur (`supabase.sql`)

- RLS activé partout. Événements : lecture publique, écriture réservée aux organisateurs (`admins`).
- Réponses : aucun accès direct pour le public ; uniquement via des fonctions contrôlées
  (`public_event_stats`, `my_response`, `submit_response`).
- `submit_response` valide tout : événement existant et non terminé (heure de Paris), longueurs,
  statut, invités autorisés, objets appartenant à l'événement, quantités, questions, places max.
- Organisateurs : vrais comptes Supabase Auth (email + mot de passe), jeton de session court
  renouvelé automatiquement, déconnexion côté serveur.

## Sécurité côté site

- Politique de sécurité du contenu (CSP) stricte : scripts du site uniquement, connexions limitées à
  `*.supabase.co`, pas de formulaire ni d'objet externe.
- Tout le contenu affiché est échappé (protection XSS), export CSV protégé contre l'injection de formules.
- Connexion organisateur : délai croissant après chaque échec.
