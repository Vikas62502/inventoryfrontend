# Backend Team – Summary of Required Changes

**Last Updated:** June 2026  
**For:** Backend developers

---

## 🚨 Priority 0.5: Agent Stock-Out UX (Units + Prefill + Multiple PI)

### What frontend now does

1. **Unit-aware stock labels**
   - Agent stock and stock-out dropdown now display real units (`Meters`, `Quantity`, `Pieces`, etc.), not generic `units`.
2. **Phone-based prefill in sales modal**
   - In B2B/B2C stock-out, when agent enters a phone number, frontend looks up prior sales and prefills customer details.
   - Agent re-enters only stock/out item lines.
3. **Multiple PI per customer**
   - Frontend allows creating multiple B2B/B2C sales (PI) for same customer/phone.

### Backend changes required

| Area | Required backend behavior |
|------|----------------------------|
| `GET /api/products` | Return stable `unit` per product (`NOS`, `MTR`, `PCS`, etc.) so UI can map unit labels consistently |
| `GET /api/sales` | Must return prior sales including `customer_phone`, `customer_name`, `customer_email`, `company_name`, `contact_person`, `gst_number`, `billing_address`, `delivery_address` |
| Sales uniqueness | **Do not** enforce unique customer phone per sale/PI; allow multiple sales/PI rows for same customer |
| Optional helper API | Add `GET /api/sales/customer-by-phone?phone=...` returning latest customer profile (faster than scanning all sales) |

### Recommended helper endpoint (optional but preferred)

**Endpoint:** `GET /api/sales/customer-by-phone?phone=9876543210`

**Response:**
```json
{
  "customer_name": "ABC Solar",
  "company_name": "ABC Solar Pvt Ltd",
  "contact_person": "Ravi Sharma",
  "customer_email": "abc@example.com",
  "customer_phone": "9876543210",
  "gst_number": "08ABCDE1234F1Z5",
  "billing_address": {
    "line1": "Sitapura",
    "city": "Jaipur",
    "state": "Rajasthan",
    "postal_code": "302022",
    "country": "India"
  },
  "delivery_address": {
    "line1": "Sitapura",
    "city": "Jaipur",
    "state": "Rajasthan",
    "postal_code": "302022",
    "country": "India"
  },
  "delivery_matches_billing": true,
  "last_sale_id": "sale_123",
  "last_sale_at": "2026-06-16T08:00:00.000Z"
}
```

**If no match:** return `404` with `{ "error": "Customer not found" }` or `200` with `null`.

---

## 🚨 Priority 0: Stock Request Dispatch (Super Admin)

**Full spec:** **`BACKEND_CHANGES_STOCK_REQUEST_DISPATCH.md`**  
**Serial API fix:** **`BACKEND_SERIAL_NUMBERS_DISPATCH_FIX.md`**

### Errors seen in production / QA

| Error | Backend fix |
|-------|-------------|
| `You do not have permission to update this request` | Super Admin must dispatch via `POST /stock-requests/:id/dispatch` only — no `PUT` update first |
| `Insufficient stock` (partial dispatch) | Validate/deduct using **dispatch qty** = `len(serial_numbers[product_id])`, not original requested qty |
| `products_quantity_check` constraint | Same — deducting requested qty (2) when stock is 1 and dispatch is 1 serial → negative quantity |
| `cannot exceed originally requested quantity` | Accept partial dispatch: `dispatch_qty = len(serial_numbers)` may be **less than** requested — do not require `items` |
| `Some serial numbers are invalid or not available` | GET and POST must use **same** serial lookup (`product_id` OR `product_name`) |
| Generic DB errors in UI | Return `{ error, details[] }` with `product_name` — do not expose raw PostgreSQL text |

### Dispatch payload (frontend today)

```json
{
  "serial_numbers": "{\"prod-id-1\":[\"2602420290\"],\"prod-id-2\":[\"XWS0326L06202N\"]}"
}
```

- `serial_numbers` is a **JSON string** — parse before use
- **Panels & Inverters only** — meters/cables omitted from map
- **No `items` field** — partial qty implied by serial count
- `dispatch_qty` per line = number of serials sent for that `product_id`

### Stock deduction (critical)

```typescript
// Per request line — not global requested qty
dispatch_qty = serial_numbers[product_id]?.length ?? request_line.quantity
if (products.quantity < dispatch_qty) return 400  // before UPDATE
products.quantity -= dispatch_qty               // never subtract requested_qty on partial dispatch
```

### Multi-item request (3 inverters in one dispatch)

| Line | Requested | Stock | Serials sent | Must deduct |
|------|-----------|-------|--------------|-------------|
| 6KWP | 2 | 1 | 1 | **1** (not 2) |
| 8KWP | 3 | 3 | 3 | **3** |
| 10KWP | 2 | 2 | 2 | **2** |

One wrong line (deducting 2 for 6KWP) fails the **entire** dispatch with `products_quantity_check`.

### Frontend status

- Sends `serial_numbers` JSON string only (no `items`)
- Serials required: **Panels & Inverters** only
- **Blocks partial dispatch** in UI until backend supports `dispatch_qty < requested_qty`

---

## 📌 Frontend Team Status (What Frontend Uses)

| Area | Frontend expects |
|------|------------------|
| **Cost price** | `cost_price` from `GET /api/products/:id/serial-numbers` – returned now, displayed per serial |
| **Quotations (B2C)** | `GET /api/admin/quotations` (list), `GET /api/quotations/:id` (detail) – agent access supported |
| **Selling price** | Sends `use_max_cost_price` / `selling_price` when Super Admin updates; otherwise uses `unit_price` |

---

## 🚨 Priority 0.6: Meter Products — Serial Numbers Optional (Product Create)

**Full spec:** **`BACKEND_CHANGES_METER_SERIAL_OPTIONAL.md`**

### Error in production

Creating a Meter product with quantity and no serials fails with backend validation (frontend already fixed).

### Backend fix (summary)

| Endpoint | Change |
|----------|--------|
| `POST /api/products` | Allow `category: Meters`, `quantity > 0`, **no** `serial_numbers` → **201** |
| `PUT /api/products/:id` | Allow `stock_to_add > 0` for Meters without `serial_numbers` |
| Category helper | `requiresSerialNumbers()` — **Panels & Inverters only**; exclude `meter` / `meters` |

**Serial numbers by category (product create):** **Panels & Inverters only** — serials required on add stock.  
**Meters:** quantity + `unit_price` only — **no serial validation**.  
**Serial numbers on dispatch:** **Panels & Inverters only** (not meters). See `BACKEND_CHANGES_STOCK_REQUEST_DISPATCH.md` §5.

---

## 🚨 Priority 1: Serial Numbers Not Showing After Add

**Issue:** Users add products with serial numbers, but View All shows "No serial numbers assigned."

**Cause:** Serial numbers are not stored or returned.

**Fix:** See **`BACKEND_FIX_SERIAL_NUMBERS_NOT_SHOWING.md`** for full details.

### Quick checklist

1. **POST /api/products** – When request includes `serial_numbers`:
   - Parse `serial_numbers` (JSON array in form data)
   - Create product
   - Insert one row per serial number into `product_serial_numbers` with: `product_id`, `serial_number`, `cost_price`, `product_name`, `category`, **`status = 'available'`** (default)

2. **GET /api/products/:id/serial-numbers** – Return array of serial number objects with: `id`, `serial_number`, `cost_price`, `product_name`, `category`, `status`, `created_at`. **Products added default to available** so they appear in the dispatch modal.

3. **PUT /api/products/:id** – When adding stock with `serial_numbers`, insert rows into `product_serial_numbers` with **`status = 'available'`**.

---

## 📋 API Contract Summary

### POST /api/products (multipart/form-data)

| Field | Type | When |
|-------|------|------|
| `name`, `model`, `category`, `quantity`, `unit_price` | Required | Always |
| `serial_numbers` | JSON string array | When quantity > 0 and user enters serials |
| `selling_price` | number | When Super Admin sets selling price on create |
| `default_price` | number | When checkbox unchecked (single cost for all) |
| `serial_number_prices` | JSON object | When checkbox checked (per-serial cost) |
| `product_name`, `product_category` | string | Optional, fallback to product name/category |

**Rule:** Send either `default_price` or `serial_number_prices`, not both.

### PUT /api/products/:id (multipart/form-data)

| Field | Type | When |
|-------|------|------|
| `stock_to_add` | number | When adding stock |
| `serial_numbers` | JSON string array | Optional – required only for **Panels & Inverters** when adding stock with serials; **optional for Meters** and others |
| `default_price` or `serial_number_prices` | number / object | Same as POST |
| `product_name`, `product_category` | string | Optional |

### GET /api/products/:id/serial-numbers

**Optional query param:** `?status=available` – return only serials with `status = 'available'` (for dispatch selection).

**Response:** Array of objects with at least:
```json
{
  "id": "string",
  "serial_number": "string",
  "product_id": "string",
  "cost_price": 1500.00,
  "product_name": "Solar Panel 400W",
  "category": "Panels",
  "status": "available",
  "created_at": "2025-01-15T10:30:00Z"
}
```

**Status values:** `available` | `mapped` | `dispatched` | `acknowledged` | `sold` (see **BACKEND_SERIAL_NUMBER_STATUS_LIFECYCLE.md**).

---

## 📋 Serial Number Status & Dispatch

**Lifecycle:** `available` → `mapped` → `dispatched` → `acknowledged` → `sold`

| Status | When |
|--------|------|
| **available** | Super Admin adds product with serial numbers |
| **dispatched** | Super Admin dispatches (selects serials in Review & Dispatch modal) |
| **acknowledged** | Admin confirms receipt |
| **sold** | Agent punches in B2B/B2C sale |

### POST /api/stock-requests/:id/dispatch

**New payload field:** `serial_numbers` (map product_id → array of serial number strings)

```json
{
  "dispatch_image": "<File>",
  "serial_number_ranges": { "product_id": { "from": "SN001", "to": "SN005" } },
  "serial_numbers": {
    "product_id_1": ["U6077580", "U6077578", "U6077577"],
    "product_id_2": ["SN001", "SN002"]
  }
}
```

**Backend must:**
1. Accept `serial_numbers` (JSON: `{ "product_id": ["SN1","SN2",...] }`)
2. Validate each serial exists and has `status = 'available'`
3. Update those serials to `status = 'dispatched'`
4. Link to stock request (e.g. `stock_request_id`, `dispatched_to_admin_id`)

**Admin confirm:** When admin confirms receipt, update linked serials from `dispatched` → `acknowledged`.

**GET /api/stock-requests/:id – Return dispatched serial numbers:** When a request was dispatched with `serial_numbers`, the response must include them so the Confirm Stock Receipt modal can display them. Add either:
- `dispatched_serial_numbers: { "product_id": ["SN1","SN2",...] }` at the request level, or
- `serial_numbers: ["SN1","SN2",...]` on each item in `items[]`

**Sale creation:** Agent selects serials from the **dispatch** (status `dispatched` or `acknowledged`). When agent creates sale, backend updates those serials → `sold`.

---

## 📋 Admin & Agent: Stock + Serial Numbers View

**Admin:** "My Stock" tab – option to view serial numbers per product ("View Serials" button).

**Agent:** "Admin Stock" tab – sees their admin's stock and can view serial numbers per product ("View Serial Numbers" button).

**API for admin-scoped serials (agent views admin's stock):**
- `GET /admin-inventory/admin/:adminId/products/:productId/serial-numbers`
- Or `GET /serial-numbers?owner_id=:adminId&owner_type=admin&product_id=:productId`
- Fallback: `GET /products/:productId/serial-numbers`

---

## 🗄️ Database: product_serial_numbers

```sql
CREATE TABLE product_serial_numbers (
  id VARCHAR(50) PRIMARY KEY,
  product_id VARCHAR(50) NOT NULL,
  serial_number VARCHAR(255) NOT NULL,
  cost_price DECIMAL(10, 2),
  product_name VARCHAR(255),
  category VARCHAR(255),
  status VARCHAR(50) DEFAULT 'available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
```

---

## 💰 unit_price vs selling_price (Different Fields)

- **unit_price** = cost price (same concept). Set when entering product.
- **selling_price** = separate field. Set by Super Admin. Backend must store both.

## 💰 Quotations: Amount from Selling Price

**When agent creates a quotation:** Use product **selling_price** (separate field), NOT `unit_price` (cost price).

- Line-item rate = product selling price
- Line-item amount = quantity × selling price
- Cost price (per serial) is internal only – do not use for agent-facing quotations

See **BACKEND_CHANGES_COST_PRICE_SELLING_PRICE_SERIALS.md** (Section 4) for details.

---

---

## 📋 Account Dashboard – Sales List (GET /api/sales)

For the Account role viewing "All Agent Sales", the frontend expects:

| Field | Purpose | Fallbacks |
|-------|---------|-----------|
| `created_by_name` or `agent_name` | Agent name in table | `created_by.name`, `user.name` |
| `created_at` or `sale_date` | Sale date in table | `updated_at` |
| `approval_status` | `"pending"` \| `"approved"` – when approved, Download button is shown | If absent, uses `payment_status === "completed"` as approved |

**Download button:** Shown only when `approval_status === "approved"` or `payment_status === "completed"`. Otherwise shows "Pending approval".

**Agent approval:** When Account approves an agent (Agents tab → Approve), the agent gets `is_active: true` and can log in and perform actions. Backend should block inactive agents from login and sensitive operations.

---

## 📋 GET /api/sales/:id – Full Sale for Edit

**Required for Edit modal:** When Account or Agent opens Edit, the frontend fetches the full sale. The response must include everything needed to prefill the edit form (same as create).

| Field | Type | Purpose |
|-------|------|---------|
| `customer_name` | string | Prefill edit form |
| `company_name` | string | B2B |
| `gst_number` | string | B2B |
| `contact_person` | string | B2B |
| `customer_email` | string | Prefill |
| `customer_phone` | string | Prefill |
| `notes` | string | Prefill |
| `billing_address` | object | `{ line1, line2?, city, state, postal_code, country }` |
| `delivery_address` | object | Same structure |
| `delivery_matches_billing` | boolean | Prefill checkbox |
| `items` | array | **Required** – line items for edit form |

**Items array** – each element must have:

| Field | Type | Purpose |
|-------|------|---------|
| `product_id` | string | Product ID (or `productId`) |
| `quantity` | number | Quantity |
| `unit_price` | number | Unit price (or `unitPrice`) |
| `gst_rate` | number | GST % (or `gstRate`) |

**Note:** Frontend accepts snake_case (`product_id`, `unit_price`, `gst_rate`) or camelCase (`productId`, `unitPrice`, `gstRate`). Same for addresses (`billing_address` / `billingAddress`).

---

## 📋 PUT /api/sales/:id – Agent & Account Edits

**Account role** edits sale (customer, address, **items**, amounts) from Sales tab. **Agent** edits their own sale before Account approval.

| Field | Type | Purpose |
|-------|------|---------|
| `approval_status` | `"pending"` \| `"approved"` | Account sets to `"approved"` when approving sale |
| `customer_name` | string | Editable |
| `company_name` | string | Editable (B2B) |
| `gst_number` | string | Editable (B2B) |
| `contact_person` | string | Editable (B2B) |
| `customer_email` | string | Editable |
| `customer_phone` | string | Editable |
| `notes` | string | Editable |
| `billing_address` | object | `{ line1, line2?, city, state, postal_code, country }` |
| `delivery_address` | object | Same structure |
| `delivery_matches_billing` | boolean | If true, delivery = billing |
| `items` | array | **Required for full edit** – `[{ product_id, quantity, unit_price, gst_rate }]` |
| `subtotal` | number | Recalculated from items |
| `tax_amount` | number | Recalculated from items |
| `discount_amount` | number | Optional, default 0 |
| `total_amount` | number | Recalculated |

**Flow:** Agent creates sale → Agent edits (customer, address, **items**, amounts) → Account approves → Quote/Download shown to agent.

---

## 📋 Backend Checklist (Account & Agent)

| # | Change | Endpoint | Priority |
|---|--------|----------|----------|
| 1 | `created_by_name` or `agent_name` in sales list | `GET /api/sales` | High |
| 2 | `created_at` or `sale_date` in sales list | `GET /api/sales` | High |
| 3 | `approval_status` in sales (or use `payment_status`) | Sales model | Medium |
| 4 | Account can set `approval_status: "approved"` | `PUT /api/sales/:id` | Medium |
| 5 | Agent/Account can edit sale (address, customer, **items**, amounts) | `PUT /api/sales/:id` | Medium |
| 6 | **GET sale by ID returns full `items`** (product_id, quantity, unit_price, gst_rate) | `GET /api/sales/:id` | High |
| 7 | **PUT accepts `items`, `subtotal`, `tax_amount`, `total_amount`** | `PUT /api/sales/:id` | High |
| 8 | Block inactive agents from login | `POST /inventory-auth/login` | High |
| 9 | Support `role: "account"` in user creation | `POST /api/users` | High |
| 10 | Account can fetch agents | `GET /api/users/agents` or `GET /api/users?role=agent` | High |
| 11 | Account can approve agents | `PUT /api/users/:id` with `is_active: true` | High |

---

## 📋 Backend Checklist (Serial Number Status & Dispatch)

| # | Change | Endpoint / Area | Priority |
|---|--------|-----------------|----------|
| 1 | `product_serial_numbers.status` column, default `'available'` | Database | High |
| 2 | `GET /products/:id/serial-numbers?status=available` returns only available | `GET /api/products/:id/serial-numbers` | Medium |
| 3 | **POST dispatch accepts `serial_numbers`** (map product_id → string[]) | `POST /api/stock-requests/:id/dispatch` | High |
| 4 | On dispatch: validate serials exist + status=available, update to `dispatched` | `POST /api/stock-requests/:id/dispatch` | High |
| 5 | Admin confirm: update linked serials `dispatched` → `acknowledged` | `POST /api/stock-requests/:id/confirm` | Medium |
| 6 | Sale creation: update serials → `sold` when linked to sale | `POST /api/sales` | Medium |

### POST /api/sales – Serial Numbers in Items

**Agent creates sale:** When agent selects serial numbers (from admin's mapped serials) in the Create Sale modal, the frontend sends:

```json
{
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

**Backend must:**
1. Accept `serial_numbers` (string array) on each item
2. Validate each serial exists and is mapped to the agent's admin
3. **Accept status `dispatched` or `acknowledged`** – do not reject with "Serial number is not available for sale"
4. **On submit: update each serial to `status = 'sold'`** (`dispatched` | `acknowledged` → `sold`)
5. Link serials to the sale (e.g. `sale_id`, `sale_item_id`)

**GET /api/sales/:id** – Return `serial_numbers` on each item when present, so Account and Agent can view them in Edit modal and quotation PDF.

---

## 📚 All Documents

| Document | Purpose |
|----------|---------|
| **BACKEND_CHANGES_AS_PER_FRONTEND.md** | **Consolidated backend changes** – All changes required to support current frontend (stock receipt serials, admin/agent serial view, sale serial selection) |
| **BACKEND_SERIAL_NUMBER_STATUS_LIFECYCLE.md** | **Serial number status** – available → mapped → dispatched → acknowledged → sold; dispatch with selected serials |
| **BACKEND_SERIAL_NUMBERS_DISPATCH_FIX.md** | **Fix:** Serial numbers not showing in dispatch modal – GET /products/:id/serial-numbers must return data (by product_id or product_name) |
| **BACKEND_ACCOUNT_DASHBOARD_CHANGES.md** | **Account dashboard** – sales list (agent name, date), approval status, agent approval, account user creation |
| **BACKEND_CHANGES_REQUIRED.md** | **Consolidated changes** – product map, serial numbers, selling price, stock |
| **BACKEND_FIX_SERIAL_NUMBERS_NOT_SHOWING.md** | Step-by-step fix for serial numbers not appearing |
| **BACKEND_CHANGES_FRONTEND_UPDATES.md** | Frontend behavior and payload examples |
| **BACKEND_CHANGES_LATEST.md** | Overall checklist and metadata requirements |
| **BACKEND_CHANGES_SERIAL_NUMBER_METADATA.md** | product_name, category per serial number |
| **BACKEND_CHANGES_SERIAL_NUMBER_PRICING.md** | Cost price handling |
| **BACKEND_CHANGES_SERIAL_NUMBER_VIEWING.md** | GET serial-numbers API spec |
| **BACKEND_CHANGES_COST_PRICE_SELLING_PRICE_SERIALS.md** | Cost price, selling price, serial numbers, quotation pricing |
| **BACKEND_CHANGES_QUOTATIONS_B2C_SALES.md** | Quotations API for B2C sales |

---

**Contact:** Frontend Team
