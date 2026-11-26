// 에이전트빌리지 일촌 우편함 — 클라우드플레어 워커 + R2 (바인딩 이름 BOX). 2026-11-26.
// 서버는 잠긴 상자만 보관한다: 편지·홈피·게시판 내용은 두 맥이 나눠 가진 열쇠로 암호화돼 온다.
//   POST /v1/register            {code, keyhash}             내 일촌 코드 등록 (처음 한 번)
//   POST /v1/inbox/<code>        {kind:"req"|"ans", body}    남의 우편함에 신청·답장 넣기 (X-Code·X-Key 로 내 코드 인증, 8KB 까지)
//                                                            보낸 코드는 서버가 적는다(from) — 남의 코드로 신청한 척 못 하게
//   GET  /v1/inbox               (X-Code, X-Key)             내 우편함 보기
//   DELETE /v1/inbox/<id>        (X-Code, X-Key)
//   PUT  /v1/pair/<pair>         {keyhash}                    둘만의 상자 만들기 (X-Code·X-Key 인증, 처음 만든 열쇠만 통과)
//   (매일 한 번) scheduled                                    90일 안 쓴 상자·7일 지난 편지·지난 계수기 치우기, 전체 용량 다시 세기
//   GET  /v1/pair/<pair>/list    (X-Pair-Key)
//   GET|PUT|DELETE /v1/pair/<pair>/o/<path>  (X-Pair-Key)    물건 하나 (2MB 까지)
const CODE = /^VLG-[A-Z2-9]{6}$/, PAIR = /^[0-9a-f]{40}$/, PATH = /^[\w\-.\/]{1,200}$/;
const MAX_MSG = 8000, MAX_OBJ = 2_000_000;
// 도배·요금 폭탄 막기 (11-26 보안 검수 5번)
const INBOX_MAX = 50, INBOX_PER_IP = 3, INBOX_TTL = 7 * 86400_000;   // 우편함: 코드당 50통, 한 곳(IP)에서 3통, 7일 뒤 버림
const PAIR_MAX_N = 2000, PAIR_MAX_BYTES = 100_000_000;              // 둘만의 상자: 2000개·100MB 까지
const TOTAL_MAX_BYTES = 9_000_000_000;                              // 우편함 서버 전체 9GB — R2 무료 한도(10GB) 안에서만 (요금 0원 유지)
// 11-26 3차 검수: 전체 상한을 한 사람이 다 써서 「모두를 끄는 단추」가 되지 않게, 한 곳·한 코드 몫을 따로 둔다
const DAY_NEW_CODES = 20000, DAY_NEW_CODES_PER_IP = 5;              // 새 코드: 전체 하루 2만, 한 곳(IPv6 는 /64)에서 하루 5개
const CODE_MAX_PAIRS = 30, DAY_NEW_PAIRS_PER_CODE = 10;              // 코드 하나가 만들 수 있는 상자 30개, 하루 10개
const SEND_PER_DAY = 30, SEND_PER_TARGET_DAY = 3;                     // 코드 하나가 하루에 보내는 신청·답장 30통, 같은 곳에 3통
const PAIR_IDLE_DAYS = 90;                                           // 90일 아무도 안 쓴 상자는 치운다
async function stat(env, k, add) {
  // 대충 세는 계수기(R2 한 칸). 동시에 쓰면 조금 틀려도 상한 구실은 한다
  const o = await getJ(env, `stats/${k}.json`) || { n: 0 };
  if (add) { o.n += add; await env.BOX.put(`stats/${k}.json`, JSON.stringify(o)); }
  return o.n;
}
const today = () => new Date().toISOString().slice(0, 10);
function where(req) {
  // 보낸 곳. IPv6 는 한 집이 주소를 수없이 바꿀 수 있어 앞 64비트(/64)로 묶는다
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  if (!ip.includes(":")) return ip;
  const h = ip.split("::")[0].split(":");
  return h.slice(0, 4).join(":") + "::/64";
}
async function limited(env, req, kind) {
  // 클라우드플레어 횟수 제한(wrangler.toml 의 LIMIT). 읽기(GET)도 센다. 없으면 통과 — 그래도 아래 상한은 걸린다
  if (!env.LIMIT) return false;
  const { success } = await env.LIMIT.limit({ key: kind + ":" + where(req) });
  return !success;
}
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8" } });
async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
async function getJ(env, k) { const o = await env.BOX.get(k); return o ? await o.json() : null; }
async function codeOk(env, req) {
  const c = req.headers.get("X-Code") || "", k = req.headers.get("X-Key") || "";
  if (!CODE.test(c)) return null;
  const r = await getJ(env, `codes/${c}.json`);
  return r && r.keyhash === await sha(k) ? c : null;
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url), seg = u.pathname.split("/").filter(Boolean), m = req.method;
    if (seg[0] !== "v1") return j({ ok: true, name: "agent-village relay" });
    try {
      if (await limited(env, req, (seg[1] || "") + ":" + m)) return j({ error: "too many" }, 429);
      if (seg[1] === "register" && m === "POST") {
        const b = await req.json();
        if (!CODE.test(b.code || "") || !/^[0-9a-f]{64}$/.test(b.keyhash || "")) return j({ error: "bad" }, 400);
        const cur = await getJ(env, `codes/${b.code}.json`);
        if (cur && cur.keyhash !== b.keyhash) return j({ error: "taken" }, 409);
        if (!cur) {
          const ipk = (await sha("ip:" + where(req))).slice(0, 12);
          if (await stat(env, `d/${today()}/code-ip-${ipk}`, 0) >= DAY_NEW_CODES_PER_IP) return j({ error: "too many" }, 429);
          if (await stat(env, `d/${today()}/codes`, 0) >= DAY_NEW_CODES) return j({ error: "busy" }, 429);
          await env.BOX.put(`codes/${b.code}.json`, JSON.stringify({ keyhash: b.keyhash, at: Date.now(), pairs: 0 }));
          await stat(env, `d/${today()}/code-ip-${ipk}`, 1);
          await stat(env, `d/${today()}/codes`, 1);
        }
        return j({ ok: true });
      }
      if (seg[1] === "inbox") {
        if (m === "POST" && seg[2]) {
          const from = await codeOk(env, req);           // 보내는 사람도 등록된 코드여야 한다
          if (!from) return j({ error: "auth" }, 401);
          const t = await req.text();
          if (t.length > MAX_MSG) return j({ error: "too big" }, 413);
          const b = JSON.parse(t);
          // body 는 반드시 객체 — 이상한 편지 한 통으로 받는 마을이 멈추지 않게
          if (!["req", "ans"].includes(b.kind) || !b.body || typeof b.body !== "object" || Array.isArray(b.body)) return j({ error: "bad" }, 400);
          const key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${from}`;
          // 보내는 몫은 받는 코드가 있든 없든 똑같이 센다 — 그래야 응답 차이로 살아 있는 코드를 알아내지 못한다
          const tgt = CODE.test(seg[2]) ? seg[2] : "x";
          if (await stat(env, `d/${today()}/send-${from}`, 0) >= SEND_PER_DAY) return j({ error: "too many" }, 429);
          if (await stat(env, `d/${today()}/send-${from}-${tgt}`, 0) >= SEND_PER_TARGET_DAY) return j({ error: "too many" }, 429);
          await stat(env, `d/${today()}/send-${from}`, 1);
          await stat(env, `d/${today()}/send-${from}-${tgt}`, 1);
          // 없는 코드여도 똑같은 모양으로 「ok」 — 살아 있는 코드를 찔러 찾아내지 못하게
          if (tgt === "x" || !(await env.BOX.head(`codes/${tgt}.json`))) return j({ ok: true, id: key });
          const l = await env.BOX.list({ prefix: `inbox/${tgt}/`, limit: 1000 });
          const live = l.objects.filter(o => Date.now() - Number(o.key.split("/").pop().split("-")[0]) < INBOX_TTL);
          if (live.filter(o => o.key.endsWith(`-${from}.json`)).length >= INBOX_PER_IP) return j({ ok: true, id: key });   // 같은 사람이 3통 넘게 쌓지 못함 (조용히 버림)
          if (live.length >= INBOX_MAX) {
            // 가득 차면 가장 오래된 것을 밀어낸다 — 누가 채워 둬도 7일 동안 막히지 않고 새 신청이 들어온다
            live.sort((a, b2) => a.key < b2.key ? -1 : 1);
            for (const o of live.slice(0, live.length - INBOX_MAX + 1)) await env.BOX.delete(o.key);
          }
          await env.BOX.put(`inbox/${tgt}/${key}.json`, JSON.stringify({ id: key, kind: b.kind, body: b.body || {}, from, at: Date.now() }));
          return j({ ok: true, id: key });
        }
        const me = await codeOk(env, req);
        if (!me) return j({ error: "auth" }, 401);
        if (m === "GET") {
          const l = await env.BOX.list({ prefix: `inbox/${me}/`, limit: 1000 });
          const out = [];
          for (const o of l.objects) {
            if (Date.now() - Number(o.key.split("/").pop().split("-")[0]) >= INBOX_TTL) { await env.BOX.delete(o.key); continue; }   // 7일 지난 건 버림
            const v = await getJ(env, o.key); if (v) out.push(v);
          }
          return j({ items: out });
        }
        if (m === "DELETE" && /^[\w\-]{1,60}$/.test(seg[2] || "")) { await env.BOX.delete(`inbox/${me}/${seg[2]}.json`); return j({ ok: true }); }
      }
      if (seg[1] === "pair" && PAIR.test(seg[2] || "")) {
        const p = seg[2];
        if (seg.length === 3 && m === "PUT") {
          const b = await req.json();
          if (!/^[0-9a-f]{64}$/.test(b.keyhash || "")) return j({ error: "bad" }, 400);
          const cur = await getJ(env, `pairs/${p}.json`);
          if (cur && cur.keyhash !== b.keyhash) return j({ error: "taken" }, 409);
          if (!cur) {
            // 새 상자는 등록된 코드만, 코드 하나당 개수·하루 개수 제한 (아무나 상자를 만들어 전체 용량을 채우지 못하게)
            const owner = await codeOk(env, req);
            if (!owner) return j({ error: "auth" }, 401);
            const oc = await getJ(env, `codes/${owner}.json`);
            if ((oc.pairs || 0) >= CODE_MAX_PAIRS) return j({ error: "too many boxes" }, 429);
            if (await stat(env, `d/${today()}/pairs-${owner}`, 0) >= DAY_NEW_PAIRS_PER_CODE) return j({ error: "too many" }, 429);
            await env.BOX.put(`pairs/${p}.json`, JSON.stringify({ keyhash: b.keyhash, at: Date.now(), last: Date.now(), owner }));
            oc.pairs = (oc.pairs || 0) + 1;
            await env.BOX.put(`codes/${owner}.json`, JSON.stringify(oc));
            await stat(env, `d/${today()}/pairs-${owner}`, 1);
          }
          return j({ ok: true });
        }
        const pm = await getJ(env, `pairs/${p}.json`);
        if (!pm || pm.keyhash !== await sha(req.headers.get("X-Pair-Key") || "")) return j({ error: "auth" }, 401);
        if (Date.now() - (pm.last || pm.at || 0) > 86400_000) {      // 하루 한 번만 「쓴 날」을 적는다 (오래 안 쓴 상자 치우기용)
          pm.last = Date.now();
          await env.BOX.put(`pairs/${p}.json`, JSON.stringify(pm));
        }
        if (seg[3] === "list" && m === "GET") {
          const out = []; let cur;
          do {
            const l = await env.BOX.list({ prefix: `pair/${p}/`, cursor: cur, limit: 1000 });
            for (const o of l.objects) out.push({ path: o.key.slice(`pair/${p}/`.length), etag: o.etag, size: o.size });
            cur = l.truncated ? l.cursor : null;
          } while (cur);
          return j({ items: out });
        }
        if (seg[3] === "o") {
          const path = seg.slice(4).join("/");
          if (!PATH.test(path) || path.includes("..")) return j({ error: "bad path" }, 400);
          const key = `pair/${p}/${path}`;
          if (m === "GET") { const o = await env.BOX.get(key); return o ? new Response(o.body, { headers: { etag: o.etag } }) : j({ error: "none" }, 404); }
          if (m === "PUT") {
            const b = await req.arrayBuffer();
            if (b.byteLength > MAX_OBJ) return j({ error: "too big" }, 413);
            let n = 0, bytes = 0, c2;
            do {
              const l = await env.BOX.list({ prefix: `pair/${p}/`, cursor: c2, limit: 1000 });
              for (const o of l.objects) if (o.key !== key) { n++; bytes += o.size; }
              c2 = l.truncated ? l.cursor : null;
            } while (c2);
            if (n >= PAIR_MAX_N || bytes + b.byteLength > PAIR_MAX_BYTES) return j({ error: "box full" }, 413);
            if (await stat(env, "bytes", 0) + b.byteLength > TOTAL_MAX_BYTES) return j({ error: "relay full" }, 507);
            const prev = await env.BOX.head(key);
            await stat(env, "bytes", b.byteLength - (prev ? prev.size : 0));
            const o = await env.BOX.put(key, b);
            return j({ ok: true, etag: o.etag });
          }
          if (m === "DELETE") { const prev = await env.BOX.head(key); await env.BOX.delete(key); if (prev) await stat(env, "bytes", -prev.size); return j({ ok: true }); }
        }
      }
      return j({ error: "not found" }, 404);
    } catch (e) { return j({ error: String(e).slice(0, 200) }, 500); }
  },
  // 매일 한 번 (wrangler.toml 의 [triggers] crons): 치우기 + 전체 용량을 실제로 다시 센다 (계수기 어긋남 바로잡기)
  async scheduled(ev, env) {
    const now = Date.now(), keepDay = new Date(now - 2 * 86400_000).toISOString().slice(0, 10);
    const each = async (prefix, fn) => { let c; do { const l = await env.BOX.list({ prefix, cursor: c, limit: 1000 }); for (const o of l.objects) await fn(o); c = l.truncated ? l.cursor : null; } while (c); };
    await each("stats/d/", async o => { if (o.key.slice(8, 18) < keepDay) await env.BOX.delete(o.key); });
    await each("inbox/", async o => { if (now - Number(o.key.split("/").pop().split("-")[0]) >= INBOX_TTL) await env.BOX.delete(o.key); });
    await each("pairs/", async o => {
      const pm = await getJ(env, o.key);
      if (!pm || now - (pm.last || pm.at || 0) < PAIR_IDLE_DAYS * 86400_000) return;
      const p = o.key.slice(6, -5);
      await each(`pair/${p}/`, async x => env.BOX.delete(x.key));
      await env.BOX.delete(o.key);
      if (pm.owner) { const oc = await getJ(env, `codes/${pm.owner}.json`); if (oc) { oc.pairs = Math.max(0, (oc.pairs || 1) - 1); await env.BOX.put(`codes/${pm.owner}.json`, JSON.stringify(oc)); } }
    });
    let total = 0;
    await each("pair/", async o => { total += o.size; });
    await env.BOX.put("stats/bytes.json", JSON.stringify({ n: total }));
  },
};
