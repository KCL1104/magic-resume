import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Upload, FileText, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { useTranslations } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getAICredentials } from "@/lib/ai/client";
import {
  GENERATION_LANGUAGE_OPTIONS,
  LANGUAGE_LABEL,
  type GenerationLanguage,
} from "@/lib/ai/language";
import { useAIConfiguration } from "@/hooks/useAIConfiguration";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { useResumeStore } from "@/store/useResumeStore";
import { createResumeFromAIResult } from "@/app/app/dashboard/resumes/utils";
import { initialResumeState, initialResumeStateEn } from "@/config/initialResumeData";
import { extractImagesFromPdf, extractTextFromPdf } from "@/lib/pdf";

interface GenerateResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional hook so a parent (e.g. Applications) can persist the result. */
  onGenerated?: (payload: {
    resumeId: string;
    resume: any;
    coverLetter: string;
    jd: string;
    language: GenerationLanguage;
  }) => void;
  /** When false, the dialog does not navigate to the workbench itself. */
  navigateOnApply?: boolean;
}

interface GenerateResult {
  resume: any;
  coverLetter: string;
}

const READ_AS_TEXT = [".md", ".markdown", ".txt", ".html", ".htm"];

export default function GenerateResumeDialog({
  open,
  onOpenChange,
  onGenerated,
  navigateOnApply = true,
}: GenerateResumeDialogProps) {
  const t = useTranslations("dashboard.generate");
  const router = useRouter();
  const { checkConfiguration } = useAIConfiguration();
  const addResume = useResumeStore((s) => s.addResume);
  const setActiveResume = useResumeStore((s) => s.setActiveResume);
  const storedLanguage = useAIConfigStore((s) => s.generationLanguage);
  const setStoredLanguage = useAIConfigStore((s) => s.setGenerationLanguage);

  const [jd, setJd] = useState("");
  const [pastedResume, setPastedResume] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [language, setLanguage] = useState<GenerationLanguage>(storedLanguage);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setJd("");
      setPastedResume("");
      setFile(null);
      setFileText("");
      setResult(null);
      setIsGenerating(false);
      setCopied(false);
    }
  }, [open]);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;

    const lower = picked.name.toLowerCase();
    setFile(picked);
    if (READ_AS_TEXT.some((ext) => lower.endsWith(ext))) {
      try {
        setFileText(await picked.text());
      } catch {
        setFileText("");
      }
    } else {
      // PDF (or anything else) is resolved to text/images at generate time.
      setFileText("");
    }
  };

  const resolveOldResume = async (modelType: string) => {
    const isPdf = file && file.name.toLowerCase().endsWith(".pdf");
    let oldResumeImages: string[] | undefined;
    const textParts: string[] = [];

    if (pastedResume.trim()) textParts.push(pastedResume.trim());
    if (fileText.trim()) textParts.push(fileText.trim());

    if (isPdf && file) {
      if (modelType === "gemini") {
        oldResumeImages = await extractImagesFromPdf(file);
      } else {
        const pdfText = await extractTextFromPdf(file);
        if (pdfText) textParts.push(pdfText);
      }
    }

    return {
      oldResumeText: textParts.join("\n\n") || undefined,
      oldResumeImages,
    };
  };

  const handleGenerate = async () => {
    if (!jd.trim()) {
      toast.error(t("errors.jdRequired"));
      return;
    }
    if (!checkConfiguration()) return;

    const creds = getAICredentials();
    if (!creds.apiKey) {
      toast.error(t("errors.jdRequired"));
      return;
    }

    setIsGenerating(true);
    setResult(null);
    abortRef.current = new AbortController();

    try {
      const { oldResumeText, oldResumeImages } = await resolveOldResume(
        creds.modelType
      );

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: creds.apiKey,
          model: creds.model,
          modelType: creds.modelType,
          apiEndpoint: creds.apiEndpoint,
          jd: jd.trim(),
          oldResumeText,
          oldResumeImages,
          language,
        }),
        signal: abortRef.current.signal,
      });

      const data = await response.json();
      if (!response.ok || data?.error) {
        const message =
          typeof data?.error === "string"
            ? data.error
            : data?.error?.message || t("errors.generateFailed");
        throw new Error(message);
      }
      if (!data?.resume) throw new Error(t("errors.generateFailed"));

      setResult({ resume: data.resume, coverLetter: data.coverLetter || "" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Generate error:", error);
      toast.error(
        error instanceof Error ? error.message : t("errors.generateFailed")
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    // Use a language-matched seed so section headers (Skills/Experience vs
    // 专业技能/工作经验) match the generated content language.
    const seed = language.startsWith("zh")
      ? initialResumeState
      : initialResumeStateEn;
    const resume = createResumeFromAIResult(
      result.resume,
      result.resume?.title || "",
      seed
    );
    const resumeId = addResume(resume);
    setActiveResume(resumeId);
    onGenerated?.({
      resumeId,
      resume,
      coverLetter: result.coverLetter,
      jd: jd.trim(),
      language,
    });
    onOpenChange(false);
    if (navigateOnApply) {
      toast.success(t("applied"));
      router.push({ to: "/app/workbench/$id", params: { id: resumeId } });
    }
  };

  const handleCopyCoverLetter = async () => {
    if (!result?.coverLetter) return;
    try {
      await navigator.clipboard.writeText(result.coverLetter);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("errors.copyFailed"));
    }
  };

  const exp = Array.isArray(result?.resume?.experience)
    ? result?.resume.experience.length
    : 0;
  const proj = Array.isArray(result?.resume?.projects)
    ? result?.resume.projects.length
    : 0;
  const skills = Array.isArray(result?.resume?.skills)
    ? result?.resume.skills.length
    : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isGenerating) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[860px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="grid gap-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="gen-jd">
                {t("jdLabel")} <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="gen-jd"
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                disabled={isGenerating}
                rows={6}
                placeholder={t("jdPlaceholder")}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("sourceLabel")}</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.html,.htm,.md,.markdown,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isGenerating}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {t("uploadButton")}
                </Button>
                {file && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    {file.name}
                  </span>
                )}
              </div>
              <Textarea
                value={pastedResume}
                onChange={(e) => setPastedResume(e.target.value)}
                disabled={isGenerating}
                rows={3}
                placeholder={t("pastePlaceholder")}
                className="resize-none"
              />
            </div>

            <div className="flex items-end justify-between gap-4">
              <div className="space-y-2">
                <Label>{t("languageLabel")}</Label>
                <Select
                  value={language}
                  onValueChange={(v) => {
                    setLanguage(v as GenerationLanguage);
                    setStoredLanguage(v as GenerationLanguage);
                  }}
                  disabled={isGenerating}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERATION_LANGUAGE_OPTIONS.map((code) => (
                      <SelectItem key={code} value={code}>
                        {LANGUAGE_LABEL[code]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !jd.trim()}
                className="h-11 min-w-[140px] bg-gradient-to-r from-[#9333EA] to-[#EC4899] text-white hover:opacity-90"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("generating")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {t("generateButton")}
                  </span>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 py-2">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("resultResumeLabel")}
              </div>
              <div className="mt-1 text-lg font-semibold">
                {result.resume?.title || result.resume?.basic?.name || "Resume"}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-background px-2.5 py-1 border border-border">
                  {t("stat.experience", { count: exp })}
                </span>
                <span className="rounded-full bg-background px-2.5 py-1 border border-border">
                  {t("stat.projects", { count: proj })}
                </span>
                <span className="rounded-full bg-background px-2.5 py-1 border border-border">
                  {t("stat.skills", { count: skills })}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("resultCoverLetterLabel")}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyCoverLetter}
                  className="h-7 text-xs"
                >
                  {copied ? (
                    <Check className="mr-1 h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy className="mr-1 h-3.5 w-3.5" />
                  )}
                  {copied ? t("copied") : t("copy")}
                </Button>
              </div>
              <div
                className={cn(
                  "max-h-[280px] overflow-auto rounded-xl border p-4",
                  "bg-primary/[0.03] dark:bg-primary/[0.08] border-primary/20"
                )}
              >
                <Streamdown className="prose dark:prose-invert max-w-none text-sm">
                  {result.coverLetter || t("noCoverLetter")}
                </Streamdown>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setResult(null)}
                disabled={isGenerating}
              >
                {t("regenerate")}
              </Button>
              <Button
                onClick={handleApply}
                className="bg-primary text-white hover:bg-primary/90"
              >
                {t("openInEditor")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
