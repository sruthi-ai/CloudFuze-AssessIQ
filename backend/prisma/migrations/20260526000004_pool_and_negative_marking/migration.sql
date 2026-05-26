-- AlterTable: add pickCount to test_sections, negativeMarking to tests
ALTER TABLE "test_sections" ADD COLUMN "pickCount" INTEGER;
ALTER TABLE "tests" ADD COLUMN "negativeMarking" DOUBLE PRECISION;
