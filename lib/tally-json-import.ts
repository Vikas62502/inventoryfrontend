import type { Product } from "@/lib/api"
import type { Address } from "@/components/forms/address-fields"
import { normalizeSaleQuantity } from "@/lib/utils"

export interface TallyImportLineItem {
  tallyStockItemName: string
  description?: string
  quantity: number
  unit: string
  unitPrice: number
  lineTotal: number
  gstRate: number
  productId: string | null
  matchedProductName: string | null
  matchConfidence: "exact" | "fuzzy" | "none"
}

export interface TallyImportPrefill {
  saleType: "b2b" | "b2c"
  customerName: string
  customerPhone: string
  customerEmail: string
  companyName: string
  gstNumber: string
  contactPerson: string
  reference: string
  notes: string
  billingAddress: Address
  deliveryAddress: Address
  deliveryMatchesBilling: boolean
  items: Array<{
    product_id: string
    quantity: number
    unit_price: number
    gst_rate: number
  }>
}

type TallyVoucher = Record<string, unknown>

const NOT_APPLICABLE = /not applicable/i

function extractTallyString(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (Array.isArray(value)) {
    const strings = value.filter((v): v is string => typeof v === "string")
    return strings.join(" ").trim()
  }
  return ""
}

function parseTallyQty(value: unknown): { quantity: number; unit: string } {
  const raw = extractTallyString(value)
  const match = raw.match(/([\d.]+)\s*([A-Za-z]+)?/i)
  const quantity = normalizeSaleQuantity(match ? Number(match[1]) : 0)
  const unit = (match?.[2] || "PCS").toUpperCase()
  return { quantity: Number.isFinite(quantity) ? quantity : 0, unit }
}

function parseTallyRate(value: unknown): { unitPrice: number; unit: string } {
  const raw = extractTallyString(value)
  const [pricePart, unitPart] = raw.split("/")
  const unitPrice = Number.parseFloat(pricePart?.trim() || "0")
  const unit = (unitPart || "PCS").trim().toUpperCase()
  return {
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    unit,
  }
}

function parseGstRate(ratedetails: unknown): number {
  if (!Array.isArray(ratedetails)) return 0
  let cgst = 0
  let sgst = 0
  let igst = 0
  for (const row of ratedetails) {
    if (!row || typeof row !== "object") continue
    const head = String((row as Record<string, unknown>).gstratedutyhead || "")
    const evalType = String((row as Record<string, unknown>).gstratevaluationtype || "")
    if (NOT_APPLICABLE.test(evalType)) continue
    const rate = Number.parseFloat(String((row as Record<string, unknown>).gstrate || "").trim())
    if (!Number.isFinite(rate)) continue
    if (head === "CGST") cgst = rate
    else if (head === "SGST/UTGST") sgst = rate
    else if (head === "IGST") igst = rate
  }
  if (igst > 0) return igst
  return cgst + sgst
}

function parsePartyName(raw: string): { name: string; phone: string } {
  const trimmed = raw.trim()
  const phoneMatch = trimmed.match(/\((\d{10})\)\s*$/)
  if (phoneMatch) {
    return {
      name: trimmed.replace(/\(\d{10}\)\s*$/, "").trim(),
      phone: phoneMatch[1],
    }
  }
  return { name: trimmed, phone: "" }
}

function parseAddressLine(raw: string, state: string, pincode: string): Address {
  const line1 = raw.trim()
  let city = ""
  if (line1.includes(" - ")) {
    const parts = line1.split(" - ")
    city = parts[parts.length - 1]?.trim() || ""
  } else if (line1.includes(",")) {
    const parts = line1.split(",")
    city = parts[parts.length - 1]?.trim() || ""
  }
  return {
    line1,
    line2: "",
    city,
    state: state.trim(),
    postal_code: pincode.trim(),
    country: "India",
  }
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function matchProductByTallyName(
  stockItemName: string,
  products: Product[]
): { product: Product | null; confidence: TallyImportLineItem["matchConfidence"] } {
  const key = normalizeKey(stockItemName)
  if (!key) return { product: null, confidence: "none" }

  let best: Product | null = null
  let bestScore = 0

  for (const product of products) {
    const nameKey = normalizeKey(product.name)
    const modelKey = normalizeKey(product.model || "")
    let score = 0

    if (nameKey === key || modelKey === key) score = 100
    else if (nameKey.includes(key) || key.includes(nameKey)) score = 85
    else if (modelKey && (modelKey.includes(key) || key.includes(modelKey))) score = 80
    else {
      const tokens = key.split(/\s+/).filter(Boolean)
      const nameTokens = `${product.name} ${product.model || ""}`.toLowerCase()
      const hits = tokens.filter((t) => t.length > 2 && nameTokens.includes(t)).length
      if (tokens.length > 0) score = Math.round((hits / tokens.length) * 70)
    }

    if (score > bestScore) {
      bestScore = score
      best = product
    }
  }

  if (!best || bestScore < 50) return { product: null, confidence: "none" }
  return { product: best, confidence: bestScore >= 90 ? "exact" : "fuzzy" }
}

export function getTallyVoucher(payload: unknown): TallyVoucher | null {
  if (!payload || typeof payload !== "object") return null
  const root = payload as Record<string, unknown>
  const messages = root.tallymessage
  if (!Array.isArray(messages) || !messages.length) return null
  const voucher = messages[0]
  return voucher && typeof voucher === "object" ? (voucher as TallyVoucher) : null
}

export function parseTallySaleJson(
  payload: unknown,
  products: Product[],
  forcedType?: "b2b" | "b2c"
): { lines: TallyImportLineItem[]; prefill: Omit<TallyImportPrefill, "items">; saleType: "b2b" | "b2c" } {
  const voucher = getTallyVoucher(payload)
  if (!voucher) {
    throw new Error("Invalid Tally JSON: expected { tallymessage: [ { ...voucher } ] }")
  }

  const gstRegType = String(voucher.gstregistrationtype || "")
  const buyerGst =
    typeof voucher.gstregistration === "object" && voucher.gstregistration !== null
      ? String((voucher.gstregistration as Record<string, unknown>).taxregistration || "")
      : ""
  const saleType: "b2b" | "b2c" =
    forcedType ||
    (NOT_APPLICABLE.test(gstRegType) || gstRegType.toLowerCase().includes("unregistered")
      ? "b2c"
      : "b2b")

  const partyRaw = String(voucher.partyname || voucher.basicbuyername || voucher.partymailingname || "")
  const { name: customerName, phone: customerPhone } = parsePartyName(partyRaw)
  const state = String(voucher.statename || voucher.consigneestatename || voucher.placeofsupply || "")
  const pincode = String(voucher.partypincode || voucher.consigneepincode || "")
  const addressRaw =
    extractTallyString(voucher.basicbuyeraddress) || extractTallyString(voucher.address) || ""
  const billingAddress = parseAddressLine(addressRaw, state, pincode)

  const entries = Array.isArray(voucher.allinventoryentries) ? voucher.allinventoryentries : []
  const lines: TallyImportLineItem[] = entries.map((entry) => {
    const row = entry as Record<string, unknown>
    const tallyStockItemName = String(row.stockitemname || "").trim()
    const qtyParsed = parseTallyQty(row.billedqty || row.actualqty)
    const rateParsed = parseTallyRate(row.rate)
    const amount = Number.parseFloat(String(row.amount || "0"))
    const lineTotal = Number.isFinite(amount) ? amount : qtyParsed.quantity * rateParsed.unitPrice
    const gstRate = parseGstRate(row.ratedetails)
    const description = extractTallyString(row.basicuserdescription) || undefined
    const { product, confidence } = matchProductByTallyName(tallyStockItemName, products)

    return {
      tallyStockItemName,
      description,
      quantity: qtyParsed.quantity,
      unit: qtyParsed.unit || rateParsed.unit,
      unitPrice: rateParsed.unitPrice,
      lineTotal,
      gstRate,
      productId: product?.id || null,
      matchedProductName: product?.name || null,
      matchConfidence: confidence,
    }
  })

  if (!lines.length) {
    throw new Error("No line items found in Tally JSON (allinventoryentries is empty)")
  }

  const reference = String(voucher.reference || voucher.vouchernumber || "")
  const notes = [reference ? `Tally ref: ${reference}` : "", String(voucher.vouchernumber || "") ? `Voucher #${voucher.vouchernumber}` : ""]
    .filter(Boolean)
    .join(" | ")

  return {
    lines,
    saleType,
    prefill: {
      saleType,
      customerName,
      customerPhone,
      customerEmail: "",
      companyName: saleType === "b2b" ? customerName : "",
      gstNumber: saleType === "b2b" ? buyerGst : "",
      contactPerson: customerName,
      reference,
      notes,
      billingAddress,
      deliveryAddress: { ...billingAddress },
      deliveryMatchesBilling: true,
    },
  }
}

export function buildPrefillFromTallyLines(
  prefill: Omit<TallyImportPrefill, "items">,
  lines: TallyImportLineItem[]
): TallyImportPrefill {
  const items = lines
    .filter((line) => line.productId && line.quantity > 0)
    .map((line) => ({
      product_id: line.productId as string,
      quantity: line.quantity,
      unit_price: Math.round(line.unitPrice * 100) / 100,
      gst_rate: line.gstRate,
    }))

  return { ...prefill, items }
}
