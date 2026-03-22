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
--> statement-breakpoint
CREATE TABLE `device_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`udid` text NOT NULL,
	`auth_id` integer,
	`source` text NOT NULL,
	`action` text NOT NULL,
	`params` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`udid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`product_type` text NOT NULL,
	`product_version` text NOT NULL,
	`pref_always_awake` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `_server_lock` (
	`id` integer PRIMARY KEY NOT NULL,
	`pid` integer NOT NULL,
	`started_at` integer NOT NULL
);
