import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

const MAX_PDF_PAGES = 3;
const PDF_IMAGE_QUALITY = 0.82;
const PDF_MAX_IMAGE_WIDTH = 1600;

const loadPdf = async (file: File) => {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as any;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  return loadingTask.promise;
};

/**
 * Rasterize the first pages of a PDF to JPEG data-URLs. Used for Gemini vision
 * ingestion (higher fidelity than text extraction for multi-column resumes).
 * Extracted from ResumeWorkbench so the generate dialog can reuse it verbatim.
 */
export const extractImagesFromPdf = async (file: File): Promise<string[]> => {
  const pdf = await loadPdf(file);
  const pageImages: string[] = [];
  const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 2 });
    const widthScale = Math.min(1, PDF_MAX_IMAGE_WIDTH / baseViewport.width);
    const viewport = page.getViewport({ scale: 2 * widthScale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Unable to create canvas context");

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    await page.render({ canvasContext: context, viewport }).promise;
    pageImages.push(canvas.toDataURL("image/jpeg", PDF_IMAGE_QUALITY));
    canvas.width = 0;
    canvas.height = 0;
  }

  return pageImages;
};

/**
 * Extract plain text from a PDF via pdfjs getTextContent. Provider-agnostic
 * fallback used when the selected model has no vision path.
 */
export const extractTextFromPdf = async (file: File): Promise<string> => {
  const pdf = await loadPdf(file);
  const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const parts: string[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
      .join(" ");
    parts.push(pageText);
  }

  return parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
};
