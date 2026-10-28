-- AlterTable
ALTER TABLE "SupportThread" ADD COLUMN     "guestContact" TEXT,
ADD COLUMN     "guestKey" TEXT,
ADD COLUMN     "guestName" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SupportThread_guestKey_key" ON "SupportThread"("guestKey");

