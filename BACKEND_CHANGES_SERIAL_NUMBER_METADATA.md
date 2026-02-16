# Backend Changes: Serial Number Metadata Association

## Overview
This document outlines the backend changes required to ensure that every serial number is associated with:
1. **Cost Price** (already implemented via `default_price` or `serial_number_prices`)
2. **Product Name** (new requirement)
3. **Category** (new requirement)

---

## Frontend Update Notes

### API Changes Summary

**POST /api/products** and **PUT /api/products/:id** now send additional metadata fields:
- `product_name`: The product name to associate with each serial number
- `product_category`: The product category to associate with each serial number

These fields are sent alongside:
- `serial_numbers`: Array of serial number strings
- `default_price`: Single cost price for all serial numbers (optional)
- `serial_number_prices`: Map of serial number → cost price (optional)

### Example Payloads

**Creating Product with Serial Numbers (Single Price):**
```json
{
  "name": "Solar Panel 400W",
  "model": "SP-400",
  "category": "Panels",
  "quantity": 5,
  "unit_price": 1500,
  "serial_numbers": ["SN001", "SN002", "SN003", "SN004", "SN005"],
  "default_price": 1500,
  "product_name": "Solar Panel 400W",
  "product_category": "Panels"
}
```

**Creating Product with Serial Numbers (Individual Prices):**
```json
{
  "name": "Solar Panel 400W",
  "model": "SP-400",
  "category": "Panels",
  "quantity": 3,
  "unit_price": 1500,
  "serial_numbers": ["SN001", "SN002", "SN003"],
  "serial_number_prices": {
    "SN001": 1500,
    "SN002": 1600,
    "SN003": 1550
  },
  "product_name": "Solar Panel 400W",
  "product_category": "Panels"
}
```

**Updating Product with Serial Numbers:**
```json
{
  "stock_to_add": 3,
  "serial_numbers": ["SN004", "SN005", "SN006"],
  "default_price": 1500,
  "product_name": "Solar Panel 400W",
  "product_category": "Panels"
}
```

---

## Database Schema Requirements

### `product_serial_numbers` Table

Each serial number record should store:

```sql
CREATE TABLE product_serial_numbers (
  id VARCHAR(50) PRIMARY KEY,
  product_id VARCHAR(50) NOT NULL REFERENCES products(id),
  serial_number VARCHAR(255) NOT NULL UNIQUE,
  cost_price DECIMAL(10, 2) NOT NULL,  -- Cost price for this serial number
  product_name VARCHAR(255) NOT NULL,   -- Product name at time of creation
  category VARCHAR(255) NOT NULL,       -- Category at time of creation
  status VARCHAR(50) DEFAULT 'available',
  owner_id VARCHAR(50),
  owner_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
```

**Important Notes:**
- `product_name` and `category` should be stored at the time of serial number creation
- These values should NOT change even if the product name or category is updated later
- This ensures historical accuracy of serial number associations

---

## API Endpoints to Update

### 1. `POST /api/products` (Create Product)

#### Current Behavior
- Creates product
- Optionally creates serial numbers
- Stores cost price for serial numbers

#### Required Changes

**Request Body:**
```typescript
{
  name: string,
  model: string,
  category: string,
  quantity: number,
  unit_price: number,
  serial_numbers?: string[],
  default_price?: number,
  serial_number_prices?: { [serialNumber: string]: number },
  product_name?: string,      // NEW: Product name for serial number association
  product_category?: string,  // NEW: Category for serial number association
  // ... other fields
}
```

**Implementation:**
1. When `serial_numbers` is provided, create serial number records
2. For each serial number:
   - Use `product_name` (if provided) or `name` for `product_name` field
   - Use `product_category` (if provided) or `category` for `category` field
   - Use `default_price` or `serial_number_prices[serialNumber]` for `cost_price` field
3. Store these values in the `product_serial_numbers` table

**Example Implementation:**
```typescript
if (serial_numbers && serial_numbers.length > 0) {
  const productName = product_name || name
  const productCategory = product_category || category
  
  for (const serialNumber of serial_numbers) {
    const costPrice = serial_number_prices?.[serialNumber] || default_price || 0
    
    await db.product_serial_numbers.create({
      product_id: product.id,
      serial_number: serialNumber,
      cost_price: costPrice,
      product_name: productName,
      category: productCategory,
      status: 'available'
    })
  }
}
```

---

### 2. `PUT /api/products/:id` (Update Product - Add Stock)

#### Current Behavior
- Adds stock to existing product
- Optionally creates serial numbers
- Stores cost price for serial numbers

#### Required Changes

**Request Body:**
```typescript
{
  stock_to_add: number,
  serial_numbers?: string[],
  default_price?: number,
  serial_number_prices?: { [serialNumber: string]: number },
  product_name?: string,      // NEW: Product name for serial number association
  product_category?: string,  // NEW: Category for serial number association
  // ... other fields
}
```

**Implementation:**
1. Fetch the existing product to get current `name` and `category`
2. When `serial_numbers` is provided, create serial number records
3. For each serial number:
   - Use `product_name` (if provided) or existing product `name` for `product_name` field
   - Use `product_category` (if provided) or existing product `category` for `category` field
   - Use `default_price` or `serial_number_prices[serialNumber]` for `cost_price` field
4. Store these values in the `product_serial_numbers` table

**Example Implementation:**
```typescript
const existingProduct = await db.products.findByPk(productId)

if (serial_numbers && serial_numbers.length > 0) {
  const productName = product_name || existingProduct.name
  const productCategory = product_category || existingProduct.category
  
  for (const serialNumber of serial_numbers) {
    const costPrice = serial_number_prices?.[serialNumber] || default_price || 0
    
    await db.product_serial_numbers.create({
      product_id: productId,
      serial_number: serialNumber,
      cost_price: costPrice,
      product_name: productName,
      category: productCategory,
      status: 'available'
    })
  }
}
```

---

## Response Updates

### `GET /api/products/:id/serial-numbers`

**Response should include:**
```json
[
  {
    "id": "sn_123",
    "serial_number": "SN001",
    "cost_price": 1500.00,
    "product_name": "Solar Panel 400W",
    "category": "Panels",
    "status": "available",
    "created_at": "2025-01-15T10:00:00Z"
  }
]
```

### `GET /api/serial-numbers/search`

**Response should include:**
```json
[
  {
    "id": "sn_123",
    "serial_number": "SN001",
    "product_id": "prod_456",
    "cost_price": 1500.00,
    "product_name": "Solar Panel 400W",
    "category": "Panels",
    "status": "available",
    "created_at": "2025-01-15T10:00:00Z"
  }
]
```

---

## Validation Rules

1. **Required Fields:**
   - When `serial_numbers` is provided, `product_name` and `product_category` should be automatically derived from the product if not explicitly provided
   - `cost_price` must be > 0 for each serial number

2. **Data Consistency:**
   - `product_name` and `category` stored with serial numbers should match the product's current values at creation time
   - These values should remain static even if the product name/category changes later

3. **Error Handling:**
   - If `serial_numbers` is provided but `product_name` or `product_category` cannot be determined, return validation error
   - If `cost_price` is missing or <= 0, return validation error

---

## Migration Requirements

### Existing Serial Numbers

If there are existing serial numbers in the database without `product_name` and `category`:

1. **Migration Script:**
```sql
UPDATE product_serial_numbers sn
SET 
  product_name = p.name,
  category = p.category
FROM products p
WHERE sn.product_id = p.id
  AND (sn.product_name IS NULL OR sn.category IS NULL);
```

2. **Add NOT NULL Constraints:**
```sql
ALTER TABLE product_serial_numbers
  ALTER COLUMN product_name SET NOT NULL,
  ALTER COLUMN category SET NOT NULL;
```

---

## Testing Scenarios

### Test Case 1: Create Product with Serial Numbers (Single Price)
- **Input:** Product with 5 serial numbers, `default_price = 1500`
- **Expected:** All 5 serial numbers created with:
  - `cost_price = 1500`
  - `product_name = product.name`
  - `category = product.category`

### Test Case 2: Create Product with Serial Numbers (Individual Prices)
- **Input:** Product with 3 serial numbers, different prices for each
- **Expected:** Each serial number created with its specific price, product name, and category

### Test Case 3: Add Stock to Existing Product
- **Input:** Add 3 serial numbers to existing product
- **Expected:** Serial numbers created with current product name and category

### Test Case 4: Update Product Name/Category
- **Input:** Update product name or category
- **Expected:** Existing serial numbers retain original `product_name` and `category` values
- **Expected:** New serial numbers use updated product name and category

### Test Case 5: Serial Number Retrieval
- **Input:** GET `/api/products/:id/serial-numbers`
- **Expected:** Response includes `cost_price`, `product_name`, and `category` for each serial number

---

## Summary

**Key Points:**
1. Every serial number must store: `cost_price`, `product_name`, and `category`
2. These values are set at serial number creation time and remain static
3. Frontend sends `product_name` and `product_category` explicitly, but backend should fallback to product's current values if not provided
4. All serial number retrieval endpoints should return these fields

**No Breaking Changes:**
- Existing serial numbers will be migrated to include these fields
- API responses are extended, not changed
- Frontend is already updated to send these fields

---

**Last Updated:** January 2025
