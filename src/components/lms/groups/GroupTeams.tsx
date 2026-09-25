"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Trash2, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

// Teams of a group (group page → Participants). Team work — an assignment or
// exercise set as "team work" — is then submitted and marked once per team.

type Team = { id: string; name: string; members: { enrollment_id: string; name: string }[] }
type Person = { enrollment_id: string; student: { name: string } | null }

export default function GroupTeams({ groupId, participants, onChanged }: { groupId: string; participants: Person[]; onChanged?: () => void }) {
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [assignment, setAssignment] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/groups/${groupId}/teams`)
    const j = await res.json().catch(() => ({}))
    if (res.ok) { setTeams(j.teams ?? []); setAssignment(j.assignment ?? {}) } else setTeams([])
  }, [groupId])
  useEffect(() => { load() }, [load])

  async function call(method: string, body?: any, query = "") {
    setBusy(true)
    const res = await fetch(`/api/lms/groups/${groupId}/teams${query}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
    setBusy(false)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not save"); return false }
    await load(); onChanged?.(); return true
  }

  if (!teams) return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>
  const unassigned = participants.filter(p => !assignment[p.enrollment_id])

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UsersRound className="h-4 w-4 text-[#1B4F8A]" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">Teams</p>
          <p className="text-xs text-slate-500">For team work: an assignment or exercise set as &quot;Team work&quot; is submitted by one member and marked once for the whole team. Everything else stays individual.</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => call("POST", {})} className="gap-1.5 shrink-0"><Plus className="h-3.5 w-3.5" /> Add team</Button>
      </div>

      {teams.length === 0 ? <p className="text-xs text-slate-400">No teams — every piece of work is individual.</p> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {teams.map(t => (
            <div key={t.id} className="border border-slate-200 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5">
                <input defaultValue={t.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.name) call("PATCH", { team_id: t.id, name: v }) }}
                  className="flex-1 min-w-0 text-sm font-semibold text-slate-800 bg-transparent outline-none focus:bg-slate-50 rounded px-1" />
                <span className="text-[10px] text-slate-400">{t.members.length}</span>
                <button type="button" title="Remove team" disabled={busy}
                  onClick={() => { if (confirm(`Remove ${t.name}? Its members become unassigned; work already marked keeps its marks.`)) call("DELETE", undefined, `?team_id=${t.id}`) }}
                  className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-1.5 space-y-1">
                {t.members.map(m => (
                  <div key={m.enrollment_id} className="flex items-center gap-1 text-xs text-slate-700">
                    <span className="flex-1 truncate">{m.name}</span>
                    <button type="button" onClick={() => call("PUT", { enrollment_id: m.enrollment_id, team_id: null })} className="text-slate-300 hover:text-red-500" title="Take out of the team">×</button>
                  </div>
                ))}
                {unassigned.length > 0 && (
                  <select value="" disabled={busy} onChange={e => e.target.value && call("PUT", { enrollment_id: e.target.value, team_id: t.id })}
                    className="w-full h-7 rounded border border-dashed border-slate-300 bg-transparent px-1.5 text-xs text-slate-500">
                    <option value="">+ Add someone…</option>
                    {unassigned.map(p => <option key={p.enrollment_id} value={p.enrollment_id}>{p.student?.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {teams.length > 0 && unassigned.length > 0 && <p className="text-xs text-amber-700">Not in a team yet: {unassigned.map(p => p.student?.name).join(", ")}</p>}
    </div>
  )
}
