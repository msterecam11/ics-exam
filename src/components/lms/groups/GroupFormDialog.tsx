"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProviderSelect } from "@/components/lms/ProviderSelect"
import { cn } from "@/lib/utils"

// Create or edit one onsite group: dates, daily times, venue, provider, seats
// and staff. Creating one also offers to make its days.

export type StaffOption = { id: string; name: string; email: string; role: string }
export type GroupFormValue = {
  id?: string
  name: string; start_date: string; end_date: string; daily_start: string; daily_end: string
  city: string; country: string; venue_name: string; venue_address: string; map_url: string
  seats: string; language: string; provider_id: string | null; notes: string
  staff: { user_id: string; role: "instructor" | "facilitator" }[]
}

export const emptyGroup = (providerId: string | null): GroupFormValue => ({
  name: "", start_date: "", end_date: "", daily_start: "08:30", daily_end: "15:30",
  city: "", country: "", venue_name: "", venue_address: "", map_url: "",
  seats: "", language: "English", provider_id: providerId, notes: "", staff: [],
})

export function GroupFormDialog({ open, onClose, courseId, initial, onSaved }: {
  open: boolean; onClose: () => void; courseId: string
  initial: GroupFormValue; onSaved: (id: string) => void
}) {
  const [f, setF] = useState<GroupFormValue>(initial)
  const [busy, setBusy] = useState(false)
  const [makeDays, setMakeDays] = useState(true)
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const editing = !!initial.id

  // Reset to the starting values each time the dialog opens (not on every
  // parent render — `initial` is a fresh object each time).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setF(initial); setMakeDays(true) } }, [open])
  useEffect(() => {
    if (!open) return
    fetch("/api/lms/groups/staff").then(r => r.ok ? r.json() : []).then(d => setStaffOptions(Array.isArray(d) ? d : [])).catch(() => {})
  }, [open])

  const set = <K extends keyof GroupFormValue>(k: K, v: GroupFormValue[K]) => setF(p => ({ ...p, [k]: v }))
  const hasStaff = (id: string, role: "instructor" | "facilitator") => f.staff.some(s => s.user_id === id && s.role === role)
  const toggleStaff = (id: string, role: "instructor" | "facilitator") =>
    set("staff", hasStaff(id, role) ? f.staff.filter(s => !(s.user_id === id && s.role === role)) : [...f.staff, { user_id: id, role }])

  async function save() {
    if (!f.start_date || !f.end_date) { toast.error("Choose the start and end dates"); return }
    setBusy(true)
    const body = {
      ...(editing ? {} : { course_id: courseId, generate_days: makeDays }),
      name: f.name, start_date: f.start_date, end_date: f.end_date,
      daily_start: f.daily_start || null, daily_end: f.daily_end || null,
      city: f.city, country: f.country, venue_name: f.venue_name, venue_address: f.venue_address, map_url: f.map_url,
      seats: f.seats === "" ? null : Number(f.seats), language: f.language, provider_id: f.provider_id, notes: f.notes,
      staff: f.staff,
    }
    const res = await fetch(editing ? `/api/lms/groups/${initial.id}` : "/api/lms/groups", {
      method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { toast.error(data.error ?? "Could not save the group"); return }
    toast.success(editing ? "Group saved" : `Group created${data.days ? ` with ${data.days} day${data.days === 1 ? "" : "s"}` : ""}`)
    onSaved(data.id ?? initial.id)
    onClose()
  }

  const field = "space-y-1.5"
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit group" : "New group"}</DialogTitle></DialogHeader>
        <div className="space-y-5 pt-1">
          <section className="grid grid-cols-2 gap-3">
            <div className={field}><Label>Start date</Label><Input type="date" value={f.start_date} onChange={e => set("start_date", e.target.value)} /></div>
            <div className={field}><Label>End date</Label><Input type="date" value={f.end_date} min={f.start_date || undefined} onChange={e => set("end_date", e.target.value)} /></div>
            <div className={field}><Label>Daily start</Label><Input type="time" value={f.daily_start} onChange={e => set("daily_start", e.target.value)} /></div>
            <div className={field}><Label>Daily end</Label><Input type="time" value={f.daily_end} onChange={e => set("daily_end", e.target.value)} /></div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className={field}><Label>City</Label><Input value={f.city} onChange={e => set("city", e.target.value)} placeholder="Riyadh" /></div>
            <div className={field}><Label>Country</Label><Input value={f.country} onChange={e => set("country", e.target.value)} placeholder="Saudi Arabia" /></div>
            <div className={cn(field, "col-span-2")}><Label>Venue</Label><Input value={f.venue_name} onChange={e => set("venue_name", e.target.value)} placeholder="ICS Training Centre, Hall B" /></div>
            <div className={cn(field, "col-span-2")}><Label>Address</Label><Input value={f.venue_address} onChange={e => set("venue_address", e.target.value)} /></div>
            <div className={cn(field, "col-span-2")}><Label>Map link</Label><Input value={f.map_url} onChange={e => set("map_url", e.target.value)} placeholder="https://maps.google.com/…" /></div>
          </section>

          <section className="grid grid-cols-3 gap-3">
            <div className={field}><Label>Seats</Label><Input type="number" min={1} value={f.seats} onChange={e => set("seats", e.target.value)} placeholder="No limit" /></div>
            <div className={field}><Label>Language</Label><Input value={f.language} onChange={e => set("language", e.target.value)} /></div>
            <div className={field}><Label>Delivered by</Label><ProviderSelect value={f.provider_id} onChange={v => set("provider_id", v)} /></div>
            <div className={cn(field, "col-span-3")}><Label>Name <span className="text-slate-400 font-normal">(optional — otherwise the dates and city)</span></Label><Input value={f.name} onChange={e => set("name", e.target.value)} /></div>
          </section>

          <section className="space-y-2">
            <Label>Staff</Label>
            {staffOptions.length === 0 ? <p className="text-xs text-slate-400">No staff accounts yet.</p> : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {staffOptions.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0"><p className="font-medium text-slate-800 truncate">{s.name}</p><p className="text-xs text-slate-400 truncate">{s.email}</p></div>
                    {(["instructor", "facilitator"] as const).map(role => (
                      <button key={role} type="button" onClick={() => toggleStaff(s.id, role)}
                        className={cn("px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                          hasStaff(s.id, role) ? "bg-[#1B4F8A] text-white border-[#1B4F8A]" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                        {role === "instructor" ? "Instructor" : "Facilitator"}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400">Instructors teach and grade; facilitators take attendance. One person can be both.</p>
          </section>

          <div className={field}><Label>Internal notes</Label>
            <textarea value={f.notes} onChange={e => set("notes", e.target.value)} rows={2}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
          </div>

          {!editing && (
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" checked={makeDays} onChange={e => setMakeDays(e.target.checked)} className="mt-0.5 accent-[#1B4F8A]" />
              <span><span className="font-medium text-slate-800">Create one day per date</span>
                <span className="block text-xs text-slate-500">Each day gets the daily times and venue, and is where attendance is taken. You can remove days (e.g. a weekend) afterwards.</span></span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{editing ? "Save" : "Create group"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
