import type { Sale, SaleItem } from '../types/models'

export function printSale(sale: Sale, items: SaleItem[], size: '58mm' | '80mm' | 'A4' = '80mm') {
  const shop = { name: 'WineBar Guwahati', address: 'Guwahati, Assam', phone: '', gst: '' }
  const width = size === '58mm' ? '58mm' : size === '80mm' ? '80mm' : '210mm'
  const content = `
    <html><head><title>${sale.invoiceNumber}</title><style>
      @page { size: ${width} auto; margin: ${size === 'A4' ? '12mm' : '3mm'}; }
      body { font-family: monospace; width: ${size === 'A4' ? 'auto' : '100%'}; margin:0; font-size:${size === '58mm' ? '10px' : '12px'}; }
      .center{text-align:center}.shop{font-weight:bold;font-size:16px}.row{display:flex;justify-content:space-between}.line{border-top:1px dashed #333;margin:6px 0}.total{font-size:15px;font-weight:bold}
    </style></head><body>
      <div class="center shop">${shop.name}</div><div class="center">${shop.address}</div><div class="center">${shop.phone}</div>
      <div class="line"></div><div>Invoice: ${sale.invoiceNumber}</div><div>Date: ${new Date(sale.createdAt).toLocaleString('en-IN')}</div><div>Cashier: ${sale.cashierName}</div><div class="line"></div>
      ${items.map((item) => `<div>${item.productName} ${item.bottleSize}</div><div class="row"><span>${item.quantity} x ₹${(item.unitPrice / 100).toFixed(2)}</span><strong>₹${(item.total / 100).toFixed(2)}</strong></div>`).join('')}
      <div class="line"></div><div class="row"><span>Subtotal</span><span>₹${(sale.subtotal / 100).toFixed(2)}</span></div><div class="row"><span>Discount</span><span>-₹${(sale.discount / 100).toFixed(2)}</span></div><div class="row total"><span>Grand Total</span><span>₹${(sale.total / 100).toFixed(2)}</span></div>
      ${sale.payments.map((payment) => `<div class="row"><span>${payment.method}</span><span>₹${(payment.amount / 100).toFixed(2)}</span></div>`).join('')}
      ${sale.cashReceived ? `<div class="row"><span>Cash received</span><span>₹${(sale.cashReceived / 100).toFixed(2)}</span></div>` : ''}
      ${sale.changeReturned ? `<div class="row"><span>Change returned</span><span>₹${(sale.changeReturned / 100).toFixed(2)}</span></div>` : ''}
      <div class="line"></div><div class="center">Thank you. Please visit again.</div>
    </body></html>`
  const frame = document.createElement('iframe')
  frame.style.display = 'none'
  document.body.appendChild(frame)
  const frameDocument = frame.contentWindow?.document
  if (!frameDocument) return
  frameDocument.open()
  frameDocument.write(content)
  frameDocument.close()
  frame.contentWindow?.focus()
  setTimeout(() => { frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000) }, 250)
}
