"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Users, ShoppingCart, CreditCard, TrendingUp, BarChart3, Target, Loader2, RotateCcw, Search, Download, Package, Edit2, Eye } from "lucide-react"
import SalesModal from "@/components/modals/sales-modal"
import SaleEditModal from "@/components/modals/sale-edit-modal"
import StockReturnModal from "@/components/modals/stock-return-modal"
import SerialNumbersViewModal from "@/components/modals/serial-numbers-view-modal"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useSalesState } from "@/hooks/use-sales-state"
import { authService } from "@/lib/auth"
import { salesApi, productsApi, quotationsApi, adminInventoryApi, type Quotation, type AdminInventory } from "@/lib/api"
import { generateQuotationPDF } from "@/lib/quotation-generator"
import { formatDateISO, unitToFormSelectValue } from "@/lib/utils"
import type { Sale as ApiSale, Product } from "@/lib/api"

// Type alias for Sale from API (which has snake_case properties)
type Sale = ApiSale & { quotation_id?: string; quotation_status?: string; quotation_final_amount?: number }

interface AgentDashboardProps {
  userName: string
}

export default function AgentDashboard({ userName }: AgentDashboardProps) {
  const sales = useSalesState([])
  const [showSalesModal, setShowSalesModal] = useState(false)
  const [showStockReturnModal, setShowStockReturnModal] = useState(false)
  const [saleType, setSaleType] = useState<"b2b" | "b2c" | null>(null)
  const [filterType, setFilterType] = useState<"all" | "B2B" | "B2C">("all")
  const [salesSearchQuery, setSalesSearchQuery] = useState("")
  const [downloadingSaleId, setDownloadingSaleId] = useState<string | null>(null)
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>("sales")
  const [stockSearchQuery, setStockSearchQuery] = useState("")
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loadingQuotations, setLoadingQuotations] = useState(true)
  const [adminInventory, setAdminInventory] = useState<AdminInventory[]>([])
  const [loadingAdminInventory, setLoadingAdminInventory] = useState(true)
  const [referenceData, setReferenceData] = useState<any[]>([])
  const [showSerialNumbersModal, setShowSerialNumbersModal] = useState(false)
  const [serialNumbersProduct, setSerialNumbersProduct] = useState<{ id: string; name: string } | null>(null)

  const currentUser = authService.getUser()
  const currentUserId = currentUser?.id
  const adminId = currentUser?.created_by_id || currentUser?.admin_id

  // Fetch quotations (B2C sales) from quotations API
  useEffect(() => {
    const loadQuotations = async () => {
      try {
        setLoadingQuotations(true)
        const data = await quotationsApi.getAll()
        setQuotations(data)
      } catch (err) {
        console.error("Failed to load quotations:", err)
        setQuotations([])
      } finally {
        setLoadingQuotations(false)
      }
    }
    loadQuotations()
  }, [])

  // Convert quotation to Sale format for display
  const convertQuotationToSale = (quotation: Quotation): Sale => {
    const customerName = `${quotation.customer.firstName} ${quotation.customer.lastName}`.trim()
    const totalAmount = quotation.pricing?.finalAmount || quotation.pricing?.totalAmount || quotation.finalAmount || 0
    const subtotalAmount = quotation.pricing?.subtotal || totalAmount
    const discountAmount = quotation.pricing?.discountAmount || 0
    const taxAmount = quotation.pricing?.totalSubsidy || 0
    const quantity = quotation.products?.panelQuantity || 0
    const unitPrice = quantity > 0 ? totalAmount / quantity : totalAmount
    const itemSubtotal = unitPrice * quantity

    // Map quotation customer address to billing address format
    const billingAddress = quotation.customer.address ? {
      line1: quotation.customer.address.street || "",
      line2: "",
      city: quotation.customer.address.city || "",
      state: quotation.customer.address.state || "",
      postal_code: quotation.customer.address.pincode || "",
      country: "India",
    } : undefined

    return {
      id: quotation.id,
      type: "B2C",
      customer_name: customerName,
      items: [
        {
          product_id: "",
          quantity,
          unit_price: unitPrice,
          gst_rate: 0,
          subtotal: itemSubtotal,
        },
      ],
      subtotal: subtotalAmount,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      payment_status: (quotation.paymentStatus as "pending" | "completed") || (quotation.status === "pending" ? "pending" : "completed"),
      customer_phone: quotation.customer.mobile,
      customer_email: quotation.customer.email || undefined,
      billing_address: billingAddress,
      delivery_address: billingAddress, // Use same address for delivery
      delivery_matches_billing: true,
      created_by_id: quotation.dealerId || quotation.dealer?.id || "quotation",
      created_at: quotation.createdAt,
      updated_at: quotation.createdAt,
      saleDate: quotation.createdAt,
      // Add quotation-specific fields
      quotation_id: quotation.id,
      quotation_status: quotation.status,
      quotation_final_amount: quotation.pricing?.finalAmount || 0,
    }
  }

  // NOTE: Backend automatically filters data based on authenticated user's role
  // Agents will only receive their own sales and stock requests from the API
  // No additional client-side filtering needed for role-based access
  
  const handleDownloadQuotation = async (sale: Sale) => {
    try {
      setDownloadingSaleId(sale.id)
      
      // Check if this is a quotation (B2C from quotations API)
      const isQuotation = (sale as any).quotation_id || (sale.type === "B2C" && quotations.find(q => q.id === sale.id))
      
      if (isQuotation) {
        // Fetch full quotation details
        const quotation = await quotationsApi.getById(sale.id)
        console.log("Fetched quotation data:", quotation)
        
        // Convert quotation to sale format for PDF generation
        const quotationAsSale = convertQuotationToSale(quotation)
        
        // Fetch all products for lookup
        const allProducts = await productsApi.getAll()
        const productsMap: Record<string, Product> = {}
        allProducts.forEach(p => {
          productsMap[p.id] = p
        })
        
        // Generate and download PDF
        try {
          generateQuotationPDF(quotationAsSale as any, productsMap)
        } catch (pdfError: any) {
          console.error("PDF generation error:", pdfError)
          throw new Error(`PDF generation failed: ${pdfError.message}`)
        }
      } else {
        // Regular sale from sales API
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
      }
    } catch (err: any) {
      console.error("Failed to generate quotation:", err)
      const errorMessage = err.message || err.data?.error || "Failed to generate quotation. Please try again."
      alert(errorMessage)
    } finally {
      setDownloadingSaleId(null)
    }
  }

  // Load admin's inventory (stock that agent can work with)
  useEffect(() => {
    const loadAdminInventory = async () => {
      if (!adminId) {
        setLoadingAdminInventory(false)
        return
      }
      try {
        setLoadingAdminInventory(true)
        const inventory = await adminInventoryApi.getByAdmin(adminId)
        setAdminInventory(inventory)
      } catch (err) {
        console.error("Failed to load admin inventory:", err)
        setAdminInventory([])
      } finally {
        setLoadingAdminInventory(false)
      }
    }
    loadAdminInventory()
  }, [adminId])
  
  // Load reference data for unit display
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const response = await fetch('/PRODUCT_CATALOG_REFERENCE.json')
        const refData = await response.json()
        setReferenceData(refData)
      } catch (err) {
        console.error("Failed to load reference data:", err)
      }
    }
    loadReferenceData()
  }, [])

  // Convert quotations to sales format and merge with existing sales
  const quotationSales = quotations.map(convertQuotationToSale)
  const allSales = [...sales.sales, ...quotationSales]

  // Backend filters sales - agents receive only their own sales
  // Sort sales by date (most recent first)
  const sortedSales = [...allSales].sort((a, b) => {
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
      // Refetch sales to get updated list with the new sale
      await sales.refetch()
      // Reload admin inventory to update available stock (in case backend updated it)
      if (adminId) {
        const inventory = await adminInventoryApi.getByAdmin(adminId)
        setAdminInventory(inventory)
      }
      setShowSalesModal(false)
      setSaleType(null)
    } catch (err) {
      console.error("Failed to create sale:", err)
    }
  }

  // Calculate metrics based on sales (includes quotations for B2C)
  const b2bSales = allSales.filter((s) => s.type === "B2B")
  const b2cSales = allSales.filter((s) => s.type === "B2C")
  
  // Helper function to safely get total amount
  const getTotalAmount = (s: Sale): number => {
    const amount = s.total_amount || (s as any).totalAmount || 0
    return isNaN(amount) || !isFinite(amount) ? 0 : amount
  }
  
  const totalRevenue = allSales.reduce((sum, s) => {
    const amount = getTotalAmount(s)
    return sum + amount
  }, 0)
  const b2bRevenue = b2bSales.reduce((sum, s) => {
    const amount = getTotalAmount(s)
    return sum + amount
  }, 0)
  const b2cRevenue = b2cSales.reduce((sum, s) => {
    const amount = getTotalAmount(s)
    return sum + amount
  }, 0)
  const pendingPayments = allSales.filter((s) => (s.payment_status || (s as any).paymentStatus) === "pending").length
  const completedPayments = allSales.filter((s) => (s.payment_status || (s as any).paymentStatus) === "completed").length
  const pendingAmount = allSales
    .filter((s) => (s.payment_status || (s as any).paymentStatus) === "pending")
    .reduce((sum, s) => {
      const amount = getTotalAmount(s)
      return sum + amount
    }, 0)
  // Calculate average sale value with proper NaN handling
  const safeTotalRevenue = isNaN(totalRevenue) || !isFinite(totalRevenue) ? 0 : totalRevenue
  const averageSaleValue = allSales.length > 0 && safeTotalRevenue > 0 
    ? Math.round(safeTotalRevenue / allSales.length) 
    : 0
  
  // Calculate top product from all sales (including quotations)
  const topProduct =
    allSales.length > 0
      ? Object.entries(
          allSales.reduce(
            (acc, s) => {
              const productName = (s as any).productName || s.items?.[0]?.product?.name || "Multiple Products"
              const quantity = (s as any).quantity || (s.items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0)
              acc[productName] = (acc[productName] || 0) + quantity
              return acc
            },
            {} as Record<string, number>,
          ),
        ).sort(([, a], [, b]) => (b as number) - (a as number))[0]
      : null

  // Calculate stock sold from ALL sales (including quotations for B2C)
  // This includes both sales.sales and quotationSales
  // Use useMemo to recalculate when sales or adminInventory changes
  const stockSold = useMemo(() => {
    const sold: Record<string, number> = {}
    
    // Count stock sold from regular sales
    sales.sales.forEach(sale => {
      sale.items?.forEach(item => {
        if (item.product_id) {
          sold[item.product_id] = (sold[item.product_id] || 0) + (item.quantity || 0)
        }
      })
    })
    
    return sold
  }, [sales.sales])

  // Calculate available stock from admin's inventory (admin's stock minus sold)
  const availableStockFromAdmin = useMemo(() => {
    const available: Record<string, number> = {}
    adminInventory.forEach(inv => {
      const sold = stockSold[inv.product_id] || 0
      available[inv.product_id] = Math.max(0, inv.quantity - sold)
    })
    return available
  }, [adminInventory, stockSold])

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

  // Unit mapping for display
  const unitDisplayMap: Record<string, string> = {
    "NOS": "Quantity",
    "PCS": "Pieces",
    "MTR": "Meters",
    "KGS": "Kilograms",
    "W": "Watts",
    "Fixed": "Fixed",
    "PAC": "Pack",
    "Pillar": "Pillar",
  }

  // Convert admin inventory to display format (admin's stock available for agent)
  const stockItems = adminInventory
    .map((inv) => {
      const availableQty = availableStockFromAdmin[inv.product_id] || inv.quantity
      return {
        productId: inv.product_id,
        quantity: availableQty,
        product: inv.product || products[inv.product_id],
        unit: (() => {
          const refProduct = referenceData.find((item: any) => item.id === inv.product_id || item.name === inv.product?.name)
          if (refProduct?.unit) return unitDisplayMap[refProduct.unit] || refProduct.unit
          const productUnit = products[inv.product_id]?.unit || inv.product?.unit
          const normalized = unitToFormSelectValue(productUnit || "")
          return normalized || ""
        })(),
      }
    })
    .filter((item) => item.quantity > 0) // Only show products with available stock
    .sort((a, b) => (b.product?.name || "").localeCompare(a.product?.name || ""))

  // Calculate available stock for sales (admin's stock minus sold)
  const availableStockForSales = stockItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.productId] = item.quantity
    return acc
  }, {})

  if (sales.loading || loadingAdminInventory) {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
              <p className="text-xl sm:text-2xl font-bold text-amber-400">
                {pendingAmount > 0 ? `₹${(pendingAmount / 1000).toFixed(1)}K` : '₹0'}
              </p>
            </div>
            <CreditCard className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400 opacity-50 flex-shrink-0" />
          </div>
        </Card>
      </div>


      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-800 border border-slate-700 p-1 w-full sm:w-auto">
          <TabsTrigger value="sales" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Sales
          </TabsTrigger>
          <TabsTrigger value="stock" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
            <Package className="w-4 h-4 mr-2" />
            Admin Stock
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
                  <th className="px-4 xl:px-6 py-3 text-left text-xs xl:text-sm font-semibold text-slate-300">Status</th>
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
                      <td className="px-4 xl:px-6 py-3 xl:py-4">
                        {((sale as any).approval_status === "approved" || sale.payment_status === "completed" || (sale as any).paymentStatus === "completed") ? (
                          <span className="px-2 xl:px-3 py-1 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/50 rounded-full">
                            Approved
                          </span>
                        ) : (
                          <span className="px-2 xl:px-3 py-1 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full">
                            Pending approval
                          </span>
                        )}
                      </td>
                      <td className="px-4 xl:px-6 py-3 xl:py-4 text-slate-400 text-xs xl:text-sm">
                        {formatDateISO((sale as any).sale_date || sale.saleDate || sale.created_at)}
                      </td>
                      <td className="px-4 xl:px-6 py-3 xl:py-4">
                        <div className="flex items-center gap-2">
                          {/* Edit: only for sales from sales API (not quotations) - agent can edit before approval */}
                          {!(sale as any).quotation_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingSaleId(sale.id)}
                              className="border-slate-500 text-slate-300 hover:bg-slate-700 text-xs"
                              title="Edit sale"
                            >
                              <Edit2 className="w-3 h-3 xl:w-4 xl:h-4" />
                            </Button>
                          )}
                          {/* Quote/Download only when approved by Account */}
                          {((sale as any).approval_status === "approved" || sale.payment_status === "completed" || (sale as any).paymentStatus === "completed") ? (
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
                          ) : (
                            <span className="text-xs text-amber-400">Pending approval</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
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
                      <p className="text-xs text-slate-400 mb-1">Status</p>
                      {((sale as any).approval_status === "approved" || sale.payment_status === "completed" || (sale as any).paymentStatus === "completed") ? (
                        <span className="inline-block px-2 py-1 text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/50 rounded-full">
                          Approved
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-full">
                          Pending approval
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {!(sale as any).quotation_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingSaleId(sale.id)}
                        className="flex-1 border-slate-500 text-slate-300 hover:bg-slate-700 text-xs"
                      >
                        <Edit2 className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    )}
                    {((sale as any).approval_status === "approved" || sale.payment_status === "completed" || (sale as any).paymentStatus === "completed") ? (
                      <Button
                        size="sm"
                        onClick={() => handleDownloadQuotation(sale)}
                        disabled={downloadingSaleId === sale.id}
                        variant="outline"
                        className="flex-1 border-blue-600 text-blue-400 hover:bg-blue-950 hover:text-blue-400 hover:brightness-110 text-xs"
                      >
                        {downloadingSaleId === sale.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-1" />
                            Quote
                          </>
                        )}
                      </Button>
                    ) : (
                      <span className="flex-1 text-xs text-amber-400 flex items-center justify-center">Pending approval</span>
                    )}
                  </div>
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
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {b2bRevenue > 0 ? `₹${(b2bRevenue / 1000).toFixed(1)}K` : '₹0'}
                </p>
          <p className="text-xs text-slate-400 mt-1">{b2bSales.length} transactions</p>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <Target className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            <span className="text-xs text-slate-400">B2C Revenue</span>
          </div>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {b2cRevenue > 0 ? `₹${(b2cRevenue / 1000).toFixed(1)}K` : '₹0'}
                </p>
          <p className="text-xs text-slate-400 mt-1">{b2cSales.length} transactions</p>
        </Card>
        <Card className="bg-slate-800 border-slate-700 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            <span className="text-xs text-slate-400">Avg. Sale Value</span>
          </div>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {averageSaleValue > 0 ? `₹${averageSaleValue.toLocaleString()}` : '₹0'}
                </p>
          <p className="text-xs text-slate-400 mt-1 truncate">
            {topProduct ? `Top: ${topProduct[0]}` : "No sales yet"}
          </p>
        </Card>
      </div>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          {/* Admin Stock Section */}
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-500" />
                Admin Stock
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Stock available from your admin (stock remains with admin)
              </p>
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
          
            {loadingAdminInventory ? (
              <Card className="bg-slate-800 border-slate-700 p-8 text-center">
                <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto mb-4" />
                <p className="text-slate-400">Loading admin stock...</p>
              </Card>
            ) : (() => {
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
                      <p className="text-xs text-slate-400">{item.unit || "units"}</p>
                  </div>
                </div>
                  <div className="pt-2 mt-2 border-t border-slate-700">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSerialNumbersProduct({ id: item.productId, name: item.product?.name || "Unknown Product" })
                        setShowSerialNumbersModal(true)
                      }}
                      className="border-cyan-600 text-cyan-400 hover:bg-cyan-950 text-xs w-full"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View Serial Numbers
                    </Button>
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
                            <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Actions</th>
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
                          <span className="text-slate-400 text-sm ml-1">{item.unit || "units"}</span>
                        </td>
                        <td className="px-6 py-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSerialNumbersProduct({ id: item.productId, name: item.product?.name || "Unknown Product" })
                              setShowSerialNumbersModal(true)
                            }}
                            className="border-cyan-600 text-cyan-400 hover:bg-cyan-950 text-xs"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View Serials
                          </Button>
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
                      : adminId
                        ? "No stock available from your admin"
                        : "Unable to load admin stock. Please contact support."}
                  </p>
                </Card>
              )
            })()}
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
          availableStock={availableStockForSales}
          adminId={adminId ?? undefined}
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

      {editingSaleId && (
        <SaleEditModal
          saleId={editingSaleId}
          onClose={() => setEditingSaleId(null)}
          onSuccess={async (updated) => {
            await sales.refetch()
            setEditingSaleId(null)
          }}
        />
      )}

      {showSerialNumbersModal && serialNumbersProduct && (
        <SerialNumbersViewModal
          productId={serialNumbersProduct.id}
          productName={serialNumbersProduct.name}
          adminId={adminId || undefined}
          onClose={() => {
            setShowSerialNumbersModal(false)
            setSerialNumbersProduct(null)
          }}
        />
      )}
    </div>
  )
}
