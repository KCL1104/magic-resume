import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import RichTextEditor from "@/components/shared/rich-editor/RichEditor";
import ResumeTemplateComponent from "@/components/templates";
import { DEFAULT_TEMPLATES } from "@/config";
import { useApplicationStore } from "@/store/useApplicationStore";
import { useResumeStore } from "@/store/useResumeStore";
import { APPLICATION_STATUSES } from "@/types/application";
import { LANGUAGE_LABEL } from "@/lib/ai/language";
import { exportToPdf } from "@/utils/export";
import {
  exportCoverLetterToPdf,
  exportCoverLetterAsMarkdown,
  exportCoverLetterToBrowserPrint,
} from "@/utils/coverLetter";

const RESUME_EXPORT_ID = "application-resume-export";

export default function ApplicationDetailPage({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();

  const application = useApplicationStore((s) => s.applications[id]);
  const setStatus = useApplicationStore((s) => s.setStatus);
  const setTitle = useApplicationStore((s) => s.setTitle);
  const setCoverLetter = useApplicationStore((s) => s.setCoverLetter);
  const setActiveApplication = useApplicationStore((s) => s.setActiveApplication);

  const resume = useResumeStore((s) =>
    application ? s.resumes[application.resumeId] : undefined
  );
  const setActiveResume = useResumeStore((s) => s.setActiveResume);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (application) setActiveApplication(application.id);
  }, [application, setActiveApplication]);

  if (!application) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          {t("dashboard.applications.notFound")}
        </p>
        <Button
          variant="outline"
          onClick={() => router.push("/app/dashboard/applications")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("dashboard.applications.backToList")}
        </Button>
      </div>
    );
  }

  const template =
    DEFAULT_TEMPLATES.find((tpl) => tpl.id === resume?.templateId) ||
    DEFAULT_TEMPLATES[0];

  const openInEditor = () => {
    if (!resume) return;
    setActiveResume(resume.id);
    router.push({ to: "/app/workbench/$id", params: { id: resume.id } });
  };

  const coverHtml = application.coverLetter?.content || "";
  const coverTitle = `${application.title} - Cover Letter`;
  const requireCover = () => {
    if (!coverHtml) {
      toast.error(t("dashboard.applications.export.noCover"));
      return false;
    }
    return true;
  };

  const exportResumePdf = () => {
    if (!resume) return;
    exportToPdf({
      elementId: RESUME_EXPORT_ID,
      title: resume.title,
      pagePadding: resume.globalSettings?.pagePadding ?? 40,
      fontFamily: resume.globalSettings?.fontFamily,
      onStart: () => setExporting(true),
      onEnd: () => setExporting(false),
      successMessage: t("dashboard.applications.export.resumeDone"),
      errorMessage: t("dashboard.applications.export.failed"),
    });
  };

  const exportCoverPdf = () => {
    if (!requireCover()) return;
    exportCoverLetterToPdf({
      html: coverHtml,
      title: coverTitle,
      onStart: () => setExporting(true),
      onEnd: () => setExporting(false),
      successMessage: t("dashboard.applications.export.coverDone"),
      errorMessage: t("dashboard.applications.export.failed"),
    });
  };

  const exportCoverMd = () => {
    if (!requireCover()) return;
    exportCoverLetterAsMarkdown({ html: coverHtml, title: coverTitle });
  };

  const exportCoverPrint = () => {
    if (!requireCover()) return;
    exportCoverLetterToBrowserPrint(coverHtml, coverTitle);
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/app/dashboard/applications")}
          aria-label={t("dashboard.applications.backToList")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Input
          defaultValue={application.title}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== application.title) setTitle(application.id, v);
          }}
          className="h-9 max-w-sm flex-1 font-semibold"
        />

        <Select
          value={application.status}
          onValueChange={(v) => setStatus(application.id, v as any)}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPLICATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`dashboard.applications.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {LANGUAGE_LABEL[application.language] || application.language}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exporting}>
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {t("dashboard.applications.export.label")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                {t("dashboard.applications.export.resumeGroup")}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={exportResumePdf} disabled={!resume}>
                {t("dashboard.applications.export.resumePdf")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {t("dashboard.applications.export.coverGroup")}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={exportCoverPdf}>
                {t("dashboard.applications.export.coverPdf")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportCoverMd}>
                {t("dashboard.applications.export.coverMd")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportCoverPrint}>
                {t("dashboard.applications.export.coverPrint")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={openInEditor} disabled={!resume}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("dashboard.applications.openResume")}
          </Button>
        </div>
      </div>

      {/* Hidden full-size resume for high-fidelity PDF export (unscaled). */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-[-10000px] top-0 opacity-0"
      >
        <div id={RESUME_EXPORT_ID} className="w-[794px] bg-white">
          {resume && (
            <ResumeTemplateComponent data={resume} template={template} />
          )}
        </div>
      </div>

      {/* Body: resume preview | JD + cover letter */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 sm:px-6 lg:grid-cols-2">
        {/* Resume preview */}
        <div className="flex min-h-0 flex-col">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("dashboard.applications.resumePreview")}
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-gray-100 p-4 dark:bg-neutral-900">
            {resume ? (
              <div className="mx-auto w-[794px] max-w-none origin-top scale-[0.68] bg-white shadow">
                <ResumeTemplateComponent data={resume} template={template} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("dashboard.applications.resumeMissing")}
              </p>
            )}
          </div>
        </div>

        {/* JD + cover letter */}
        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("dashboard.applications.jobDescription")}
            </div>
            <div className="max-h-[28%] flex-1 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-4 text-sm text-foreground/80">
              {application.jd?.raw || t("dashboard.applications.noJd")}
            </div>
          </div>

          <div className="flex min-h-0 flex-[2] flex-col">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("dashboard.applications.coverLetter")}
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-background p-1"
              )}
            >
              <RichTextEditor
                content={application.coverLetter?.content || ""}
                onChange={(html) => setCoverLetter(application.id, html)}
                placeholder={t("dashboard.applications.coverLetterPlaceholder")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
