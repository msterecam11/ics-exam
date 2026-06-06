import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "placeholder" })

export interface ScoringResult {
  score: number
  justification: string
}

// Retry with exponential backoff — handles Groq rate limits (429) gracefully
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("rate")
      const isLast = attempt === retries
      if (isLast || !isRateLimit) throw err
      // Wait longer each attempt: 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)))
    }
  }
  throw new Error("Max retries exceeded")
}

export async function scoreOpenEndedAnswer(
  question: string,
  expectedAnswer: string,
  candidateAnswer: string,
  maxScore: number
): Promise<ScoringResult> {
  if (!candidateAnswer.trim()) {
    return { score: 0, justification: "No answer provided." }
  }

  const prompt = `You are an exam evaluator. Score the candidate's answer fairly and objectively.

Question: ${question}
Expected answer / key points: ${expectedAnswer}
Candidate's answer: ${candidateAnswer}
Maximum score: ${maxScore}

Evaluate the answer based on accuracy, completeness, and relevance to the expected answer.
Respond ONLY with valid JSON in this exact format:
{"score": <number between 0 and ${maxScore}>, "justification": "<one sentence explanation>"}`

  try {
    const completion = await withRetry(() =>
      groq.chat.completions.create({
        model      : "llama-3.1-8b-instant",
        messages   : [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens : 200,
      })
    )

    const raw     = completion.choices[0]?.message?.content?.trim() ?? ""
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()

    try {
      const parsed = JSON.parse(cleaned) as { score: number; justification: string }
      const score  = Math.min(Math.max(0, parsed.score), maxScore)
      return {
        score        : Math.round(score * 100) / 100,
        justification: parsed.justification ?? "Evaluated by AI.",
      }
    } catch {
      const scoreMatch = cleaned.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/)
      const justMatch  = cleaned.match(/"justification"\s*:\s*"([^"]+)"/)
      const score      = scoreMatch ? Math.min(parseFloat(scoreMatch[1]), maxScore) : 0
      return {
        score        : Math.round(score * 100) / 100,
        justification: justMatch?.[1] ?? "AI evaluation completed.",
      }
    }
  } catch {
    // AI unavailable — return 0 with a clear message so admin can manually review
    return {
      score        : 0,
      justification: "AI scoring temporarily unavailable. Please review and score manually.",
    }
  }
}
