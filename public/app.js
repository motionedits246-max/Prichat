import {
  makeDevice,
  verifyRecipient,
  random,
  digest,
  loginProof,
  signText,
  packMessage,
  unpackMessage,
  packInvite,
  unpackInvite,
} from "./crypto.js";
const $ = (id) => document.getElementById(id);
const shapes = {
  shield:
    '<path d="M12 3 4 6v5c0 5 3 8 8 10 5-2 8-5 8-10V6z"/><path d="m8.7 11.8 2.2 2.2 4.5-4.8"/>',
  fingerprint:
    '<path d="M3.5 10a8.5 8.5 0 0 1 17 0m-14 4v-3a5.5 5.5 0 0 1 11 0c0 5-1 8-3 10M10 20c2-3 2-5 2-9m3 1c0 3-.3 5-1.2 7M4 14c0 2-.4 3-1 4m5-2c0 1.4-.5 3-1.4 4"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20v-2a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v2"/>',
  hourglass:
    '<path d="M6 3h12M6 21h12M7 3v3c0 2 2 4 5 6-3 2-5 4-5 6v3m10-18v3c0 2-2 4-5 6 3 2 5 4 5 6v3"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  code: '<path d="m7 7-5 5 5 5m10-10 5 5-5 5m-3-14-4 18"/>',
  "user-x":
    '<circle cx="9" cy="8" r="3.5"/><path d="M2 20v-2a6 6 0 0 1 6-6h3m5-3 6 6m0-6-6 6"/>',
  timer:
    '<circle cx="12" cy="14" r="7.5"/><path d="M12 10v4l2 2M9 2h6m-3 0v4"/>',
  message: '<path d="M4 4h16v13H9l-5 4z"/>',
  "square-pen": '<path d="M12 5H5v14h14v-7m-9 2 1-4 8-8 3 3-8 8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  "user-plus":
    '<circle cx="9" cy="8" r="3.5"/><path d="M2 20v-2a6 6 0 0 1 6-6h3m7-4v8m-4-4h8"/>',
  exit: '<path d="M11 4H4v16h7m-1-8h11m-4-4 4 4-4 4"/>',
  smile:
    '<circle cx="12" cy="12" r="9"/><path d="M8 14c2 3 6 3 8 0m-8-5h.01M16 9h.01"/>',
  send: '<path d="m21 3-6 18-4-8-8-4zM11 13 21 3"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  check: '<path d="m4 13 5 5L20 6"/>',
  badge:
    '<path d="m12 2 3 2 4 .7.7 4 2 3.3-2 3-.7 4-4 .7-3 2-3.2-2-4-.7-.7-4L2 12l2.1-3 .7-4 4-.7z" fill="currentColor" stroke="none"/><path d="m7.8 12.1 2.8 2.8 5.6-6.2" stroke="#15263e" stroke-width="2.4"/>',
  link: '<path d="m10 14 4-4m-5-1 3-3a4 4 0 0 1 6 6l-3 3m0 0-3 3a4 4 0 0 1-6-6l3-3"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m1 3c3 0 5 2 5 5"/>',
};
function icon(name) {
  const i = document.createElement("i");
  i.setAttribute("aria-hidden", "true");
  i.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' +
    (shapes[name] || shapes.message) +
    "</svg>";
  return i;
}
document
  .querySelectorAll("[data-icon]")
  .forEach((n) => n.replaceWith(icon(n.dataset.icon)));
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function button(label, click, cls = "secondary") {
  const n = el("button", cls, label);
  n.type = "button";
  n.onclick = async () => {
    n.disabled = true;
    try {
      await click();
    } catch (e) {
      errorNotice(e);
    } finally {
      n.disabled = false;
    }
  };
  return n;
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 4000);
}
function errorNotice(e) {
  const msg = e.message || "Something went wrong.";
  if ($("modal").open) {
    let n = $("dialogError");
    if (!n) {
      n = el("p", "form-error");
      n.id = "dialogError";
      n.setAttribute("role", "alert");
      $("modalBody").append(n);
    }
    n.textContent = msg;
  } else toast(msg);
}
function dialog(title, glyph) {
  const d = $("modal");
  $("modalTitle").textContent = title;
  d.setAttribute("aria-labelledby", "modalTitle");
  $("modalIcon").replaceChildren(icon(glyph));
  $("modalBody").replaceChildren();
  if (!d.open) d.showModal();
  return $("modalBody");
}
const close = () => $("modal").close();
$("modal").addEventListener("close", () => {
  if (!$("modal").open) $("modalBody").replaceChildren();
});
$("dismiss").onclick = close;
function field(label, placeholder, max = 128) {
  const w = el("div", "form-field"),
    l = el("label", null, label),
    i = el("input");
  i.id = "field-" + random(5);
  l.htmlFor = i.id;
  i.placeholder = placeholder;
  i.maxLength = max;
  i.autocomplete = "off";
  w.append(l, i);
  return { w, i };
}
function actions(body, ...buttons) {
  const w = el("div", "action-row");
  w.append(...buttons);
  body.append(w);
}
function option(title, detail, glyph, fn) {
  const b = button("", fn, "option-card"),
    d = el("span");
  d.append(el("strong", null, title), el("small", null, detail));
  b.append(icon(glyph), d);
  return b;
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard.");
  } catch {
    const d = dialog("Copy this value", "copy"),
      i = el("textarea", "code-output");
    i.readOnly = true;
    i.value = text;
    d.append(i);
    i.focus();
    i.select();
  }
}
function badge() {
  const n = el("span", "tick");
  n.setAttribute("aria-label", "Established device");
  n.title = "Established device · messaged on three days";
  n.append(icon("badge"));
  return n;
}
function idb(mode, task) {
  return new Promise((ok, fail) => {
    const req = indexedDB.open("prichat-device", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("identity");
    req.onerror = () => fail(req.error);
    req.onsuccess = () => {
      const db = req.result,
        tx = db.transaction("identity", mode),
        op = task(tx.objectStore("identity"));
      tx.oncomplete = () => {
        db.close();
        ok(op.result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        fail(tx.error || Error("Device storage unavailable."));
      };
    };
  });
}
let saved = null,
  device = null,
  token = "",
  name = "",
  keep = false,
  days = null,
  connections = 1,
  storage = "",
  after = 0,
  current = "",
  filter = "all",
  timer = null,
  busy = false,
  epoch = 0,
  entryReady = false;
const rooms = new Map(),
  invites = new Map();
let pending = null;
const roomPattern = /^[A-Za-z0-9_-]{22}$/,
  secretPattern = /^[A-Za-z0-9_-]{43}$/;
function validInvite(o) {
  return (
    o &&
    roomPattern.test(o.room) &&
    secretPattern.test(o.key) &&
    secretPattern.test(o.grant) &&
    typeof o.label === "string" &&
    o.label.length <= 64 &&
    ["direct", "discussion"].includes(o.kind)
  );
}
if (location.hash) {
  try {
    const raw = location.hash.slice(1);
    if (raw.length > 4000) throw Error();
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!validInvite(parsed)) throw Error();
    pending = parsed;
  } catch {
    toast("This room link is invalid.");
  }
  history.replaceState(null, "", location.pathname);
}
async function api(path, body = {}, auth = token) {
  let response;
  try {
    response = await fetch("/api/" + path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer " + auth } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw Error("Connection lost. Check your network and try again.");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("The relay is unavailable.");
  }
  if (!response.ok) {
    const e = Error(result.error || "Request failed.");
    e.status = response.status;
    throw e;
  }
  return result;
}
function privacy() {
  const d = dialog("Privacy in PriChat", "shield");
  for (const [h, t] of [
    [
      "What the relay can see",
      "Person codes, active connection counts, coarse activity, room membership, timing and encrypted packet sizes. Display names travel inside encrypted messages and invites.",
    ],
    [
      "What stays on your device",
      "Room keys and readable messages live in your tab. Keeping an identity saves its name and device keys in this browser. Screenshots and copies are possible.",
    ],
    [
      "Hosting and deletion",
      storage === "memory"
        ? "This self-hosted relay keeps room traffic in RAM. Leaving closes the room for everyone. The HTTPS host or proxy can see IP addresses."
        : "The hosted pilot briefly queues ciphertext in a database. Leaving deletes the live room; provider backups may retain ciphertext and metadata. An HTTPS host or proxy can see IP addresses.",
    ],
    [
      "Trust",
      "This is an early, unaudited web client. Use a host you trust to deliver the published code. Share secret room links privately.",
    ],
  ]) {
    d.append(el("h3", null, h), el("p", "info-text", t));
  }
}
function updateMode() {
  let permanent =
    document.querySelector('[name="mode"]:checked').value === "saved";
  $("modeHint").textContent = permanent
    ? "Reuse this code on this browser and earn an activity badge."
    : "Your person code expires when you leave this session.";
  $("enterBtn").querySelector("span").textContent =
    saved && permanent ? "Open my workspace" : "Create my person code";
}
document
  .querySelectorAll('[name="mode"]')
  .forEach((n) => (n.onchange = updateMode));
async function init() {
  api("info", {}, "")
    .then((x) => (storage = x.storage))
    .catch(() => {});
  try {
    saved = await idb("readonly", (s) => s.get("current"));
    if (saved) {
      $("name").value = saved.name;
      document.querySelector('[value="saved"]').checked = true;
      updateMode();
    }
  } catch {
  } finally {
    entryReady = true;
  }
  if (pending)
    $("modeHint").textContent =
      "Create an identity to open the room invitation.";
}
init();
$("identityForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!entryReady) return;
  const alias = $("name").value.trim();
  if (!alias) {
    $("entryError").textContent = "Enter a display name.";
    return;
  }
  const btn = $("enterBtn");
  btn.disabled = true;
  $("entryError").textContent = "";
  try {
    if (!crypto.subtle)
      throw Error(
        "Open this app over HTTPS or localhost to use encrypted messaging.",
      );
    keep = document.querySelector('[name="mode"]:checked').value === "saved";
    const identity = keep && saved ? saved.device : await makeDevice();
    const challenge = await api("challenge", {}, ""),
      proof = await signText(
        identity.signKey,
        loginProof(location.origin, challenge.nonce),
      );
    const result = await api(
      "session",
      { box: identity.box, sign: identity.sign, proof, nonce: challenge.nonce },
      "",
    );
    if (result.code !== identity.code)
      throw Error("The relay returned a different device code.");
    if (keep) {
      try {
        await idb("readwrite", (s) =>
          s.put({ device: identity, name: alias }, "current"),
        );
        await api("save", {}, result.token);
      } catch (err) {
        await api("disconnect", {}, result.token).catch(() => {});
        throw err;
      }
      saved = { device: identity, name: alias };
    }
    name = alias;
    device = identity;
    token = result.token;
    storage = result.storage;
    epoch++;
    $("entry").hidden = true;
    $("workspace").hidden = false;
    $("topName").textContent = name;
    render();
    await poll();
    if (pending) {
      const inv = pending;
      pending = null;
      offer(inv);
    }
  } catch (err) {
    $("entryError").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
};
function roomState(inv) {
  return {
    lastSync: Date.now(),
    id: inv.room,
    key: inv.key,
    label: inv.label,
    kind: inv.kind,
    owner: inv.owner || "",
    peers: [],
    msgs: [],
    seen: new Set(),
    draft: "",
    expires: Date.now() + 3600000,
  };
}
function addRoom(inv) {
  const r = roomState(inv);
  rooms.set(r.id, r);
  openRoom(r.id);
  return r;
}
function openRoom(id) {
  if (current && rooms.has(current))
    rooms.get(current).draft = $("draft").value;
  current = id;
  const r = rooms.get(id);
  $("draft").value = r?.draft || "";
  $("workspace").classList.toggle("chat-open", !!r);
  render();
}
async function create(kind, label) {
  const result = await api("create", { kind });
  return addRoom({
    room: result.room,
    key: random(32),
    kind,
    label,
    owner: device.code,
  });
}
function newConversation() {
  const d = dialog("New conversation", "square-pen");
  d.append(
    option(
      "Message a person",
      "Invite someone using their person code.",
      "message",
      () => composeNew("direct"),
    ),
    option(
      "Create a discussion",
      "Open a temporary room for up to eight people.",
      "layers",
      () => composeNew("discussion"),
    ),
    option(
      "Join with an invite",
      "Paste a private room link.",
      "link",
      pasteInvite,
    ),
  );
}
async function lookupPerson(input) {
  const code = input.trim().toUpperCase();
  return verifyRecipient(code, await api("lookup", { code }));
}
function composeNew(kind) {
  const direct = kind === "direct",
    d = dialog(
      direct ? "Message a person" : "Create discussion",
      direct ? "message" : "layers",
    ),
    f = field(
      direct ? "Person code" : "Discussion name",
      direct ? "PC-…" : "e.g. Weekend plans",
      direct ? 64 : 48,
    );
  d.append(f.w);
  if (direct)
    d.append(
      el(
        "p",
        "info-text",
        "They must open PriChat to receive your invitation.",
      ),
    );
  const go = button(
    direct ? "Send invitation" : "Create room",
    async () => {
      const value = f.i.value.trim();
      if (!value)
        throw Error(
          direct ? "Paste a person code." : "Enter a discussion name.",
        );
      const peer = direct ? await lookupPerson(value) : null;
      if (peer?.code === device.code)
        throw Error("Enter another person’s code.");
      const r = await create(kind, direct ? "Direct chat" : value);
      try {
        if (peer) {
          await inviteByCode(r, peer);
          toast("Invitation sent.");
          close();
        } else {
          inviteDialog(r);
        }
      } catch (err) {
        await api("leave", { room: r.id }).catch(() => {});
        rooms.delete(r.id);
        openRoom("");
        throw err;
      }
    },
    "primary",
  );
  actions(d, go);
  f.i.onkeydown = (e) => {
    if (e.key === "Enter") go.click();
  };
  f.i.focus();
}
async function inviteByCode(r, peer) {
  const i = {
    room: r.id,
    key: r.key,
    grant: random(32),
    label: r.label,
    kind: r.kind,
    owner: device.code,
    fromName: name,
  };
  const parcel = await packInvite(device, peer, i);
  await api("invite", {
    room: r.id,
    digest: await digest(i.grant),
    target: peer.code,
    parcel,
  });
}
function inviteDialog(r) {
  if (!r || r.owner !== device.code) return;
  const d = dialog("Invite to " + r.label, "user-plus"),
    f = field("Person code", "PC-…", 64);
  d.append(f.w);
  actions(
    d,
    button(
      "Send invitation",
      async () => {
        const peer = await lookupPerson(f.i.value);
        await inviteByCode(r, peer);
        close();
        toast("Invitation sent.");
      },
      "primary",
    ),
  );
  d.append(
    el("h3", null, "One-use room link"),
    el(
      "p",
      "info-text",
      "Anyone holding this link can join once. It expires in ten minutes. Share it privately.",
    ),
  );
  actions(
    d,
    button("Create invite link", async () => {
      const i = {
        room: r.id,
        key: r.key,
        grant: random(32),
        label: r.label,
        kind: r.kind,
        owner: device.code,
      };
      await api("invite", { room: r.id, digest: await digest(i.grant) });
      const url =
        location.origin + "/#" + encodeURIComponent(JSON.stringify(i));
      const body = dialog("Private room link", "link"),
        out = el("textarea", "code-output");
      out.value = url;
      out.readOnly = true;
      out.rows = 3;
      body.append(
        el("p", "info-text", "This one-use link includes the room key."),
        out,
      );
      actions(
        body,
        button("Copy link", () => copy(url), "primary"),
      );
    }),
  );
}
function pasteInvite() {
  const d = dialog("Join with an invite", "link"),
    f = field("Room link", "Paste your private invitation", 4000);
  d.append(f.w);
  actions(
    d,
    button(
      "Open invitation",
      () => {
        let inv;
        try {
          const u = new URL(f.i.value);
          if (u.origin !== location.origin) throw Error();
          inv = JSON.parse(decodeURIComponent(u.hash.slice(1)));
        } catch {
          throw Error("Use an invitation from this PriChat instance.");
        }
        if (!validInvite(inv)) throw Error("Invalid invitation.");
        offer(inv);
      },
      "primary",
    ),
  );
}
function offer(inv, id) {
  const d = dialog(
    inv.kind === "direct" ? "Direct invitation" : "Discussion invitation",
    "message",
  );
  d.append(
    el(
      "p",
      "modal-copy",
      (inv.fromName || "Someone") +
        " invited you to " +
        inv.label +
        ". Leaving will close the room for everyone.",
    ),
  );
  actions(
    d,
    button("Decline", async () => {
      if (id) await api("decline", { id });
      invites.delete(id);
      close();
      render();
    }),
    button(
      "Join room",
      async () => {
        await api("join", { room: inv.room, grant: inv.grant });
        addRoom(inv);
        invites.delete(id);
        close();
        render();
        poll();
        toast("Joined the room.");
      },
      "primary",
    ),
  );
}
function profile() {
  if (!device) {
    const d = dialog("Your identity", "fingerprint");
    d.append(
      el(
        "p",
        "modal-copy",
        "Choose a display name to create your person code. Temporary identities last for this tab. Saved identities can be reopened on this device.",
      ),
    );
    actions(
      d,
      button(
        "Choose a name",
        () => {
          close();
          $("name").focus();
        },
        "primary",
      ),
    );
    return;
  }
  const d = dialog(name, "fingerprint");
  d.append(
    el("p", "info-text", keep ? "Saved on this device" : "Temporary identity"),
    el("div", "code-output", device.code),
  );
  actions(
    d,
    button("Copy person code", () => copy(device.code), "primary"),
  );
  d.append(
    el("h3", null, "Your connections"),
    el(
      "p",
      "info-text",
      connections +
        " active " +
        (connections === 1 ? "connection" : "connections") +
        " for this person code.",
    ),
    el("h3", null, "Activity badge"),
    el(
      "p",
      "info-text",
      keep
        ? days >= 3
          ? "Blue tick unlocked for this device."
          : (days || 0) +
            " / 3 messaging days. Send to an occupied room on three different UTC dates."
        : "Keep this identity to earn a blue tick after messaging other people on three different days.",
    ),
  );
  if (!keep)
    actions(
      d,
      button("Keep this identity", async () => {
        if (saved && saved.device.code !== device.code)
          throw Error(
            "This browser already has a saved identity. Open and forget it before saving another.",
          );
        await idb("readwrite", (s) => s.put({ device, name }, "current"));
        await api("save");
        saved = { device, name };
        keep = true;
        days = 0;
        render();
        profile();
      }),
    );
  actions(
    d,
    button("Leave session", () => confirmExit(false)),
    ...(keep
      ? [button("Forget identity", () => confirmExit(true), "secondary danger")]
      : []),
  );
}
function confirmExit(forget) {
  const d = dialog(
    forget ? "Forget this identity?" : "Leave this session?",
    "exit",
  );
  d.append(
    el(
      "p",
      "modal-copy",
      forget
        ? "This deletes the saved device keys and activity badge. Its active rooms close for everyone."
        : "Your active rooms will close for everyone. " +
            (keep
              ? "Your saved code stays on this device."
              : "Your temporary code will be lost."),
    ),
  );
  actions(
    d,
    button("Cancel", close),
    button(
      forget ? "Forget identity" : "Leave session",
      async () => {
        await api(forget ? "forget" : "disconnect");
        if (forget) await idb("readwrite", (s) => s.delete("current"));
        token = "";
        epoch++;
        location.replace(location.pathname);
      },
      "secondary danger",
    ),
  );
}
function confirmLeave() {
  const r = rooms.get(current);
  if (!r) return;
  const d = dialog("Close this room?", "exit");
  d.append(
    el(
      "p",
      "modal-copy",
      "Leaving ends " +
        r.label +
        " for every member. Chat history will disappear from connected clients.",
    ),
  );
  actions(
    d,
    button("Keep chatting", close),
    button(
      "Leave and close",
      async () => {
        await api("leave", { room: r.id });
        rooms.delete(r.id);
        openRoom("");
        close();
        toast("Room closed for everyone.");
      },
      "secondary danger",
    ),
  );
}
let workspaceVersion = "";
function render() {
  if (!device) return;
  const version = JSON.stringify([
    device.code,
    name,
    keep,
    days,
    current,
    filter,
    Array.from(rooms.values(), (r) => [
      r.id,
      r.owner,
      r.peers.map((p) => [p.code, p.badge]),
      r.msgs.length,
      r.msgs.at(-1)?.seq,
    ]),
    Array.from(invites.keys()),
  ]);
  if (version === workspaceVersion) return;
  workspaceVersion = version;
  $("quickCode").textContent = device.code;
  const card = $("identityCard"),
    av = el("span", "av", name.slice(0, 1).toUpperCase()),
    info = el("span", "details"),
    pn = el("strong", null, name);
  if (days >= 3) pn.append(" ", badge());
  info.append(
    pn,
    el("small", null, keep ? "Saved identity" : "Temporary identity"),
  );
  card.replaceChildren(av, info, icon("fingerprint"));
  const list = $("roomList");
  list.replaceChildren();
  const visible = Array.from(rooms.values()).filter(
    (r) => filter === "all" || r.kind === filter,
  );
  if (!visible.length)
    list.append(
      el(
        "p",
        "side-empty",
        "No " +
          (filter === "all"
            ? "conversations"
            : filter === "direct"
              ? "direct chats"
              : "discussions") +
          " yet.",
      ),
    );
  for (const r of visible) {
    const b = button(
        "",
        () => openRoom(r.id),
        "room-row" + (r.id === current ? " selected" : ""),
      ),
      a = el("span", "room-avatar"),
      t = el("span", "details");
    a.append(icon(r.kind === "direct" ? "message" : "layers"));
    t.append(
      el("strong", null, displayRoom(r)),
      el("small", null, r.msgs.at(-1)?.text || "Temporary room"),
    );
    b.append(a, t);
    list.append(b);
  }
  const ib = $("invitations");
  ib.replaceChildren();
  ib.hidden = invites.size === 0;
  if (invites.size) ib.append(el("p", "invite-label", "Invitations"));
  for (const [id, v] of invites) {
    const b = button("", () => offer(v, id), "invite-row"),
      det = el("span", "details");
    det.append(
      el("strong", null, v.fromName || "Room invitation"),
      el("small", null, v.label),
    );
    b.append(icon("user-plus"), det);
    ib.append(b);
  }
  const r = rooms.get(current);
  $("emptyChat").hidden = !!r;
  $("roomPanel").hidden = !r;
  if (!r) {
    $("thread").replaceChildren();
    $("roomTitle").textContent = "";
    $("roomSub").textContent = "";
    threadVersion = "";
    return;
  }
  $("roomTitle").textContent = displayRoom(r);
  $("roomSub").textContent = (r.peers.length || 1) + " in room · Temporary";
  $("inviteBtn").hidden =
    r.owner !== device.code || (r.kind === "direct" && r.peers.length >= 2);
  renderThread(r);
}
function displayRoom(r) {
  return r.kind === "direct"
    ? r.msgs.find((m) => m.code !== device.code)?.name || r.label
    : r.label;
}
let threadVersion = "";
function renderThread(r) {
  const v =
    r.id +
    ":" +
    r.msgs.length +
    ":" +
    (r.msgs.at(-1)?.seq || 0) +
    ":" +
    r.peers.map((p) => p.badge).join("");
  if (threadVersion === v) return;
  threadVersion = v;
  const thread = $("thread"),
    atBottom =
      thread.scrollHeight - thread.scrollTop - thread.clientHeight < 90;
  thread.replaceChildren();
  if (!r.msgs.length)
    thread.append(
      el(
        "p",
        "room-info",
        r.peers.length > 1
          ? "Say hello to the room."
          : "Invite someone to start chatting.",
      ),
    );
  for (const m of r.msgs) {
    const own = m.code === device.code,
      n = el("div", "msg" + (own ? " own" : "")),
      meta = el("div", "meta", own ? "You" : m.name);
    if (r.peers.find((p) => p.code === m.code)?.badge) meta.append(badge());
    meta.append(
      el(
        "time",
        null,
        new Date(m.created).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      ),
    );
    n.append(meta, el("p", "bubble", m.text));
    thread.append(n);
  }
  if (atBottom || r.msgs.at(-1)?.code === device.code)
    thread.scrollTop = thread.scrollHeight;
}
async function poll() {
  clearTimeout(timer);
  if (!token) return;
  if (busy) {
    timer = setTimeout(poll, 250);
    return;
  }
  busy = true;
  const ticket = epoch,
    known = new Set(rooms.keys());
  try {
    const data = await api("sync", {
      after,
      activity: document.hidden ? "away" : current ? "in a room" : "available",
    });
    if (ticket !== epoch) return;
    days = data.days;
    connections = data.connections;
    const active = new Set(data.rooms.map((r) => r.id));
    for (const id of known) {
      if (!active.has(id) && rooms.has(id)) {
        rooms.delete(id);
        if (current === id) {
          openRoom("");
          if ($("modal").open) close();
        }
        toast("A member left or the room expired.");
      }
    }
    for (const row of data.rooms) {
      const r = rooms.get(row.id);
      if (r) {
        r.lastSync = Date.now();
        r.owner = row.owner;
        r.peers = data.peers.filter((p) => p.room === row.id);
        r.expires = row.expires;
      }
    }
    for (const e of data.events) {
      after = Math.max(after, e.seq);
      const r = rooms.get(e.room),
        p = r?.peers.find((p) => p.code === e.code);
      if (!r || !p || r.seen.has(e.packet.slice(-86))) continue;
      try {
        const v = await unpackMessage(p, r.id, r.key, e.packet);
        if (
          typeof v.text !== "string" ||
          typeof v.name !== "string" ||
          v.text.length > 1500
        )
          continue;
        r.seen.add(e.packet.slice(-86));
        r.msgs.push({
          seq: e.seq,
          name: v.name.slice(0, 32),
          code: p.code,
          text: v.text,
          created: e.created,
        });
        if (r.msgs.length > 500) {
          r.msgs.shift();
        }
      } catch {
        /* Drop invalid or unauthenticated packets. */
      }
    }
    const incoming = new Set(data.invites.map((i) => i.id));
    for (const id of invites.keys()) if (!incoming.has(id)) invites.delete(id);
    for (const i of data.invites) {
      if (invites.has(i.id)) continue;
      try {
        const inv = await unpackInvite(
          device,
          { code: i.sender, box: i.box, sign: i.sign },
          i.parcel,
        );
        if (validInvite(inv) && inv.owner === i.sender) invites.set(i.id, inv);
      } catch {}
    }
    render();
  } catch (e) {
    if (e.status === 401) {
      clearTimeout(timer);
      token = "";
      rooms.clear();
      current = "";
      $("workspace").hidden = true;
      $("entry").hidden = false;
      $("topName").textContent = "Your identity";
      device = null;
      $("entryError").textContent = e.message;
      return;
    }
    for (const [id, r] of rooms) {
      if (Date.now() - r.lastSync >= 90000 || Date.now() >= r.expires) {
        rooms.delete(id);
        if (current === id) {
          openRoom("");
          if ($("modal").open) close();
        }
      }
    }
    render();
    if (!document.hidden) toast(e.message);
  } finally {
    busy = false;
    if (token) timer = setTimeout(poll, document.hidden ? 5000 : 1500);
  }
}
$("composer").onsubmit = async (e) => {
  e.preventDefault();
  const r = rooms.get(current),
    draft = $("draft"),
    text = draft.value.trim();
  if (!r || !text) return;
  const btn = $("composer").querySelector(".send");
  btn.disabled = true;
  try {
    await api("send", {
      room: r.id,
      packet: await packMessage(device, r.id, r.key, { name, text }),
    });
    if (current === r.id && draft.value.trim() === text) draft.value = "";
    r.draft = "";
    await poll();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    draft.focus();
  }
};
$("quickCopy").onclick = () => device && copy(device.code);
$("privacy").onclick = privacy;
$("profileTop").onclick = profile;
$("identityCard").onclick = profile;
$("newChat").onclick = newConversation;
$("leaveBtn").onclick = confirmLeave;
$("inviteBtn").onclick = () => inviteDialog(rooms.get(current));
document
  .querySelectorAll("[data-action]")
  .forEach(
    (b) =>
      (b.onclick = () =>
        ({ inbox: () => openRoom(""), new: newConversation, profile, privacy })[
          b.dataset.action
        ]()),
  );
document.querySelectorAll("[data-filter]").forEach(
  (b) =>
    (b.onclick = () => {
      filter = b.dataset.filter;
      document
        .querySelectorAll("[data-filter]")
        .forEach((x) => x.classList.toggle("active", x === b));
      render();
    }),
);
$("emojiBtn").onclick = () => {
  const d = dialog("Choose emoji", "smile"),
    g = el("div", "emoji-grid");
  for (const e of [
    "🙂",
    "👋",
    "💜",
    "✨",
    "👍",
    "🎉",
    "🤍",
    "😂",
    "🙌",
    "🌙",
    "💬",
    "🔥",
  ])
    g.append(
      button(
        e,
        () => {
          if ($("draft").value.length < 1498) $("draft").value += e;
          close();
          $("draft").focus();
        },
        "",
      ),
    );
  d.append(g);
};
window.addEventListener("pagehide", () => {
  if (token)
    fetch("/api/disconnect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: "{}",
      keepalive: true,
    }).catch(() => {});
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted) location.reload();
});
let lastActive = Date.now();
document.addEventListener("visibilitychange", () => {
  if (!token) return;
  if (document.hidden) {
    lastActive = Date.now();
    return;
  }
  if (Date.now() - lastActive > 90000) {
    rooms.clear();
    openRoom("");
    toast("Active rooms cleared after inactivity.");
  }
  poll();
});
