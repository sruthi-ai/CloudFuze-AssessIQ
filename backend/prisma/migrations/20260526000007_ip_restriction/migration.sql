-- Add allowedIPs to tests
ALTER TABLE "tests" ADD COLUMN "allowedIPs" JSONB;
