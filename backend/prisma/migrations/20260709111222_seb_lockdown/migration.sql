-- AlterTable
ALTER TABLE "tests" ADD COLUMN     "sebBrowserExamKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sebConfigFileUrl" TEXT,
ADD COLUMN     "sebConfigKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sebRequired" BOOLEAN NOT NULL DEFAULT false;
