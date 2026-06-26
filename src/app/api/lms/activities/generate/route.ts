import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import Groq from "groq-sdk"

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder",
})

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

const TYPE_LABELS: Record<string, string> = {
  mcq:           "Multiple Choice Question",
  flashcard:     "Flashcard Flip",
  ordering:      "Ordering / Sequence",
  error_spotter: "Error Spotter",
  gap_fill:      "Gap Fill Paragraph",
  word_scramble: "Word Scramble",
  scenario:      "Scenario / Decision Tree",
  concept_sorter:"Concept Sorter",
  acronym:       "Acronym Explainer",
  drag_match:    "Drag & Drop Matching",
  fill_blank:    "Fill in the Blank",
  rapid_fire:    "Rapid Fire Quiz",
}

// POST /api/lms/activities/generate
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { module_id, count = 4, types = [], difficulty = "medium", placement = "ai_topic", language = "English" } = body

  if (!module_id) return NextResponse.json({ error: "module_id required" }, { status: 400 })

  // Load module info
  const { data: mod } = await db
    .from("lms_modules")
    .select("id, title, course_id")
    .eq("id", module_id)
    .single()

  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 })

  // Load Expert analysis
  const { data: analysis } = await db
    .from("lms_module_analysis")
    .select("analysis")
    .eq("module_id", module_id)
    .single()

  const a = (analysis?.analysis ?? {}) as any
  const moduleTitle   = a.module_title ?? mod.title
  const summary       = a.summary ?? ""
  const topics        = (a.topics ?? []).join(", ")
  const keyConcepts   = (a.key_concepts ?? []).join(", ")
  const skillsAssessed = (a.skills_assessed ?? []).join(", ")
  const slideCount    = a.content_breakdown?.slides ?? a.content_breakdown?.pages ?? 20

  const enabledTypes = types.length > 0 ? types : Object.keys(TYPE_LABELS)
  const typeList = enabledTypes
    .map((t: string) => `- ${t}: ${TYPE_LABELS[t] ?? t}`)
    .join("\n")

  const diffGuides: Record<string, string> = {
    easy:   "simple recall, basic definitions, straightforward",
    medium: "application of concepts, moderate complexity",
    hard:   "analysis, edge cases, nuanced distinctions",
  }
  const difficultyGuide = diffGuides[difficulty] ?? "moderate complexity"

  const placementGuides: Record<string, string> = {
    ai_topic:  "Place each activity strategically after a major topic section based on content flow",
    end:       "Place all activities at the end (slide " + slideCount + ")",
    evenly:    "Space activities evenly across the " + slideCount + " slides",
  }
  const placementGuide = placementGuides[placement] ?? "place strategically after topic sections"

  const prompt = `You are an expert instructional designer creating interactive activities for an aviation training module.

MODULE: "${moduleTitle}"
SUMMARY: ${summary}
TOPICS COVERED: ${topics}
KEY CONCEPTS: ${keyConcepts}
SKILLS ASSESSED: ${skillsAssessed}
TOTAL SLIDES: ${slideCount}
LANGUAGE: ${language}
DIFFICULTY: ${difficulty} — ${difficultyGuide}
PLACEMENT RULE: ${placementGuide}

AVAILABLE ACTIVITY TYPES (use only these):
${typeList}

Generate exactly ${count} activities. For each activity, choose the most appropriate type from the list above based on the content.

Respond ONLY with a valid JSON array. No explanation. No markdown. No code fences. Just the raw JSON array:

[
  {
    "type": "flashcard",
    "title": "Short descriptive title (max 8 words)",
    "placement_slide": 8,
    "placement_reason": "One sentence why this slide position makes sense",
    "difficulty": "${difficulty}",
    "content": {
      "cards": [
        {"front": "Term or concept", "back": "Definition or explanation"},
        {"front": "Term or concept", "back": "Definition or explanation"},
        {"front": "Term or concept", "back": "Definition or explanation"}
      ]
    }
  },
  {
    "type": "mcq",
    "title": "Short descriptive title",
    "placement_slide": 16,
    "placement_reason": "...",
    "difficulty": "${difficulty}",
    "content": {
      "question": "The question text?",
      "options": [
        {"text": "Option A", "is_correct": false},
        {"text": "Option B", "is_correct": true},
        {"text": "Option C", "is_correct": false},
        {"text": "Option D", "is_correct": false}
      ],
      "explanation": "Why the correct answer is correct"
    }
  },
  {
    "type": "ordering",
    "title": "Short descriptive title",
    "placement_slide": 20,
    "placement_reason": "...",
    "difficulty": "${difficulty}",
    "content": {
      "question": "Put these steps in the correct order:",
      "items": [
        {"id": "1", "text": "Step description"},
        {"id": "2", "text": "Step description"},
        {"id": "3", "text": "Step description"},
        {"id": "4", "text": "Step description"}
      ],
      "correct_order": ["1","2","3","4"]
    }
  },
  {
    "type": "error_spotter",
    "title": "Short descriptive title",
    "placement_slide": 30,
    "placement_reason": "...",
    "difficulty": "${difficulty}",
    "content": {
      "text": "A paragraph about the module topic with exactly 2 factual errors embedded naturally",
      "errors": [
        {"wrong": "the incorrect word or phrase in the text", "correct": "the correct replacement"},
        {"wrong": "the second incorrect phrase", "correct": "correct version"}
      ]
    }
  }
]

CONTENT RULES:
- All content must be directly relevant to "${moduleTitle}" and the topics listed
- Use real aviation terminology and accurate facts
- For flashcard: 3-6 cards
- For mcq: exactly 4 options, exactly 1 correct
- For ordering: 4-6 items
- For error_spotter: exactly 2 errors, errors must actually appear word-for-word in the text
- For gap_fill: "paragraph" field with blanks as [BLANK_1], [BLANK_2] etc, "blanks" array with answers
- For word_scramble: "word" is a single aviation term from the topics, "hint" is a definition
- For scenario: "situation" text, "choices" array with is_correct on exactly one
- For concept_sorter: "categories" array (3 max), "items" array with correct category
- For acronym: "acronym" string, "letters" array matching each letter
- For drag_match: "pairs" array with left/right strings (4-6 pairs)
- For fill_blank: "sentence" with ___ for each blank, "blanks" array with answers in order
- For rapid_fire: "questions" array of 5 mcq-style questions, "time_per_question_s": 10
- Placement slide must be between 1 and ${slideCount}
- ${language !== "English" ? `Write all content in ${language}` : "Write in English"}
- Return ONLY the JSON array, starting with [ and ending with ]`

  let raw = ""
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4000,
    })
    raw = completion.choices[0]?.message?.content?.trim() ?? ""
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Groq error" }, { status: 500 })
  }

  // Parse JSON — find first [ to last ]
  const start = raw.indexOf("[")
  const end   = raw.lastIndexOf("]")
  if (start === -1 || end === -1)
    return NextResponse.json({ error: "AI returned invalid format", raw: raw.slice(0, 200) }, { status: 500 })

  let activities: any[]
  try {
    activities = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(activities)) throw new Error("Not an array")
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw: raw.slice(0, 200) }, { status: 500 })
  }

  // Normalize and validate each activity
  const normalized = activities.slice(0, count).map((act: any, i: number) => ({
    type:            act.type ?? "mcq",
    title:           act.title ?? `Activity ${i + 1}`,
    placement_slide: Math.max(1, Math.min(slideCount, act.placement_slide ?? Math.round((slideCount / count) * (i + 1)))),
    placement_reason:act.placement_reason ?? "",
    difficulty,
    ai_generated:    true,
    content:         act.content ?? {},
  }))

  return NextResponse.json({ activities: normalized })
}
