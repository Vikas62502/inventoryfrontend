import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Sale, Product } from './api'

// Extend Sale interface to include address objects
interface SaleWithAddresses extends Sale {
  billing_address?: Address | any
  delivery_address?: Address | any
}

// Static company details
const COMPANY_DETAILS = {
  name: 'CHAIRBORD PRIVATE LIMITED',
  address: 'PLOT NO-10, SHRI SHYAM VIHAR, KALWAR ROAD JAIPUR RAJASTHAN, 302012',
  gstin: '08AAJCC8097M1ZT',
  state: 'Rajasthan',
  stateCode: '08',
  contact: '+91-9269666646',
  email: 'support@chairbord.com',
}

const BANK_DETAILS = {
  accountHolder: 'CHAIRBORD PRIVATE LIMITED',
  bankName: 'ICICI BANK',
  accountNumber: '777705926966',
  branch: 'JAIPUR',
  ifscCode: 'ICIC0004181',
}

interface Address {
  line1: string
  line2?: string
  city: string
  state: string
  postal_code: string
  country: string
}

function formatAddress(address: Address | any): string {
  if (!address) return ""
  const parts = [
    address.line1,
    address.line2,
    address.city ? `${address.city}${address.state ? `, ${address.state}` : ''}${address.postal_code ? ` ${address.postal_code}` : ''}` : '',
    address.country,
  ].filter(Boolean)
  return parts.join(', ')
}

function numberToWords(num: number): string {
  // Handle edge cases
  if (isNaN(num) || !isFinite(num) || num < 0) {
    return 'Zero'
  }
  
  // Convert to integer
  const intNum = Math.floor(num)
  if (intNum === 0) return 'Zero'
  
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const teens = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ]

  // Helper function to convert up to 999
  const convertHundreds = (n: number): string => {
    if (n === 0) return ''
    if (n < 10) return ones[n]
    if (n < 20) return teens[n - 10]
    if (n < 100) {
      const ten = Math.floor(n / 10)
      const one = n % 10
      return ten > 0 && one > 0 ? `${tens[ten]} ${ones[one]}` : (tens[ten] || ones[one])
    }
    const hundred = Math.floor(n / 100)
    const remainder = n % 100
    return `${ones[hundred]} Hundred${remainder > 0 ? ' ' + convertHundreds(remainder) : ''}`.trim()
  }

  // Limit to 99 crores to prevent stack overflow
  if (intNum >= 1000000000) {
    return 'Amount too large'
  }

  let result = ''
  let remaining = intNum

  // Crores
  if (remaining >= 10000000) {
    const crores = Math.floor(remaining / 10000000)
    result += convertHundreds(crores) + ' Crore '
    remaining = remaining % 10000000
  }

  // Lakhs
  if (remaining >= 100000) {
    const lakhs = Math.floor(remaining / 100000)
    result += convertHundreds(lakhs) + ' Lakh '
    remaining = remaining % 100000
  }

  // Thousands
  if (remaining >= 1000) {
    const thousands = Math.floor(remaining / 1000)
    result += convertHundreds(thousands) + ' Thousand '
    remaining = remaining % 1000
  }

  // Hundreds, tens, ones
  if (remaining > 0) {
    result += convertHundreds(remaining)
  }

  return result.trim()
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getGSTStateCode(state: string): string {
  // Map common states to GST state codes
  const stateCodeMap: Record<string, string> = {
    'Rajasthan': '08',
    'Delhi': '07',
    'Maharashtra': '27',
    'Karnataka': '29',
    'Tamil Nadu': '33',
    'Gujarat': '24',
    'Uttar Pradesh': '09',
    'West Bengal': '19',
    'Punjab': '03',
    'Haryana': '06',
  }
  return stateCodeMap[state] || '08'
}

export function generateQuotationPDF(sale: SaleWithAddresses, products: Record<string, Product>): void {
  try {
    // Validate inputs
    if (!sale) {
      throw new Error("Sale data is required")
    }
    if (!sale.items || sale.items.length === 0) {
      throw new Error("Sale must have at least one item")
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = doc.internal.pageSize.width
    const margin = 10
    let yPos = margin

    // Title
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('QUOTATION', pageWidth / 2, yPos, { align: 'center' })
    yPos += 10

    // Company Details Section
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(COMPANY_DETAILS.name, margin, yPos)
    yPos += 6

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const companyAddressLines = doc.splitTextToSize(COMPANY_DETAILS.address, pageWidth - 2 * margin)
    doc.text(companyAddressLines, margin, yPos)
    yPos += companyAddressLines.length * 5

    doc.text(`GSTIN/UIN: ${COMPANY_DETAILS.gstin}`, margin, yPos)
    yPos += 5
    doc.text(`State Name: ${COMPANY_DETAILS.state}, Code: ${COMPANY_DETAILS.stateCode}`, margin, yPos)
    yPos += 5
    doc.text(`Contact: ${COMPANY_DETAILS.contact}`, margin, yPos)
    yPos += 5
    doc.text(`E-Mail: ${COMPANY_DETAILS.email}`, margin, yPos)
    yPos += 10

    // Quotation Details
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Quotation No.:', margin, yPos)
    doc.setFont('helvetica', 'normal')
    doc.text(`${sale.id.substring(0, 8)}`, margin + 40, yPos)

    doc.setFont('helvetica', 'bold')
    doc.text('Dated:', pageWidth - 60, yPos)
    doc.setFont('helvetica', 'normal')
    // Use sale_date from backend, fallback to saleDate, then created_at
    const saleAny = sale as any
    const dateSource = saleAny.sale_date || saleAny.saleDate || sale.created_at
    let saleDate = new Date().toISOString().split('T')[0] // Default to today
    
    if (dateSource) {
      try {
        const parsedDate = new Date(dateSource)
        if (!isNaN(parsedDate.getTime())) {
          saleDate = parsedDate.toISOString().split('T')[0]
        }
      } catch (e) {
        console.error("Error parsing date:", e)
        // Keep default date
      }
    }
    
    doc.text(saleDate, pageWidth - 40, yPos)
    yPos += 10

    // Buyer (Bill To) Information
    // Try multiple ways to get billing address
    const billingAddress = (sale as any).billing_address || (sale as any).billingAddress as Address | undefined
    const buyerState = billingAddress?.state || ''
    const buyerGSTIN = sale.gst_number || ''
    const buyerStateCode = getGSTStateCode(buyerState)
    
    // Debug: Log address data
    console.log("Quotation PDF - Billing Address:", billingAddress)
    console.log("Quotation PDF - Sale data:", sale)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Buyer (Bill to):', margin, yPos)
    yPos += 6

    doc.setFont('helvetica', 'normal')
    // For B2B, show company_name if available, otherwise customer_name
    // For B2C, show customer_name
    const buyerName = sale.type === "B2B" 
      ? (sale.company_name || sale.customer_name || 'N/A')
      : (sale.customer_name || 'N/A')
    doc.text(buyerName, margin, yPos)
    yPos += 5

    // Display address if available
    if (billingAddress) {
      // Try formatted address first
      const formattedAddress = formatAddress(billingAddress)
      if (formattedAddress && formattedAddress.trim()) {
        const buyerAddressLines = doc.splitTextToSize(formattedAddress, pageWidth - 2 * margin)
        doc.text(buyerAddressLines, margin, yPos)
        yPos += buyerAddressLines.length * 5
      } else {
        // If formatAddress returns empty, try building address from parts
        const addressParts: string[] = []
        if (billingAddress.line1) addressParts.push(billingAddress.line1)
        if (billingAddress.line2) addressParts.push(billingAddress.line2)
        if (billingAddress.city || billingAddress.state || billingAddress.postal_code) {
          const cityState = [
            billingAddress.city,
            billingAddress.state,
            billingAddress.postal_code
          ].filter(Boolean).join(' ')
          if (cityState) addressParts.push(cityState)
        }
        if (billingAddress.country) addressParts.push(billingAddress.country)
        
        if (addressParts.length > 0) {
          const addressText = addressParts.join(', ')
          const buyerAddressLines = doc.splitTextToSize(addressText, pageWidth - 2 * margin)
          doc.text(buyerAddressLines, margin, yPos)
          yPos += buyerAddressLines.length * 5
        }
      }
    }

    // Display phone number
    if (sale.customer_phone) {
      doc.text(`Phone: ${sale.customer_phone}`, margin, yPos)
      yPos += 5
    }

    // Display email if available
    if (sale.customer_email) {
      doc.text(`E-Mail: ${sale.customer_email}`, margin, yPos)
      yPos += 5
    }

    // For B2B, display contact person and their phone if available
    if (sale.type === "B2B" && sale.contact_person) {
      doc.text(`Contact Person: ${sale.contact_person}`, margin, yPos)
      yPos += 5
      // Note: If contact person has a separate phone, it would need to be added to the Sale interface
      // For now, we show the customer_phone as the contact person's phone
    }

    if (buyerGSTIN) {
      doc.text(`GSTIN/UIN: ${buyerGSTIN}`, margin, yPos)
      yPos += 5
    }

    if (buyerState) {
      doc.text(`State Name: ${buyerState}, Code: ${buyerStateCode}`, margin, yPos)
      yPos += 5
    }
    yPos += 5

    // Consignee (Ship To) Information
    const deliveryAddress = (sale as any).delivery_address as Address | undefined
    const isSameAddress = sale.delivery_matches_billing || (billingAddress && deliveryAddress && JSON.stringify(billingAddress) === JSON.stringify(deliveryAddress))

    if (!isSameAddress && deliveryAddress && formatAddress(deliveryAddress)) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Consignee (Ship to):', margin, yPos)
      yPos += 6

      doc.setFont('helvetica', 'normal')
      doc.text(buyerName || 'N/A', margin, yPos)
      yPos += 5

      const deliveryAddressLines = doc.splitTextToSize(formatAddress(deliveryAddress), pageWidth - 2 * margin)
      doc.text(deliveryAddressLines, margin, yPos)
      yPos += deliveryAddressLines.length * 5

      if (buyerGSTIN) {
        doc.text(`GSTIN/UIN: ${buyerGSTIN}`, margin, yPos)
        yPos += 5
      }

      if (buyerState) {
        doc.text(`State Name: ${buyerState}, Code: ${buyerStateCode}`, margin, yPos)
        yPos += 5
      }
      yPos += 5
    }

    // Items Table
    const tableData: string[][] = []
    let totalQuantity = 0

    sale.items.forEach((item, index) => {
      const product = products[item.product_id] || item.product
      const productName = product?.name || 'Unknown Product'
      // Default HSN code for solar products, can be updated per product later
      const hsnCode = (product as any)?.hsn_code || '73066100'
      const quantity = item.quantity || 0
      const rate = item.unit_price || 0
      const amount = quantity * rate

      totalQuantity += quantity

      tableData.push([
        (index + 1).toString(),
        productName,
        hsnCode,
        saleDate,
        quantity.toFixed(1) + ' PCS',
        formatNumber(rate),
        'PCS',
        formatNumber(amount),
      ])
    })

    autoTable(doc, {
      startY: yPos,
      head: [['SI No.', 'Description of Goods', 'HSN/SAC', 'Due on', 'Quantity', 'Rate', 'Unit', 'Amount']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 12 }, // SI No.
        1: { cellWidth: 50 }, // Description
        2: { cellWidth: 20 }, // HSN/SAC
        3: { cellWidth: 20 }, // Due on
        4: { cellWidth: 20 }, // Quantity
        5: { cellWidth: 20 }, // Rate
        6: { cellWidth: 15 }, // per
        7: { cellWidth: 25 }, // Amount
      },
    })

    yPos = (doc as any).lastAutoTable.finalY + 10

    // Summary Section
    const subtotal = sale.subtotal || sale.items.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 0), 0)
    const taxAmount = sale.tax_amount || 0
    const gstRate = sale.items[0]?.gst_rate || 18
    
    // Calculate CGST and SGST (split evenly)
    let cgst = 0
    let sgst = 0
    if (taxAmount > 0) {
      cgst = taxAmount / 2
      sgst = taxAmount / 2
    } else {
      cgst = (subtotal * gstRate) / 200 // Split GST into CGST and SGST
      sgst = (subtotal * gstRate) / 200
    }
    
    // Ensure all values are valid numbers
    const safeSubtotal = isNaN(subtotal) ? 0 : Math.max(0, subtotal)
    const safeCgst = isNaN(cgst) ? 0 : Math.max(0, cgst)
    const safeSgst = isNaN(sgst) ? 0 : Math.max(0, sgst)
    
    const totalBeforeRound = safeSubtotal + safeCgst + safeSgst
    const roundOff = Math.round(totalBeforeRound) - totalBeforeRound
    const total = Math.max(0, Math.round(totalBeforeRound))

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    // Calculate GST percentage for display
    // Use the actual GST rate from items, or calculate from tax amount
    let gstPercent = gstRate
    if (taxAmount > 0 && safeSubtotal > 0) {
      // Calculate actual GST percentage from tax amount
      gstPercent = (taxAmount / safeSubtotal) * 100
    }
    // Split GST into CGST and SGST, showing one decimal place
    const cgstPercentDisplay = (gstPercent / 2).toFixed(1)
    
    // Two-column layout: Labels at left, values at extreme right (3rd part of page)
    // Calculate label position (around 65% of page width for labels - 3rd part of page)
    const labelPosition = pageWidth * 0.65
    
    // Subtotal
    doc.text('Subtotal:', labelPosition, yPos, { align: 'left' })
    doc.text(formatNumber(safeSubtotal), pageWidth - margin, yPos, { align: 'right' })
    yPos += 6
    
    // C GST
    doc.text(`C GST (${cgstPercentDisplay}%):`, labelPosition, yPos, { align: 'left' })
    doc.text(formatNumber(safeCgst), pageWidth - margin, yPos, { align: 'right' })
    yPos += 6
    
    // S GST
    doc.text(`S GST (${cgstPercentDisplay}%):`, labelPosition, yPos, { align: 'left' })
    doc.text(formatNumber(safeSgst), pageWidth - margin, yPos, { align: 'right' })
    yPos += 6

    // ROUND OFF
    if (Math.abs(roundOff) > 0.001) {
      doc.text(`ROUND OFF:`, labelPosition, yPos, { align: 'left' })
      doc.text(`${roundOff < 0 ? '(-)' : ''}${formatNumber(Math.abs(roundOff))}`, pageWidth - margin, yPos, { align: 'right' })
      yPos += 6
    }

    // Total Quantity
    doc.text('Total Quantity:', labelPosition, yPos, { align: 'left' })
    doc.text(`${totalQuantity.toFixed(1)} PCS`, pageWidth - margin, yPos, { align: 'right' })
    yPos += 6

    // Total Amount
    doc.text('Total Amount:', labelPosition, yPos, { align: 'left' })
    doc.text(formatNumber(total), pageWidth - margin, yPos, { align: 'right' })
    yPos += 6

    // Amount in Words
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Amount Chargeable (in words):', margin, yPos)
    yPos += 5
    doc.setFont('helvetica', 'normal')
    // Ensure total is a valid number
    const safeTotal = isNaN(total) || !isFinite(total) ? 0 : Math.max(0, Math.floor(total))
    const amountInWords = `INR ${numberToWords(safeTotal)} Only`
    const wordsLines = doc.splitTextToSize(amountInWords, pageWidth - 2 * margin)
    doc.text(wordsLines, margin, yPos)
    yPos += wordsLines.length * 5 + 5

    // Bank Details
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Company\'s Bank Details:', margin, yPos)
    yPos += 5

    doc.setFont('helvetica', 'normal')
    doc.text(`A/c Holder's Name: ${BANK_DETAILS.accountHolder}`, margin, yPos)
    yPos += 5
    doc.text(`Bank Name: ${BANK_DETAILS.bankName}`, margin, yPos)
    yPos += 5
    doc.text(`A/c No.: ${BANK_DETAILS.accountNumber}`, margin, yPos)
    yPos += 5
    doc.text(`Branch & IFS Code: ${BANK_DETAILS.branch} & ${BANK_DETAILS.ifscCode}`, margin, yPos)
    yPos += 10

    // Footer - both at the bottom of the page
    const pageHeight = doc.internal.pageSize.height
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    // Left side - Computer Generated Document
    doc.text('This is a Computer Generated Document', margin, pageHeight - 10, { align: 'left' })
    // Right side - Authorised Signatory
    doc.setFont('helvetica', 'normal')
    doc.text('Authorised Signatory', pageWidth - margin, pageHeight - 10, { align: 'right' })

    // Generate filename
    const filename = `Quotation_${sale.id.substring(0, 8)}_${saleDate.replace(/\//g, '-')}.pdf`

    // Save PDF
    doc.save(filename)
  } catch (error: any) {
    console.error("Error generating quotation PDF:", error)
    throw new Error(`Failed to generate PDF: ${error.message || "Unknown error"}`)
  }
}

