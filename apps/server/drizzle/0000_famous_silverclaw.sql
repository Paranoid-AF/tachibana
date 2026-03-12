CREATE TABLE `devices` (
	`udid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`product_type` text NOT NULL,
	`product_version` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `_server_lock` (
	`id` integer PRIMARY KEY NOT NULL,
	`pid` integer NOT NULL,
	`started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`duration` integer NOT NULL,
	`expiry` integer NOT NULL,
	`adsid` text NOT NULL
);
