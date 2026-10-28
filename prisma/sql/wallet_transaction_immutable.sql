-- Append-only guard for the courier wallet ledger.
-- Also part of migration 20261028150000_courier_wallet_commission; kept here
-- (idempotent) so `npm run db:test:prepare` can install it after `db push`.
CREATE OR REPLACE FUNCTION wallet_transaction_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'WalletTransaction rows are immutable (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_transaction_no_update_delete ON "WalletTransaction";
CREATE TRIGGER wallet_transaction_no_update_delete
BEFORE UPDATE OR DELETE ON "WalletTransaction"
FOR EACH ROW EXECUTE FUNCTION wallet_transaction_immutable();
