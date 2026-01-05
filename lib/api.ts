import { apiClient, type ApiClientError } from "./api-client"
import type { User, LoginResponse, LoginCredentials } from "./auth"

// Auth API - Inventory System
export const authApi = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>("/inventory-auth/login", credentials)
  },

  async getCurrentUser(): Promise<User> {
    return apiClient.get<User>("/inventory-auth/me")
  },

  async forgotPassword(username: string): Promise<{ message: string; resetToken?: string; expiresIn?: string }> {
    return apiClient.post<{ message: string; resetToken?: string; expiresIn?: string }>("/inventory-auth/forgot-password", { username })
  },

  async resetPassword(resetToken: string, newPassword: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>("/inventory-auth/reset-password", { resetToken, newPassword })
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>("/inventory-auth/change-password", { currentPassword, newPassword })
  },
}

// Users API
export const usersApi = {
  async getAll(role?: string): Promise<User[]> {
    const params = role ? { role } : undefined
    return apiClient.get<User[]>("/users", params)
  },

  async getAgents(): Promise<User[]> {
    // Try specific endpoint for agents first
    try {
      return await apiClient.get<User[]>("/users/agents")
    } catch (err) {
      // Fallback to role filter
      try {
        return await apiClient.get<User[]>("/users", { role: "agent" })
      } catch (err2) {
        // Try alternative endpoint for account role
        try {
          return await apiClient.get<User[]>("/account/agents")
        } catch (err3) {
          // Re-throw the original error
          throw err
        }
      }
    }
  },

  async getById(id: string): Promise<User> {
    return apiClient.get<User>(`/users/${id}`)
  },

  async create(user: {
    username: string
    password: string
    name: string
    role: string
    is_active?: boolean
  }): Promise<User> {
    return apiClient.post<User>("/users", user)
  },

  async update(id: string, updates: Partial<User>): Promise<User> {
    return apiClient.put<User>(`/users/${id}`, updates)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/users/${id}`)
  },
}

// Products API
export interface Product {
  id: string
  name: string
  model: string
  category: string
  wattage?: string
  unit_price: number
  central_stock?: number
  distributed_stock?: number
  total_stock?: number
  quantity?: number // For backward compatibility
  price?: number // For backward compatibility
  image?: string
  created_at?: string
  updated_at?: string
}

export interface ProductInventoryLevel {
  id: string
  name: string
  model: string
  category: string
  central_stock: number
  distributed_stock: number
  total_stock: number
}

export const productsApi = {
  async getAll(params?: { category?: string; search?: string }): Promise<Product[]> {
    return apiClient.get<Product[]>("/products", params)
  },

  async getById(id: string): Promise<Product> {
    return apiClient.get<Product>(`/products/${id}`)
  },

  async getInventoryLevels(): Promise<ProductInventoryLevel[]> {
    return apiClient.get<ProductInventoryLevel[]>("/products/inventory/levels")
  },

  async create(
    product: {
      name: string
      model: string
      category: string
      wattage?: string
      quantity: number
      unit_price: number
      image?: File
    }
  ): Promise<Product> {
    const formData = new FormData()
    formData.append("name", product.name)
    formData.append("model", product.model)
    formData.append("category", product.category)
    if (product.wattage) formData.append("wattage", product.wattage)
    formData.append("quantity", (product.quantity ?? 0).toString())
    formData.append("unit_price", (product.unit_price ?? 0).toString())
    if (product.image) formData.append("image", product.image)

    return apiClient.post<Product>("/products", formData, true)
  },

  async update(
    id: string,
    updates: Partial<Omit<Product, "id">> & { image?: File }
  ): Promise<Product> {
    if (updates.image) {
      const formData = new FormData()
      Object.keys(updates).forEach((key) => {
        const value = updates[key as keyof typeof updates]
        if (key === "image" && value instanceof File) {
          formData.append(key, value)
        } else if (value !== undefined && key !== "image") {
          formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value))
        }
      })
      return apiClient.put<Product>(`/products/${id}`, formData, true)
    }
    return apiClient.put<Product>(`/products/${id}`, updates)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/products/${id}`)
  },
}

// Categories API
export interface Category {
  label: string
}

export const categoriesApi = {
  async getAll(): Promise<Category[]> {
    return apiClient.get<Category[]>("/categories")
  },

  async getByLabel(label: string): Promise<Category> {
    return apiClient.get<Category>(`/categories/${label}`)
  },

  async create(label: string): Promise<Category> {
    return apiClient.post<Category>("/categories", { label })
  },
}

// Stock Requests API
export interface StockRequestItem {
  product_id: string
  quantity: number
}

export interface StockRequest {
  id: string
  requested_from: "super-admin" | string  // Can be "super-admin" or admin ID string
  requested_by_id: string
  requested_by_name?: string
  items: Array<{
    id?: string
    product_id: string
    product?: Product
    quantity: number
  }>
  status: "pending" | "dispatched" | "confirmed" | "rejected"
  notes?: string
  rejection_reason?: string
  dispatch_image?: string
  confirmation_image?: string
  created_at: string
  updated_at: string
  dispatched_at?: string
  confirmed_at?: string
  // Backend fields
  primary_product_name?: string
  requested_date?: string
  // Legacy fields for backward compatibility
  productName?: string
  model?: string
  quantity?: number
  adminName?: string
  requestedDate?: string
  rejectionReason?: string
}

export const stockRequestsApi = {
  async getAll(params?: {
    status?: string
    requested_by_id?: string
    requested_from?: string
  }): Promise<StockRequest[]> {
    return apiClient.get<StockRequest[]>("/stock-requests", params)
  },

  async getById(id: string): Promise<StockRequest> {
    return apiClient.get<StockRequest>(`/stock-requests/${id}`)
  },

  async create(request: {
    requested_from: "super-admin" | string  // Can be "super-admin" or admin ID for admin-to-admin transfers
    items: StockRequestItem[]
    notes?: string
    billing_address?: {
      line1: string
      line2?: string
      city: string
      state: string
      postal_code: string
      country: string
    }
    delivery_address?: {
      line1: string
      line2?: string
      city: string
      state: string
      postal_code: string
      country: string
    }
    customer_name?: string
    company_name?: string
    gst_number?: string
    contact_person?: string
    customer_email?: string
    customer_phone?: string
    request_type?: "b2b" | "b2c"
  }): Promise<StockRequest> {
    return apiClient.post<StockRequest>("/stock-requests", request)
  },

  async dispatch(
    id: string,
    data?: {
      rejection_reason?: string
      dispatch_image?: File
    }
  ): Promise<StockRequest> {
    if (data?.dispatch_image) {
      const formData = new FormData()
      if (data.rejection_reason) {
        formData.append("rejection_reason", data.rejection_reason)
      }
      formData.append("dispatch_image", data.dispatch_image)
      return apiClient.post<StockRequest>(`/stock-requests/${id}/dispatch`, formData, true)
    }
    const body = data?.rejection_reason ? { rejection_reason: data.rejection_reason } : {}
    return apiClient.post<StockRequest>(`/stock-requests/${id}/dispatch`, body)
  },

  async confirm(id: string, confirmation_image?: File): Promise<StockRequest> {
    if (confirmation_image) {
      const formData = new FormData()
      formData.append("confirmation_image", confirmation_image)
      return apiClient.post<StockRequest>(`/stock-requests/${id}/confirm`, formData, true)
    }
    return apiClient.post<StockRequest>(`/stock-requests/${id}/confirm`, {})
  },

  async update(
    id: string,
    updates: {
      items?: StockRequestItem[]
      notes?: string
    }
  ): Promise<StockRequest> {
    return apiClient.put<StockRequest>(`/stock-requests/${id}`, updates)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/stock-requests/${id}`)
  },
}

// Sales API
export interface SaleItem {
  product_id: string
  quantity: number
  unit_price: number
  gst_rate?: number
}

export interface Sale {
  id: string
  type: "B2B" | "B2C"
  customer_name: string
  items: Array<{
    id?: string
    product_id: string
    product?: Product
    quantity: number
    unit_price: number
    gst_rate: number
    subtotal: number
  }>
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  payment_status: "pending" | "completed"
  billing_address_id?: string
  delivery_address_id?: string
  billing_address?: {
    line1: string
    line2?: string
    city: string
    state: string
    postal_code: string
    country: string
  }
  delivery_address?: {
    line1: string
    line2?: string
    city: string
    state: string
    postal_code: string
    country: string
  }
  delivery_matches_billing?: boolean
  company_name?: string
  gst_number?: string
  contact_person?: string
  customer_email?: string
  customer_phone?: string
  notes?: string
  image?: string
  bill_image?: string
  created_by_id: string
  created_by_name?: string
  created_at: string
  updated_at: string
  // Legacy fields for backward compatibility
  productName?: string
  quantity?: number
  totalAmount?: number
  saleDate?: string
}

export interface SaleSummary {
  type: "B2B" | "B2C"
  payment_status: "pending" | "completed"
  sale_count: number
  total_quantity: number
  total_revenue: number
  total_subtotal: number
}

export const salesApi = {
  async getAll(params?: {
    type?: string
    payment_status?: string
    customer_name?: string
    start_date?: string
    end_date?: string
  }): Promise<Sale[]> {
    return apiClient.get<Sale[]>("/sales", params)
  },

  async getSummary(): Promise<SaleSummary[]> {
    return apiClient.get<SaleSummary[]>("/sales/summary")
  },

  async getById(id: string): Promise<Sale> {
    return apiClient.get<Sale>(`/sales/${id}`)
  },

  async create(
    sale: {
      type: "B2B" | "B2C"
      customer_name: string
      items: SaleItem[]
      tax_amount: number
      discount_amount?: number
      billing_address_id?: string
      delivery_address_id?: string
      billing_address?: {
        line1: string
        line2?: string
        city: string
        state: string
        postal_code: string
        country: string
      }
      delivery_address?: {
        line1: string
        line2?: string
        city: string
        state: string
        postal_code: string
        country: string
      }
      delivery_matches_billing?: boolean
      company_name?: string
      gst_number?: string
      contact_person?: string
      customer_email?: string
      customer_phone?: string
      notes?: string
      image?: File
    }
  ): Promise<Sale> {
    if (sale.image) {
      const formData = new FormData()
      Object.keys(sale).forEach((key) => {
        const value = sale[key as keyof typeof sale]
        if (key === "image" && value instanceof File) {
          formData.append(key, value)
        } else if (key === "items") {
          formData.append(key, JSON.stringify(value))
        } else if (value !== undefined && key !== "image") {
          formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value))
        }
      })
      return apiClient.post<Sale>("/sales", formData, true)
    }
    return apiClient.post<Sale>("/sales", sale)
  },

  async update(id: string, updates: Partial<Sale>): Promise<Sale> {
    return apiClient.put<Sale>(`/sales/${id}`, updates)
  },

  async confirmBill(id: string, bill_image: File): Promise<Sale> {
    const formData = new FormData()
    formData.append("bill_image", bill_image)
    return apiClient.post<Sale>(`/sales/${id}/confirm-bill`, formData, true)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/sales/${id}`)
  },
}

// Inventory Transactions API
export interface InventoryTransaction {
  id: string
  product_id: string
  product?: Product
  transaction_type: "purchase" | "sale" | "adjustment" | "return" | "transfer"
  quantity: number
  reference: string
  notes?: string
  related_stock_request_id?: string
  related_sale_id?: string
  created_at: string
  // Legacy fields
  type?: "purchase" | "sale" | "return" | "adjustment"
  timestamp?: string
}

export const inventoryTransactionsApi = {
  async getAll(params?: {
    product_id?: string
    transaction_type?: string
    start_date?: string
    end_date?: string
  }): Promise<InventoryTransaction[]> {
    return apiClient.get<InventoryTransaction[]>("/inventory-transactions", params)
  },

  async getById(id: string): Promise<InventoryTransaction> {
    return apiClient.get<InventoryTransaction>(`/inventory-transactions/${id}`)
  },

  async create(transaction: {
    product_id: string
    transaction_type: string
    quantity: number
    reference: string
    notes?: string
    related_stock_request_id?: string
    related_sale_id?: string
  }): Promise<InventoryTransaction> {
    return apiClient.post<InventoryTransaction>("/inventory-transactions", transaction)
  },
}

// Admin Inventory API
export interface AdminInventory {
  id: string
  admin_id: string
  admin?: User
  product_id: string
  product?: Product
  quantity: number
  created_at: string
  updated_at: string
}

export const adminInventoryApi = {
  async getAll(admin_id?: string): Promise<AdminInventory[]> {
    const params = admin_id ? { admin_id } : undefined
    return apiClient.get<AdminInventory[]>("/admin-inventory", params)
  },

  async getByAdmin(adminId: string): Promise<AdminInventory[]> {
    return apiClient.get<AdminInventory[]>(`/admin-inventory/admin/${adminId}`)
  },

  async createOrUpdate(inventory: {
    admin_id: string
    product_id: string
    quantity: number
  }): Promise<AdminInventory> {
    return apiClient.post<AdminInventory>("/admin-inventory", inventory)
  },

  async update(id: string, updates: { quantity: number }): Promise<AdminInventory> {
    return apiClient.put<AdminInventory>(`/admin-inventory/${id}`, updates)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/admin-inventory/${id}`)
  },
}

// Stock Returns API
export interface StockReturn {
  id: string
  admin_id: string
  admin?: User
  product_id: string
  product?: Product
  quantity: number
  reason: string
  status: "pending" | "processed"
  created_at: string
  updated_at: string
  processed_at?: string
}

export const stockReturnsApi = {
  async getAll(params?: {
    admin_id?: string
    status?: string
    start_date?: string
    end_date?: string
  }): Promise<StockReturn[]> {
    return apiClient.get<StockReturn[]>("/stock-returns", params)
  },

  async getById(id: string): Promise<StockReturn> {
    return apiClient.get<StockReturn>(`/stock-returns/${id}`)
  },

  async create(returnData: {
    product_id: string
    quantity: number
    reason: string
  }): Promise<StockReturn> {
    return apiClient.post<StockReturn>("/stock-returns", returnData)
  },

  async process(id: string): Promise<StockReturn> {
    return apiClient.post<StockReturn>(`/stock-returns/${id}/process`, {})
  },

  async update(id: string, updates: { quantity?: number; reason?: string }): Promise<StockReturn> {
    return apiClient.put<StockReturn>(`/stock-returns/${id}`, updates)
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/stock-returns/${id}`)
  },
}

export type { ApiClientError }

