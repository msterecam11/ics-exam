// CSV Question Importer
// Columns: type, text, score, ai_guide, opt1…opt6
// - mcq_single / mcq_multi : opt = "Text:Score"  e.g. "Paris:10"  or "London:0"
// - ordering               : opt = item text in correct order (left = position 0)
// - matching               : opt = "LeftItem:RightItem"  e.g. "France:Paris"
// - open_ended             : only text, score, ai_guide used

export interface CSVParsedQuestion {
  type: "mcq_single" | "mcq_multi" | "open_ended" | "ordering" | "matching"
  text: string
  score: number
  ai_guide?: string
  choices?: { text: string; is_correct: boolean; score: number }[]
  ordering_items?: { text: string; correct_position: number }[]
  matching_pairs?: { left_item: string; right_item: string }[]
}

export interface CSVParseResult {
  questions: CSVParsedQuestion[]
  errors: { row: number; message: string }[]
}

const VALID_TYPES = ["mcq_single", "mcq_multi", "open_ended", "ordering", "matching"]

function parseRow(raw: string[]): string[] {
  // Trim all cells
  return raw.map((c) => c.trim())
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

export function parseCSV(csvText: string): CSVParseResult {
  const questions: CSVParsedQuestion[] = []
  const errors: { row: number; message: string }[] = []

  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")

  // Skip header row
  const dataRows = lines.slice(1).filter((l) => l.trim() && !l.trim().startsWith("//"))

  dataRows.forEach((line, idx) => {
    const rowNum = idx + 2 // +2 because 1-indexed and skipped header
    const cells = parseRow(parseCSVLine(line))

    const [typeRaw, text, scoreRaw, ai_guide, ...opts] = cells

    const type = typeRaw?.toLowerCase().trim()

    if (!type || !VALID_TYPES.includes(type)) {
      errors.push({ row: rowNum, message: `Unknown type "${typeRaw}" — must be one of: ${VALID_TYPES.join(", ")}` })
      return
    }

    if (!text?.trim()) {
      errors.push({ row: rowNum, message: "Question text is empty" })
      return
    }

    const score = parseFloat(scoreRaw)
    if (isNaN(score) || score < 0) {
      errors.push({ row: rowNum, message: `Invalid score "${scoreRaw}"` })
      return
    }

    const filledOpts = opts.filter((o) => o.trim())

    if (type === "open_ended") {
      questions.push({
        type: "open_ended",
        text: text.trim(),
        score,
        ai_guide: ai_guide?.trim() || undefined,
      })
      return
    }

    if (filledOpts.length === 0) {
      errors.push({ row: rowNum, message: `Type "${type}" requires at least one option column` })
      return
    }

    if (type === "mcq_single" || type === "mcq_multi") {
      const choices: { text: string; is_correct: boolean; score: number }[] = []
      for (const opt of filledOpts) {
        const colonIdx = opt.lastIndexOf(":")
        if (colonIdx === -1) {
          errors.push({ row: rowNum, message: `Option "${opt}" must be in format "Text:Score" e.g. "Paris:10"` })
          return
        }
        const choiceText = opt.slice(0, colonIdx).trim()
        const choiceScore = parseFloat(opt.slice(colonIdx + 1).trim())
        if (!choiceText) { errors.push({ row: rowNum, message: `Empty choice text in option "${opt}"` }); return }
        if (isNaN(choiceScore)) { errors.push({ row: rowNum, message: `Invalid score in option "${opt}"` }); return }
        choices.push({ text: choiceText, is_correct: choiceScore > 0, score: choiceScore })
      }
      if (type === "mcq_single" && choices.filter((c) => c.score >= score).length === 0) {
        // Auto-mark highest scoring as correct
        const max = Math.max(...choices.map((c) => c.score))
        choices.forEach((c) => { if (c.score === max) c.is_correct = true })
      }
      questions.push({ type: type as "mcq_single" | "mcq_multi", text: text.trim(), score, choices })
      return
    }

    if (type === "ordering") {
      questions.push({
        type: "ordering",
        text: text.trim(),
        score,
        ordering_items: filledOpts.map((o, i) => ({ text: o.trim(), correct_position: i })),
      })
      return
    }

    if (type === "matching") {
      const pairs: { left_item: string; right_item: string }[] = []
      for (const opt of filledOpts) {
        const colonIdx = opt.indexOf(":")
        if (colonIdx === -1) {
          errors.push({ row: rowNum, message: `Matching option "${opt}" must be in format "Left:Right" e.g. "France:Paris"` })
          return
        }
        pairs.push({ left_item: opt.slice(0, colonIdx).trim(), right_item: opt.slice(colonIdx + 1).trim() })
      }
      questions.push({ type: "matching", text: text.trim(), score, matching_pairs: pairs })
      return
    }
  })

  return { questions, errors }
}
