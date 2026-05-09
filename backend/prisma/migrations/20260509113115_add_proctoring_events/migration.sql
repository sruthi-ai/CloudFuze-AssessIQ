-- CreateTable
CREATE TABLE `proctoring_events` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'COPY_PASTE', 'RIGHT_CLICK', 'WEBCAM_BLOCKED', 'MULTIPLE_FACES', 'NO_FACE_DETECTED', 'NOISE_DETECTED', 'SCREENSHOT_TAKEN', 'DEVTOOLS_OPEN', 'PHONE_DETECTED', 'CUSTOM') NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `description` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sessionId` VARCHAR(191) NOT NULL,

    INDEX `proctoring_events_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `proctoring_events` ADD CONSTRAINT `proctoring_events_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
