// GET /api/results?event=xxx[&format=csv]  – staff only (Authorization: Bearer <ADMIN_TOKEN>)

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const ax = new Uint8Array(x), ay = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < ax.length; i++) d |= ax[i] ^ ay[i];
  return d === 0;
}

export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN is not set" }, 500);
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !(await safeEqual(token, env.ADMIN_TOKEN))) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const event = url.searchParams.get("event");
  const where = event ? "WHERE event = ?" : "";
  const binds = event ? [event] : [];

  const { results: rows } = await env.DB.prepare(
    `SELECT id, created_at, event, grade, fun, difficulty, understand, liked, distance, again, next_idea, comment
     FROM survey ${where} ORDER BY id DESC LIMIT 5000`
  ).bind(...binds).all();

  if (url.searchParams.get("format") === "csv") {
    const head = ["id", "created_at(UTC)", "event", "grade", "fun", "difficulty", "understand", "liked", "distance_cm", "again", "next_idea", "comment"];
    const esc = v => {
      let s = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // avoid spreadsheet formula injection
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head.join(",")].concat(rows.map(r => [r.id, r.created_at, r.event, r.grade, r.fun, r.difficulty, r.understand, r.liked, r.distance, r.again, r.next_idea, r.comment].map(esc).join(",")));
    return new Response("﻿" + lines.join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="survey${event ? "-" + event.replace(/[^\w-]/g, "") : ""}.csv"`, "Cache-Control": "no-store" },
    });
  }

  const { results: events } = await env.DB.prepare(
    "SELECT event, COUNT(*) AS n FROM survey GROUP BY event ORDER BY MAX(id) DESC"
  ).all();

  return json({ rows, events });
}

export const onRequest = () => json({ error: "method not allowed" }, 405);
