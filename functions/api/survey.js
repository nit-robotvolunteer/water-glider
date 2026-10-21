// POST /api/survey  – save one anonymous survey answer into D1 (binding: DB)

const GRADES = ["小1-2", "小3-4", "小5-6", "中学生", "保護者", "その他"];
const DIFF = ["easy", "just", "hard"];
const AGAIN = ["yes", "maybe", "no"];
const LIKED = ["story", "build", "swim", "race"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

const clip = (s, n) => (typeof s === "string" ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n) : "");
const intIn = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "DB binding is missing" }, 500);

  // reject cross-site posts
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: "bad origin" }, 403);

  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > 8000) return json({ error: "too large" }, 413);

  let b;
  try { b = await request.json(); } catch { return json({ error: "invalid json" }, 400); }

  // honeypot: bots fill hidden "website" field – pretend success
  if (b.website) return json({ ok: true });

  const grade = GRADES.includes(b.grade) ? b.grade : null;
  const fun = intIn(b.fun, 1, 5);
  if (!grade || !fun) return json({ error: "grade and fun are required" }, 400);

  const row = {
    event: clip(b.event, 40),
    grade,
    fun,
    difficulty: DIFF.includes(b.difficulty) ? b.difficulty : null,
    understand: intIn(b.understand, 1, 3),
    liked: Array.isArray(b.liked) ? b.liked.filter(x => LIKED.includes(x)).join(",") : "",
    distance: typeof b.distance === "number" && b.distance >= 0 && b.distance <= 10000 ? Math.round(b.distance) : null,
    again: AGAIN.includes(b.again) ? b.again : null,
    next: clip(b.next, 100),
    comment: clip(b.comment, 500),
  };

  // light rate limit: max 20 answers per minute per IP (IP itself is never stored, only a salted hash)
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const salt = env.IP_SALT || "glider";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ip));
  const ipHash = [...new Uint8Array(digest)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM survey WHERE ip_hash = ? AND created_at > datetime('now','-1 minute')"
  ).bind(ipHash).first();
  if (recent && recent.n >= 20) return json({ error: "too many" }, 429);

  await env.DB.prepare(
    `INSERT INTO survey (event, grade, fun, difficulty, understand, liked, distance, again, next_idea, comment, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(row.event, row.grade, row.fun, row.difficulty, row.understand, row.liked, row.distance,
         row.again, row.next, row.comment, ipHash).run();

  return json({ ok: true });
}

export const onRequest = () => json({ error: "method not allowed" }, 405);
