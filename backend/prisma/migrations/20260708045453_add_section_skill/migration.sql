-- CreateEnum
CREATE TYPE "SkillArea" AS ENUM ('LISTENING', 'READING', 'WRITING', 'SPEAKING', 'GENERAL');

-- AlterTable
ALTER TABLE "test_sections" ADD COLUMN     "skill" "SkillArea";
