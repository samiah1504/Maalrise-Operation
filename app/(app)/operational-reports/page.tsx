import Link from 'next/link'
import { FileDown } from 'lucide-react'
import { requireUser, requireCycle } from '@/lib/auth'
import { PageHeader } from '@/components/ui/page'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Operational Reports' }

/** Brief §20 — every operational report, exportable to PDF and Excel. */
const GROUPS = [
  {
    title: 'Procurement and supply',
    reports: [
      { slug: 'procurement', label: 'Procurement report', description: 'Every batch with spend, payments, direct costs and value received.' },
      { slug: 'supplier-payments', label: 'Supplier payment report', description: 'Payments by batch, with the rate captured on each one.' },
      { slug: 'shipments', label: 'Shipment report', description: 'Containers, bills of lading, expected against actual arrival.' },
      { slug: 'supplier-performance', label: 'Supplier performance report', description: 'Lead times, capital cycle days and return on capital by supplier.' },
    ],
  },
  {
    title: 'Inventory',
    reports: [
      { slug: 'inventory-valuation', label: 'Inventory valuation report', description: 'Stock on hand at landed cost, with stock age.' },
      { slug: 'stock-movement', label: 'Stock movement report', description: 'Every receipt, reservation, sale and write-off with its reason.' },
      { slug: 'product-profitability', label: 'Product profitability report', description: 'Units sold, cost, revenue and margin by product.' },
    ],
  },
  {
    title: 'Sales and receivables',
    reports: [
      { slug: 'murabaha-sales', label: 'Murābaḥah sales report', description: 'Disclosed cost, profit and selling price for every contract.' },
      { slug: 'receivables', label: 'Receivables report', description: 'What the business owes MaalRise and when it falls due.' },
      { slug: 'overdue', label: 'Overdue report', description: 'Contracts past their due date, with days overdue.' },
      { slug: 'repayments', label: 'Repayment report', description: 'Every receipt, including reversals.' },
    ],
  },
  {
    title: 'Capital and cost',
    reports: [
      { slug: 'batch-profitability', label: 'Batch profitability report', description: 'Profit and return on capital by procurement batch.' },
      { slug: 'capital-recycling', label: 'Capital recycling report', description: 'How long capital takes to travel from cash back to cash.' },
      { slug: 'expenses', label: 'Expense report', description: 'Operating and capitalised costs, separated so nothing is double counted.' },
    ],
  },
  {
    title: 'Investors and cycle',
    reports: [
      { slug: 'investor-capital', label: 'Investor capital report', description: 'Units, amounts and confirmed capital for the cycle.' },
      { slug: 'investment-cycle', label: 'Investment cycle report', description: 'The cycle at a glance, from capital raised to provisional profit.' },
    ],
  },
]

export default async function OperationalReportsPage() {
  await requireUser()
  const cycle = await requireCycle()

  return (
    <>
      <PageHeader
        title="Operational reports"
        description={`${cycle.name} · Every report exports to PDF and Excel. Auditors can export without being able to change anything.`}
      />

      <div className="space-y-8">
        {GROUPS.map((group) => (
          <section key={group.title} className="space-y-3">
            <h2 className="text-base font-semibold">{group.title}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {group.reports.map((report) => (
                <Card key={report.slug}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-6">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{report.label}</p>
                      <p className="text-sm text-muted-foreground">{report.description}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/api/reports/${report.slug}?cycle=${cycle.investment_cycle_id}&format=pdf`}
                        >
                          <FileDown className="h-4 w-4" />
                          PDF
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={`/api/reports/${report.slug}?cycle=${cycle.investment_cycle_id}&format=xlsx`}
                        >
                          <FileDown className="h-4 w-4" />
                          Excel
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
