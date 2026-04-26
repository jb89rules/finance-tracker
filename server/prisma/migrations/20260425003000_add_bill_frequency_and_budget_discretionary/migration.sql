-- AlterTable: Bill
ALTER TABLE "Bill" ADD COLUMN "frequency" TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE "Bill" ADD COLUMN "monthlyAmounts" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[];

-- Backfill: existing bills are implicitly monthly with the same amount each month
UPDATE "Bill"
SET "monthlyAmounts" = ARRAY[
  "amount", "amount", "amount", "amount", "amount", "amount",
  "amount", "amount", "amount", "amount", "amount", "amount"
];

-- AlterTable: Budget
ALTER TABLE "Budget" ADD COLUMN "discretionary" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: existing budgets had a manual limit which is now the discretionary buffer
UPDATE "Budget"
SET "discretionary" = "limit";
