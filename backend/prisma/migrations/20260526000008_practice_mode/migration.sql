ALTER TABLE "tests" ADD COLUMN "practiceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tests" ADD COLUMN "practiceToken" TEXT;
CREATE UNIQUE INDEX "tests_practiceToken_key" ON "tests"("practiceToken");
ALTER TABLE "sessions" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
