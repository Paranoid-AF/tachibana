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
