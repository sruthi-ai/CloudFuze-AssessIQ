-- Add requireIdVerification to tests
ALTER TABLE "tests" ADD COLUMN "requireIdVerification" BOOLEAN NOT NULL DEFAULT false;

-- Add idVerified and idVerificationPhoto to sessions
ALTER TABLE "sessions" ADD COLUMN "idVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sessions" ADD COLUMN "idVerificationPhoto" TEXT;
