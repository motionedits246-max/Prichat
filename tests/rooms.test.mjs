import { PART, uploadFile, downloadFile } from "../public/media.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../node-store.mjs";
import { makeRelay } from "../relay.js";
import {
  makeDevice,
  verifyRecipient,
  signText,
  loginProof,
  packMessage,
  unpackMessage,
  packInvite,
  unpackInvite,
  random,
  digest,
} from "../public/crypto.js";
const origin = "https://chat.test";
function fixture(file) {
  const db = openStore(file);
  let time = Date.UTC(2026, 10, 20, 12);
  const relay = makeRelay({ now: () => time });
  async function req(path, body = {}, token = "") {
    const response = await relay(
      new Request(origin + "/api/" + path, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(body),
      }),
      db,
      { storage: "memory" },
    );
    return { status: response.status, ...(await response.json()) };
  }
  async function login(id = undefined) {
    id ??= await makeDevice();
    const { nonce } = await req("challenge");
    const proof = await signText(id.signKey, loginProof(origin, nonce));
    const session = await req("session", {
      box: id.box,
      sign: id.sign,
      nonce,
      proof,
    });
    assert.equal(session.status, 200);
    assert.equal(id.code, session.code);
    return { ...id, token: session.token };
  }
  return {
    db,
    req,
    login,
    advance: (ms) => {
      time += ms;
    },
  };
}
async function joinTwo(f, a, b) {
  const c = await f.req("create", { kind: "discussion" }, a.token);
  assert.equal(c.status, 200);
  const key = random(32),
    grant = random(32),
    i = { room: c.room, key, grant, label: "Test", kind: "discussion" };
  const parcel = await packInvite(a, b, i);
  assert.equal(
    (
      await f.req(
        "invite",
        { room: c.room, target: b.code, digest: await digest(grant), parcel },
        a.token,
      )
    ).status,
    200,
  );
  const inbox = await f.req("sync", {}, b.token);
  assert.equal(inbox.invites.length, 1);
  assert.deepEqual(await unpackInvite(b, a, inbox.invites[0].parcel), i);
  assert.equal(
    (await f.req("join", { room: c.room, grant }, b.token)).status,
    200,
  );
  return i;
}
test("two verified codes exchange encrypted invites and messages; outsider and replay rejected", async () => {
  const f = fixture();
  try {
    const a = await f.login(),
      b = await f.login(),
      c = await f.login();
    const i = await joinTwo(f, a, b),
      plain = { name: "Mira", text: "Only the room can read this." };
    assert.equal(
      (await f.req("join", { room: i.room, grant: i.grant }, c.token)).status,
      409,
    );
    const packet = await packMessage(a, i.room, i.key, plain);
    assert.equal(
      (await f.req("send", { room: i.room, packet }, c.token)).status,
      410,
    );
    assert.equal(
      (await f.req("send", { room: i.room, packet }, a.token)).status,
      200,
    );
    const state = await f.req("sync", {}, b.token);
    assert.equal(state.events.length, 1);
    assert.ok(!JSON.stringify(state).includes(plain.text));
    assert.ok(!JSON.stringify(state).includes(plain.name));
    assert.deepEqual(
      await unpackMessage(a, i.room, i.key, state.events[0].packet),
      plain,
    );
    await assert.rejects(unpackMessage(a, i.room, random(32), packet));
    await assert.rejects(unpackMessage(c, i.room, i.key, packet));
    await assert.rejects(unpackInvite(c, a, await packInvite(a, b, i)));
    assert.equal((await f.req("sync", {}, c.token)).events.length, 0);
    assert.equal((await f.req("leave", { room: i.room }, b.token)).status, 200);
    const closed = await f.req("sync", {}, a.token);
    assert.equal(closed.rooms.length, 0);
    assert.equal(closed.events.length, 0);
    for (const name of ["rooms", "members", "events", "grants", "invites"])
      assert.equal(
        f.db
          .prepare("SELECT count(*) AS n FROM " + name)
          .bind()
          .first().n,
        0,
      );
  } finally {
    f.db.close();
  }
});
test("saved device earns one badge only on three distinct active UTC dates with a peer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "prichat-test-")),
    path = join(dir, "badges.sqlite"),
    f = fixture(path);
  let savedId;
  try {
    savedId = await makeDevice();
    const peer = await makeDevice();
    for (let day = 1; day <= 3; day++) {
      const a = await f.login(savedId),
        b = await f.login(peer);
      await f.req("save", {}, a.token);
      const solo = await f.req("create", {}, a.token);
      const s = await packMessage(a, solo.room, random(32), {
        text: "solo",
        name: "A",
      });
      await f.req("send", { room: solo.room, packet: s }, a.token);
      assert.equal((await f.req("sync", {}, a.token)).days, day - 1);
      const i = await joinTwo(f, a, b);
      for (let n = 0; n < 2; n++) {
        const p = await packMessage(a, i.room, i.key, {
          text: "hello",
          name: "A",
        });
        await f.req("send", { room: i.room, packet: p }, a.token);
      }
      assert.equal((await f.req("sync", {}, a.token)).days, day);
      assert.equal(
        (await f.req("sync", {}, b.token)).peers.find((p) => p.code === a.code)
          .badge,
        day === 3 ? 1 : 0,
      );
      f.advance(86400000);
    }
  } finally {
    f.db.close();
  }
  const second = fixture(path);
  try {
    const a = await second.login(savedId),
      s = await second.req("sync", {}, a.token);
    assert.equal(s.days, 3);
    assert.equal(s.rooms.length, 0);
    await second.req("forget", {}, a.token);
    assert.equal((await second.req("sync", {}, a.token)).status, 401);
  } finally {
    second.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("heartbeat expiry closes all members; multiple connections count only live sessions", async () => {
  const f = fixture();
  try {
    const a = await f.login(),
      b = await f.login();
    await joinTwo(f, a, b);
    const second = await f.login(a);
    assert.equal((await f.req("sync", {}, second.token)).connections, 2);
    f.advance(91000);
    assert.equal((await f.req("sync", {}, a.token)).rooms.length, 0);
    assert.equal((await f.req("sync", {}, a.token)).connections, 1);
  } finally {
    f.db.close();
  }
});
test("challenge is single-use and cross-origin requests are refused", async () => {
  const f = fixture();
  try {
    const a = await makeDevice(),
      { nonce } = await f.req("challenge"),
      body = {
        box: a.box,
        sign: a.sign,
        nonce,
        proof: await signText(a.signKey, loginProof(origin, nonce)),
      };
    assert.equal((await f.req("session", body)).status, 200);
    assert.equal((await f.req("session", body)).status, 403);
    const r = await makeRelay()(
      new Request(origin + "/api/challenge", {
        method: "POST",
        headers: {
          Origin: "https://elsewhere.test",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      f.db,
    );
    assert.equal(r.status, 403);
  } finally {
    f.db.close();
  }
});

test("an invite is bound to the exact person code entered by the sender", async () => {
  const intended = await makeDevice();
  const other = await makeDevice();
  assert.equal(
    (await verifyRecipient(intended.code, intended)).code,
    intended.code,
  );
  await assert.rejects(verifyRecipient(intended.code, other));
  await assert.rejects(
    verifyRecipient(intended.code, { ...other, code: intended.code }),
  );
});

test("multipart attachments stay encrypted, room scoped and unavailable to late joiners", async () => {
  const f = fixture();
  try {
    const [a, b, c] = await Promise.all([f.login(), f.login(), f.login()]);
    const i = await joinTwo(f, a, b),
      room = i.room;
    const call = (who) => async (path, body) => {
      const res = await f.req(path, body, who.token);
      if (res.status !== 200) throw Error(res.error);
      return res;
    };
    const source = new Uint8Array(2 * PART + 356);
    source.fill(77);
    const file = new File([source], "drawing.private", {
      type: "application/octet-stream",
    });
    const progress = [];
    const desc = await uploadFile(call(a), room, file, (p) => progress.push(p));
    assert.equal(progress.length, 3);
    await assert.rejects(downloadFile(call(b), room, desc));
    const packet = await packMessage(a, room, i.key, {
      name: "River",
      text: "Document",
      activity: { type: "file", file: desc, kind: "document" },
    });
    assert.equal(
      (await f.req("send", { room, packet, file: desc.id }, a.token)).status,
      200,
    );
    const state = await call(b)("sync", {});
    assert.equal(state.events.length, 1);
    const payload = await unpackMessage(a, room, i.key, state.events[0].packet);
    assert.ok(!JSON.stringify(state).includes("drawing.private"));
    assert.deepEqual(
      new Uint8Array(
        await (
          await downloadFile(call(b), room, payload.activity.file)
        ).arrayBuffer(),
      ),
      source,
    );
    await assert.rejects(downloadFile(call(c), room, desc));
    for (let n = 0; n < 2; n++) {
      f.advance(61000);
      await call(a)("sync", {});
      await call(b)("sync", {});
    }
    assert.equal((await call(b)("sync", {})).events.length, 0);
    const grant = random(32);
    await call(a)("invite", { room, digest: await digest(grant) });
    await call(c)("join", { room, grant });
    await assert.rejects(downloadFile(call(c), room, desc));
    await assert.rejects(
      downloadFile(call(b), room, { ...desc, secret: random(32) }),
    );
    await call(a)("leave", { room });
    await assert.rejects(downloadFile(call(b), room, desc));
    for (const table of ["transfers", "pieces"])
      assert.equal(
        f.db
          .prepare("SELECT count(*) AS n FROM " + table)
          .bind()
          .first().n,
        0,
      );
  } finally {
    f.db.close();
  }
});
test("incomplete uploads expire; attachment publication requires every part", async () => {
  const f = fixture();
  try {
    const a = await f.login(),
      { room } = await f.req("create", {}, a.token),
      file = random(16);
    const packet = await packMessage(a, room, random(32), {
      name: "A",
      text: "file",
    });
    assert.equal(
      (await f.req("upload-start", { file, room, parts: 2 }, a.token)).status,
      200,
    );
    assert.equal(
      (await f.req("send", { file, room, packet }, a.token)).status,
      429,
    );
    assert.equal(
      (
        await f.req(
          "upload-part",
          { file, room, part: 2, data: "a".repeat(16) + ".BBBB" },
          a.token,
        )
      ).status,
      409,
    );
    f.advance(70000);
    await f.req("sync", {}, a.token);
    f.advance(55000);
    await f.req("sync", {}, a.token);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM transfers").bind().first().n,
      0,
    );
  } finally {
    f.db.close();
  }
});

test("creator-managed posting, signed description and disappearing files", async () => {
  const f = fixture();
  try {
    const a = await f.login(),
      b = await f.login();
    const { room, key } = await joinTwo(f, a, b);
    const preference = (who, setting, value) =>
      f.req("room-preference", { room, setting, value }, who.token);
    assert.equal((await preference(b, "lifetime", 30)).status, 403);
    assert.equal((await preference(a, "owner_posts", 1)).status, 200);
    const packet = await packMessage(a, room, key, {
      name: "Owner",
      text: "File",
    });
    assert.equal((await f.req("send", { room, packet }, b.token)).status, 403);
    assert.equal(
      (
        await f.req(
          "upload-start",
          { room, file: random(16), parts: 1 },
          b.token,
        )
      ).status,
      403,
    );
    const info = await packMessage(a, room, key, {
      description: "A private group",
    });
    assert.equal((await preference(a, "description", info)).status, 200);
    const settings = (await f.req("sync", {}, b.token)).rooms[0];
    assert.equal(settings.owner_posts, 1);
    assert.deepEqual(await unpackMessage(a, room, key, settings.description), {
      description: "A private group",
    });
    assert.equal((await preference(a, "lifetime", 30)).status, 200);
    const file = random(16);
    assert.equal(
      (await f.req("upload-start", { room, file, parts: 1 }, a.token)).status,
      200,
    );
    assert.equal(
      (
        await f.req(
          "upload-part",
          { room, file, part: 0, data: "a".repeat(16) + ".BBBB" },
          a.token,
        )
      ).status,
      200,
    );
    assert.equal(
      (await f.req("send", { room, packet, file }, a.token)).status,
      200,
    );
    const event = (await f.req("sync", {}, b.token)).events[0];
    assert.equal(event.deadline - event.created, 30000);
    f.advance(30001);
    assert.equal((await f.req("sync", {}, b.token)).events.length, 0);
    assert.notEqual(
      (await f.req("download-part", { room, file, part: 0 }, b.token)).status,
      200,
    );
    assert.equal((await preference(a, "owner_posts", 0)).status, 200);
    const reply = await packMessage(b, room, key, {
      name: "Member",
      text: "Hi",
    });
    assert.equal(
      (await f.req("send", { room, packet: reply }, b.token)).status,
      200,
    );
  } finally {
    f.db.close();
  }
});
