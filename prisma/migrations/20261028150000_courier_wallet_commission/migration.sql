-- Courier delivery commission & wallet engine
--
-- NOTE: generated against the live dev schema (not the migration history),
-- because the history predates the Account→LedgerAccount / Courier changes.
-- Contains ONLY the objects introduced by this feature.

-- CreateEnum
CREATE TYPE "ServiceTier" AS ENUM ('LOCAL', 'INTERCITY', 'EXPRESS');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('OPENING_BALANCE', 'COMMISSION_EARNED', 'CASH_COLLECTED', 'CASH_DEPOSITED', 'PAYOUT_SETTLED');

-- AlterTable
ALTER TABLE "Parcel" ADD COLUMN     "courierCommission" DECIMAL(12,2),
ADD COLUMN     "serviceTier" "ServiceTier" NOT NULL DEFAULT 'LOCAL';

-- CreateTable
CREATE TABLE "CourierWallet" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "currentBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cashInHandBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourierWallet_courierId_key" ON "CourierWallet"("courierId");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex (idempotency guard: one commission / cash row per parcel or settlement)
CREATE UNIQUE INDEX "WalletTransaction_walletId_type_referenceId_key" ON "WalletTransaction"("walletId", "type", "referenceId");

-- AddForeignKey
ALTER TABLE "CourierWallet" ADD CONSTRAINT "CourierWallet_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CourierWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutability: the wallet ledger is append-only.
CREATE OR REPLACE FUNCTION wallet_transaction_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'WalletTransaction rows are immutable (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_transaction_no_update_delete
BEFORE UPDATE OR DELETE ON "WalletTransaction"
FOR EACH ROW EXECUTE FUNCTION wallet_transaction_immutable();
