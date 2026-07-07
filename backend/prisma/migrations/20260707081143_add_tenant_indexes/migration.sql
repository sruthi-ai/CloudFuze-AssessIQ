-- CreateIndex
CREATE INDEX "candidates_tenantId_idx" ON "candidates"("tenantId");

-- CreateIndex
CREATE INDEX "question_banks_tenantId_idx" ON "question_banks"("tenantId");

-- CreateIndex
CREATE INDEX "tests_tenantId_idx" ON "tests"("tenantId");

-- CreateIndex
CREATE INDEX "tests_tenantId_status_idx" ON "tests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");
