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
  supabaseUrl: "https://dmcqeivddhosfzuttgzb.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtY3FlaXZkZGhvc2Z6dXR0Z3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNjgxODAsImV4cCI6MjEwOTY0NDE4MH0.OtasSnLUCjHxiW8u8VpEASfc35r8xIvHnCGcphkdc7o",

  // Code de l'espace organisateur EN MODE DÉMO UNIQUEMENT.
  // Ignoré dès que Supabase est configuré (vrai compte obligatoire).
  demoPin: "leone2026"
};
