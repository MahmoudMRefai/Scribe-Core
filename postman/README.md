# Scribe Postman Collection

## Quick Start

1. **Import** both files into Postman:
   - `Scribe_Smart_Hub.postman_collection.json` — the collection
   - `Scribe_Dev.postman_environment.json` — the environment

2. **Select** the "Scribe Dev" environment in Postman's top-right dropdown.

3. **Start the server** (`npm run dev`) and make sure the DB is seeded.

## Recommended Request Order

Run these in sequence to walk through the full parcel lifecycle:

### Setup
1. 🔐 Auth > **Login Admin** — auto-saves `adminToken`
2. 🔐 Auth > **Register Courier** — auto-saves `courierToken` + `courierId`
3. 🔐 Auth > **Register Merchant** — auto-saves `merchantToken` + `merchantUserId`
4. 👤 Merchants > **Get My Merchant Profile** — auto-saves `merchantId`

### Parcel Lifecycle (Happy Path)
5. 📦 Parcels > **Create Parcel** — auto-saves `parcelId` + `trackingId`
6. 📦 Parcels > **Assign Courier** — transitions PENDING → PICKED_UP
7. 📦 Parcels > **Update Status → AT_HUB**
8. 📦 Parcels > **Update Status → OUT_FOR_DELIVERY**
9. 📦 Parcels > **Update Status → DELIVERED** — triggers double-entry ledger

### Financial Verification
10. 💰 Wallets > **Get My Wallet** (courier) — verify balance increased by COD
11. 💰 Wallets > **Get Wallet Transactions** — see journal entries

### Settlement (Armant Protocol)
12. 🤝 Settlements > **Initiate Settlement** — auto-saves `settlementId`
13. 🤝 Settlements > **Confirm Settlement** — clears courier wallet

### Audit Trail
14. 📋 Audit Logs > **Query Audit Logs** — see every change logged

## Auto-Token Management

The collection uses **test scripts** to automatically capture and store tokens
and IDs from responses. After running "Login Admin", all subsequent admin
requests will use the saved `{{adminToken}}` automatically.

## Optional Filters

Some GET requests have disabled query parameters (shown with a strike-through
in Postman). Enable them to filter results by status, merchant, courier, etc.
