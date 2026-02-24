/**
 * Extract serial numbers from Excel (.xlsx, .xls) or CSV file.
 * Uses first column of first sheet. Skips empty cells and trims whitespace.
 */
import * as XLSX from "xlsx"

export async function extractSerialNumbersFromFile(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  return parseExcelOrCsv(buffer, file.name)
}

function parseExcelOrCsv(buffer: ArrayBuffer, _fileName: string): string[] {
  const workbook = XLSX.read(buffer, { type: "array", raw: true })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return []
  const sheet = workbook.Sheets[firstSheetName]
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" })
  const serials: string[] = []
  const headerPattern = /^(serial|sr\.?|no\.?|#|s\.?n|barcode)\s*$/i
  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    if (!Array.isArray(row)) continue
    const firstCell = row[0]
    const val = String(firstCell ?? "").trim()
    if (!val) continue
    if (i === 0 && headerPattern.test(val)) continue
    serials.push(val)
  }
  return serials
}

