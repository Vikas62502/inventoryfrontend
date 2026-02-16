# Backend Fix: Serial Numbers Not Showing After Add

## Problem

When a user adds a new product with serial numbers (e.g., L&T 1 PHASE NET METER with quantity 1 and serial number "ABC123"), the product is created successfully. But when they later open **Edit Product** and click **View All** to see assigned serial numbers, the modal shows **"No serial numbers assigned"** – the serial numbers they entered are not visible.

## Root Cause

The frontend correctly sends `serial_numbers` when creating a product. The backend must:

1. **Store** serial numbers in `product_serial_numbers` when `POST /api/products` is called with `serial_numbers`
2. **Return** those serial numbers when `GET /api/products/:id/serial-numbers` is called

If either step is missing or broken, serial numbers will not appear.

---

## Required Backend Implementation

### 1. POST /api/products – Store Serial Numbers

When the request includes `serial_numbers` (JSON array of strings):

**Request example:**
```
POST /api/products
Content-Type: multipart/form-data

name: "L&T 1 PHASE NET METER"
model: "L&T 1 PHASE NET METER"
category: "Meters"
quantity: 1
unit_price: 0
serial_numbers: ["8906199700061"]          // JSON string!
product_name: "L&T 1 PHASE NET METER"
product_category: "Meters"
default_price: 10
```

**Backend must:**
1. Parse `serial_numbers` from the request (it may be a JSON string like `"[\"8906199700061\"]"`)
2. Create the product
3. For each serial number in the array, **insert a row** into `product_serial_numbers`:

```sql
INSERT INTO product_serial_numbers (id, product_id, serial_number, cost_price, product_name, category, status)
VALUES 
  (gen_uuid(), :product_id, '8906199700061', 10.00, 'L&T 1 PHASE NET METER', 'Meters', 'available');
```

**Key columns:**
- `product_id` – ID of the newly created product
- `serial_number` – each value from the `serial_numbers` array
- `cost_price` – from `default_price` or `serial_number_prices[serial_number]`
- `product_name` – from request or product name
- `category` – from request or product category

### 2. GET /api/products/:id/serial-numbers – Return Serial Numbers

**Request:**
```
GET /api/products/{productId}/serial-numbers
```

**Response must be an array:**
```json
[
  {
    "id": "sn-uuid-1",
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

**Query example:**
```sql
SELECT id, product_id, serial_number, cost_price, product_name, category, status, created_at
FROM product_serial_numbers
WHERE product_id = :productId
ORDER BY created_at;
```

---

## Database Schema

Ensure `product_serial_numbers` table exists with at least:

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

## PUT /api/products/:id – Add Stock with Serial Numbers

When adding stock to an existing product with `stock_to_add` and `serial_numbers`:

**Request example:**
```
PUT /api/products/{id}
Content-Type: multipart/form-data

stock_to_add: 2
serial_numbers: ["SN001", "SN002"]
default_price: 1500
product_name: "L&T 1 PHASE NET METER"
product_category: "Meters"
```

**Backend must:** Insert rows into `product_serial_numbers` for each serial number, linked to the product.

---

## Verification Checklist

- [ ] `POST /api/products` with `serial_numbers` → rows inserted into `product_serial_numbers`
- [ ] `GET /api/products/:id/serial-numbers` → returns those rows
- [ ] `PUT /api/products/:id` with `stock_to_add` and `serial_numbers` → new rows inserted
- [ ] `serial_numbers` is parsed correctly (JSON array, may be string in form data)

---

## Testing

1. Create product with 1 quantity, serial number "TEST123", cost price 100
2. Note the returned product ID
3. Call `GET /api/products/{id}/serial-numbers`
4. Response should contain one object with `serial_number: "TEST123"` and `cost_price: 100`

---

**Contact:** Frontend Team  
**Related:** BACKEND_CHANGES_FRONTEND_UPDATES.md, BACKEND_CHANGES_SERIAL_NUMBER_METADATA.md
