"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Loader2, AlertCircle } from "lucide-react"
import { productsApi, categoriesApi } from "@/lib/api"
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  
  // Check if user is agent (only agents can set price)
  const currentUser = authService.getUser()
  const isAgent = currentUser?.role === "agent"

  const [formData, setFormData] = useState({
    name: product?.name || "",
    model: product?.model || "",
    wattage: product?.wattage || "",
    price: product?.price || product?.unit_price || 0,
    quantity: product?.quantity || product?.central_stock || 0,
    category: product?.category || "",
    image: product?.image || "",
  })

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load reference data from JSON file
        const response = await fetch('/PRODUCT_CATALOG_REFERENCE.json')
        const referenceData = await response.json()
        
        // Extract unique categories from reference data
        const referenceCategories: string[] = Array.from(new Set(referenceData.map((item: any) => item.category as string)))
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
        const referenceProducts: Product[] = referenceData.map((item: any) => ({
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
  }, [product])

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
    if (selectedProduct) {
      setFormData(prev => ({
        ...prev,
        name: selectedProduct.name,
        model: selectedProduct.model || selectedProduct.name,
        wattage: selectedProduct.wattage || prev.wattage,
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        name: productName
      }))
    }
    setShowProductDropdown(false)
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

      const productData: any = {
        name: formData.name,
        model: formData.model,
        category: categoryName,
        wattage: formData.wattage || undefined,
        quantity: formData.quantity || 0,
        image: imageFile || undefined,
      }
      
      // Only include price if user is agent
      if (isAgent) {
        productData.unit_price = formData.price || 0
      } else if (product) {
        // For super-admin/admin editing, keep existing price if product exists
        productData.unit_price = product.unit_price || product.price || 0
      } else {
        // For super-admin/admin creating new product, set default price to 0
        productData.unit_price = 0
      }

      if (product?.id) {
        // Update existing product
        const updated = await productsApi.update(product.id, productData)
        onSave(updated)
      } else {
        // Create new product
        const created = await productsApi.create(productData)
        // Refresh products list and add new product at the top
        const updatedProds = await productsApi.getAll()
        const sortedProducts = [...updatedProds].sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
          return dateB - dateA // Newest first
        })
        setProducts(sortedProducts)
        onSave(created)
      }
      onClose()
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

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Quantity *</label>
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              min="0"
              required
            />
          </div>

          {isAgent && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Unit Price (₹) *</label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                min="0"
                step="0.01"
                required
              />
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
      </Card>
    </div>
  )
}