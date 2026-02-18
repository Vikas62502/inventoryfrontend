"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, CheckCircle, XCircle, Upload, Image as ImageIcon, Loader2, AlertCircle } from "lucide-react"
import type { StockRequest, AdminInventory } from "@/lib/api"
import { stockRequestsApi, productsApi, adminInventoryApi, serialNumbersApi, type Product } from "@/lib/api"
import { formatImageUrl, formatDateISO } from "@/lib/utils"
import { authService } from "@/lib/auth"

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
          initialQuantities[index] = item.quantity
        })
        setEditedQuantities(initialQuantities)

        // Fetch all products to populate missing product info
        const allProducts = await productsApi.getAll()
        const productsMap: Record<string, Product> = {}
        allProducts.forEach(p => {
          productsMap[p.id] = p
        })
        setProducts(productsMap)

        // Fetch current admin's inventory
        const currentAdmin = authService.getUser()
        setCurrentUser(currentAdmin)
        if (currentAdmin?.id) {
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
        }
        
        // If super admin, fetch available serial numbers (status=available) for each product
        if (currentAdmin?.role === "super-admin" && fullRequestData.items) {
          const serialNumbersMap: Record<string, any[]> = {}
          for (const item of fullRequestData.items) {
            try {
              const product = item.product || productsMap[item.product_id]
              const productName = product?.name
              const serials = await serialNumbersApi.getAvailableByProduct(item.product_id, productName)
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
          initialQuantities[index] = item.quantity
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
  }

  const toggleSerialSelection = (productId: string, serialNumber: string, maxQty: number) => {
    setSelectedSerialNumbers((prev) => {
      const current = prev[productId] || []
      const isSelected = current.includes(serialNumber)
      if (isSelected) {
        return { ...prev, [productId]: current.filter((s) => s !== serialNumber) }
      }
      if (current.length >= maxQty) return prev
      return { ...prev, [productId]: [...current, serialNumber] }
    })
  }

  const handleApprove = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      // Check if any quantities were modified
      const hasModifiedQuantities = fullRequest.items?.some((item, index) => {
        const editedQty = editedQuantities[index] ?? item.quantity
        return editedQty !== item.quantity
      })

      // If quantities were modified, we need to update the request first
      if (hasModifiedQuantities && fullRequest.items) {
        const updatedItems = fullRequest.items.map((item, index) => ({
          product_id: item.product_id,
          quantity: editedQuantities[index] ?? item.quantity
        }))
        
        // Update the request with modified quantities
        await stockRequestsApi.update(request.id, {
          items: updatedItems
        })
      }

      // Prepare serial number ranges for dispatch (if super admin and ranges are provided)
      const serialNumberRangesData: Record<string, { from: string; to: string }> | undefined = 
        currentUser?.role === "super-admin" && Object.keys(serialNumberRanges).length > 0
          ? Object.entries(serialNumberRanges).reduce((acc, [index, range]) => {
              const item = fullRequest.items?.[parseInt(index)]
              if (item && range.from && range.to) {
                acc[item.product_id] = range
              }
              return acc
            }, {} as Record<string, { from: string; to: string }>)
          : undefined

      // Build serial_numbers map for dispatch (product_id -> selected serials)
      const serialNumbersData =
        currentUser?.role === "super-admin" && Object.keys(selectedSerialNumbers).length > 0
          ? Object.fromEntries(
              Object.entries(selectedSerialNumbers).filter(([, arr]) => arr.length > 0)
            )
          : undefined

      // Dispatch the request
      await stockRequestsApi.dispatch(request.id, {
        dispatch_image: dispatchImage || undefined,
        serial_number_ranges: serialNumberRangesData,
        serial_numbers: serialNumbersData,
      })
      onApprove()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to dispatch stock request")
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
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 lg:p-8 max-w-[95%] sm:max-w-xl md:max-w-2xl w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
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
                      const originalQuantity = item.quantity
                      const editedQuantity = editedQuantities[index] ?? originalQuantity
                      const isModified = editedQuantity !== originalQuantity
                      
                      const serialRange = serialNumberRanges[index] || { from: "", to: "" }
                      const availableSerials = availableSerialNumbers[item.product_id] || []
                      const selectedSerials = selectedSerialNumbers[item.product_id] || []
                      const isSuperAdmin = currentUser?.role === "super-admin"
                      
                      return (
                        <div key={index} className="p-3 bg-slate-600/50 rounded gap-3 space-y-3">
                          <div className="flex justify-between items-center">
                            <div className="flex-1 min-w-0">
                            <p className="text-white font-medium">
                              {productName} {productModel && `- ${productModel}`}
                            </p>
                              {isSuperAdmin ? (
                                <p className="text-slate-400 text-xs mt-1">
                                  Available serial numbers: {availableSerials.length}
                                  {selectedSerials.length > 0 && (
                                    <span className="text-cyan-400 ml-1">
                                      ({selectedSerials.length} selected for dispatch)
                                    </span>
                                  )}
                                </p>
                              ) : (
                                <p className="text-slate-400 text-xs mt-1">My Stock: {adminStock} units</p>
                              )}
                              {isModified && (
                                <p className="text-amber-400 text-xs mt-1">
                                  Original: {originalQuantity} units
                                </p>
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
                          
                          {/* Available Serial Numbers - Select which to dispatch (Super Admin). Only available (status=available) serials shown. */}
                          {isSuperAdmin && (
                            <div className="pt-2 border-t border-slate-700 space-y-2">
                              <p className="text-xs text-slate-400 font-medium">
                                Select serial numbers to dispatch (choose up to {editedQuantity}). Only available serials shown.
                              </p>
                              {availableSerials.length > 0 ? (
                                <div className="max-h-32 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 bg-slate-800/50 rounded">
                                  {availableSerials.map((sn) => {
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
                                          onChange={() => toggleSerialSelection(item.product_id, snStr, editedQuantity)}
                                          className="rounded border-slate-600 bg-slate-700 text-cyan-500"
                                        />
                                        <span className="text-white font-mono truncate">{snStr}</span>
                                      </label>
                                    )
                                  })}
                                </div>
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

