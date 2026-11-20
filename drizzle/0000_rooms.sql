CREATE TABLE people (code TEXT PRIMARY KEY, box TEXT NOT NULL, sign TEXT NOT NULL, seen INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE sessions (token TEXT PRIMARY KEY, code TEXT NOT NULL, seen INTEGER NOT NULL, activity TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX sessions_code ON sessions(code);
--> statement-breakpoint
CREATE TABLE challenges (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE marks (code TEXT PRIMARY KEY, days INTEGER NOT NULL DEFAULT 0, last_day TEXT);
--> statement-breakpoint
CREATE TABLE rooms (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE members (room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, code TEXT NOT NULL, token TEXT NOT NULL, seen INTEGER NOT NULL, since_seq INTEGER NOT NULL, PRIMARY KEY(room,code));
--> statement-breakpoint
CREATE INDEX members_token ON members(token);
--> statement-breakpoint
CREATE TABLE grants (digest TEXT PRIMARY KEY, room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, target TEXT, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE invites (id TEXT PRIMARY KEY, room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, sender TEXT NOT NULL, target TEXT NOT NULL, parcel TEXT NOT NULL, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX invites_target ON invites(target);
--> statement-breakpoint
CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, code TEXT NOT NULL, packet TEXT NOT NULL, created INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX events_room ON events(room,seq);
--> statement-breakpoint
CREATE INDEX events_recent ON events(created);

