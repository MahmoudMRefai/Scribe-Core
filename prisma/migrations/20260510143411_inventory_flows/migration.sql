-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "value" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "InventoryIntake" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "confirmedQty" INTEGER,
    "status" "IntakeStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryIntake_merchantId_idx" ON "InventoryIntake"("merchantId");

-- CreateIndex
CREATE INDEX "InventoryIntake_inventoryItemId_idx" ON "InventoryIntake"("inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryIntake_status_idx" ON "InventoryIntake"("status");

-- AddForeignKey
ALTER TABLE "InventoryIntake" ADD CONSTRAINT "InventoryIntake_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryIntake" ADD CONSTRAINT "InventoryIntake_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryIntake" ADD CONSTRAINT "InventoryIntake_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
