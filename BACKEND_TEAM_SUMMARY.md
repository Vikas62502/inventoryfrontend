# Backend Team – Summary of Required Changes

**Last Updated:** February 2025  
**For:** Backend developers

---

## 📌 Frontend Team Status (What Frontend Uses)

| Area | Frontend expects |
|------|------------------|
| **Cost price** | `cost_price` from `GET /api/products/:id/serial-numbers` – returned now, displayed per serial |
| **Quotations (B2C)** | `GET /api/admin/quotations` (list), `GET /api/quotations/:id` (detail) – agent access supported |
| **Selling price** | Sends `use_max_cost_price` / `selling_price` when Super Admin updates; otherwise uses `unit_price` |

---

## 🚨 Priority 1: Serial Numbers Not Showing After Add

**Issue:** Users add products with serial numbers, but View All shows "No serial numbers assigned."

**Cause:** Serial numbers are not stored or returned.

**Fix:** See **`BACKEND_FIX_SERIAL_NUMBERS_NOT_SHOWING.md`** for full details.

### Quick checklist

1. **POST /api/products** – When request includes `serial_numbers`:
   - Parse `serial_numbers` (JSON array in form data)
   - Create product
   - Insert one row per serial number into `product_serial_numbers` with: `product_id`, `serial_number`, `cost_price`, `product_name`, `category`

2. **GET /api/products/:id/serial-numbers** – Return array of serial number objects with: `id`, `serial_number`, `cost_price`, `product_name`, `category`, `status`, `created_at`

3. **PUT /api/products/:id** – When adding stock with `serial_numbers`, insert rows into `product_serial_numbers` the same way.

---

## 📋 API Contract Summary

### POST /api/products (multipart/form-data)

| Field | Type | When |
|-------|------|------|
| `name`, `model`, `category`, `quantity`, `unit_price` | Required | Always |
| `serial_numbers` | JSON string array | When quantity > 0 and user enters serials |
| `default_price` | number | When checkbox unchecked (single cost for all) |
| `serial_number_prices` | JSON object | When checkbox checked (per-serial cost) |
| `product_name`, `product_category` | string | Optional, fallback to product name/category |

**Rule:** Send either `default_price` or `serial_number_prices`, not both.

### PUT /api/products/:id (multipart/form-data)

| Field | Type | When |
|-------|------|------|
| `stock_to_add` | number | When adding stock |
| `serial_numbers` | JSON string array | When adding stock with serials |
| `default_price` or `serial_number_prices` | number / object | Same as POST |
| `product_name`, `product_category` | string | Optional |

### GET /api/products/:id/serial-numbers

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

## 📚 All Documents

| Document | Purpose |
|----------|---------|
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
