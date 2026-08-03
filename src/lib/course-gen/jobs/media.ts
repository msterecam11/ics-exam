// Media job — resolves every image placeholder on a compiled slide.
//
// Locked hybrid policy: search an approved/licensed library FIRST and judge
// candidates on genuine contextual relevance (not keyword similarity); only
// generate with AI when nothing suitable exists. Generated images must pass
// a meaning-fidelity check before they're accepted, and slides flagged
// sensitive (safety/medical/legal/regulatory) are marked for human review.

import { db } from "@/lib/db"
import { MODELS, claudeVisionJSON } from "../ai"
import type { CanvasElement, ImageElement, MediaRequest } from "../primitives"

const BUCKET = "lms-library"

/**
 * Colour intensity applied to every sourced photo.
 *
 * Stock photography comes from hundreds of photographers with different
 * grading — bright and warm next to dark and moody next to washed-out. Across
 * forty slides that reads as a scrapbook, which is the single clearest tell
 * that a deck was assembled rather than designed. Pulling the saturation back
 * a little lets very different sources sit together and keeps the imagery
 * behind the content rather than competing with it.
 *
 * Deliberately one number: it is a render-time filter, not baked into the
 * stored file, so this can move to 1 (untouched) or toward 0 (near-mono,
 * duotone territory) after seeing a real course, with no re-sourcing.
 */
const PHOTO_SATURATION = 0.8

/** Vision scoring is billed per candidate — bound how many we ever check. */
const MAX_CANDIDATES = 6

export interface MediaResult {
  elements: CanvasElement[]
  needsHumanReview: boolean
  unresolved: number
}

/** Provider gate — image generation stays optional until a key is configured. */
function imageProvider(): { kind: "openai"; key: string } | null {
  const key = process.env.OPENAI_API_KEY
  if (key) return { kind: "openai", key }
  return null
}

interface Candidate { url: string; name: string; source: "uploaded" | "pexels" }

/** Images an admin uploaded for this course specifically — always preferred. */
async function searchUploaded(courseId: string): Promise<Candidate[]> {
  const { data } = await db.storage.from(BUCKET).list(`course-gen/media/${courseId}`, { limit: 100 })
  return (data ?? [])
    .filter(f => /\.(png|jpe?g|webp)$/i.test(f.name))
    .map(f => ({
      url: db.storage.from(BUCKET).getPublicUrl(`course-gen/media/${courseId}/${f.name}`).data.publicUrl,
      name: f.name,
      source: "uploaded" as const,
    }))
}

/**
 * Pexels — free, commercially licensed stock photography.
 *
 * Searched BEFORE generating, deliberately. A real photograph cannot
 * hallucinate: it will never invent a runway marking or a garbled sign the
 * way a generative model does. It is also free, where generation is billed
 * per image. Generation stays as the fallback for when nothing suitable
 * exists, which is the exception rather than the rule.
 *
 * Note what this is good FOR: atmosphere, context, the human element. It is
 * not a source of instructional diagrams — those are built from primitives,
 * and data belongs in a chart.
 */
async function searchPexels(req: MediaRequest): Promise<Candidate[]> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return []

  // The subject carries the meaning; purpose adds context. Stock search is
  // keyword-driven, so the noisy parts of a slide title are dropped.
  const query = [req.subject, req.purpose]
    .filter(Boolean).join(" ")
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/).filter(w => w.length > 2).slice(0, 8).join(" ")
  if (!query) return []

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape&size=large`
    const res = await fetch(url, { headers: { Authorization: key } })
    if (!res.ok) {
      console.error("[course-gen] pexels search failed:", res.status, await res.text().catch(() => ""))
      return []
    }
    const json = await res.json()
    return (json?.photos ?? []).map((p: any) => ({
      // "large" is ~1880px wide — ample for a 1280x720 slide and for print,
      // without pulling multi-megabyte originals through the vision scorer.
      url: p?.src?.large ?? p?.src?.original,
      name: p?.alt || `pexels-${p?.id}`,
      source: "pexels" as const,
    })).filter((c: Candidate) => !!c.url)
  } catch (err) {
    console.error("[course-gen] pexels search error:", err)
    return []
  }
}

/** Course uploads first, then stock. Generation only if both come up short. */
async function findCandidates(courseId: string, req: MediaRequest): Promise<Candidate[]> {
  const uploaded = await searchUploaded(courseId)
  const stock = await searchPexels(req)
  return [...uploaded, ...stock]
}

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > 4_000_000) return null // keep vision payloads sane
    return buf.toString("base64")
  } catch { return null }
}

/** Contextual relevance judgement — not keyword matching. */
async function scoreCandidate(imageB64: string, req: MediaRequest, slideTitle: string): Promise<number> {
  try {
    const verdict = await claudeVisionJSON({
      model: MODELS.media_scoring,
      imagesBase64Png: [imageB64],
      label: "Media relevance scoring",
      prompt: `This image is a candidate for a slide in an aviation training course.

Slide title: "${slideTitle}"
What the slide needs: ${req.subject}
Why: ${req.purpose}

Judge whether this image genuinely supports the educational message — not merely whether it is visually similar or shares keywords. Reject stock watermarks, distorted text, or off-topic content.

Return ONLY: { "score": 0-10, "reason": "one short sentence" }`,
    })
    return Number(verdict?.score ?? 0)
  } catch { return 0 }
}

async function generateImage(req: MediaRequest, courseId: string): Promise<string | null> {
  const provider = imageProvider()
  if (!provider) return null
  try {
    const prompt = `Photorealistic, professional aviation training imagery: ${req.subject}. Context: ${req.purpose}. Requirements: real-world accurate, natural lighting, documentary style, NO text or lettering anywhere in the image, no logos, no distorted objects, no surreal elements. Suitable for a corporate aviation training deck.`
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", n: 1 }),
    })
    if (!res.ok) { console.error("[course-gen] image generation failed:", await res.text()); return null }
    const json = await res.json()
    const b64 = json?.data?.[0]?.b64_json
    if (!b64) return null

    const path = `course-gen/media/${courseId}/gen-${Date.now()}.png`
    const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(b64, "base64"), {
      contentType: "image/png", upsert: false,
    })
    if (error) return null
    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch (err) {
    console.error("[course-gen] image generation error:", err)
    return null
  }
}

/** Meaning-fidelity gate for generated imagery. */
async function validateGenerated(imageB64: string, req: MediaRequest, slideTitle: string): Promise<boolean> {
  try {
    const verdict = await claudeVisionJSON({
      model: MODELS.media_scoring,
      imagesBase64Png: [imageB64],
      label: "Generated-image validation",
      prompt: `This AI-generated image is proposed for an aviation training slide.

Slide: "${slideTitle}"
Intended subject: ${req.subject}
Purpose: ${req.purpose}

Verify it supports the intended message WITHOUT changing, exaggerating, or misrepresenting it, and that it contains no garbled text, impossible objects, or visual inconsistencies.

Return ONLY: { "acceptable": true|false, "reason": "one short sentence" }`,
    })
    return verdict?.acceptable === true
  } catch { return false }
}

export async function handleMediaJob(job: any): Promise<MediaResult> {
  const { course_id } = job
  const { elements, slide_title, sensitive } = job.input as {
    elements: CanvasElement[]; slide_title: string; sensitive?: boolean
  }

  const imageEls = elements.filter((e): e is ImageElement => e.type === "image")
  if (imageEls.length === 0) return { elements, needsHumanReview: false, unresolved: 0 }

  let needsHumanReview = false
  let unresolved = 0

  for (const el of imageEls) {
    let req: MediaRequest
    try { req = JSON.parse(el.source_ref ?? "{}") } catch { req = { want: "photo", subject: slide_title, purpose: "" } }
    if (!req.subject) req.subject = slide_title

    // 1 — search first: course uploads, then free stock, judged on relevance.
    // Searched per IMAGE rather than per slide, because two figures on one
    // slide ask for different subjects.
    const candidates = await findCandidates(course_id, req)

    let best: { url: string; score: number } | null = null
    for (const cand of candidates.slice(0, MAX_CANDIDATES)) {
      const b64 = await fetchAsBase64(cand.url)
      if (!b64) continue
      const score = await scoreCandidate(b64, req, slide_title)
      if (!best || score > best.score) best = { url: cand.url, score }
      if (score >= 8) break // clearly good enough; stop burning calls
    }

    if (best && best.score >= 6) {
      el.url = best.url
      el.source = "library"
      el.source_ref = req.subject
      el.review_status = "auto_approved"
      el.effects = { ...(el.effects ?? {}), saturate: PHOTO_SATURATION }
      continue
    }

    // 2 — generation fallback (only when nothing suitable was found)
    const genUrl = await generateImage(req, course_id)
    if (!genUrl) { unresolved++; continue }

    // 3 — validation gate
    const genB64 = await fetchAsBase64(genUrl)
    const ok = genB64 ? await validateGenerated(genB64, req, slide_title) : false
    if (!ok) { unresolved++; continue }

    el.url = genUrl
    el.source = "generated"
    el.source_ref = req.subject
    el.review_status = sensitive ? "needs_human_review" : "auto_approved"
    // Same treatment as sourced photography, so a generated fallback sitting
    // between two stock photos doesn't announce itself by being more vivid.
    el.effects = { ...(el.effects ?? {}), saturate: PHOTO_SATURATION }
    if (sensitive) needsHumanReview = true
  }

  return { elements, needsHumanReview, unresolved }
}
