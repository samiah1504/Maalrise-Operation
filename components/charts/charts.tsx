'use client'

import { useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { AXIS, BRAND, POLARITY, SERIES, type Mode } from './theme'
import { formatNaira, formatNairaCompact, toNumber } from '@/lib/money'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'

/** Dark mode is a selected palette, not an automatic flip. */
function useMode(): Mode {
  const [mode, setMode] = useState<Mode>('light')

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const read = () =>
      setMode(
        document.documentElement.classList.contains('dark') || query.matches ? 'dark' : 'light',
      )
    read()
    query.addEventListener('change', read)
    return () => query.removeEventListener('change', read)
  }, [])

  return mode
}

function ChartFrame({
  title,
  description,
  children,
  hasData,
  emptyMessage,
}: {
  title: string
  description?: string
  children: React.ReactNode
  hasData: boolean
  emptyMessage: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="pt-2">
        {hasData ? (
          <div className="h-56 w-full sm:h-64">{children}</div>
        ) : (
          <EmptyState title={emptyMessage} className="border-0 py-10" />
        )}
      </CardContent>
    </Card>
  )
}

/** Recharts passes its tooltip payload as a readonly array of loose entries. */
type TooltipPayload = {
  active?: boolean
  payload?: readonly { value?: unknown; name?: unknown; payload?: unknown }[]
  label?: unknown
}

function MoneyTooltip({ active, payload, label }: TooltipPayload) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{String(label ?? '')}</p>
      {payload.map((entry, i) => (
        <p key={i} className="tabular text-muted-foreground">
          {String(entry.name ?? '')}:{' '}
          <span className="font-medium text-foreground">
            {formatNaira(entry.value as string | number)}
          </span>
        </p>
      ))}
    </div>
  )
}

export interface MonthlyPoint {
  period_label: string
  [key: string]: string | number
}

/**
 * One measure over the months of the cycle. A single series needs no legend —
 * the title names it.
 */
export function MonthlyBarChart({
  title,
  description,
  data,
  dataKey,
  seriesName,
  accent = 'primary',
}: {
  title: string
  description?: string
  data: MonthlyPoint[]
  dataKey: string
  seriesName: string
  accent?: 'primary' | 'gold'
}) {
  const mode = useMode()
  const axis = AXIS[mode]
  const fill = accent === 'gold' ? BRAND[mode].gold : BRAND[mode].primary
  const hasData = data.some((d) => toNumber(d[dataKey] as string) !== 0)

  return (
    <ChartFrame
      title={title}
      description={description}
      hasData={hasData}
      emptyMessage="No activity recorded yet for this cycle."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={axis.grid} />
          <XAxis
            dataKey="period_label"
            tick={{ fontSize: 11, fill: axis.text }}
            tickLine={false}
            axisLine={{ stroke: axis.grid }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: axis.text }}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(v) => formatNairaCompact(v)}
          />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: axis.grid, fillOpacity: 0.4 }} />
          {/* 4px rounded data-end, anchored to the baseline */}
          <Bar dataKey={dataKey} name={seriesName} fill={fill} radius={[4, 4, 0, 0]} maxBarSize={38} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/**
 * Net profit is a polarity: months in profit and months at a loss read as two
 * poles of one measure, not as two categories.
 */
export function NetProfitChart({ data }: { data: MonthlyPoint[] }) {
  const mode = useMode()
  const axis = AXIS[mode]
  const polarity = POLARITY[mode]
  const hasData = data.some((d) => toNumber(d.net_profit as string) !== 0)

  return (
    <ChartFrame
      title="Monthly net profit"
      description="Provisional. Final profit is determined at cycle close."
      hasData={hasData}
      emptyMessage="No profit or loss recorded yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={axis.grid} />
          <XAxis
            dataKey="period_label"
            tick={{ fontSize: 11, fill: axis.text }}
            tickLine={false}
            axisLine={{ stroke: axis.grid }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: axis.text }}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(v) => formatNairaCompact(v)}
          />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: axis.grid, fillOpacity: 0.4 }} />
          <Bar dataKey="net_profit" name="Net profit" radius={[4, 4, 0, 0]} maxBarSize={38}>
            {data.map((point, i) => (
              <Cell
                key={i}
                fill={toNumber(point.net_profit as string) < 0 ? polarity.negative : polarity.positive}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/** Repayments over time — a flow, so a line reads better than bars. */
export function RepaymentTrendChart({ data }: { data: MonthlyPoint[] }) {
  const mode = useMode()
  const axis = AXIS[mode]
  const hasData = data.some((d) => toNumber(d.repayments_received as string) !== 0)

  return (
    <ChartFrame
      title="Monthly repayments received"
      hasData={hasData}
      emptyMessage="No repayments received yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={axis.grid} />
          <XAxis
            dataKey="period_label"
            tick={{ fontSize: 11, fill: axis.text }}
            tickLine={false}
            axisLine={{ stroke: axis.grid }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: axis.text }}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(v) => formatNairaCompact(v)}
          />
          <Tooltip content={<MoneyTooltip />} />
          <Line
            type="monotone"
            dataKey="repayments_received"
            name="Repayments"
            stroke={BRAND[mode].primary}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: mode === 'dark' ? '#15101f' : '#ffffff' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/**
 * Where every naira sits right now. A part-to-whole of four buckets, so a
 * single stacked bar with a 2px surface gap between segments — plus a value
 * legend, because three of the light-mode slots sit below 3:1 on white.
 */
export function AssetDistribution({
  cashAtHand,
  cashInStock,
  inventory,
  receivables,
  otherAssets,
}: {
  cashAtHand: number
  cashInStock: number
  inventory: number
  receivables: number
  otherAssets: number
}) {
  const mode = useMode()
  const palette = SERIES[mode]

  const segments = [
    { label: 'Cash at Hand', value: cashAtHand, color: palette[0] },
    { label: 'Cash in Stock', value: cashInStock, color: palette[1] },
    { label: 'Inventory', value: inventory, color: palette[2] },
    { label: 'Receivables', value: receivables, color: palette[3] },
    ...(otherAssets > 0
      ? [{ label: 'Other assets', value: otherAssets, color: BRAND[mode].muted }]
      : []),
  ]

  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Asset distribution</CardTitle>
        <CardDescription className="text-xs">
          Where every naira belonging to MaalRise is currently held. Nothing is counted twice.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total <= 0 ? (
          <EmptyState title="No assets recorded for this cycle yet." className="border-0 py-8" />
        ) : (
          <>
            <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-md" role="img"
                 aria-label={segments.map((s) => `${s.label} ${formatNaira(s.value)}`).join(', ')}>
              {segments
                .filter((s) => s.value > 0)
                .map((s) => (
                  <div
                    key={s.label}
                    style={{
                      width: `${(s.value / total) * 100}%`,
                      backgroundColor: s.color,
                    }}
                    title={`${s.label}: ${formatNaira(s.value)}`}
                  />
                ))}
            </div>

            {/* Identity is never colour alone: every segment is named with its value */}
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {segments.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: s.color }}
                      aria-hidden
                    />
                    <span className="truncate text-muted-foreground">{s.label}</span>
                  </span>
                  <span className="tabular shrink-0 font-medium">
                    {formatNaira(s.value)}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '0%'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export interface BatchPoint {
  batch_number: string
  gross_profit: number
  return_on_capital_pct: number
  capital_cycle_days: number | null
}

/** Which batches turned capital around fastest and most profitably. */
export function BatchPerformanceChart({ data }: { data: BatchPoint[] }) {
  const mode = useMode()
  const axis = AXIS[mode]
  const hasData = data.length > 0

  return (
    <ChartFrame
      title="Procurement batch performance"
      description="Gross profit by batch. Hover a bar for the return on capital."
      hasData={hasData}
      emptyMessage="No completed batches to compare yet."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke={axis.grid} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: axis.text }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatNairaCompact(v)}
          />
          <YAxis
            type="category"
            dataKey="batch_number"
            tick={{ fontSize: 11, fill: axis.text }}
            tickLine={false}
            axisLine={false}
            width={116}
          />
          <Tooltip
            cursor={{ fill: axis.grid, fillOpacity: 0.4 }}
            content={(props) => {
              const { active, payload } = props as TooltipPayload
              if (!active || !payload?.length) return null
              const row = payload[0].payload as BatchPoint
              return (
                <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="mb-1 font-medium">{row.batch_number}</p>
                  <p className="tabular text-muted-foreground">
                    Gross profit:{' '}
                    <span className="font-medium text-foreground">
                      {formatNaira(row.gross_profit)}
                    </span>
                  </p>
                  <p className="tabular text-muted-foreground">
                    Return on capital:{' '}
                    <span className="font-medium text-foreground">
                      {row.return_on_capital_pct.toFixed(1)}%
                    </span>
                  </p>
                  {row.capital_cycle_days !== null ? (
                    <p className="tabular text-muted-foreground">
                      Capital cycle:{' '}
                      <span className="font-medium text-foreground">
                        {row.capital_cycle_days} days
                      </span>
                    </p>
                  ) : null}
                </div>
              )
            }}
          />
          <Bar
            dataKey="gross_profit"
            name="Gross profit"
            fill={BRAND[mode].gold}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
