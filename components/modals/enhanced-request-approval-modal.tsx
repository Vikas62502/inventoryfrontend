"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, CheckCircle, XCircle, Upload, Image as ImageIcon, Loader2, AlertCircle, Search } from "lucide-react"
import type { StockRequest, AdminInventory } from "@/lib/api"
import { stockRequestsApi, productsApi, adminInventoryApi, serialNumbersApi, type Product } from "@/lib/api"
import { formatImageUrl, formatDateISO, isSerialRequiredForDispatch } from "@/lib/utils"
import { authService } from "@/lib/auth"

function getCentralStock(product: Product | undefined): number {
  if (!product) return 0
  return product.quantity ?? product.central_stock ?? product.total_stock ?? 0
}

function buildInsufficientStockItemErrors(
  items: StockRequest["items"] | undefined,
  products: Record<string, Product>,
  editedQuantities: Record<number, number>,
  apiMessage?: string
): Record<number, string> {
  const errors: Record<number, string> = {}
  const isStockApiError = apiMessage?.toLowerCase().includes("insufficient stock")

  items?.forEach((item, index) => {
    const product = item.product || products[item.product_id]
    const name = product?.name || ""
    const dispatchQty = editedQuantities[index] ?? Number(item.quantity)
    const centralStock = getCentralStock(product)
    const originalQty = Number(item.quantity)

    if (apiMessage && name && apiMessage.toLowerCase().includes(name.toLowerCase())) {
      errors[index] = apiMessage
      return
    }

    if (centralStock < dispatchQty) {
      errors[index] = `Insufficient stock: ${centralStock} in central inventory (${dispatchQty} to dispatch)`
      return
    }

    if (isStockApiError && centralStock < originalQty) {
      errors[index] = `Insufficient stock: only ${centralStock} available (${originalQty} requested) — reduce dispatch to ${centralStock}`
    }
  })

  return errors
}

function buildSerialItemErrors(
  items: StockRequest["items"] | undefined,
  products: Record<string, Product>,
  apiMessage: string
): Record<number, string> {
  const errors: Record<number, string> = {}
  const lower = apiMessage.toLowerCase()
  if (!lower.includes("serial")) return errors

  items?.forEach((item, index) => {
    const product = item.product || products[item.product_id]
    const name = product?.name || ""
    if (name && lower.includes(name.toLowerCase())) {
      errors[index] =
        `${apiMessage}. Re-select an available serial or verify it is linked to this product in Product Manager.`
    }
  })

  if (Object.keys(errors).length === 0) {
    items?.forEach((item, index) => {
      const product = item.product || products[item.product_id]
      if (isSerialRequiredForDispatch(product?.category, product?.name)) {
        errors[index] =
          `${apiMessage}. The serial may not be linked to product_id ${item.product_id} in the database — backend must validate by product_name if product_id differs.`
      }
    })
  }

  return errors
}

function buildPartialDispatchItemErrors(
  items: StockRequest["items"] | undefined,
  products: Record<string, Product>,
  editedQuantities: Record<number, number>
): Record<number, string> {
  const errors: Record<number, string> = {}
  items?.forEach((item, index) => {
    const product = item.product || products[item.product_id]
    const originalQty = Number(item.quantity)
    const dispatchQty = editedQuantities[index] ?? originalQty
    if (dispatchQty < originalQty) {
      const name = product?.name || "Unknown product"
      errors[index] =
        `Dispatching ${dispatchQty} of ${originalQty} requested. Backend must deduct ${dispatchQty} from central stock (not ${originalQty}).`
    }
  })
  return errors
}

function buildPartialDispatchBlockErrors(
  items: StockRequest["items"] | undefined,
  products: Record<string, Product>,
  editedQuantities: Record<number, number>
): Record<number, string> {
  const errors: Record<number, string> = {}
  items?.forEach((item, index) => {
    const product = item.product || products[item.product_id]
    if (!isSerialRequiredForDispatch(product?.category, product?.name)) return
    const originalQty = Number(item.quantity)
    const dispatchQty = editedQuantities[index] ?? originalQty
    const centralStock = getCentralStock(product)
    if (dispatchQty < originalQty) {
      if (centralStock >= originalQty) {
        errors[index] =
          `Partial dispatch is not supported yet. Increase quantity to ${originalQty} and select ${originalQty} serials.`
      } else {
        errors[index] =
          `Only ${centralStock} in stock but ${originalQty} requested. Partial dispatch (${dispatchQty}) needs a backend fix — reject request or add stock.`
      }
    }
  })
  return errors
}

function buildBackendDeductionHintErrors(
  items: StockRequest["items"] | undefined,
  products: Record<string, Product>,
  editedQuantities: Record<number, number>,
  selectedSerialNumbers: Record<string, string[]>
): Record<number, string> {
  const errors: Record<number, string> = {}
  items?.forEach((item, index) => {
    const product = item.product || products[item.product_id]
    if (!isSerialRequiredForDispatch(product?.category, product?.name)) return
    const dispatchQty = editedQuantities[index] ?? Number(item.quantity)
    const serialCount = selectedSerialNumbers[item.product_id]?.length ?? 0
    const deductQty = serialCount || dispatchQty
    errors[index] =
      `Backend stock error: must deduct ${deductQty} (serials selected), not the full requested quantity.`
  })
  return errors
}

function scrollToDispatchItem(index: number) {
  requestAnimationFrame(() => {
    document.getElementById(`dispatch-item-${index}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    })
  })
}

interface EnhancedRequestApprovalModalProps {
  request: StockRequest
  onApprove: () => void
  onReject: () => void
  onClose: () => void
}

export default function EnhancedRequestApprovalModal({
  request,
  onApprove,
  onReject,
  onClose,
}: EnhancedRequestApprovalModalProps) {
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [dispatchImage, setDispatchImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<number, string>>({})
  const [fullRequest, setFullRequest] = useState<StockRequest>(request)
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [loading, setLoading] = useState(true)
  // Editable quantities - map of item index to quantity
  const [editedQuantities, setEditedQuantities] = useState<Record<number, number>>({})
  // Admin inventory - map of product_id to quantity
  const [adminInventory, setAdminInventory] = useState<Record<string, number>>({})
  // Serial number ranges - map of item index to { from: string, to: string }
  const [serialNumberRanges, setSerialNumberRanges] = useState<Record<number, { from: string; to: string }>>({})
  // Selected serial numbers for dispatch - map of product_id to string[]
  const [selectedSerialNumbers, setSelectedSerialNumbers] = useState<Record<string, string[]>>({})
  // Current user to check if super admin
  const [currentUser, setCurrentUser] = useState<any>(null)
  // Available serial numbers for each product - map of product_id to SerialNumber[]
  const [availableSerialNumbers, setAvailableSerialNumbers] = useState<Record<string, any[]>>({})
  /** Search query per item index for serial selection */
  const [serialSearchPerItem, setSerialSearchPerItem] = useState<Record<number, string>>({})

  // Fetch full request details and products
  useEffect(() => {
    const loadFullDetails = async () => {
      try {
        setLoading(true)
        // Fetch the full request with populated product data
        const fullRequestData = await stockRequestsApi.getById(request.id)
        setFullRequest(fullRequestData)

        // Initialize edited quantities with original quantities
        const initialQuantities: Record<number, number> = {}
        fullRequestData.items?.forEach((item, index) => {
          initialQuantities[index] = Number(item.quantity)
        })
        setEditedQuantities(initialQuantities)

        // Fetch all products to populate missing product info
        const allProducts = await productsApi.getAll()
        const productsMap: Record<string, Product> = {}
        allProducts.forEach(p => {
          productsMap[p.id] = p
        })
        setProducts(productsMap)

        const currentAdmin = authService.getUser()
        setCurrentUser(currentAdmin)
        // Admin inventory applies to admin role only — super-admin uses central stock from products
        if (currentAdmin?.role === "admin" && currentAdmin.id) {
          try {
            const adminInv = await adminInventoryApi.getByAdmin(currentAdmin.id)
            const inventoryMap: Record<string, number> = {}
            adminInv.forEach((inv: AdminInventory) => {
              inventoryMap[inv.product_id] = inv.quantity
            })
            setAdminInventory(inventoryMap)
          } catch (invErr) {
            console.error("Failed to load admin inventory:", invErr)
            setAdminInventory({})
          }
        } else {
          setAdminInventory({})
        }
        
        // Panels & Inverters only — fetch available serial numbers for dispatch
        if (currentAdmin?.role === "super-admin" && fullRequestData.items) {
          const serialNumbersMap: Record<string, any[]> = {}
          for (const item of fullRequestData.items) {
            const product = item.product || productsMap[item.product_id]
            if (!isSerialRequiredForDispatch(product?.category, product?.name)) {
              serialNumbersMap[item.product_id] = []
              continue
            }
            try {
              const serials = await serialNumbersApi.getAvailableByProduct(
                item.product_id,
                product?.name
              )
              serialNumbersMap[item.product_id] = serials
            } catch (err) {
              console.error(`Failed to load serial numbers for product ${item.product_id}:`, err)
              serialNumbersMap[item.product_id] = []
            }
          }
          setAvailableSerialNumbers(serialNumbersMap)
        }
      } catch (err) {
        console.error("Failed to load request details:", err)
        // Fallback to original request
        setFullRequest(request)
        // Initialize with original request quantities
        const initialQuantities: Record<number, number> = {}
        request.items?.forEach((item, index) => {
          initialQuantities[index] = Number(item.quantity)
        })
        setEditedQuantities(initialQuantities)
      } finally {
        setLoading(false)
      }
    }
    loadFullDetails()
  }, [request.id])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file")
        return
      }
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        setError("Image size must be less than 5MB")
        return
      }
      setDispatchImage(file)
      setError(null)
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleQuantityChange = (index: number, newQuantity: number, originalQuantity: number) => {
    // Ensure quantity is not more than original and not less than 1
    const quantity = Math.max(1, Math.min(newQuantity, originalQuantity))
    setEditedQuantities(prev => ({
      ...prev,
      [index]: quantity
    }))
    const item = fullRequest.items?.[index]
    if (item) {
      setSelectedSerialNumbers((prev) => {
        const current = prev[item.product_id] || []
        if (current.length <= quantity) return prev
        return { ...prev, [item.product_id]: current.slice(0, quantity) }
      })
    }
    setItemErrors((prev) => {
      if (!prev[index]) return prev
      const next = { ...prev }
      delete next[index]
      return next
    })
    setError(null)
  }

  const toggleSerialSelection = (productId: string, serialNumber: string, maxQty: number, itemIndex?: number) => {
    setSelectedSerialNumbers((prev) => {
      const current = prev[productId] || []
      const isSelected = current.includes(serialNumber)
      if (isSelected) {
        return { ...prev, [productId]: current.filter((s) => s !== serialNumber) }
      }
      if (current.length >= maxQty) return prev
      return { ...prev, [productId]: [...current, serialNumber] }
    })
    if (itemIndex !== undefined) {
      setItemErrors((prev) => {
        if (!prev[itemIndex]) return prev
        const next = { ...prev }
        delete next[itemIndex]
        return next
      })
      setError(null)
    }
  }

  const handleApprove = async () => {
    setIsSubmitting(true)
    setError(null)
    setItemErrors({})

    try {
      if (currentUser?.role === "super-admin" && fullRequest.items?.length) {
        const stockErrors = buildInsufficientStockItemErrors(
          fullRequest.items,
          products,
          editedQuantities
        )

        if (Object.keys(stockErrors).length > 0) {
          setItemErrors(stockErrors)
          setIsSubmitting(false)
          return
        }
      }

      if (currentUser?.role === "super-admin" && fullRequest.items?.length) {
        const serialItemErrors: Record<number, string> = {}

        fullRequest.items.forEach((item, index) => {
          const product = item.product || products[item.product_id]
          const requiresSerial = isSerialRequiredForDispatch(product?.category, product?.name)
          if (!requiresSerial) return

          const editedQty = editedQuantities[index] ?? Number(item.quantity)
          const availableSerials = availableSerialNumbers[item.product_id] || []
          const selectedSerials = selectedSerialNumbers[item.product_id] || []
          const range = serialNumberRanges[index]
          const usesSerialRange = Boolean(range?.from && range?.to)
          const name = product?.name || "Unknown product"

          if (usesSerialRange) return

          if (availableSerials.length > 0 && selectedSerials.length !== editedQty) {
            serialItemErrors[index] =
              `Select exactly ${editedQty} serial number${editedQty === 1 ? "" : "s"} (${selectedSerials.length} selected)`
            return
          }

          if (availableSerials.length === 0) {
            serialItemErrors[index] =
              "Serial numbers are required for Panels and Inverters — add available serials or use a range below"
          }
        })

        if (Object.keys(serialItemErrors).length > 0) {
          setItemErrors(serialItemErrors)
          setError(null)
          setIsSubmitting(false)
          scrollToDispatchItem(Math.min(...Object.keys(serialItemErrors).map(Number)))
          return
        }

        const partialBlockErrors = buildPartialDispatchBlockErrors(
          fullRequest.items,
          products,
          editedQuantities
        )
        if (Object.keys(partialBlockErrors).length > 0) {
          setItemErrors(partialBlockErrors)
          setError(
            "One or more lines use partial dispatch, which the backend does not support yet. See highlighted items below."
          )
          setIsSubmitting(false)
          scrollToDispatchItem(Math.min(...Object.keys(partialBlockErrors).map(Number)))
          return
        }
      }

      // Prepare serial number ranges for dispatch (if super admin and ranges are provided)
      const serialNumberRangesData: Record<string, { from: string; to: string }> | undefined = 
        currentUser?.role === "super-admin" && Object.keys(serialNumberRanges).length > 0
          ? Object.entries(serialNumberRanges).reduce((acc, [index, range]) => {
              const item = fullRequest.items?.[parseInt(index)]
              const product = item ? item.product || products[item.product_id] : undefined
              if (item && range.from && range.to && isSerialRequiredForDispatch(product?.category, product?.name)) {
                acc[item.product_id] = range
              }
              return acc
            }, {} as Record<string, { from: string; to: string }>)
          : undefined

      const serialRequiredProductIds = new Set(
        fullRequest.items
          ?.filter((item) => {
            const product = item.product || products[item.product_id]
            return isSerialRequiredForDispatch(product?.category, product?.name)
          })
          .map((item) => item.product_id) ?? []
      )

      const serialNumberEntries = Object.entries(selectedSerialNumbers).filter(
        ([productId, arr]) => serialRequiredProductIds.has(productId) && arr.length > 0
      )

      if (currentUser?.role === "super-admin" && fullRequest.items?.length) {
        const serialItemErrors: Record<number, string> = {}

        for (let index = 0; index < fullRequest.items.length; index++) {
          const item = fullRequest.items[index]
          const product = item.product || products[item.product_id]
          if (!isSerialRequiredForDispatch(product?.category, product?.name)) continue

          const range = serialNumberRanges[index]
          if (range?.from && range?.to) continue

          const selected = selectedSerialNumbers[item.product_id] || []
          if (selected.length === 0) continue

          const freshSerials = await serialNumbersApi.getAvailableByProduct(
            item.product_id,
            product?.name
          )
          const availableSet = new Set(freshSerials.map((s) => s.serial_number))
          const invalid = selected.filter((sn) => !availableSet.has(sn))
          if (invalid.length > 0) {
            const name = product?.name || "Unknown product"
            serialItemErrors[index] =
              `${name}: serial ${invalid.join(", ")} is not available for dispatch. Pick another serial or fix product linkage in the backend.`
          }
        }

        if (Object.keys(serialItemErrors).length > 0) {
          setItemErrors(serialItemErrors)
          setIsSubmitting(false)
          return
        }
      }

      const serialNumbersData =
        currentUser?.role === "super-admin" && serialNumberEntries.length > 0
          ? Object.fromEntries(serialNumberEntries)
          : undefined

      // Do not send `items` — backend mis-validates (e.g. "cannot exceed originally requested")
      // or runs requester-only PUT logic. Partial qty is implied by serial_numbers count.
      await stockRequestsApi.dispatch(request.id, {
        dispatch_image: dispatchImage || undefined,
        serial_number_ranges: serialNumberRangesData,
        serial_numbers: serialNumbersData,
      })
      onApprove()
      onClose()
    } catch (err: any) {
      const message = err.message || "Failed to dispatch stock request"
      if (message.toLowerCase().includes("insufficient stock")) {
        const stockErrors = buildInsufficientStockItemErrors(
          fullRequest.items,
          products,
          editedQuantities,
          message
        )
        if (Object.keys(stockErrors).length > 0) {
          setItemErrors(stockErrors)
          setError(null)
        } else {
          setError(message)
        }
      } else if (
        message.toLowerCase().includes("serial") &&
        (message.toLowerCase().includes("invalid") ||
          message.toLowerCase().includes("not available") ||
          message.toLowerCase().includes("required"))
      ) {
        const serialErrors = buildSerialItemErrors(fullRequest.items, products, message)
        if (Object.keys(serialErrors).length > 0) {
          setItemErrors(serialErrors)
          setError(null)
        } else {
          setError(message)
        }
      } else if (
        message.toLowerCase().includes("cannot exceed originally requested") ||
        message.toLowerCase().includes("cannot exceed requested")
      ) {
        const partialErrors = buildPartialDispatchItemErrors(
          fullRequest.items,
          products,
          editedQuantities
        )
        if (Object.keys(partialErrors).length > 0) {
          setItemErrors(partialErrors)
          setError(null)
        } else {
          setError(
            `${message}. Backend must accept partial dispatch when serial count is less than requested quantity.`
          )
        }
      } else if (
        message.includes("products_quantity_check") ||
        message.toLowerCase().includes("check constraint") ||
        message.toLowerCase().includes("quantity negative")
      ) {
        const partialErrors = buildPartialDispatchItemErrors(
          fullRequest.items,
          products,
          editedQuantities
        )
        const deductionErrors = buildBackendDeductionHintErrors(
          fullRequest.items,
          products,
          editedQuantities,
          selectedSerialNumbers
        )
        const merged =
          Object.keys(partialErrors).length > 0
            ? Object.fromEntries(
                Object.entries(partialErrors).map(([idx, msg]) => [
                  idx,
                  `${msg} Backend must deduct serial count, not requested quantity.`,
                ])
              )
            : deductionErrors
        setItemErrors(merged)
        setError(
          Object.keys(partialErrors).length > 0
            ? "Partial dispatch failed — backend deducts the wrong quantity. See highlighted items."
            : "Stock update failed on dispatch — backend deducts the wrong quantity. See highlighted items."
        )
        scrollToDispatchItem(Math.min(...Object.keys(merged).map(Number)))
      } else if (message.toLowerCase().includes("permission to update")) {
        setError(
          `${message}. If you reduced quantities, select the matching serial numbers and try again. The backend must allow dispatch without a separate stock-request update.`
        )
      } else {
        setError(message)
      }
      setIsSubmitting(false)
    }
  }

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      setError("Please provide a rejection reason")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await stockRequestsApi.dispatch(request.id, {
        rejection_reason: rejectionReason,
      })
      onReject()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to reject stock request")
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 lg:p-8 max-w-[95%] sm:max-w-xl md:max-w-3xl w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6 sticky top-0 bg-slate-800 pb-4 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Review & Dispatch Stock Request</h2>
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

        {!showRejectForm ? (
          <div className="space-y-6">
            {/* Request Details */}
            <div className="bg-slate-700/50 p-6 rounded-lg space-y-4">
              <div>
                <p className="text-slate-400 text-sm">Requested By</p>
                <p className="text-white font-semibold text-lg">{fullRequest.requested_by_name || request.requested_by_name || "Unknown"}</p>
              </div>

              <div>
                <p className="text-slate-400 text-sm mb-2">Items Requested</p>
                <div className="space-y-2">
                  {loading ? (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading product details...</span>
                    </div>
                  ) : (
                    fullRequest.items?.map((item, index) => {
                      const product = item.product || products[item.product_id]
                      const productName = product?.name || "Unknown Product"
                      const productModel = product?.model || ""
                      // For Super Admin: show available serials. For Admin: show admin inventory.
                      const adminStock = adminInventory[item.product_id] ?? 0
                      const centralStock = getCentralStock(product)
                      const originalQuantity = Number(item.quantity)
                      const editedQuantity = editedQuantities[index] ?? originalQuantity
                      const isModified = editedQuantity !== originalQuantity
                      const isSuperAdmin = currentUser?.role === "super-admin"
                      const requiresSerial = isSerialRequiredForDispatch(product?.category, productName)
                      const insufficientCentralStock = centralStock < editedQuantity
                      const itemError = itemErrors[index]
                      const serialRange = serialNumberRanges[index] || { from: "", to: "" }
                      const availableSerials = availableSerialNumbers[item.product_id] || []
                      const selectedSerials = selectedSerialNumbers[item.product_id] || []
                      const usesSerialRange = Boolean(serialRange.from && serialRange.to)
                      const serialCountMismatch =
                        requiresSerial &&
                        isSuperAdmin &&
                        !usesSerialRange &&
                        availableSerials.length > 0 &&
                        selectedSerials.length !== editedQuantity
                      const showItemError =
                        Boolean(itemError) ||
                        (isSuperAdmin && insufficientCentralStock) ||
                        serialCountMismatch
                      
                      return (
                        <div
                          id={`dispatch-item-${index}`}
                          key={index}
                          className={`p-3 rounded gap-3 space-y-3 ${
                            showItemError
                              ? "bg-red-950/30 border border-red-800/50"
                              : "bg-slate-600/50"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1 min-w-0">
                            <p className="text-white font-medium">
                              {productName} {productModel && `- ${productModel}`}
                            </p>
                              {isSuperAdmin ? (
                                <>
                                  <p
                                    className={`text-xs mt-1 ${
                                      insufficientCentralStock ? "text-red-400" : "text-slate-400"
                                    }`}
                                  >
                                    Central stock: {centralStock} units
                                    {insufficientCentralStock && (
                                      <span className="ml-1">
                                        (short by {editedQuantity - centralStock})
                                      </span>
                                    )}
                                  </p>
                                  {requiresSerial ? (
                                    <p className="text-slate-400 text-xs mt-1">
                                      Available serial numbers: {availableSerials.length}
                                      {selectedSerials.length > 0 && (
                                        <span className="text-cyan-400 ml-1">
                                          ({selectedSerials.length} selected for dispatch)
                                        </span>
                                      )}
                                    </p>
                                  ) : (
                                    <p className="text-slate-400 text-xs mt-1">
                                      Serial numbers not required for this category
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p className="text-slate-400 text-xs mt-1">My Stock: {adminStock} units</p>
                              )}
                              {isModified && (
                                <p className="text-amber-400 text-xs mt-1">
                                  Original: {originalQuantity} units
                                </p>
                              )}
                              {showItemError && (
                                <div className="flex items-start gap-1.5 mt-2 p-2 bg-red-900/40 border border-red-700/60 rounded text-xs text-red-300">
                                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                  <span>
                                    {itemError ||
                                      (serialCountMismatch
                                        ? `Select exactly ${editedQuantity} serial number${editedQuantity === 1 ? "" : "s"} (${selectedSerials.length} selected)`
                                        : `Insufficient stock: ${centralStock} in central inventory (${editedQuantity} to dispatch)`)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <input
                                type="number"
                                min="1"
                                max={originalQuantity}
                                value={editedQuantity}
                                onChange={(e) => {
                                  const newQty = parseInt(e.target.value) || 0
                                  handleQuantityChange(index, newQty, originalQuantity)
                                }}
                                className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-center focus:outline-none focus:border-cyan-500 font-semibold"
                              />
                              <span className="text-cyan-400 font-bold whitespace-nowrap">units</span>
                            </div>
                          </div>
                          
                          {/* Serial selection — Panels & Inverters only */}
                          {isSuperAdmin && requiresSerial && (
                            <div className="pt-2 border-t border-slate-700 space-y-2">
                              <p className="text-xs text-slate-400 font-medium">
                                Select serial numbers to dispatch (choose up to {editedQuantity}). Only available serials shown.
                              </p>
                              {availableSerials.length > 0 ? (
                                <>
                                  <div className="relative">
                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                      type="text"
                                      placeholder="Search serial numbers..."
                                      value={serialSearchPerItem[index] ?? ""}
                                      onChange={(e) => setSerialSearchPerItem((prev) => ({ ...prev, [index]: e.target.value }))}
                                      className="w-full pl-8 pr-3 py-1.5 mb-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs"
                                    />
                                  </div>
                                  <div className="max-h-32 overflow-y-auto grid gap-2 p-2 bg-slate-800/50 rounded" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                                  {availableSerials
                                    .filter((sn) => {
                                      const snStr = typeof sn === "string" ? sn : sn.serial_number
                                      const q = (serialSearchPerItem[index] ?? "").trim().toLowerCase()
                                      return !q || (snStr ?? "").toLowerCase().includes(q)
                                    })
                                    .map((sn) => {
                                    const snStr = typeof sn === "string" ? sn : sn.serial_number
                                    const isChecked = selectedSerials.includes(snStr)
                                    const atLimit = selectedSerials.length >= editedQuantity && !isChecked
                                    return (
                                      <label
                                        key={sn.id || snStr}
                                        className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${
                                          atLimit ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-700/50"
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          disabled={atLimit}
                                          onChange={() => toggleSerialSelection(item.product_id, snStr, editedQuantity, index)}
                                          className="rounded border-slate-600 bg-slate-700 text-cyan-500"
                                        />
                                        <span className="text-white font-mono whitespace-nowrap">{snStr}</span>
                                      </label>
                                    )
                                  })}
                                </div>
                                {(serialSearchPerItem[index] ?? "").trim() && availableSerials.filter((sn) => {
                                  const snStr = typeof sn === "string" ? sn : sn.serial_number
                                  const q = (serialSearchPerItem[index] ?? "").trim().toLowerCase()
                                  return !q || (snStr ?? "").toLowerCase().includes(q)
                                }).length === 0 && (
                                  <p className="text-xs text-slate-400 py-2">No serial numbers match &quot;{serialSearchPerItem[index]}&quot;</p>
                                )}
                                </>
                              ) : (
                                <p className="text-xs text-amber-400/90 py-2">
                                  No available serial numbers for this product. Add serial numbers with status &quot;available&quot; to dispatch.
                                </p>
                              )}
                              {/* Fallback: Serial Number Range (Optional) */}
                              <details className="mt-2">
                                <summary className="text-xs text-slate-500 cursor-pointer">Or use range (optional)</summary>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  <div>
                                    <label className="block text-xs text-slate-400 mb-1">From</label>
                                    <input
                                      type="text"
                                      value={serialRange.from}
                                      onChange={(e) => {
                                        setSerialNumberRanges(prev => ({
                                          ...prev,
                                          [index]: { ...(prev[index] || { from: "", to: "" }), from: e.target.value }
                                        }))
                                      }}
                                      placeholder="e.g., SN001"
                                      className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-slate-400 mb-1">To</label>
                                    <input
                                      type="text"
                                      value={serialRange.to}
                                      onChange={(e) => {
                                        setSerialNumberRanges(prev => ({
                                          ...prev,
                                          [index]: { ...(prev[index] || { from: "", to: "" }), to: e.target.value }
                                        }))
                                      }}
                                      placeholder="e.g., SN008"
                                      className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                                    />
                                  </div>
                                </div>
                              </details>
                            </div>
                          )}
                        </div>
                      )
                    }) || []
                  )}
                </div>
              </div>

              {fullRequest.notes && (
                <div>
                  <p className="text-slate-400 text-sm">Notes</p>
                  <p className="text-white">{fullRequest.notes}</p>
                </div>
              )}

              <div>
                <p className="text-slate-400 text-sm">Request Date</p>
                <p className="text-white">
                  {formatDateISO(
                    fullRequest.requested_date || 
                    fullRequest.requestedDate || 
                    fullRequest.created_at || 
                    request.requested_date || 
                    request.requestedDate || 
                    request.created_at
                  )}
                </p>
              </div>
            </div>

            {/* Dispatch Image Upload */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300">
                Dispatch Image <span className="text-slate-500">(Optional)</span>
              </label>
              
              {imagePreview && (
                <div className="relative w-full h-48 rounded-lg overflow-hidden border border-slate-600">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setDispatchImage(null)
                      setImagePreview(null)
                    }}
                    className="absolute top-2 right-2 p-2 bg-red-600 rounded-full hover:bg-red-700"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}

              {!imagePreview && request.dispatch_image && (
                <div className="relative w-full h-48 rounded-lg overflow-hidden border border-slate-600">
                  <img
                    src={formatImageUrl(request.dispatch_image)}
                    alt="Current dispatch image"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {!imagePreview && (
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center">
                  <ImageIcon className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                  <label className="cursor-pointer">
                    <span className="text-slate-300 hover:text-white">
                      Click to upload dispatch image
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-slate-500 mt-2">PNG, JPG, GIF up to 5MB</p>
                </div>
              )}

              {dispatchImage && !imagePreview && (
                <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-sm text-white">{dispatchImage.name}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleApprove}
                disabled={isSubmitting}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Dispatching...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Approve & Dispatch
                  </>
                )}
              </Button>
              <Button
                onClick={() => setShowRejectForm(true)}
                variant="outline"
                disabled={isSubmitting}
                className="flex-1 border-red-600 text-red-400 hover:bg-red-950"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-slate-300">Please provide a reason for rejection:</p>
            <textarea
              value={rejectionReason}
              onChange={(e) => {
                setRejectionReason(e.target.value)
                setError(null)
              }}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-red-500 resize-none h-28"
              placeholder="e.g., Insufficient stock, Items on backorder, etc."
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => {
                  setShowRejectForm(false)
                  setRejectionReason("")
                  setError(null)
                }}
                variant="outline"
                disabled={isSubmitting}
                className="flex-1 border-slate-600 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRejectSubmit}
                disabled={!rejectionReason.trim() || isSubmitting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Rejection"
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

