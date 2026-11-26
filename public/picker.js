import { pickerArt } from "./picker-art.js";
export const emoji = [
  ["😀", "Smile"],
  ["😂", "Laugh"],
  ["🥹", "Touched"],
  ["😊", "Blush"],
  ["😉", "Wink"],
  ["🥳", "Celebrate"],
  ["😍", "Love"],
  ["🤔", "Thinking"],
  ["😎", "Cool"],
  ["🤩", "Starstruck"],
  ["😮", "Surprised"],
  ["😢", "Tear"],
  ["❤️", "Heart"],
  ["💙", "Blue heart"],
  ["✨", "Sparkles"],
  ["🔥", "Fire"],
  ["👍", "Thumbs up"],
  ["👏", "Clap"],
  ["🙌", "Hooray"],
  ["👋", "Wave"],
  ["🤝", "Handshake"],
  ["👀", "Eyes"],
  ["💯", "Hundred"],
  ["✅", "Check"],
  ["🌱", "Seedling"],
  ["🌙", "Moon"],
  ["🌼", "Flower"],
  ["🎉", "Party"],
  ["☕", "Coffee"],
  ["🎵", "Music"],
  ["💡", "Idea"],
  ["⭐", "Star"],
].map(([symbol, label]) => ({
  symbol,
  label,
  id: label.toLowerCase().replaceAll(" ", "-"),
  kind: "emoji",
}));
const live = emoji
  .filter((x) =>
    ["wave", "heart", "party", "fire", "sparkles", "clap"].includes(x.id),
  )
  .map((x) => ({ ...x, kind: "live" }));
const gifts = [
  ["coffee", "Coffee on me", "☕"],
  ["bouquet", "A little bouquet", "💐"],
  ["cake", "Birthday cake", "🎂"],
  ["star", "A lucky star", "🌟"],
].map(([id, label, symbol]) => ({ id, label, symbol, kind: "gift" }));
const media = [...pickerArt, ...live, ...gifts];
export const expression = (kind, id) =>
  media.find((x) => x.kind === kind && x.id === id);
const tabs = [
  ["emoji", "Emoji", "smile"],
  ["gif", "GIFs", "film"],
  ["sticker", "Stickers", "sticker"],
  ["music", "Music", "music-2"],
  ["live", "Live", "activity"],
  ["gift", "Gifts", "gift"],
];
export function createPicker({
  panel,
  toggle,
  draft,
  el,
  icon,
  button,
  room,
  send,
  upload,
  notice,
}) {
  let tab = "emoji",
    target = null,
    search,
    results;
  function hide(restore = false) {
    if (panel.hidden) return;
    panel.hidden = true;
    panel.replaceChildren();
    target = null;
    toggle.setAttribute("aria-expanded", "false");
    if (restore) toggle.focus();
  }
  function render() {
    panel.replaceChildren();
    const nav = el("div", "expression-tabs");
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "Expression types");
    for (const [id, label, glyph] of tabs) {
      const b = button(
        "",
        () => {
          tab = id;
          render();
          search.focus();
        },
        "expression-tab",
      );
      b.id = "expr-tab-" + id;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "expressionResults");
      b.setAttribute("aria-selected", String(tab === id));
      b.tabIndex = tab === id ? 0 : -1;
      b.append(icon(glyph), el("span", null, label));
      nav.append(b);
    }
    nav.onkeydown = (e) => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const i = tabs.findIndex(([id]) => id === tab);
      tab =
        tabs[
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : (i + tabs.length + (e.key === "ArrowRight" ? 1 : -1)) %
                tabs.length
        ][0];
      render();
      panel.querySelector("[aria-selected=true]").focus();
    };
    const row = el("div", "expression-search"),
      wrap = el("label");
    search = el("input");
    search.type = "search";
    search.placeholder =
      "Search " + tabs.find((t) => t[0] === tab)[1].toLowerCase() + "…";
    search.setAttribute("aria-label", search.placeholder);
    wrap.append(icon("search"), search);
    row.append(wrap);
    if (tab === "emoji" || tab === "live") {
      const mode = button(
        tab === "emoji" ? "Static" : "Live",
        () => {
          tab = tab === "emoji" ? "live" : "emoji";
          render();
          search.focus();
        },
        "expression-mode",
      );
      row.append(mode);
    }
    results = el("div", "expression-results");
    results.id = "expressionResults";
    results.setAttribute("role", "tabpanel");
    results.setAttribute("aria-labelledby", "expr-tab-" + tab);
    panel.append(nav, row, results);
    search.oninput = filter;
    filter();
  }
  function filter() {
    results.replaceChildren();
    const query = search.value.trim().toLowerCase(),
      grid = el("div", "expression-grid " + tab);
    results.append(grid);
    for (const item of [...emoji, ...media].filter(
      (x) =>
        x.kind === tab &&
        (x.label + " " + (x.symbol || "")).toLowerCase().includes(query),
    )) {
      const b = button(
        "",
        async () => {
          if (!target || room() !== target) {
            hide();
            return;
          }
          if (item.kind === "emoji") {
            const at = draft.selectionStart ?? draft.value.length,
              end = draft.selectionEnd ?? at;
            if (
              draft.value.length - end + at + item.symbol.length >
              draft.maxLength
            )
              return notice("Message is full.");
            draft.setRangeText(item.symbol, at, end, "end");
            draft.dispatchEvent(new Event("input"));
          } else
            await send(target, {
              type: "expression",
              kind: item.kind,
              id: item.id,
            });
          hide();
          draft.focus();
        },
        "expression-tile",
      );
      if (item.data) {
        const img = el("img");
        img.alt = "";
        img.src = item.data;
        b.append(img);
      } else b.append(el("span", "expression-symbol", item.symbol));
      if (["gif", "sticker", "gift"].includes(tab))
        b.append(el("small", null, item.label));
      b.title = item.label;
      b.setAttribute("aria-label", item.label);
      grid.append(b);
    }
    const actions =
      {
        music: [["audio", "Share audio", "music-2"]],
        gif: [
          ["gif", "Upload a GIF", "upload"],
          ["maker", "Make a GIF", "film"],
        ],
        sticker: [["sticker", "Make a sticker", "scissors"]],
      }[tab] || [];
    for (const [kind, label, glyph] of actions.filter(([, l]) =>
      l.toLowerCase().includes(query),
    )) {
      const b = button(
        "",
        () => {
          if (room() === target) {
            hide();
            upload(kind);
          }
        },
        "expression-upload",
      );
      b.append(icon(glyph), el("span", null, label));
      results.append(b);
    }
    if (!grid.children.length && results.children.length === 1)
      results.append(el("p", "expression-empty", "No matches."));
  }
  function open() {
    if (!panel.hidden) {
      hide(true);
      return;
    }
    target = room();
    if (!target) return;
    tab = "emoji";
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    render();
    search.focus();
  }
  document.addEventListener("pointerdown", (e) => {
    if (!panel.contains(e.target) && !toggle.contains(e.target)) hide();
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      hide(true);
    }
  });
  return { open, hide };
}
