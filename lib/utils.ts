import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format image URL from API response
 * Handles both relative paths (for local images) and API-uploaded images
 */
export function formatImageUrl(imageUrl?: string | null): string {
  if (!imageUrl) {
    return '/placeholder.jpg'
  }

  // If it's already a full URL or starts with http/https, return as is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl
  }

  // If it starts with /, it's a local path
  if (imageUrl.startsWith('/')) {
    return imageUrl
  }

  // Otherwise, it's likely an API-uploaded image filename
  // Construct the full URL using the API base URL
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3050/api'
  const uploadsBaseUrl = apiBaseUrl.replace('/api', '/uploads')
  return `${uploadsBaseUrl}/${imageUrl}`
}

/**
 * Format date to ISO format (YYYY-MM-DD)
 * @param date - Date string, Date object, or null/undefined
 * @returns ISO formatted date string (YYYY-MM-DD) or "N/A" if invalid
 */
export function formatDateISO(date: string | Date | null | undefined): string {
  if (!date) return "N/A"
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    if (isNaN(dateObj.getTime())) return "N/A"
    
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    
    return `${year}-${month}-${day}`
  } catch {
    return "N/A"
  }
}

/**
 * Format datetime to ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)
 * @param date - Date string, Date object, or null/undefined
 * @returns ISO formatted datetime string or "N/A" if invalid
 */
export function formatDateTimeISO(date: string | Date | null | undefined): string {
  if (!date) return "N/A"
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    if (isNaN(dateObj.getTime())) return "N/A"
    
    return dateObj.toISOString()
  } catch {
    return "N/A"
  }
}

/** Allow decimal typing in price/weight fields (e.g. 85.45). */
export function sanitizeDecimalInput(raw: string, maxDecimals = 2): string {
  let cleaned = raw.replace(/[^\d.]/g, "")
  const dotIndex = cleaned.indexOf(".")
  if (dotIndex !== -1) {
    cleaned =
      cleaned.slice(0, dotIndex + 1) +
      cleaned.slice(dotIndex + 1).replace(/\./g, "").slice(0, maxDecimals)
  }
  return cleaned
}

export function parseDecimalInput(value: string): number {
  if (!value || value === ".") return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Max decimal places for B2B/B2C sale line quantities (e.g. 2.5). */
export const SALE_QUANTITY_DECIMALS = 3

export function normalizeSaleQuantity(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return NaN
  const factor = 10 ** SALE_QUANTITY_DECIMALS
  return Math.round(n * factor) / factor
}

export function isWholeSaleQuantity(value: number): boolean {
  if (!Number.isFinite(value)) return false
  return Math.abs(value - Math.round(value)) < 1e-6
}

export function formatSaleQuantity(value: unknown): string {
  const n = normalizeSaleQuantity(value)
  if (!Number.isFinite(n)) return "0"
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: SALE_QUANTITY_DECIMALS,
  })
}

export function hasSufficientStock(available: number, requested: number): boolean {
  const a = normalizeSaleQuantity(available)
  const r = normalizeSaleQuantity(requested)
  if (!Number.isFinite(a) || !Number.isFinite(r)) return false
  return a + 1e-6 >= r
}

export function isKilogramUnit(unit: string | undefined | null): boolean {
  const u = (unit || "").trim().toLowerCase()
  return u === "kgs" || u === "kg" || u === "kilograms" || u === "kilogram"
}

/** Convert total weight (kg) to whole pieces; decimals are rounded. */
export function convertKgWeightToPieces(totalKg: number, pieceWeightKg: number): number {
  if (pieceWeightKg <= 0 || totalKg <= 0) return 0
  return Math.round(totalKg / pieceWeightKg)
}

/** Price per kg × weight per piece → price per piece (2 decimal places). */
export function convertKgPriceToPiecePrice(pricePerKg: number, pieceWeightKg: number): number {
  if (pricePerKg <= 0 || pieceWeightKg <= 0) return 0
  return Math.round(pricePerKg * pieceWeightKg * 100) / 100
}

/** Stored piece price → display as price per kg (2 decimal places). */
export function convertPiecePriceToKgPrice(piecePrice: number, pieceWeightKg: number): number {
  if (piecePrice <= 0 || pieceWeightKg <= 0) return 0
  return Math.round((piecePrice / pieceWeightKg) * 100) / 100
}

export const UNIT_DISPLAY_TO_API: Record<string, string> = {
  Quantity: "NOS",
  Pieces: "PCS",
  Meters: "MTR",
  Kilograms: "KGS",
  Watts: "W",
  Fixed: "Fixed",
  Pack: "PAC",
  Pillar: "Pillar",
}

export function resolveApiUnit(displayUnit: string): string {
  return UNIT_DISPLAY_TO_API[displayUnit] || displayUnit
}

/** Short label for stock column (NOS, PCS, MTR, …). */
export function formatProductUnitLabel(unit?: string | null): string {
  if (!unit?.trim()) return ""
  const u = unit.trim()
  const fromDisplay: Record<string, string> = {
    Quantity: "NOS",
    Pieces: "PCS",
    Meters: "MTR",
    Kilograms: "KGS",
    Watts: "W",
    Pack: "PAC",
  }
  return fromDisplay[u] || u
}

/** Map API/catalog unit to form select value (Quantity, Pieces, …). */
export function unitToFormSelectValue(unit?: string | null): string {
  if (!unit?.trim()) return ""
  const u = unit.trim()
  if (UNIT_DISPLAY_TO_API[u]) return u
  const fromCode: Record<string, string> = {
    NOS: "Quantity",
    PCS: "Pieces",
    MTR: "Meters",
    KGS: "Kilograms",
    W: "Watts",
    PAC: "Pack",
    Fixed: "Fixed",
    Pillar: "Pillar",
  }
  return fromCode[u] || u
}

/** Normalize API errors for product save UI (AWS/S3 misconfig, nested payloads). */
export function formatProductSaveError(err: unknown, fallback: string): string {
  const chunks: string[] = []
  if (err instanceof Error && err.message) chunks.push(err.message)
  if (typeof err === "object" && err !== null && "data" in err && (err as { data?: unknown }).data !== undefined) {
    try {
      chunks.push(JSON.stringify((err as { data: unknown }).data))
    } catch {
      chunks.push(String((err as { data: unknown }).data))
    }
  }
  const blob = chunks.join(" ")
  if (
    blob.includes("Missing credentials in config") ||
    blob.includes("AWS_SDK_LOAD_CONFIG")
  ) {
    return "File storage on the server is not configured (AWS). With the latest app version, saves without a photo use JSON only. If this still appears, the API may be initializing S3 on every request — your backend must skip cloud upload unless a real file is uploaded."
  }
  const primary = err instanceof Error ? err.message : fallback
  return primary || fallback
}

const SERIAL_REQUIRED_DISPATCH_CATEGORIES = new Set([
  "panels",
  "panel",
  "solar panels",
  "solar panel",
  "inverter",
  "inverters",
])

/** Serial numbers required for Panels and Inverters only (create, edit, add stock, dispatch). */
export function isSerialRequiredForDispatch(
  category?: string | null,
  productName?: string | null
): boolean {
  const normalized = (category || "").toLowerCase().trim()
  if (normalized === "meter" || normalized === "meters") return false
  if (normalized) {
    if (SERIAL_REQUIRED_DISPATCH_CATEGORIES.has(normalized)) return true
    if (normalized.includes("panel") || normalized.includes("inverter")) return true
  }
  const name = (productName || "").toLowerCase()
  if (
    name.includes("meter") &&
    !name.includes("inverter") &&
    !name.includes("kwp") &&
    !name.includes("panel")
  ) {
    return false
  }
  return name.includes("inverter") || name.includes("kwp") || name.includes("panel")
}
