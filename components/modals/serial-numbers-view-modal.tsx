"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Loader2, Eye } from "lucide-react"
import { serialNumbersApi, type SerialNumber } from "@/lib/api"

interface SerialNumbersViewModalProps {
  productId: string
  productName: string
  onClose: () => void
  /** When agent views admin's stock, pass adminId to fetch admin-scoped serials */
  adminId?: string
}

export default function SerialNumbersViewModal({
  productId,
  productName,
  onClose,
  adminId,
}: SerialNumbersViewModalProps) {
  const [serials, setSerials] = useState<SerialNumber[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = adminId
          ? await serialNumbersApi.getByAdminProduct(adminId, productId, productName)
          : await serialNumbersApi.getAvailableByProduct(productId, productName)
        setSerials(Array.isArray(data) ? data : [])
      } catch (err: any) {
        setError(err.message || "Failed to load serial numbers")
        setSerials([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [productId, productName, adminId])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="bg-slate-800 border-slate-700 p-6 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Eye className="w-5 h-5 text-cyan-500" />
            Serial Numbers – {productName}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm py-4">{error}</p>
        ) : serials.length === 0 ? (
          <p className="text-slate-400 text-sm py-4">No serial numbers found for this product.</p>
        ) : (
          <div className="overflow-y-auto flex-1 pr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {serials.map((sn) => (
                <div
                  key={sn.id || sn.serial_number}
                  className="p-3 bg-slate-700/50 border border-slate-600 rounded-lg"
                >
                  <p className="text-sm text-white font-mono">{sn.serial_number}</p>
                  {sn.cost_price != null && sn.cost_price > 0 && (
                    <p className="text-xs text-green-400 mt-1">Cost: ₹{Number(sn.cost_price).toLocaleString()}</p>
                  )}
                  {sn.status && (
                    <p className="text-xs text-slate-400 mt-1 capitalize">{sn.status}</p>
                  )}
                  {sn.created_at && (
                    <p className="text-xs text-slate-500 mt-1">
                      Added: {new Date(sn.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-slate-700">
          <Button onClick={onClose} variant="outline" className="w-full border-slate-600 text-slate-300">
            Close
          </Button>
        </div>
      </Card>
    </div>
  )
}
