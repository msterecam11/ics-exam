import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft, Database, HardDrive, Activity,
  GraduationCap, Users, Library, FileQuestion, BookOpen, UserCog, ClipboardList,
} from "lucide-react"

export const metadata = { title: "System Status — ICS Hub" }
export const dynamic = "force-dynamic"

// Plan ceilings — set in the host's environment on plan upgrade (values in MB).
// Defaults are the Supabase free tier: 500 MB database, 1 GB file storage.
const DB_LIMIT_MB = Number(process.env.SUPABASE_DB_LIMIT_MB ?? 500)
const STORAGE_LIMIT_MB = Number(process.env.SUPABASE_STORAGE_LIMIT_MB ?? 1024)

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + " GB"
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " MB"
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB"
  return bytes + " B"
}

function barColor(pct: number) {
  if (pct >= 90) return "bg-red-500"
  if (pct >= 70) return "bg-amber-500"
  return "bg-emerald-500"
}

function UsageCard({ icon: Icon, title, usedBytes, limitMb, detail }: {
  icon: React.ElementType; title: string; usedBytes: number; limitMb: number; detail: string
}) {
  const limitBytes = limitMb * 1024 * 1024
  const pct = Math.min(100, (usedBytes / limitBytes) * 100)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#1B4F8A] flex items-center justify-center">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-400">{detail}</p>
        </div>
      </div>
      <div className="flex items-end justify-between mb-2">
        <span className="text-2xl font-extrabold text-slate-800">{fmtBytes(usedBytes)}</span>
        <span className="text-xs text-slate-400 mb-1">of {fmtBytes(limitBytes)} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  )
}

export default async function HubStatusPage() {
  const session = await auth()
  if (!session) redirect("/auth/login")
  if (session.user.role !== "admin") redirect("/hub")

  const { data, error } = await db.rpc("hub_system_status")
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Failed to load system status. Please try again.</p>
      </div>
    )
  }

  const status = data as {
    db_size_bytes: number
    top_tables: { name: string; bytes: number }[]
    storage_buckets: { bucket_id: string; files: number; bytes: number }[]
    counts: Record<string, number>
  }

  const totalStorageBytes = status.storage_buckets.reduce((s, b) => s + b.bytes, 0)
  const totalFiles = status.storage_buckets.reduce((s, b) => s + b.files, 0)

  const statTiles = [
    { label: "Exams", value: status.counts.exams, icon: GraduationCap },
    { label: "Candidates", value: status.counts.candidates, icon: Users },
    { label: "Question Banks", value: status.counts.question_banks, icon: Library },
    { label: "Questions", value: status.counts.questions, icon: FileQuestion },
    { label: "LMS Courses", value: status.counts.lms_courses, icon: BookOpen },
    { label: "LMS Students", value: status.counts.lms_students, icon: ClipboardList },
    { label: "Platform Users", value: status.counts.admin_users, icon: UserCog },
  ]

  const now = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo/logo-dark-blue.png" alt="ICS Aviation" width={140} height={38} className="object-contain" priority />
          <div className="h-5 w-px bg-slate-200 mx-1" />
          <span className="text-sm font-semibold text-[#1B4F8A] tracking-wide">SYSTEM STATUS</span>
        </div>
        <Link href="/hub" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Hub
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">System Status</h1>
          <p className="text-sm text-slate-400 mt-1">Live snapshot as of {now} · limits reflect the current hosting plan</p>
        </div>

        {/* Usage bars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <UsageCard
            icon={Database} title="Database Storage" usedBytes={status.db_size_bytes}
            limitMb={DB_LIMIT_MB} detail="Postgres — all systems"
          />
          <UsageCard
            icon={HardDrive} title="File Storage" usedBytes={totalStorageBytes}
            limitMb={STORAGE_LIMIT_MB} detail={`${totalFiles} file${totalFiles !== 1 ? "s" : ""} across ${status.storage_buckets.length} bucket${status.storage_buckets.length !== 1 ? "s" : ""}`}
          />
        </div>

        {/* Platform counts */}
        <div>
          <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#1B4F8A]" /> Platform Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {statTiles.map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <Icon className="h-4 w-4 text-[#1B4F8A] mx-auto mb-2" />
                <p className="text-xl font-extrabold text-slate-800">{value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Detail tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-800 mb-4">Largest Database Tables</h2>
            <div className="space-y-2.5">
              {status.top_tables.map((t) => {
                const pct = status.db_size_bytes > 0 ? (t.bytes / status.db_size_bytes) * 100 : 0
                return (
                  <div key={t.name} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-600 flex-1 truncate">{t.name}</span>
                    <div className="w-28 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                      <div className="h-full rounded-full bg-[#1B4F8A]" style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                    <span className="text-xs text-slate-400 w-16 text-right shrink-0">{fmtBytes(t.bytes)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-800 mb-4">Storage Buckets</h2>
            {status.storage_buckets.length === 0 ? (
              <p className="text-sm text-slate-400">No files stored yet.</p>
            ) : (
              <div className="space-y-2.5">
                {status.storage_buckets.map((b) => {
                  const pct = totalStorageBytes > 0 ? (b.bytes / totalStorageBytes) * 100 : 0
                  return (
                    <div key={b.bucket_id} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-600 flex-1 truncate">{b.bucket_id}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">{b.files} files</span>
                      <div className="w-28 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 w-16 text-right shrink-0">{fmtBytes(b.bytes)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Plan limits are configured via <code className="font-mono bg-slate-100 px-1 rounded">SUPABASE_DB_LIMIT_MB</code> and{" "}
          <code className="font-mono bg-slate-100 px-1 rounded">SUPABASE_STORAGE_LIMIT_MB</code> environment variables — update them after a plan upgrade.
        </p>
      </main>
    </div>
  )
}
