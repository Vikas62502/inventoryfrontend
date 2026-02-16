"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { X, Loader2, AlertCircle, Eye, Camera, CameraOff, DollarSign, ChevronDown, ChevronUp } from "lucide-react"
import { Html5Qrcode } from "html5-qrcode"
import { productsApi, categoriesApi, serialNumbersApi, type SerialNumber } from "@/lib/api"
import type { Product } from "@/lib/api"
import { authService } from "@/lib/auth"

interface ProductModalProps {
  product?: Product | null
  onClose: () => void
  onSave: (product: Product | Omit<Product, "id">) => void
}

export default function ProductModal({ product, onClose, onSave }: ProductModalProps) {
  // Component for adding/editing products
  const [categories, setCategories] = useState<string[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [referenceData, setReferenceData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  
  // Check if user is agent (only agents can set price) or super-admin (can set selling price)
  const currentUser = authService.getUser()
  const isAgent = currentUser?.role === "agent"
  const isSuperAdmin = currentUser?.role === "super-admin"

  // Unit mapping: reference unit -> display name
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

  // Get available units based on selected product
  const getAvailableUnits = (): string[] => {
    if (!formData.name) {
      // Return all available units
      return Array.from(new Set(Object.values(unitDisplayMap)))
    }
    
    // Find the product in reference data
    const refProduct = referenceData.find((item: any) => item.name === formData.name)
    if (refProduct && refProduct.unit) {
      const unit = refProduct.unit
      const displayName = unitDisplayMap[unit] || unit
      // Return the mapped display name as primary option, plus all other units
      return [displayName, ...Object.values(unitDisplayMap).filter(u => u !== displayName)]
    }
    
    // Default: return all units
    return Array.from(new Set(Object.values(unitDisplayMap)))
  }

  const [formData, setFormData] = useState({
    name: product?.name || "",
    model: product?.model || "",
    wattage: product?.wattage || "",
    price: product?.price || product?.unit_price || 0,
    quantity: product?.quantity || product?.central_stock || 0,
    category: product?.category || "",
    unit: "",
    image: product?.image || "",
  })
  
  // For editing: track existing stock and new stock to add
  const [existingStock, setExistingStock] = useState<number>(0)
  const [stockToAdd, setStockToAdd] = useState<number>(0)
  
  // Serial numbers tracking
  const [serialNumbers, setSerialNumbers] = useState<string[]>([])
  const [serialNumberInput, setSerialNumberInput] = useState<string>("")
  const [serialNumberMethod, setSerialNumberMethod] = useState<"manual" | "barcode" | "excel">("manual")
  const [serialNumberExcelFile, setSerialNumberExcelFile] = useState<File | null>(null)
  
  // Pricing for serial numbers (cost price)
  const [individualPricing, setIndividualPricing] = useState<boolean>(false)
  // Super Admin: selling price - use max cost from stock or manual
  const [useMaxCostForSelling, setUseMaxCostForSelling] = useState<boolean>(true)
  const [sellingPriceOverride, setSellingPriceOverride] = useState<number>(0)
  const [defaultPrice, setDefaultPrice] = useState<number>(0)
  const [serialNumberPrices, setSerialNumberPrices] = useState<Record<string, number>>({})
  
  // Camera barcode scanning
  const [isScanning, setIsScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const qrCodeScannerRef = useRef<Html5Qrcode | null>(null)
  const scannerElementId = "barcode-scanner"
  const scannerElementIdEdit = "barcode-scanner-edit"
  
  // Step tracking for new product creation
  const [currentStep, setCurrentStep] = useState<1 | 2>(1)
  const [createdProductId, setCreatedProductId] = useState<string | null>(null)
  
  // Assigned serial numbers (for edit mode)
  const [assignedSerialNumbers, setAssignedSerialNumbers] = useState<SerialNumber[]>([])
  const [loadingSerialNumbers, setLoadingSerialNumbers] = useState(false)
  const [showSerialNumbersModal, setShowSerialNumbersModal] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load reference data from JSON file
        const response = await fetch('/PRODUCT_CATALOG_REFERENCE.json')
        const refData = await response.json()
        setReferenceData(refData)
        
        // Extract unique categories from reference data
        const referenceCategories: string[] = Array.from(new Set(refData.map((item: any) => item.category as string)))
          .filter((cat): cat is string => typeof cat === 'string' && cat.trim() !== '')
        
        // Try to load categories from API, fallback to reference data
        let apiCategories: string[] = []
        try {
          const cats = await categoriesApi.getAll()
          apiCategories = cats.map(c => c.label).filter((cat): cat is string => typeof cat === 'string' && cat.trim() !== '')
        } catch (apiErr) {
          console.log("API categories not available, using reference data")
        }
        
        // Combine API categories with reference categories (API takes priority)
        // Filter out any empty strings or invalid values
        const allCategories: string[] = Array.from(new Set([...apiCategories, ...referenceCategories]))
          .filter((cat): cat is string => typeof cat === 'string' && cat.trim() !== '')
        setCategories(allCategories)
        
        // Try to load products from API, fallback to reference data
        let apiProducts: Product[] = []
        try {
          const prods = await productsApi.getAll()
          apiProducts = prods.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
            return dateB - dateA // Newest first
          })
        } catch (apiErr) {
          console.log("API products not available, using reference data")
        }
        
        // Map reference data to Product format
        const referenceProducts: Product[] = refData.map((item: any) => ({
          id: item.id,
          name: item.name,
          model: item.name, // Use name as model fallback
          category: item.category,
          unit_price: item.rate || 0,
          price: item.rate || 0,
          quantity: 0,
          central_stock: 0,
        }))
        
        // Combine API products with reference products (API takes priority)
        const allProducts = [...apiProducts, ...referenceProducts.filter(rp => 
          !apiProducts.some(ap => ap.id === rp.id || ap.name === rp.name)
        )]
        setProducts(allProducts)
      } catch (err) {
        console.error("Failed to load data:", err)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    if (product?.image) {
      setImagePreview(product.image)
    }
    // If editing a product, set existing stock and try to find its unit from reference data
    if (product) {
      const currentStock = product.quantity || product.central_stock || 0
      setExistingStock(currentStock)
      setStockToAdd(0) // Reset stock to add when product changes
      setSerialNumbers([]) // Reset serial numbers
      setSerialNumberInput("") // Reset serial number input
      setSerialNumberExcelFile(null) // Reset Excel file
      setSerialNumberMethod("manual") // Reset to manual method
      setIndividualPricing(false) // Reset pricing mode
      setDefaultPrice(0) // Reset default price
      setSerialNumberPrices({}) // Reset individual prices
      setUseMaxCostForSelling(true) // Reset selling price mode
      setSellingPriceOverride((product.selling_price ?? product.unit_price ?? product.price ?? 0) || 0) // Pre-fill from product
      setCurrentStep(1) // Reset to step 1
      setCreatedProductId(null) // Reset created product ID
      
      // Fetch assigned serial numbers for this product
      if (product.id) {
        const fetchSerialNumbers = async () => {
          try {
            setLoadingSerialNumbers(true)
            const serials = await serialNumbersApi.getByProduct(product.id!)
            const fromApi = Array.isArray(serials) ? serials : []
            // Fallback: if API returns empty but product has serial_numbers (e.g. from create response), use those
            if (fromApi.length === 0 && product.serial_numbers && Array.isArray(product.serial_numbers) && product.serial_numbers.length > 0) {
              const fallback: SerialNumber[] = product.serial_numbers.map((sn, i) => ({
                id: `fallback-${i}-${sn}`,
                product_id: product.id!,
                serial_number: sn,
                created_at: new Date().toISOString(),
              }))
              setAssignedSerialNumbers(fallback)
            } else {
              setAssignedSerialNumbers(fromApi)
            }
          } catch (err) {
            console.error("Failed to fetch serial numbers:", err)
            // Fallback when API fails
            if (product.serial_numbers && Array.isArray(product.serial_numbers) && product.serial_numbers.length > 0) {
              setAssignedSerialNumbers(product.serial_numbers.map((sn, i) => ({
                id: `fallback-${i}-${sn}`,
                product_id: product.id!,
                serial_number: sn,
                created_at: new Date().toISOString(),
              })))
            } else {
              setAssignedSerialNumbers([])
            }
          } finally {
            setLoadingSerialNumbers(false)
          }
        }
        fetchSerialNumbers()
      }
    } else {
      // Reset when no product (create mode)
      setAssignedSerialNumbers([])
    }
    if (product?.name && referenceData.length > 0) {
      const refProduct = referenceData.find((item: any) => item.name === product.name)
      if (refProduct && refProduct.unit) {
        const unitDisplay = unitDisplayMap[refProduct.unit] || refProduct.unit
        setFormData(prev => ({
          ...prev,
          unit: unitDisplay,
        }))
      }
    }
  }, [product, referenceData])

  // Filter products based on selected category
  const filteredProducts = formData.category 
    ? products.filter(p => p.category === formData.category)
    : products

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => {
      const newData = {
        ...prev,
        [name]: name === "price" || name === "quantity" ? Number.parseFloat(value) || 0 : value,
      }
      // Clear product name when category changes
      if (name === "category" && value !== prev.category) {
        newData.name = ""
      }
      // Show dropdown when typing in category field
      if (name === "category") {
        setShowCategoryDropdown(true)
        setIsAddingCategory(value.trim() !== "" && !categories.includes(value.trim()))
      }
      // Show dropdown when typing in product name field
      if (name === "name") {
        setShowProductDropdown(true)
      }
      return newData
    })
  }

  const handleAddCategory = async () => {
    const categoryName = formData.category.trim()
    if (!categoryName) return

    try {
      setIsAddingCategory(true)
      await categoriesApi.create(categoryName)
      // Refresh categories list
      const updatedCats = await categoriesApi.getAll()
      const sortedCategories = [...updatedCats].sort((a: any, b: any) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
        return dateB - dateA // Newest first
      })
      setCategories(sortedCategories.map(c => c.label))
      setIsAddingCategory(false)
      setShowCategoryDropdown(false)
    } catch (err) {
      console.error("Failed to create category:", err)
      setIsAddingCategory(false)
    }
  }

  const handleSelectCategory = (category: string) => {
    setFormData(prev => ({
      ...prev,
      category,
      name: "" // Clear product name when category changes
    }))
    setShowCategoryDropdown(false)
  }

  const handleSelectProduct = (productName: string) => {
    const selectedProduct = filteredProducts.find(p => p.name === productName)
    // Find product in reference data to get unit
    const refProduct = referenceData.find((item: any) => item.name === productName)
    
    if (selectedProduct) {
      const unit = refProduct?.unit || ""
      const unitDisplay = unit ? (unitDisplayMap[unit] || unit) : ""
      
      setFormData(prev => ({
        ...prev,
        name: selectedProduct.name,
        model: selectedProduct.model || selectedProduct.name,
        wattage: selectedProduct.wattage || prev.wattage,
        unit: unitDisplay,
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        name: productName,
        unit: refProduct?.unit ? (unitDisplayMap[refProduct.unit] || refProduct.unit) : "",
      }))
    }
    setShowProductDropdown(false)
  }

  // Camera barcode scanning functions
  const isChrome = typeof navigator !== "undefined" && /Chrome/i.test(navigator.userAgent) && !/Edge|Edg|OPR/i.test(navigator.userAgent)
  
  const startCameraScanning = async (retryMode: "default" | "userFacing" | "constraintsOnly" = "default") => {
    try {
      console.log("startCameraScanning called", { retryMode, isChrome })
      setScanError(null)
      setIsScanning(true)
      
      // Detect if we're on mobile
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (window.innerWidth <= 768)
      
      console.log("Is mobile:", isMobile)
      
      // Check if we're in a secure context (HTTPS or localhost)
      const isSecureContext = window.isSecureContext || 
        window.location.protocol === "https:" || 
        window.location.hostname === "localhost" || 
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "0.0.0.0"
      
      console.log("Is secure context:", isSecureContext, "Protocol:", window.location.protocol, "Hostname:", window.location.hostname)
      
      if (!isSecureContext) {
        throw new Error("Camera requires HTTPS connection. Please use HTTPS or localhost.")
      }
      
      // Check if getUserMedia is available (with fallback for older browsers)
      const getUserMedia = navigator.mediaDevices?.getUserMedia ||
        (navigator as any).getUserMedia ||
        (navigator as any).webkitGetUserMedia ||
        (navigator as any).mozGetUserMedia
      
      console.log("getUserMedia available:", !!getUserMedia, "mediaDevices:", !!navigator.mediaDevices)
      
      if (!getUserMedia) {
        throw new Error("Camera API not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.")
      }
      
      // Use appropriate scanner element ID based on which one exists
      let scannerId = scannerElementId
      const createModeElement = document.getElementById(scannerElementId)
      const editModeElement = document.getElementById(scannerElementIdEdit)
      
      console.log("Scanner elements - Create:", !!createModeElement, "Edit:", !!editModeElement)
      
      if (!createModeElement && !editModeElement) {
        // Wait a bit and try again
        await new Promise(resolve => setTimeout(resolve, 200))
        if (!document.getElementById(scannerElementId) && !document.getElementById(scannerElementIdEdit)) {
          throw new Error("Scanner element not found. Please try again.")
        }
      }
      
      if (!createModeElement) {
        scannerId = scannerElementIdEdit
      }
      
      // Check if element exists
      const scannerElement = document.getElementById(scannerId)
      if (!scannerElement) {
        throw new Error("Scanner element not found. Please try again.")
      }
      
      console.log("Using scanner ID:", scannerId)
      
      // Wait for DOM to be ready - Chrome needs extra time to avoid auto-stop
      await new Promise(resolve => setTimeout(resolve, isMobile ? 700 : isChrome ? 600 : 300))
      await new Promise(resolve => requestAnimationFrame(resolve))
      
      const html5QrCode = new Html5Qrcode(scannerId)
      qrCodeScannerRef.current = html5QrCode
      
      // Try to get available cameras
      let cameras: any[] = []
      try {
        cameras = await Html5Qrcode.getCameras()
      } catch (camErr) {
        console.warn("Could not enumerate cameras, will use facingMode:", camErr)
      }
      
      // Determine camera configuration
      // Chrome: use "user" (front) camera by default - Chrome has known issues with "environment" (back)
      let cameraConfig: string | { facingMode: string }
      
      if (cameras.length > 0) {
        if (isChrome && retryMode !== "constraintsOnly") {
          // Chrome: use facingMode instead of deviceId (more reliable, avoids auto-stop)
          cameraConfig = { facingMode: "user" }
        } else if (retryMode === "userFacing") {
          const frontCamera = cameras.find(cam => 
            cam.label.toLowerCase().includes("front") || 
            cam.label.toLowerCase().includes("user") ||
            cam.label.toLowerCase().includes("face")
          )
          cameraConfig = frontCamera ? frontCamera.id : cameras[0].id
        } else {
          // Safari/Firefox: prefer back camera for mobile scanning
          const backCamera = cameras.find(cam => 
            cam.label.toLowerCase().includes("back") || 
            cam.label.toLowerCase().includes("rear") ||
            cam.label.toLowerCase().includes("environment")
          )
          cameraConfig = backCamera ? backCamera.id : cameras[0].id
        }
      } else {
        // Fallback to facingMode when enumeration fails
        cameraConfig = (isChrome || retryMode !== "default") ? { facingMode: "user" } : { facingMode: "environment" }
      }
      
      // constraintsOnly retry: use simplest config - facingMode only
      if (retryMode === "constraintsOnly") {
        cameraConfig = { facingMode: "user" }
      }
      
      // Calculate qrbox size based on screen size (mobile-friendly)
      const screenWidth = window.innerWidth
      const screenHeight = window.innerHeight
      const qrboxSize = isMobile 
        ? Math.min(screenWidth * 0.8, screenHeight * 0.4, 300) // 80% of width or 40% of height, max 300px
        : 250 // Desktop default
      
      // Scan config - Chrome: use simpler constraints and lower FPS for stability
      const scanConfig: any = {
        fps: isChrome ? (isMobile ? 3 : 5) : (isMobile ? 5 : 10),
        qrbox: { width: qrboxSize, height: qrboxSize },
        aspectRatio: 1.0,
        disableFlip: false,
      }
      
      await html5QrCode.start(
        cameraConfig,
        scanConfig,
        async (decodedText) => {
          // Successfully scanned - stop immediately to prevent multiple scans
          const newSerial = decodedText.trim()
          
          // Stop scanner first to prevent multiple scans
          try {
            if (qrCodeScannerRef.current) {
              await qrCodeScannerRef.current.stop()
              await qrCodeScannerRef.current.clear()
              qrCodeScannerRef.current = null
            }
            setIsScanning(false)
            setScanError(null)
          } catch (stopErr) {
            console.error("Error stopping camera after scan:", stopErr)
            setIsScanning(false)
            qrCodeScannerRef.current = null
          }
          
          // Then process the scanned serial number
          if (newSerial && !serialNumbers.includes(newSerial)) {
            setSerialNumbers([...serialNumbers, newSerial])
            setSerialNumberInput("")
          } else if (serialNumbers.includes(newSerial)) {
            setError("Serial number already added")
            setTimeout(() => setError(null), 3000)
          }
        },
        (errorMessage) => {
          // Ignore scanning errors (they're frequent during scanning)
          // Only log if it's not a common scanning error
          if (!errorMessage.includes("NotFoundException") && 
              !errorMessage.includes("No MultiFormat Readers") &&
              !errorMessage.includes("QR code parse error")) {
            console.debug("Scanning error:", errorMessage)
          }
        }
      )
    } catch (err: any) {
      console.error("Failed to start camera:", err)
      let errorMessage = "Failed to access camera."
      
      // Handle specific error types
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errorMessage = "Camera permission denied. Please allow camera access when the browser asks, or enable it in your browser settings (e.g. Chrome: site settings → Camera → Allow)."
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        errorMessage = "No camera found. Please connect a camera device."
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        // Chrome: retry with simpler config (front camera, then constraints-only)
        if (isChrome && retryMode !== "constraintsOnly") {
          const nextMode = retryMode === "default" ? "userFacing" : "constraintsOnly"
          console.log("Chrome NotReadableError - retrying with", nextMode)
          if (qrCodeScannerRef.current) {
            try { await qrCodeScannerRef.current.stop() } catch (_) {}
            try { await qrCodeScannerRef.current.clear() } catch (_) {}
            qrCodeScannerRef.current = null
          }
          setIsScanning(false)
          setTimeout(() => startCameraScanning(nextMode), 600)
          return
        }
        errorMessage = "Camera could not start. Try Safari, or close other apps using the camera."
      } else if (err.name === "OverconstrainedError") {
        errorMessage = "Camera constraints not supported. Trying with default settings..."
        // Retry with front camera (simpler constraints) - helps Chrome
        if (isChrome && retryMode === "default") {
          setTimeout(() => startCameraScanning("userFacing"), 1000)
        } else if (retryMode === "userFacing") {
          setTimeout(() => startCameraScanning("constraintsOnly"), 1000)
        } else {
          setTimeout(() => startCameraScanning(), 1000)
        }
        return
      } else if (err.message) {
        errorMessage = err.message
      } else if (err.message?.includes("HTTPS") || err.message?.includes("secure context")) {
        errorMessage = "Camera requires HTTPS connection. Please use HTTPS or localhost."
      }
      
      setScanError(errorMessage)
      setIsScanning(false)
      
      // Clean up any partial initialization
      if (qrCodeScannerRef.current) {
        try {
          await qrCodeScannerRef.current.stop()
          await qrCodeScannerRef.current.clear()
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }
        qrCodeScannerRef.current = null
      }
    }
  }

  const stopCameraScanning = async () => {
    try {
      if (qrCodeScannerRef.current) {
        try {
          await qrCodeScannerRef.current.stop()
        } catch (stopErr) {
          // Ignore stop errors (camera might already be stopped)
          console.debug("Error stopping scanner:", stopErr)
        }
        try {
          await qrCodeScannerRef.current.clear()
        } catch (clearErr) {
          // Ignore clear errors
          console.debug("Error clearing scanner:", clearErr)
        }
        qrCodeScannerRef.current = null
      }
      setIsScanning(false)
      setScanError(null)
    } catch (err) {
      console.error("Error stopping camera:", err)
      setIsScanning(false)
      // Force cleanup even if there's an error
      qrCodeScannerRef.current = null
    }
  }

  // Cleanup camera on unmount or method change
  useEffect(() => {
    return () => {
      if (qrCodeScannerRef.current) {
        stopCameraScanning()
      }
    }
  }, [])

  useEffect(() => {
    if (serialNumberMethod !== "barcode" && isScanning) {
      stopCameraScanning()
    }
  }, [serialNumberMethod])

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


  // Handle step 2: Create product with serial numbers
  const handleSerialNumbersSubmit = async () => {
    setError(null)
    setLoading(true)
    
    try {
      const quantity = formData.quantity || 0
      
      // Ensure category exists before creating product
      const categoryName = formData.category.trim()
      if (categoryName && !categories.includes(categoryName)) {
        try {
          await categoriesApi.create(categoryName)
          // Refresh categories list
          const updatedCats = await categoriesApi.getAll()
          const sortedCategories = [...updatedCats].sort((a: any, b: any) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
            return dateB - dateA // Newest first
          })
          setCategories(sortedCategories.map(c => c.label))
        } catch (catErr) {
          // Category creation might fail if backend auto-creates categories
          // or if category already exists. Continue with product creation.
          console.log("Category may already exist or will be auto-created:", catErr)
        }
      }
      
      // Prepare product data for creation
      const productData: any = {
        name: formData.name,
        model: formData.model,
        category: categoryName,
        wattage: formData.wattage || undefined,
        quantity: quantity,
        unit: formData.unit,
        image: imageFile || undefined,
      }
      
      // Include price if provided
      if (formData.price && formData.price > 0) {
        productData.unit_price = formData.price
      } else {
        productData.unit_price = 0
      }
      
      // If quantity > 0 and serial numbers are provided, validate and include them
      if (quantity > 0 && (serialNumbers.length > 0 || serialNumberExcelFile)) {
        // Validate serial numbers match quantity
        if (serialNumberExcelFile) {
          // Excel file will be processed by backend
          // No need to validate count here
        } else if (serialNumbers.length !== quantity) {
          setError(`Please enter ${quantity} serial numbers. Currently have ${serialNumbers.length}.`)
          setLoading(false)
          return
        }
        
        // Add serial numbers to product data
        // Each serial number will be associated with product name, category, and cost price
        if (serialNumbers.length > 0) {
          productData.serial_numbers = serialNumbers
          
          // Include product metadata for serial numbers association
          // Backend should use this to associate each serial number with product name and category
          productData.product_name = formData.name
          productData.product_category = categoryName
        } else if (serialNumberExcelFile) {
          // If using image/excel, backend will extract serial numbers
          // For now, show error that manual entry is required
          setError("Please enter serial numbers manually, or wait for backend to support image/Excel extraction")
          setLoading(false)
          return
        }
        
        // Add pricing data (cost price for each serial number)
        if (serialNumbers.length > 0) {
          if (individualPricing) {
            // Individual prices for each serial number
            productData.serial_number_prices = serialNumberPrices
          } else {
            // Single price for all serial numbers (cost price)
            productData.default_price = defaultPrice
          }
        }
      }
      
      // Create product with serial numbers and pricing
      const created = await productsApi.create(productData)
      
      // Ensure serial_numbers are on the created product (for View All fallback if backend doesn't return them)
      const createdWithSerials = serialNumbers.length > 0
        ? { ...created, serial_numbers: created.serial_numbers ?? serialNumbers }
        : created
      
      // Product created successfully - show in catalog
      onSave(createdWithSerials)
      onClose()
    } catch (err: any) {
      setError(err.message || "Failed to create product")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // If on step 2, handle serial numbers submission
    if (currentStep === 2 && !product?.id) {
      await handleSerialNumbersSubmit()
      return
    }
    
    setError(null)
    setLoading(true)

    try {
      const categoryName = formData.category.trim()
      // Category should already be created via Add button, but if it's new, try to create it
      if (categoryName && !categories.includes(categoryName)) {
        try {
          await categoriesApi.create(categoryName)
          // Refresh categories list
          const updatedCats = await categoriesApi.getAll()
          const sortedCategories = [...updatedCats].sort((a: any, b: any) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
            return dateB - dateA // Newest first
          })
          setCategories(sortedCategories.map(c => c.label))
        } catch (catErr) {
          // Category creation might fail if backend auto-creates categories
          // or if category already exists. Continue with product creation.
          console.log("Category may already exist or will be auto-created:", catErr)
        }
      }

      // Note: Duplicate product validation is handled by the backend
      // Frontend no longer blocks submission - backend will return appropriate error if duplicate exists
      
      // Calculate final quantity: if editing and stockToAdd > 0, add to existing; otherwise use formData.quantity
      let finalQuantity = formData.quantity || 0
      if (product?.id && stockToAdd > 0) {
        // When editing: add new stock to existing stock
        finalQuantity = existingStock + stockToAdd
        
        // Validate serial numbers if stock is being added
        if (stockToAdd > 0 && serialNumbers.length !== stockToAdd && !serialNumberExcelFile) {
          setError(`Please enter ${stockToAdd} serial numbers. Currently have ${serialNumbers.length}.`)
          setLoading(false)
          return
        }
      } else if (!product?.id) {
        // When creating new product: use the quantity from form
        finalQuantity = formData.quantity || 0
      } else {
        // When editing without adding stock: keep existing quantity
        finalQuantity = existingStock
      }

      const productData: any = {
        name: formData.name,
        model: formData.model,
        category: categoryName,
        wattage: formData.wattage || undefined,
        quantity: finalQuantity,
        image: imageFile || undefined,
      }
      
      // Add serial numbers if stock is being added (for editing existing products)
      if (product?.id && stockToAdd > 0) {
        // Backend only accepts serial_numbers as JSON string array
        // For image/excel uploads, backend should extract serial numbers server-side
        // For now, only send if we have manually entered serial numbers
        if (serialNumbers.length > 0) {
          // Include serial numbers array (will be sent as JSON string in FormData)
          productData.serial_numbers = serialNumbers
          
          // Include product metadata for serial number association
          productData.product_name = formData.name
          productData.product_category = categoryName
          
          // Add pricing data (cost price for each serial number)
          if (individualPricing) {
            // Individual prices for each serial number
            productData.serial_number_prices = serialNumberPrices
          } else {
            // Single price for all serial numbers (cost price)
            productData.default_price = defaultPrice
          }
      } else if (serialNumberExcelFile) {
        // TODO: Backend should support excel extraction
        // For now, show error that manual entry is required
        setError("Please enter serial numbers manually. Excel extraction will be supported in future updates.")
        setLoading(false)
        return
      }
        productData.stock_to_add = stockToAdd
      }
      
      // Include price if provided (for all users)
      // unit_price = cost price (same concept). selling_price = separate field set by Super Admin.
      if (isSuperAdmin && product?.id) {
        // Super Admin: set selling_price only (do NOT overwrite unit_price/cost price)
        productData.use_max_cost_price = useMaxCostForSelling
        if (sellingPriceOverride > 0) {
          // Manual override – always send when user has entered a value
          productData.selling_price = sellingPriceOverride
        }
        // When use_max_cost_price true and no manual override, backend uses max cost from serials
        // Do NOT send unit_price - it is cost price and stays unchanged
      } else if (formData.price && formData.price > 0) {
        productData.unit_price = formData.price
      } else if (product) {
        // For editing, keep existing unit_price (cost price) if product exists
        productData.unit_price = product.unit_price || product.price || 0
      } else {
        // For creating new product without price, set to 0
        productData.unit_price = 0
      }

      if (product?.id) {
        // Update existing product
        // If updating with FormData (has image or serial numbers), use FormData
        const updateData: any = { ...productData }
        if (productData.serial_numbers || imageFile) {
          // Update using FormData for file uploads or serial numbers
          const updated = await productsApi.update(product.id, updateData)
          onSave(updated)
        } else {
          // Regular update without files
        const updated = await productsApi.update(product.id, productData)
        onSave(updated)
        }
      } else {
        // Create new product - Step 1: Just validate and move to Step 2
        // Product will be created in Step 2 after serial numbers are entered
        // Always move to step 2 (even if quantity is 0)
        setCurrentStep(2)
        setLoading(false)
        // Product will be created in handleSerialNumbersSubmit
      }
    } catch (err: any) {
      setError(err.message || "Failed to save product")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
      <Card className="bg-slate-800 border-slate-700 p-4 sm:p-6 lg:p-8 max-w-[95%] sm:max-w-lg w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-white">{product ? "Edit Product" : "Add New Product"}</h2>
          <button 
            onClick={() => {
              // If on Step 2, product hasn't been created yet, so just close
              // No need to save anything
              onClose()
            }} 
            className="text-slate-400 hover:text-white transition flex-shrink-0 ml-2"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {currentStep === 2 && !product?.id ? (
          // Step 2: Serial Number Entry for New Products
          <div className="space-y-4">
            <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
              <p className="text-sm text-blue-300">
                Product details for <strong>{formData.name}</strong> are ready. 
                {formData.quantity > 0 ? (
                  <> Now add serial numbers for {formData.quantity} units.</>
                ) : (
                  <> Click Complete to create the product.</>
                )}
              </p>
            </div>
            
            {/* Serial Numbers Section */}
            <div className="p-4 bg-slate-800/50 border border-slate-600 rounded-lg">
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Serial Numbers
                <span className="text-xs text-slate-400 ml-2 font-normal">
                  ({serialNumbers.length} of {formData.quantity} entered)
                </span>
              </label>
              
              {/* Method Selection */}
              <div className="flex gap-2 mb-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSerialNumberMethod("manual")
                    setSerialNumberInput("")
                    setSerialNumberExcelFile(null)
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${
                    serialNumberMethod === "manual"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  Manual Entry
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSerialNumberMethod("barcode")
                    setSerialNumberInput("")
                    setSerialNumberExcelFile(null)
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${
                    serialNumberMethod === "barcode"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  Barcode Scanner
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSerialNumberMethod("excel")
                    setSerialNumberInput("")
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${
                    serialNumberMethod === "excel"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  Excel Upload
                </button>
              </div>
              
              {/* Manual Entry */}
              {serialNumberMethod === "manual" && (
                <div>
                  <textarea
                    value={serialNumberInput}
                    onChange={(e) => {
                      setSerialNumberInput(e.target.value)
                      // Parse serial numbers (comma or newline separated)
                      const parsed = e.target.value
                        .split(/[,\n]/)
                        .map(s => s.trim())
                        .filter(s => s.length > 0)
                      setSerialNumbers(parsed)
                    }}
                    placeholder="Enter serial numbers separated by commas or new lines
Example: SN001, SN002, SN003"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 min-h-[100px]"
                    rows={4}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Enter serial numbers separated by commas or new lines
                  </p>
                </div>
              )}
              
              {/* Barcode Scanner */}
              {serialNumberMethod === "barcode" && (
                <div className="space-y-3">
                  {/* Camera Scanner Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-slate-300">
                        Phone Camera Scanner
                      </label>
                      {!isScanning ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            console.log("Start Camera button clicked")
                            startCameraScanning().catch((err) => {
                              console.error("Error in startCameraScanning:", err)
                              setScanError(err.message || "Failed to start camera")
                              setIsScanning(false)
                            })
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-sm"
                        >
                          <Camera className="w-4 h-4" />
                          Start Camera
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={stopCameraScanning}
                          className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition text-sm"
                        >
                          <CameraOff className="w-4 h-4" />
                          Stop Camera
                        </button>
                      )}
                    </div>
                    
                    {/* Scanner element - always in DOM but hidden when not scanning */}
                    <div className="mb-3">
                      <div 
                        id={scannerElementId} 
                        className="w-full max-w-md mx-auto rounded-lg overflow-hidden border border-slate-600 bg-black"
                        style={{ 
                          minHeight: isScanning ? "250px" : "0",
                          maxHeight: "400px",
                          position: "relative",
                          display: isScanning ? "block" : "none"
                        }}
                      ></div>
                      {isScanning && (
                        <>
                          {scanError && (
                            <div className="mt-2 p-2 bg-red-900/20 border border-red-500/50 rounded text-xs text-red-400">
                              <p className="font-medium">Camera Error:</p>
                              <p>{scanError}</p>
                              <p className="mt-1 text-red-300 text-[10px] whitespace-pre-line">
                                {(scanError.includes("permission") || scanError.includes("denied")) && "• Click Allow when the browser asks for camera access\n• Or go to browser settings → Site settings → Camera → Allow"}
                                {scanError.includes("HTTPS") && "• Please access this page via HTTPS or localhost"}
                                {(scanError.includes("in use") || scanError.includes("could not start")) && "• Close other apps using the camera\n• Try Safari if Chrome doesn't work\n• Refresh the page and try again"}
                              </p>
                            </div>
                          )}
                          {!scanError && (
                            <div className="mt-2 text-center">
                              <p className="text-xs text-slate-400">
                                Point your camera at the barcode to scan
                              </p>
                              <p className="text-[10px] text-slate-500 mt-1">
                                Make sure the barcode is well-lit and in focus
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Manual Input Section */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Or Type/Scan with External Scanner
                    </label>
                    <input
                      type="text"
                      value={serialNumberInput}
                      onChange={(e) => setSerialNumberInput(e.target.value)}
                      onKeyDown={(e) => {
                        // When Enter is pressed, add the serial number
                        if (e.key === "Enter" && serialNumberInput.trim()) {
                          e.preventDefault()
                          const newSerial = serialNumberInput.trim()
                          if (!serialNumbers.includes(newSerial)) {
                            setSerialNumbers([...serialNumbers, newSerial])
                            setSerialNumberInput("")
                          } else {
                            setError("Serial number already added")
                            setTimeout(() => setError(null), 3000)
                          }
                        }
                      }}
                      placeholder="Type serial number or scan with external scanner and press Enter"
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Type serial number or scan with external barcode scanner and press Enter to add
                    </p>
                  </div>

                  {/* Scanned Serial Numbers Display - with price beside each when checkbox checked */}
                  {serialNumbers.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-slate-400 mb-2">
                        Scanned: {serialNumbers.length} of {formData.quantity || stockToAdd || 0}
                      </p>
                      <div className="space-y-2">
                        {serialNumbers.map((sn, idx) => (
                          <div
                            key={`${sn}-${idx}`}
                            className="flex items-center gap-2 flex-wrap"
                          >
                            <span className="px-2 py-1.5 bg-blue-600/20 text-blue-300 text-xs rounded border border-blue-500/50 flex items-center gap-1 shrink-0">
                              {sn}
                              <button
                                type="button"
                                onClick={() => {
                                  setSerialNumbers(serialNumbers.filter((_, i) => i !== idx))
                                  const nextPrices = { ...serialNumberPrices }
                                  delete nextPrices[sn]
                                  setSerialNumberPrices(nextPrices)
                                }}
                                className="text-blue-400 hover:text-blue-300"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                            {individualPricing && (
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-slate-400">Price (₹):</span>
                                <input
                                  type="text"
                                  value={serialNumberPrices[sn] !== undefined && serialNumberPrices[sn] !== null ? serialNumberPrices[sn] : ""}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/[^\d.]/g, "")
                                    const numValue = value ? parseFloat(value) || 0 : 0
                                    setSerialNumberPrices({ ...serialNumberPrices, [sn]: numValue })
                                  }}
                                  placeholder="Cost price"
                                  className="w-24 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Excel Upload */}
              {serialNumberMethod === "excel" && (
                <div>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
                          setError("Please select an Excel or CSV file")
                          return
                        }
                        if (file.size > 10 * 1024 * 1024) {
                          setError("File size must be less than 10MB")
                          return
                        }
                        setSerialNumberExcelFile(file)
                        setError(null)
                      }
                    }}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Upload an Excel file (.xlsx, .xls) or CSV file with serial numbers in the first column.
                  </p>
                  {serialNumberExcelFile && (
                    <div className="mt-2 p-2 bg-emerald-900/20 border border-emerald-500/50 rounded text-xs text-emerald-300">
                      ✓ File selected: {serialNumberExcelFile.name}
                    </div>
                  )}
                </div>
              )}
              
              {/* Validation Message */}
              {serialNumberMethod !== "excel" && serialNumbers.length > 0 && serialNumbers.length !== formData.quantity && (
                <div className="mt-2 p-2 bg-amber-900/20 border border-amber-500/50 rounded text-xs text-amber-300">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  Please enter {formData.quantity} serial numbers. Currently have {serialNumbers.length}.
                </div>
              )}
              
              {serialNumberMethod !== "excel" && serialNumbers.length === formData.quantity && formData.quantity > 0 && (
                <div className="mt-2 p-2 bg-emerald-900/20 border border-emerald-500/50 rounded text-xs text-emerald-300">
                  ✓ All {formData.quantity} serial numbers entered
                </div>
              )}
            </div>
            
            {/* Cost Price Section - Show when quantity > 0 (checkbox visible from start) */}
            {formData.quantity > 0 && (
              <div className="p-4 bg-slate-800/50 border border-slate-600 rounded-lg space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-500" />
                    <label className="text-sm font-medium text-slate-300">
                      Cost Price
                    </label>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 mb-4">
                  <Checkbox
                    id="individualPricing"
                    checked={individualPricing}
                    onCheckedChange={(checked) => {
                      const isChecked = !!checked
                      setIndividualPricing(isChecked)
                      if (!isChecked) {
                        setSerialNumberPrices({})
                      } else {
                        if (defaultPrice > 0 && serialNumbers.length > 0) {
                          const initialPrices: Record<string, number> = {}
                          serialNumbers.forEach(sn => {
                            initialPrices[sn] = defaultPrice
                          })
                          setSerialNumberPrices(initialPrices)
                        }
                      }
                    }}
                    className="border-2 border-slate-400 bg-slate-700 shrink-0 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                  <label htmlFor="individualPricing" className="text-sm font-medium text-slate-300 cursor-pointer select-none">
                    Set individual cost price per serial number (unchecked = same cost price for all)
                  </label>
                </div>
                
                {!individualPricing ? (
                  // Same cost price for all serial numbers (default)
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Cost Price (₹) – same for all {formData.quantity} items *
                    </label>
                    <input
                      type="text"
                      value={defaultPrice || ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d.]/g, "")
                        setDefaultPrice(value ? parseFloat(value) || 0 : 0)
                      }}
                      placeholder="Enter cost price for all items"
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      ✓ Same cost price for all {formData.quantity} items
                    </p>
                  </div>
                ) : (
                  // Individual cost price per serial number
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Cost Price (₹) per serial number *
                    </label>
                    {serialNumbers.length > 0 ? (
                      <>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                          {serialNumbers.map((sn, idx) => (
                            <div key={`${sn}-${idx}`} className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-400 mb-1 truncate font-mono">{sn}</p>
                                <input
                                  type="text"
                                  value={serialNumberPrices[sn] !== undefined && serialNumberPrices[sn] !== null ? serialNumberPrices[sn] : ""}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/[^\d.]/g, "")
                                    const numValue = value ? parseFloat(value) || 0 : 0
                                    setSerialNumberPrices({
                                      ...serialNumberPrices,
                                      [sn]: numValue
                                    })
                                  }}
                                  placeholder="Enter cost price"
                                  className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400">
                          ✓ Enter cost price for each of the {serialNumbers.length} serial numbers
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-amber-400/90">
                        Enter serial numbers above first, then set individual cost prices here.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-700">
              <Button
                type="button"
                onClick={() => setCurrentStep(1)}
                variant="outline"
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  // Always call handleSerialNumbersSubmit - it handles both cases
                  // (with or without serial numbers) and will show product in catalog
                  await handleSerialNumbersSubmit()
                }}
                disabled={
                  loading || 
                  (formData.quantity > 0 && serialNumberMethod !== "excel" && serialNumbers.length > 0 && serialNumbers.length !== formData.quantity) ||
                  (formData.quantity > 0 && serialNumbers.length > 0 && !individualPricing && defaultPrice <= 0) ||
                  (formData.quantity > 0 && serialNumbers.length > 0 && individualPricing && serialNumbers.some(sn => !serialNumberPrices[sn] || serialNumberPrices[sn] <= 0))
                }
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Complete"
                )}
              </Button>
            </div>
          </div>
        ) : (
          // Step 1: Product Details Form
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Category * 
              <span className="text-xs text-slate-400 ml-2 font-normal">(Type to search or create new)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                name="category"
                value={formData.category}
                onChange={handleChange}
                onFocus={() => setShowCategoryDropdown(true)}
                onBlur={() => {
                  // Delay to allow button click
                  setTimeout(() => setShowCategoryDropdown(false), 200)
                }}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="e.g., Solar Panels, Inverters, Cables - DC, Meters"
                autoComplete="off"
                required
              />
              {showCategoryDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {categories.length > 0 ? (
                    <>
                      {categories
                        .filter(cat => 
                          cat && cat.trim() !== '' &&
                          (!formData.category || 
                          cat.toLowerCase().includes(formData.category.toLowerCase()))
                        )
                        .map((cat, idx) => (
                          <button
                            key={`${cat}-${idx}`}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              handleSelectCategory(cat)
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700 transition-colors"
                          >
                            {cat}
                          </button>
                        ))}
                    </>
                  ) : (
                    <div className="px-4 py-2 text-sm text-slate-400">
                      Loading categories...
                    </div>
                  )}
                  {formData.category && 
                   !categories.includes(formData.category) && 
                   formData.category.trim() !== "" && (
                    <div className="border-t border-slate-600">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleAddCategory()
                        }}
                        disabled={isAddingCategory}
                        className="w-full text-left px-4 py-2 text-sm text-blue-400 hover:bg-slate-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        {isAddingCategory ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <span className="text-lg">+</span>
                            Add "{formData.category}"
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  {categories.length === 0 && !formData.category && (
                    <div className="px-4 py-2 text-sm text-slate-400">
                      No categories found. Type a category name and click "Add" to create one.
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {formData.category && !categories.includes(formData.category) 
                ? "💡 Click the 'Add' button in the dropdown to create this category"
                : "Select from existing categories or type a new category name and click 'Add'"}
            </p>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Product Name * 
              <span className="text-xs text-slate-400 ml-2 font-normal">(Type to search or create new)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onFocus={() => formData.category && setShowProductDropdown(true)}
                onBlur={() => {
                  // Delay to allow button click
                  setTimeout(() => setShowProductDropdown(false), 200)
                }}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder={formData.category ? `e.g., Products from ${formData.category}` : "e.g., ADANI SOLAR PANEL 545 WATT(DCR)"}
                autoComplete="off"
                required
                disabled={!formData.category}
              />
              {showProductDropdown && formData.category && (
                <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {filteredProducts.length > 0 ? (
                    <>
                      {filteredProducts
                        .filter(prod => 
                          prod.name && prod.name.trim() !== '' &&
                          (!formData.name || 
                          prod.name.toLowerCase().includes(formData.name.toLowerCase()))
                        )
                        .map((prod) => (
                          <button
                            key={prod.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              handleSelectProduct(prod.name)
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700 transition-colors"
                          >
                            {prod.name}
                          </button>
                        ))}
                      {formData.name && 
                       !filteredProducts.some(p => p.name === formData.name) && 
                       formData.name.trim() !== "" && (
                        <div className="border-t border-slate-600">
                          <div className="px-4 py-2 text-xs text-slate-400">
                            💡 This is a new product. Fill in the details below and click "Create Product".
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-4 py-2 text-sm text-slate-400">
                      {formData.category && !categories.includes(formData.category)
                        ? "This is a new category. Type a product name to create it."
                        : "No products found in this category. Type a product name to create a new one."}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {!formData.category 
                ? "⚠️ Please select a category first"
                : filteredProducts.length === 0 
                  ? formData.category && !categories.includes(formData.category)
                    ? "💡 This is a new category - you can type a new product name"
                    : "No products found in this category"
                  : formData.name && !filteredProducts.some(p => p.name === formData.name) 
                    ? "💡 This is a new product name - fill in details and create"
                    : `Select from ${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''} in "${formData.category}" or type a new product name`}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Model *</label>
            <input
              type="text"
              name="model"
              value={formData.model}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Wattage</label>
            <input
              type="text"
              name="wattage"
              value={formData.wattage}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              placeholder="e.g., 400W"
            />
          </div>

          {product?.id ? (
            // Edit mode: Show existing stock (read-only) and "Add Stock" field
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Current Stock</label>
                  <input
                    type="text"
                    value={existingStock}
                    disabled
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-400 cursor-not-allowed"
                    readOnly
                  />
                  <p className="text-xs text-slate-400 mt-1">Existing stock (cannot be changed)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Unit *</label>
                  <select
                    name="unit"
                    value={formData.unit}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  >
                    <option value="">Select Unit</option>
                    {getAvailableUnits().map((unit, idx) => (
                      <option key={`${unit}-${idx}`} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Assigned Serial Numbers Section - Always show in edit mode */}
              <div className="p-3 bg-slate-800/50 border border-slate-600 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Assigned Serial Numbers
                    </label>
                    <p className="text-xs text-slate-400">
                      {loadingSerialNumbers ? (
                        "Loading..."
                      ) : assignedSerialNumbers.length > 0 ? (
                        `${assignedSerialNumbers.length} serial number${assignedSerialNumbers.length !== 1 ? 's' : ''} assigned`
                      ) : (
                        "No serial numbers assigned"
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSerialNumbersModal(true)}
                    disabled={loadingSerialNumbers}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title="View all serial numbers"
                  >
                    <Eye className="w-4 h-4" />
                    View All
                  </button>
                </div>
              </div>
              
              {/* Super Admin: Selling Price – separate field, applies to whole product (by name) */}
              {isSuperAdmin && product?.id && (
                <div className="p-4 bg-emerald-900/20 border border-emerald-600/50 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-500" />
                    <label className="text-sm font-medium text-slate-300">Selling Price (₹)</label>
                  </div>
                  <p className="text-xs text-slate-400">
                    Applies to product: <span className="text-white font-medium">{product?.name}</span>
                  </p>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="useMaxCostForSelling"
                      checked={useMaxCostForSelling}
                      onCheckedChange={(checked) => setUseMaxCostForSelling(!!checked)}
                      className="border-2 border-slate-400 bg-slate-700 shrink-0 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                    />
                    <label htmlFor="useMaxCostForSelling" className="text-sm font-medium text-slate-300 cursor-pointer select-none">
                      Use max cost from registered stock (default)
                    </label>
                  </div>
                  {useMaxCostForSelling && Array.isArray(assignedSerialNumbers) && assignedSerialNumbers.length > 0 && (() => {
                    const maxCost = Math.max(...assignedSerialNumbers.map(s => (s.cost_price ?? 0) || 0), 0)
                    return maxCost > 0 ? (
                      <p className="text-sm text-emerald-400">Computed: ₹{maxCost.toLocaleString()} (max cost from {assignedSerialNumbers.length} serial number{assignedSerialNumbers.length !== 1 ? 's' : ''})</p>
                    ) : null
                  })()}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Selling Price (₹) – set for this product</label>
                    <input
                      type="text"
                      value={sellingPriceOverride || ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d.]/g, "")
                        setSellingPriceOverride(value ? parseFloat(value) || 0 : 0)
                      }}
                      placeholder={useMaxCostForSelling ? "Override with manual price (or leave for max cost)" : "Enter selling price"}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">Separate from cost price. Used for quotations and sales.</p>
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Add Stock
                  <span className="text-xs text-slate-400 ml-2 font-normal">(New stock to add to existing)</span>
                </label>
                <input
                  type="text"
                  value={stockToAdd || ""}
                  onChange={(e) => {
                    const value = e.target.value
                    // Allow empty, numbers, and decimal points
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      const newStockToAdd = value === "" ? 0 : Number.parseFloat(value) || 0
                      setStockToAdd(newStockToAdd)
                      // Reset serial numbers if quantity changes
                      if (newStockToAdd !== stockToAdd) {
                        setSerialNumbers([])
                        setSerialNumberInput("")
                        setSerialNumberExcelFile(null)
                        setIndividualPricing(false)
                        setDefaultPrice(0)
                        setSerialNumberPrices({})
                        if (isScanning) {
                          stopCameraScanning()
                        }
                      }
                    }
                  }}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="Enter quantity to add"
                />
                {stockToAdd > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">
                    New total will be: {existingStock + stockToAdd} {formData.unit || ""}
                  </p>
                )}
              </div>
              
              {/* Serial Numbers Section - Only show when adding stock */}
              {stockToAdd > 0 && (
                <div className="mt-4 p-4 bg-slate-800/50 border border-slate-600 rounded-lg">
                  <label className="block text-sm font-medium text-slate-300 mb-3">
                    Serial Numbers
                    <span className="text-xs text-slate-400 ml-2 font-normal">
                      ({serialNumbers.length} of {stockToAdd} entered)
                    </span>
                  </label>
                  
                  {/* Method Selection */}
                  <div className="flex gap-2 mb-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setSerialNumberMethod("manual")
                        setSerialNumberInput("")
                        setSerialNumberExcelFile(null)
                      }}
                      className={`px-3 py-1.5 text-xs rounded-lg transition ${
                        serialNumberMethod === "manual"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      }`}
                    >
                      Manual Entry
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSerialNumberMethod("barcode")
                        setSerialNumberInput("")
                        setSerialNumberExcelFile(null)
                      }}
                      className={`px-3 py-1.5 text-xs rounded-lg transition ${
                        serialNumberMethod === "barcode"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      }`}
                    >
                      Barcode Scanner
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSerialNumberMethod("excel")
                        setSerialNumberInput("")
                      }}
                      className={`px-3 py-1.5 text-xs rounded-lg transition ${
                        serialNumberMethod === "excel"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                      }`}
                    >
                      Excel Upload
                    </button>
                  </div>
                  
                  {/* Manual Entry */}
                  {serialNumberMethod === "manual" && (
                    <div>
                      <textarea
                        value={serialNumberInput}
                        onChange={(e) => {
                          setSerialNumberInput(e.target.value)
                          // Parse serial numbers (comma or newline separated)
                          const parsed = e.target.value
                            .split(/[,\n]/)
                            .map(s => s.trim())
                            .filter(s => s.length > 0)
                          setSerialNumbers(parsed)
                        }}
                        placeholder="Enter serial numbers separated by commas or new lines
Example: SN001, SN002, SN003"
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 min-h-[100px]"
                        rows={4}
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Enter serial numbers separated by commas or new lines
                      </p>
                    </div>
                  )}
                  
                  {/* Barcode Scanner */}
                  {serialNumberMethod === "barcode" && (
                    <div className="space-y-3">
                      {/* Camera Scanner Section */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-slate-300">
                            Phone Camera Scanner
                          </label>
                          {!isScanning ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                console.log("Start Camera button clicked (edit mode)")
                                startCameraScanning().catch((err) => {
                                  console.error("Error in startCameraScanning:", err)
                                  setScanError(err.message || "Failed to start camera")
                                  setIsScanning(false)
                                })
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-sm"
                            >
                              <Camera className="w-4 h-4" />
                              Start Camera
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={stopCameraScanning}
                              className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition text-sm"
                            >
                              <CameraOff className="w-4 h-4" />
                              Stop Camera
                            </button>
                          )}
                        </div>
                        
                        {/* Scanner element - always in DOM but hidden when not scanning */}
                        <div className="mb-3">
                          <div 
                            id={scannerElementIdEdit} 
                            className="w-full max-w-md mx-auto rounded-lg overflow-hidden border border-slate-600 bg-black"
                            style={{ 
                              minHeight: isScanning ? "250px" : "0",
                              maxHeight: "400px",
                              position: "relative",
                              display: isScanning ? "block" : "none"
                            }}
                          ></div>
                          {isScanning && (
                            <>
                              {scanError && (
                                <div className="mt-2 p-2 bg-red-900/20 border border-red-500/50 rounded text-xs text-red-400">
                                  <p className="font-medium">Camera Error:</p>
                                  <p>{scanError}</p>
                                  <p className="mt-1 text-red-300 text-[10px] whitespace-pre-line">
                                    {(scanError.includes("permission") || scanError.includes("denied")) && "• Click Allow when the browser asks for camera access\n• Or go to browser settings → Site settings → Camera → Allow"}
                                    {scanError.includes("HTTPS") && "• Please access this page via HTTPS or localhost"}
                                    {(scanError.includes("in use") || scanError.includes("could not start")) && "• Close other apps using the camera\n• Try Safari if Chrome doesn't work\n• Refresh the page and try again"}
                                  </p>
                                </div>
                              )}
                              {!scanError && (
                                <div className="mt-2 text-center">
                                  <p className="text-xs text-slate-400">
                                    Point your camera at the barcode to scan
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-1">
                                    Make sure the barcode is well-lit and in focus
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Manual Input Section */}
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Or Type/Scan with External Scanner
                        </label>
                        <input
                          type="text"
                          value={serialNumberInput}
                          onChange={(e) => setSerialNumberInput(e.target.value)}
                          onKeyDown={(e) => {
                            // When Enter is pressed, add the serial number
                            if (e.key === "Enter" && serialNumberInput.trim()) {
                              e.preventDefault()
                              const newSerial = serialNumberInput.trim()
                              if (!serialNumbers.includes(newSerial)) {
                                setSerialNumbers([...serialNumbers, newSerial])
                                setSerialNumberInput("")
                              } else {
                                setError("Serial number already added")
                                setTimeout(() => setError(null), 3000)
                              }
                            }
                          }}
                          placeholder="Type serial number or scan with external scanner and press Enter"
                          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                          Type serial number or scan with external barcode scanner and press Enter to add
                        </p>
                      </div>

                      {/* Scanned Serial Numbers Display - with price beside each when checkbox checked */}
                      {serialNumbers.length > 0 && (
                        <div className="mt-2 space-y-2">
                          <p className="text-xs text-slate-400 mb-2">
                            Scanned: {serialNumbers.length} of {stockToAdd || 0}
                          </p>
                          <div className="space-y-2">
                            {serialNumbers.map((sn, idx) => (
                              <div
                                key={`${sn}-${idx}`}
                                className="flex items-center gap-2 flex-wrap"
                              >
                                <span className="px-2 py-1.5 bg-blue-600/20 text-blue-300 text-xs rounded border border-blue-500/50 flex items-center gap-1 shrink-0">
                                  {sn}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSerialNumbers(serialNumbers.filter((_, i) => i !== idx))
                                      const nextPrices = { ...serialNumberPrices }
                                      delete nextPrices[sn]
                                      setSerialNumberPrices(nextPrices)
                                    }}
                                    className="text-blue-400 hover:text-blue-300"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                                {individualPricing && (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs text-slate-400">Price (₹):</span>
                                    <input
                                      type="text"
                                      value={serialNumberPrices[sn] !== undefined && serialNumberPrices[sn] !== null ? serialNumberPrices[sn] : ""}
                                      onChange={(e) => {
                                        const value = e.target.value.replace(/[^\d.]/g, "")
                                        const numValue = value ? parseFloat(value) || 0 : 0
                                        setSerialNumberPrices({ ...serialNumberPrices, [sn]: numValue })
                                      }}
                                      placeholder="Cost price"
                                      className="w-24 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Excel Upload */}
                  {serialNumberMethod === "excel" && (
                    <div>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
                              setError("Please select an Excel or CSV file")
                              return
                            }
                            if (file.size > 10 * 1024 * 1024) {
                              setError("File size must be less than 10MB")
                              return
                            }
                            setSerialNumberExcelFile(file)
                            setError(null)
                          }
                        }}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Upload an Excel file (.xlsx, .xls) or CSV file with serial numbers in the first column.
                      </p>
                      {serialNumberExcelFile && (
                        <div className="mt-2 p-2 bg-emerald-900/20 border border-emerald-500/50 rounded text-xs text-emerald-300">
                          ✓ File selected: {serialNumberExcelFile.name}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Validation Message */}
                  {serialNumberMethod !== "excel" && serialNumbers.length > 0 && serialNumbers.length !== stockToAdd && (
                    <div className="mt-2 p-2 bg-amber-900/20 border border-amber-500/50 rounded text-xs text-amber-300">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      Please enter {stockToAdd} serial numbers. Currently have {serialNumbers.length}.
                    </div>
                  )}
                  
                  {serialNumberMethod !== "excel" && serialNumbers.length === stockToAdd && stockToAdd > 0 && (
                    <div className="mt-2 p-2 bg-emerald-900/20 border border-emerald-500/50 rounded text-xs text-emerald-300">
                      ✓ All {stockToAdd} serial numbers entered
                    </div>
                  )}
                </div>
              )}
              
              {/* Cost Price Section for Edit Mode - Always show (same as Add Product) */}
              <div className="mt-4 p-4 bg-slate-800/50 border border-slate-600 rounded-lg space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-500" />
                    <label className="text-sm font-medium text-slate-300">
                      Cost Price
                    </label>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 mb-4">
                  <Checkbox
                    id="individualPricingEdit"
                    checked={individualPricing}
                    onCheckedChange={(checked) => {
                      const isChecked = !!checked
                      setIndividualPricing(isChecked)
                      if (!isChecked) {
                        setSerialNumberPrices({})
                      } else {
                        if (defaultPrice > 0 && serialNumbers.length > 0) {
                          const initialPrices: Record<string, number> = {}
                          serialNumbers.forEach(sn => {
                            initialPrices[sn] = defaultPrice
                          })
                          setSerialNumberPrices(initialPrices)
                        }
                      }
                    }}
                    className="border-2 border-slate-400 bg-slate-700 shrink-0 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                  <label htmlFor="individualPricingEdit" className="text-sm font-medium text-slate-300 cursor-pointer select-none">
                    Set individual cost price per serial number (unchecked = same cost price for all)
                  </label>
                </div>
                
                {stockToAdd > 0 ? (
                  !individualPricing ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Cost Price (₹) – same for all {stockToAdd} items *
                      </label>
                      <input
                        type="text"
                        value={defaultPrice || ""}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d.]/g, "")
                          setDefaultPrice(value ? parseFloat(value) || 0 : 0)
                        }}
                        placeholder="Enter cost price for all items"
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        ✓ Same cost price for all {stockToAdd} items
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Cost Price (₹) per serial number *
                      </label>
                      {serialNumbers.length > 0 ? (
                        <>
                          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                            {serialNumbers.map((sn, idx) => (
                              <div key={`${sn}-${idx}`} className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-slate-400 mb-1 truncate font-mono">{sn}</p>
                                  <input
                                    type="text"
                                    value={serialNumberPrices[sn] !== undefined && serialNumberPrices[sn] !== null ? serialNumberPrices[sn] : ""}
                                    onChange={(e) => {
                                      const value = e.target.value.replace(/[^\d.]/g, "")
                                      const numValue = value ? parseFloat(value) || 0 : 0
                                      setSerialNumberPrices({
                                        ...serialNumberPrices,
                                        [sn]: numValue
                                      })
                                    }}
                                    placeholder="Enter cost price"
                                    className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-slate-400">
                            ✓ Enter cost price for each of the {serialNumbers.length} serial numbers
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-amber-400/90">
                          Enter serial numbers above first, then set individual cost prices here.
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  <p className="text-sm text-slate-400">
                    Enter quantity to add above to set cost price.
                  </p>
                )}
              </div>
            </>
          ) : (
            // Create mode: Show regular quantity and unit fields
            <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Quantity *</label>
            <input
                  type="text"
              name="quantity"
                  value={formData.quantity || ""}
                  onChange={(e) => {
                    const value = e.target.value
                    // Allow empty, numbers, and decimal points
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      setFormData(prev => ({
                        ...prev,
                        quantity: value === "" ? 0 : Number.parseFloat(value) || 0,
                      }))
                    }
                  }}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="Enter quantity"
              required
            />
          </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Unit *</label>
                <select
                  name="unit"
                  value={formData.unit}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  required
                >
                  <option value="">Select Unit</option>
                  {getAvailableUnits().map((unit, idx) => (
                    <option key={`${unit}-${idx}`} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}


          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Unit Price (₹)</label>
            <input
              type="text"
              name="price"
              value={formData.price || ""}
              onChange={(e) => {
                const value = e.target.value.replace(/[^\d.]/g, "")
                setFormData(prev => ({
                  ...prev,
                  price: value ? parseFloat(value) || 0 : 0
                }))
              }}
              placeholder="Enter price (optional)"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              {isAgent ? "Required for agents" : isSuperAdmin && product?.id ? "Cost price – separate from Selling Price above" : "Optional - can be set later or when adding serial numbers"}
            </p>
          </div>

          {/* Cost Price Section - Step 1: Always show in Add New Product */}
          {!product?.id && (
            <div className="p-4 bg-slate-800/50 border border-slate-600 rounded-lg space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-green-500" />
                <label className="text-sm font-medium text-slate-300">Cost Price</label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="individualCostPricingStep1"
                  checked={individualPricing}
                  onCheckedChange={(checked) => {
                    const isChecked = !!checked
                    setIndividualPricing(isChecked)
                    if (!isChecked) setSerialNumberPrices({})
                    else if (defaultPrice > 0 && serialNumbers.length > 0) {
                      const initialPrices: Record<string, number> = {}
                      serialNumbers.forEach(sn => { initialPrices[sn] = defaultPrice })
                      setSerialNumberPrices(initialPrices)
                    }
                  }}
                  className="border-2 border-slate-400 bg-slate-700 shrink-0 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <label htmlFor="individualCostPricingStep1" className="text-sm font-medium text-slate-300 cursor-pointer select-none">
                  Set individual cost price per serial number (unchecked = same cost price for all)
                </label>
              </div>
              {formData.quantity > 0 ? (
                !individualPricing ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Cost Price (₹) – same for all {formData.quantity} items *
                    </label>
                    <input
                      type="text"
                      value={defaultPrice || ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d.]/g, "")
                        setDefaultPrice(value ? parseFloat(value) || 0 : 0)
                      }}
                      placeholder="Enter cost price for all items"
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      ✓ Same cost price for all {formData.quantity} items
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-amber-400/90">
                    You'll set individual cost prices in the next step when you add serial numbers.
                  </p>
                )
              ) : (
                <p className="text-sm text-slate-400">
                  Enter quantity above to set cost price.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Product Image</label>
            {imagePreview && (
              <div className="mb-2">
                <img
                  src={imagePreview}
                  alt="Product preview"
                  className="w-32 h-32 object-cover rounded-lg border border-slate-600"
                />
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-700">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                product ? "Update Product" : "Create Product"
              )}
            </Button>
          </div>
        </form>
        )}
      </Card>
      
      {/* Serial Numbers View Modal */}
      {showSerialNumbersModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="bg-slate-800 border-slate-700 p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                Assigned Serial Numbers ({assignedSerialNumbers.length})
              </h2>
              <button
                onClick={() => setShowSerialNumbersModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Product details - category, name, current stock */}
            {product?.id && (
              <div className="mb-4 p-4 bg-slate-700/50 border border-slate-600 rounded-lg space-y-2">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <div>
                    <span className="text-xs text-slate-400">Product Name:</span>
                    <p className="text-sm font-medium text-white">{formData.name || product?.name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Category:</span>
                    <p className="text-sm font-medium text-white">{formData.category || product?.category}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Current Stock:</span>
                    <p className="text-sm font-medium text-white">{existingStock}</p>
                  </div>
                </div>
              </div>
            )}
            
            {loadingSerialNumbers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <span className="ml-2 text-slate-300">Loading serial numbers...</span>
              </div>
            ) : !Array.isArray(assignedSerialNumbers) || assignedSerialNumbers.length === 0 ? (
              <div className="text-center py-8 text-slate-400 space-y-2">
                <p>No serial numbers assigned to this product.</p>
                <p className="text-xs max-w-sm mx-auto">
                  Serial numbers are stored when you add stock with serial numbers. Products added without serial numbers will show none here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {assignedSerialNumbers.map((sn) => (
                    <div
                      key={sn.id}
                      className="p-3 bg-slate-700/50 border border-slate-600 rounded-lg"
                    >
                      <p className="text-sm text-white font-mono">{sn.serial_number}</p>
                      {sn.cost_price != null && sn.cost_price > 0 && (
                        <p className="text-xs text-green-400 mt-1">
                          Cost: ₹{Number(sn.cost_price).toLocaleString()}
                        </p>
                      )}
                      {sn.created_at && (
                        <p className="text-xs text-slate-400 mt-1">
                          Added: {new Date(sn.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="mt-6 pt-4 border-t border-slate-700">
              <Button
                onClick={() => setShowSerialNumbersModal(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}