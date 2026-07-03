"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Loader2, AlertCircle, Search } from "lucide-react"
import { productsApi, salesApi, quotationsApi, serialNumbersApi, type Product, type SerialNumber, type Quotation, type CustomerPrefillProfile } from "@/lib/api"
import AddressFields, { type Address } from "@/components/forms/address-fields"
import { unitToFormSelectValue, normalizeSaleQuantity, isWholeSaleQuantity, hasSufficientStock, parseDecimalInput, SALE_QUANTITY_DECIMALS } from "@/lib/utils"

interface SalesModalProps {
  saleType: "b2b" | "b2c"
  onClose: () => void
  onSave: (sale: any) => void
  availableStock?: Record<string, number>
  /** Agent's admin ID – when provided, enables serial number selection from admin's mapped serials */
  adminId?: string
}

export default function SalesModal({ saleType, onClose, onSave, availableStock, adminId }: SalesModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingQuotations, setLoadingQuotations] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedQuotationId, setSelectedQuotationId] = useState<string>("")

  const [items, setItems] = useState<Array<{ product_id: string; quantity: number; unit_price: number; gst_rate: number }>>([
    { product_id: "", quantity: 0, unit_price: 0, gst_rate: 0 },
  ])
  /** Selected serial numbers per item index (agent only, when adminId provided) */
  const [selectedSerialsPerItem, setSelectedSerialsPerItem] = useState<Record<number, string[]>>({})
  /** Available serials per product (admin's mapped serials, fetched when product selected) */
  const [availableSerialsPerProduct, setAvailableSerialsPerProduct] = useState<Record<string, SerialNumber[]>>({})
  const [loadingSerialsForProduct, setLoadingSerialsForProduct] = useState<string | null>(null)
  /** Search query per item index for serial selection */
  const [serialSearchPerItem, setSerialSearchPerItem] = useState<Record<number, string>>({})

  // Address structure matching the Address model
  const emptyAddress: Address = {
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
  }

  // B2B fields
  const [b2bFields, setB2bFields] = useState({
    customer_name: "",
    company_name: "",
    gst_number: "",
    contact_person: "",
    customer_email: "",
    customer_phone: "",
    billing_address: { ...emptyAddress },
    delivery_address: { ...emptyAddress },
    delivery_matches_billing: false,
  })

  // B2C fields
  const [b2cFields, setB2cFields] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    billing_address: { ...emptyAddress },
    delivery_address: { ...emptyAddress },
    delivery_matches_billing: false,
  })

  const [notes, setNotes] = useState("")
  const [prefillLoading, setPrefillLoading] = useState(false)
  const [prefillHint, setPrefillHint] = useState("")
  const lastPrefilledPhoneRef = useRef("")

  const filteredProducts = availableStock
    ? products.filter((product) => (availableStock[product.id] || 0) > 0)
    : products

  const getProductStockUnit = (productId: string): string => {
    const product = products.find((p) => p.id === productId)
    const display = unitToFormSelectValue(product?.unit || "")
    return display || "units"
  }

  const normalizePhone = (value: string): string => value.replace(/\D/g, "").slice(-10)

  const hydrateAddress = (source?: Partial<Address> | Record<string, unknown> | null): Address => {
    const s = (source || {}) as Record<string, unknown>
    return {
      line1: String(s.line1 || s.street || s.streetAddress || ""),
      line2: String(s.line2 || ""),
      city: String(s.city || ""),
      state: String(s.state || ""),
      postal_code: String(s.postal_code || s.pincode || ""),
      country: String(s.country || "India"),
    }
  }

  const applyCustomerPrefill = (
    profile: CustomerPrefillProfile,
    target: "b2b" | "b2c",
    overwrite = false
  ) => {
    const billing = hydrateAddress(profile.billing_address)
    const delivery = hydrateAddress(profile.delivery_address)
    const sameDelivery = profile.delivery_matches_billing ?? true

    if (target === "b2b") {
      setB2bFields((prev) => ({
        ...prev,
        customer_name: overwrite ? profile.customer_name || "" : prev.customer_name || profile.customer_name || "",
        company_name: overwrite ? profile.company_name || "" : prev.company_name || profile.company_name || "",
        gst_number: overwrite ? profile.gst_number || "" : prev.gst_number || profile.gst_number || "",
        contact_person: overwrite
          ? profile.contact_person || profile.customer_name || ""
          : prev.contact_person || profile.contact_person || profile.customer_name || "",
        customer_email: overwrite ? profile.customer_email || "" : prev.customer_email || profile.customer_email || "",
        customer_phone: profile.customer_phone || prev.customer_phone,
        billing_address: overwrite || !prev.billing_address.line1 ? billing : prev.billing_address,
        delivery_address: overwrite || !prev.delivery_address.line1 ? delivery : prev.delivery_address,
        delivery_matches_billing: sameDelivery,
      }))
      return
    }

    setB2cFields((prev) => ({
      ...prev,
      customer_name: overwrite ? profile.customer_name || "" : prev.customer_name || profile.customer_name || "",
      customer_email: overwrite ? profile.customer_email || "" : prev.customer_email || profile.customer_email || "",
      customer_phone: profile.customer_phone || prev.customer_phone,
      billing_address: overwrite || !prev.billing_address.line1 ? billing : prev.billing_address,
      delivery_address: overwrite || !prev.delivery_address.line1 ? delivery : prev.delivery_address,
      delivery_matches_billing: sameDelivery,
    }))
  }

  const prefillByPhone = async (phone: string, target: "b2b" | "b2c") => {
    const normalized = normalizePhone(phone)
    if (normalized.length < 10) return

    setPrefillLoading(true)
    setPrefillHint("")
    try {
      const fromQuotation = await quotationsApi.getCustomerByPhone(normalized)
      if (fromQuotation?.customer) {
        applyCustomerPrefill(fromQuotation.customer, target, true)
        return
      }

      const fromSales = await salesApi.getCustomerByPhone(normalized)
      if (fromSales?.customer) {
        applyCustomerPrefill(fromSales.customer, target, true)
        return
      }

      setPrefillHint("No customer found for this phone. Enter details manually.")
    } catch (err: any) {
      console.warn("Customer lookup failed:", err?.message || err)
      setPrefillHint("Could not look up customer. Enter details manually.")
    } finally {
      setPrefillLoading(false)
    }
  }

  const handlePhoneChange = (raw: string, target: "b2b" | "b2c") => {
    if (target === "b2b") {
      setB2bFields((prev) => ({ ...prev, customer_phone: raw }))
    } else {
      setB2cFields((prev) => ({ ...prev, customer_phone: raw }))
    }

    const normalized = normalizePhone(raw)
    if (normalized.length < 10) {
      lastPrefilledPhoneRef.current = ""
      setPrefillHint("")
      return
    }

    if (normalized !== lastPrefilledPhoneRef.current) {
      lastPrefilledPhoneRef.current = normalized
      void prefillByPhone(raw, target)
    }
  }

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const data = await productsApi.getAll()
        setProducts(data)
      } catch (err: any) {
        setError(err.message || "Failed to load products")
      } finally {
        setLoading(false)
      }
    }
    loadProducts()
  }, [])



  // Load quotations for B2C sales
  useEffect(() => {
    if (saleType === "b2c") {
      const loadQuotations = async () => {
        try {
          setLoadingQuotations(true)
          console.log("Loading quotations for B2C sale...")
          const data = await quotationsApi.getAll()
          console.log("Quotations loaded:", data)
          console.log("Number of quotations:", data.length)
          setQuotations(data)
          
          if (data.length === 0) {
            console.warn("No quotations found. This might be expected if no quotations exist yet.")
          }
        } catch (err: any) {
          console.error("Failed to load quotations:", err)
          console.error("Error details:", {
            message: err.message,
            status: err.status,
            data: err.data
          })
          // Don't show error - quotations are optional
          setQuotations([])
        } finally {
          setLoadingQuotations(false)
        }
      }
      loadQuotations()
    }
  }, [saleType])

  // Handle quotation selection - auto-fill customer details
  const handleQuotationSelect = async (quotationId: string) => {
    if (!quotationId) {
      // Clear fields if no quotation selected
      setB2cFields({
        customer_name: "",
        customer_email: "",
        customer_phone: "",
        billing_address: { ...emptyAddress },
        delivery_address: { ...emptyAddress },
        delivery_matches_billing: false,
      })
      setSelectedQuotationId("")
      lastPrefilledPhoneRef.current = ""
      return
    }

    try {
      setLoadingQuotations(true)
      const quotation = await quotationsApi.getById(quotationId)
      
      // Auto-fill customer details from quotation
      const customerName = `${quotation.customer.firstName} ${quotation.customer.lastName}`.trim()
      const customerPhone = quotation.customer.mobile
      const customerEmail = quotation.customer.email || ""
      
      // Map quotation address to Address format
      const billingAddress: Address = {
        line1: quotation.customer.address?.street || "",
        line2: "",
        city: quotation.customer.address?.city || "",
        state: quotation.customer.address?.state || "",
        postal_code: quotation.customer.address?.pincode || "",
        country: "India", // Default or from quotation if available
      }

      setB2cFields({
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        billing_address: billingAddress,
        delivery_address: { ...billingAddress },
        delivery_matches_billing: true,
      })
      lastPrefilledPhoneRef.current = normalizePhone(customerPhone)
      
      setSelectedQuotationId(quotationId)
    } catch (err: any) {
      console.error("Failed to load quotation details:", err)
      setError("Failed to load customer details from quotation")
    } finally {
      setLoadingQuotations(false)
    }
  }

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: 0, unit_price: 0, gst_rate: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
    setSelectedSerialsPerItem(prev => {
      const next: Record<number, string[]> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const i = parseInt(k, 10)
        if (i < index) next[i] = v
        else if (i > index) next[i - 1] = v
      })
      return next
    })
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    
    // When quantity decreases, trim selected serials to match (whole numbers only)
    if (field === "quantity" && typeof value === "number" && isWholeSaleQuantity(value)) {
      const current = selectedSerialsPerItem[index] || []
      const maxSerials = Math.round(value)
      if (current.length > maxSerials) {
        setSelectedSerialsPerItem(prev => ({ ...prev, [index]: current.slice(0, maxSerials) }))
      }
    } else if (field === "quantity" && typeof value === "number" && !isWholeSaleQuantity(value)) {
      setSelectedSerialsPerItem(prev => {
        const next = { ...prev }
        delete next[index]
        return next
      })
    }
    
    // Auto-fill unit price from product (use selling_price for sales, else cost/unit_price)
    if (field === "product_id" && value) {
      const product = products.find(p => p.id === value)
      if (product) {
        updated[index].unit_price = product.selling_price ?? product.unit_price ?? product.price ?? 0
      }
      // Clear selected serials when product changes
      setSelectedSerialsPerItem(prev => {
        const next = { ...prev }
        delete next[index]
        return next
      })
      // Fetch admin's serials for this product (agent with adminId)
      if (adminId && value) {
        const p = products.find(pr => pr.id === value)
        fetchSerialsForProduct(String(value), p?.name)
      }
    }
    
    setItems(updated)
  }

  // Fetch admin's serial numbers when product is selected (agent with adminId)
  const fetchSerialsForProduct = async (productId: string, productName?: string) => {
    if (!adminId || !productId) return
    setLoadingSerialsForProduct(productId)
    try {
      const serials = await serialNumbersApi.getByAdminProduct(adminId, productId, productName)
      setAvailableSerialsPerProduct(prev => ({ ...prev, [productId]: serials }))
    } catch {
      setAvailableSerialsPerProduct(prev => ({ ...prev, [productId]: [] }))
    } finally {
      setLoadingSerialsForProduct(null)
    }
  }

  const toggleSerialForItem = (itemIndex: number, serialNumber: string) => {
    const item = items[itemIndex]
    const qty = normalizeSaleQuantity(item?.quantity)
    if (!item || !item.product_id || qty <= 0 || !isWholeSaleQuantity(qty)) return
    const maxSerials = Math.round(qty)
    const current = selectedSerialsPerItem[itemIndex] || []
    const isSelected = current.includes(serialNumber)
    let next: string[]
    if (isSelected) {
      next = current.filter(s => s !== serialNumber)
    } else {
      if (current.length >= maxSerials) return
      next = [...current, serialNumber]
    }
    setSelectedSerialsPerItem(prev => ({ ...prev, [itemIndex]: next }))
  }

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
    const taxAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price * (item.gst_rate / 100)), 0)
    const totalAmount = subtotal + taxAmount
    return { subtotal, taxAmount, totalAmount }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file")
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Image size must be less than 5MB")
        return
      }
      setImageFile(file)
      setError(null)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (items.length === 0) {
      setError("Please add at least one product")
      return
    }

    const normalizedItems = items.map((item, idx) => {
      const quantity = normalizeSaleQuantity(item.quantity)
      const unit_price = Math.round(parseDecimalInput(String(item.unit_price)) * 100) / 100
      const gst_rate = Number(item.gst_rate ?? 0)
      const subtotal = Number.isFinite(quantity) && Number.isFinite(unit_price)
        ? quantity * unit_price
        : 0
      const serial_numbers = adminId && isWholeSaleQuantity(quantity)
        ? (selectedSerialsPerItem[idx] || []).filter(Boolean)
        : undefined
      const payload: any = {
        product_id: (item.product_id || "").trim(),
        quantity,
        unit_price,
        gst_rate,
        subtotal,
      }
      if (serial_numbers && serial_numbers.length > 0) {
        payload.serial_numbers = serial_numbers
      }
      return payload
    })

    if (
      normalizedItems.some(
        item =>
          !item.product_id ||
          !Number.isFinite(item.quantity) ||
          item.quantity <= 0 ||
          !Number.isFinite(item.unit_price) ||
          item.unit_price <= 0 ||
          !Number.isFinite(item.gst_rate) ||
          item.gst_rate < 0,
      )
    ) {
      setError("Please fill all product details correctly")
      return
    }

    // Validate against available stock for agents (if provided)
    if (availableStock) {
      for (const item of normalizedItems) {
        const availableQty = availableStock[item.product_id] || 0
        if (!hasSufficientStock(availableQty, item.quantity)) {
          const product = products.find(p => p.id === item.product_id)
          const stockUnit = getProductStockUnit(item.product_id)
          const productLabel = product
            ? `${product.name}${product.model && product.model !== product.name ? ` - ${product.model}` : ""}`
            : "Selected product"
          setError(`${productLabel}: Requested quantity (${item.quantity}) exceeds available stock (${availableQty} ${stockUnit}).`)
          return
        }
      }
    }

    // Serial selection is optional – if selected, count must match quantity; if not selected, sale proceeds without serial_numbers
    if (adminId) {
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]
        const qty = normalizeSaleQuantity(item.quantity)
        const selected = selectedSerialsPerItem[idx] || []
        if (selected.length > 0) {
          if (!isWholeSaleQuantity(qty)) {
            const product = products.find(p => p.id === item.product_id)
            setError(`${product?.name || "Product"}: Serial numbers require a whole-number quantity.`)
            return
          }
          if (selected.length !== Math.round(qty)) {
            const product = products.find(p => p.id === item.product_id)
            const productLabel = product?.name || "Product"
            setError(`${productLabel}: Selected ${selected.length} serial(s) but quantity is ${qty}. Select exactly ${Math.round(qty)} or clear selection.`)
            return
          }
        }
      }
    }

    // Validate B2B fields
    if (saleType === "b2b") {
      if (!b2bFields.customer_name || !b2bFields.company_name || !b2bFields.contact_person) {
        setError("Please fill all required B2B fields")
        return
      }
      // Validate billing address
      const billing = b2bFields.billing_address
      if (!billing.line1 || !billing.city || !billing.state || !billing.postal_code || !billing.country) {
        setError("Please fill all required billing address fields")
        return
      }
      // Validate delivery address if different
      if (!b2bFields.delivery_matches_billing) {
        const delivery = b2bFields.delivery_address
        if (!delivery.line1 || !delivery.city || !delivery.state || !delivery.postal_code || !delivery.country) {
          setError("Please fill all required delivery address fields")
          return
        }
      }
    }

    // Validate B2C fields
    if (saleType === "b2c") {
      if (!b2cFields.customer_name || !b2cFields.customer_phone) {
        setError("Please fill all required B2C fields")
        return
      }
      // Validate billing address
      const billing = b2cFields.billing_address
      if (!billing.line1 || !billing.city || !billing.state || !billing.postal_code || !billing.country) {
        setError("Please fill all required billing address fields")
        return
      }
      // Validate delivery address if different
      if (!b2cFields.delivery_matches_billing) {
        const delivery = b2cFields.delivery_address
        if (!delivery.line1 || !delivery.city || !delivery.state || !delivery.postal_code || !delivery.country) {
          setError("Please fill all required delivery address fields")
          return
        }
      }
    }

    setIsSubmitting(true)

    try {
      const { subtotal, taxAmount, totalAmount } = calculateTotals()
      
      const baseSaleData: any = {
        type: saleType === "b2b" ? "B2B" : "B2C",
        customer_name: saleType === "b2b" ? b2bFields.customer_name : b2cFields.customer_name,
        tax_amount: taxAmount,
        discount_amount: 0,
        subtotal,
        total_amount: totalAmount,
        delivery_matches_billing: saleType === "b2b" ? b2bFields.delivery_matches_billing : b2cFields.delivery_matches_billing,
        notes: notes || undefined,
        image: imageFile || undefined,
      }

      // Add B2B specific fields
      if (saleType === "b2b") {
        baseSaleData.company_name = b2bFields.company_name
        baseSaleData.gst_number = b2bFields.gst_number || undefined
        baseSaleData.contact_person = b2bFields.contact_person
        baseSaleData.customer_email = b2bFields.customer_email || undefined
        baseSaleData.customer_phone = b2bFields.customer_phone || undefined
        // Send address objects - backend will create them
        baseSaleData.billing_address = b2bFields.billing_address
        if (!b2bFields.delivery_matches_billing) {
          baseSaleData.delivery_address = b2bFields.delivery_address
        }
      }

      // Add B2C specific fields
      if (saleType === "b2c") {
        baseSaleData.customer_email = b2cFields.customer_email || undefined
        baseSaleData.customer_phone = b2cFields.customer_phone
        // Send address objects - backend will create them
        baseSaleData.billing_address = b2cFields.billing_address
        if (!b2cFields.delivery_matches_billing) {
          baseSaleData.delivery_address = b2cFields.delivery_address
        }
      }

      const isItemsInvalid = (err: any) => {
        const details = err?.data?.details
        if (Array.isArray(details)) {
          return details.some((detail: any) => {
            const path = typeof detail?.path === "string" ? detail.path : ""
            const message = typeof detail?.message === "string" ? detail.message : ""
            return path.includes("items") || message.toLowerCase().includes("items")
          })
        }
        const msg = typeof err?.message === "string" ? err.message : ""
        return msg.toLowerCase().includes("items") && msg.toLowerCase().includes("invalid")
      }

      const submitWithItems = (itemsPayload: any) => salesApi.create({ ...baseSaleData, items: itemsPayload })

      // Prefer array payload, fallback to single object if backend expects it
      const primaryItemsPayload = normalizedItems
      const fallbackItemsPayload = normalizedItems.length === 1 ? normalizedItems[0] : null

      let created
      try {
        created = await submitWithItems(primaryItemsPayload)
      } catch (err: any) {
        if (fallbackItemsPayload && isItemsInvalid(err)) {
          created = await submitWithItems(fallbackItemsPayload)
        } else {
          throw err
        }
      }
      onSave(created)
      onClose()
    } catch (err: any) {
      const rawMessage = typeof err?.message === "string" ? err.message : ""
      if (/character varying\(\d+\)|value too long/i.test(rawMessage)) {
        setError(
          "Sale could not be saved: product list or image is too long. Try fewer products or re-upload the image.",
        )
      } else {
        const errorDetails = err?.data?.details
        if (Array.isArray(errorDetails) && errorDetails.length > 0) {
          const detailMessage = errorDetails
            .map((detail: any) => {
              if (detail?.path && detail?.message) {
                return `${detail.path}: ${detail.message}`
              }
              if (detail?.message) return detail.message
              return typeof detail === "string" ? detail : JSON.stringify(detail)
            })
            .join(", ")
          setError(detailMessage || err.message || "Failed to create sale")
        } else {
          setError(err.message || "Failed to create sale")
        }
      }
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <Card className="bg-slate-800 border-slate-700 p-8 max-w-md w-full">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <p className="text-white">Loading products...</p>
          </div>
        </Card>
      </div>
    )
  }

  const { subtotal, taxAmount, totalAmount } = calculateTotals()

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 lg:p-8 max-w-[95%] sm:max-w-xl md:max-w-2xl w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6 sticky top-0 bg-slate-800 pb-4 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            {saleType === "b2b" ? "Create B2B Sale" : "Create B2C Sale"}
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
          {/* Customer Details */}
          {saleType === "b2b" ? (
            <div className="space-y-4 p-4 bg-slate-700/30 rounded-lg">
              <h3 className="font-semibold text-white mb-3">B2B Customer Details</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Customer Name *</label>
                  <input
                    type="text"
                    value={b2bFields.customer_name}
                    onChange={(e) => setB2bFields({ ...b2bFields, customer_name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Company Name *</label>
                  <input
                    type="text"
                    value={b2bFields.company_name}
                    onChange={(e) => setB2bFields({ ...b2bFields, company_name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">GST Number</label>
                  <input
                    type="text"
                    value={b2bFields.gst_number}
                    onChange={(e) => setB2bFields({ ...b2bFields, gst_number: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Contact Person *</label>
                  <input
                    type="text"
                    value={b2bFields.contact_person}
                    onChange={(e) => setB2bFields({ ...b2bFields, contact_person: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={b2bFields.customer_email}
                    onChange={(e) => setB2bFields({ ...b2bFields, customer_email: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Phone</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={15}
                    value={b2bFields.customer_phone}
                    onChange={(e) => handlePhoneChange(e.target.value, "b2b")}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                  {prefillLoading && saleType === "b2b" && (
                    <p className="text-xs text-blue-400 mt-1">Looking up customer details…</p>
                  )}
                  {!prefillLoading && prefillHint && saleType === "b2b" && (
                    <p className="text-xs text-amber-400 mt-1">{prefillHint}</p>
                  )}
                </div>
              </div>
              
              <AddressFields
                address={b2bFields.billing_address}
                onChange={(address: Address) => setB2bFields({ ...b2bFields, billing_address: address })}
                label="Billing Address"
                required
              />
              
          <div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={b2bFields.delivery_matches_billing}
                    onChange={(e) => {
                      setB2bFields({ 
                        ...b2bFields, 
                        delivery_matches_billing: e.target.checked,
                        delivery_address: e.target.checked ? { ...b2bFields.billing_address } : { ...emptyAddress }
                      })
                    }}
                    className="rounded"
                  />
                  Delivery address same as billing address
            </label>
              </div>
              
              {!b2bFields.delivery_matches_billing && (
                <AddressFields
                  address={b2bFields.delivery_address}
                  onChange={(address: Address) => setB2bFields({ ...b2bFields, delivery_address: address })}
                  label="Delivery Address"
                  required
                />
              )}
            </div>
          ) : (
            <div className="space-y-4 p-4 bg-slate-700/30 rounded-lg">
              <h3 className="font-semibold text-white mb-3">B2C Customer Details</h3>
              
              {/* Info Box */}
              {quotations.length > 0 && (
                <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg mb-4">
                  <p className="text-xs text-blue-300">
                    💡 <strong>Tip:</strong> Select a customer from existing quotations to auto-fill their details. You can still edit the fields manually.
                  </p>
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Select Customer from Quotation
                  </label>
                  <select
                    value={selectedQuotationId}
                    onChange={(e) => handleQuotationSelect(e.target.value)}
                    disabled={loadingQuotations}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    <option value="">
                      {loadingQuotations 
                        ? "Loading quotations..." 
                        : quotations.length === 0 
                        ? "No quotations available. Enter manually."
                        : "Select from existing quotations..."}
                    </option>
                    {quotations.map((quotation) => {
                      const customerName = `${quotation.customer.firstName || ''} ${quotation.customer.lastName || ''}`.trim() || 'Unknown Customer'
                      const mobile = quotation.customer.mobile || 'N/A'
                      const quotationId = quotation.id || 'N/A'
                      return (
                        <option key={quotation.id} value={quotation.id}>
                          {customerName} - {mobile} (QT-{quotationId.split('-').pop() || quotationId})
                        </option>
                      )
                    })}
                  </select>
                  {loadingQuotations && (
                    <p className="text-xs text-slate-400 mt-1">Loading quotations...</p>
                  )}
                  {!loadingQuotations && quotations.length === 0 && (
                    <p className="text-xs text-amber-400 mt-1">
                      No quotations found. You can enter customer details manually below.
                    </p>
                  )}
                  {quotations.length === 0 && !loadingQuotations && (
                    <p className="text-xs text-slate-500 mt-1">No quotations available. Enter customer details manually.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Customer Name *</label>
            <input
              type="text"
                    value={b2cFields.customer_name}
                    onChange={(e) => setB2cFields({ ...b2cFields, customer_name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
                    placeholder="Or enter manually"
            />
          </div>

          <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Phone *</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={15}
                    value={b2cFields.customer_phone}
                    onChange={(e) => handlePhoneChange(e.target.value, "b2c")}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
                  />
                  {prefillLoading && saleType === "b2c" && (
                    <p className="text-xs text-blue-400 mt-1">Looking up customer details…</p>
                  )}
                  {!prefillLoading && prefillHint && saleType === "b2c" && (
                    <p className="text-xs text-amber-400 mt-1">{prefillHint}</p>
                  )}
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={b2cFields.customer_email}
                    onChange={(e) => setB2cFields({ ...b2cFields, customer_email: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              
              <AddressFields
                address={b2cFields.billing_address}
                onChange={(address: Address) => setB2cFields({ ...b2cFields, billing_address: address })}
                label="Billing Address"
                required
              />
              
              <div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={b2cFields.delivery_matches_billing}
                    onChange={(e) => {
                      setB2cFields({ 
                        ...b2cFields, 
                        delivery_matches_billing: e.target.checked,
                        delivery_address: e.target.checked ? { ...b2cFields.billing_address } : { ...emptyAddress }
                      })
                    }}
                    className="rounded"
                  />
                  Delivery address same as billing address
                </label>
              </div>
              
              {!b2cFields.delivery_matches_billing && (
                <AddressFields
                  address={b2cFields.delivery_address}
                  onChange={(address: Address) => setB2cFields({ ...b2cFields, delivery_address: address })}
                  label="Delivery Address"
                  required
                />
              )}
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
                <div key={index} className="flex flex-col gap-3 p-3 bg-slate-700/30 rounded-lg">
                  {(() => {
                    const qtyUnit = item.product_id ? getProductStockUnit(item.product_id) : "Qty"
                    return (
                      <>
                  <select
                    value={item.product_id}
                    onChange={(e) => updateItem(index, "product_id", e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                    required
                  >
                    <option value="">Select Product</option>
                    {availableStock && filteredProducts.length === 0 && (
                      <option value="" disabled>No products available</option>
                    )}
                    {filteredProducts.map((product) => {
                      const availableQty = availableStock?.[product.id]
                      const stockUnit = getProductStockUnit(product.id)
                      const label = product.model && product.model !== product.name
                        ? `${product.name} - ${product.model}`
                        : product.name
                      return (
                      <option key={product.id} value={product.id}>
                          {availableStock ? `${label} (Available: ${availableQty || 0} ${stockUnit})` : label}
                      </option>
                      )
                    })}
                  </select>
                  {availableStock && filteredProducts.length === 0 && (
                    <p className="text-xs text-amber-400">
                      No stock available. Please request stock from your admin first.
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => {
                        const raw = parseDecimalInput(e.target.value)
                        const normalized = normalizeSaleQuantity(raw)
                        const maxQty = availableStock?.[item.product_id]
                        const nextQty =
                          maxQty !== undefined && Number.isFinite(maxQty)
                            ? hasSufficientStock(maxQty, normalized)
                              ? normalized
                              : normalizeSaleQuantity(maxQty)
                            : normalized
                        updateItem(index, "quantity", nextQty)
                      }}
                      placeholder={qtyUnit}
                      min="0.001"
                      step={10 ** -SALE_QUANTITY_DECIMALS}
                      max={availableStock?.[item.product_id]}
                      className="w-full px-3 sm:px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                      required
                    />
                    <input
                      type="number"
                      value={item.unit_price || ""}
                      onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                      placeholder="Price (₹)"
                      step="0.01"
                      min="0"
                      className="w-full px-3 sm:px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                      required
                    />
                    <input
                      type="number"
                      value={item.gst_rate || ""}
                      onChange={(e) => updateItem(index, "gst_rate", parseFloat(e.target.value) || 0)}
                      placeholder="GST %"
                      step="0.1"
                      min="0"
                      max="100"
                      className="w-full px-3 sm:px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 text-sm sm:text-base"
                    />
                    <Button
                      type="button"
                      onClick={() => removeItem(index)}
                      variant="outline"
                      size="sm"
                      className="w-full border-red-600 text-red-400 hover:bg-red-950"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {/* Serial number selection (agent only – select serials to mark as sold; visible to Account) */}
                  {adminId && item.product_id && (
                    <div className="mt-2 pt-2 border-t border-slate-600/50">
                      {item.quantity <= 0 ? (
                        <p className="text-xs text-slate-400">
                          Enter quantity above to select serial numbers for this sale.
                        </p>
                      ) : !isWholeSaleQuantity(normalizeSaleQuantity(item.quantity)) ? (
                        <p className="text-xs text-amber-400">
                          Serial numbers apply to whole quantities only (e.g. 2, not 2.5).
                        </p>
                      ) : loadingSerialsForProduct === item.product_id ? (
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Loading serial numbers...
                        </p>
                      ) : (() => {
                        const serials = availableSerialsPerProduct[item.product_id] ?? []
                        const selected = selectedSerialsPerItem[index] || []
                        const hasFetched = item.product_id in availableSerialsPerProduct
                        if (serials.length === 0) {
                          return (
                            <p className="text-xs text-slate-400">
                              {hasFetched
                                ? "No serial numbers found for this product. Contact your admin."
                                : "Loading..."}
                            </p>
                          )
                        }
                        const q = (serialSearchPerItem[index] ?? "").trim().toLowerCase()
                        const filteredSerials = q ? serials.filter((sn) => sn.serial_number?.toLowerCase().includes(q)) : serials
                        return (
                          <div>
                            <p className="text-xs text-slate-400 mb-2">
                              Select serial numbers to mark as sold ({selected.length} / {item.quantity} selected)
                            </p>
                            {serials.length > 0 && (
                              <div className="relative mb-2">
                                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                  type="text"
                                  placeholder="Search serial numbers..."
                                  value={serialSearchPerItem[index] ?? ""}
                                  onChange={(e) => setSerialSearchPerItem((prev) => ({ ...prev, [index]: e.target.value }))}
                                  className="w-full pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs"
                                />
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {filteredSerials.map((sn) => {
                                const isChecked = selected.includes(sn.serial_number)
                                return (
                                  <label
                                    key={sn.id || sn.serial_number}
                                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer text-sm transition ${
                                      isChecked
                                        ? "bg-cyan-900/30 border-cyan-500 text-cyan-300"
                                        : "bg-slate-700/50 border-slate-600 text-slate-300 hover:border-slate-500"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleSerialForItem(index, sn.serial_number)}
                                      className="rounded"
                                    />
                                    <span className="font-mono whitespace-nowrap">{sn.serial_number}</span>
                                  </label>
                                )
                              })}
                            </div>
                            {q && filteredSerials.length === 0 && (
                              <p className="text-xs text-slate-400 mt-2">No serial numbers match &quot;{serialSearchPerItem[index]}&quot;</p>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                      </>
                    )
                  })()}
                </div>
              ))}
              
              {items.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Click "Add Product" to add items</p>
              )}
            </div>
          </div>

          {/* Totals */}
          {items.length > 0 && (
            <div className="bg-slate-700/50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal:</span>
                <span>₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Tax (GST):</span>
                <span>₹{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-white border-t border-slate-600 pt-2">
                <span>Total:</span>
                <span className="text-emerald-400">₹{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Sale Image (Optional)</label>
            {imagePreview && (
              <div className="mb-2 relative w-full h-32 rounded-lg overflow-hidden border border-slate-600">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null)
                    setImagePreview(null)
                  }}
                  className="absolute top-2 right-2 p-1 bg-red-600 rounded-full hover:bg-red-700"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">PNG, JPG, GIF up to 5MB</p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none h-20"
              placeholder="Additional notes..."
            />
          </div>

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
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Sale"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
