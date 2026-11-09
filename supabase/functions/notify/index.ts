// Fonction Supabase « notify » : envoie une notification aux résidents abonnés (appli installée).
// Appelée depuis Organiser → Tableau de bord. Réservée aux organisateurs (vérifié avec is_admin()).
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (générées dans Organiser → Tableau de bord → Notifications)
//   VAPID_SUBJECT                         (ex : mailto:ton-adresse@exemple.fr)
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "METHOD" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:leone@example.org";
  if (!pub || !priv) return json(500, { error: "VAPID_MISSING" });

  // 1. l'appelant doit être organisateur
  const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin");
  if (adminErr || isAdmin !== true) return json(403, { error: "AUTH" });

  // 2. contenu (FR + EN facultatif), lien interne au site uniquement
  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json(400, { error: "INVALID" }); }
  const title = clip(input.title, 80), body = clip(input.body, 240);
  const titleEn = clip(input.title_en, 80) || title, bodyEn = clip(input.body_en, 240) || body;
  const link = /^#\/[A-Za-z0-9/_-]{0,80}$/.test(String(input.url ?? "")) ? String(input.url) : "#/";
  if (!title) return json(400, { error: "INVALID" });

  // 3. envoi à tous les abonnés ; les abonnements expirés sont supprimés
  webpush.setVapidDetails(subject, pub, priv);
  const admin = createClient(url, service);
  const { data: subs, error } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth, lang");
  if (error) return json(500, { error: "DB" });

  let sent = 0, removed = 0, failed = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    const fr = String(s.lang).startsWith("fr");
    const payload = JSON.stringify({ title: fr ? title : titleEn, body: fr ? body : bodyEn, url: link });
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint); removed++; }
      else failed++;
    }
  }));
  return json(200, { sent, removed, failed, total: subs?.length ?? 0 });
});
