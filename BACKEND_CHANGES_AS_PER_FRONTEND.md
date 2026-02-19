# Backend Changes Required (As Per Frontend)

**Last Updated:** February 2025  
**For:** Backend developers  
**Purpose:** Consolidated list of all backend changes needed to support the current frontend implementation.

---

## 1. Stock Requests – Confirm Receipt Modal (Serial Numbers)

### GET /api/stock-requests/:id

**Change:** When a stock request was dispatched with serial numbers, the response must include them so the **Confirm Stock Receipt** modal can display them to the admin.

**Add one of:**
- `dispatched_serial_numbers: { "product_id": ["SN1","SN2",...] }` at the request level, **or**
- `serial_numbers: ["SN1","SN2",...]` on each element in `items[]`

**Example response:**
```json
{
  "id": "req-123",
  "status": "dispatched",
  "items": [
    {
      "product_id": "prod-1",
      "quantity": 5,
      "serial_numbers": ["U6077580", "U6077578", "U6077577", "U6077574", "U6077564"]
    }
  ]
}
```

---

## 2. Admin – View Serials (Only Admin’s Mapped Serial Numbers)

### Problem

When an Admin clicks **View Serials** in **My Stock**, the frontend must show only serial numbers mapped to that admin, not all serials for the product.

### Required Endpoints (implement at least one)

**Option A (preferred):**
```
GET /api/admin-inventory/admin/:adminId/products/:productId/serial-numbers
```
- Return serial numbers where `dispatched_to_admin_id = adminId` (or equivalent)
- Filter by status: `acknowledged` or `dispatched` (admin’s stock)

**Option B:**
```
GET /api/serial-numbers?owner_id=:adminId&owner_type=admin&product_id=:productId
```
- Same filtering as above

**Response format:** Array of objects:
```json
[
  {
    "id": "sn-1",
    "serial_number": "U6077580",
    "product_id": "prod-1",
    "cost_price": 1800,
    "product_name": "L&T 1 PHASE SOLAR METER",
    "category": "Meters",
    "status": "acknowledged",
    "created_at": "2026-02-18T10:00:00Z"
  }
]
```

---

## 3. Agent – View Admin’s Serial Numbers

### Context

Agent sees their admin’s stock and can view serial numbers per product. Uses the same admin-scoped endpoints as above.

**Frontend calls:** `GET /admin-inventory/admin/:adminId/products/:productId/serial-numbers` (or the fallback with `owner_id`, `owner_type`, `product_id`).

---

## 4. Stock Request Dispatch – Store Serial Numbers

### POST /api/stock-requests/:id/dispatch

**Payload:**
```json
{
  "dispatch_image": "<File>",
  "serial_numbers": {
    "product_id_1": ["U6077580", "U6077578", "U6077577"],
    "product_id_2": ["SN001", "SN002"]
  }
}
```

**Backend must:**
1. Accept `serial_numbers` (map: product_id → array of serial strings)
2. Validate each serial exists and has `status = 'available'`
3. Update those serials to `status = 'dispatched'`
4. Set `stock_request_id` and `dispatched_to_admin_id` (or equivalent)
5. Persist the mapping so `GET /stock-requests/:id` can return them (see §1)

---

## 5. Admin Confirm Receipt – Update Serial Status

### POST /api/stock-requests/:id/confirm

**Change:** When admin confirms receipt, update serial numbers linked to that dispatch:
- From `dispatched` → `acknowledged`
- Ensure `dispatched_to_admin_id` (or equivalent) is set so admin-scoped endpoints return them

---

## 6. Sales – Serial Numbers in Items (Agent Creates Sale)

### Flow: Dispatch → Sold

The serial numbers the agent selects are those **dispatched** to their admin. When the agent creates a sale with those serials, the backend must change their status to **sold**.

| Step | Who | Action | Serial status change |
|------|-----|--------|----------------------|
| 1 | Super Admin | Dispatches stock request | `available` → **`dispatched`** |
| 2 | Admin | Confirms receipt | `dispatched` → **`acknowledged`** |
| 3 | Agent | Creates sale, selects serials | `dispatched` or `acknowledged` → **`sold`** |

**Agent sees:** Serial numbers in `dispatched` or `acknowledged` status (those dispatched to their admin).

**When agent sells:** Backend updates those serials to `status = 'sold'` and links them to the sale.

### Important: Accept `dispatched` status on sale submit

If the backend returns **"Serial number is not available for sale"**, it may be rejecting serials in `dispatched` status. The backend **must accept** serials in both `dispatched` and `acknowledged` status when the agent creates a sale.

**On submit:** Change status from `dispatched` or `acknowledged` → **`sold`** for each serial in the payload.

---

### POST /api/sales

**Payload (items can include `serial_numbers`):**
```json
{
  "type": "B2B",
  "customer_name": "ABC Corp",
  "items": [
    {
      "product_id": "prod-123",
      "quantity": 2,
      "unit_price": 5000,
      "gst_rate": 18,
      "serial_numbers": ["U6077580", "U6077578"]
    }
  ],
  "subtotal": 10000,
  "tax_amount": 1800,
  "total_amount": 11800
}
```

**Backend must:**
1. Accept `serial_numbers` (string array) on each item
2. Validate each serial exists and is mapped to the agent’s admin (`dispatched_to_admin_id` = agent’s `created_by_id` or `admin_id`)
3. **Accept serial status `dispatched` or `acknowledged`** – do not reject with "Serial number is not available for sale"
4. **On submit: update each serial to `status = 'sold'`** (status change: `dispatched` | `acknowledged` → `sold`)
5. Set `sale_id` and `sale_item_id` (or equivalent) on each serial
6. Store `serial_numbers` on the sale item so `GET /sales/:id` can return them

---

## 7. Sales – Return Serial Numbers on Get

### GET /api/sales/:id

**Change:** Include `serial_numbers` on each item when present, so the Edit modal and quotation PDF can show them.

**Example:**
```json
{
  "id": "sale-1",
  "items": [
    {
      "product_id": "prod-123",
      "quantity": 2,
      "unit_price": 5000,
      "gst_rate": 18,
      "serial_numbers": ["U6077580", "U6077578"]
    }
  ]
}
```

---

## 8. PUT /api/sales/:id – Preserve Serial Numbers

**Change:** When updating a sale, accept and persist `serial_numbers` on each item. Do not drop them if the client sends them.

---

## 9. Database – product_serial_numbers

Ensure these columns exist:

| Column | Type | Purpose |
|--------|------|---------|
| `status` | VARCHAR(50) DEFAULT 'available' | Lifecycle: available → dispatched → acknowledged → sold |
| `stock_request_id` | VARCHAR(50) | Link when dispatched |
| `dispatched_to_admin_id` | VARCHAR(50) | Admin who received the serial |
| `dispatched_at` | TIMESTAMP | When dispatched |
| `sale_id` | VARCHAR(50) | Link when sold |
| `sale_item_id` | VARCHAR(50) | Link to sale line item |

**Index:**
```sql
CREATE INDEX idx_serial_status ON product_serial_numbers(product_id, status);
CREATE INDEX idx_serial_admin ON product_serial_numbers(dispatched_to_admin_id, product_id);
```

---

## 10. Sale Items – Store Serial Numbers

**Change:** Sale items (or equivalent table) must store `serial_numbers` as JSON array or in a related table, so they can be returned by `GET /sales/:id` and updated by `PUT /sales/:id`.

---

## Summary Checklist

| # | Change | Endpoint / Area | Priority |
|---|--------|-----------------|----------|
| 1 | Return `dispatched_serial_numbers` or `items[].serial_numbers` | `GET /stock-requests/:id` | High |
| 2 | Admin-scoped serial numbers endpoint | `GET /admin-inventory/admin/:adminId/products/:productId/serial-numbers` | High |
| 3 | Accept and store `serial_numbers` on dispatch | `POST /stock-requests/:id/dispatch` | High |
| 4 | Update serials `dispatched` → `acknowledged` on confirm | `POST /stock-requests/:id/confirm` | High |
| 5 | Accept `serial_numbers` on items, validate, mark as sold | `POST /api/sales` | High |
| 6 | Return `serial_numbers` on items | `GET /api/sales/:id` | High |
| 7 | Accept and preserve `serial_numbers` on items | `PUT /api/sales/:id` | Medium |
| 8 | Add/verify DB columns for serial lifecycle | `product_serial_numbers` table | High |
| 9 | Store serial_numbers on sale items | Sale items table/model | High |

---

**Contact:** Frontend Team
