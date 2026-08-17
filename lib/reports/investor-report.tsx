import 'server-only'

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import type { InvestorReportFigures } from '@/lib/database.types'
import { formatNaira } from '@/lib/money'

/**
 * The monthly investor report (brief §21).
 *
 * Deliberately plain: investors are not accountants. There is no "Capital
 * Status" section, and the disclaimer makes clear that monthly profit is
 * provisional until the 12-month cycle closes.
 */
const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10, color: '#1f1529' },

  header: { borderBottomWidth: 3, borderBottomColor: '#4f2574', paddingBottom: 12, marginBottom: 18 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  brand: { fontSize: 22, fontWeight: 'bold', color: '#4f2574' },
  platform: { fontSize: 9, color: '#6b6478', marginTop: 3 },
  reportLabel: { fontSize: 11, fontWeight: 'bold', color: '#b58a2b', textAlign: 'right' },
  period: { fontSize: 9, color: '#6b6478', textAlign: 'right', marginTop: 3 },

  monthBanner: {
    backgroundColor: '#4f2574',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  monthTitle: { fontSize: 15, fontWeight: 'bold', color: '#ffffff' },
  monthMeta: { fontSize: 9, color: '#d9cdea', marginTop: 4 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#4f2574',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e3ee',
  },
  section: { marginBottom: 18 },

  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#efebf5',
  },
  lineLabel: { fontSize: 10, color: '#453d52' },
  lineValue: { fontSize: 10, fontWeight: 'bold' },

  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginTop: 4,
    borderTopWidth: 1.5,
    borderTopColor: '#4f2574',
  },
  totalLabel: { fontSize: 11, fontWeight: 'bold' },
  totalValue: { fontSize: 12, fontWeight: 'bold', color: '#4f2574' },

  resultBox: {
    borderRadius: 6,
    padding: 16,
    marginBottom: 18,
    alignItems: 'center',
  },
  resultProfit: { backgroundColor: '#eaf5ef', borderWidth: 1, borderColor: '#1baf7a' },
  resultLoss: { backgroundColor: '#fdeeed', borderWidth: 1, borderColor: '#c8352f' },
  resultLabel: { fontSize: 10, color: '#453d52' },
  resultAmount: { fontSize: 20, fontWeight: 'bold', marginTop: 6 },
  resultCaption: { fontSize: 9, color: '#6b6478', marginTop: 6, textAlign: 'center' },

  update: {
    backgroundColor: '#f5f1f9',
    borderLeftWidth: 3,
    borderLeftColor: '#b58a2b',
    padding: 12,
    fontSize: 9.5,
    lineHeight: 1.6,
    color: '#453d52',
  },

  disclaimer: {
    marginTop: 10,
    padding: 12,
    borderWidth: 0.5,
    borderColor: '#ded8e8',
    borderRadius: 4,
    fontSize: 8,
    lineHeight: 1.5,
    color: '#6b6478',
  },
  disclaimerTitle: { fontSize: 8, fontWeight: 'bold', color: '#453d52', marginBottom: 4 },

  footer: {
    position: 'absolute',
    bottom: 28,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#e7e3ee',
    paddingTop: 6,
    fontSize: 7.5,
    color: '#6b6478',
  },
})

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  )
}

export async function renderInvestorReportPdf({
  figures,
  managementUpdate,
  disclaimer,
  branding,
}: {
  figures: InvestorReportFigures
  managementUpdate: string | null
  disclaimer: string
  branding: { name: string; platform: string; address: string; email: string; phone: string }
}): Promise<Buffer> {
  const isProfit = figures.result === 'profit'
  const monthResult = Math.abs(figures.estimated_net_profit)

  return renderToBuffer(
    <Document
      title={`${branding.name} Monthly Investment Report — ${figures.reporting_month}`}
      author={branding.platform}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View>
              <Text style={styles.brand}>{branding.name}</Text>
              <Text style={styles.platform}>{branding.platform}</Text>
            </View>
            <View>
              <Text style={styles.reportLabel}>MONTHLY INVESTMENT REPORT</Text>
              <Text style={styles.period}>{figures.reporting_month}</Text>
            </View>
          </View>
        </View>

        <View style={styles.monthBanner}>
          <Text style={styles.monthTitle}>{figures.reporting_month}</Text>
          <Text style={styles.monthMeta}>
            {figures.investment_cycle} · Month {figures.month_number} of {figures.duration_months}
          </Text>
        </View>

        {/* --- Business performance ------------------------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business performance this month</Text>
          <Line label="Purchases made this month" value={formatNaira(figures.purchases_made)} />
          <Line label="Goods received this month" value={formatNaira(figures.goods_received)} />
          <Line label="Sales to business this month" value={formatNaira(figures.sales_to_business)} />
          <Line label="Repayments received this month" value={formatNaira(figures.repayments_received)} />
          <Line label="Estimated net profit this month" value={formatNaira(figures.estimated_net_profit)} />
          <Line
            label="Cumulative estimated net profit"
            value={formatNaira(figures.cumulative_net_profit)}
          />
        </View>

        {/* --- Financial position --------------------------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial position</Text>
          <Line label="Cash at hand" value={formatNaira(figures.cash_at_hand)} />
          <Line label="Cash in stock (goods paid for, not yet received)" value={formatNaira(figures.cash_in_stock)} />
          <Line label="Inventory value (goods in our warehouse)" value={formatNaira(figures.inventory_value)} />
          <Line label="Outstanding receivables (owed to us)" value={formatNaira(figures.outstanding_receivables)} />
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Total business assets</Text>
            <Text style={styles.totalValue}>{formatNaira(figures.total_business_assets)}</Text>
          </View>
        </View>

        {/* --- The month's result --------------------------------------- */}
        <View style={[styles.resultBox, isProfit ? styles.resultProfit : styles.resultLoss]}>
          <Text style={styles.resultLabel}>
            {isProfit ? 'Profit for the month' : 'Loss for the month'}
          </Text>
          <Text style={[styles.resultAmount, { color: isProfit ? '#0f7a52' : '#c8352f' }]}>
            {formatNaira(monthResult)}
          </Text>
          <Text style={styles.resultCaption}>
            {isProfit
              ? 'The business earned more than it spent this month.'
              : 'The business spent more than it earned this month.'}
          </Text>
        </View>

        {/* --- Management update ---------------------------------------- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Management update</Text>
          <Text style={styles.update}>
            {managementUpdate?.trim() ||
              'No management update has been provided for this reporting month.'}
          </Text>
        </View>

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTitle}>Important note</Text>
          <Text>{disclaimer}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {branding.platform}
            {branding.address ? ` · ${branding.address}` : ''}
            {branding.email ? ` · ${branding.email}` : ''}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  )
}
