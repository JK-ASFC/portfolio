/*
 * Configuration du site LEONE
 * ---------------------------------------------------------------
 * Sans Supabase, le site tourne en "mode démo" : tout est stocké
 * dans le navigateur (localStorage) et personne d'autre ne voit
 * les réponses. Pour que toute la résidence partage les mêmes
 * données, crée un projet gratuit sur https://supabase.com, exécute
 * le fichier supabase.sql, puis renseigne les deux valeurs ci-dessous
 * (Project Settings > API).
 *
 * La clé "anon" est publique par nature : elle peut être commitée.
 */
window.LEONE_CONFIG = {
  supabaseUrl: "",      // ex : "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",  // ex : "eyJhbGciOi..."

  // Code d'accès à l'onglet "Organiser".
  // ⚠ Simple verrou côté navigateur, pas une vraie sécurité
  // (on travaillera la modération / l'authentification plus tard).
  adminPin: "leone2026",

  residenceName: "LEONE"
};
