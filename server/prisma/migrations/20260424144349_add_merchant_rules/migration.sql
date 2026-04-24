-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "merchantOverride" TEXT;

-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "merchantOverride" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantRule_description_key" ON "MerchantRule"("description");
