import type { Product } from "@/lib/api"
import { normalizeSaleQuantity } from "@/lib/utils"
import { getTallyVoucher, matchProductByTallyName } from "@/lib/tally-json-import"

export interface TallyPurchaseLineItem {
  index: number
  stockItemName: string
  /** Defaults to stockItemName when omitted */
  modelName?: string
  serialNumbers: string[]
  quantity: number
  tallyUnit: string
  formUnit: string
  unitPrice: number
  lineTotal: number
  suggestedCategory: string
  wattage: string
  matchedProductId: string | null
  matchedProductName: string | null
  matchConfidence: "exact" | "fuzzy" | "none"
  /** create = new product; update = add stock to existing catalog product */
  importAction: "create" | "update"
}

export interface TallyPurchaseImportResult {
  voucherType: string
  voucherNumber: string
  partyName: string
  reference: string
  lines: TallyPurchaseLineItem[]
}

const NOT_APPLICABLE = /not applicable/i

/** Catalog category names used by the app (order matters for pattern matching). */
export const TALLY_PURCHASE_CATEGORIES = [
  "Solar Panels",
  "Inverters",
  "Meters",
  "Cables - DC",
  "Cables - Copper",
  "Electrical Components",
  "Structural Components",
  "Earthing Kit",
  "Accessories",
  "Other",
] as const

const TALLY_UNIT_TO_FORM: Record<string, string> = {
  NOS: "Quantity",
  NO: "Quantity",
  PCS: "Pieces",
  PC: "Pieces",
  MTR: "Meters",
  METER: "Meters",
  METERS: "Meters",
  KG: "Kilograms",
  KGS: "Kilograms",
  KILOGRAM: "Kilograms",
  W: "Watts",
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function extractTallyStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Serial numbers live in basicuserdescription after the metadata object. */
export function extractSerialsFromTallyDescription(value: unknown): string[] {
  const strings = extractTallyStrings(value)
  return strings.filter((s) => {
    if (NOT_APPLICABLE.test(s)) return false
    if (/^e-mail\s*:/i.test(s)) return false
    return s.length >= 4
  })
}

function parseTallyQty(value: unknown): { quantity: number; unit: string } {
  const raw = extractTallyStrings(value).join(" ") || String(value ?? "")
  const match = raw.match(/([\d.]+)\s*([A-Za-z]+)?/i)
  const quantity = normalizeSaleQuantity(match ? Number(match[1]) : 0)
  const unit = (match?.[2] || "NOS").toUpperCase()
  return { quantity: Number.isFinite(quantity) ? quantity : 0, unit }
}

function parseTallyRate(value: unknown): number {
  const raw = String(value ?? "").trim()
  const pricePart = raw.split("/")[0]?.trim() || raw
  const unitPrice = Number.parseFloat(pricePart)
  return Number.isFinite(unitPrice) ? Math.abs(unitPrice) : 0
}

function mapTallyUnitToForm(tallyUnit: string): string {
  const key = tallyUnit.trim().toUpperCase()
  return TALLY_UNIT_TO_FORM[key] || "Quantity"
}

function matchCategoryFromReference(
  stockItemName: string,
  referenceData: Array<{ name?: string; category?: string }>
): string | null {
  const key = normalizeKey(stockItemName)
  if (!key) return null

  let bestCategory: string | null = null
  let bestScore = 0

  for (const item of referenceData) {
    if (!item.name || !item.category) continue
    const nameKey = normalizeKey(item.name)
    let score = 0
    if (nameKey === key) score = 100
    else if (nameKey.includes(key) || key.includes(nameKey)) score = 85
    else {
      const tokens = stockItemName.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2)
      const nameLower = item.name.toLowerCase()
      const hits = tokens.filter((t) => nameLower.includes(t)).length
      if (tokens.length > 0) score = Math.round((hits / tokens.length) * 70)
    }
    if (score > bestScore) {
      bestScore = score
      bestCategory = item.category
    }
  }

  return bestScore >= 50 ? bestCategory : null
}

/**
 * Infer category per line so mixed vouchers (panels + inverters + cables + meters)
 * each get the correct category.
 */
export function inferCategoryFromTallyStockName(
  stockItemName: string,
  referenceData: Array<{ name?: string; category?: string }> = []
): string {
  const fromRef = matchCategoryFromReference(stockItemName, referenceData)
  if (fromRef) return fromRef

  const upper = stockItemName.toUpperCase()

  if (/KWP|GTI|XWATT|INVERTER|MPPT|HYBRID|ON[\s-]?GRID|OFF[\s-]?GRID/i.test(upper)) {
    return "Inverters"
  }
  if (
    (/PANEL|SOLAR\s*PANEL|DCR|NDCR|N-TYPE|MONO|POLY|BIFACIAL/i.test(upper) ||
      /\b\d{3,4}\s*W(?:ATT)?\b/i.test(upper)) &&
    !/INVERTER|KWP|GTI|XWATT|MPPT/i.test(upper)
  ) {
    return "Solar Panels"
  }
  if (/\bMETER\b|ENERGY\s*METER|NET\s*METER|BI[\s-]?DIRECTIONAL/i.test(upper)) {
    return "Meters"
  }
  if (/COPPER|CU\s*CABLE|FLEXIBLE\s*COPPER/i.test(upper) && /CABLE|WIRE/i.test(upper)) {
    return "Cables - Copper"
  }
  if (/DC\s*CABLE|SOLAR\s*CABLE|XLPE|PV\s*CABLE|AC\s*CABLE|CABLE|WIRE/i.test(upper)) {
    return "Cables - DC"
  }
  if (/EARTH|EARTHING|CHEMICAL\s*EARTH|GI\s*PIPE|EARTH\s*PIT/i.test(upper)) {
    return "Earthing Kit"
  }
  if (/STRUCTURE|RAIL|CLAMP|MID\s*CLAMP|END\s*CLAMP|PURLIN|MODULE\s*MOUNT/i.test(upper)) {
    return "Structural Components"
  }
  if (/ACDB|DCDB|MCB|MCCB|SPD|LA\b|SURGE|CONNECTOR|MC4|FUSE|ISOLATOR|DB\b/i.test(upper)) {
    return "Electrical Components"
  }
  if (/ACCESSOR|CONDUIT|GLAND|LUG|FERRULE|TAPE|TIE|CLIP/i.test(upper)) {
    return "Accessories"
  }

  return "Other"
}

function inferWattageFromStockName(stockItemName: string): string {
  const kwp = stockItemName.match(/(\d+(?:\.\d+)?)\s*KWP/i)
  if (kwp) return `${kwp[1]}KWP`
  const w = stockItemName.match(/(\d+)\s*W(?:ATT)?\b/i)
  if (w) return `${w[1]}W`
  return ""
}

/** Match only against live inventory products (API), not reference catalog stubs. */
export function resolvePurchaseLineProduct(
  stockItemName: string,
  catalogProducts: Product[]
): { product: Product | null; confidence: TallyPurchaseLineItem["matchConfidence"] } {
  return matchProductByTallyName(stockItemName, catalogProducts)
}

export function parseTallyPurchaseJson(
  payload: unknown,
  catalogProducts: Product[],
  referenceData: Array<{ name?: string; category?: string }> = []
): TallyPurchaseImportResult {
  const voucher = getTallyVoucher(payload)
  if (!voucher) {
    throw new Error("Invalid Tally JSON: expected { tallymessage: [ { ...voucher } ] }")
  }

  const vchType = String(voucher.vouchertypename || voucher.vchtype || "")
  if (!/purchase/i.test(vchType)) {
    throw new Error(`Expected a Purchase voucher, got "${vchType || "unknown"}"`)
  }

  const entries = Array.isArray(voucher.allinventoryentries) ? voucher.allinventoryentries : []
  if (!entries.length) {
    throw new Error("No inventory lines found (allinventoryentries is empty)")
  }

  const reference = String(voucher.reference || voucher.vouchernumber || "")
  const partyName = String(voucher.partyname || voucher.partyledgername || "")

  const lines: TallyPurchaseLineItem[] = entries.map((entry, index) => {
    const row = entry as Record<string, unknown>
    const stockItemName = String(row.stockitemname || "").trim()
    const qtyParsed = parseTallyQty(row.billedqty || row.actualqty)
    const unitPrice = parseTallyRate(row.rate)
    const amountRaw = Number.parseFloat(String(row.amount || "0"))
    const lineTotal = Number.isFinite(amountRaw) ? Math.abs(amountRaw) : qtyParsed.quantity * unitPrice
    const serialNumbers = extractSerialsFromTallyDescription(row.basicuserdescription)
    const quantity =
      serialNumbers.length > 0 && serialNumbers.length !== qtyParsed.quantity
        ? serialNumbers.length
        : qtyParsed.quantity
    const inferredCategory = inferCategoryFromTallyStockName(stockItemName, referenceData)
    const { product, confidence } = resolvePurchaseLineProduct(stockItemName, catalogProducts)

    return {
      index,
      stockItemName,
      modelName: stockItemName,
      serialNumbers,
      quantity,
      tallyUnit: qtyParsed.unit,
      formUnit: mapTallyUnitToForm(qtyParsed.unit),
      unitPrice,
      lineTotal,
      // Prefer live product category when editing existing stock
      suggestedCategory: product?.category || inferredCategory,
      wattage: inferWattageFromStockName(stockItemName),
      matchedProductId: product?.id || null,
      matchedProductName: product?.name || null,
      matchConfidence: confidence,
      importAction: product ? "update" : "create",
    }
  })

  return {
    voucherType: vchType,
    voucherNumber: String(voucher.vouchernumber || ""),
    partyName,
    reference,
    lines,
  }
}
