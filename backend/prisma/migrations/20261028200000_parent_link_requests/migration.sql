-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('PENDING', 'DECLINED');

-- CreateTable
CREATE TABLE "ParentLinkRequest" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentLinkRequest_studentId_status_idx" ON "ParentLinkRequest"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ParentLinkRequest_parentId_studentId_key" ON "ParentLinkRequest"("parentId", "studentId");

-- AddForeignKey
ALTER TABLE "ParentLinkRequest" ADD CONSTRAINT "ParentLinkRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLinkRequest" ADD CONSTRAINT "ParentLinkRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

