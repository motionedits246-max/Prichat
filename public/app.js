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
function icon(name) {
  const i = document.createElement("i");
  i.setAttribute("aria-hidden", "true");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg"),
    use = document.createElementNS(ns, "use");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  use.setAttribute("href", "/lucide.svg#" + name);
  svg.append(use);
  i.append(svg);
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
  d.classList.remove("profile-sheet");
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
let pending = null,
  deferredAction = "";
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
  if (pending) {
    startIdentity();
    $("modeHint").textContent = "Choose a name to open this room invitation.";
  }
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
    $("workspace").classList.remove("entry-open");
    $("findRoom").value = "";
    $("searchRow").hidden = true;
    $("searchToggle").setAttribute("aria-expanded", "false");
    for (const row of $("starterRows").children) row.hidden = false;
    render();
    await poll();
    if (pending) {
      const inv = pending;
      pending = null;
      offer(inv);
    } else if (deferredAction) {
      const next = deferredAction;
      deferredAction = "";
      runAction(next);
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
  $("entry").hidden = true;
  $("workspace").classList.remove("entry-open");
  const r = rooms.get(id);
  $("draft").value = r?.draft || "";
  $("workspace").classList.toggle("chat-open", !!r);
  updateSend();
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
  const d = dialog(name, "fingerprint");
  $("modal").classList.add("profile-sheet");
  $("modalIcon").replaceChildren(avatar("noir"));
  if (days >= 3) $("modalTitle").append(badge());
  d.append(
    el("p", "info-text", keep ? "Saved on this device" : "Temporary identity"),
  );
  const copyCode = button("", () => copy(device.code), "identity-code");
  copyCode.setAttribute("aria-label", "Copy person code");
  copyCode.append(el("code", null, device.code), icon("copy"));
  d.append(copyCode);
  for (const [glyph, label, value] of [
    ["activity", "Active connections", String(connections)],
    [
      "badge",
      "Activity badge",
      keep ? (days >= 3 ? "Unlocked" : (days || 0) + " / 3 days") : "Temporary",
    ],
  ]) {
    const line = el("div", "stat-line");
    line.append(
      icon(glyph),
      el("span", null, label),
      el("strong", null, value),
    );
    d.append(line);
  }
  d.append(
    el(
      "p",
      "helper",
      keep
        ? "Message others on three different UTC dates to earn the blue tick."
        : "Keep this identity to earn a badge across visits.",
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
  const search = $("findRoom").value.trim().toLocaleLowerCase();
  const version = JSON.stringify([
    device.code,
    name,
    keep,
    days,
    current,
    filter,
    search,
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
  $("selfDot").hidden = false;
  $("profileTop").setAttribute("aria-label", "Your identity: " + name);
  $("orbitName").textContent = name;
  $("begin").hidden = true;
  $("emptyCopy").textContent =
    "Select a conversation to start messaging privately, right here in this window.";
  $("listTitle").textContent =
    filter === "discussion"
      ? "Discussions"
      : filter === "direct"
        ? "Direct chats"
        : "Messages";
  const list = $("roomList");
  list.replaceChildren();
  const visible = [...rooms.values()]
    .filter(
      (r) =>
        (filter === "all" || r.kind === filter) &&
        (!search ||
          displayRoom(r).toLocaleLowerCase().includes(search) ||
          r.msgs.some((m) => m.text.toLocaleLowerCase().includes(search))),
    )
    .sort(
      (a, b) => (b.msgs.at(-1)?.created || 0) - (a.msgs.at(-1)?.created || 0),
    );
  const starters = !rooms.size && !search && filter === "all";
  $("starterRows").hidden = !starters;
  $("listCaption").textContent = starters
    ? "Start a conversation"
    : search
      ? "Search results"
      : "Recent conversations";
  if (!visible.length && !starters)
    list.append(
      el(
        "p",
        "side-empty",
        search ? "No matching conversations." : "No conversations here yet.",
      ),
    );
  for (const r of visible) {
    const b = button(
      "",
      () => openRoom(r.id),
      "room-row" + (r.id === current ? " selected" : ""),
    );
    const wrap = el("span", "list-face");
    wrap.append(avatar(r.kind === "direct" ? "noir" : "violet"));
    const details = el("span", "details"),
      title = el("strong", null, displayRoom(r)),
      last = r.msgs.at(-1);
    if (
      r.kind === "direct" &&
      r.peers.some((p) => p.code !== device.code && p.badge)
    )
      title.append(badge());
    details.append(title, el("small", null, last?.text || "Temporary room"));
    const age = el("span", "row-age");
    age.append(
      el("span", null, last ? clock(last.created) : ""),
      icon(last ? "circle-check" : "hourglass"),
    );
    b.append(wrap, details, age);
    list.append(b);
  }
  const ib = $("invitations");
  ib.replaceChildren();
  ib.hidden = !invites.size;
  $("inviteDot").hidden = !invites.size;
  if (invites.size) {
    ib.append(el("p", "invite-label", "Invitations"));
    for (const [id, v] of invites) {
      ib.append(
        option(v.fromName || "Room invitation", v.label, "user-plus", () =>
          offer(v, id),
        ),
      );
    }
  }
  const r = rooms.get(current);
  $("emptyChat").hidden = !!r || !$("entry").hidden;
  $("roomPanel").hidden = !r;
  $("roomPanel").classList.toggle("discussion", r?.kind === "discussion");
  if (!r) {
    $("thread").replaceChildren();
    $("roomTitle").textContent = "";
    $("roomSub").textContent = "";
    threadVersion = "";
    return;
  }
  $("roomTitle").textContent = displayRoom(r);
  $("roomSub").textContent = (r.peers.length || 1) + " in room · Temporary";
  $("headAvatar").className =
    "avatar " + (r.kind === "direct" ? "noir" : "violet");
  $("draft").placeholder = "Message " + displayRoom(r) + "…";
  $("inviteBtn").hidden =
    r.owner !== device.code || (r.kind === "direct" && r.peers.length >= 2);
  updateSend();
  renderThread(r);
}
function displayRoom(r) {
  return r.kind === "direct"
    ? r.msgs.find((m) => m.code !== device.code)?.name || r.label
    : r.label;
}
function avatar(style) {
  const a = el("span", "avatar " + style);
  a.setAttribute("aria-hidden", "true");
  return a;
}
function clock(t) {
  return new Date(t).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
let threadVersion = "";
function renderThread(r) {
  const v = [
    r.id,
    r.msgs.length,
    r.msgs.at(-1)?.seq,
    r.peers.length,
    r.peers.map((p) => p.badge).join(""),
  ].join(":");
  if (threadVersion === v) return;
  const changedRoom = !threadVersion.startsWith(r.id + ":");
  threadVersion = v;
  const thread = $("thread"),
    atBottom =
      thread.scrollHeight - thread.scrollTop - thread.clientHeight < 90;
  thread.replaceChildren();
  let day = "";
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
    const dt = new Date(m.created),
      date = dt.toDateString();
    if (date !== day) {
      thread.append(
        el(
          "div",
          "date-pill",
          dt.toLocaleDateString([], { month: "long", day: "numeric" }),
        ),
      );
      day = date;
    }
    const own = m.code === device.code,
      row = el("div", "msg" + (own ? " own" : "")),
      body = el("div", "message-body");
    if (!own) {
      row.append(avatar("noir"));
      const meta = el("span", "meta", m.name);
      if (r.peers.some((p) => p.code === m.code && p.badge))
        meta.append(badge());
      body.append(meta);
    }
    const foot = el("span", "meta-foot");
    foot.append(el("time", null, clock(m.created)));
    if (own) {
      const sent = icon("circle-check");
      sent.title = "Sent to room";
      foot.append(sent);
    }
    body.append(el("p", "bubble", m.text), foot);
    row.append(body);
    thread.append(row);
  }
  if (changedRoom || atBottom || r.msgs.at(-1)?.code === device.code)
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
      device = null;
      after = 0;
      invites.clear();
      filter = "all";
      workspaceVersion = "";
      threadVersion = "";
      $("thread").replaceChildren();
      $("draft").value = "";
      $("roomTitle").textContent = "";
      $("roomSub").textContent = "";
      $("roomList").replaceChildren();
      $("invitations").replaceChildren();
      $("invitations").hidden = true;
      $("starterRows").hidden = false;
      $("listTitle").textContent = "Messages";
      $("listCaption").textContent = "Start a conversation";
      $("emptyCopy").textContent =
        "Choose a name to start messaging privately.";
      $("inviteDot").hidden = true;
      $("findRoom").value = "";
      $("name").value = saved?.name || "";
      $("orbitName").textContent = "My identity";
      $("selfDot").hidden = true;
      $("profileTop").setAttribute("aria-label", "Your identity");
      $("begin").hidden = false;
      if ($("modal").open) close();
      startIdentity();
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
  if (!r || !text || r.sending) return;
  r.sending = true;
  updateSend();
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
    r.sending = false;
    updateSend();
    if (current === r.id) draft.focus();
  }
};
function hideMenus() {
  $("inboxMenu").hidden = true;
  $("menuToggle").setAttribute("aria-expanded", "false");
}
function startIdentity(next = "") {
  deferredAction = next;
  $("entry").hidden = false;
  $("emptyChat").hidden = true;
  $("roomPanel").hidden = true;
  $("workspace").classList.add("entry-open");
  $("name").focus();
}
function guestsInbox() {
  deferredAction = "";
  $("entry").hidden = true;
  $("emptyChat").hidden = false;
  $("workspace").classList.remove("entry-open", "chat-open");
}
function chooseFilter(value) {
  filter = value;
  $("findRoom").value = "";
  $("searchRow").hidden = true;
  $("searchToggle").setAttribute("aria-expanded", "false");
  document
    .querySelectorAll(".rail-dock button")
    .forEach((b) =>
      b.classList.toggle(
        "nav-current",
        b.dataset.action === (value === "discussion" ? "discussions" : "inbox"),
      ),
    );
  openRoom("");
  render();
}
function showInvitations() {
  const d = dialog("Invitations", "bell");
  if (!invites.size)
    d.append(el("p", "modal-copy", "New room invitations will appear here."));
  for (const [id, v] of invites)
    d.append(
      option(v.fromName || "Room invitation", v.label, "user-plus", () =>
        offer(v, id),
      ),
    );
}
function roomDetails() {
  const r = rooms.get(current);
  if (!r) return;
  const d = dialog(displayRoom(r), r.kind === "direct" ? "message" : "users");
  d.append(
    el(
      "p",
      "modal-copy",
      (r.peers.length || 1) +
        " in room. Leaving closes this conversation for everyone.",
    ),
  );
  if (!$("inviteBtn").hidden)
    d.append(
      option(
        "Invite someone",
        "Send a person-code or one-use invitation.",
        "user-plus",
        () => inviteDialog(r),
      ),
    );
  d.append(
    option(
      "Leave room",
      "End the conversation for every member.",
      "exit",
      confirmLeave,
    ),
  );
}
function runAction(action) {
  hideMenus();
  if (action === "privacy") {
    privacy();
    return;
  }
  if (action === "inbox") {
    if (device) chooseFilter("all");
    else guestsInbox();
    return;
  }
  if (!device) {
    startIdentity(action === "enter" ? "" : action);
    return;
  }
  const handlers = {
    new: newConversation,
    direct: () => composeNew("direct"),
    group: () => composeNew("discussion"),
    join: pasteInvite,
    profile,
    code: () => copy(device.code),
    directs: () => chooseFilter("direct"),
    discussions: () => chooseFilter("discussion"),
    invitations: showInvitations,
    "room-actions": roomDetails,
  };
  handlers[action]?.();
}
function updateSend() {
  $("composer").querySelector(".send").disabled =
    !current || !!rooms.get(current)?.sending || !$("draft").value.trim();
}
$("draft").oninput = updateSend;
$("profileTop").onclick = () => runAction("profile");
$("leaveBtn").onclick = confirmLeave;
$("roomInfo").onclick = roomDetails;
$("inviteBtn").onclick = () => inviteDialog(rooms.get(current));
$("searchToggle").onclick = () => {
  hideMenus();
  $("searchRow").hidden = !$("searchRow").hidden;
  $("searchToggle").setAttribute(
    "aria-expanded",
    String(!$("searchRow").hidden),
  );
  if (!$("searchRow").hidden) $("findRoom").focus();
  else {
    $("findRoom").value = "";
    renderSearch();
  }
};
function renderSearch() {
  if (device) {
    render();
    return;
  }
  const term = $("findRoom").value.trim().toLowerCase();
  const rows = [...$("starterRows").children];
  for (const row of rows)
    row.hidden = !!term && !row.textContent.toLowerCase().includes(term);
  $("roomList").replaceChildren();
  if (rows.every((row) => row.hidden))
    $("roomList").append(el("p", "side-empty", "No matching actions."));
}
$("findRoom").oninput = renderSearch;
$("clearSearch").onclick = () => {
  $("searchRow").hidden = true;
  $("findRoom").value = "";
  $("searchToggle").setAttribute("aria-expanded", "false");
  renderSearch();
  $("searchToggle").focus();
};
$("menuToggle").onclick = () => {
  const open = $("inboxMenu").hidden;
  $("inboxMenu").hidden = !open;
  $("menuToggle").setAttribute("aria-expanded", String(open));
  if (open) $("inboxMenu").querySelector("button").focus();
};
document.addEventListener("click", (e) => {
  if (!e.target.closest("#menuToggle,#inboxMenu")) hideMenus();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("inboxMenu").hidden) {
    hideMenus();
    $("menuToggle").focus();
  }
});
document
  .querySelectorAll("[data-action]")
  .forEach((b) => (b.onclick = () => runAction(b.dataset.action)));

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
