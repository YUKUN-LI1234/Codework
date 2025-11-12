'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import AuthBar from './components/AuthBar'

import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'

type DailyRow = {
  product_id: string
  product_name: string
  day_index: 1 | 2 | 3 | null
  day: string
  opening_inventory_day1: number | null
  procurement_qty: number | null
  procurement_price: number | null
  sales_qty: number | null
  sales_price: number | null
}

type ProductOption = { id: string; name: string }

export default function DashboardPage() {
  const [products, setProducts] = useState<ProductOption[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [rows, setRows] = useState<DailyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 载入产品（去重 + 排除空）
  useEffect(() => {
    const loadProducts = async () => {
      const { data, error } = await supabase
        .from('daily_metrics')
        .select('product_id, product_name')
        .neq('product_id', '')
        .order('product_id', { ascending: true })

      if (error) { setError(error.message); return }

      const seen = new Set<string>()
      const options: ProductOption[] = []
      for (const r of data || []) {
        const id = String(r.product_id ?? '').trim()
        if (!id || seen.has(id)) continue
        seen.add(id)
        options.push({ id, name: r.product_name || id })
      }
      setProducts(options)
      setSelected((prev) => (prev.length ? prev : options.slice(0, 2).map(o => o.id)))
    }
    loadProducts()
  }, [])

  // 载入选中产品的明细
  useEffect(() => {
    const loadRows = async () => {
      if (!selected.length) { setRows([]); return }
      setLoading(true)
      setError(null)
      const ids = selected.map((s) => s.trim())

      const { data, error } = await supabase
        .from('daily_metrics')
        .select('product_id, product_name, day_index, day, opening_inventory_day1, procurement_qty, procurement_price, sales_qty, sales_price')
        .in('product_id', ids)
        .order('day_index', { ascending: true })    
        .order('day', { ascending: true })

      setLoading(false)
      if (error) { setError(error.message); return }
      setRows((data || []) as DailyRow[])
    }
    loadRows()
  }, [selected])

  // 组装图表：X=Day1~3
  const chartData = useMemo(() => {
    if (!rows.length) return []
    const label = (d: number) => `Day ${d}`

    // 按产品分组
    const byProd: Record<string, DailyRow[]> = {}
    for (const r of rows) {
      const pid = String(r.product_id || '').trim()
      if (!pid) continue
      ;(byProd[pid] ||= []).push(r)
    }

    // 构建 Day1~3 的横轴骨架
    const byLabel: Record<string, any> = { 'Day 1': { label: 'Day 1' }, 'Day 2': { label: 'Day 2' }, 'Day 3': { label: 'Day 3' } }

    Object.entries(byProd).forEach(([pid, list]) => {
      // 确保 1->2->3
      const sorted = [...list].sort((a, b) => (a.day_index ?? 999) - (b.day_index ?? 999))
      const first = sorted.find((r) => r.opening_inventory_day1 !== null)
      let inventory = Number(first?.opening_inventory_day1 ?? 0)

      for (const r of sorted) {
        const di = (r.day_index ?? 0) as 1 | 2 | 3
        if (!(di === 1 || di === 2 || di === 3)) continue
        const key = label(di)

        const pq = Number(r.procurement_qty || 0)
        const pp = Number(r.procurement_price || 0)
        const sq = Number(r.sales_qty || 0)
        const sp = Number(r.sales_price || 0)

        if (di === 1 && first?.opening_inventory_day1 != null) {
          inventory = Number(first.opening_inventory_day1) // 明确第一天初始库存
        }
        inventory = inventory + pq - sq

        byLabel[key][`${pid}__inventory`] = Math.max(0, Math.round(inventory))
        byLabel[key][`${pid}__procAmt`]   = Number((pq * pp).toFixed(2))
        byLabel[key][`${pid}__salesAmt`]  = Number((sq * sp).toFixed(2))
      }
    })

    return [byLabel['Day 1'], byLabel['Day 2'], byLabel['Day 3']]
  }, [rows])

  const legendMap = useMemo(() => {
    const map: Record<string, { pid: string; label: string; metric: 'inventory'|'procAmt'|'salesAmt' }> = {}
    const nameById = new Map(products.map(p => [p.id, p.name]))
    for (const pid of selected) {
      const name = nameById.get(pid) || pid
      map[`${pid}__inventory`] = { pid, label: `${name} • Inventory`, metric: 'inventory' }
      map[`${pid}__procAmt`]   = { pid, label: `${name} • Procurement Amount`, metric: 'procAmt' }
      map[`${pid}__salesAmt`]  = { pid, label: `${name} • Sales Amount`, metric: 'salesAmt' }
    }
    return map
  }, [selected, products])

  const colorFor = (pid: string) => {
    let hash = 0
    for (let i = 0; i < pid.length; i++) hash = (hash * 31 + pid.charCodeAt(i)) >>> 0
    const hue = hash % 360
    return `hsl(${hue} 70% 45%)`
  }
  const dashFor = (metric: string) => metric === 'inventory' ? '0' : metric === 'procAmt' ? '6 4' : '2 6'

  return (
    <div className="min-h-screen p-6 md:p-10 bg-gray-50">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Dashboard</h1>
            <p className="text-gray-600 text-sm">按 Day 1 → Day 2 → Day 3 展示：库存（左 Y 轴）、采购金额/销售金额（右 Y 轴）</p>
          </div>
          <AuthBar />
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ProductPicker products={products} selected={selected} onChange={setSelected} />
          <Link href="/import" className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700">导入数据</Link>
          <button onClick={() => setSelected(s => [...s])} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">刷新</button>
        </div>

        <section className="bg-white rounded-2xl shadow p-4 md:p-6">
          {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {loading ? (
            <div className="py-24 text-center text-gray-500">Loading…</div>
          ) : chartData.length === 0 || selected.length === 0 ? (
            <div className="py-24 text-center text-gray-500">暂无数据。请先选择产品或前往「导入数据」上传 Excel。</div>
          ) : (
            <div className="h-[420px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      const meta = legendMap[name]
                      if (!meta) return [value, name]
                      if (meta.metric === 'inventory') return [value, meta.label]
                      return [Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }), meta.label]
                    }}
                  />
                  <Legend
                    payload={Object.keys(legendMap).map((k) => ({
                      id: k, type: 'line', value: legendMap[k].label, color: colorFor(legendMap[k].pid),
                    }))}
                  />
                  {selected.map((pid) => (
                    <g key={pid}>
                      <Line yAxisId="left"  type="monotone" dataKey={`${pid}__inventory`} stroke={colorFor(pid)} strokeDasharray={dashFor('inventory')} dot={false} connectNulls name={`${pid}__inventory`} />
                      <Line yAxisId="right" type="monotone" dataKey={`${pid}__procAmt`}   stroke={colorFor(pid)} strokeDasharray={dashFor('procAmt')}   dot={false} connectNulls name={`${pid}__procAmt`} />
                      <Line yAxisId="right" type="monotone" dataKey={`${pid}__salesAmt`}  stroke={colorFor(pid)} strokeDasharray={dashFor('salesAmt')}  dot={false} connectNulls name={`${pid}__salesAmt`} />
                    </g>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ProductPicker({
  products, selected, onChange,
}: { products: ProductOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else onChange([...selected, id])
  }
  return (
    <div className="bg-white rounded-xl shadow p-3 md:p-4">
      <div className="text-sm font-medium mb-2">选择产品</div>
      <div className="flex flex-wrap gap-2 max-w-[720px]">
        {products.map((p) => (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className={
              'px-3 py-1.5 rounded-full border text-sm transition ' +
              (selected.includes(p.id)
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400')
            }
            title={p.name}
          >
            {p.name}
          </button>
        ))}
        {!products.length && <span className="text-gray-500">暂无产品</span>}
      </div>
    </div>
  )
}
