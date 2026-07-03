import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { createMarkdownExit } from "markdown-exit";
import { useTranslations } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import GenerateResumeDialog from "@/components/shared/ai/GenerateResumeDialog";
import { useApplicationStore } from "@/store/useApplicationStore";
import { getAICredentials } from "@/lib/ai/client";
import type { GenerationLanguage } from "@/lib/ai/language";
import { ApplicationCardItem } from "./ApplicationCardItem";

const md = createMarkdownExit({ html: true, breaks: true, linkify: false });

export default function ApplicationsPage() {
  const t = useTranslations();
  const router = useRouter();
  const applications = useApplicationStore((s) => s.applications);
  const createApplication = useApplicationStore((s) => s.createApplication);
  const deleteApplication = useApplicationStore((s) => s.deleteApplication);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);

  const handleGenerated = ({
    resumeId,
    resume,
    coverLetter,
    jd,
    language,
  }: {
    resumeId: string;
    resume: any;
    coverLetter: string;
    jd: string;
    language: GenerationLanguage;
  }) => {
    const creds = getAICredentials();
    const now = new Date().toISOString();
    const html = coverLetter ? md.render(coverLetter) : "";
    const appId = createApplication({
      jd: { raw: jd },
      resumeId,
      language,
      title: resume?.title || "",
      coverLetter: html ? { content: html, language, updatedAt: now } : null,
      generation: {
        mode: "single-shot",
        modelType: creds.modelType,
        model: creds.model,
        language,
        createdAt: now,
      },
      status: "draft",
    });
    router.push({
      to: "/app/dashboard/applications/$id",
      params: { id: appId },
    });
  };

  const items = Object.values(applications).sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() -
      new Date(a.createdAt || 0).getTime()
  );

  return (
    <ScrollArea className="h-[calc(100vh-2rem)] w-full">
      <div className="flex-1 space-y-6 py-8">
        <div className="px-4 sm:px-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              {t("dashboard.applications.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.applications.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex-1 w-full p-3 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsGenerateOpen(true)}
            >
              <Card
                className={cn(
                  "relative border border-dashed cursor-pointer transition-all duration-200 min-h-[180px] flex flex-col",
                  "hover:border-primary/60 hover:bg-primary/5"
                )}
              >
                <CardContent className="flex-1 p-6 text-center flex flex-col items-center justify-center">
                  <div className="mb-3 p-3 rounded-full bg-primary/10">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <CardTitle className="text-lg">
                    {t("dashboard.applications.newApplication")}
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    {t("dashboard.applications.newApplicationDescription")}
                  </CardDescription>
                </CardContent>
              </Card>
            </motion.div>

            <AnimatePresence>
              {items.map((app) => (
                <ApplicationCardItem
                  key={app.id}
                  application={app}
                  t={t}
                  onOpen={() =>
                    router.push({
                      to: "/app/dashboard/applications/$id",
                      params: { id: app.id },
                    })
                  }
                  onDelete={() => deleteApplication(app.id)}
                />
              ))}
            </AnimatePresence>
          </div>

          {items.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              {t("dashboard.applications.empty")}
            </p>
          )}
        </div>

        <GenerateResumeDialog
          open={isGenerateOpen}
          onOpenChange={setIsGenerateOpen}
          navigateOnApply={false}
          onGenerated={handleGenerated}
        />
      </div>
    </ScrollArea>
  );
}
