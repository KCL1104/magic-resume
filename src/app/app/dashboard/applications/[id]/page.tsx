import { useEffect } from "react";
import { ArrowLeft, ExternalLink, Sparkles } from "lucide-react";
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
import { cn } from "@/lib/utils";
import RichTextEditor from "@/components/shared/rich-editor/RichEditor";
import ResumeTemplateComponent from "@/components/templates";
import { DEFAULT_TEMPLATES } from "@/config";
import { useApplicationStore } from "@/store/useApplicationStore";
import { useResumeStore } from "@/store/useResumeStore";
import { APPLICATION_STATUSES } from "@/types/application";
import { LANGUAGE_LABEL } from "@/lib/ai/language";

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

        <div className="ml-auto">
          <Button onClick={openInEditor} disabled={!resume}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t("dashboard.applications.openResume")}
          </Button>
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
