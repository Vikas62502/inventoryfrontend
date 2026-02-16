# Backend Changes: Cost Price, Selling Price & Serial Numbers

**Last Updated:** February 2025  
**For:** Backend Team

---

## Overview: Cost Price vs Selling Price (Two Different Fields)

| Field | When set | Who sets | Where stored | Purpose |
|-------|----------|----------|--------------|---------|
| **Cost price** / **unit_price** | At the time of entering/adding a product | User adding stock | `products.unit_price` (product-level) + `product_serial_numbers.cost_price` (per serial) | Internal – purchase cost per unit |
| **Selling price** | In Super Admin panel | Super Admin | `products.selling_price` (separate column) | Agent-facing – price for quotations/sales |

**Key points:**
- **unit_price = cost price** (same concept). Used for cost/purchase price.
- **selling_price** = a **different, separate field** in the backend. Must be stored in its own column.
- Backend must have **both** `unit_price` (cost) and `selling_price` as distinct fields.

---

## 1. Cost Price Must Be Saved

**Issue:** Cost price entered during Add Product / Add Stock is not being saved.

**Required:** Store `cost_price` for each serial number in `product_serial_numbers`.

### When to save

- **POST /api/products** – When `serial_numbers` is provided:
  - Use `default_price` for all serials, OR
  - Use `serial_number_prices[serial_number]` for each serial
  - Insert each serial with its `cost_price`

- **PUT /api/products/:id** – When adding stock with `serial_numbers`:
  - Same logic: `default_price` or `serial_number_prices`

### Database

```sql
-- product_serial_numbers must have cost_price
ALTER TABLE product_serial_numbers ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2);

-- When inserting:
INSERT INTO product_serial_numbers (id, product_id, serial_number, cost_price, product_name, category, status)
VALUES (gen_uuid(), :product_id, :serial_number, :cost_price, :product_name, :category, 'available');
```

---

## 2. Super Admin – Selling Price Per Product

**Requirement:** Super Admin sets **selling price** separately from cost price. It is per product (by product name), can vary, and can change over time.

**Important:** Selling price is a different field from cost price. Cost price is set when entering product; selling price is set by Super Admin in their panel.

**Default:** Max cost price from registered stock (serial numbers) for that product – Super Admin can use this as a starting point.

**Logic:**
- **Selling price** = stored in `products` table, per product name
- Super Admin can set it to: (a) max cost from stock (default), or (b) a custom value
- Selling price can change independently – Super Admin can update it anytime

### Database

**Backend must have a separate column for selling price.** Do NOT use `unit_price` for selling price.

```sql
-- products table: unit_price = cost price, selling_price = separate field
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price DECIMAL(10, 2);

-- unit_price = cost price (existing column)
-- selling_price = selling price (separate column, set by Super Admin)
```

### API

**PUT /api/products/:id** – Super Admin sets selling price. Frontend sends **only** `selling_price` and `use_max_cost_price` (does NOT overwrite `unit_price`):

| Field | Type | Description |
|-------|------|-------------|
| `use_max_cost_price` | boolean | `true` = compute selling_price from max cost of serial numbers; `false` = use manual `selling_price` |
| `selling_price` | number | Manual selling price when `use_max_cost_price` is false |

**Note:** Frontend does NOT send `unit_price` when Super Admin updates selling price. `unit_price` (cost price) stays unchanged.

```json
{
  "use_max_cost_price": false,
  "selling_price": 2500
}
```

**GET /api/products/:id** – Response must include both:
- `unit_price` – cost price (unchanged when Super Admin sets selling price)
- `selling_price` – selling price (separate field, for quotations/sales)

**Optional:** GET endpoint to compute default:
- `GET /api/products/:id/max-cost-price` → returns `max(cost_price)` from serial numbers

---

## 3. Serial Numbers in View All

**Issue:** Serial numbers entered during Add are not visible in View All (Edit Product).

**Required:** Backend must implement both:

### A. Store on create

When **POST /api/products** includes `serial_numbers`:
1. Create product
2. For each serial in the array, insert into `product_serial_numbers` with: `product_id`, `serial_number`, `cost_price`, `product_name`, `category`

### B. Return on GET

**GET /api/products/:id/serial-numbers** must return:

```json
[
  {
    "id": "sn-uuid",
    "product_id": "product-123",
    "serial_number": "8906199700061",
    "cost_price": 10.00,
    "product_name": "L&T 1 PHASE NET METER",
    "category": "Meters",
    "status": "available",
    "created_at": "2025-02-11T10:00:00Z"
  }
]
```

**Query:**
```sql
SELECT id, product_id, serial_number, cost_price, product_name, category, status, created_at
FROM product_serial_numbers
WHERE product_id = :productId
ORDER BY created_at;
```

---

## 4. Agent Quotation – Amount from Selling Price

**Requirement:** When an agent creates a quotation, all product amounts must be calculated using the **selling price** (not cost price).

### Logic

- **Selling price** = `products.selling_price` (separate field, set by Super Admin). Do NOT use `unit_price`.
- **Cost price** = `products.unit_price` or `product_serial_numbers.cost_price` – must NOT be used for agent-facing quotations
- For each product line in the quotation:
  - `rate` / `unit_price` = product's selling price
  - `amount` = quantity × selling price

### When to apply

- **POST /api/quotations** (or equivalent create-quotation endpoint) – When agent creates a quotation:
  - Look up each product's `selling_price` or `unit_price` from `products` table
  - Use that value for line-item rate and amount calculation
  - Do NOT use `cost_price` from `product_serial_numbers`

### Example

```
Product: L&T 1 PHASE NET METER
- Cost price (set when entering product, per serial): ₹8,500 – internal only
- Selling price (set by Super Admin in their panel, per product name): ₹10,000 – can vary, can change

Agent creates quotation with quantity 2:
- Rate = ₹10,000 (selling price – NOT cost price)
- Amount = 2 × ₹10,000 = ₹20,000
```

### API response

**GET /api/quotations/:id** – Quotation pricing should reflect selling-price-based amounts:
- `pricing.panelPrice`, `pricing.inverterPrice`, etc. = from product selling prices
- `pricing.subtotal`, `pricing.totalAmount`, `pricing.finalAmount` = sums using selling prices

---

## Summary Checklist

| # | Requirement | API | Status |
|---|-------------|-----|--------|
| 1 | Save cost_price per serial number | POST /products, PUT /products/:id | Required |
| 2 | Return cost_price in GET serial-numbers | GET /products/:id/serial-numbers | Required |
| 3 | Store serial numbers on create | POST /products | Required |
| 4 | Return serial numbers on GET | GET /products/:id/serial-numbers | Required |
| 5 | Selling price per product (Super Admin) | PUT /products/:id | Required |
| 6 | Default selling price = max cost from stock | Backend logic | Required |
| 7 | Quotation amounts use selling price (agent) | POST /quotations, GET /quotations/:id | Required |

---

## Related Documents

- **BACKEND_FIX_SERIAL_NUMBERS_NOT_SHOWING.md** – Serial numbers storage fix
- **BACKEND_CHANGES_SERIAL_NUMBER_PRICING.md** – Cost price handling
- **BACKEND_TEAM_SUMMARY.md** – API overview

---

**Contact:** Frontend Team
