import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const auth = request.headers.get("Authorization") || "", token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sessão não autorizada." }, 401);
    const url = Deno.env.get("SUPABASE_URL"), publishable = Deno.env.get("CERTIFICATES_PUBLISHABLE_KEY"), secret = Deno.env.get("CERTIFICATES_DB_KEY");
    if (!url || !publishable || !secret) return json({ error: "Serviço indisponível." }, 503);
    const userClient = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: "Bearer " + token } } });
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userData.user) return json({ error: "Sessão expirada ou inválida." }, 401);
    const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: admin, error: adminError } = await db.from("issuance_admins").select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (adminError || !admin) return json({ error: "Esta conta não pode emitir certificados." }, 403);
    const body = await request.json();

    if (body.action === "issue") {
      if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > 100) return json({ error: "O lote deve ter de 1 a 100 registros." }, 400);
      const valid = body.records.every((item: Record<string, unknown>) =>
        typeof item.code_hash === "string" && /^[0-9a-f]{64}$/.test(item.code_hash) &&
        typeof item.course_title === "string" && item.course_title.trim().length > 0 && item.course_title.length <= 120 &&
        Number.isInteger(item.workload_hours) && Number(item.workload_hours) >= 1 && Number(item.workload_hours) <= 1000 &&
        typeof item.issued_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.issued_on));
      if (!valid) return json({ error: "Dados do lote inválidos." }, 400);
      const rows = body.records.map((item: Record<string, unknown>) => ({ code_hash: item.code_hash, course_title: String(item.course_title).trim(), workload_hours: item.workload_hours, issued_on: item.issued_on }));
      const { data, error } = await db.from("certificates").insert(rows).select("id");
      if (error) {
        if (error.code === "23505") return json({ error: "Código duplicado. Gere o lote novamente." }, 409);
        throw error;
      }
      return json({ records: data });
    }
    if (body.action === "list") {
      const { data, error } = await db.from("certificates").select("id,code_hash,course_title,workload_hours,issued_on,status").order("created_at", { ascending: false }).limit(250);
      if (error) throw error;
      return json({ records: data });
    }
    if (body.action === "revoke") {
      if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return json({ error: "Registro inválido." }, 400);
      const { data, error } = await db.from("certificates").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", body.id).eq("status", "valid").select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Registro não encontrado ou já revogado." }, 404);
      return json({ revoked: true });
    }
    return json({ error: "Operação desconhecida." }, 400);
  } catch { return json({ error: "Não foi possível concluir a operação." }, 500); }
});
