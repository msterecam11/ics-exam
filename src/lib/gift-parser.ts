// GIFT format parser
// Supports: MCQ single, MCQ multi, True/False (as MCQ single), Matching, Short answer (open_ended)
// https://docs.moodle.org/en/GIFT_format

export interface GIFTChoice {
  text: string
  isCorrect: boolean
  weight?: number
}

export interface GIFTParsedQuestion {
  title?: string
  text: string
  type: "mcq_single" | "mcq_multi" | "open_ended" | "matching"
  choices?: GIFTChoice[]
  matchingPairs?: { left: string; right: string }[]
  correctAnswer?: string
  score: number
}

export function parseGIFT(input: string): GIFTParsedQuestion[] {
  const questions: GIFTParsedQuestion[] = []

  // Normalize line endings, remove BOM
  const text = input.replace(/\r\n/g, "\n").replace(/^﻿/, "")

  // Split on double newlines (question separator)
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)

  for (const block of blocks) {
    // Skip comments and category markers
    if (block.startsWith("//") || block.startsWith("$CATEGORY")) continue

    const q = parseBlock(block)
    if (q) questions.push(q)
  }

  return questions
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim()
}

function parseBlock(block: string): GIFTParsedQuestion | null {
  // Remove single-line comments
  const lines = block.split("\n").filter((l) => !l.trimStart().startsWith("//"))
  const joined = lines.join("\n").trim()

  if (!joined) return null

  // Extract optional title ::Title::
  let title: string | undefined
  let rest = joined
  const titleMatch = rest.match(/^::([^:]+)::\s*/)
  if (titleMatch) {
    title = stripHtml(titleMatch[1].trim())
    rest = rest.slice(titleMatch[0].length)
  }

  // Find the answer block { ... }
  const braceOpen = rest.indexOf("{")
  const braceClose = rest.lastIndexOf("}")

  if (braceOpen === -1 || braceClose === -1) {
    // Description / essay with no answer block → open_ended with no guide
    return {
      title,
      text: stripHtml(rest),
      type: "open_ended",
      score: 1,
    }
  }

  const questionText = stripHtml(rest.slice(0, braceOpen).trim())
  const answerBlock = rest.slice(braceOpen + 1, braceClose).trim()

  if (!questionText) return null

  // True/False
  if (/^(TRUE|FALSE|T|F)$/i.test(answerBlock)) {
    const isTrue = /^(TRUE|T)$/i.test(answerBlock)
    return {
      title,
      text: questionText,
      type: "mcq_single",
      choices: [
        { text: "True", isCorrect: isTrue },
        { text: "False", isCorrect: !isTrue },
      ],
      score: 1,
    }
  }

  // Matching  ->
  if (answerBlock.includes("->")) {
    const pairLines = answerBlock.split(/\n|(?==)/).map((l) => l.trim()).filter(Boolean)
    const pairs: { left: string; right: string }[] = []
    for (const line of pairLines) {
      const m = line.match(/^=?\s*(.+?)\s*->\s*(.+)$/)
      if (m) {
        pairs.push({ left: stripHtml(m[1].trim()), right: stripHtml(m[2].trim()) })
      }
    }
    if (pairs.length > 0) {
      return {
        title,
        text: questionText,
        type: "matching",
        matchingPairs: pairs,
        score: pairs.length,
      }
    }
  }

  // MCQ / Short answer — split on = and ~
  // Tokenize: = correct, ~ wrong, %weight% weighted
  const tokens = tokenizeAnswers(answerBlock)

  if (tokens.length === 0) {
    // Short answer (fill-in-the-blank) → open_ended
    return {
      title,
      text: questionText,
      type: "open_ended",
      correctAnswer: stripHtml(answerBlock.replace(/^=/, "").trim()),
      score: 1,
    }
  }

  const correctCount = tokens.filter((t) => t.isCorrect).length

  if (correctCount > 1) {
    // Multiple correct answers → mcq_multi
    return {
      title,
      text: questionText,
      type: "mcq_multi",
      choices: tokens,
      score: correctCount,
    }
  }

  // Single correct → mcq_single
  return {
    title,
    text: questionText,
    type: "mcq_single",
    choices: tokens,
    score: 1,
  }
}

function tokenizeAnswers(block: string): GIFTChoice[] {
  const choices: GIFTChoice[] = []
  // Split on ~ or = at the start of a token, keeping delimiter
  const parts = block.split(/(?=[=~])/).map((p) => p.trim()).filter(Boolean)

  for (const part of parts) {
    const isCorrect = part.startsWith("=")
    // Remove leading = or ~
    let text = part.slice(1).trim()
    // Remove weight like %50%
    let weight: number | undefined
    const weightMatch = text.match(/^%(-?\d+(?:\.\d+)?)%\s*/)
    if (weightMatch) {
      weight = parseFloat(weightMatch[1])
      text = text.slice(weightMatch[0].length)
    }
    // Remove feedback after #
    const hashIdx = text.indexOf("#")
    if (hashIdx !== -1) text = text.slice(0, hashIdx)
    text = stripHtml(text.trim())
    if (text) choices.push({ text, isCorrect: isCorrect || (weight !== undefined && weight > 0), weight })
  }

  return choices
}
