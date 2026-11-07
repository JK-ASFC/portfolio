/*
 * Configuration du site LEONE
 * ---------------------------------------------------------------
 * MODE DÉMO (valeurs vides) : tout est stocké dans le navigateur,
 * personne d'autre ne voit les réponses. Pratique pour tester.
 *
 * MODE PARTAGÉ : crée un projet gratuit sur https://supabase.com,
 * exécute supabase.sql, puis renseigne les deux valeurs ci-dessous
 * (Project Settings > API). La clé "anon" est publique par nature :
 * la sécurité est assurée côté base (RLS + fonctions contrôlées).
 * Les organisateurs se connectent alors avec leur compte Supabase
 * (email + mot de passe), voir README.
 */
window.LEONE_CONFIG = {
  supabaseUrl: "",      // ex : "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",  // ex : "eyJhbGciOi..."

  // Code de l'espace organisateur EN MODE DÉMO UNIQUEMENT.
  // Ignoré dès que Supabase est configuré (vrai compte obligatoire).
  demoPin: "leone2026"
};
