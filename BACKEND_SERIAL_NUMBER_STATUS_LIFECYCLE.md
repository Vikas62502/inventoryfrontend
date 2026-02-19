# Backend: Serial Number Status Lifecycle

**Last Updated:** February 2025  
**For:** Backend developers  
**Context:** Serial numbers flow from Super Admin → Admin → Agent → Sale

---

## Overview

Each serial number in `product_serial_numbers` has a `status` field that tracks its lifecycle:

| Status | When | Who |
|--------|------|-----|
| **available** | Super Admin adds product with serial numbers | Initial state |
| **mapped** | Serial numbers are mapped/assigned to an admin (e.g. when request is created or approved) | Super Admin |
| **dispatched** | Stock is dispatched to admin | Super Admin |
| **acknowledged** | Admin acknowledges receipt of dispatched stock | Admin |
| **sold** | Agent punches the item in B2B or B2C sale | Agent |

---

## Database

```sql
-- product_serial_numbers table must have status column
ALTER TABLE product_serial_numbers 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'available';

-- Optional: link serial to stock request when dispatched
ALTER TABLE product_serial_numbers 
ADD COLUMN IF NOT EXISTS stock_request_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS dispatched_to_admin_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP;

-- Optional: link serial to sale when sold
ALTER TABLE product_serial_numbers 
ADD COLUMN IF NOT EXISTS sale_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS sale_item_id VARCHAR(50);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_serial_status 
ON product_serial_numbers(product_id, status);
```

---

## API Requirements

### 1. GET /api/products/:id/serial-numbers

**Optional query param:** `?status=available`

- When `status=available` is provided, return only serial numbers with `status = 'available'`
- When omitted, return all serial numbers (or all, depending on use case)

### 2. POST /api/products – Create with serial numbers

- Insert serial numbers with `status = 'available'` **by default**
- Products added by Super Admin must default to available so they appear in the dispatch modal

### 3. PUT /api/products/:id – Add stock with serial numbers

- Insert new serial numbers with `status = 'available'` **by default**
- Any serial number added via create or update should be available for dispatch until dispatched/sold

### 4. POST /api/stock-requests/:id/dispatch

**New payload field:** `serial_numbers`

```json
{
  "dispatch_image": "<File>",
  "serial_number_ranges": { "product_id": { "from": "SN001", "to": "SN005" } },
  "serial_numbers": {
    "product_id_1": ["U6077580", "U6077578", "U6077577", "U6077574", "U6077564"],
    "product_id_2": ["SN001", "SN002"]
  }
}
```

**Backend must:**
1. For each product_id in `serial_numbers`:
   - Validate each serial number exists and has `status = 'available'`
   - Update those serial numbers to `status = 'dispatched'`
   - Optionally link to the stock request (e.g. `stock_request_id`, `dispatched_to_admin_id`)
2. If `serial_numbers` is provided, use it; otherwise fall back to `serial_number_ranges` if supported

### 5. Admin Acknowledge (new or existing endpoint)

When admin confirms receipt of dispatched stock:

- Update serial numbers linked to that dispatch from `dispatched` → `acknowledged`
- May be part of `POST /api/stock-requests/:id/confirm` or similar

### 6. Sale Creation – B2B/B2C

When agent creates a sale with line items that reference serial numbers:

- **Agent selects serials from the dispatch** – those in `dispatched` or `acknowledged` status (mapped to agent's admin)
- Update those serial numbers to `status = 'sold'`
- Link serial number to sale (e.g. `sale_id`, `sale_item_id`)

**Status change:** `dispatched` or `acknowledged` → **`sold`**

---

## Status Flow Diagram

```
[Super Admin adds product]
        ↓
   available
        ↓
[Request created / mapped to admin]
        ↓
   mapped (optional – can skip to dispatched)
        ↓
[Super Admin dispatches]
        ↓
   dispatched
        ↓
[Admin acknowledges receipt]
        ↓
   acknowledged
        ↓
[Agent punches in B2B/B2C sale]
        ↓
   sold
```

---

## Frontend Usage

| Screen | Action | Frontend sends |
|--------|--------|----------------|
| Review & Dispatch (Super Admin) | Fetches available serials | `GET /products/:id/serial-numbers` (filtered by status=available client-side if backend doesn't support) |
| Review & Dispatch (Super Admin) | Approve & Dispatch | `POST /stock-requests/:id/dispatch` with `serial_numbers: { product_id: ["SN1","SN2",...] }` |
| Admin confirm receipt | Confirm | Backend updates dispatched → acknowledged |
| Agent creates B2B/B2C sale | Create sale | Backend updates serials → sold when sale includes serial-tracked items |

---

## Checklist for Backend

- [ ] `product_serial_numbers.status` column exists, default `'available'`
- [ ] `GET /products/:id/serial-numbers?status=available` returns only available serials (or filter client-side)
- [ ] `POST /stock-requests/:id/dispatch` accepts `serial_numbers` (map product_id → string[])
- [ ] On dispatch with `serial_numbers`, update those serials to `status = 'dispatched'`
- [ ] Admin confirm/acknowledge updates `dispatched` → `acknowledged`
- [ ] Sale creation updates serials to `status = 'sold'` when linked to sale

---

**Contact:** Frontend Team
