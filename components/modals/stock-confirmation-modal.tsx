"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Upload, Image as ImageIcon, Loader2, AlertCircle, CheckCircle } from "lucide-react"
import type { StockRequest } from "@/lib/api"
import { stockRequestsApi, productsApi, type Product } from "@/lib/api"
import { formatImageUrl, formatDateISO, formatDateTimeISO } from "@/lib/utils"

interface StockConfirmationModalProps {
  request: StockRequest
  onConfirm: () => void
  onClose: () => void
}

export default function StockConfirmationModal({ request, onConfirm, onClose }: StockConfirmationModalProps) {
  const [confirmationImage, setConfirmationImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fullRequest, setFullRequest] = useState<StockRequest>(request)
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [loading, setLoading] = useState(true)

  // Fetch full request details and products
  useEffect(() => {
    const loadFullDetails = async () => {
      try {
        setLoading(true)
        // Fetch the full request with populated product data
        const fullRequestData = await stockRequestsApi.getById(request.id)
        setFullRequest(fullRequestData)

        // Fetch all products to populate missing product info
        const allProducts = await productsApi.getAll()
        const productsMap: Record<string, Product> = {}
        allProducts.forEach(p => {
          productsMap[p.id] = p
        })
        setProducts(productsMap)
      } catch (err) {
        console.error("Failed to load request details:", err)
        // Fallback to original request
        setFullRequest(request)
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
      setConfirmationImage(file)
      setError(null)
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleConfirm = async () => {
    if (!confirmationImage) {
      setError("Please upload a confirmation image")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await stockRequestsApi.confirm(request.id, confirmationImage)
      onConfirm()
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to confirm stock receipt")
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 lg:p-8 max-w-[95%] sm:max-w-xl md:max-w-2xl w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6 sticky top-0 bg-slate-800 pb-4 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Confirm Stock Receipt</h2>
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

        <div className="space-y-6">
          {/* Request Details */}
          <div className="bg-slate-700/50 p-6 rounded-lg space-y-4">
            <div>
              <p className="text-slate-400 text-sm">Items Received</p>
              <div className="space-y-2 mt-2">
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  </div>
                ) : (
                  fullRequest.items?.map((item, index) => {
                    // Try to get product info from item.product first, then from products map
                    const product = item.product || products[item.product_id]
                    const productName = product?.name || "Unknown Product"
                    const productModel = product?.model || ""
                    const serials =
                      item.serial_numbers ??
                      fullRequest.dispatched_serial_numbers?.[item.product_id] ??
                      []
                    return (
                      <div key={index} className="p-2 bg-slate-600/50 rounded space-y-1">
                        <div className="flex justify-between items-center">
                          <p className="text-white font-medium">
                            {productName} {productModel && `- ${productModel}`}
                          </p>
                          <p className="text-cyan-400 font-bold">{item.quantity} units</p>
                        </div>
                        {serials.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-500/50">
                            <p className="text-slate-400 text-xs mb-1">Serial numbers</p>
                            <div className="flex flex-wrap gap-1.5">
                              {serials.map((sn, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 bg-slate-700 rounded text-sm text-cyan-300 font-mono"
                                >
                                  {sn}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {fullRequest.dispatch_image && (
              <div>
                <p className="text-slate-400 text-sm mb-2">Dispatch Image</p>
                <div className="relative w-full h-48 rounded-lg overflow-hidden border border-slate-600">
                  <img
                    src={formatImageUrl(fullRequest.dispatch_image)}
                    alt="Dispatch image"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            {fullRequest.dispatched_at && (
              <div>
                <p className="text-slate-400 text-sm">Dispatched On</p>
                <p className="text-white">{formatDateTimeISO(fullRequest.dispatched_at)}</p>
              </div>
            )}
          </div>

          {/* Confirmation Image Upload */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-300">
              Upload Confirmation Image <span className="text-red-400">*</span>
            </label>
            <p className="text-sm text-slate-400">
              Please upload a photo of the received stock to confirm the delivery.
            </p>

            {imagePreview && (
              <div className="relative w-full h-64 rounded-lg overflow-hidden border border-slate-600">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setConfirmationImage(null)
                    setImagePreview(null)
                  }}
                  className="absolute top-2 right-2 p-2 bg-red-600 rounded-full hover:bg-red-700"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            )}

            {fullRequest.confirmation_image && !imagePreview && (
              <div className="relative w-full h-64 rounded-lg overflow-hidden border border-slate-600">
                <img
                  src={formatImageUrl(fullRequest.confirmation_image)}
                  alt="Current confirmation image"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 px-3 py-1 bg-green-600 rounded-full flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-white" />
                  <span className="text-xs text-white font-medium">Confirmed</span>
                </div>
              </div>
            )}

            {!imagePreview && !fullRequest.confirmation_image && (
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center">
                <ImageIcon className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                <label className="cursor-pointer">
                  <span className="text-blue-400 hover:text-blue-300 font-medium">
                    Click to upload confirmation image
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

            {confirmationImage && !imagePreview && (
              <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg">
                <Upload className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-white">{confirmationImage.name}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {!fullRequest.confirmation_image && (
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
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
                onClick={handleConfirm}
                disabled={!confirmationImage || isSubmitting}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirm Receipt
                  </>
                )}
              </Button>
            </div>
          )}

          {fullRequest.confirmation_image && (
            <div className="p-4 bg-green-950/30 border border-green-700 rounded-lg">
              <p className="text-green-400 text-sm text-center">
                ✓ Stock receipt has been confirmed
              </p>
              <p className="text-slate-400 text-xs text-center mt-1">
                Confirmed on {formatDateTimeISO(fullRequest.confirmed_at)}
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

