# Scribe Smart Logistics Hub

Scribe is a specialized backend logistics platform designed for the Armant region. It manages the entire lifecycle of merchant inventory, parcel delivery, courier assignments, and complex cash-on-delivery (COD) financial tracking using a double-entry ledger system.

## 🚀 Tech Stack

*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Language:** TypeScript
*   **ORM:** Prisma
*   **Database:** PostgreSQL
*   **Validation:** Zod
*   **Authentication:** JWT (JSON Web Tokens)

## 📦 Core Modules

1.  **Inventory (Merchant Fulfillment)**
    *   Strict SKU uniqueness per merchant.
    *   Track stock quantity, location, `unitValue`, and `unitWeight`.
    *   **Trigger Delivery:** Seamlessly convert inventory items into active delivery parcels. The system automatically decrements stock, calculates the total COD amount (`unitValue` × `quantity`), and computes the total parcel weight (`unitWeight` × `quantity`).

2.  **Parcels & Dispatch**
    *   End-to-end parcel tracking (Status: `PENDING` → `AT_HUB` → `PICKED_UP` / `OUT_FOR_DELIVERY` → `DELIVERED`).
    *   Unique `ARM-YYYYMMDD-XXXX` tracking ID generation.
    *   Admin-controlled courier assignment.

3.  **Financial Ledger (Double-Entry)**
    *   Strict ACID-compliant double-entry accounting.
    *   Automatically records debits and credits upon successful parcel delivery.
    *   Tracks Courier Cash Liabilities vs. Merchant Revenue vs. Scribe Service Fees.

4.  **Settlements (Armant Protocol)**
    *   Workflow for couriers to hand over collected COD cash to the Hub Admin.
    *   Statuses for `PENDING`, `CONFIRMED`, and `DISPUTED` settlements.

5.  **Immutable Audit Logging**
    *   Records every critical system action (Status changes, Courier assignments, Ledger entries).
    *   Stores `previousValue` and `newValue` JSON snapshots for perfect traceability.

## 🛠️ Setup & Installation

### 1. Prerequisites
*   Node.js (v18+ recommended)
*   PostgreSQL running locally or via Docker.

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory:
```env
PORT=3000
DATABASE_URL="postgresql://username:password@localhost:5432/scribe_dev?schema=public"
JWT_SECRET="your_super_secret_jwt_key_here"
```

### 4. Database Setup
Push the Prisma schema to your database and generate the client:
```bash
npx prisma db push
npx prisma generate
```

*(Optional)* Seed the database with the initial Admin user:
```bash
npm run seed
```

### 5. Run the Server
**Development Mode:**
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
npm start
```

## 🧪 API Testing (Postman)

A complete Postman collection is included in the repository.
1.  Navigate to the `postman/` directory.
2.  Import `Scribe_Smart_Hub.postman_collection.json` into Postman.
3.  *(If applicable)* Import the environment variables file to set up `{{baseUrl}}`.
4.  **Authentication Flow:** Run the **Login Admin** request first. A script will automatically capture the returned token and save it to the collection variables, allowing you to use all protected routes immediately.

## 🔄 The Merchant Fulfillment Workflow

1.  **Add Stock:** Merchant adds an item via `POST /api/inventory` (e.g., 50 Phones, unitValue: 11000, unitWeight: 0.25).
2.  **Trigger Delivery:** Merchant requests a delivery via `POST /api/inventory/:id/deliver` with a quantity.
    *   *System Action:* Stock drops. Parcel is created with status `AT_HUB`. Total COD and Weight are auto-calculated.
3.  **Assign Courier:** Admin confirms fulfillment and assigns a courier via `PATCH /api/parcels/:id/confirm-fulfillment`.
    *   *System Action:* Status changes to `OUT_FOR_DELIVERY`.
4.  **Delivery & Payment:** Courier delivers the item via `PATCH /api/parcels/:id/status` (Set to `DELIVERED`).
    *   *System Action:* The Ledger creates journal entries transferring the COD liability to the Courier and recording Merchant Revenue and Hub Fees.
5.  **Settlement:** Courier hands the cash to the Admin, triggering a Settlement confirmation which clears the Courier's ledger liability.

---
*Built for the Armant Logistics network.*
