# API Integration Guide

This document explains how the frontend is integrated with the backend API.

## Configuration

### Environment Variables

Create a `.env.local` file in the root directory with the following:

```env
NEXT_PUBLIC_API_URL=http://localhost:3050/api
```

If not set, the default API URL is `http://localhost:3050/api`.

## Architecture

### API Client (`lib/api-client.ts`)

A centralized HTTP client that handles:
- Base URL configuration
- JWT token authentication (automatic token injection)
- Error handling
- 401 Unauthorized responses (auto-logout)
- FormData support for file uploads

### Authentication (`lib/auth.ts`)

Handles authentication state management:
- Token storage in localStorage
- User data storage
- Authentication state checking

### API Services (`lib/api.ts`)

Type-safe API service functions organized by resource:
- `authApi` - Authentication endpoints
- `usersApi` - User management
- `productsApi` - Product CRUD operations
- `salesApi` - Sales management
- `stockRequestsApi` - Stock request management
- `inventoryTransactionsApi` - Inventory transactions
- `adminInventoryApi` - Admin inventory management
- `stockReturnsApi` - Stock returns

### Data Hooks

#### `hooks/use-api-data.ts`
Custom hooks for fetching data from API:
- `useProducts()` - Fetch products
- `useSales()` - Fetch sales
- `useStockRequests()` - Fetch stock requests

#### Updated State Hooks
The following hooks now support API integration:
- `hooks/use-inventory-state.ts` - Manages product inventory (supports API)
- `hooks/use-sales-state.ts` - Manages sales (supports API)
- `hooks/use-stock-requests-state.ts` - Manages stock requests (supports API)

These hooks automatically fetch from API when initialized with empty arrays.

## Authentication Flow

1. User logs in via `/components/auth/login-page.tsx`
2. Login credentials sent to `/api/auth/login`
3. JWT token and user data stored in localStorage
4. Token automatically included in all subsequent API requests
5. On 401 errors, token is cleared and user is redirected to login

## Usage Examples

### Fetching Products

```typescript
import { useInventoryState } from "@/hooks/use-inventory-state"

// Initialize with empty array to fetch from API
const { products, loading, error, addProduct, updateProduct, deleteProduct } = useInventoryState([])

// Or use directly with API
import { productsApi } from "@/lib/api"
const products = await productsApi.getAll()
```

### Creating a Product

```typescript
import { productsApi } from "@/lib/api"

const newProduct = await productsApi.create({
  name: "Solar Panel",
  model: "SP-400W",
  category: "Panels",
  wattage: "400W",
  quantity: 100,
  unit_price: 250.00,
  image: file // Optional File object
})
```

### Creating a Sale

```typescript
import { salesApi } from "@/lib/api"

const newSale = await salesApi.create({
  type: "B2B",
  customer_name: "GreenEnergy Corp",
  items: [
    {
      product_id: "1",
      quantity: 80,
      unit_price: 220.00,
      gst_rate: 10.0
    }
  ],
  tax_amount: 1760.00,
  discount_amount: 0,
  // ... other fields
})
```

## Data Transformation

The API returns data in a different format than the frontend expects. The hooks automatically transform:

### Products
- `unit_price` → `price`
- `central_stock` → `quantity` (if `quantity` not present)

### Sales
- `total_amount` → `totalAmount`
- `created_at` → `saleDate`
- `payment_status` → `paymentStatus`
- Items are transformed to match frontend format

### Stock Requests
- `created_at` → `requestedDate`
- `rejection_reason` → `rejectionReason`
- `requested_by_name` → `adminName`
- Status mapping: `dispatched` → `approved`

## Error Handling

All API calls throw `ApiClientError` with:
- `message` - Error message
- `status` - HTTP status code
- `data` - Error response data

Example error handling:

```typescript
try {
  await productsApi.create(productData)
} catch (error) {
  if (error instanceof ApiClientError) {
    console.error(`API Error (${error.status}):`, error.data?.error || error.message)
  }
}
```

## File Uploads

File uploads are handled using FormData:

```typescript
import { productsApi } from "@/lib/api"

const formData = new FormData()
formData.append("name", "Product Name")
formData.append("image", fileObject)

// The API client automatically detects FormData and sets headers correctly
await productsApi.create({
  name: "Product",
  // ... other fields
  image: fileObject // File object
})
```

## Testing

1. Ensure your API server is running on `http://localhost:3050`
2. Create a `.env.local` file with `NEXT_PUBLIC_API_URL=http://localhost:3050/api`
3. Start the Next.js dev server: `npm run dev`
4. Login with valid credentials (e.g., `superadmin` / `admin123`)

## Troubleshooting

### CORS Issues
Ensure your API server has CORS enabled for the frontend origin.

### 401 Unauthorized
- Check that token is being stored: `localStorage.getItem("auth_token")`
- Verify token is included in requests (check Network tab)
- Token may have expired - try logging in again

### Data Not Loading
- Check browser console for errors
- Verify API endpoint is accessible
- Check Network tab for failed requests
- Ensure API returns data in expected format

### Images Not Displaying
- Verify image URLs are correct (should be `/uploads/<filename>`)
- Check API server is serving uploaded files
- Ensure file uploads are working (check FormData in Network tab)

