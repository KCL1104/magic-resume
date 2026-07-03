import { toast } from "sonner";
import TurndownService from "turndown";
import { PDF_EXPORT_CONFIG } from "@/config";
import { downloadBlob, getSafeFileName } from "@/utils/export";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
});

const LETTER_STYLES = `
  html, body { background: #ffffff !important; margin: 0; padding: 0; }
  body {
    font-family: Georgia, "Times New Roman", "Songti SC", "PingFang SC", serif;
    color: #1a1a1a;
    line-height: 1.7;
    font-size: 15px;
  }
  .cover-letter { max-width: 720px; margin: 0 auto; }
  .cover-letter p { margin: 0 0 14px; }
  .cover-letter ul, .cover-letter ol { margin: 0 0 14px; padding-left: 22px; }
  .cover-letter strong { font-weight: 700; }
  .cover-letter a { color: #1a1a1a; text-decoration: underline; }
`;

interface CoverLetterExportOptions {
  html: string;
  title: string;
  onStart?: () => void;
  onEnd?: () => void;
  successMessage?: string;
  errorMessage?: string;
}

/** Export the cover letter as a PDF via the shared server-side renderer. */
export const exportCoverLetterToPdf = async ({
  html,
  title,
  onStart,
  onEnd,
  successMessage,
  errorMessage,
}: CoverLetterExportOptions) => {
  onStart?.();
  try {
    const content = `<div class="cover-letter">${html}</div>`;
    const response = await fetch(PDF_EXPORT_CONFIG.SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, styles: LETTER_STYLES, margin: 48 }),
      mode: "cors",
      signal: AbortSignal.timeout(PDF_EXPORT_CONFIG.TIMEOUT),
    });
    if (!response.ok) {
      throw new Error(`PDF generation failed: ${response.status}`);
    }
    const blob = await response.blob();
    downloadBlob(blob, `${getSafeFileName(title)}.pdf`);
    if (successMessage) toast.success(successMessage);
  } catch (error) {
    console.error("Cover letter PDF export error:", error);
    if (errorMessage) toast.error(errorMessage);
  } finally {
    onEnd?.();
  }
};

/** Download the cover letter as Markdown (HTML -> MD). */
export const exportCoverLetterAsMarkdown = ({
  html,
  title,
}: Pick<CoverLetterExportOptions, "html" | "title">) => {
  const md = turndown.turndown(html || "");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, `${getSafeFileName(title)}.md`);
};

/** Browser-print fallback (opens the print dialog with a clean letter layout). */
export const exportCoverLetterToBrowserPrint = (html: string, title: string) => {
  const frame = document.createElement("iframe");
  frame.style.position = "absolute";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.left = "-9999px";
  frame.style.visibility = "hidden";
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  if (!win) {
    document.body.removeChild(frame);
    return;
  }

  win.document.open();
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    @page { size: A4; margin: 18mm; }
    ${LETTER_STYLES}
  </style></head><body><div class="cover-letter">${html}</div></body></html>`);
  win.document.close();

  const printWhenReady = async () => {
    try {
      if (win.document.fonts?.ready) await win.document.fonts.ready;
      win.focus();
      win.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(frame)) document.body.removeChild(frame);
      }, 1000);
    }
  };
  void printWhenReady();
};
