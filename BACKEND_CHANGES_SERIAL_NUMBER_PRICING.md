# Backend Changes: Serial Number Pricing Feature

## Overview
This document outlines the backend changes required to support pricing for serial numbers in the product creation and stock addition flow. The frontend now supports two pricing modes:
1. **Single Price Mode**: One price applies to all serial numbers
2. **Individual Price Mode**: Each serial number can have its own price

---

## Frontend Update Notes

### API Changes Summary

**PUT /api/products/:id** now accepts one of:
- `default_price` (single price for all serials), or
- `serial_number_prices` (JSON map of serial → price)

**Important:** Do not send both together.

**Validation:** All prices must be > 0.

**Response Updates:**
- `GET /api/products/:id/serial-numbers` now returns `price` field
- `GET /api/serial-numbers/search` now returns `price` field

### Example Payloads

**Single Price Mode:**
```json
{
  "stock_to_add": 5,
  "serial_numbers": ["SN001", "SN002", "SN003", "SN004", "SN005"],
  "default_price": 1500
}
```

**Individual Price Mode:**
```json
{
  "stock_to_add": 3,
  "serial_numbers": ["SN001", "SN002", "SN003"],
  "serial_number_prices": {
    "SN001": 1500,
    "SN002": 1600,
    "SN003": 1550
  }
}
```

**Note:** No other frontend changes needed. The frontend implementation is already complete.

---

## API Endpoints to Update

### 1. `PUT /api/products/:id` (Update Product)

#### Current Behavior
- Accepts `serial_numbers` array
- Accepts `stock_to_add` for adding stock
- Does not handle pricing for serial numbers

#### Required Changes

**Request Body (when adding stock with serial numbers):**

```typescript
{
  stock_to_add: number,
  serial_numbers: string[], // Array of serial number strings
  // NEW: Pricing fields (mutually exclusive)
  default_price?: number,           // Single price for all serial numbers
  serial_number_prices?: {          // Individual prices per serial number
    [serialNumber: string]: number
  }
}
```

**Example Request (Single Price Mode):**
```json
{
  "stock_to_add": 5,
  "serial_numbers": ["SN001", "SN002", "SN003", "SN004", "SN005"],
  "default_price": 1500.00
}
```

**Example Request (Individual Price Mode):**
```json
{
  "stock_to_add": 3,
  "serial_numbers": ["SN001", "SN002", "SN003"],
  "serial_number_prices": {
    "SN001": 1500.00,
    "SN002": 1600.00,
    "SN003": 1550.00
  }
}
```

**Validation Rules:**
1. Either `default_price` OR `serial_number_prices` should be provided, not both
2. If `serial_number_prices` is provided:
   - Must have a price entry for every serial number in `serial_numbers`
   - All prices must be > 0
3. If `default_price` is provided:
   - Must be > 0
4. If neither is provided:
   - Pricing is optional (product can be created/updated without pricing)

**Response:**
- Success: 200 OK with updated product
- Validation Error: 400 Bad Request with error details

---

## Database Schema Changes

### Option 1: Add Price Column to `product_serial_numbers` Table

**Recommended Approach:** Add a `price` column to store the price for each serial number.

```sql
ALTER TABLE product_serial_numbers
ADD COLUMN price DECIMAL(10, 2) DEFAULT NULL;

-- Add index for price queries
CREATE INDEX idx_serial_number_price ON product_serial_numbers(price) WHERE price IS NOT NULL;
```

**Table Structure:**
```sql
CREATE TABLE product_serial_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  serial_number VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) DEFAULT NULL,  -- NEW COLUMN
  status VARCHAR(50) DEFAULT 'available',
  owner_id UUID,
  owner_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, serial_number)
);
```

### Option 2: Separate Pricing Table (Alternative)

If you prefer normalization, create a separate table:

```sql
CREATE TABLE serial_number_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number_id UUID NOT NULL REFERENCES product_serial_numbers(id) ON DELETE CASCADE,
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(serial_number_id)
);
```

**Recommendation:** Use Option 1 (add column) for simplicity and better query performance.

---

## Implementation Details

### Backend Handler Logic

```typescript
// Pseudo-code for PUT /api/products/:id handler

async function updateProduct(req: Request, res: Response) {
  const { id } = req.params;
  const { 
    stock_to_add, 
    serial_numbers, 
    default_price, 
    serial_number_prices 
  } = req.body;

  // Validation
  if (serial_numbers && serial_numbers.length > 0) {
    // Validate pricing fields
    const hasDefaultPrice = default_price !== undefined && default_price !== null;
    const hasIndividualPrices = serial_number_prices && Object.keys(serial_number_prices).length > 0;
    
    if (hasDefaultPrice && hasIndividualPrices) {
      return res.status(400).json({
        error: "Validation error",
        details: [{
          path: "pricing",
          message: "Cannot provide both default_price and serial_number_prices"
        }]
      });
    }
    
    if (hasIndividualPrices) {
      // Validate all serial numbers have prices
      const missingPrices = serial_numbers.filter(
        sn => !serial_number_prices[sn] || serial_number_prices[sn] <= 0
      );
      
      if (missingPrices.length > 0) {
        return res.status(400).json({
          error: "Validation error",
          details: [{
            path: "serial_number_prices",
            message: `Missing or invalid prices for serial numbers: ${missingPrices.join(", ")}`
          }]
        });
      }
    }
    
    if (hasDefaultPrice && default_price <= 0) {
      return res.status(400).json({
        error: "Validation error",
        details: [{
          path: "default_price",
          message: "default_price must be greater than 0"
        }]
      });
    }
  }

  // Process serial numbers and pricing
  if (serial_numbers && serial_numbers.length > 0) {
    for (const serialNumber of serial_numbers) {
      // Determine price for this serial number
      let price: number | null = null;
      
      if (default_price) {
        price = default_price;
      } else if (serial_number_prices && serial_number_prices[serialNumber]) {
        price = serial_number_prices[serialNumber];
      }
      
      // Create/update serial number record with price
      await db.product_serial_numbers.upsert({
        where: {
          product_id_serial_number: {
            product_id: id,
            serial_number: serialNumber
          }
        },
        create: {
          product_id: id,
          serial_number: serialNumber,
          price: price,
          status: 'available'
        },
        update: {
          price: price // Update price if serial number already exists
        }
      });
    }
  }
  
  // Update product stock
  // ... existing stock update logic ...
  
  return res.json(updatedProduct);
}
```

---

## API Response Updates

### GET /api/products/:id/serial-numbers

**Current Response:**
```json
[
  {
    "id": "uuid",
    "serial_number": "SN001",
    "status": "available",
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

**Updated Response (include price):**
```json
[
  {
    "id": "uuid",
    "serial_number": "SN001",
    "price": 1500.00,  // NEW FIELD
    "status": "available",
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

### GET /api/serial-numbers/search

**Updated Response:** Include `price` field in search results.

---

## Edge Cases and Considerations

### 1. Price Updates
- When updating a product and adding new serial numbers, existing serial numbers keep their prices
- If `default_price` is provided, it only applies to NEW serial numbers being added
- If `serial_number_prices` is provided, it can update prices for existing serial numbers

### 2. Price Nullability
- Price is optional (can be NULL)
- Products can exist without pricing information
- Serial numbers can be added without prices

### 3. Price Validation
- Prices must be positive numbers (> 0)
- Prices should support decimal values (e.g., 1500.50)
- Maximum price limit (if needed): Consider business rules

### 4. Bulk Operations
- When adding multiple serial numbers with `default_price`, all get the same price
- When using `serial_number_prices`, each serial number gets its specific price

### 5. Price History (Future Enhancement)
- Consider adding a `price_history` table if you need to track price changes over time
- For now, only current price is stored

---

## Testing Scenarios

### Test Case 1: Single Price Mode
```json
POST /api/products/:id
{
  "stock_to_add": 3,
  "serial_numbers": ["SN001", "SN002", "SN003"],
  "default_price": 1500.00
}
```
**Expected:** All 3 serial numbers created with price = 1500.00

### Test Case 2: Individual Price Mode
```json
POST /api/products/:id
{
  "stock_to_add": 3,
  "serial_numbers": ["SN001", "SN002", "SN003"],
  "serial_number_prices": {
    "SN001": 1500.00,
    "SN002": 1600.00,
    "SN003": 1550.00
  }
}
```
**Expected:** Each serial number created with its specific price

### Test Case 3: No Pricing (Optional)
```json
POST /api/products/:id
{
  "stock_to_add": 3,
  "serial_numbers": ["SN001", "SN002", "SN003"]
}
```
**Expected:** Serial numbers created without prices (price = NULL)

### Test Case 4: Validation Error - Both Pricing Fields
```json
POST /api/products/:id
{
  "stock_to_add": 2,
  "serial_numbers": ["SN001", "SN002"],
  "default_price": 1500.00,
  "serial_number_prices": {
    "SN001": 1500.00
  }
}
```
**Expected:** 400 Bad Request - "Cannot provide both default_price and serial_number_prices"

### Test Case 5: Validation Error - Missing Price
```json
POST /api/products/:id
{
  "stock_to_add": 2,
  "serial_numbers": ["SN001", "SN002"],
  "serial_number_prices": {
    "SN001": 1500.00
    // SN002 missing
  }
}
```
**Expected:** 400 Bad Request - "Missing or invalid prices for serial numbers: SN002"

### Test Case 6: Validation Error - Invalid Price
```json
POST /api/products/:id
{
  "stock_to_add": 2,
  "serial_numbers": ["SN001", "SN002"],
  "default_price": -100
}
```
**Expected:** 400 Bad Request - "default_price must be greater than 0"

---

## Migration Script

```sql
-- Migration: Add price column to product_serial_numbers

-- Step 1: Add price column (nullable)
ALTER TABLE product_serial_numbers
ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) DEFAULT NULL;

-- Step 2: Add index for price queries (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_serial_number_price 
ON product_serial_numbers(price) 
WHERE price IS NOT NULL;

-- Step 3: Add comment for documentation
COMMENT ON COLUMN product_serial_numbers.price IS 
'Price for this serial number. Can be NULL if pricing not set.';
```

---

## Priority

**High** - Required for the pricing feature to work end-to-end.

---

## Notes

1. **Backward Compatibility:** Existing serial numbers without prices will have `price = NULL`, which is acceptable.

2. **Frontend Integration:** The frontend already sends `default_price` or `serial_number_prices` in the request body. Backend just needs to accept and process these fields.

3. **Future Enhancements:**
   - Price history tracking
   - Bulk price updates
   - Price-based filtering/searching
   - Currency support (if multi-currency needed)

---

## Last Updated
January 2025
