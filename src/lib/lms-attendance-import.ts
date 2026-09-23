// Reading a Teams or Zoom attendance report.
//
// Both export a table with, per person: an email, when they joined / left
// and/or how long they were in. The layouts differ (Teams writes UTF-16,
// tab-separated, in sections; Zoom writes a plain CSV; either can list one
// person several times if they dropped and rejoined), so this finds the
// participants table by its headers and adds each person's time together.

export type MeetingPerson = {
  email: string
  name: string | null
  minutes: number
  firstJoin: Date | null
  lastLeave: Date | null
}

/** Bytes of an uploaded file → text (UTF-16 as Teams writes it, else UTF-8). */
export function decodeReport(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2))
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2))
  // UTF-16 without a byte-order mark: every other byte is zero.
  if (b.length > 4 && b[1] === 0 && b[3] === 0) return new TextDecoder("utf-16le").decode(b)
  return new TextDecoder("utf-8").decode(b).replace(/^﻿/, "")
}

/** One line of CSV/TSV, honouring "quoted, cells". */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = "", q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === sep) { out.push(cur.trim()); cur = "" }
    else cur += c
  }
  out.push(cur.trim())
  return out
}

/** "1h 5m 30s", "65 min", "01:05:30", "65" → minutes. */
export function parseDuration(v: string): number | null {
  const s = v.trim().toLowerCase()
  if (!s) return null
  const hms = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/)
  if (hms) return hms[3] !== undefined ? Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3]) / 60 : Number(hms[1]) + Number(hms[2]) / 60
  const parts = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/g)]
  if (parts.length) return parts.reduce((t, p) => t + Number(p[1]) * (p[2].startsWith("h") ? 60 : p[2].startsWith("s") ? 1 / 60 : 1), 0)
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Report timestamps: "12/10/2026, 8:31:05 AM", "2026-12-10 08:31:05", ISO… read as institute time (UTC+3) unless they carry a zone. */
export function parseStamp(v: string): Date | null {
  const s = v.trim()
  if (!s) return null
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) { const d = new Date(s); return isNaN(+d) ? null : d }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}+03:00`)
  // Month-first as Teams and Zoom write it in English: M/D/YYYY[,] h:mm[:ss] [AM|PM]
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (m) {
    let h = Number(m[4])
    if (m[7]) { const pm = m[7].toLowerCase() === "pm"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0 }
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return new Date(`${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}T${String(h).padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}+03:00`)
  }
  return null
}

const find = (headers: string[], ...patterns: RegExp[]) =>
  headers.findIndex(h => patterns.some(p => p.test(h)))

/**
 * The people in a meeting report, one entry per email, with their minutes
 * added together. Throws a readable error when the file isn't a report.
 */
export function parseMeetingReport(text: string): MeetingPerson[] {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const sep = lines[i].includes("\t") ? "\t" : ","
    const headers = splitLine(lines[i], sep).map(h => h.toLowerCase())
    const email = find(headers, /^e-?mail$/, /user email/, /email/, /participant id/, /upn/)
    if (email < 0) continue
    const join = find(headers, /first join/, /^join time/, /join/, /joined/)
    const leave = find(headers, /last leave/, /^leave time/, /leave/, /left/)
    const duration = find(headers, /in-meeting duration/, /duration/, /time in meeting/, /attendance duration/)
    if (join < 0 && duration < 0) continue
    const name = find(headers, /^name/, /full name/, /participant/)

    const people = new Map<string, MeetingPerson>()
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      if (!line.trim()) { if (people.size) break; else continue }
      const cells = splitLine(line, sep)
      const addr = (cells[email] ?? "").trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { if (/^\d+\.\s/.test(line.trim()) && people.size) break; continue }
      const jn = join >= 0 ? parseStamp(cells[join] ?? "") : null
      const lv = leave >= 0 ? parseStamp(cells[leave] ?? "") : null
      let mins = duration >= 0 ? parseDuration(cells[duration] ?? "") : null
      if (mins === null && jn && lv) mins = Math.max(0, (lv.getTime() - jn.getTime()) / 60_000)
      const cur = people.get(addr) ?? { email: addr, name: name >= 0 ? cells[name] || null : null, minutes: 0, firstJoin: null, lastLeave: null }
      cur.minutes += mins ?? 0
      if (jn && (!cur.firstJoin || jn < cur.firstJoin)) cur.firstJoin = jn
      if (lv && (!cur.lastLeave || lv > cur.lastLeave)) cur.lastLeave = lv
      people.set(addr, cur)
    }
    if (people.size) return [...people.values()].map(p => ({ ...p, minutes: Math.round(p.minutes) }))
  }
  throw new Error("This doesn't look like a Teams or Zoom attendance report — no table with an email column and join times or durations was found.")
}
