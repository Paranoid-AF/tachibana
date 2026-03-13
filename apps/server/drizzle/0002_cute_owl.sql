CREATE TABLE `auth` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text,
	`key_hash` text NOT NULL,
	`key_hash_salt` text NOT NULL,
	`key_prefix` text,
	`expires_at` integer,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
