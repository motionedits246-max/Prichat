import {
  digest,
  random,
  loginProof,
  verifyText,
  personCode,
} from "./public/crypto.js";

const SECOND = 1000,
  MINUTE = 60 * SECOND,
  HOUR = 60 * MINUTE;
const LEASE = 90 * SECOND,
  MAX_ROOM = 8;
const idPattern = /^[A-Za-z0-9_-]{22}$/;
const personPattern = /^PC-(?:[0-9A-F]{4}-){5}[0-9A-F]{4}$/;
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function requireThat(condition, status, message) {
  if (!condition) throw new ApiError(status, message);
}
const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const changes = (result) => result.meta.changes;
async function readBody(req, maxBytes) {
  requireThat(
    req.headers.get("Content-Type")?.split(";")[0] === "application/json",
    415,
    "JSON required.",
  );
  const reader = req.body?.getReader();
  requireThat(reader, 400, "Missing request.");
  const decoder = new TextDecoder();
  let size = 0,
    raw = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, "Request too large.");
    }
    raw += decoder.decode(value, { stream: true });
  }
  try {
    const obj = JSON.parse(raw + decoder.decode());
    if (!obj || Array.isArray(obj) || typeof obj !== "object") throw Error();
    return obj;
  } catch {
    throw new ApiError(400, "Invalid request.");
  }
}
const select = (db, sql, ...args) => db.prepare(sql).bind(...args);
const all = async (s) => (await s.all()).results;
export async function sweep(db, now = Date.now()) {
  await db.batch([
    select(
      db,
      "DELETE FROM rooms WHERE expires<=? OR EXISTS(SELECT 1 FROM members m WHERE m.room=rooms.id AND m.seen<=?)",
      now,
      now - LEASE,
    ),
    select(db, "DELETE FROM invites WHERE expires<=?", now),
    select(db, "DELETE FROM grants WHERE expires<=?", now),
    select(
      db,
      "DELETE FROM events WHERE created<=? OR (deadline>0 AND deadline<=?)",
      now - 2 * MINUTE,
      now,
    ),
    select(db, "DELETE FROM sessions WHERE seen<=?", now - HOUR),
    select(db, "DELETE FROM people WHERE seen<=?", now - 2 * HOUR),
    select(db, "DELETE FROM challenges WHERE expires<=?", now),
    select(db, "DELETE FROM transfers WHERE expires<=?", now),
  ]);
}
export function makeRelay({ now = Date.now } = {}) {
  let lastSweep = -Infinity;
  return async function handle(req, db, options = {}) {
    const at = now(),
      url = new URL(req.url),
      path = url.pathname.slice(5);
    const q = (sql, ...args) => select(db, sql, ...args);
    try {
      requireThat(db, 503, "The relay is unavailable.");
      if (at - lastSweep > 4000) {
        await sweep(db, at);
        lastSweep = at;
      }
      if (path === "operator") {
        const supplied = (req.headers.get("authorization") || "").replace(
          /^Bearer /,
          "",
        );
        requireThat(
          options.operatorToken &&
            options.operatorToken.length >= 32 &&
            (await digest(supplied)) === (await digest(options.operatorToken)),
          404,
          "Unknown endpoint.",
        );
        return json({
          people: await all(
            q(
              "SELECT code,activity,count(*) AS connections FROM sessions WHERE seen>? GROUP BY code,activity",
              at - LEASE,
            ),
          ),
        });
      }
      requireThat(req.method === "POST", 405, "Use POST.");
      const origin = req.headers.get("Origin");
      requireThat(
        !origin || origin === url.origin,
        403,
        "Cross-origin request blocked.",
      );
      const b = await readBody(req, path === "upload-part" ? 177000 : 20000);
      if (path === "info")
        return json({ storage: options.storage || "hosted" });
      if (path === "challenge") {
        const nonce = random(24);
        const res = await q(
          "INSERT INTO challenges SELECT ?,? WHERE (SELECT count(*) FROM challenges)<500",
          nonce,
          at + MINUTE,
        ).run();
        requireThat(changes(res), 429, "The relay is busy. Try again shortly.");
        return json({ nonce });
      }
      if (path === "session") {
        requireThat(
          typeof b.box === "string" &&
            b.box.length === 87 &&
            typeof b.sign === "string" &&
            b.sign.length === 87 &&
            typeof b.proof === "string" &&
            b.proof.length === 86,
          400,
          "Invalid device keys.",
        );
        const used = await q(
          "DELETE FROM challenges WHERE nonce=? AND expires>?",
          String(b.nonce),
          at,
        ).run();
        requireThat(changes(used), 403, "Expired login challenge.");
        let valid = false;
        try {
          valid = await verifyText(
            b.sign,
            loginProof(url.origin, b.nonce),
            b.proof,
          );
        } catch {}
        requireThat(valid, 403, "Device verification failed.");
        const code = await personCode(b.box, b.sign),
          token = random(32),
          hash = await digest(token);
        const sessions = await q(
          "SELECT count(*) AS all_n,count(CASE WHEN code=? THEN 1 END) AS own_n FROM sessions WHERE seen>?",
          code,
          at - LEASE,
        ).first();
        requireThat(
          sessions.all_n < 1500 && sessions.own_n < 16,
          429,
          "Too many active connections.",
        );
        await db.batch([
          q(
            "INSERT INTO people VALUES(?,?,?,?) ON CONFLICT(code) DO UPDATE SET seen=excluded.seen",
            code,
            b.box,
            b.sign,
            at,
          ),
          q("INSERT INTO sessions VALUES(?,?,?,'available')", hash, code, at),
        ]);
        return json({ code, token, storage: options.storage || "hosted" });
      }
      const bearer = req.headers.get("authorization") || "";
      requireThat(
        /^Bearer [A-Za-z0-9_-]{43}$/.test(bearer),
        401,
        "Open your identity again.",
      );
      const token = await digest(bearer.slice(7));
      const session = await q(
        "SELECT code FROM sessions WHERE token=? AND seen>?",
        token,
        at - HOUR,
      ).first();
      requireThat(session, 401, "Your session expired. Reopen your identity.");
      const code = session.code,
        room = String(b.room || "");
      if (path === "sync") {
        const cursor =
          Number.isSafeInteger(b.after) && b.after >= 0 ? b.after : 0;
        const activity = ["available", "in a room", "away"].includes(b.activity)
          ? b.activity
          : "available";
        await db.batch([
          q(
            "UPDATE sessions SET seen=?,activity=? WHERE token=?",
            at,
            activity,
            token,
          ),
          q("UPDATE people SET seen=? WHERE code=?", at, code),
          q(
            "UPDATE members SET seen=? WHERE token=? AND seen>?",
            at,
            token,
            at - LEASE,
          ),
        ]);
        const [rooms, peers, events, invites, mark, connections] =
          await db.batch([
            q(
              "SELECT r.id,r.owner,r.kind,r.expires,r.owner_posts,r.lifetime,r.description FROM rooms r JOIN members m ON m.room=r.id WHERE m.token=? AND r.expires>? AND NOT EXISTS(SELECT 1 FROM members z WHERE z.room=r.id AND z.seen<=?)",
              token,
              at,
              at - LEASE,
            ),
            q(
              "SELECT m.room,p.code,p.box,p.sign,coalesce(k.days,0)>=3 AS badge FROM members m JOIN people p ON p.code=m.code LEFT JOIN marks k ON k.code=p.code WHERE m.room IN (SELECT room FROM members WHERE token=?)",
              token,
            ),
            q(
              "SELECT e.* FROM events e JOIN members m ON m.room=e.room WHERE m.token=? AND e.seq>max(?,m.since_seq) AND e.created>? AND (e.deadline=0 OR e.deadline>?) ORDER BY e.seq LIMIT 160",
              token,
              cursor,
              at - 2 * MINUTE,
              at,
            ),
            q(
              "SELECT i.id,i.sender,i.parcel,p.box,p.sign FROM invites i JOIN people p ON p.code=i.sender WHERE i.target=? AND i.expires>? ORDER BY i.rowid DESC LIMIT 32",
              code,
              at,
            ),
            q("SELECT days FROM marks WHERE code=?", code),
            q(
              "SELECT count(*) AS n FROM sessions WHERE code=? AND seen>?",
              code,
              at - LEASE,
            ),
          ]);
        return json({
          rooms: rooms.results,
          peers: peers.results,
          events: events.results,
          invites: invites.results,
          days: mark.results[0]?.days ?? null,
          connections: connections.results[0].n,
        });
      }
      if (path === "save") {
        await q("INSERT OR IGNORE INTO marks(code) VALUES(?)", code).run();
        return json({ ok: true });
      }
      if (path === "forget") {
        await db.batch([
          q(
            "DELETE FROM rooms WHERE id IN(SELECT room FROM members WHERE code=?)",
            code,
          ),
          q("DELETE FROM invites WHERE target=? OR sender=?", code, code),
          q("DELETE FROM marks WHERE code=?", code),
          q("DELETE FROM sessions WHERE code=?", code),
          q("DELETE FROM people WHERE code=?", code),
        ]);
        return json({ ok: true });
      }
      if (path === "disconnect") {
        await db.batch([
          q(
            "DELETE FROM rooms WHERE id IN(SELECT room FROM members WHERE token=?)",
            token,
          ),
          q("DELETE FROM sessions WHERE token=?", token),
        ]);
        return json({ ok: true });
      }
      if (path === "lookup") {
        requireThat(
          personPattern.test(b.code),
          400,
          "Paste a complete person code.",
        );
        const peer = await q(
          "SELECT p.code,p.box,p.sign FROM people p WHERE p.code=? AND EXISTS(SELECT 1 FROM sessions s WHERE s.code=p.code AND s.seen>?)",
          b.code,
          at - LEASE,
        ).first();
        requireThat(
          peer,
          404,
          "This person is offline or the code is incorrect.",
        );
        return json(peer);
      }
      if (path === "decline") {
        await q(
          "DELETE FROM invites WHERE id=? AND target=?",
          String(b.id),
          code,
        ).run();
        return json({ ok: true });
      }
      if (path === "create") {
        const key = random(16),
          kind = b.kind === "direct" ? "direct" : "discussion";
        const result = await db.batch([
          q(
            "INSERT INTO rooms(id,owner,kind,expires) SELECT ?,?,?,? WHERE (SELECT count(*) FROM rooms)<450 AND (SELECT count(*) FROM members WHERE code=?)<10",
            key,
            code,
            kind,
            at + HOUR,
            code,
          ),
          q(
            "INSERT INTO members SELECT id,?,?,?,0 FROM rooms WHERE id=?",
            code,
            token,
            at,
            key,
          ),
        ]);
        requireThat(changes(result[0]), 429, "Room limit reached.");
        return json({ room: key, expires: at + HOUR });
      }
      requireThat(idPattern.test(room), 400, "Invalid room.");
      if (path === "join") {
        requireThat(
          typeof b.grant === "string" && b.grant.length === 43,
          400,
          "Invalid invitation.",
        );
        const hash = await digest(b.grant);
        const out = await db.batch([
          q(
            "INSERT OR IGNORE INTO members SELECT r.id,?,?,?,max(coalesce((SELECT max(seq) FROM events),0),coalesce((SELECT max(published) FROM transfers WHERE room=r.id),0)) FROM rooms r JOIN grants g ON g.room=r.id WHERE r.id=? AND g.digest=? AND (g.target IS NULL OR g.target=?) AND g.expires>? AND r.expires>? AND NOT EXISTS(SELECT 1 FROM members WHERE room=r.id AND seen<=?) AND (SELECT count(*) FROM members WHERE room=r.id)<CASE WHEN r.kind='direct' THEN 2 ELSE ? END AND (SELECT count(*) FROM members WHERE code=?)<10",
            code,
            token,
            at,
            room,
            hash,
            code,
            at,
            at,
            at - LEASE,
            MAX_ROOM,
            code,
          ),
          q(
            "DELETE FROM grants WHERE digest=? AND EXISTS(SELECT 1 FROM members WHERE room=? AND token=?)",
            hash,
            room,
            token,
          ),
          q(
            "DELETE FROM invites WHERE room=? AND target=? AND EXISTS(SELECT 1 FROM members WHERE room=? AND token=?)",
            room,
            code,
            room,
            token,
          ),
        ]);
        requireThat(
          changes(out[0]),
          409,
          "Invite expired, room full, or already joined.",
        );
        return json({ ok: true });
      }
      const member = await q(
        "SELECT r.* FROM rooms r JOIN members m ON m.room=r.id WHERE r.id=? AND m.token=? AND r.expires>? AND NOT EXISTS(SELECT 1 FROM members z WHERE z.room=r.id AND z.seen<=?)",
        room,
        token,
        at,
        at - LEASE,
      ).first();
      requireThat(member, 410, "This room has closed.");
      if (path === "room-preference") {
        requireThat(
          code === member.owner,
          403,
          "Only the room creator can change this setting.",
        );
        if (b.setting === "owner_posts" && [0, 1].includes(b.value))
          await q(
            "UPDATE rooms SET owner_posts=? WHERE id=? AND owner=?",
            b.value,
            room,
            code,
          ).run();
        else if (
          b.setting === "lifetime" &&
          [0, 30, 300, 900].includes(b.value)
        )
          await q(
            "UPDATE rooms SET lifetime=? WHERE id=? AND owner=?",
            b.value,
            room,
            code,
          ).run();
        else if (
          b.setting === "description" &&
          typeof b.value === "string" &&
          b.value.length <= 3000 &&
          /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+~[A-Za-z0-9_-]{86}$/.test(b.value)
        )
          await q(
            "UPDATE rooms SET description=? WHERE id=? AND owner=?",
            b.value,
            room,
            code,
          ).run();
        else throw new ApiError(400, "Invalid room preference.");
        return json({ ok: true });
      }
      if (["send", "upload-start", "upload-part"].includes(path))
        requireThat(
          !member.owner_posts || member.owner === code,
          403,
          "Only the creator can post in this room.",
        );
      if (path === "leave") {
        await q("DELETE FROM rooms WHERE id=?", room).run();
        return json({ ok: true });
      }
      if (path === "invite") {
        requireThat(member.owner === code, 403, "Only the creator can invite.");
        requireThat(
          typeof b.digest === "string" && /^[A-Za-z0-9_-]{43}$/.test(b.digest),
          400,
          "Invalid invite.",
        );
        const target = b.target ?? null;
        requireThat(
          target === null ||
            (personPattern.test(target) &&
              target !== code &&
              typeof b.parcel === "string" &&
              b.parcel.length < 7000),
          400,
          "Invalid person code or invite.",
        );
        const expires = Math.min(at + 10 * MINUTE, member.expires);
        const ops = [
          q(
            "INSERT INTO grants SELECT ?,?,?,? WHERE (SELECT count(*) FROM grants WHERE room=?)<20",
            b.digest,
            room,
            target,
            expires,
            room,
          ),
        ];
        if (target)
          ops.push(
            q(
              "INSERT INTO invites SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM grants WHERE digest=?) AND (SELECT count(*) FROM invites WHERE target=?)<32",
              random(16),
              room,
              code,
              target,
              b.parcel,
              expires,
              b.digest,
              target,
            ),
          );
        const out = await db.batch(ops);
        requireThat(
          out.every((r) => changes(r)),
          429,
          "Invite limit reached.",
        );
        return json({ ok: true });
      }
      if (path === "upload-start") {
        requireThat(
          idPattern.test(b.file) &&
            Number.isInteger(b.parts) &&
            b.parts >= 1 &&
            b.parts <= 32,
          400,
          "Invalid attachment size.",
        );
        const out = await q(
          `INSERT OR IGNORE INTO transfers(id,room,owner,parts,expires)
          SELECT ?,?,?,?,? WHERE
          (SELECT coalesce(sum(parts),0) FROM transfers WHERE room=?) + ? <= 512 AND
          (SELECT coalesce(sum(parts),0) FROM transfers) + ? <= 4096 AND
          (SELECT count(*) FROM transfers WHERE owner=? AND published IS NULL) < 4`,
          b.file,
          room,
          code,
          b.parts,
          Math.min(at + 2 * MINUTE, member.expires),
          room,
          b.parts,
          b.parts,
          code,
        ).run();
        requireThat(
          changes(out),
          429,
          "Attachment space is busy. Try again shortly.",
        );
        return json({ ok: true });
      }
      if (path === "upload-part" || path === "download-part") {
        requireThat(
          idPattern.test(b.file) &&
            Number.isInteger(b.part) &&
            b.part >= 0 &&
            b.part < 32,
          400,
          "Invalid attachment part.",
        );
        if (path === "upload-part") {
          requireThat(
            typeof b.data === "string" &&
              b.data.length <= 174801 &&
              /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/.test(b.data),
            400,
            "Invalid encrypted part.",
          );
          const out = await q(
            `INSERT OR IGNORE INTO pieces SELECT id,?,? FROM transfers
            WHERE id=? AND owner=? AND room=? AND parts>? AND published IS NULL AND expires>?`,
            b.part,
            b.data,
            b.file,
            code,
            room,
            b.part,
            at,
          ).run();
          if (!changes(out)) {
            const existing = await q(
              `SELECT 1 AS ok FROM pieces p JOIN transfers t ON t.id=p.transfer
              WHERE t.id=? AND t.room=? AND t.owner=? AND t.expires>? AND p.part=? AND p.data=? AND t.published IS NULL`,
              b.file,
              room,
              code,
              at,
              b.part,
              b.data,
            ).first();
            requireThat(
              existing,
              409,
              "Upload expired or part already occupied.",
            );
          }
          return json({ ok: true });
        }
        const piece = await q(
          `SELECT p.data FROM pieces p JOIN transfers t ON t.id=p.transfer
          JOIN members m ON m.room=t.room WHERE t.id=? AND t.room=? AND p.part=? AND t.expires>?
          AND m.token=? AND t.published>m.since_seq`,
          b.file,
          room,
          b.part,
          at,
          token,
        ).first();
        requireThat(piece, 404, "Attachment unavailable in this session.");
        return json(piece);
      }
      if (path === "send") {
        requireThat(
          typeof b.packet === "string" &&
            b.packet.length <= 12500 &&
            /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+~[A-Za-z0-9_-]{86}$/.test(
              b.packet,
            ),
          400,
          "Invalid encrypted message.",
        );
        const hasFile = b.file !== undefined;
        requireThat(
          !hasFile || idPattern.test(b.file),
          400,
          "Invalid attachment.",
        );
        const fileCheck = hasFile
          ? ` AND EXISTS (SELECT 1 FROM transfers t WHERE t.id=? AND t.room=? AND t.owner=?
          AND t.published IS NULL AND t.expires>? AND t.parts=(SELECT count(*) FROM pieces p WHERE p.transfer=t.id))`
          : "";
        const day = new Date(at).toISOString().slice(0, 10);
        const ops = [
          q(
            "INSERT INTO events(room,code,packet,created,deadline) SELECT ?,?,?,?,CASE WHEN lifetime>0 THEN min(expires,?+1000*lifetime) ELSE 0 END FROM rooms WHERE id=? AND (owner_posts=0 OR owner=?) AND (SELECT count(*) FROM events WHERE code=? AND created>?)<20" +
              fileCheck,
            room,
            code,
            b.packet,
            at,
            at,
            room,
            code,
            code,
            at - 10000,
            ...(hasFile ? [b.file, room, code, at] : []),
          ),
        ];
        if (hasFile)
          ops.push(
            q(
              `UPDATE transfers SET published=(SELECT max(seq) FROM events WHERE room=? AND code=?), expires=min(?,coalesce(nullif((SELECT deadline FROM events WHERE room=? ORDER BY seq DESC LIMIT 1),0),?))
           WHERE changes()>0 AND id=? AND room=? AND owner=? AND published IS NULL`,
              room,
              code,
              member.expires,
              room,
              member.expires,
              b.file,
              room,
              code,
            ),
          );
        ops.push(
          q(
            "UPDATE marks SET days=min(3,days+1),last_day=? WHERE code=? AND days<3 AND (last_day IS NULL OR last_day<>?) AND changes()>0 AND EXISTS(SELECT 1 FROM members WHERE room=? AND code<>?)",
            day,
            code,
            day,
            room,
            code,
          ),
        );
        const out = await db.batch(ops);
        requireThat(
          changes(out[0]),
          429,
          hasFile
            ? "Upload incomplete or rate limit reached. Try again."
            : "Slow down for a moment.",
        );
        return json({ ok: true });
      }
      throw new ApiError(404, "Unknown endpoint.");
    } catch (error) {
      return json(
        {
          error:
            error instanceof ApiError
              ? error.message
              : "The relay could not complete the request.",
        },
        error instanceof ApiError ? error.status : 500,
      );
    }
  };
}
