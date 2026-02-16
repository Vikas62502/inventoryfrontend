# Backend Changes - Frontend Updates Summary

**Last Updated:** February 2025  
**Purpose:** Summary of frontend changes and corresponding backend requirements for the backend team.

---

## 📌 Frontend Team Changes (Summary)

| Area | Frontend behavior |
|------|-------------------|
| **Cost price** | Uses `cost_price` from `GET /api/products/:id/serial-numbers` (returned now). Displayed per serial number in View All modal. |
| **Quotations (B2C)** | List: `GET /api/admin/quotations`. Detail: `GET /api/quotations/:id`. Agent access now supported. |
| **Selling price** | Separate from cost price. Set by Super Admin per product name; can vary and change. Sends `use_max_cost_price` / `selling_price` when updating; otherwise uses returned `unit_price`. |

---

## 📋 Frontend Behavior (What We Send)

### 1. Cost Price – Single vs Individual

The frontend has a **checkbox** at Add Product and Edit Product flows:

- **Unchecked (default):** Single cost price for all serial numbers  
  - Sends: `default_price` (number)
- **Checked:** Individual cost price per serial number  
  - Sends: `serial_number_prices` (object: `{ "SN001": 1500, "SN002": 1600, ... }`)

**APIs:**
- `POST /api/products` – when creating product with serial numbers
- `PUT /api/products/:id` – when adding stock with serial numbers

### 2. Payload Examples

**Single cost price (checkbox unchecked):**
```json
{
  "name": "L&T 1 PHASE NET METER",
  "model": "L&T 1 PHASE NET METER",
  "category": "Meters",
  "quantity": 10,
  "serial_numbers": ["SN001", "SN002", "SN003", "SN004", "SN005", "SN006", "SN007", "SN008", "SN009", "SN010"],
  "default_price": 10,
  "product_name": "L&T 1 PHASE NET METER",
  "product_category": "Meters"
}
```

**Individual cost prices (checkbox checked):**
```json
{
  "name": "L&T 1 PHASE NET METER",
  "model": "L&T 1 PHASE NET METER",
  "category": "Meters",
  "quantity": 3,
  "serial_numbers": ["SN001", "SN002", "SN003"],
  "serial_number_prices": {
    "SN001": 1500,
    "SN002": 1600,
    "SN003": 1550
  },
  "product_name": "L&T 1 PHASE NET METER",
  "product_category": "Meters"
}
```

### 3. View All Serial Numbers Modal

When the user clicks **View All** in Edit Product, the frontend shows:

- Product name, category, current stock (from form)
- List of assigned serial numbers with **cost price** when available

**API used:** `GET /api/products/:id/serial-numbers`

**Response fields used by frontend:**
- `id`, `serial_number`, `created_at` (required)
- `cost_price` (optional) – **displayed per serial number when returned**
- `product_name`, `category` (optional, per serial number)

**Important:** If the API returns an empty array `[]`, the modal shows "No serial numbers assigned". This happens when:
- Stock was added without serial numbers (serial numbers are optional)
- Product was created before serial number tracking
- No rows exist in `product_serial_numbers` for this product

The backend must store serial numbers in `product_serial_numbers` when stock is added with serial numbers, and return them from this endpoint.

---

## ✅ Backend Requirements Checklist

### Required (for current features)

| # | Requirement | Status | Document |
|---|-------------|--------|----------|
| 1 | Accept `default_price` OR `serial_number_prices` (never both) on POST/PUT | Required | `BACKEND_CHANGES_SERIAL_NUMBER_PRICING.md` |
| 2 | Store `cost_price` per serial number in `product_serial_numbers` | Required | `BACKEND_CHANGES_SERIAL_NUMBER_METADATA.md` |
| 3 | Accept `product_name` and `product_category` when creating/adding serial numbers | Required | `BACKEND_CHANGES_SERIAL_NUMBER_METADATA.md` |
| 4 | Return `product_name`, `category`, `cost_price` in GET serial-numbers response | Required | `BACKEND_CHANGES_SERIAL_NUMBER_VIEWING.md` |

### Optional / Already implemented

- Serial numbers optional when adding stock (`stock_to_add` only)
- Duplicate product validation (name + model)
- `unit_price` allowed for all users

---

## 📤 API Contract Summary

### POST /api/products

**When creating product with serial numbers:**
- `serial_numbers`: string[]
- `default_price` OR `serial_number_prices` (not both)
- `product_name`, `product_category` (optional, fallback to product name/category)

### PUT /api/products/:id

**When adding stock with serial numbers:**
- `stock_to_add`: number
- `serial_numbers`: string[]
- `default_price` OR `serial_number_prices` (not both)
- `product_name`, `product_category` (optional)

### GET /api/products/:id/serial-numbers

**Response array elements should include:**
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

## 📚 Related Documents

- **`BACKEND_CHANGES_LATEST.md`** – High-level checklist
- **`BACKEND_CHANGES_SERIAL_NUMBER_METADATA.md`** – Metadata (product_name, category) per serial number
- **`BACKEND_CHANGES_SERIAL_NUMBER_PRICING.md`** – Cost price handling
- **`BACKEND_CHANGES_SERIAL_NUMBER_VIEWING.md`** – GET serial-numbers API
- **`BACKEND_CHANGES_PRODUCT_CREATION_FLOW.md`** – Creation flow and optional serial numbers

---

---

## Serial numbers not showing after add

If users add products with serial numbers but they don't appear in View All, see **`BACKEND_FIX_SERIAL_NUMBERS_NOT_SHOWING.md`** for the required backend implementation.

**Frontend workaround:** The frontend now caches serial numbers when creating a product and shows them in View All when the API returns empty. This works until page refresh. Permanent fix requires backend to store and return serial numbers.

---

**Contact:** Frontend Team
