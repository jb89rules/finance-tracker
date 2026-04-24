-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "categoryOverride" TEXT;

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryOverride" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRule_description_key" ON "CategoryRule"("description");
