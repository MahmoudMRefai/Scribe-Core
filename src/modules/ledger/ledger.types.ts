/**
 * Ledger types for the double-entry accounting system.
 */
import { Decimal } from 'decimal.js';

/** A single debit/credit split in a journal entry */
export interface JournalSplit {
  accountId: string;
  amount: Decimal; // Positive = debit, Negative = credit
}

/** Input to create a full journal entry with balanced splits */
export interface JournalEntryInput {
  description: string;
  createdById: string;
  splits: JournalSplit[];
}
