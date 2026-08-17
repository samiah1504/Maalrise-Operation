import 'server-only'

import ExcelJS from 'exceljs'
import type { ReportSpec } from './registry'
import { toNumber } from '@/lib/money'

const MONEY_FORMAT = '#,##0.00'
const NUMBER_FORMAT = '#,##0.###'
const DATE_FORMAT = 'dd mmm yyyy'

/** Renders any report spec to a styled Excel workbook. */
export async function renderExcel(
  spec: ReportSpec,
  branding: { name: string; platform: string },
  cycleName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = branding.name
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(spec.title.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  // --- Header ---------------------------------------------------------------
  const lastColumn = spec.columns.length
  sheet.mergeCells(1, 1, 1, lastColumn)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = `${branding.name} — ${spec.title}`
  titleCell.font = { size: 14, bold: true, color: { argb: 'FF0F4C37' } }

  sheet.mergeCells(2, 1, 2, lastColumn)
  sheet.getCell(2, 1).value = `${branding.platform} · ${cycleName}`
  sheet.getCell(2, 1).font = { size: 10, color: { argb: 'FF5B6B64' } }

  sheet.mergeCells(3, 1, 3, lastColumn)
  sheet.getCell(3, 1).value = `Generated ${new Date().toLocaleString('en-NG')}${
    spec.subtitle ? ` · ${spec.subtitle}` : ''
  }`
  sheet.getCell(3, 1).font = { size: 9, italic: true, color: { argb: 'FF5B6B64' } }

  // --- Column headers -------------------------------------------------------
  const headerRow = sheet.getRow(5)
  spec.columns.forEach((column, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = column.label
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C37' } }
    cell.alignment = {
      vertical: 'middle',
      horizontal: column.type && column.type !== 'text' && column.type !== 'date' ? 'right' : 'left',
    }
    sheet.getColumn(i + 1).width = column.width ?? (column.type === 'money' ? 18 : 14)
  })
  headerRow.height = 20

  // --- Data -----------------------------------------------------------------
  spec.rows.forEach((row, rowIndex) => {
    const sheetRow = sheet.getRow(6 + rowIndex)

    spec.columns.forEach((column, i) => {
      const cell = sheetRow.getCell(i + 1)
      const raw = row[column.key]

      switch (column.type) {
        case 'money':
          cell.value = toNumber(raw as string)
          cell.numFmt = MONEY_FORMAT
          break
        case 'number':
          cell.value = raw === null || raw === undefined ? null : toNumber(raw as string)
          cell.numFmt = NUMBER_FORMAT
          break
        case 'percent':
          cell.value = toNumber(raw as string) / 100
          cell.numFmt = '0.0%'
          break
        case 'date':
          cell.value = raw ? new Date(String(raw)) : null
          cell.numFmt = DATE_FORMAT
          break
        default:
          cell.value = raw === null || raw === undefined ? '' : String(raw)
      }
    })

    if (rowIndex % 2 === 1) {
      sheetRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F5EF' } }
      })
    }
  })

  // --- Totals ---------------------------------------------------------------
  if (spec.totals?.length && spec.rows.length) {
    const totalRow = sheet.getRow(6 + spec.rows.length)
    totalRow.getCell(1).value = 'Total'
    totalRow.getCell(1).font = { bold: true }

    spec.columns.forEach((column, i) => {
      if (!spec.totals?.includes(column.key)) return
      const cell = totalRow.getCell(i + 1)
      cell.value = spec.rows.reduce((sum, row) => sum + toNumber(row[column.key] as string), 0)
      cell.numFmt = column.type === 'number' ? NUMBER_FORMAT : MONEY_FORMAT
      cell.font = { bold: true }
    })

    totalRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin', color: { argb: 'FF0F4C37' } } }
    })
  }

  if (spec.note) {
    const noteRow = sheet.getRow(8 + spec.rows.length)
    sheet.mergeCells(noteRow.number, 1, noteRow.number, lastColumn)
    noteRow.getCell(1).value = spec.note
    noteRow.getCell(1).font = { size: 9, italic: true, color: { argb: 'FF5B6B64' } }
    noteRow.getCell(1).alignment = { wrapText: true, vertical: 'top' }
    noteRow.height = 30
  }

  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: lastColumn },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
