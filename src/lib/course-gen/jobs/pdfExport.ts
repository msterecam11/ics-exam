// PDF export — a real backend render, not browser print-to-PDF.
//
// Reuses the same slide renderer as QA and the editor, so the exported deck
// is pixel-identical to what the designer approved. Runs on the worker
// queue because it is the heaviest browser work in the system and must be
// serialized against QA screenshots on a 512MB instance.

import { db } from "@/lib/db";
import { getBrowser } from "@/lib/browser";
import { PDFDocument } from "pdf-lib";
import { renderSlideHtml } from "../slideHtml";
import { SLIDE_W, SLIDE_H, type ThemeTokens } from "../tokens";
import type { Master } from "../theme1";
import type { CanvasElement } from "../primitives";

const BUCKET = "lms-library";

export async function handlePdfExportJob(
  job: any,
): Promise<{ file_url: string; pages: number }> {
  const exportId: string = job.input?.export_id;
  const courseId: string = job.course_id;
  const moduleId: string | null = job.input?.module_id ?? null;

  const { data: course } = await db
    .from("cg_courses")
    .select(
      "id, title, partner_logo_light_url, partner_logo_dark_url, cg_themes(tokens, layout_templates)",
    )
    .eq("id", courseId)
    .single();
  if (!course) throw new Error("Course not found");

  const theme = (course as any).cg_themes;
  const tokens = theme?.tokens as ThemeTokens;
  const masters = (theme?.layout_templates ?? {}) as Record<string, Master>;

  // Whole course or a single module, in reading order either way.
  let modQuery = db
    .from("cg_modules")
    .select("id, title, order_index")
    .eq("course_id", courseId);
  if (moduleId) modQuery = modQuery.eq("id", moduleId);
  const { data: modules } = await modQuery.order("order_index");
  if (!modules?.length) throw new Error("Nothing to export");

  const port = process.env.PORT ?? "3000";
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${port}`;

  const browser = await getBrowser();
  let pageCount = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: SLIDE_W,
      height: SLIDE_H,
      deviceScaleFactor: 2,
    });
    const merged = await PDFDocument.create();

    for (const mod of modules) {
      const { data: slides } = await db
        .from("cg_pages")
        .select("id, order_index, layout_kind, elements")
        .eq("module_id", mod.id)
        .order("order_index");

      for (const slide of slides ?? []) {
        const master = masters[slide.layout_kind] ?? masters.content_white;
        const html = renderSlideHtml({
          elements: (slide.elements ?? []) as CanvasElement[],
          master,
          tokens,
          origin,
          pageNumber: slide.order_index + 1,
          moduleNumber: mod.order_index,
          partnerLogoLight: course.partner_logo_light_url,
          partnerLogoDark: course.partner_logo_dark_url,
        });
        // "load" (not networkidle0): fonts are inlined so the only network work
        // is the theme's background/logo images, and "load" settles once those
        // finish either way. networkidle0 waits for a quiet period that a dev
        // server's keep-alive connections can prevent, hanging the render.
        await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
        await page.evaluate(async () => {
          await (document as any).fonts?.ready;
        });

        // Exact slide-sized page — no margins, no scaling.
        const bytes = await page.pdf({
          width: `${SLIDE_W}px`,
          height: `${SLIDE_H}px`,
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
          pageRanges: "1",
        });
        const doc = await PDFDocument.load(bytes);
        const [copied] = await merged.copyPages(doc, [0]);
        merged.addPage(copied);
        pageCount++;

        await db
          .from("cg_generation_jobs")
          .update({
            current_step: `Rendering slide ${pageCount}`,
            progress_pct: Math.min(95, pageCount),
          })
          .eq("id", job.id);
      }
    }

    await page.close();
    const pdfBytes = await merged.save();

    const safeTitle = course.title
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 60);
    const path = `course-gen/exports/${courseId}/${safeTitle}-${Date.now()}.pdf`;
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await db
      .from("cg_exports")
      .update({ status: "done", file_url: url })
      .eq("id", exportId);

    return { file_url: url, pages: pageCount };
  } catch (err) {
    await db.from("cg_exports").update({ status: "failed" }).eq("id", exportId);
    throw err;
  } finally {
    await browser.close();
  }
}
