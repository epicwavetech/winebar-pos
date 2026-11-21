import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(filename.endsWith('.csv') ? filename : `${filename}.csv`, blob)
}

export function exportExcel(filename: string, sheetName: string, headers: string[], rows: (string | number)[][]) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31))
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

export function exportPdf(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const document = new jsPDF()
  document.setFontSize(14)
  document.text(title, 14, 15)
  autoTable(document, { startY: 22, head: [headers], body: rows.map((row) => row.map(String)), styles: { fontSize: 8 } })
  document.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
