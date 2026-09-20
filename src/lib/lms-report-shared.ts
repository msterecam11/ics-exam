import type { ProgramReport, ClientReport, StudentProgramReport } from "@/lib/lms-program-report"
import type { GroupReport } from "@/lib/lms-group-report"

// Pure helpers shared by report builders (server) and report views (browser).
// No database imports here — this file is bundled into client components.

/** FB-6: group breakdowns shared outside the institute need at least this many responses. */
export const FEEDBACK_MIN_GROUP = 3

export type RatingSummary = { key: string; label: string; avg: number | null; count: number; sum: number; dist: number[] }
export type FeedbackSummary = {
  asked: number
  responses: number
  responseRate: number | null
  ratings: RatingSummary[]
  recommend: { yes: number; maybe: number; no: number; answered: number; yesPct: number | null } | null
  comments: { kind: "went_well" | "improve" | "comment"; text: string }[]
  anonymousShare: number   // how many responses were anonymous
}

/**
 * FB-6 / FB-8: a version safe to hand to a client. Rating breakdowns only with
 * at least FEEDBACK_MIN_GROUP responses; comments only if every response was
 * anonymous or the admin explicitly chose to include them.
 */
export function clientSafeFeedback(s: FeedbackSummary, includeComments: boolean): FeedbackSummary & { suppressed: boolean } {
  const enough = s.responses >= FEEDBACK_MIN_GROUP
  const allAnonymous = s.responses > 0 && s.anonymousShare === s.responses
  return {
    ...s,
    ratings: enough ? s.ratings : [],
    recommend: enough ? s.recommend : null,
    comments: enough && (allAnonymous || includeComments) ? s.comments : [],
    suppressed: !enough && s.responses > 0,
  }
}

// ── Client copies (RP-16 / FB-8) ───────────────────────────────────────────
// Applied on the SERVER before a client copy is rendered, so internal notes and
// withheld feedback never reach the page at all (not merely hidden by the view).

type Opts = { includeComments: boolean; includeInternal: boolean }

export function programForClient(r: ProgramReport, o: Opts): ProgramReport {
  return {
    ...r,
    feedback: clientSafeFeedback(r.feedback, o.includeComments),
    survey: clientSafeFeedback(r.survey, o.includeComments),
    atRisk: o.includeInternal ? r.atRisk : [],
    stats: o.includeInternal ? r.stats : { ...r.stats, atRisk: 0 },
    roster: r.roster.filter(x => x.status !== "withdrawn").map(x => ({ ...x, email: "", lastActivity: null, atRisk: o.includeInternal ? x.atRisk : [] })),
    courses: r.courses.map(c => ({ ...c, feedbackAvg: c.feedbackResponses >= FEEDBACK_MIN_GROUP ? c.feedbackAvg : null })),
  }
}

export function clientForClient(r: ClientReport, o: Opts): ClientReport {
  return {
    ...r,
    feedback: clientSafeFeedback(r.feedback, o.includeComments),
    survey: clientSafeFeedback(r.survey, o.includeComments),
    totals: { ...r.totals, atRisk: 0 },
    programs: r.programs.map(p => ({ ...p, atRisk: 0 })),
  }
}

/**
 * One course group as the client sees it. Out: who needs support, questions
 * flagged as possibly miskeyed (our problem, not theirs), free-text comments,
 * and feedback from fewer than FEEDBACK_MIN_GROUP people.
 */
export function groupForClient(r: GroupReport): GroupReport {
  return {
    ...r,
    atRisk: [],
    itemAnalysis: { ...r.itemAnalysis, flagged: [] },
    feedback: r.feedback && r.feedback.count >= FEEDBACK_MIN_GROUP ? { ...r.feedback, comments: [] } : null,
    roster: r.roster.map(x => ({ ...x, atRisk: false })),
  }
}

export function studentForClient(r: StudentProgramReport, o: Opts): StudentProgramReport {
  if (o.includeInternal) return r
  return { ...r, totals: { ...r.totals, atRisk: [] }, courses: r.courses.map(c => ({ ...c, atRisk: [] })) }
}
