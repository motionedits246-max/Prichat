import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openStore(savedPath = ":memory:") {
  const sqlite = new DatabaseSync(":memory:");
  if (savedPath !== ":memory:")
    mkdirSync(dirname(savedPath), { recursive: true, mode: 0o700 });
  sqlite.prepare("ATTACH DATABASE ? AS saved").run(savedPath);
  sqlite.exec("PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY;");
  const migrations = readFileSync(
    new URL("./drizzle/0000_rooms.sql", import.meta.url),
    "utf8",
  );
  sqlite.exec(
    migrations.replace(
      "CREATE TABLE marks",
      "CREATE TABLE IF NOT EXISTS saved.marks",
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL("./drizzle/0001_attachments.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite.exec(
    readFileSync(
      new URL("./drizzle/0002_room_preferences.sql", import.meta.url),
      "utf8",
    ),
  );
  function prepare(sql) {
    const s = sqlite.prepare(sql.replace(/\bmarks\b/g, "saved.marks"));
    function bound(args) {
      return {
        all: () => ({ results: s.all(...args), meta: { changes: 0 } }),
        first: () => s.get(...args) ?? null,
        run: () => ({
          results: [],
          meta: { changes: Number(s.run(...args).changes) },
        }),
        execute: () =>
          s.columns().length ? bound(args).all() : bound(args).run(),
      };
    }
    return { bind: (...args) => bound(args) };
  }
  return {
    prepare,
    batch(ops) {
      sqlite.exec("BEGIN");
      try {
        const result = ops.map((o) => o.execute());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => sqlite.close(),
  };
}
