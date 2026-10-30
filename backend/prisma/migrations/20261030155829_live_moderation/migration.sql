-- AlterTable
ALTER TABLE "LiveAttendance" ADD COLUMN     "cohost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "removedAt" TIMESTAMP(3);
