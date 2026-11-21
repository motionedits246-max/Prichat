CREATE TABLE transfers (id TEXT PRIMARY KEY, room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, owner TEXT NOT NULL, parts INTEGER NOT NULL, expires INTEGER NOT NULL, published INTEGER);
--> statement-breakpoint
CREATE INDEX transfers_room ON transfers(room);
--> statement-breakpoint
CREATE TABLE pieces (transfer TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(transfer,part));
