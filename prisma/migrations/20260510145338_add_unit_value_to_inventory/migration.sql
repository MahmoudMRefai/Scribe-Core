/*
  Warnings:

  - You are about to drop the column `value` on the `InventoryItem` table. All the data in the column will be lost.
  - You are about to drop the `InventoryIntake` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "InventoryIntake" DROP CONSTRAINT "InventoryIntake_adminId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryIntake" DROP CONSTRAINT "InventoryIntake_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryIntake" DROP CONSTRAINT "InventoryIntake_merchantId_fkey";

-- AlterTable
ALTER TABLE "InventoryItem" DROP COLUMN "value",
ADD COLUMN     "unitValue" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- DropTable
DROP TABLE "InventoryIntake";

-- DropEnum
DROP TYPE "IntakeStatus";
