const sections = [
  [
    "Account & security",
    [
      ["Account", "user-round", "Name, person code, profile picture"],
      ["Privacy", "lock-keyhole", "Presence and message previews"],
      ["Security", "shield-check", "Encryption and activity badge"],
      [
        "Connections",
        "monitor-smartphone",
        "Active sessions for this person code",
      ],
    ],
  ],
  [
    "Chats & media",
    [
      ["Chats", "messages-square", "Composer and message previews"],
      ["Appearance", "palette", "Type size and chat colors"],
      ["Wallpapers", "image", "Choose a chat background"],
      ["Storage & data", "hard-drive", "Room history and shared files"],
      ["Notifications", "bell-ring", "Message sounds and tone"],
    ],
  ],
  ["Support", [["Help", "circle-help", "Privacy guide and open source"]]],
];
const backgrounds = ["Default", "Graphite", "Midnight", "Forest"];
const themes = ["Default", "Ice", "Sage", "Lilac"];
const tones = ["Glass", "Drop", "Chime"];
export function createPanels(ui) {
  const {
    $,
    el,
    icon,
    button,
    avatar,
    badge,
    state,
    dialog,
    close,
    copy,
    editPhoto,
    openFile,
  } = ui;
  const side = $("settingsSide"),
    pane = $("detailPane"),
    workspace = $("workspace");
  let mode = "",
    section = "",
    gallery = "Media",
    sub = "",
    roomId = "",
    last = "",
    bell = null;
  let prefs = {},
    prefOwner = "";
  const selected = () => state().room;
  function preferences() {
    const { device, keep } = state();
    if (device?.code !== prefOwner) {
      prefOwner = device?.code;
      prefs = {};
      if (keep)
        try {
          prefs =
            JSON.parse(localStorage.getItem("pc-view-" + prefOwner) || "{}") ||
            {};
        } catch {}
    }
    return prefs;
  }
  function setPref(key, value, room) {
    if (room) room.prefs[key] = value;
    else {
      preferences()[key] = value;
      if (state().keep)
        localStorage.setItem("pc-view-" + prefOwner, JSON.stringify(prefs));
    }
    apply();
    ui.redraw();
    refresh();
  }
  function apply() {
    const p = preferences(),
      r = selected();
    $("workspace").dataset.type = p.size || "Standard";
    $("roomPanel").dataset.wall = r?.prefs.wall || p.wall || "Default";
    $("roomPanel").dataset.theme = r?.prefs.theme || p.theme || "Default";
  }
  function btnIcon(glyph, label, fn, cls = "round") {
    const b = button("", fn, cls);
    b.title = label;
    b.setAttribute("aria-label", label);
    b.append(icon(glyph));
    return b;
  }
  function bar(title, back) {
    const h = el("header", "panel-bar"),
      name = el("h2", null, title);
    h.append(btnIcon("back", "Back", back), name);
    return h;
  }
  function block(parent, label) {
    if (label) parent.append(el("h3", "panel-label", label));
    const group = el("div", "settings-block");
    parent.append(group);
    return group;
  }
  function row(group, title, detail, glyph, fn, value) {
    const b = fn
      ? button("", fn, "setting-row")
      : el("div", "setting-row read-only");
    if (glyph) {
      const g = el("span", "setting-icon");
      g.append(icon(glyph));
      b.append(g);
    }
    const desc = el("span", "setting-copy");
    desc.append(el("strong", null, title));
    if (detail) desc.append(el("small", null, detail));
    b.append(desc);
    if (value !== undefined)
      b.append(el("span", "setting-value", String(value)));
    if (fn) b.append(icon("chevron-right"));
    group.append(b);
    return b;
  }
  function toggle(g, title, detail, glyph, key, defaultOn = false, room) {
    const source = room ? room.prefs : preferences(),
      on = source[key] ?? defaultOn;
    const b = row(g, title, detail, glyph, () => setPref(key, !on, room));
    b.lastChild.remove();
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", String(on));
    b.append(el("span", "switch-track"));
  }
  function chooser(title, glyph, options, active, onChoice) {
    const d = dialog(title, glyph);
    for (const v of options) {
      const b = button(
        "",
        async () => {
          await onChoice(v);
          if (d.isConnected && $("modal").open) close();
        },
        "picker-row",
      );
      b.append(el("span", null, v));
      if (v === active) b.append(icon("check"));
      d.append(b);
    }
  }
  function choice(g, title, detail, glyph, key, opts, room) {
    const val = room?.prefs[key] || preferences()[key] || opts[0];
    row(
      g,
      title,
      detail,
      glyph,
      () => chooser(title, glyph, opts, val, (v) => setPref(key, v, room)),
      val,
    );
  }
  function form(title, glyph, label, original, limit, save) {
    const d = dialog(title, glyph),
      f = el("form", "activity-form"),
      wrap = el("label", "share-field"),
      input = el("input", "text-input");
    input.maxLength = limit;
    input.required = title === "Display name";
    input.value = original || "";
    wrap.append(el("span", null, label), input);
    const submit = el("button", "primary", "Save");
    f.append(wrap, submit);
    d.append(f);
    f.onsubmit = async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        await save(input.value.trim());
        close();
        refresh();
      } catch (e) {
        ui.errorNotice(e);
      } finally {
        submit.disabled = false;
      }
    };
    input.focus();
  }
  function index() {
    const s = state();
    side.replaceChildren(bar("Settings", leave));
    const body = el("div", "panel-scroll settings-index");
    side.append(body);
    const card = el("div", "settings-profile");
    const portrait = btnIcon(
      "pencil",
      "Edit profile picture",
      editPhoto,
      "avatar-edit",
    );
    portrait.prepend(avatar("noir", s.photo, s.device.code));
    const account = button("", () => settings("Account"), "account-summary");
    const title = el("strong", null, s.name);
    if (s.days >= 3) title.append(badge());
    account.append(
      title,
      el("small", "short-code", s.device.code),
      el("span", "presence-pill", "Active now"),
      icon("chevron-right"),
    );
    card.append(portrait, account);
    body.append(card);
    for (const [label, items] of sections) {
      const group = block(body, label);
      for (const [title, glyph, description] of items) {
        const b = row(group, title, description, glyph, () => settings(title));
        if (section === title) b.setAttribute("aria-current", "page");
      }
    }
  }
  function coverChat(covered) {
    for (const id of ["entry", "emptyChat", "roomPanel"]) $(id).inert = covered;
  }
  function settings(page = "") {
    if (!state().device) return;
    const scroll =
      mode === "settings" ? side.lastElementChild?.scrollTop || 0 : 0;
    mode = "settings";
    section = page;
    sub = "";
    roomId = "";
    $("chatSide").hidden = true;
    side.hidden = false;
    workspace.classList.add("settings-open");
    workspace.classList.toggle("detail-open", !!page);
    document
      .querySelectorAll(".rail-dock button")
      .forEach((b) =>
        b.classList.toggle("nav-current", b.dataset.action === "settings"),
      );
    index();
    side.lastElementChild.scrollTop = scroll;
    coverChat(Boolean(page));
    pane.hidden = !page;
    pane.replaceChildren();
    if (page) {
      pane.append(bar(page, () => settings()));
      const body = el("div", "panel-scroll detail-body");
      pane.append(body);
      detail(body);
    }
    focusHeader(page ? pane : side);
  }
  function focusHeader(target) {
    const h = target.querySelector("h2");
    if (h) {
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    }
  }
  function leave() {
    coverChat(false);
    const prev = mode;
    mode = section = sub = roomId = last = "";
    pane.replaceChildren();
    side.replaceChildren();
    pane.hidden = side.hidden = true;
    $("chatSide").hidden = false;
    workspace.classList.remove("settings-open", "detail-open");
    if (prev === "settings")
      document
        .querySelectorAll(".rail-dock button")
        .forEach((b) =>
          b.classList.toggle(
            "nav-current",
            b.dataset.action ===
              (state().filter === "discussion" ? "discussions" : "inbox"),
          ),
        );
    if (prev === "group") $("roomInfo").focus();
    else if (prev === "settings") $("profileTop").focus();
  }
  function refresh() {
    if (mode === "settings") {
      const top = pane.lastElementChild?.scrollTop || 0;
      settings(section);
      if (!pane.hidden) pane.lastElementChild.scrollTop = top;
    } else if (mode === "group") group(false);
  }
  function detail(body) {
    const s = state(),
      p = preferences();
    if (section === "Account") {
      const g = block(body, "Profile");
      row(
        g,
        "Profile picture",
        "Choose a picture or restore your geometric avatar.",
        "camera",
        editPhoto,
      );
      row(
        g,
        "Display name",
        "Shown with the messages you send.",
        "pencil",
        () => form("Display name", "pencil", "Name", s.name, 32, ui.rename),
        s.name,
      );
      row(g, "Person code", s.device.code, "copy", () => copy(s.device.code));
      const a = block(body, "Identity");
      row(
        a,
        s.keep ? "Saved on this device" : "Temporary identity",
        s.keep
          ? "Reopen this person code in this browser."
          : "This code lasts for this session.",
        "fingerprint",
        ui.profile,
      );
      row(
        a,
        "Activity badge",
        s.keep
          ? (s.days || 0) + " of 3 messaging days"
          : "Available for identities kept on this device.",
        "badge",
      );
      const actions = block(body, "Session actions");
      row(actions, "Leave session", "Close your active rooms.", "exit", () =>
        ui.exit(false),
      );
      if (s.keep)
        row(
          actions,
          "Forget this identity",
          "Remove the saved keys and activity badge.",
          "fingerprint",
          () => ui.exit(true),
        ).classList.add("danger-row");
    } else if (section === "Privacy" || section === "Chats") {
      const g = block(body, section === "Chats" ? "Messages" : "Visibility");
      toggle(
        g,
        "Message previews",
        "Show the last message in the conversation list.",
        "messages-square",
        "previews",
        true,
      );
      if (section === "Chats")
        toggle(
          g,
          "Send with Enter",
          "The send button is always available.",
          "send",
          "enter",
          true,
        );
      else {
        toggle(
          g,
          "Share activity state",
          "Report in-room and away status to the relay.",
          "activity",
          "activity",
          true,
        );
        row(
          g,
          "Privacy in PriChat",
          "What participants, the relay and the network can see.",
          "shield",
          ui.privacy,
        );
      }
    } else if (section === "Appearance" || section === "Wallpapers") {
      const g = block(body, "Chat appearance");
      if (section === "Appearance") {
        choice(
          g,
          "Message size",
          "Adjust the type in your conversation.",
          "type",
          "size",
          ["Standard", "Large", "Extra large"],
        );
        choice(
          g,
          "Chat theme",
          "Default outgoing bubble color.",
          "palette",
          "theme",
          themes,
        );
      } else
        choice(
          g,
          "Wallpaper",
          "Default background for your rooms.",
          "image",
          "wall",
          backgrounds,
        );
    } else if (section === "Security") {
      const g = block(body, "Encryption");
      row(
        g,
        "End-to-end encryption",
        "Room messages are encrypted and signed on participants’ devices.",
        "shield-check",
        ui.privacy,
      );
      row(
        g,
        "Your person code",
        "Compare this with your contact through a trusted channel.",
        "fingerprint",
        () => copy(s.device.code),
      );
      row(
        g,
        "Activity badge",
        "The blue tick records activity on three UTC dates with other members.",
        "badge",
      );
    } else if (section === "Connections") {
      const g = block(body, "Current identity");
      row(
        g,
        "Active connections",
        "Open sessions using this person code.",
        "monitor-smartphone",
        null,
        s.connections,
      ).querySelector(".setting-value").id = "connectionsCount";
      row(
        g,
        "This browser",
        s.keep
          ? "Device identity saved locally."
          : "Temporary device identity.",
        "circle-user-round",
      );
    } else if (section === "Storage & data") {
      const g = block(body, "This session"),
        msgs = s.rooms.flatMap((r) => r.msgs);
      row(
        g,
        "Open rooms",
        "Held for the current session.",
        "messages-square",
        null,
        s.rooms.length,
      );
      row(
        g,
        "Messages in memory",
        "Cleared when their room closes.",
        "layers",
        null,
        msgs.length,
      );
      row(
        g,
        "Shared files",
        "Encrypted attachments in the visible history.",
        "paperclip",
        null,
        msgs.filter((m) => m.activity?.type === "file").length,
      );
    } else if (section === "Notifications") {
      const g = block(body, "Message notifications");
      toggle(
        g,
        "Message sounds",
        "Play a tone when a room receives a message.",
        "bell",
        "sounds",
      );
      choice(
        g,
        "Notification tone",
        "Sound for incoming messages.",
        "music-2",
        "tone",
        tones,
      );
      row(g, "Preview tone", "", "volume-2", () => play(p.tone || tones[0]));
    } else {
      const g = block(body, "PriChat");
      row(
        g,
        "Privacy guide",
        "How temporary rooms and device identities work.",
        "book-open",
        ui.privacy,
      );
      row(g, "Source code", "motionedits246-max / Prichat", "blocks", () =>
        window.open(
          "https://github.com/motionedits246-max/Prichat",
          "_blank",
          "noopener,noreferrer",
        ),
      );
    }
  }
  function group(reset = true) {
    const r = selected();
    if (!r) return leave();
    if (mode === "settings") leave();
    if (reset) {
      gallery = "Media";
      sub = "";
      roomId = r.id;
    }
    const scroll = !reset ? pane.lastElementChild?.scrollTop || 0 : 0;
    coverChat(true);
    mode = "group";
    pane.hidden = false;
    workspace.classList.add("detail-open");
    const own = r.owner === state().device.code;
    pane.replaceChildren(
      bar(sub || (r.kind === "discussion" ? "Group Info" : "Chat Info"), () => {
        if (sub) {
          sub = "";
          group(false);
        } else leave();
      }),
    );
    const body = el("div", "panel-scroll detail-body");
    pane.append(body);
    function openSub(page) {
      sub = page;
      group(false);
      pane.lastElementChild.scrollTop = 0;
      focusHeader(pane);
    }
    const aliases = new Map(r.msgs.map((m) => [m.code, m.name]));
    const personName = (p) =>
      p.code === state().device.code
        ? state().name
        : aliases.get(p.code) || p.code;
    const list = (label, placeholder, items, renderItem) => {
      const search = el("input", "text-input");
      search.type = "search";
      search.placeholder = placeholder;
      search.setAttribute("aria-label", placeholder);
      const result = block(body, label);
      result.before(search);
      const update = () => {
        result.replaceChildren();
        for (const item of items) {
          const label = renderItem(item);
          if (label.toLowerCase().includes(search.value.toLowerCase()))
            row(
              result,
              label,
              item.code || "",
              item.code ? "user-round" : "message",
            );
        }
        if (!result.children.length)
          result.append(el("p", "panel-empty", "No matches."));
      };
      search.oninput = update;
      update();
    };
    if (sub === "Search messages" || sub === "Starred messages") {
      const msgs = r.msgs.filter(
        (m) => sub !== "Starred messages" || r.stars.has(m.seq),
      );
      list(
        "In this room",
        "Search messages",
        msgs,
        (m) => m.name + " · " + m.text,
      );
    } else if (sub === "Participants")
      list("Room members", "Search participants", r.peers, personName);
    else {
      const hero = el("div", "group-hero"),
        face = avatar("noir", ui.peerPhoto(r), ui.roomSeed(r));
      hero.append(
        face,
        el("h3", null, ui.displayRoom(r)),
        el(
          "p",
          null,
          (r.kind === "discussion" ? "Group" : "Private chat") +
            " · " +
            r.peers.length +
            " in room",
        ),
      );
      const quick = el("div", "group-quick");
      function action(label, glyph, fn) {
        const b = button("", fn, "group-action");
        b.append(icon(glyph), el("small", null, label));
        quick.append(b);
      }
      if (ui.canInvite()) action("Add", "user-plus", () => ui.invite(r));
      action("Search", "search", () => openSub("Search messages"));
      action("Members", "users", () => openSub("Participants"));
      hero.append(quick);
      body.append(hero);
      const about = block(body);
      row(
        about,
        r.description || "No room description yet",
        "Created by " + (own ? "you" : aliases.get(r.owner) || "room creator"),
        own ? "pencil" : null,
        own
          ? () =>
              form(
                "Room description",
                "pencil",
                "Description",
                r.description,
                400,
                (v) => ui.updateRoom(r, "description", v),
              )
          : null,
      );
      const media = block(body),
        tabs = el("div", "media-tabs");
      tabs.setAttribute("role", "group");
      tabs.setAttribute("aria-label", "Shared items");
      media.append(tabs);
      for (const name of ["Media", "Links", "Docs"]) {
        const b = button(
          name,
          () => {
            gallery = name;
            group(false);
          },
          "media-tab",
        );
        b.setAttribute("aria-pressed", String(gallery === name));
        tabs.append(b);
      }
      const strip = el("div", "group-media");
      media.append(strip);
      if (gallery === "Links") {
        const links = new Set(
          r.msgs.flatMap((m) => m.text.match(/https?:\/\/[^\s<>"']+/gi) || []),
        );
        for (const link of links) {
          const a = el("a", "gallery-file", link);
          a.href = link;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          strip.append(a);
        }
      } else
        for (const m of r.msgs) {
          const f = m.activity?.file;
          if (!f || (gallery === "Docs") !== (m.activity.kind === "document"))
            continue;
          const b = button("", () => openFile(r, f), "gallery-file");
          b.append(
            icon(gallery === "Docs" ? "file-text" : "images"),
            el("span", null, f.filename),
          );
          strip.append(b);
        }
      if (!strip.children.length)
        strip.append(
          el("p", "panel-empty", "No " + gallery.toLowerCase() + " shared."),
        );
      row(
        block(body),
        "Starred messages",
        "",
        "star",
        () => openSub("Starred messages"),
        r.stars.size,
      );
      const decor = block(body);
      choice(
        decor,
        "Wallpaper",
        "Set a background for this room.",
        "image",
        "wall",
        backgrounds,
        r,
      );
      choice(
        decor,
        "Chat theme",
        "Customize your outgoing bubbles.",
        "palette",
        "theme",
        themes,
        r,
      );
      const times = ["Off", "30 seconds", "5 minutes", "15 minutes"],
        seconds = [0, 30, 300, 900];
      row(
        decor,
        "Disappearing messages",
        "Timer for new messages in this room.",
        "timer",
        own
          ? () =>
              chooser(
                "Disappearing messages",
                "timer",
                times,
                times[seconds.indexOf(r.lifetime || 0)],
                (v) => ui.updateRoom(r, "lifetime", seconds[times.indexOf(v)]),
              )
          : null,
        times[seconds.indexOf(r.lifetime || 0)],
      );
      const notices = block(body);
      toggle(
        notices,
        "Mute notifications",
        "Silence this room.",
        "bell",
        "muted",
        false,
        r,
      );
      choice(
        notices,
        "Custom notification tone",
        "Sound when message sounds are enabled.",
        "music-2",
        "tone",
        tones,
        r,
      );
      const perm = block(body);
      row(
        perm,
        "Encryption",
        "Messages are end-to-end encrypted.",
        "shield-check",
        ui.privacy,
      );
      if (ui.canInvite())
        row(
          perm,
          "Group invite link",
          "Create a one-use invitation.",
          "link",
          () => ui.invite(r),
        );
      row(
        perm,
        "Posting permissions",
        "The room creator manages invitations and settings.",
        "sliders-horizontal",
        own
          ? () =>
              chooser(
                "Who can post?",
                "users",
                ["All members", "Creator only"],
                r.ownerPosts ? "Creator only" : "All members",
                (v) =>
                  ui.updateRoom(r, "owner_posts", Number(v === "Creator only")),
              )
          : null,
        r.ownerPosts ? "Creator only" : "All members",
      );
      const people = block(body, "Participants");
      row(
        people,
        "Search participants",
        "",
        "search",
        () => openSub("Participants"),
        r.peers.length,
      );
      for (const p of r.peers) {
        const b = row(
          people,
          personName(p),
          p.code,
          null,
          null,
          p.code === r.owner ? "Creator" : "",
        );
        b.prepend(avatar("noir", ui.roomPhoto(r, p.code), p.code));
      }
      row(
        block(body),
        "Leave and close room",
        "Ends this room for every member.",
        "exit",
        ui.leaveRoom,
      ).classList.add("danger-row");
    }
    body.scrollTop = scroll;
    last = stamp(r);
    if (reset) focusHeader(pane);
  }
  function stamp(r) {
    return JSON.stringify([
      r.id,
      r.revision,
      r.peers.map((p) => p.code),
      r.msgs.length,
    ]);
  }
  function sync() {
    apply();
    if (
      mode === "settings" &&
      section === "Connections" &&
      $("connectionsCount")
    )
      $("connectionsCount").textContent = state().connections;
    if (mode === "group" && (!selected() || selected().id !== roomId)) leave();
    else if (mode === "group" && last !== stamp(selected())) {
      const search = pane.querySelector('input[type="search"]'),
        query = search?.value,
        focused = search === document.activeElement;
      group(false);
      const next = pane.querySelector('input[type="search"]');
      if (query && next) {
        next.value = query;
        next.oninput();
      }
      if (focused && next) next.focus({ preventScroll: true });
    }
  }
  function play(tone) {
    const ctx = bell;
    if (!ctx || ctx.state !== "running") return;
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain(),
      t = ctx.currentTime;
    oscillator.frequency.value =
      tone === "Drop" ? 520 : tone === "Chime" ? 990 : 790;
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(t);
    oscillator.stop(t + 0.23);
  }
  function unlockAudio() {
    if (!(window.AudioContext || window.webkitAudioContext)) return;
    bell ||= new (window.AudioContext || window.webkitAudioContext)();
    if (bell.state === "suspended") bell.resume().catch(() => {});
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest(".setting-row") && section === "Notifications")
      unlockAudio();
    else if (preferences().sounds) unlockAudio();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mode && !$("modal").open) {
      if (mode === "group" && sub) {
        sub = "";
        group(false);
      } else if (mode === "settings" && section) settings();
      else leave();
    }
  });
  return {
    settings,
    group,
    leave,
    refresh,
    sync,
    previewAllowed: () => preferences().previews !== false,
    enterAllowed: () => preferences().enter !== false,
    shareActivity: () => preferences().activity !== false,
    notify: (r) => {
      if (preferences().sounds && !r.prefs.muted)
        play(r.prefs.tone || prefs.tone || tones[0]);
    },
  };
}
