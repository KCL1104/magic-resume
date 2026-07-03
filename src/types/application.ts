import type { AIModelType } from "@/config/ai";
import type { GenerationLanguage } from "@/lib/ai/language";

/**
 * An Application ties together a target job (JD) with the artifacts generated
 * for it: a tailored resume (referenced by id — it lives as a normal ResumeData
 * in useResumeStore) and a cover letter, plus tracking metadata.
 *
 * The resume is referenced, never embedded, so the existing workbench, preview,
 * templates and export all keep working unchanged on the generated resume.
 */

export type ApplicationStatus =
  | "draft"
  | "ready"
  | "submitted"
  | "interviewing"
  | "offer"
  | "rejected"
  | "archived";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "draft",
  "ready",
  "submitted",
  "interviewing",
  "offer",
  "rejected",
  "archived",
];

export interface JobDescription {
  /** Pasted JD text — the source of truth. */
  raw: string;
  company?: string;
  jobTitle?: string;
  location?: string;
  sourceUrl?: string;
}

export interface CoverLetter {
  /** HTML (Tiptap-compatible), matching the resume rich-text convention. */
  content: string;
  language: GenerationLanguage;
  updatedAt: string;
}

export interface GenerationMeta {
  mode: "single-shot" | "agent";
  modelType: AIModelType;
  model: string;
  language: GenerationLanguage;
  createdAt: string;
}

export interface Application {
  id: string;
  title: string;
  jd: JobDescription;
  /** FK → useResumeStore.resumes */
  resumeId: string;
  coverLetter: CoverLetter | null;
  status: ApplicationStatus;
  language: GenerationLanguage;
  generation?: GenerationMeta;
  createdAt: string;
  updatedAt: string;
}
