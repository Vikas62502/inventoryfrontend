"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Loader2, AlertCircle } from "lucide-react"
import { productsApi, usersApi, type Product, type User } from "@/lib/api"
import { stockRequestsApi } from "@/lib/api"

interface AdminStockRequestModalProps {
  onClose: () => void
  onSuccess: () => void
  requestType: "super-admin" | "admin-transfer" // Request from super-admin or transfer to another admin
}

export default function AdminStockRequestModal({
  onClose,
  onSuccess,
  requestType,
}: AdminStockRequestModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [admins, setAdmins] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [items, setItems] = useState<Array<{ product_id: string; quantity: number }>>([])
  const [notes, setNotes] = useState("")
  const [selectedAdminId, setSelectedAdminId] = useState<string>("")

  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, adminsData] = await Promise.all([
          productsApi.getAll(),
          requestType === "admin-transfer" ? usersApi.getAll("admin") : Promise.resolve([]),
        ])
        setProducts(productsData)
        setAdmins(adminsData)
      } catch (err: any) {
        setError(err.message || "Failed to load data")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [requestType])

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: "product_id" | "quantity", value: string | number) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    setItems(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (items.length === 0) {
      setError("Please add at least one product")
      return
    }

    if (items.some((item) => !item.product_id || item.quantity <= 0)) {
      setError("Please fill all product details correctly")
      return
    }

    if (requestType === "admin-transfer" && !selectedAdminId) {
      setError("Please select an admin to transfer stock to")
      return
    }

    setIsSubmitting(true)

    try {
      // Ensure quantities are numbers, not strings
      const formattedItems = items.map(item => ({
        product_id: item.product_id,
        quantity: typeof item.quantity === 'string' ? parseInt(item.quantity, 10) : item.quantity
      }))

      await stockRequestsApi.create({
        requested_from: requestType === "super-admin" ? "super-admin" : selectedAdminId,
        items: formattedItems,
        notes:
          notes ||
          (requestType === "admin-transfer"
            ? `Stock transfer to admin: ${admins.find((a) => a.id === selectedAdminId)?.name || ""}`
            : "Stock request from admin"),
      })

      onSuccess()
      onClose()
    } catch (err: any) {
      console.error("Stock request error details:", {
        error: err,
        name: err?.name,
        message: err?.message,
        status: err?.status,
        data: err?.data,
        errorData: err?.data?.error,
        errorDetails: err?.data?.error?.details,
      })
      
      // Log the full error structure for debugging
      if (err?.data?.error) {
        console.log("Full error object:", JSON.stringify(err.data.error, null, 2))
      }
      
      // Extract detailed error message
      let errorMessage = "Failed to create stock request"
      
      if (err && typeof err.status === 'number') {
        // Handle nested error structure (data.error)
        const errorData = err.data?.error || err.data
        const apiErrorRaw = typeof errorData === 'string' ? errorData : (errorData?.message || err.message || "")
        const apiError = typeof apiErrorRaw === 'string' ? apiErrorRaw : JSON.stringify(apiErrorRaw)
        
        if (err.status === 400) {
          // Validation errors - check for details array first
          if (errorData?.details && Array.isArray(errorData.details) && errorData.details.length > 0) {
            // Extract messages from details array
            const detailMessages = errorData.details.map((detail: any) => {
              if (typeof detail === 'string') {
                return detail
              } else if (detail?.message) {
                return detail.message
              } else if (detail?.field && detail?.message) {
                return `${detail.field}: ${detail.message}`
              } else if (detail?.path && detail?.message) {
                return `${detail.path}: ${detail.message}`
              } else {
                return JSON.stringify(detail)
              }
            })
            errorMessage = detailMessages.join(", ")
          } else if (errorData?.errors && Array.isArray(errorData.errors)) {
            errorMessage = errorData.errors.join(", ")
          } else if (typeof errorData?.errors === 'object' && errorData?.errors !== null) {
            // Field-specific validation errors
            const fieldErrors = Object.entries(errorData.errors)
              .map(([field, message]) => `${field}: ${message}`)
              .join(", ")
            errorMessage = fieldErrors || apiError || "Validation error. Please check your input."
          } else if (errorData?.message) {
            errorMessage = errorData.message
          } else if (typeof errorData === 'string') {
            errorMessage = errorData
          } else {
            errorMessage = apiError || "Validation error. Please check your input."
          }
        } else {
          errorMessage = apiError || errorMessage
        }
      } else if (err?.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <Card className="bg-slate-800 border-slate-700 p-8 max-w-md w-full">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <p className="text-white">Loading...</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 lg:p-8 max-w-[95%] sm:max-w-xl md:max-w-2xl w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6 sticky top-0 bg-slate-800 pb-4 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            {requestType === "super-admin" ? "Request Stock from Super Admin" : "Transfer Stock to Admin"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition flex-shrink-0 ml-2">
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Admin Selection for Transfer */}
          {requestType === "admin-transfer" && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Transfer To Admin *</label>
              <select
                value={selectedAdminId}
                onChange={(e) => setSelectedAdminId(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                required
              >
                <option value="">Select Admin</option>
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.name} ({admin.username})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Products */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-300">Products *</label>
              <Button
                type="button"
                onClick={addItem}
                variant="outline"
                size="sm"
                className="border-slate-600 text-slate-300 bg-transparent"
              >
                Add Product
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex flex-col sm:flex-row gap-3 p-3 bg-slate-700/30 rounded-lg">
                  <select
                    value={item.product_id}
                    onChange={(e) => updateItem(index, "product_id", e.target.value)}
                    className="flex-1 w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                    required
                  >
                    <option value="">Select Product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} - {product.model}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2 flex-shrink-0">
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                      placeholder="Qty"
                      min="1"
                      className="w-24 sm:w-28 px-3 sm:px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                      required
                    />
                    <Button
                      type="button"
                      onClick={() => removeItem(index)}
                      variant="outline"
                      size="sm"
                      className="border-red-600 text-red-400 hover:bg-red-950 flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Click "Add Product" to add items</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none h-20"
              placeholder="Additional notes or special instructions..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 bg-transparent"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : requestType === "super-admin" ? (
                "Create Request"
              ) : (
                "Transfer Stock"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

