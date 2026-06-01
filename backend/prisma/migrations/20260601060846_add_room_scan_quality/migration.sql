-- AlterTable
ALTER TABLE "room_scans" ADD COLUMN     "panoramaUrl" TEXT,
ADD COLUMN     "qualityFlags" JSONB,
ADD COLUMN     "qualityScore" INTEGER;
