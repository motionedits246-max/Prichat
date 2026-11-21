import { makeGif, makeSticker, MAX_FILE, mediaTag } from "./media.js";
import { gameNames } from "./activities.js";
import { random } from "./crypto.js";

const entries = [
  [
    "Share",
    [
      ["photo", "Photo", "images"],
      ["video", "Video", "film"],
      ["document", "Document", "file-text"],
      ["audio", "Audio", "audio-lines"],
      ["gif", "GIF", "clapperboard"],
      ["emoji", "Emoji", "smile"],
    ],
  ],
  [
    "Create",
    [
      ["poll", "Poll", "chart-no-axes-column"],
      ["sticker", "Sticker maker", "sticker"],
      ["maker", "GIF maker", "film"],
      ["event", "Event", "calendar-days"],
      ["note", "Note", "sticky-note"],
      ["contact", "Contact", "contact"],
      ["location", "Location", "map-pin"],
    ],
  ],
  [
    "Play",
    [
      ["three", "Tic-tac-toe", "grid-3x3"],
      ["four", "Four in a row", "disc-3"],
    ],
  ],
];
const emojiChoices = [
  ["Smile", "😀"],
  ["Laugh", "😂"],
  ["Grin", "😁"],
  ["Wink", "😉"],
  ["Thinking", "🤔"],
  ["Surprised", "😮"],
  ["Sad", "😢"],
  ["Celebrate", "🎉"],
  ["Heart", "❤️"],
  ["Thumbs up", "👍"],
  ["Clap", "👏"],
  ["Wave", "👋"],
  ["Sparkles", "✨"],
  ["Fire", "🔥"],
  ["Eyes", "👀"],
  ["Check", "✅"],
];
const accept = {
  photo: "image/jpeg,image/png,image/webp",
  video: "video/*",
  gif: "image/gif",
  audio: "audio/*",
  document: "",
  sticker: "image/jpeg,image/png,image/webp,image/gif",
  maker: "image/jpeg,image/png,image/webp,image/gif",
};
const sizeLabel = (n) =>
  n < 1048576
    ? Math.ceil(n / 1024) + " KiB"
    : (n / 1048576).toFixed(1) + " MiB";
export function shareMenu(ui, r, startType = "", initialFile = null) {
  const { dialog, el, icon, button, close, draft, send, alive, errorNotice } =
    ui;
  function backdrop(title, glyph, style) {
    const d = dialog(title, glyph);
    d.closest("dialog").classList.add(style);
    return d;
  }
  function submitForm(d, fields, submit, label) {
    const form = el("form", "activity-form");
    form.append(...fields);
    const actions = el("div", "share-actions"),
      back = button("Back", menu, "secondary"),
      go = el("button", "primary", label);
    go.type = "submit";
    actions.append(back, go);
    form.append(actions);
    d.append(form);
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (go.disabled) return;
      go.disabled = back.disabled = true;
      try {
        if (!alive(r)) throw Error("This room has closed.");
        await submit((label) => {
          go.textContent = label;
        });
        if (form.isConnected) close();
      } catch (err) {
        if (form.isConnected) errorNotice(err);
      } finally {
        go.disabled = back.disabled = false;
        go.textContent = label;
      }
    };
  }
  function input(
    label,
    {
      type = "text",
      max = 120,
      required = true,
      placeholder = "",
      multiline = false,
    } = {},
  ) {
    const wrap = el("label", "share-field");
    wrap.append(el("span", null, label));
    const field = el(multiline ? "textarea" : "input");
    if (!multiline) field.type = type;
    field.required = required;
    field.maxLength = max;
    field.placeholder = placeholder;
    field.autocomplete = "off";
    wrap.append(field);
    return { wrap, field };
  }
  function fileForm(kind, label, glyph, pasted) {
    const d = backdrop(label, glyph, "share-sheet"),
      wrap = el("div", "share-file-wrap");
    const chooser = el("label", "file-drop"),
      pick = el("input");
    pick.type = "file";
    pick.accept = accept[kind] || "";
    pick.multiple = kind === "maker";
    let files = pasted ? [pasted] : [];
    const name = el("strong", null, ""),
      details = el("small");
    chooser.append(icon(glyph), name, details, pick);
    wrap.append(chooser);
    const preview = el("div", "share-preview");
    wrap.append(preview);
    let urls = [];
    const release = () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls = [];
    };
    ui.onDismiss(release);
    function showSelection() {
      release();
      preview.replaceChildren();
      name.textContent =
        files.length === 0
          ? pick.multiple
            ? "Choose pictures"
            : "Choose a file"
          : files.length === 1
            ? files[0].name
            : files.length + " pictures";
      details.textContent = files.length
        ? files.map((f) => sizeLabel(f.size)).join(" · ")
        : kind === "maker"
          ? "2–8 frames in selection order"
          : kind === "sticker"
            ? "JPEG, PNG, WebP or GIF"
            : "Up to 4 MiB";
      if (["photo", "gif", "sticker", "maker"].includes(kind)) {
        for (const f of files.slice(0, 8)) {
          if (mediaTag(f.type) !== "img" || f.size > 12 * 1048576) continue;
          const im = el("img");
          im.alt = f.name;
          im.src = URL.createObjectURL(f);
          urls.push(im.src);
          preview.append(im);
        }
      }
    }
    pick.onchange = () => {
      files = [...pick.files];
      showSelection();
    };
    showSelection();
    const fields = [wrap];
    let caption, shape, delay;
    if (kind === "sticker") {
      caption = input("Caption", {
        max: 32,
        required: false,
        placeholder: "Optional sticker text",
      });
      fields.push(caption.wrap);
      const frame = el("label", "share-field");
      frame.append(el("span", null, "Shape"));
      shape = el("select");
      for (const label of ["Rounded square", "Circle"])
        shape.append(el("option", null, label));
      frame.append(shape);
      fields.push(frame);
    }
    if (kind === "maker") {
      const pace = el("label", "share-field");
      pace.append(el("span", null, "Time per frame"));
      delay = el("select");
      for (const [ms, txt] of [
        [250, "¼ second"],
        [500, "½ second"],
        [1000, "1 second"],
      ]) {
        const o = el("option", null, txt);
        o.value = ms;
        delay.append(o);
      }
      delay.value = "500";
      pace.append(delay);
      fields.push(pace);
    }
    submitForm(
      d,
      fields,
      async (status) => {
        if (!files.length) throw Error("Choose a file first.");
        let f = files[0],
          shareKind = kind;
        if (kind === "maker") {
          status("Making GIF…");
          f = await makeGif(files, Number(delay.value));
          shareKind = "gif";
        }
        if (kind === "sticker") {
          status("Making sticker…");
          f = await makeSticker(f, caption.field.value.trim(), shape.value);
        }
        if (!f.size || f.size > MAX_FILE)
          throw Error("Choose a file between 1 byte and 4 MiB.");
        if (shareKind === "gif" && f.type !== "image/gif")
          throw Error("Choose a GIF file.");
        if (shareKind === "photo" && mediaTag(f.type) !== "img")
          throw Error("Choose a JPEG, PNG or WebP image.");
        if (
          ["audio", "video"].includes(shareKind) &&
          !f.type.startsWith(shareKind + "/")
        )
          throw Error("Choose a " + shareKind + " file.");
        status("Sending…");
        await send(r, { type: "file", kind: shareKind }, f, (fraction) =>
          status("Sending " + Math.round(fraction * 100) + "%"),
        );
      },
      kind === "maker"
        ? "Make and send GIF"
        : kind === "sticker"
          ? "Make and send sticker"
          : "Send " + label.toLowerCase(),
    );
  }
  function edit(kind, label, glyph, pasted) {
    if (Object.hasOwn(accept, kind)) {
      fileForm(kind, label, glyph, pasted);
      return;
    }
    if (Object.hasOwn(gameNames, kind)) {
      const d = backdrop(label, glyph, "share-sheet");
      d.append(
        el(
          "p",
          "info-text",
          kind === "three"
            ? "Get three in a row. You play X first; another room member can join as O."
            : "Take turns dropping discs. Connect four in a line to win.",
        ),
      );
      submitForm(
        d,
        [],
        () => send(r, { type: "game", id: random(16), game: kind }),
        "Start game",
      );
      return;
    }
    const d = backdrop(label, glyph, "share-sheet"),
      fields = [];
    if (kind === "emoji") {
      const grid = el("div", "emoji-grid");
      for (const [label, symbol] of emojiChoices) {
        const b = button(
          symbol,
          () => {
            if (!alive(r)) return;
            const at = draft.selectionStart ?? draft.value.length,
              end = draft.selectionEnd ?? at;
            if (draft.value.length - end + at + symbol.length > draft.maxLength)
              throw Error("Message is full.");
            draft.setRangeText(symbol, at, end, "end");
            draft.dispatchEvent(new Event("input"));
            close();
            draft.focus();
          },
          "emoji-choice",
        );
        b.setAttribute("aria-label", label);
        grid.append(b);
      }
      d.append(grid);
      return;
    }
    const add = (label, opts) => {
      const x = input(label, opts);
      fields.push(x.wrap);
      return x.field;
    };
    let result;
    if (kind === "poll") {
      const question = add("Question", { max: 180 }),
        options = [add("Option 1", { max: 80 }), add("Option 2", { max: 80 })];
      const extra = button(
        "Add option",
        () => {
          const x = input("Option " + (options.length + 1), { max: 80 });
          extra.before(x.wrap);
          options.push(x.field);
          x.field.focus();
          if (options.length >= 6) extra.hidden = true;
        },
        "card-action",
      );
      fields.push(extra);
      result = () => {
        const values = options.map((o) => o.value.trim());
        if (values.some((v) => !v) || new Set(values).size !== values.length)
          throw Error("Give each option a different label.");
        return {
          type: "poll",
          id: random(16),
          question: question.value.trim(),
          options: values,
        };
      };
    } else if (kind === "event") {
      const title = add("Event name", { max: 90 }),
        when = add("Date and time", { type: "datetime-local" }),
        place = add("Place", { max: 150, required: false });
      result = () => ({
        type: kind,
        label: title.value.trim(),
        when: new Date(when.value).toISOString(),
        place: place.value.trim(),
      });
    } else if (kind === "contact") {
      const title = add("Contact name", { max: 80 }),
        value = add("Person code or contact detail", { max: 160 });
      result = () => ({
        type: kind,
        label: title.value.trim(),
        value: value.value.trim(),
      });
    } else {
      const value = add(
        kind === "location" ? "Place, address or coordinates" : "Note",
        {
          max: 700,
          multiline: true,
          placeholder:
            kind === "location"
              ? "Enter the location you want to share"
              : "Write a note",
        },
      );
      result = () => ({ type: kind, value: value.value.trim() });
    }
    submitForm(
      d,
      fields,
      () => send(r, result()),
      kind === "poll" ? "Post poll" : "Send " + label.toLowerCase(),
    );
  }
  function menu() {
    const d = backdrop("Add to chat", "plus", "activity-sheet");
    for (const [label, items] of entries) {
      const section = el("section", "action-section"),
        title = el("h3", null, label),
        grid = el("div", "action-grid");
      section.append(title, grid);
      for (const [kind, title, glyph] of items) {
        const b = button("", () => edit(kind, title, glyph), "activity-tile");
        b.append(icon(glyph), el("span", null, title));
        grid.append(b);
      }
      d.append(section);
    }
  }
  if (startType) {
    const entry = entries.flatMap((x) => x[1]).find((x) => x[0] === startType);
    if (entry) edit(...entry, initialFile);
  } else menu();
}
