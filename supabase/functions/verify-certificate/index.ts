import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), item => item.toString(16).padStart(2, "0")).join("");
};
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const body = await request.json();
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!/^TP-[A-F0-9]{32}$/.test(code)) return json({ found: false, valid: false });
    const url = Deno.env.get("SUPABASE_URL"), secret = Deno.env.get("CERTIFICATES_DB_KEY");
    if (!url || !secret) return json({ error: "Serviço indisponível." }, 503);
    const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.from("certificates").select("course_title,workload_hours,issued_on,status").eq("code_hash", await digest(code)).maybeSingle();
    if (error) throw error;
    if (!data) return json({ found: false, valid: false });
    if (data.status === "revoked") return json({ found: true, valid: false, revoked: true });
    return json({ found: true, valid: true, certificate: { course_title: data.course_title, workload_hours: data.workload_hours, issued_on: data.issued_on } });
  } catch { return json({ error: "Não foi possível consultar agora." }, 500); }
});
