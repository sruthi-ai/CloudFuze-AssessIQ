-- AlterTable
ALTER TABLE "test_sections" ADD COLUMN     "audioAssetId" TEXT;

-- AddForeignKey
ALTER TABLE "test_sections" ADD CONSTRAINT "test_sections_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
