# LEONE — les événements de la résidence

Site statique (HTML/CSS/JS, sans build) qui répertorie les événements de la résidence LEONE.
Les résidents consultent les événements, répondent via un formulaire et indiquent ce qu'ils ramènent.
Les organisateurs créent/modifient les événements depuis l'onglet **Organiser**.

## Bilingue FR / EN

- Bouton **FR | EN** dans l'en-tête ; la langue est détectée automatiquement (navigateur) puis mémorisée.
- Toute l'interface est traduite (`js/i18n.js`).
- Le contenu des événements a une **version anglaise optionnelle** dans l'éditeur (titre, catégorie,
  lieu, description, objets à ramener, questions). Si un champ anglais est vide, le texte français s'affiche.

## Structure

```
index.html        pages : Accueil, Événements, La Résidence, Comment ça marche, Organiser
css/style.css     style rétro-futuriste + animations
js/i18n.js        traductions FR / EN de l'interface
js/config.js      configuration (Supabase, code organisateur)
js/store.js       données (Supabase ou mode démo localStorage) + événement d'exemple
js/app.js         routeur, rendu, formulaire de réponse, espace organisateur
supabase.sql      schéma de la base partagée + exemple « Match de l'Équipe de France »
```

## Mise en ligne sur GitHub Pages

1. Fusionner sur `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**,
   branche `main`, dossier `/ (root)`.
3. Le site est publié sur `https://<utilisateur>.github.io/portfolio/`.

## Partager les réponses entre tous les résidents (Supabase, gratuit)

GitHub Pages n'héberge que des fichiers statiques : sans base de données, chaque visiteur
ne voit que ses propres données (**mode démo**, bandeau jaune en bas de page).

1. Créer un projet sur <https://supabase.com>.
2. **SQL Editor** → coller le contenu de `supabase.sql` → **Run**.
3. **Project Settings → API** : copier `Project URL` et la clé `anon public` dans `js/config.js`.
4. Commit + push : le bandeau démo disparaît, tout le monde partage les mêmes données.

## Espace organisateur

Onglet **Organiser**, code défini dans `js/config.js` (`adminPin`, par défaut `leone2026`).
Pour chaque événement : titre, emoji, date, lieu, places max, invités autorisés, couleur,
**liste de ce qu'on peut ramener** (avec quantités) et **questions personnalisées**.
Vue des réponses avec récap des apports, suppression et export CSV.

> ⚠ Le code organisateur est un simple verrou côté navigateur. La vraie modération /
> authentification est prévue pour une prochaine étape.
