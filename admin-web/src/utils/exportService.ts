import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export const exportToPDF = (
  title: string,
  headers: string[],
  data: (string | number)[][][],
  filename?: string
) => {
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('PT KRAKATAU INDAH', 14, 15)

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(title, 14, 22)

  doc.setFontSize(9)
  doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, 28)

  autoTable(doc, {
    head: [headers],
    body: data as string[][],
    startY: 33,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  })

  doc.save(filename ?? `${title.replace(/\s+/g, '_')}_${Date.now()}.pdf`)
}

export const exportToExcel = (
  title: string,
  headers: string[],
  data: (string | number)[][],
  filename?: string
) => {
  const wb = XLSX.utils.book_new()

  const wsData = [
    ['PT KRAKATAU INDAH'],
    [title],
    [`Dicetak: ${new Date().toLocaleString('id-ID')}`],
    [],
    headers,
    ...data,
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  ws['!cols'] = headers.map(() => ({ wch: 20 }))

  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31))
  XLSX.writeFile(wb, filename ?? `${title.replace(/\s+/g, '_')}_${Date.now()}.xlsx`)
}

export const printPage = () => {
  window.print()
}
