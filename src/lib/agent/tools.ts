import { createMarkdownExit } from "markdown-exit";
import { generateUUID } from "@/utils/uuid";
import { useResumeStore } from "@/store/useResumeStore";
import { toListHtml } from "@/app/app/dashboard/resumes/utils";

/**
 * The agent tool set. These are the editor's own mutations exposed to the model
 * as function-calling tools. Principles (see design doc §4):
 *  - Fewer, coarser, id-safe tools beat a 1:1 dump of ~40 store actions.
 *  - The EXECUTOR generates UUIDs, never the model (a wrong id silently appends
 *    a duplicate via the store's upsert actions).
 *  - Batch-replace over upsert: the model sends the full array it wants.
 *  - Rich-text fields are stored as HTML; the model speaks arrays / markdown and
 *    the executor converts.
 */

const md = createMarkdownExit({ html: true, breaks: true, linkify: false });

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const strArray = { type: "array", items: { type: "string" } };

export const AGENT_TOOLS: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "get_current_resume",
      description:
        "Return the current resume as JSON so you can inspect existing content before editing. Call this first if you are unsure of the current state.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_basic_info",
      description:
        "Update basic personal info. Only include the fields you want to change.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string", description: "professional headline / role" },
          email: { type: "string" },
          phone: { type: "string" },
          location: { type: "string" },
          employementStatus: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_experiences",
      description:
        "Replace the ENTIRE work-experience list. Provide every experience you want to keep (existing + new + edited).",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                company: { type: "string" },
                position: { type: "string" },
                date: { type: "string", description: "e.g. '2020 - 2024'" },
                details: {
                  ...strArray,
                  description: "achievement-oriented bullet points",
                },
              },
              required: ["company", "position"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_projects",
      description:
        "Replace the ENTIRE projects list. Provide every project you want to keep.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                date: { type: "string" },
                description: { ...strArray, description: "bullet points" },
                link: { type: "string" },
                linkLabel: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_education",
      description:
        "Replace the ENTIRE education list. Provide every entry you want to keep.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                school: { type: "string" },
                major: { type: "string" },
                degree: { type: "string" },
                startDate: { type: "string" },
                endDate: { type: "string" },
                gpa: { type: "string" },
                description: { ...strArray },
              },
              required: ["school"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_skills",
      description: "Replace the skills section with this list of skills.",
      parameters: {
        type: "object",
        properties: { skills: strArray },
        required: ["skills"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_self_evaluation",
      description:
        "Set the self-evaluation / professional summary section (markdown allowed).",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_theme_color",
      description: "Set the resume theme color (hex, e.g. '#0047AB').",
      parameters: {
        type: "object",
        properties: { color: { type: "string" } },
        required: ["color"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_resume_title",
      description: "Rename the resume (the document title, not the person's job title).",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_section",
      description:
        "Show or hide a resume section by id (skills, experience, projects, education, selfEvaluation, ...).",
      parameters: {
        type: "object",
        properties: {
          sectionId: { type: "string" },
          visible: { type: "boolean" },
        },
        required: ["sectionId", "visible"],
      },
    },
  },
];

// ---- helpers to present the resume to the model as compact JSON ----

const stripToLines = (html?: string): string[] => {
  if (!html) return [];
  const withoutTags = html
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return withoutTags
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
};

export const serializeResumeForModel = () => {
  const resume = useResumeStore.getState().activeResume;
  if (!resume) return null;
  return {
    title: resume.title,
    basic: {
      name: resume.basic.name,
      title: resume.basic.title,
      email: resume.basic.email,
      phone: resume.basic.phone,
      location: resume.basic.location,
      employementStatus: resume.basic.employementStatus,
    },
    skills: stripToLines(resume.skillContent),
    selfEvaluation: stripToLines(resume.selfEvaluationContent).join(" "),
    experience: resume.experience.map((e) => ({
      company: e.company,
      position: e.position,
      date: e.date,
      details: stripToLines(e.details),
    })),
    projects: resume.projects.map((p) => ({
      name: p.name,
      role: p.role,
      date: p.date,
      description: stripToLines(p.description),
    })),
    education: resume.education.map((ed) => ({
      school: ed.school,
      major: ed.major,
      degree: ed.degree,
      startDate: ed.startDate,
      endDate: ed.endDate,
    })),
    sections: resume.menuSections.map((s) => ({
      id: s.id,
      title: s.title,
      enabled: s.enabled,
    })),
    themeColor: resume.globalSettings?.themeColor,
  };
};

const pick = <T extends Record<string, any>>(obj: T, keys: string[]) => {
  const out: Record<string, any> = {};
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k];
  return out;
};

const hasCJK = (s?: string) => /[一-鿿]/.test(s || "");

/**
 * Ensure a resume section exists and is enabled, so content written by a tool
 * (e.g. self-evaluation) actually renders. Adds the section if missing, using a
 * title whose language matches the resume's existing section titles.
 */
const ensureSectionEnabled = (
  sectionId: string,
  enTitle: string,
  zhTitle: string,
  icon: string
) => {
  const store = useResumeStore.getState();
  const resume = store.activeResume;
  if (!resume) return;
  const sections = resume.menuSections || [];
  const existing = sections.find((s) => s.id === sectionId);
  if (existing) {
    if (!existing.enabled) store.toggleSectionVisibility(sectionId);
    return;
  }
  const anyCJK = sections.some((s) => hasCJK(s.title));
  const maxOrder = sections.reduce(
    (m, s) => Math.max(m, s.order ?? 0),
    0
  );
  store.updateMenuSections([
    ...sections,
    {
      id: sectionId,
      title: anyCJK ? zhTitle : enTitle,
      icon,
      enabled: true,
      order: maxOrder + 1,
    },
  ]);
};

/**
 * Execute one tool call against the active resume. Returns a short human/model
 * readable result string that is fed back into the conversation.
 */
export const executeAgentTool = (
  name: string,
  args: Record<string, any>
): string => {
  const store = useResumeStore.getState();

  if (name === "get_current_resume") {
    const data = serializeResumeForModel();
    return data ? JSON.stringify(data) : "No active resume.";
  }

  if (!store.activeResume) return "Error: no active resume to edit.";

  switch (name) {
    case "set_basic_info": {
      const fields = pick(args, [
        "name",
        "title",
        "email",
        "phone",
        "location",
        "employementStatus",
      ]);
      store.updateBasicInfo(fields);
      return `Updated basic info: ${Object.keys(fields).join(", ") || "(none)"}.`;
    }
    case "set_experiences": {
      const items = Array.isArray(args.items) ? args.items : [];
      store.updateExperienceBatch(
        items.map((i: any) => ({
          id: generateUUID(),
          company: String(i?.company ?? ""),
          position: String(i?.position ?? ""),
          date: String(i?.date ?? ""),
          details: toListHtml(i?.details),
          visible: true,
        }))
      );
      return `Set ${items.length} work experience item(s).`;
    }
    case "set_projects": {
      const items = Array.isArray(args.items) ? args.items : [];
      store.updateProjectsBatch(
        items.map((i: any) => ({
          id: generateUUID(),
          name: String(i?.name ?? ""),
          role: String(i?.role ?? ""),
          date: String(i?.date ?? ""),
          description: toListHtml(i?.description),
          link: i?.link ? String(i.link) : undefined,
          linkLabel: i?.linkLabel ? String(i.linkLabel) : undefined,
          visible: true,
        }))
      );
      return `Set ${items.length} project(s).`;
    }
    case "set_education": {
      const items = Array.isArray(args.items) ? args.items : [];
      store.updateEducationBatch(
        items.map((i: any) => ({
          id: generateUUID(),
          school: String(i?.school ?? ""),
          major: String(i?.major ?? ""),
          degree: String(i?.degree ?? ""),
          startDate: String(i?.startDate ?? ""),
          endDate: String(i?.endDate ?? ""),
          gpa: i?.gpa ? String(i.gpa) : undefined,
          description: toListHtml(i?.description),
          visible: true,
        }))
      );
      return `Set ${items.length} education item(s).`;
    }
    case "set_skills": {
      const skills = Array.isArray(args.skills) ? args.skills : [];
      store.updateSkillContent(toListHtml(skills));
      return `Set ${skills.length} skill(s).`;
    }
    case "set_self_evaluation": {
      const html = args.text ? md.render(String(args.text)) : "";
      store.updateSelfEvaluationContent(html);
      // Make sure the section is present + visible so it renders.
      ensureSectionEnabled("selfEvaluation", "Self Evaluation", "自我评价", "💬");
      return "Updated self-evaluation.";
    }
    case "set_theme_color": {
      store.setThemeColor(String(args.color ?? "#000000"));
      return `Theme color set to ${args.color}.`;
    }
    case "set_resume_title": {
      store.updateResumeTitle(String(args.title ?? ""));
      return `Renamed resume to "${args.title}".`;
    }
    case "toggle_section": {
      const resume = store.activeResume;
      const section = resume?.menuSections.find((s) => s.id === args.sectionId);
      if (!section) return `Error: no section with id "${args.sectionId}".`;
      if (!!section.enabled !== !!args.visible) {
        store.toggleSectionVisibility(String(args.sectionId));
      }
      return `Section "${args.sectionId}" is now ${args.visible ? "visible" : "hidden"}.`;
    }
    default:
      return `Error: unknown tool "${name}".`;
  }
};
