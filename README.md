# LEONE — les événements de la résidence

Site statique (HTML/CSS/JS, sans build), bilingue FR / EN, hébergé sur GitHub Pages.
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

## Mise en ligne (GitHub Pages)

1. Fusionner sur `main`.
2. **Settings → Pages → Deploy from a branch** → `main` / `(root)`.
3. Site publié sur `https://<utilisateur>.github.io/portfolio/`.

Sans Supabase, le site tourne en **mode démo** : chaque navigateur a ses propres données.

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

Onglet **Proposer** : les résidents envoient une idée (titre, détails, quand, ce qu'il faudrait,
prénom facultatif). Les propositions ne sont visibles **que par les organisateurs** (Organiser →
Propositions), qui peuvent les refuser, les supprimer ou cliquer sur **Créer l'événement** : l'éditeur
s'ouvre pré-rempli. Limite : 3 propositions / 24 h par appareil, 10 / heure par connexion.

## Pot commun

Le site **n'encaisse aucun argent** et ne stocke aucune donnée bancaire. Il :
- renvoie vers une page de paiement externe (HelloAsso, Lydia, Leetchi…) réglée dans
  Organiser → Pot commun (lien `https://` uniquement, vérifié aussi par la base) ;
- affiche un **solde**, un **objectif** et des **comptes transparents** (entrées et dépenses saisies
  par les organisateurs, sans nom de donateur) ;
- indique sur la page d'un événement ce qui a été **pris en charge par le pot**.

## Confidentialité

- Pas de compte pour répondre, **pas de numéro d'appartement**.
- Le prénom n'apparaît dans « Qui vient » **que si la personne coche la case** (sinon « Un·e voisin·e »).
- Le message et les réponses aux questions ne sont visibles **que par les organisateurs**.
- Les réponses brutes ne sont pas lisibles publiquement : le public ne reçoit qu'un résumé.

## Anti-doublons et anti-triche

- Chaque appareil reçoit un identifiant secret aléatoire (stocké dans le navigateur, seule son
  empreinte SHA-256 est enregistrée). **Une réponse par appareil et par événement** : si la personne
  revient, le site affiche « Tu as déjà répondu » et propose de **modifier** sa réponse.
- **Un même prénom ne peut répondre qu'une fois par événement** (insensible aux accents, majuscules
  et ponctuation : « Kevin », « KÉVIN » et « kevin. » sont identiques).
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
