import Groq from "groq-sdk"

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export interface ScoringResult {
  score: number
  justification: string
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

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 200,
  })

  const raw = completion.choices[0]?.message?.content?.trim() ?? ""

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()

  try {
    const parsed = JSON.parse(cleaned) as { score: number; justification: string }
    const score = Math.min(Math.max(0, parsed.score), maxScore)
    return {
      score: Math.round(score * 100) / 100,
      justification: parsed.justification ?? "Evaluated by AI.",
    }
  } catch {
    // Fallback: extract with regex
    const scoreMatch = cleaned.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/)
    const justMatch = cleaned.match(/"justification"\s*:\s*"([^"]+)"/)
    const score = scoreMatch ? Math.min(parseFloat(scoreMatch[1]), maxScore) : 0
    return {
      score: Math.round(score * 100) / 100,
      justification: justMatch?.[1] ?? "AI evaluation completed.",
    }
  }
}
