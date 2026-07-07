-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "audioAssetId" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "audioPlays" JSONB;

-- CreateTable
CREATE TABLE "audio_assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "accent" TEXT,
    "voice" TEXT,
    "transcript" TEXT,
    "durationSec" INTEGER,
    "playLimit" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audio_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audio_assets_tenantId_idx" ON "audio_assets"("tenantId");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
