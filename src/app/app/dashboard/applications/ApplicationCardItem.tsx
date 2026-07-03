import { motion } from "framer-motion";
import { Trash2, FileText, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types/application";
import { LANGUAGE_LABEL } from "@/lib/ai/language";
import type { Translator } from "@/i18n/compat/utils";

const STATUS_STYLE: Record<ApplicationStatus, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  ready: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  submitted: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  interviewing: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  offer: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300",
  archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

interface Props {
  application: Application;
  t: Translator;
  onOpen: () => void;
  onDelete: () => void;
}

export const ApplicationCardItem = ({ application, t, onOpen, onDelete }: Props) => {
  const created = application.createdAt
    ? new Date(application.createdAt).toLocaleDateString()
    : "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ scale: 1.02 }}
    >
      <Card
        className="group relative min-h-[180px] cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-md"
        onClick={onOpen}
      >
        <CardContent className="flex h-full flex-col p-5">
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                STATUS_STYLE[application.status]
              )}
            >
              {t(`dashboard.applications.status.${application.status}`)}
            </span>
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label={t("common.delete")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <h3 className="mt-3 line-clamp-2 flex-1 text-base font-semibold text-foreground">
            {application.title}
          </h3>

          {application.jd?.raw && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {application.jd.raw}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {LANGUAGE_LABEL[application.language] || application.language}
            </span>
            {created && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {created}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
