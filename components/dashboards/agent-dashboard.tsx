"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Users, ShoppingCart, CreditCard, TrendingUp, BarChart3, Target, Loader2, RotateCcw, Search, Download, Package } from "lucide-react"
import SalesModal from "@/components/modals/sales-modal"
import AgentStockRequestModal from "@/components/modals/agent-stock-request-modal"
import StockConfirmationModal from "@/components/modals/stock-confirmation-modal"
import StockReturnModal from "@/components/modals/stock-return-modal"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useSalesState } from "@/hooks/use-sales-state"
import { useStockRequestsState } from "@/hooks/use-stock-requests-state"
import { authService } from "@/lib/auth"
import { salesApi, productsApi } from "@/lib/api"
import { generateQuotationPDF } from "@/lib/quotation-generator"
import { formatDateISO } from "@/lib/utils"
import type { Sale as ApiSale, Product } from "@/lib/api"
import type { StockRequest } from "@/lib/api"

// Type alias for Sale from API (which has snake_case properties)
type Sale = ApiSale

interface AgentDashboardProps {
  userName: string
}

export default function AgentDashboard({ userName }: AgentDashboardProps) {
  const sales = useSalesState([])
  const requests = useStockRequestsState([])
  const [showSalesModal, setShowSalesModal] = useState(false)
  const [showStockRequestModal, setShowStockRequestModal] = useState(false)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false)
  const [showStockReturnModal, setShowStockReturnModal] = useState(false)
  const [saleType, setSaleType] = useState<"b2b" | "b2c" | null>(null)
  const [filterType, setFilterType] = useState<"all" | "B2B" | "B2C">("all")
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null)
  const [salesSearchQuery, setSalesSearchQuery] = useState("")
  const [requestsSearchQuery, setRequestsSearchQuery] = useState("")
  const [downloadingSaleId, setDownloadingSaleId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>("sales")
  const [stockSearchQuery, setStockSearchQuery] = useState("")

  const currentUserId = authService.getUser()?.id

  // NOTE: Backend automatically filters data based on authenticated user's role
  // Agents will only receive their own sales and stock requests from the API
  // No additional client-side filtering needed for role-based access
  
  const handleDownloadQuotation = async (sale: Sale) => {
    try {
      setDownloadingSaleId(sale.id)
      // Fetch full sale details with addresses
      const fullSale = await salesApi.getById(sale.id)
      console.log("Fetched sale data:", fullSale)
      
      // Fetch all products for lookup
      const allProducts = await productsApi.getAll()
      const productsMap: Record<string, Product> = {}
      allProducts.forEach(p => {
        productsMap[p.id] = p
      })
      
      // Validate required data
      if (!fullSale.items || fullSale.items.length === 0) {
        throw new Error("Sale has no items")
      }
      
      // Generate and download PDF
      try {
        generateQuotationPDF(fullSale as any, productsMap)
      } catch (pdfError: any) {
        console.error("PDF generation error:", pdfError)
        throw new Error(`PDF generation failed: ${pdfError.message}`)
      }
    } catch (err: any) {
      console.error("Failed to generate quotation:", err)
      const errorMessage = err.message || err.data?.error || "Failed to generate quotation. Please try again."
      alert(errorMessage)
    } finally {
      setDownloadingSaleId(null)
    }
  }

  // Backend filters stock requests - agents receive only their own requests
  // Sort requests by date (most recent first)
  const sortedRequests = [...requests.requests].sort((a, b) => {
    const dateA = (a.requested_date || a.created_at) ? new Date(a.requested_date || a.created_at).getTime() : 0
    const dateB = (b.requested_date || b.created_at) ? new Date(b.requested_date || b.created_at).getTime() : 0
    return dateB - dateA // Descending order (newest first)
  })
  
  // Filter requests by search query (backend already filtered by role)
  const filteredAndSortedRequests = sortedRequests.filter((r) => {
    if (!requestsSearchQuery.trim()) return true
    // Search in requested_by_name or notes
    return r.requested_by_name?.toLowerCase().includes(requestsSearchQuery.toLowerCase()) ||
           r.notes?.toLowerCase().includes(requestsSearchQuery.toLowerCase()) ||
           false
  })
  
  const pendingRequests = filteredAndSortedRequests.filter(r => r.status === "pending")
  const dispatchedRequests = filteredAndSortedRequests.filter(r => r.status === "dispatched")

  // Backend filters sales - agents receive only their own sales
  // Sort sales by date (most recent first)
  const sortedSales = [...sales.sales].sort((a, b) => {
    const dateA = (a as any).sale_date ? new Date((a as any).sale_date).getTime() :
                  a.saleDate ? new Date(a.saleDate).getTime() :
                  a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = (b as any).sale_date ? new Date((b as any).sale_date).getTime() :
                  b.saleDate ? new Date(b.saleDate).getTime() :
                  b.created_at ? new Date(b.created_at).getTime() : 0
    return dateB - dateA // Descending order (newest first)
  })

  // Filter sales by type and customer search (backend already filtered by role)
  const filteredSales = sortedSales.filter((s) => {
    const typeMatch = filterType === "all" || s.type === filterType
    const customerMatch = !salesSearchQuery.trim() || 
      (s.customer_name?.toLowerCase().includes(salesSearchQuery.toLowerCase()) ||
       (s as any).customerName?.toLowerCase().includes(salesSearchQuery.toLowerCase()) ||
       false)
    return typeMatch && customerMatch
  })

  const handleCreateSale = async (newSale: Sale | Omit<Sale, "id">) => {
    try {
      await sales.addSale(newSale as any)
      await sales.refetch()
      setShowSalesModal(false)
      setSaleType(null)
    } catch (err) {
      console.error("Failed to create sale:", err)
    }
  }

  const handleCreateStockRequest = async () => {
    await requests.refetch()
    setShowStockRequestModal(false)
  }

  const handleConfirmReceipt = async () => {
    await requests.refetch()
    setShowConfirmationModal(false)
    setSelectedRequest(null)
  }

  // Calculate metrics based on sales (backend already filtered - agents only see their own)
  const b2bSales = sales.sales.filter((s) => s.type === "B2B")
  const b2cSales = sales.sales.filter((s) => s.type === "B2C")
  const totalRevenue = sales.sales.reduce((sum, s) => sum + (s.total_amount || (s as any).totalAmount || 0), 0)
  const b2bRevenue = b2bSales.reduce((sum, s) => sum + (s.total_amount || (s as any).totalAmount || 0), 0)
  const b2cRevenue = b2cSales.reduce((sum, s) => sum + (s.total_amount || (s as any).totalAmount || 0), 0)
  const pendingPayments = sales.sales.filter((s) => (s.payment_status || (s as any).paymentStatus) === "pending").length
  const completedPayments = sales.sales.filter((s) => (s.payment_status || (s as any).paymentStatus) === "completed").length
  const pendingAmount = sales.sales
    .filter((s) => (s.payment_status || (s as any).paymentStatus) === "pending")
    .reduce((sum, s) => sum + (s.total_amount || (s as any).totalAmount || 0), 0)
  const averageSaleValue = sales.sales.length > 0 ? Math.round(totalRevenue / sales.sales.length) : 0
  const topProduct =
    sales.sales.length > 0
      ? Object.entries(
          sales.sales.reduce(
            (acc, s) => {
              const productName = (s as any).productName || s.items?.[0]?.product?.name || "Unknown"
              const quantity = (s as any).quantity || (s.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0)
              acc[productName] = (acc[productName] || 0) + quantity
              return acc
            },
            {} as Record<string, number>,
          ),
        ).sort(([, a], [, b]) => (b as number) - (a as number))[0]
      : null

  // Calculate agent's current stock
  // Stock received from confirmed requests minus stock sold
  const confirmedRequests = requests.requests.filter(r => r.status === "confirmed")
  const stockReceived: Record<string, number> = {}
  confirmedRequests.forEach(request => {
    request.items?.forEach(item => {
      stockReceived[item.product_id] = (stockReceived[item.product_id] || 0) + item.quantity
    })
  })

  // Stock sold from sales
  const stockSold: Record<string, number> = {}
  sales.sales.forEach(sale => {
    sale.items?.forEach(item => {
      stockSold[item.product_id] = (stockSold[item.product_id] || 0) + item.quantity
    })
  })

  // Calculate current stock (received - sold)
  const currentStock: Record<string, number> = {}
  Object.keys(stockReceived).forEach(productId => {
    currentStock[productId] = stockReceived[productId] - (stockSold[productId] || 0)
  })

  // Get products for display
  const [products, setProducts] = useState<Record<string, Product>>({})
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const allProducts = await productsApi.getAll()
        const productsMap: Record<string, Product> = {}
        allProducts.forEach(p => {
          productsMap[p.id] = p
        })
        setProducts(productsMap)
      } catch (err) {
        console.error("Failed to load products:", err)
      }
    }
    loadProducts()
  }, [])

  // Get stock items with product info
  const stockItems = Object.entries(currentStock)
    .filter(([_, quantity]) => quantity > 0)
    .map(([productId, quantity]) => ({
      productId,
      quantity,
      product: products[productId]
    }))
    .sort((a, b) => (b.quantity) - (a.quantity))

  if (sales.loading || requests.loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 px-2 sm:px-4 lg:px-6">
      {/* Header */}
      <div className="px-2 sm:px-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Agent Dashboard</h1>
        <p className="text-slate-400">Welcome {userName}</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs sm:text-sm mb-1 sm:mb-2">Total Revenue</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-400">₹{(totalRevenue / 1000).toFixed(1)}K</p>
            </div>
            <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400 opacity-50 flex-shrink-0" />
          </div>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs sm:text-sm mb-1 sm:mb-2">B2B Sales</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-400">{b2bSales.length}</p>
            </div>
            <Users className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400 opacity-50 flex-shrink-0" />
          </div>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs sm:text-sm mb-1 sm:mb-2">B2C Sales</p>
              <p className="text-xl sm:text-2xl font-bold text-cyan-400">{b2cSales.length}</p>
            </div>
            <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 opacity-50 flex-shrink-0" />
          </div>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-xs sm:text-sm mb-1 sm:mb-2">Pending Payments</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-400">₹{(pendingAmount / 1000).toFixed(1)}K</p>
            </div>
            <CreditCard className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400 opacity-50 flex-shrink-0" />
          </div>
        </Card>
      </div>

      {/* Stock Requests Section */}
      {dispatchedRequests.length > 0 && (
        <Card className="bg-amber-950/30 border-amber-700 border p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm sm:text-base mb-1">Stock Requests Awaiting Confirmation</p>
              <p className="text-xs sm:text-sm text-slate-400">
                You have {dispatchedRequests.length} dispatched request(s) that need confirmation
              </p>
            </div>
            <Button
              onClick={() => {
                if (dispatchedRequests[0]) {
                  setSelectedRequest(dispatchedRequests[0])
                  setShowConfirmationModal(true)
                }
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm w-full sm:w-auto"
            >
              Confirm Receipt
            </Button>
          </div>
        </Card>
      )}

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-800 border border-slate-700 p-1 w-full sm:w-auto">
          <TabsTrigger value="sales" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Sales
          </TabsTrigger>
          <TabsTrigger value="stock" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
            <Package className="w-4 h-4 mr-2" />
            My Stock
          </TabsTrigger>
          <TabsTrigger value="requests" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white">
            <TrendingUp className="w-4 h-4 mr-2" />
            Stock Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          {/* Sales Section */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <h2 className="text-lg sm:text-xl font-bold text-white">Sales</h2>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button
                  onClick={() => {
                    setSaleType("b2b")
                    setShowSalesModal(true)
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm py-2 sm:py-2.5"
                >
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                  <span className="hidden xs:inline">New B2B Sale</span>
                  <span className="xs:hidden">B2B Sale</span>
                </Button>
                <Button
                  onClick={() => {
                    setSaleType("b2c")
                    setShowSalesModal(true)
                  }}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs sm:text-sm py-2 sm:py-2.5"
                >
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                  <span className="hidden xs:inline">New B2C Sale</span>
                  <span className="xs:hidden">B2C Sale</span>
                </Button>
              </div>
            </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search by Customer */}
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by customer name..."
              value={salesSearchQuery}
              onChange={(e) => setSalesSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          
          {/* Type Filters (make horizontally scrollable on mobile) */}
          <div className="w-full sm:w-auto overflow-x-auto -mx-1 sm:mx-0 pb-1">
            <div className="flex gap-2 flex-nowrap px-1 sm:px-0">
              <button
                onClick={() => setFilterType("all")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  filterType === "all" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                All Sales
              </button>
              <button
                onClick={() => setFilterType("B2B")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  filterType === "B2B" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                B2B
              </button>
              <button
                onClick={() => setFilterType("B2C")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                  filterType === "B2C" ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                B2C
              </button>
            </div>
          </div>
        </div>

        {/* Sales Table - Desktop */}
        <div className="hidden md:block bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50 border-b border-slate-700">
                <tr>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Customer</th>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Type</th>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Amount</th>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Payment</th>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Date</th>
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredSales.length > 0 ? (
                  filteredSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-700/30 transition">
                      <td className="px-4 xl:px-6 py-3 xl:py-4 text-white font-medium text-xs xl:text-sm">{sale.customer_name || (sale as any).customerName}</td>
                      <td className="px-4 xl:px-6 py-3 xl:py-4">
                        <span
                          className={`px-2 xl:px-3 py-1 text-xs font-semibold rounded-full ${
                            sale.type === "B2B"
                              ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                              : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                          }`}
                        >
                          {sale.type}
                        </span>
                      </td>
                      <td className="px-4 xl:px-6 py-3 xl:py-4 text-white font-bold text-emerald-400 text-xs xl:text-sm">
                        ₹{(sale.total_amount || (sale as any).totalAmount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 xl:px-6 py-3 xl:py-4">
                        {(sale.payment_status || (sale as any).paymentStatus) === "pending" ? (
                          <span className="px-2 xl:px-3 py-1 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full">
                            Pending
                          </span>
                        ) : (
                          <span className="px-2 xl:px-3 py-1 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/50 rounded-full">
                            Completed
                          </span>
                        )}
                      </td>
                      <td className="px-4 xl:px-6 py-3 xl:py-4 text-slate-400 text-xs xl:text-sm">
                        {formatDateISO((sale as any).sale_date || sale.saleDate || sale.created_at)}
                      </td>
                      <td className="px-4 xl:px-6 py-3 xl:py-4">
                        <Button
                          size="sm"
                          onClick={() => handleDownloadQuotation(sale)}
                          disabled={downloadingSaleId === sale.id}
                          variant="outline"
                          className="border-blue-600 text-blue-400 hover:bg-blue-950 hover:text-blue-400 hover:brightness-110 text-xs"
                        >
                          {downloadingSaleId === sale.id ? (
                            <Loader2 className="w-3 h-3 xl:w-4 xl:h-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="w-3 h-3 xl:w-4 xl:h-4 mr-1" />
                              Quote
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      No sales found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sales Cards - Mobile */}
        <div className="md:hidden space-y-3">
          {filteredSales.length > 0 ? (
            filteredSales.map((sale) => (
              <Card key={sale.id} className="bg-slate-800 border-slate-700 p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{sale.customer_name || (sale as any).customerName}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDateISO((sale as any).sale_date || sale.saleDate || sale.created_at)}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${
                        sale.type === "B2B"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                          : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                      }`}
                    >
                      {sale.type}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Amount</p>
                      <p className="text-sm font-bold text-emerald-400">
                        ₹{(sale.total_amount || (sale as any).totalAmount || 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Payment</p>
                      {(sale.payment_status || (sale as any).paymentStatus) === "pending" ? (
                        <span className="inline-block px-2 py-1 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full">
                          Pending
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/50 rounded-full">
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <Button
                    size="sm"
                    onClick={() => handleDownloadQuotation(sale)}
                    disabled={downloadingSaleId === sale.id}
                    variant="outline"
                    className="w-full border-blue-600 text-blue-400 hover:bg-blue-950 hover:text-blue-400 hover:brightness-110 text-xs"
                  >
                    {downloadingSaleId === sale.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-1" />
                        Download Quote
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            ))
          ) : (
            <Card className="bg-slate-800 border-slate-700 p-8 text-center">
              <p className="text-slate-400">No sales found</p>
            </Card>
          )}
        </div>

            {/* Sales Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                  <span className="text-xs text-slate-400">B2B Revenue</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">₹{(b2bRevenue / 1000).toFixed(1)}K</p>
                <p className="text-xs text-slate-400 mt-1">{b2bSales.length} transactions</p>
              </Card>
              <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <Target className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
                  <span className="text-xs text-slate-400">B2C Revenue</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">₹{(b2cRevenue / 1000).toFixed(1)}K</p>
                <p className="text-xs text-slate-400 mt-1">{b2cSales.length} transactions</p>
              </Card>
              <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                  <span className="text-xs text-slate-400">Avg. Sale Value</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">₹{averageSaleValue.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1 truncate">
                  {topProduct ? `Top: ${topProduct[0]}` : "No sales yet"}
                </p>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          {/* My Stock Section */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-500" />
                My Stock
              </h2>
            </div>

            {/* Search for Stock */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by product name or model..."
                value={stockSearchQuery}
                onChange={(e) => setStockSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {(() => {
              const filteredStock = stockItems.filter((item) => {
                if (!stockSearchQuery) return true
                const searchLower = stockSearchQuery.toLowerCase()
                return (
                  item.product?.name?.toLowerCase().includes(searchLower) ||
                  item.product?.model?.toLowerCase().includes(searchLower) ||
                  item.product?.category?.toLowerCase().includes(searchLower) ||
                  false
                )
              })

              return filteredStock.length > 0 ? (
                <>
                  {/* Mobile Card View */}
                  <div className="block lg:hidden space-y-3">
                    {filteredStock.map((item) => (
                <Card key={item.productId} className="bg-slate-800 border-slate-700 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">
                        {item.product?.name || "Unknown Product"}
                      </p>
                      {item.product?.model && (
                        <p className="text-xs text-slate-400 mt-1">{item.product.model}</p>
                      )}
                      {item.product?.category && (
                        <p className="text-xs text-slate-500 mt-1">{item.product.category}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-cyan-400">{item.quantity}</p>
                      <p className="text-xs text-slate-400">units</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

                  {/* Desktop Table View */}
                  <div className="hidden lg:block bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-700/50 border-b border-slate-700">
                          <tr>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Product</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Model</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Category</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Available Stock</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                          {filteredStock.map((item) => (
                      <tr key={item.productId} className="hover:bg-slate-700/30 transition">
                        <td className="px-6 py-4 text-white font-medium">
                          {item.product?.name || "Unknown Product"}
                        </td>
                        <td className="px-6 py-4 text-slate-300">
                          {item.product?.model || "N/A"}
                        </td>
                        <td className="px-6 py-4 text-slate-400">
                          {item.product?.category || "N/A"}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-cyan-400 font-bold text-lg">{item.quantity}</span>
                          <span className="text-slate-400 text-sm ml-1">units</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

                  {/* Summary Card */}
                  <Card className="bg-cyan-950/30 border-cyan-700 border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm mb-1">Total Stock Value</p>
                        <p className="text-2xl font-bold text-cyan-400">
                          {filteredStock.reduce((sum, item) => sum + item.quantity, 0)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {filteredStock.length} {filteredStock.length === 1 ? "product" : "products"} in stock
                        </p>
                      </div>
                      <Package className="w-8 h-8 text-cyan-500 opacity-50 flex-shrink-0" />
                    </div>
                  </Card>
                </>
              ) : (
                <Card className="bg-slate-800 border-slate-700 p-8 text-center">
                  <Package className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg font-semibold mb-2">
                    {stockSearchQuery ? "No products found" : "No Stock Available"}
                  </p>
                  <p className="text-slate-500 text-sm">
                    {stockSearchQuery
                      ? "Try adjusting your search query"
                      : "Your stock will appear here once you receive confirmed stock requests"}
                  </p>
                </Card>
              )
            })()}
          </div>
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          {/* Stock Requests */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <h2 className="text-lg sm:text-xl font-bold text-white">My Stock Requests</h2>
              <Button
                onClick={() => {
                  setShowStockRequestModal(true)
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm py-2 sm:py-2.5"
              >
                <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                Request Stock
              </Button>
            </div>
          
            {/* Search for Stock Requests */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search requests by user or notes..."
                value={requestsSearchQuery}
                onChange={(e) => setRequestsSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            
            {filteredAndSortedRequests.length > 0 ? (
              <div className="space-y-2">
                {filteredAndSortedRequests.map((request) => (
              <Card
                key={request.id}
                className={`border-l-4 p-3 sm:p-4 ${
                  request.status === "pending"
                    ? "bg-amber-950/30 border-l-amber-500"
                    : request.status === "dispatched"
                      ? "bg-green-950/30 border-l-green-500"
                      : request.status === "confirmed"
                        ? "bg-cyan-950/30 border-l-cyan-500"
                        : "bg-red-950/30 border-l-red-500"
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">
                      {request.primary_product_name || request.items?.[0]?.product?.name || "Multiple Products"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Qty: {request.items?.reduce((sum, item) => sum + item.quantity, 0) || 0} •{" "}
                      {formatDateISO(request.requested_date || request.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded flex-shrink-0 ${
                        request.status === "pending"
                          ? "bg-amber-500 text-amber-950"
                          : request.status === "dispatched"
                            ? "bg-green-500 text-green-950"
                            : request.status === "confirmed"
                              ? "bg-cyan-500 text-cyan-950"
                              : "bg-red-500 text-red-950"
                      }`}
                    >
                      {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    </span>
                    {request.status === "dispatched" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request)
                          setShowConfirmationModal(true)
                        }}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs flex-1 sm:flex-initial"
                      >
                        Confirm
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
              </div>
            ) : (
            <Card className="bg-slate-800 border-slate-700 p-8 text-center">
              <TrendingUp className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400 text-lg font-semibold mb-2">No Stock Requests</p>
              <p className="text-slate-500 text-sm">
                {requestsSearchQuery
                  ? "Try adjusting your search query"
                  : "You haven't made any stock requests yet"}
              </p>
            </Card>
          )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {showSalesModal && saleType && (
        <SalesModal
          saleType={saleType as "b2b" | "b2c"}
          onClose={() => {
            setShowSalesModal(false)
            setSaleType(null)
          }}
          onSave={handleCreateSale}
        />
      )}

      {showStockRequestModal && (
        <AgentStockRequestModal
          onClose={() => setShowStockRequestModal(false)}
          onSuccess={handleCreateStockRequest}
        />
      )}

      {showConfirmationModal && selectedRequest && (
        <StockConfirmationModal
          request={selectedRequest as StockRequest}
          onConfirm={handleConfirmReceipt}
          onClose={() => {
            setShowConfirmationModal(false)
            setSelectedRequest(null)
          }}
        />
      )}
      {showStockReturnModal && (
        <StockReturnModal
          userRole="agent"
          onClose={() => setShowStockReturnModal(false)}
          onSuccess={async () => {
            setShowStockReturnModal(false)
          }}
        />
      )}
    </div>
  )
}
