"use client"

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────
export interface TrendPoint { date: string; count: number }
export interface CourseStat  { title: string; total: number; completed: number; rate: number }
export interface ProgressDist { name: string; value: number; color: string }

// ── Tooltip styles ─────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-slate-500 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? p.fill }} className="font-semibold">
          {p.name ? `${p.name}: ` : ""}{p.value}
          {p.name === "Rate" ? "%" : ""}
        </p>
      ))}
    </div>
  )
}

// ── Enrollment Trend ───────────────────────────────────────────────
export function EnrollmentTrendChart({ data }: { data: TrendPoint[] }) {
  const total   = data.reduce((s, d) => s + d.count, 0)
  const half    = Math.floor(data.length / 2)
  const firstH  = data.slice(0, half).reduce((s, d) => s + d.count, 0)
  const secondH = data.slice(half).reduce((s, d) => s + d.count, 0)
  const trend   = secondH - firstH

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Enrollment Trend</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{total}</p>
          <p className="text-xs text-slate-400 mt-0.5">new enrollments · last 30 days</p>
        </div>
        <div className={cn(
          "flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full",
          trend > 0 ? "bg-emerald-50 text-emerald-700" :
          trend < 0 ? "bg-red-50 text-red-600" :
                      "bg-slate-100 text-slate-500"
        )}>
          {trend > 0 ? <TrendingUp className="h-3.5 w-3.5" /> :
           trend < 0 ? <TrendingDown className="h-3.5 w-3.5" /> :
                       <Minus className="h-3.5 w-3.5" />}
          {trend > 0 ? `+${trend}` : trend} vs prev 15 days
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#1B4F8A" stopOpacity={0.15}/>
              <stop offset="95%" stopColor="#1B4F8A" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={6}/>
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false}/>
          <Tooltip content={<ChartTooltip />}/>
          <Area
            type="monotone" dataKey="count" name="Enrollments"
            stroke="#1B4F8A" strokeWidth={2}
            fill="url(#enrollGrad)" dot={false} activeDot={{ r: 4, fill: "#1B4F8A" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Progress Distribution Donut ────────────────────────────────────
export function ProgressDonutChart({ data }: { data: ProgressDist[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Enrollment Status</p>
      <p className="text-xs text-slate-400 mb-4">across all courses</p>
      <div className="flex-1 flex flex-col items-center justify-center">
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={48} outerRadius={72}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((d, i) => <Cell key={i} fill={d.color}/>)}
            </Pie>
            <Tooltip content={<ChartTooltip />}/>
          </PieChart>
        </ResponsiveContainer>
        <div className="w-full space-y-2 mt-2">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }}/>
                <span className="text-slate-600">{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{d.value}</span>
                <span className="text-slate-400 w-8 text-right">
                  {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Course Performance Bars ────────────────────────────────────────
export function CoursePerformanceChart({ data }: { data: CourseStat[] }) {
  const chartData = data.map(d => ({
    name:      d.title,
    Enrolled:  d.total,
    Completed: d.completed,
    Rate:      d.rate,
  }))

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Course Performance</p>
          <p className="text-xs text-slate-400 mt-0.5">Enrolled vs completed students per course</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#1B4F8A]/20 inline-block"/><span className="text-slate-500">Enrolled</span></span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#1B4F8A] inline-block"/><span className="text-slate-500">Completed</span></span>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-slate-400">No course data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 48, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
            <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false}/>
            <YAxis
              type="category" dataKey="name"
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickLine={false} axisLine={false}
              width={130}
            />
            <Tooltip content={<ChartTooltip />}/>
            <Bar dataKey="Enrolled"  fill="#1B4F8A" fillOpacity={0.18} radius={[0, 4, 4, 0]} barSize={10}/>
            <Bar dataKey="Completed" fill="#1B4F8A" radius={[0, 4, 4, 0]} barSize={10}
              label={{ position: "right", fontSize: 10, fill: "#64748b",
                formatter: ((_: any, entry: any) => entry?.Rate != null ? `${entry.Rate}%` : "") as any
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
