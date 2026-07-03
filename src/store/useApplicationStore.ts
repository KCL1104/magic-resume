import { create } from "zustand";
import { toast } from "sonner";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import { generateUUID } from "@/utils/uuid";
import type {
  Application,
  ApplicationStatus,
  CoverLetter,
  JobDescription,
} from "@/types/application";
import type { GenerationLanguage } from "@/lib/ai/language";
import type { GenerationMeta } from "@/types/application";

interface ApplicationStore {
  applications: Record<string, Application>;
  activeApplicationId: string | null;

  createApplication: (input: {
    jd: JobDescription;
    resumeId: string;
    language: GenerationLanguage;
    title?: string;
    coverLetter?: CoverLetter | null;
    generation?: GenerationMeta;
    status?: ApplicationStatus;
  }) => string;
  updateApplication: (id: string, patch: Partial<Application>) => void;
  attachResume: (id: string, resumeId: string) => void;
  setCoverLetter: (id: string, content: string) => void;
  setStatus: (id: string, status: ApplicationStatus) => void;
  setTitle: (id: string, title: string) => void;
  deleteApplication: (id: string) => void;
  setActiveApplication: (id: string | null) => void;
}

type Persisted = Pick<ApplicationStore, "applications" | "activeApplicationId">;

const warned = new Set<string>();
const createSafeLocalStorage = (): StateStorage => ({
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      if (!warned.has(name)) {
        warned.add(name);
        console.warn(`[application-store] Failed to persist "${name}".`, error);
        if (typeof window !== "undefined") {
          const isEn = document.cookie.includes("NEXT_LOCALE=en");
          toast.error(
            isEn
              ? "Storage is full — recent changes are only kept for this session."
              : "存储空间已满，最近的修改仅保留在本次会话中。"
          );
        }
      }
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
});

export const useApplicationStore = create(
  persist<ApplicationStore, [], [], Persisted>(
    (set, get) => ({
      applications: {},
      activeApplicationId: null,

      createApplication: ({
        jd,
        resumeId,
        language,
        title,
        coverLetter = null,
        generation,
        status = "draft",
      }) => {
        const id = generateUUID();
        const now = new Date().toISOString();
        const application: Application = {
          id,
          title:
            title?.trim() ||
            jd.jobTitle?.trim() ||
            (jd.company?.trim() ? jd.company.trim() : "") ||
            (jd.raw.trim().split(/\r?\n/)[0] || "Application").slice(0, 60),
          jd,
          resumeId,
          coverLetter,
          status,
          language,
          generation,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          applications: { ...state.applications, [id]: application },
          activeApplicationId: id,
        }));
        return id;
      },

      updateApplication: (id, patch) => {
        set((state) => {
          const app = state.applications[id];
          if (!app) return state;
          return {
            applications: {
              ...state.applications,
              [id]: { ...app, ...patch, updatedAt: new Date().toISOString() },
            },
          };
        });
      },

      attachResume: (id, resumeId) => {
        get().updateApplication(id, { resumeId });
      },

      setCoverLetter: (id, content) => {
        const app = get().applications[id];
        if (!app) return;
        const now = new Date().toISOString();
        get().updateApplication(id, {
          coverLetter: {
            content,
            language: app.coverLetter?.language ?? app.language,
            updatedAt: now,
          },
        });
      },

      setStatus: (id, status) => {
        get().updateApplication(id, { status });
      },

      setTitle: (id, title) => {
        get().updateApplication(id, { title });
      },

      deleteApplication: (id) => {
        set((state) => {
          const { [id]: _removed, ...rest } = state.applications;
          return {
            applications: rest,
            activeApplicationId:
              state.activeApplicationId === id
                ? null
                : state.activeApplicationId,
          };
        });
      },

      setActiveApplication: (id) => set({ activeApplicationId: id }),
    }),
    {
      name: "application-storage",
      storage: createJSONStorage<Persisted>(() => createSafeLocalStorage()),
      partialize: (state): Persisted => ({
        applications: state.applications,
        activeApplicationId: state.activeApplicationId,
      }),
    }
  )
);
