'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'

type OutRow = {
  product_id: string
  product_name: string
  day: string        // YYYY-MM-DD（自动：Day3=今天，Day2=今天-1，Day1=今天-2）
  day_index: 1 | 2 | 3
  opening_inventory_day1: number | null
  procurement_qty: number | null
  procurement_price: number | null
  sales_qty: number | null
  sales_price: number | null
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const num = (v: any) => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const toYMD = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const onImport = async () => {
    if (!file) return setStatus('请先选择 Excel 文件')
    setBusy(true)
    setStatus('解析中…')

    const ab = await file.arrayBuffer()
    const wb = XLSX.read(ab)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null })
    if (!rows.length) {
      setBusy(false)
      return setStatus('Excel 内容为空')
    }

    // Procurement Qty (Day 1/2/3), Procurement Price (Day 1/2/3),
    // Sales Qty (Day 1/2/3), Sales Price (Day 1/2/3)

    // 只识别 Day1~3
    const DAYS = [1, 2, 3] as const
    const today = new Date()
    const dayForIndex = (idx: 1 | 2 | 3) => {
      const map = { 1: -2, 2: -1, 3: 0 } as const
      const d = new Date(today)
      d.setDate(d.getDate() + map[idx])
      return toYMD(d)
    }

    const lc = (s: any) => String(s ?? '').trim().toLowerCase()
    const get = (obj: any, aliases: string[]) => {
      const keys = Object.keys(obj)
      for (const a of aliases) {
        const hit = keys.find(k => lc(k) === lc(a))
        if (hit) return obj[hit]
      }
      for (const a of aliases) {
        const hit = keys.find(k => lc(k).includes(lc(a)))
        if (hit) return obj[hit]
      }
      return null
    }

    const out: OutRow[] = []

    for (const r of rows) {
      const product_id = String(get(r, ['id', 'product id', 'product_id', 'sku', '货号', '编码']) ?? '').trim()
      const product_name = String(get(r, ['product name', 'product_name', '产品名称', '商品名称']) ?? '').trim()
      const openingInv = num(get(r, ['opening inventory on day 1', 'opening inventory', '开库存', '期初库存']))

      if (!product_id || !product_name) continue

      for (const d of DAYS) {
        const pq = num(get(r, [`procurement qty (day ${d})`, `procurement quantity (day ${d})`, `采购 数量 (day ${d})`]))
        const pp = num(get(r, [`procurement price (day ${d})`, `采购 单价 (day ${d})`]))
        const sq = num(get(r, [`sales qty (day ${d})`, `sales quantity (day ${d})`, `销售 数量 (day ${d})`]))
        const sp = num(get(r, [`sales price (day ${d})`, `销售 单价 (day ${d})`]))

        out.push({
          product_id,
          product_name,
          day_index: d,
          day: dayForIndex(d),
          opening_inventory_day1: d === 1 ? openingInv : null,
          procurement_qty: pq,
          procurement_price: pp,
          sales_qty: sq,
          sales_price: sp,
        })
      }
    }

    if (!out.length) {
      setBusy(false)
      return setStatus('未识别到可导入的数据，请检查列名是否包含 Day 1/2/3 的 Qty/Price。')
    }

    // 登录校验
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      setBusy(false)
      return setStatus('请先登录（右上角 登录），再导入。')
    }

    // 分批插入
    setStatus(`准备插入 ${out.length} 行…`)
    let inserted = 0
    const CHUNK = 500
    for (let i = 0; i < out.length; i += CHUNK) {
      const batch = out.slice(i, i + CHUNK)
      const { error } = await supabase.from('daily_metrics').insert(batch)
      if (error) {
        setBusy(false)
        return setStatus(`第 ${i + 1} 行起批次失败：${error.message}`)
      }
      inserted += batch.length
      setStatus(`已插入 ${inserted}/${out.length} 行…`)
    }

    setBusy(false)
    setStatus(`导入成功：共插入 ${inserted} 行。可返回 Dashboard 查看 Day1~3 图表。`)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-3xl bg-white rounded-2xl shadow p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Excel 导入（Day1~3）</h1>
          <Link href="." className="rounded bg-gray-900 px-3 py-1.5 text-white hover:opacity-90">
            返回 Dashboard
          </Link>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Excel 文件</label>
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm file:mr-4 file:rounded file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-white"
          />
          <p className="text-xs text-gray-500 mt-2">
            列头示例：ID, Product Name, Opening Inventory, Procurement Qty/Price (Day 1/2/3), Sales Qty/Price (Day 1/2/3)
          </p>
        </div>

        <button
          onClick={onImport}
          disabled={busy}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? '导入中…' : '开始导入'}
        </button>

        {status && (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            {status}
          </div>
        )}
      </div>
    </div>
  )
}
