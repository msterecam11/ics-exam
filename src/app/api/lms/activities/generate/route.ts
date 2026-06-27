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
      "text": "The pilot must hold a Class III medical certificate and complete 500 hours of total flight time before applying for a commercial licence.",
      "errors": [
        {"wrong": "Class III", "correct": "Class I"},
        {"wrong": "500 hours", "correct": "200 hours"}
      ]
    }
  }
]

CRITICAL RULES FOR error_spotter TYPE:
1. Write the "text" paragraph first — it must be 2-3 sentences about the module topic
2. The paragraph MUST contain exactly 2 factual errors (wrong aviation facts that a student should catch)
3. The "wrong" field MUST be the EXACT substring as it appears in your "text" paragraph — copy and paste it
4. Double-check: search your "text" for each "wrong" value before outputting — if it is not there, rewrite
5. The "correct" field is the replacement value (not the full sentence, just the corrected phrase/number/word)
6. Example: if text says "Class III medical certificate", then wrong="Class III", correct="Class I"
7. NEVER use a "wrong" value that does not appear verbatim in the "text"

CONTENT RULES:
- All content must be directly relevant to "${moduleTitle}" and the topics listed
- Use real aviation terminology and accurate facts
- For flashcard: 3-6 cards
- For mcq: exactly 4 options, exactly 1 correct
- For ordering: 4-6 items
- For error_spotter: exactly 2 errors — see CRITICAL RULES above
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
  const normalized = activities.slice(0, count).map((act: any, i: number) => {
    let content = act.content ?? {}

    // Post-process error_spotter: ensure every "wrong" value appears verbatim in the text
    if (act.type === "error_spotter" && content.text && Array.isArray(content.errors)) {
      content = {
        ...content,
        errors: content.errors.map((e: any) => {
          const wrong = e.wrong ?? ""
          const correct = e.correct ?? ""
          if (wrong && content.text.includes(wrong)) return e
          // Try case-insensitive match and use the actual substring from the text
          const lowerText: string = content.text.toLowerCase()
          const lowerWrong: string = wrong.toLowerCase()
          const idx = lowerText.indexOf(lowerWrong)
          if (idx !== -1) {
            // Use the actual casing from the text
            return { wrong: content.text.slice(idx, idx + wrong.length), correct }
          }
          // Wrong phrase not in text at all — mark as invalid so the UI can skip it
          return { wrong: "", correct, _invalid: true }
        }).filter((e: any) => !e._invalid && e.wrong),
      }
    }

    return {
      type:            act.type ?? "mcq",
      title:           act.title ?? `Activity ${i + 1}`,
      placement_slide: Math.max(1, Math.min(slideCount, act.placement_slide ?? Math.round((slideCount / count) * (i + 1)))),
      placement_reason:act.placement_reason ?? "",
      difficulty,
      ai_generated:    true,
      content,
    }
  })

  return NextResponse.json({ activities: normalized, slideCount })
}
