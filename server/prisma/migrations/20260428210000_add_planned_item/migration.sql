-- CreateTable
CREATE TABLE "PlannedItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "kind" TEXT NOT NULL,
    "frequency" TEXT,
    "dueDay" INTEGER,
    "oneTimeDate" TIMESTAMP(3),
    "amount" DOUBLE PRECISION NOT NULL,
    "monthlyAmounts" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "matchKeyword" TEXT,
    "linkedTransactionId" TEXT,
    "paymentWindowDays" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannedItem_category_isActive_idx" ON "PlannedItem"("category", "isActive");

-- CreateIndex
CREATE INDEX "PlannedItem_kind_isActive_idx" ON "PlannedItem"("kind", "isActive");

-- CreateIndex
CREATE INDEX "PlannedItem_oneTimeDate_idx" ON "PlannedItem"("oneTimeDate");
