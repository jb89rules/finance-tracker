-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "availableBalance" DOUBLE PRECISION,
ADD COLUMN     "balance" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "merchantName" TEXT,
ADD COLUMN     "pending" BOOLEAN NOT NULL DEFAULT false;
