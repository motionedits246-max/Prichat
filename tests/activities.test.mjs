import test from "node:test";
import assert from "node:assert/strict";
import { parseActivity, applyActivity } from "../public/activities.js";
const id = "a".repeat(22);
const state = () => ({ cards: new Map(), revision: 0 });
const act = (s, code, activity) =>
  applyActivity(s, { code, name: code, activity: parseActivity(activity) });
test("poll voters can change their choice, with one vote per signing device", () => {
  const s = state();
  act(s, "a", {
    type: "poll",
    id,
    question: "When?",
    options: ["Now", "Later"],
  });
  for (const [code, choice] of [
    ["b", 0],
    ["c", 0],
    ["b", 1],
    ["b", 1],
    ["c", 5],
  ])
    act(s, code, { type: "vote", id, choice });
  assert.deepEqual(
    [...s.cards.get(id).votes],
    [
      ["b", 1],
      ["c", 0],
    ],
  );
  assert.equal(s.revision, 3);
});
test("games enforce turns, seats, occupied cells, gravity, wins and replay protection", () => {
  for (const game of ["three", "four"]) {
    const s = state();
    act(s, "host", { type: "game", id, game });
    const m = s.cards.get(id);
    const play = (who, cell, ply = m.ply) =>
      act(s, who, { type: "move", id, cell, ply });
    play("intruder", 0);
    assert.equal(m.ply, 0);
    const winning =
      game === "three" ? [0, 3, 1, 4, 2] : [35, 36, 28, 29, 21, 22, 14];
    if (game === "four") {
      play("host", 0);
      assert.equal(m.ply, 0);
    }
    winning.forEach((cell, index) => {
      play(index % 2 ? "guest" : "host", cell);
      play("intruder", cell, index);
      assert.equal(m.ply, index + 1);
    });
    assert.equal(m.result, 1);
    play("guest", 8);
    assert.equal(m.ply, winning.length);
  }
});
test("malformed polls, activities and profile-independent attachment descriptors are rejected", () => {
  for (const a of [
    { type: "game", id, game: "constructor" },
    { type: "poll", id, question: "?", options: ["a", "a"] },
    { type: "file", kind: "document", file: { size: 10 } },
    { type: "move", id, ply: -1, cell: 0 },
  ]) {
    assert.equal(parseActivity(a), null);
  }
});
