"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Loader2, AlertCircle, Upload, FileJson, CheckCircle2, AlertTriangle } from "lucide-react"
import { productsApi, type Product } from "@/lib/api"
import {
  buildPrefillFromTallyLines,
  parseTallySaleJson,
  type TallyImportLineItem,
  type TallyImportPrefill,
} from "@/lib/tally-json-import"
import { formatSaleQuantity } from "@/lib/utils"

interface TallyJsonImportModalProps {
  onClose: () => void
  onContinue: (prefill: TallyImportPrefill, saleType: "b2b" | "b2c") => void
  availableProductIds?: Set<string>
}

export default function TallyJsonImportModal({
  onClose,
  onContinue,
  availableProductIds,
}: TallyJsonImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saleType, setSaleType] = useState<"b2b" | "b2c">("b2c")
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [lines, setLines] = useState<TallyImportLineItem[]>([])
  const [header, setHeader] = useState<Omit<TallyImportPrefill, "items"> | null>(null)
  const [detectedType, setDetectedType] = useState<"b2b" | "b2c" | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingProducts(true)
        const data = await productsApi.getAll()
        setProducts(data)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load products")
      } finally {
        setLoadingProducts(false)
      }
    }
    void load()
  }, [])

  const selectableProducts = useMemo(() => {
    if (!availableProductIds?.size) return products
    return products.filter((p) => availableProductIds.has(p.id))
  }, [products, availableProductIds])

  const unmatchedCount = lines.filter((l) => !l.productId).length
  const readyCount = lines.filter((l) => l.productId && l.quantity > 0).length

  const handleParsePayload = (payload: unknown, sourceName: string) => {
    setError(null)
    try {
      const parsed = parseTallySaleJson(payload, products, saleType)
      setLines(parsed.lines)
      setHeader(parsed.prefill)
      setDetectedType(parsed.saleType)
      setSaleType(parsed.saleType)
      setFileName(sourceName)
    } catch (err: unknown) {
      setLines([])
      setHeader(null)
      setDetectedType(null)
      setError(err instanceof Error ? err.message : "Failed to parse Tally JSON")
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      handleParsePayload(payload, file.name)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid JSON file")
    }
    e.target.value = ""
  }

  const updateLineProduct = (index: number, productId: string) => {
    setLines((prev) => {
      const next = [...prev]
      const product = products.find((p) => p.id === productId)
      next[index] = {
        ...next[index],
        productId: productId || null,
        matchedProductName: product?.name || null,
        matchConfidence: productId ? "exact" : "none",
      }
      return next
    })
  }

  const handleContinue = () => {
    if (!header) return
    if (unmatchedCount > 0) {
      setError("Map all Tally items to inventory products before continuing.")
      return
    }
    if (readyCount === 0) {
      setError("At least one line item with quantity is required.")
      return
    }
    onContinue(buildPrefillFromTallyLines(header, lines), saleType)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-4">
      <Card className="bg-slate-800 border-slate-700 w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <FileJson className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Import Tally JSON</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-slate-400">
            Upload a Tally export JSON (<code className="text-slate-300">tallymessage</code>) to prefill a B2B or B2C
            sale. Unmatched products can be mapped manually before opening the sale form.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSaleType("b2b")}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                saleType === "b2b" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300"
              }`}
            >
              B2B
            </button>
            <button
              type="button"
              onClick={() => setSaleType("b2c")}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                saleType === "b2c" ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-300"
              }`}
            >
              B2C
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              className="border-slate-600 text-slate-200"
              disabled={loadingProducts}
              onClick={() => fileInputRef.current?.click()}
            >
              {loadingProducts ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload JSON file
            </Button>
            {fileName && <span className="text-xs text-slate-400 self-center truncate">{fileName}</span>}
          </div>

          {detectedType && (
            <p className="text-xs text-slate-400">
              Detected sale type: <span className="text-white font-medium">{detectedType.toUpperCase()}</span>
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-950/50 border border-red-800 rounded-lg text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {header && (
            <div className="p-3 bg-slate-900/60 border border-slate-700 rounded-lg text-sm space-y-1">
              <p className="text-white font-medium">{header.customerName}</p>
              {header.customerPhone && <p className="text-slate-400">Phone: {header.customerPhone}</p>}
              {header.billingAddress.line1 && (
                <p className="text-slate-400">
                  {header.billingAddress.line1}
                  {header.billingAddress.state ? `, ${header.billingAddress.state}` : ""}
                  {header.billingAddress.postal_code ? ` - ${header.billingAddress.postal_code}` : ""}
                </p>
              )}
              {header.reference && <p className="text-slate-500 text-xs">Ref: {header.reference}</p>}
            </div>
          )}

          {lines.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300 font-medium">Line items</span>
                <span className="text-slate-400">
                  {readyCount} ready · {unmatchedCount} need mapping
                </span>
              </div>
              <div className="overflow-x-auto border border-slate-700 rounded-lg">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-slate-900/80 text-slate-400">
                    <tr>
                      <th className="text-left p-2">Tally item</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Rate</th>
                      <th className="text-right p-2">GST%</th>
                      <th className="text-left p-2">Inventory product</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const isMatched = Boolean(line.productId)
                      return (
                        <tr key={`${line.tallyStockItemName}-${index}`} className="border-t border-slate-700/80">
                          <td className="p-2 text-slate-200">
                            <div>{line.tallyStockItemName}</div>
                            {line.description && (
                              <div className="text-xs text-slate-500 mt-0.5">{line.description}</div>
                            )}
                          </td>
                          <td className="p-2 text-right text-slate-300 whitespace-nowrap">
                            {formatSaleQuantity(line.quantity)} {line.unit}
                          </td>
                          <td className="p-2 text-right text-slate-300">₹{line.unitPrice.toFixed(2)}</td>
                          <td className="p-2 text-right text-slate-300">{line.gstRate}%</td>
                          <td className="p-2">
                            <div className="flex items-center gap-2 min-w-[220px]">
                              {isMatched ? (
                                <CheckCircle2
                                  className={`w-4 h-4 shrink-0 ${
                                    line.matchConfidence === "exact" ? "text-green-400" : "text-amber-400"
                                  }`}
                                />
                              ) : (
                                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                              )}
                              <select
                                value={line.productId || ""}
                                onChange={(e) => updateLineProduct(index, e.target.value)}
                                className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs"
                              >
                                <option value="">Select product…</option>
                                {selectableProducts.map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {product.name}
                                    {product.model && product.model !== product.name ? ` - ${product.model}` : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-700 flex flex-col sm:flex-row gap-2 justify-end">
          <Button type="button" variant="outline" className="border-slate-600" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            disabled={!header || loadingProducts}
            onClick={handleContinue}
          >
            Open {saleType.toUpperCase()} sale form
          </Button>
        </div>
      </Card>
    </div>
  )
}
