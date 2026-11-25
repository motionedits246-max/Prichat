ALTER TABLE rooms ADD COLUMN owner_posts INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE rooms ADD COLUMN lifetime INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE rooms ADD COLUMN description TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE events ADD COLUMN deadline INTEGER NOT NULL DEFAULT 0;
