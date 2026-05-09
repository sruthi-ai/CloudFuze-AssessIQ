-- AlterTable
ALTER TABLE `answers` ADD COLUMN `codeTestResults` JSON NULL;

-- CreateTable
CREATE TABLE `code_test_cases` (
    `id` VARCHAR(191) NOT NULL,
    `input` TEXT NOT NULL,
    `expectedOutput` TEXT NOT NULL,
    `isHidden` BOOLEAN NOT NULL DEFAULT false,
    `points` DOUBLE NOT NULL DEFAULT 1,
    `description` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `questionId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `code_test_cases` ADD CONSTRAINT `code_test_cases_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
