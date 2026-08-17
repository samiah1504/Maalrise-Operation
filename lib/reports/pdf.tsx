import 'server-only'

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import type { ReportSpec, ColumnType } from './registry'
import { formatNaira, formatNumber, toNumber } from '@/lib/money'
import { formatDate } from '@/lib/dates'

/** MaalRise report styling: royal purple, gold accent, soft off-white surfaces. */
const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 32, fontSize: 8.5, color: '#1f1529' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: '#4f2574',
    paddingBottom: 8,
    marginBottom: 14,
  },
  brand: { fontSize: 16, fontWeight: 'bold', color: '#4f2574' },
  platform: { fontSize: 8, color: '#6b6478', marginTop: 2 },
  reportTitle: { fontSize: 12, fontWeight: 'bold', textAlign: 'right' },
  meta: { fontSize: 7.5, color: '#6b6478', textAlign: 'right', marginTop: 2 },

  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  summaryCard: {
    flexGrow: 1,
    minWidth: 110,
    backgroundColor: '#f5f1f9',
    borderRadius: 4,
    padding: 8,
  },
  summaryLabel: { fontSize: 7, color: '#6b6478', textTransform: 'uppercase' },
  summaryValue: { fontSize: 11, fontWeight: 'bold', marginTop: 2 },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#4f2574',
    paddingVertical: 5,
    paddingHorizontal: 3,
  },
  headerCell: { color: '#ffffff', fontSize: 7.5, fontWeight: 'bold' },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e7e3ee',
  },
  rowAlt: { backgroundColor: '#faf8fc' },
  cell: { fontSize: 7.5 },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 3,
    borderTopWidth: 1.5,
    borderTopColor: '#4f2574',
    marginTop: 2,
  },
  totalCell: { fontSize: 8, fontWeight: 'bold' },

  note: {
    marginTop: 14,
    padding: 8,
    backgroundColor: '#f5f1f9',
    borderLeftWidth: 3,
    borderLeftColor: '#b58a2b',
    fontSize: 7.5,
    color: '#453d52',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#e7e3ee',
    paddingTop: 6,
    fontSize: 7,
    color: '#6b6478',
  },
})

function formatValue(value: unknown, type: ColumnType = 'text'): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (type) {
    case 'money':
      return formatNaira(value as string)
    case 'number':
      return formatNumber(value as string, Number.isInteger(toNumber(value as string)) ? 0 : 2)
    case 'percent':
      return `${toNumber(value as string).toFixed(1)}%`
    case 'date':
      return formatDate(String(value))
    default:
      return String(value)
  }
}

function align(type: ColumnType = 'text'): 'left' | 'right' {
  return type === 'money' || type === 'number' || type === 'percent' ? 'right' : 'left'
}

/** Relative column widths, so wide text columns get the space they need. */
function widths(spec: ReportSpec): number[] {
  const raw = spec.columns.map((c) => c.width ?? (c.type === 'money' ? 16 : 12))
  const total = raw.reduce((a, b) => a + b, 0)
  return raw.map((w) => (w / total) * 100)
}

export async function renderReportPdf(
  spec: ReportSpec,
  branding: { name: string; platform: string; address: string },
  cycleName: string,
): Promise<Buffer> {
  const columnWidths = widths(spec)
  const landscape = spec.columns.length > 6

  const totals = spec.totals?.length
    ? spec.columns.map((column) =>
        spec.totals?.includes(column.key)
          ? spec.rows.reduce((sum, row) => sum + toNumber(row[column.key] as string), 0)
          : null,
      )
    : null

  return renderToBuffer(
    <Document title={`${branding.name} — ${spec.title}`} author={branding.platform}>
      <Page size="A4" orientation={landscape ? 'landscape' : 'portrait'} style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>{branding.name}</Text>
            <Text style={styles.platform}>{branding.platform}</Text>
          </View>
          <View>
            <Text style={styles.reportTitle}>{spec.title}</Text>
            <Text style={styles.meta}>{cycleName}</Text>
            {spec.subtitle ? <Text style={styles.meta}>{spec.subtitle}</Text> : null}
            <Text style={styles.meta}>
              Generated {new Date().toLocaleDateString('en-NG', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
          </View>
        </View>

        {spec.summary?.length ? (
          <View style={styles.summaryRow}>
            {spec.summary.map((item) => (
              <View key={item.label} style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{item.label}</Text>
                <Text style={styles.summaryValue}>{formatValue(item.value, item.type)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.tableHeader} fixed>
          {spec.columns.map((column, i) => (
            <Text
              key={column.key}
              style={[
                styles.headerCell,
                { width: `${columnWidths[i]}%`, textAlign: align(column.type) },
              ]}
            >
              {column.label}
            </Text>
          ))}
        </View>

        {spec.rows.length === 0 ? (
          <View style={styles.row}>
            <Text style={styles.cell}>No records for this report.</Text>
          </View>
        ) : (
          spec.rows.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={rowIndex % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row}
              wrap={false}
            >
              {spec.columns.map((column, i) => (
                <Text
                  key={column.key}
                  style={[
                    styles.cell,
                    { width: `${columnWidths[i]}%`, textAlign: align(column.type) },
                  ]}
                >
                  {formatValue(row[column.key], column.type)}
                </Text>
              ))}
            </View>
          ))
        )}

        {totals ? (
          <View style={styles.totalRow}>
            {spec.columns.map((column, i) => (
              <Text
                key={column.key}
                style={[
                  styles.totalCell,
                  { width: `${columnWidths[i]}%`, textAlign: align(column.type) },
                ]}
              >
                {i === 0
                  ? 'Total'
                  : totals[i] === null
                    ? ''
                    : formatValue(totals[i], column.type === 'number' ? 'number' : 'money')}
              </Text>
            ))}
          </View>
        ) : null}

        {spec.note ? <Text style={styles.note}>{spec.note}</Text> : null}

        <View style={styles.footer} fixed>
          <Text>
            {branding.name} · {branding.platform}
            {branding.address ? ` · ${branding.address}` : ''}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  )
}
