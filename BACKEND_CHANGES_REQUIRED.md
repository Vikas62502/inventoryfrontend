# Backend Changes Required – Product Map, Serial Numbers, Selling Price

**Last Updated:** February 2025  
**For:** Backend Team  
**Purpose:** Consolidated list of required backend changes based on current frontend behavior.

---

## Summary of Frontend Requirements

| Feature | Frontend Expectation | Backend Requirement |
|---------|----------------------|----------------------|
| **Product map with serial numbers** | When user views a product, serial numbers assigned to that product must appear | `GET /api/products/:id/serial-numbers` must return all serial numbers for the product |
| **Stock per product** | Set Selling Price tab shows stock for each product name | `GET /api/products` and `GET /api/products/:id` must return `quantity` or `central_stock` |
| **Eye button – serial numbers** | Clicking Eye on a product opens modal with serial numbers for that product | Same as above – serial numbers must be returned from API |
| **Cost price per serial** | Cost price saved per serial number | Store in `product_serial_numbers.cost_price` |
| **Selling price (separate)** | Super Admin sets selling price per product; different from cost | `products.selling_price` column; separate from `unit_price` |
| **Quotations** | Agent quotation amounts use selling price, not cost | Use `selling_price` for quotation line-item rates and amounts |

---

## 1. Product Map – Serial Numbers Assigned to Product

**Issue:** "Product map with that serial no is not coming" – when viewing a product (Edit or Eye button), the serial numbers assigned to that product do not appear.

**Root cause:** Either:
- Serial numbers are not stored when creating/updating products
- `GET /api/products/:id/serial-numbers` is not implemented or returns empty

### Required Implementation

#### A. Store serial numbers on create

**POST /api/products** – When request includes `serial_numbers` (JSON array):

```
Content-Type: multipart/form-data

name: "Product Name"
model: "Model"
category: "Category"
quantity: 3
unit_price: 1500
serial_numbers: ["SN001", "SN002", "SN003"]   // JSON string array
default_price: 1500   // OR serial_number_prices: {"SN001": 1500, "SN002": 1600, ...}
product_name: "Product Name"
product_category: "Category"
```

**Backend must:**
1. Parse `serial_numbers` (JSON string in form data)
2. Create product
3. Insert one row per serial into `product_serial_numbers`:

```sql
INSERT INTO product_serial_numbers (id, product_id, serial_number, cost_price, product_name, category, status)
VALUES 
  (gen_uuid(), :product_id, 'SN001', 1500.00, 'Product Name', 'Category', 'available'),
  (gen_uuid(), :product_id, 'SN002', 1500.00, 'Product Name', 'Category', 'available'),
  (gen_uuid(), :product_id, 'SN003', 1500.00, 'Product Name', 'Category', 'available');
```

Use `default_price` for all, or `serial_number_prices[serial_number]` for each.

#### B. Store serial numbers on add stock

**PUT /api/products/:id** – When adding stock with serial numbers:

```
stock_to_add: 2
serial_numbers: ["SN004", "SN005"]
default_price: 1500
```

Insert rows into `product_serial_numbers` for each serial, linked to the product.

#### C. Return serial numbers on GET

**GET /api/products/:id/serial-numbers**

**Response:** Array of objects:

```json
[
  {
    "id": "uuid-1",
    "product_id": "product-123",
    "serial_number": "SN001",
    "cost_price": 1500.00,
    "product_name": "Product Name",
    "category": "Category",
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

## 2. Stock Per Product (Quantity)

**Requirement:** Set Selling Price tab and product lists show stock for each product.

**API:** `GET /api/products` and `GET /api/products/:id`

**Response must include:**
- `quantity` OR `central_stock` (frontend uses `quantity ?? central_stock ?? 0`)

Ensure product list and product detail responses include current stock count.

---

## 3. Selling Price (Separate from Cost Price)

**Requirement:** Super Admin sets selling price per product. This is different from cost price.

| Field | Purpose | Who sets |
|-------|---------|----------|
| `unit_price` | Cost price (purchase cost) | When adding product/stock |
| `selling_price` | Price for quotations/sales | Super Admin |

**Database:**
```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price DECIMAL(10, 2);
```

**PUT /api/products/:id** – Super Admin sets selling price. Frontend sends:
- `use_max_cost_price`: boolean – if true, backend computes from max cost of serial numbers
- `selling_price`: number – manual value when `use_max_cost_price` is false

**GET /api/products** and **GET /api/products/:id** – Response must include `selling_price`.

---

## 4. Cost Price Per Serial Number

**Requirement:** Cost price entered per serial number must be stored.

**Database:** `product_serial_numbers` must have `cost_price` column:

```sql
ALTER TABLE product_serial_numbers ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2);
```

**When inserting:** Use `default_price` or `serial_number_prices[serial_number]` for each serial.

---

## 5. Quotations – Use Selling Price

**Requirement:** When agent creates a quotation, line-item rates and amounts must use **selling price**, not cost price.

- Rate = product's `selling_price` (or `unit_price` if selling_price not set)
- Amount = quantity × selling price
- Do NOT use `cost_price` from `product_serial_numbers` for agent-facing quotations

---

## 6. Database Schema

```sql
-- products table
-- unit_price = cost price
-- selling_price = separate column (Super Admin sets this)
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price DECIMAL(10, 2);

-- product_serial_numbers table
CREATE TABLE IF NOT EXISTS product_serial_numbers (
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

## Verification Checklist

- [ ] **POST /api/products** with `serial_numbers` → rows inserted into `product_serial_numbers`
- [ ] **PUT /api/products/:id** with `stock_to_add` and `serial_numbers` → new rows inserted
- [ ] **GET /api/products/:id/serial-numbers** → returns array of serial numbers for that product
- [ ] **GET /api/products** → returns `quantity` or `central_stock` per product
- [ ] **GET /api/products/:id** → returns `quantity`/`central_stock` and `selling_price`
- [ ] **PUT /api/products/:id** accepts `selling_price` and `use_max_cost_price`
- [ ] **products.selling_price** column exists and is used for quotations
- [ ] **product_serial_numbers.cost_price** is stored and returned

---

## Related Documents

| Document | Purpose |
|----------|---------|
| **BACKEND_FIX_SERIAL_NUMBERS_NOT_SHOWING.md** | Step-by-step fix for serial numbers not appearing |
| **BACKEND_CHANGES_COST_PRICE_SELLING_PRICE_SERIALS.md** | Cost vs selling price, quotation pricing |
| **BACKEND_CHANGES_FRONTEND_UPDATES.md** | Frontend payload examples |
| **BACKEND_TEAM_SUMMARY.md** | API overview |

---

**Contact:** Frontend Team
