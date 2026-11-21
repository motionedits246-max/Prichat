import { validFile, mediaTag } from "./media.js";
const bounded = (v, max) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const validId = (v) => typeof v === "string" && /^[\w-]{22}$/.test(v);
export const gameNames = { three: "Tic-tac-toe", four: "Four in a row" };
export function parseActivity(a) {
  if (!a || typeof a !== "object") return null;
  switch (a.type) {
    case "file":
      return validFile(a.file) &&
        ["photo", "video", "audio", "document", "gif", "sticker"].includes(
          a.kind,
        )
        ? { type: a.type, kind: a.kind, file: a.file }
        : null;
    case "note":
    case "location":
      return bounded(a.value, 700) ? { type: a.type, value: a.value } : null;
    case "contact":
      return bounded(a.label, 80) && bounded(a.value, 160)
        ? { type: "contact", label: a.label, value: a.value }
        : null;
    case "event":
      return bounded(a.label, 90) &&
        bounded(a.when, 30) &&
        Number.isFinite(Date.parse(a.when)) &&
        typeof a.place === "string" &&
        a.place.length <= 150
        ? { type: "event", label: a.label, when: a.when, place: a.place }
        : null;
    case "poll":
      return validId(a.id) &&
        bounded(a.question, 180) &&
        Array.isArray(a.options) &&
        a.options.length >= 2 &&
        a.options.length <= 6 &&
        a.options.every((x) => bounded(x, 80)) &&
        new Set(a.options).size === a.options.length
        ? { type: "poll", id: a.id, question: a.question, options: a.options }
        : null;
    case "game":
      return validId(a.id) && Object.hasOwn(gameNames, a.game)
        ? { type: "game", id: a.id, game: a.game }
        : null;
    case "vote":
      return validId(a.id) &&
        Number.isInteger(a.choice) &&
        a.choice >= 0 &&
        a.choice < 6
        ? { type: "vote", id: a.id, choice: a.choice }
        : null;
    case "move":
      return validId(a.id) &&
        Number.isInteger(a.cell) &&
        a.cell >= 0 &&
        a.cell < 42 &&
        Number.isInteger(a.ply) &&
        a.ply >= 0 &&
        a.ply < 42
        ? { type: "move", id: a.id, cell: a.cell, ply: a.ply }
        : null;
    default:
      return null;
  }
}
export function describe(a) {
  if (!a) return "";
  if (a.type === "file")
    return (
      (a.kind === "sticker"
        ? "Sticker"
        : a.kind === "gif"
          ? "GIF"
          : "Attachment") +
      " · " +
      a.file.filename
    );
  if (a.type === "game") return gameNames[a.game];
  if (a.type === "poll") return "Poll · " + a.question;
  if (a.type === "contact" || a.type === "event")
    return (a.type === "contact" ? "Contact" : "Event") + " · " + a.label;
  if (a.type === "vote") return "Voted in a poll";
  if (a.type === "move") return "Played a move";
  return (a.type === "location" ? "Location" : "Note") + " · " + a.value;
}
function winner(board, cell, cols, goal) {
  const row = Math.floor(cell / cols),
    col = cell % cols;
  for (const [dy, dx] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]) {
    let count = 1;
    for (const dir of [-1, 1]) {
      let y = row + dy * dir,
        x = col + dx * dir;
      while (
        y >= 0 &&
        y < board.length / cols &&
        x >= 0 &&
        x < cols &&
        board[y * cols + x] === board[cell]
      ) {
        count++;
        y += dy * dir;
        x += dx * dir;
      }
    }
    if (count >= goal) return true;
  }
  return false;
}
export function applyActivity(r, m) {
  const a = m.activity;
  if (!a) return true;
  if (a.type === "poll" || a.type === "game") {
    if (r.cards.has(a.id)) return false;
    if (a.type === "poll") m.votes = new Map();
    else {
      m.board = Array(a.game === "three" ? 9 : 42).fill(0);
      m.players = [m.code, null];
      m.playerNames = [m.name, ""];
      m.ply = 0;
      m.result = 0;
    }
    r.cards.set(a.id, m);
    return true;
  }
  if (a.type !== "vote" && a.type !== "move") return true;
  const card = r.cards.get(a.id);
  if (a.type === "vote") {
    if (
      card?.activity.type === "poll" &&
      a.choice < card.activity.options.length &&
      card.votes.get(m.code) !== a.choice
    ) {
      card.votes.set(m.code, a.choice);
      r.revision++;
    }
    return false;
  }
  if (
    card?.activity.type !== "game" ||
    card.result ||
    card.ply !== a.ply ||
    a.cell >= card.board.length ||
    card.board[a.cell]
  )
    return false;
  const seat = card.ply % 2,
    cols = card.board.length === 9 ? 3 : 7;
  if (
    (card.players[seat] && card.players[seat] !== m.code) ||
    card.players[1 - seat] === m.code
  )
    return false;
  if (cols === 7 && a.cell + 7 < 42 && !card.board[a.cell + 7]) return false;
  card.players[seat] = m.code;
  card.playerNames[seat] = m.name;
  card.board[a.cell] = seat + 1;
  card.ply++;
  card.result = winner(card.board, a.cell, cols, cols === 3 ? 3 : 4)
    ? seat + 1
    : card.ply === card.board.length
      ? 3
      : 0;
  r.revision++;
  return false;
}
export function activityCard(m, { el, icon, button, self, send, openFile }) {
  const a = m.activity,
    card = el("section", "activity-card");
  const heading = (glyph, label) => {
    const h = el("div", "card-kind");
    h.append(icon(glyph), el("span", null, label));
    card.append(h);
  };
  if (a.type === "file") {
    const tags = {
      document: "file-text",
      photo: "images",
      video: "film",
      audio: "audio-lines",
      gif: "clapperboard",
      sticker: "sticker",
    };
    heading(
      tags[a.kind],
      {
        document: "Document",
        photo: "Photo",
        video: "Video",
        audio: "Audio",
        gif: "GIF",
        sticker: "Sticker",
      }[a.kind],
    );
    card.append(
      el("strong", null, a.file.filename),
      el(
        "small",
        null,
        a.file.size < 1024 * 1024
          ? Math.ceil(a.file.size / 1024) + " KiB"
          : (a.file.size / (1024 * 1024)).toFixed(1) + " MiB",
      ),
    );
    card.append(
      button(
        mediaTag(a.file.mime) ? "Open preview" : "Download file",
        () => openFile(a.file),
        "card-action",
      ),
    );
  } else if (a.type === "poll") {
    heading("chart-no-axes-column", "Room poll");
    card.append(el("strong", null, a.question));
    for (const [i, label] of a.options.entries()) {
      const votes = [...m.votes.values()].filter((x) => x === i).length,
        b = button(
          "",
          () => send({ type: "vote", id: a.id, choice: i }),
          "poll-option",
        );
      b.setAttribute("aria-pressed", String(m.votes.get(self) === i));
      b.append(el("span", null, label), el("b", null, String(votes)));
      card.append(b);
    }
    card.append(
      el(
        "small",
        null,
        m.votes.size + " " + (m.votes.size === 1 ? "vote" : "votes"),
      ),
    );
  } else if (a.type === "game") {
    heading("gamepad-2", "Room game");
    card.append(el("strong", null, gameNames[a.game]));
    const seat = m.ply % 2,
      ownSeat = m.players.indexOf(self),
      canPlay =
        !m.result && (ownSeat === seat || (ownSeat === -1 && !m.players[seat]));
    const status =
      m.result === 3
        ? "Draw"
        : m.result
          ? m.playerNames[m.result - 1] + " won"
          : canPlay
            ? "Your turn"
            : (m.playerNames[seat] || "Another player") + "'s turn";
    card.append(el("span", "game-status", status));
    const cols = a.game === "three" ? 3 : 7,
      grid = el("div", "game-board " + (cols === 3 ? "three" : "four"));
    for (let i = 0; i < m.board.length; i++) {
      const val = m.board[i],
        glyph = val === 1 ? "X" : val === 2 ? "O" : "",
        b = button(
          cols === 3 ? glyph : "",
          () => send({ type: "move", id: a.id, cell: i, ply: m.ply }),
          "game-cell",
        );
      b.disabled =
        !canPlay ||
        !!val ||
        (cols === 7 && i + 7 < m.board.length && !m.board[i + 7]);
      b.dataset.piece = String(val);
      b.setAttribute(
        "aria-label",
        "Row " +
          (Math.floor(i / cols) + 1) +
          ", column " +
          ((i % cols) + 1) +
          ", " +
          (glyph || "empty"),
      );
      grid.append(b);
    }
    card.append(grid);
  } else {
    const tags = {
      note: ["sticky-note", "Note"],
      location: ["map-pin", "Location"],
      event: ["calendar-days", "Event"],
      contact: ["contact", "Contact"],
    };
    heading(...tags[a.type]);
    card.append(el("strong", null, a.label || a.value));
    if (a.type === "contact") card.append(el("span", null, a.value));
    if (a.type === "event") {
      const time = el("time", null, new Date(a.when).toLocaleString());
      time.dateTime = a.when;
      card.append(time);
      if (a.place) card.append(el("span", null, a.place));
    }
  }
  return card;
}
