-- Add PIN field to invitations for secure browser entry
ALTER TABLE "invitations" ADD COLUMN "pin" TEXT;
CREATE UNIQUE INDEX "invitations_pin_key" ON "invitations"("pin");
