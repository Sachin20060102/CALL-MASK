-- MocoCall MySQL 8.4 Initial Operational Schema (Zero User Payment/Billing Tables)

CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `full_name` VARCHAR(191) NOT NULL,
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `suspension_reason` VARCHAR(191) NULL,
    `max_call_duration_seconds` INTEGER NULL,
    `daily_call_limit` INTEGER NULL,
    `monthly_call_quota` INTEGER NULL,
    `default_caller_id_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `telephony_providers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `protocol` ENUM('MOCK', 'SIP', 'VOIP_REST') NOT NULL DEFAULT 'MOCK',
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `compliance_verified` BOOLEAN NOT NULL DEFAULT false,
    `sip_domain` VARCHAR(191) NULL,
    `endpoint_url` VARCHAR(191) NULL,
    `config_json` JSON NULL,
    `health_status` ENUM('HEALTHY', 'DEGRADED', 'DISABLED') NOT NULL DEFAULT 'DISABLED',
    `last_health_check_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `telephony_providers_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `authorized_caller_ids` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `provider_id` VARCHAR(191) NOT NULL,
    `phone_number` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `verification_status` ENUM('VERIFIED', 'PENDING', 'REVOKED') NOT NULL DEFAULT 'VERIFIED',
    `is_global` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `authorized_caller_ids_user_id_idx`(`user_id`),
    UNIQUE INDEX `authorized_caller_ids_phone_number_provider_id_key`(`phone_number`, `provider_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `destination_restrictions` (
    `id` VARCHAR(191) NOT NULL,
    `pattern` VARCHAR(191) NOT NULL,
    `match_type` ENUM('PREFIX', 'COUNTRY_CODE', 'EXACT') NOT NULL DEFAULT 'PREFIX',
    `action` ENUM('BLOCK', 'ALLOW') NOT NULL DEFAULT 'BLOCK',
    `reason` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `destination_restrictions_active_match_type_idx`(`active`, `match_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `call_records` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `caller_id_id` VARCHAR(191) NOT NULL,
    `provider_id` VARCHAR(191) NOT NULL,
    `caller_id_number` VARCHAR(191) NOT NULL,
    `destination_number` VARCHAR(191) NOT NULL,
    `provider_call_id` VARCHAR(191) NULL,
    `mode` ENUM('MOCK', 'LIVE') NOT NULL DEFAULT 'MOCK',
    `status` ENUM('INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELED', 'BLOCKED') NOT NULL DEFAULT 'INITIATED',
    `muted` BOOLEAN NOT NULL DEFAULT false,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `answered_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `duration_seconds` INTEGER NOT NULL DEFAULT 0,
    `termination_reason` VARCHAR(191) NULL,
    `failure_code` VARCHAR(191) NULL,
    `provider_reported_cost_micros` INTEGER NULL,
    `provider_currency` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `call_records_provider_call_id_key`(`provider_call_id`),
    INDEX `call_records_user_id_started_at_idx`(`user_id`, `started_at`),
    INDEX `call_records_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `call_events` (
    `id` VARCHAR(191) NOT NULL,
    `call_record_id` VARCHAR(191) NOT NULL,
    `event_type` VARCHAR(191) NOT NULL,
    `status` ENUM('INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELED', 'BLOCKED') NOT NULL,
    `metadata_json` JSON NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `call_events_call_record_id_occurred_at_idx`(`call_record_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `abuse_reports` (
    `id` VARCHAR(191) NOT NULL,
    `reported_by_user_id` VARCHAR(191) NULL,
    `target_user_id` VARCHAR(191) NULL,
    `call_record_id` VARCHAR(191) NULL,
    `category` ENUM('SPAM', 'SPOOFING_ATTEMPT', 'HIGH_FREQUENCY', 'RESTRICTED_DESTINATION', 'OTHER') NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `description` TEXT NOT NULL,
    `status` ENUM('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
    `resolution_note` TEXT NULL,
    `resolved_by_admin_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `abuse_reports_status_severity_idx`(`status`, `severity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `system_settings` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value_json` JSON NOT NULL,
    `updated_by_admin_id` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `system_settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `target_type` VARCHAR(191) NOT NULL,
    `target_id` VARCHAR(191) NULL,
    `details_json` JSON NULL,
    `ip_address` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    INDEX `audit_logs_actor_user_id_idx`(`actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `users` ADD CONSTRAINT `users_default_caller_id_id_fkey` FOREIGN KEY (`default_caller_id_id`) REFERENCES `authorized_caller_ids`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `authorized_caller_ids` ADD CONSTRAINT `authorized_caller_ids_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `authorized_caller_ids` ADD CONSTRAINT `authorized_caller_ids_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `telephony_providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `call_records` ADD CONSTRAINT `call_records_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `call_records` ADD CONSTRAINT `call_records_caller_id_id_fkey` FOREIGN KEY (`caller_id_id`) REFERENCES `authorized_caller_ids`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `call_records` ADD CONSTRAINT `call_records_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `telephony_providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `call_events` ADD CONSTRAINT `call_events_call_record_id_fkey` FOREIGN KEY (`call_record_id`) REFERENCES `call_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `abuse_reports` ADD CONSTRAINT `abuse_reports_reported_by_user_id_fkey` FOREIGN KEY (`reported_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `abuse_reports` ADD CONSTRAINT `abuse_reports_target_user_id_fkey` FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `abuse_reports` ADD CONSTRAINT `abuse_reports_resolved_by_admin_id_fkey` FOREIGN KEY (`resolved_by_admin_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `abuse_reports` ADD CONSTRAINT `abuse_reports_call_record_id_fkey` FOREIGN KEY (`call_record_id`) REFERENCES `call_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
