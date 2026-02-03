# Backend Fix: Add Status Column to product_serial_numbers Table

## Issue
Error: `column "status" of relation "product_serial_numbers" does not exist`

This error occurs when the backend tries to query or filter by the `status` column, but the column doesn't exist in the database.

## Solution

### Option 1: Add Status Column (Recommended)

**Migration SQL:**
```sql
-- Add status column with default value
ALTER TABLE product_serial_numbers
ADD COLUMN status VARCHAR(20) DEFAULT 'available';

-- Update existing records to have 'available' status
UPDATE product_serial_numbers
SET status = 'available'
WHERE status IS NULL;

-- Add index for better query performance
CREATE INDEX idx_product_serial_numbers_status ON product_serial_numbers(status);
```

**Also add owner_id and owner_type if not present:**
```sql
-- Add owner_id column (if not exists)
ALTER TABLE product_serial_numbers
ADD COLUMN owner_id VARCHAR(50);

-- Add owner_type column (if not exists)
ALTER TABLE product_serial_numbers
ADD COLUMN owner_type VARCHAR(20);

-- Add foreign key for owner_id
ALTER TABLE product_serial_numbers
ADD CONSTRAINT fk_product_serial_numbers_owner
FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- Add indexes
CREATE INDEX idx_product_serial_numbers_owner_id ON product_serial_numbers(owner_id);
```

### Option 2: Remove Status Checks (Temporary Fix)

If you can't add the column immediately, update your queries to remove status checks:

**Before:**
```sql
WHERE status = 'available'
```

**After:**
```sql
-- Remove status check, or use:
WHERE (status = 'available' OR status IS NULL)
```

**In TypeScript/JavaScript:**
```typescript
// Before
const query = `
  SELECT * FROM product_serial_numbers
  WHERE product_id = ? AND status = 'available'
`;

// After (temporary fix)
const query = `
  SELECT * FROM product_serial_numbers
  WHERE product_id = ?
  -- Remove status check temporarily
`;
```

## Complete Schema

**Full table structure should be:**
```sql
CREATE TABLE product_serial_numbers (
  id VARCHAR(50) PRIMARY KEY,
  product_id VARCHAR(50) NOT NULL,
  serial_number VARCHAR(255) NOT NULL UNIQUE,
  stock_addition_id VARCHAR(50),
  owner_id VARCHAR(50),              -- NEW: For tracking ownership
  owner_type VARCHAR(20),             -- NEW: 'super-admin', 'admin', 'agent', or NULL
  status VARCHAR(20) DEFAULT 'available',  -- NEW: 'available', 'sold', 'returned', etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_product_id (product_id),
  INDEX idx_serial_number (serial_number),
  INDEX idx_owner_id (owner_id),
  INDEX idx_status (status)
);
```

## Status Values

**Recommended status values:**
- `'available'` - Serial number is available for sale/transfer (default)
- `'sold'` - Serial number has been sold
- `'returned'` - Serial number was returned
- `'damaged'` - Serial number is damaged and not available
- `'transferred'` - Serial number has been transferred (optional)

## When Adding Stock

**When adding serial numbers via `PUT /api/products/:id`:**
```sql
INSERT INTO product_serial_numbers (
  id,
  product_id,
  serial_number,
  stock_addition_id,
  owner_id,        -- NULL for SuperAdmin/central stock
  owner_type,      -- NULL or 'super-admin'
  status          -- 'available' (default)
) VALUES (...)
```

## When Transferring Stock (SuperAdmin → Admin)

**Update query should include status check:**
```sql
UPDATE product_serial_numbers
SET 
  owner_id = <admin_id>,
  owner_type = 'admin',
  updated_at = NOW()
WHERE 
  product_id = <product_id>
  AND serial_number BETWEEN <from_serial> AND <to_serial>
  AND (owner_id IS NULL OR owner_id = <super_admin_id>)
  AND (status = 'available' OR status IS NULL)  -- Handle NULL for backward compatibility
```

## Testing

After adding the column:

1. **Verify column exists:**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'product_serial_numbers'
AND column_name = 'status';
```

2. **Check existing records:**
```sql
SELECT COUNT(*) as total,
       COUNT(CASE WHEN status = 'available' THEN 1 END) as available,
       COUNT(CASE WHEN status IS NULL THEN 1 END) as null_status
FROM product_serial_numbers;
```

3. **Update NULL values:**
```sql
UPDATE product_serial_numbers
SET status = 'available'
WHERE status IS NULL;
```

## Priority
**HIGH** - Required for serial number range transfer functionality

## Related Files
- `BACKEND_CHANGES_SERIAL_NUMBERS.md` - Initial serial number implementation
- `BACKEND_CHANGES_SERIAL_NUMBER_RANGE_TRANSFER.md` - Range transfer feature
