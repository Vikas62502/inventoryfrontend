"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Loader2, History } from "lucide-react"
import { inventoryTransactionsApi, type InventoryTransaction, type Product } from "@/lib/api"
import { formatDateISO } from "@/lib/utils"

interface ProductStockHistoryModalProps {
  product: Product
  onClose: () => void
}

export default function ProductStockHistoryModal({ product, onClose }: ProductStockHistoryModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<InventoryTransaction[]>([])

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true)
        setError(null)
        const all = await inventoryTransactionsApi.getAll({ product_id: product.id })
        const additions = all
          .filter((t) => t.quantity > 0 && (t.transaction_type === "purchase" || t.transaction_type === "adjustment" || t.transaction_type === "return" || t.type === "purchase" || t.type === "adjustment" || t.type === "return"))
          .sort((a, b) => {
            const aTime = new Date(a.created_at || a.timestamp || 0).getTime()
            const bTime = new Date(b.created_at || b.timestamp || 0).getTime()
            return bTime - aTime
          })
        setRows(additions)
      } catch (err: any) {
        setError(err?.message || "Failed to load stock history")
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [product.id])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-cyan-400" />
              Stock History
            </h2>
            <p className="text-sm text-slate-400 mt-1">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center">
            <Loader2 className="w-7 h-7 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-slate-400">Loading stock history...</p>
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-red-400 font-medium mb-2">Unable to load stock history</p>
            <p className="text-slate-400 text-sm">{error}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-slate-300 font-medium">No stock addition history found</p>
            <p className="text-slate-500 text-sm mt-1">This product has no recorded stock-add transactions yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-slate-300">Date</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-slate-300">Type</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-slate-300">Reference</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-slate-300">Notes</th>
                  <th className="text-right py-3 px-3 text-xs font-semibold text-slate-300">Qty Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-700/50">
                    <td className="py-3 px-3 text-sm text-slate-300">
                      {formatDateISO(row.created_at || row.timestamp || "")}
                    </td>
                    <td className="py-3 px-3 text-sm text-cyan-400 capitalize">
                      {row.transaction_type || row.type || "N/A"}
                    </td>
                    <td className="py-3 px-3 text-sm text-slate-300">{row.reference || "N/A"}</td>
                    <td className="py-3 px-3 text-sm text-slate-400">{row.notes || "-"}</td>
                    <td className="py-3 px-3 text-sm text-right font-semibold text-emerald-400">
                      +{Math.abs(row.quantity || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button onClick={onClose} variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
            Close
          </Button>
        </div>
      </Card>
    </div>
  )
}

