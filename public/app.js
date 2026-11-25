import { avatarSource } from "./avatar.js";
import { createPanels } from "./panels.js";
import { shareMenu } from "./share.js";
import {
  parseActivity,
  applyActivity,
  describe,
  activityCard,
} from "./activities.js";
import {
  profilePhoto,
  validPhoto,
  uploadFile,
  downloadFile,
  mediaTag,
} from "./media.js";
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
let dialogCleanup = null;
function clearDialogResources() {
  dialogCleanup?.();
  dialogCleanup = null;
}
function dialog(title, glyph) {
  clearDialogResources();
  const d = $("modal");
  d.classList.remove("profile-sheet", "activity-sheet", "share-sheet");
  $("modalBody").classList.remove("media-detail");
  $("modalTitle").textContent = title;
  d.setAttribute("aria-labelledby", "modalTitle");
  $("modalIcon").replaceChildren(icon(glyph));
  $("modalBody").replaceChildren();
  if (!d.open) d.showModal();
  return $("modalBody");
}
const close = () => $("modal").close();
$("modal").addEventListener("close", () => {
  if (!$("modal").open) {
    clearDialogResources();
    $("modalBody").replaceChildren();
  }
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
const guestSeed = random(12);
let myPhoto = "";
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
      "Person codes, active connection counts, coarse activity, room membership, timing and encrypted packet sizes. Display names, shared profile pictures, filenames and activity contents travel inside encrypted messages or invitations. Attachment sizes and transfer timing are visible.",
    ],
    [
      "What stays on your device",
      "Room keys and readable messages live in your tab. A saved identity keeps its name, picture and keys in this browser. Downloaded files and screenshots can outlast the room.",
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
const panels = createPanels({
  $,
  el,
  icon,
  button,
  avatar,
  badge,
  dialog,
  close,
  copy,
  editPhoto,
  openFile,
  privacy,
  profile,
  displayRoom,
  roomSeed,
  peerPhoto,
  roomPhoto,
  errorNotice,
  exit: confirmExit,
  leaveRoom: confirmLeave,
  invite: inviteDialog,
  canInvite: () => {
    const room = rooms.get(current);
    return (
      room &&
      room.owner === device?.code &&
      (room.kind !== "direct" || room.peers.length < 2)
    );
  },
  state: () => ({
    device,
    name,
    keep,
    days,
    connections,
    filter,
    photo: myPhoto,
    room: rooms.get(current),
    rooms: [...rooms.values()],
  }),
  redraw: () => {
    workspaceVersion = "";
    render();
  },
  rename: async (alias) => {
    if (!alias || alias.length > 32)
      throw Error("Use a display name of 1–32 characters.");
    if (keep) {
      const record = { device, name: alias, photo: myPhoto };
      await idb("readwrite", (s) => s.put(record, "current"));
      saved = record;
    }
    name = alias;
    render();
  },
  updateRoom: async (r, setting, value) => {
    if (rooms.get(current) !== r) throw Error("This room has closed.");
    const payload =
      setting === "description"
        ? await packMessage(device, r.id, r.key, { description: value })
        : value;
    await api("room-preference", { room: r.id, setting, value: payload });
    if (setting === "description") {
      r.description = value;
      r.infoPacket = payload;
    }
    if (setting === "owner_posts") r.ownerPosts = value;
    if (setting === "lifetime") r.lifetime = value;
    r.revision++;
    render();
    await poll();
  },
});
for (const n of ownAvatarNodes()) paintPhoto(n, "");
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
          s.put(
            { device: identity, name: alias, photo: saved?.photo || "" },
            "current",
          ),
        );
        await api("save", {}, result.token);
      } catch (err) {
        await api("disconnect", {}, result.token).catch(() => {});
        throw err;
      }
      saved = { device: identity, name: alias, photo: saved?.photo || "" };
    }
    myPhoto = keep && validPhoto(saved?.photo) ? saved.photo : "";
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
    stars: new Set(),
    prefs: {},
    photos: new Map(),
    cards: new Map(),
    revision: 0,
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
  panels.leave();
  hideAttachments();
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
  $("modalIcon").replaceChildren(avatar("noir", myPhoto));
  d.append(button("Edit profile picture", editPhoto, "card-action edit-photo"));
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
        await idb("readwrite", (s) =>
          s.put({ device, name, photo: myPhoto }, "current"),
        );
        await api("save");
        saved = { device, name, photo: myPhoto };
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
        if (forget) {
          await idb("readwrite", (s) => s.delete("current"));
          localStorage.removeItem("pc-view-" + device.code);
        }
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
    connections,
    current,
    filter,
    search,
    Array.from(rooms.values(), (r) => [
      r.id,
      r.owner,
      r.peers.map((p) => [p.code, p.badge]),
      r.revision,
      r.msgs.length,
      r.msgs.at(-1)?.seq,
    ]),
    Array.from(invites.keys()),
  ]);
  if (version === workspaceVersion) return;
  workspaceVersion = version;
  panels.sync();
  for (const node of ownAvatarNodes()) paintPhoto(node, myPhoto);
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
    wrap.append(
      avatar(
        r.kind === "direct" ? "azure" : "violet",
        peerPhoto(r),
        roomSeed(r),
      ),
    );
    const details = el("span", "details"),
      title = el("strong", null, displayRoom(r)),
      last = r.msgs.at(-1);
    if (
      r.kind === "direct" &&
      r.peers.some((p) => p.code !== device.code && p.badge)
    )
      title.append(badge());
    details.append(
      title,
      el(
        "small",
        null,
        panels.previewAllowed()
          ? last?.text || "Temporary room"
          : "Temporary room",
      ),
    );
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
    "avatar " + (r.kind === "direct" ? "azure" : "violet");
  paintPhoto($("headAvatar"), peerPhoto(r), roomSeed(r));
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
function avatar(style, photo = "", seed) {
  const a = el("span", "avatar " + style);
  a.setAttribute("aria-hidden", "true");
  paintPhoto(a, photo, seed);
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
    r.revision,
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
      row.append(avatar("noir", roomPhoto(r, m.code), m.code));
      const meta = el("span", "meta", m.name);
      if (r.peers.some((p) => p.code === m.code && p.badge))
        meta.append(badge());
      body.append(meta);
    }
    const foot = el("span", "meta-foot");
    const star = button(
      "",
      () => {
        if (r.stars.has(m.seq)) r.stars.delete(m.seq);
        else r.stars.add(m.seq);
        r.revision++;
        render();
      },
      "star-toggle",
    );
    star.title = r.stars.has(m.seq) ? "Unstar message" : "Star message";
    star.setAttribute("aria-label", star.title);
    star.setAttribute("aria-pressed", String(r.stars.has(m.seq)));
    star.append(icon("star"));
    foot.append(star, el("time", null, clock(m.created)));
    if (own) {
      const sent = icon("circle-check");
      sent.title = "Sent to room";
      foot.append(sent);
    }
    const content = m.activity
      ? activityCard(m, {
          el,
          icon,
          button,
          self: device.code,
          send: (a) => sendContent(r, a),
          openFile: (f) => openFile(r, f),
        })
      : el("p", "bubble", m.text);
    body.append(content, foot);
    row.append(body);
    thread.append(row);
  }
  if (changedRoom || atBottom || r.msgs.at(-1)?.code === device.code)
    thread.scrollTop = thread.scrollHeight;
}

function expireMessages() {
  for (const r of rooms.values()) {
    const expired = r.msgs.filter(
      (m) => m.deadline && m.deadline <= Date.now(),
    );
    if (!expired.length) continue;
    for (const m of expired) {
      r.stars.delete(m.seq);
      if (["game", "poll"].includes(m.activity?.type))
        r.cards.delete(m.activity.id);
    }
    r.msgs = r.msgs.filter((m) => !m.deadline || m.deadline > Date.now());
    r.revision++;
    if (
      current === r.id &&
      $("modal").open &&
      $("modalBody").classList.contains("media-detail")
    )
      close();
  }
  render();
}
async function poll() {
  clearTimeout(timer);
  if (!token) return;
  if (busy) {
    timer = setTimeout(poll, 250);
    return;
  }
  busy = true;
  expireMessages();
  const ticket = epoch,
    known = new Set(rooms.keys());
  try {
    const data = await api("sync", {
      after,
      activity: !panels.shareActivity()
        ? "available"
        : document.hidden
          ? "away"
          : current
            ? "in a room"
            : "available",
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
        if (r.ownerPosts !== row.owner_posts || r.lifetime !== row.lifetime)
          r.revision++;
        r.ownerPosts = row.owner_posts;
        r.lifetime = row.lifetime;
        if (row.description && row.description !== r.infoPacket) {
          const owner = r.peers.find((p) => p.code === r.owner);
          if (owner)
            try {
              const info = await unpackMessage(
                owner,
                r.id,
                r.key,
                row.description,
              );
              if (typeof info.description === "string")
                r.description = info.description.slice(0, 400);
              r.infoPacket = row.description;
              r.revision++;
            } catch {}
        }
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
        const activity = v.activity ? parseActivity(v.activity) : null;
        if (v.activity && !activity) continue;
        const message = {
          seq: e.seq,
          name: v.name.slice(0, 32),
          code: p.code,
          text: activity ? describe(activity) : v.text,
          created: e.created,
          deadline: e.deadline,
          activity,
        };
        if (
          typeof v.photo === "string" &&
          (v.photo === "" || validPhoto(v.photo)) &&
          r.photos.get(p.code) !== v.photo
        ) {
          r.photos.set(p.code, v.photo);
          r.revision++;
        }
        if (!applyActivity(r, message)) continue;
        r.msgs.push(message);
        if (p.code !== device.code) panels.notify(r);
        if (r.msgs.length > 500) {
          const old = r.msgs.shift();
          r.stars.delete(old.seq);
          if (old.activity?.type === "game" || old.activity?.type === "poll")
            r.cards.delete(old.activity.id);
        }
      } catch {}
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
      myPhoto = "";
      for (const node of ownAvatarNodes()) paintPhoto(node, "");
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
function ownAvatarNodes() {
  return document.querySelectorAll(
    "#profileTop .avatar,.orbit[data-action=profile] .avatar,.entry .portrait-lg",
  );
}
function paintPhoto(el, photo, seed = device?.code || guestSeed) {
  const old = el.querySelector("img");
  const src = validPhoto(photo) ? photo : avatarSource(seed);
  if (old?.getAttribute("src") === src) return;
  const img = document.createElement("img");
  img.alt = "";
  img.src = src;
  el.replaceChildren(img);
}
function roomPhoto(r, code) {
  return code === device?.code ? myPhoto : r.photos.get(code) || "";
}
function roomSeed(r) {
  return r.kind === "direct"
    ? r.peers.find((p) => p.code !== device?.code)?.code || r.id
    : r.id;
}
function peerPhoto(r) {
  const peer = r.peers.find((p) => p.code !== device?.code);
  return r.kind === "direct" && peer ? roomPhoto(r, peer.code) : "";
}
function editPhoto() {
  const d = dialog("Profile picture", "camera");
  const wrap = el("div", "picture-editor"),
    photo = avatar("noir", myPhoto);
  let chosen = myPhoto,
    reading = false;
  const picker = el("label", "photo-pick", "Choose picture"),
    input = el("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,image/gif";
  picker.append(input);
  const label = el(
    "p",
    "helper",
    "Your picture is resized on this device and shared with your next room message.",
  );
  const save = button(
    "Save picture",
    async () => {
      if (reading) return;
      if (keep) {
        const record = { device, name, photo: chosen };
        await idb("readwrite", (s) => s.put(record, "current"));
        saved = record;
      }
      myPhoto = chosen;
      for (const x of ownAvatarNodes()) paintPhoto(x, myPhoto);
      close();
      panels.refresh();
      toast("Profile picture updated.");
    },
    "primary",
  );
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    reading = true;
    save.disabled = true;
    input.disabled = true;
    try {
      chosen = await profilePhoto(file);
      paintPhoto(photo, chosen);
    } catch (e) {
      errorNotice(e);
    } finally {
      reading = false;
      save.disabled = false;
      input.disabled = false;
    }
  };
  wrap.append(
    photo,
    picker,
    button(
      "Use default",
      () => {
        chosen = "";
        paintPhoto(photo, "");
      },
      "card-action",
    ),
  );
  d.append(wrap, label);
  actions(d, save);
}
function setSendState(r, phase, progress = null) {
  clearTimeout(r.sendTimer);
  r.feedback = phase;
  r.progress = progress;
  if (current === r.id) updateSend();
  if (phase === "sent" || phase === "failed")
    r.sendTimer = setTimeout(
      () => {
        r.feedback = "";
        if (current === r.id) updateSend();
      },
      phase === "sent" ? 1500 : 3500,
    );
}
async function sendContent(
  r,
  activity = null,
  file = null,
  onProgress = null,
  plain = "",
) {
  if (!device || rooms.get(r.id) !== r) throw Error("This room has closed.");
  if (r.sending) throw Error("Wait for the current send to finish.");
  const sender = device,
    alias = name,
    photo = myPhoto;
  r.sending = true;
  setSendState(r, "sending", file ? 0 : null);
  try {
    if (file) {
      const descriptor = await uploadFile(api, r.id, file, (p) => {
        setSendState(r, "sending", p);
        onProgress?.(p);
      });
      activity = { ...activity, file: descriptor };
    }
    if (activity && !parseActivity(activity))
      throw Error("Check the activity details.");
    const text = activity ? describe(activity) : plain;
    const packet = await packMessage(sender, r.id, r.key, {
      name: alias,
      text,
      photo,
      ...(activity ? { activity } : {}),
    });
    await api("send", {
      room: r.id,
      packet,
      ...(file ? { file: activity.file.id } : {}),
    });
    setSendState(r, "sent", 1);
    onProgress?.(1);
    void poll();
  } catch (err) {
    setSendState(r, "failed");
    throw err;
  } finally {
    r.sending = false;
    if (current === r.id) updateSend();
  }
}
function openActivities(kind = "", file = null) {
  const r = rooms.get(current);
  if (!r) return;
  shareMenu(
    {
      dialog,
      el,
      icon,
      button,
      close,
      draft: $("draft"),
      send: sendContent,
      alive: (room) => rooms.get(current) === room,
      errorNotice,
      openMenu: attachmentMenu,
      onDismiss: (fn) => {
        dialogCleanup = fn;
      },
    },
    r,
    kind,
    file,
  );
}
async function openFile(r, f) {
  if (rooms.get(current) !== r) throw Error("This room has closed.");
  const d = dialog(f.filename, mediaTag(f.mime) ? "images" : "file-text"),
    status = el("p", "info-text", "Decrypting attachment…");
  d.classList.add("media-detail");
  d.append(status);
  const marker = status;
  try {
    const blob = await downloadFile(api, r.id, f);
    if (!marker.isConnected || !$("modal").open || rooms.get(current) !== r)
      return;
    const url = URL.createObjectURL(blob);
    dialogCleanup = () => URL.revokeObjectURL(url);
    status.remove();
    const tag = mediaTag(f.mime);
    if (tag) {
      const viewer = el(tag, "media-viewer");
      if (tag === "img") viewer.alt = f.filename;
      else {
        viewer.controls = true;
        viewer.preload = "metadata";
      }
      viewer.src = url;
      d.append(viewer);
    }
    const a = el("a", "secondary download-link", "Save file");
    a.href = url;
    a.download = f.filename.replace(/[\\/\u0000-\u001f]/g, "_") || "attachment";
    d.append(a);
    if (!tag) a.click();
  } catch (err) {
    if (marker.isConnected) {
      marker.textContent = err.message;
    }
  }
}
$("composer").onsubmit = async (e) => {
  e.preventDefault();
  const r = rooms.get(current),
    draft = $("draft"),
    original = draft.value,
    text = original.trim();
  if (!r || !text || r.sending) return;
  try {
    await sendContent(r, null, null, null, text);
    if (current === r.id && draft.value === original) draft.value = "";
    if (r.draft === original) r.draft = "";
  } catch (err) {
    toast(err.message);
  } finally {
    updateSend();
    if (current === r.id && !document.querySelector("dialog[open]"))
      draft.focus();
  }
};
document.addEventListener("paste", (e) => {
  if (
    !current ||
    $("modal").open ||
    !$("detailPane").hidden ||
    !$("settingsSide").hidden ||
    !$("entry").hidden
  )
    return;
  const item = Array.from(e.clipboardData?.items || []).find(
    (x) => x.kind === "file" && x.type.startsWith("image/"),
  );
  const file = item?.getAsFile();
  if (!file) return;
  e.preventDefault();
  openActivities(file.type === "image/gif" ? "gif" : "photo", file);
});
function hideAttachments(restore = false) {
  $("attachmentMenu").hidden = true;
  $("attachmentMenu").replaceChildren();
  $("attachToggle").setAttribute("aria-expanded", "false");
  if (restore) $("attachToggle").focus();
}
function attachmentMenu(items, select) {
  const menu = $("attachmentMenu");
  if (!menu.hidden) {
    hideAttachments(true);
    return;
  }
  if ($("modal").open) close();
  for (const [kind, label, glyph] of items) {
    const b = button(
      "",
      () => {
        hideAttachments();
        select(kind, label, glyph);
      },
      "attach-item",
    );
    b.dataset.kind = kind;
    b.setAttribute("role", "menuitem");
    b.append(icon(glyph), el("span", null, label));
    menu.append(b);
  }
  menu.hidden = false;
  $("attachToggle").setAttribute("aria-expanded", "true");
  menu.firstElementChild.focus();
}
$("attachmentMenu").onkeydown = (e) => {
  const buttons = [...$("attachmentMenu").children],
    at = buttons.indexOf(document.activeElement);
  if (e.key === "Escape") {
    e.preventDefault();
    hideAttachments(true);
  }
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
    e.preventDefault();
    buttons[
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : (at + buttons.length + (e.key === "ArrowDown" ? 1 : -1)) %
            buttons.length
    ].focus();
  }
};
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#attachToggle,#attachmentMenu")) hideAttachments();
});
$("attachmentMenu").addEventListener("focusout", (e) => {
  if (
    e.relatedTarget &&
    !e.relatedTarget.closest("#attachmentMenu,#attachToggle")
  )
    hideAttachments();
});
function hideMenus() {
  $("inboxMenu").hidden = true;
  $("menuToggle").setAttribute("aria-expanded", "false");
}
function startIdentity(next = "") {
  panels.leave();
  hideAttachments();
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
function runAction(action) {
  hideMenus();
  if (action !== "room-actions") hideAttachments();
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
    profile: () => panels.settings("Account"),
    settings: () => panels.settings(),
    emoji: () => openActivities("emoji"),
    code: () => copy(device.code),
    directs: () => chooseFilter("direct"),
    discussions: () => chooseFilter("discussion"),
    invitations: showInvitations,
    "room-actions": () => openActivities(),
  };
  handlers[action]?.();
}
function updateSend() {
  const r = rooms.get(current),
    btn = $("sendBtn"),
    p = $("sendProgress"),
    phase = r?.feedback || "",
    hasText = !!$("draft").value.trim();
  const readOnly = Boolean(r?.ownerPosts && r.owner !== device?.code);
  $("draft").disabled = readOnly;
  $("attachToggle").disabled = readOnly;
  document.querySelector(".compose-emoji").disabled = readOnly;
  if (readOnly) $("draft").placeholder = "Only the room creator can post";
  btn.disabled = !r || readOnly || !!r.sending || !hasText;
  btn.dataset.phase = phase;
  const label =
    phase === "sending"
      ? "Sending"
      : phase === "sent"
        ? "Sent to room"
        : phase === "failed"
          ? "Send failed"
          : "Send message";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  p.hidden = !["sending", "sent"].includes(phase);
  if (r?.progress == null) p.removeAttribute("value");
  else p.value = r.progress;
  if ($("sendStatus").textContent !== label)
    $("sendStatus").textContent = phase ? label : "";
}
$("draft").onkeydown = (e) => {
  if (e.key === "Enter" && (!panels.enterAllowed() || e.isComposing))
    e.preventDefault();
};
$("draft").oninput = updateSend;
$("profileTop").onclick = () => runAction("profile");
$("leaveBtn").onclick = confirmLeave;
$("roomInfo").onclick = () => panels.group();
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
    if ($("modal").open) close();
    openRoom("");
    toast("Active rooms cleared after inactivity.");
  }
  poll();
});
