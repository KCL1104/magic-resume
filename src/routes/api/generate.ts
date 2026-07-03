import { createFileRoute } from "@tanstack/react-router";
import { AIModelType, AI_MODEL_CONFIGS } from "@/config/ai";
import { formatGeminiErrorMessage, getGeminiModelInstance } from "@/lib/server/gemini";
import { resolveLanguageName } from "@/lib/ai/language";

/**
 * Robustly extract a JSON object from a model response that may be wrapped in
 * prose or ```json fences. Same strategy as resume-import.ts.
 */
const parseJsonPayload = (content: string) => {
  const text = (content || "").trim();
  try {
    return JSON.parse(text);
  } catch (error) {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (error) {}
  }

  const objectBlock = text.match(/\{[\s\S]*\}/);
  if (objectBlock?.[0]) {
    try {
      return JSON.parse(objectBlock[0]);
    } catch (error) {}
  }

  return null;
};

const extractBase64Payload = (value: string) => {
  const matched = value.match(/^data:(.*?);base64,(.*)$/);
  if (matched) {
    return { mimeType: matched[1] || "image/jpeg", data: matched[2] || "" };
  }
  return { mimeType: "image/jpeg", data: value };
};

const parseUpstreamError = (raw: string, fallback: string) => {
  if (!raw) return { message: fallback };
  try {
    const data = JSON.parse(raw) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    return {
      message: data.error?.message || data.message || fallback,
      code: data.error?.code,
    };
  } catch {
    return { message: raw };
  }
};

const buildSystemPrompt = (language: string) => `You are an elite resume writer and career coach. You are given a candidate's existing resume material (optional) and a target job description (JD). Produce a resume tailored to the JD AND a matching cover letter.

Write ALL generated content in ${language}.

Hard rules:
1. Output ONLY a single valid JSON object. No markdown, no code fences, no commentary before or after.
2. Tailor aggressively to the JD: surface the most relevant experience, rewrite bullet points to mirror the JD's responsibilities and keywords, and drop or de-emphasize irrelevant detail.
3. NEVER fabricate employers, job titles, dates, degrees, certifications, or metrics that are not supported by the candidate's material. If the source is thin, stay truthful and concise rather than inventing facts. When the JD asks for something the candidate lacks, do not claim it.
4. "description" and "details" fields are arrays of strings; each string is ONE concise, achievement-oriented bullet that starts with a strong verb and quantifies impact only when the source supports it.
5. The cover letter is a professional letter to the hiring team: 3-4 short paragraphs, referencing the specific role and company when the JD names them, in ${language}. Return it as Markdown (paragraphs separated by blank lines; **bold** allowed). Do NOT emit placeholder tokens like [Your Name] or [Company] — use real values from the material or omit the line.
6. If a field is unknown, use an empty string or empty array — never guess personal contact details.

Return EXACTLY this JSON shape:
{
  "resume": {
    "title": "e.g. '<Name> - <Target Role>'",
    "basic": { "name": "", "title": "", "email": "", "phone": "", "location": "", "employementStatus": "", "birthDate": "" },
    "education": [ { "school": "", "major": "", "degree": "", "startDate": "", "endDate": "", "gpa": "", "description": ["", ""] } ],
    "experience": [ { "company": "", "position": "", "date": "", "details": ["", ""] } ],
    "projects": [ { "name": "", "role": "", "date": "", "description": ["", ""], "link": "", "linkLabel": "" } ],
    "skills": ["", ""]
  },
  "coverLetter": "markdown text"
}`;

const buildUserPrompt = (jd: string, oldResumeText?: string) => {
  const sections: string[] = [];
  sections.push(`# TARGET JOB DESCRIPTION\n${jd.trim()}`);
  if (oldResumeText?.trim()) {
    sections.push(
      `# CANDIDATE'S EXISTING RESUME MATERIAL\n${oldResumeText.trim()}`
    );
  } else {
    sections.push(
      `# CANDIDATE'S EXISTING RESUME MATERIAL\n(none provided — infer a reasonable, clearly-generic resume skeleton the candidate can fill in, and keep invented specifics to a minimum)`
    );
  }
  return sections.join("\n\n");
};

const normalizeResult = (parsed: any) => {
  if (!parsed || typeof parsed !== "object") return null;
  // Prefer the nested shape; tolerate a flattened one where resume fields sit at
  // the top level next to coverLetter.
  const resume =
    parsed.resume && typeof parsed.resume === "object" ? parsed.resume : parsed;
  const coverLetter =
    typeof parsed.coverLetter === "string"
      ? parsed.coverLetter
      : typeof parsed.cover_letter === "string"
      ? parsed.cover_letter
      : "";
  return { resume, coverLetter };
};

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const {
            apiKey,
            model,
            modelType,
            apiEndpoint,
            jd,
            oldResumeText,
            oldResumeImages,
            language,
          } = body as {
            apiKey: string;
            model?: string;
            modelType: AIModelType;
            apiEndpoint?: string;
            jd: string;
            oldResumeText?: string;
            oldResumeImages?: string[];
            language?: string;
          };

          if (!apiKey || !jd || !jd.trim()) {
            return Response.json(
              { error: "Missing API key or job description" },
              { status: 400 }
            );
          }

          const modelConfig = AI_MODEL_CONFIGS[modelType];
          if (!modelConfig) {
            return Response.json({ error: "Invalid model type" }, { status: 400 });
          }

          const languageName = resolveLanguageName(language);
          const systemPrompt = buildSystemPrompt(languageName);
          const userPrompt = buildUserPrompt(jd, oldResumeText);

          // ---- Gemini (SDK) path: supports optional resume page images. ----
          if (modelType === "gemini") {
            const geminiModel = model || "gemini-flash-latest";
            const modelInstance = getGeminiModelInstance({
              apiKey,
              model: geminiModel,
              systemInstruction: systemPrompt,
              generationConfig: {
                temperature: 0.5,
                responseMimeType: "application/json",
              },
            });

            const imageParts = Array.isArray(oldResumeImages)
              ? oldResumeImages.map((image) => {
                  const payload = extractBase64Payload(image);
                  return {
                    inlineData: { mimeType: payload.mimeType, data: payload.data },
                  };
                })
              : [];

            const inputParts = [{ text: userPrompt }, ...imageParts];
            const result = await modelInstance.generateContent(inputParts);
            const aiContent = result.response.text();

            const parsed = parseJsonPayload(aiContent);
            const normalized = normalizeResult(parsed);
            if (!normalized) {
              return Response.json(
                { error: "Failed to parse AI JSON output" },
                { status: 500 }
              );
            }
            return Response.json(normalized);
          }

          // ---- OpenAI-compatible path (doubao / deepseek / openai): text only. ----
          const response = await fetch(modelConfig.url(apiEndpoint), {
            method: "POST",
            headers: modelConfig.headers(apiKey),
            body: JSON.stringify({
              model: modelConfig.requiresModelId ? model : modelConfig.defaultModel,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.5,
              response_format: { type: "json_object" },
              stream: false,
            }),
          });

          if (!response.ok) {
            const fallbackMessage = `Upstream API error: ${response.status} ${response.statusText}`;
            const rawError = await response.text();
            const parsedError = parseUpstreamError(rawError, fallbackMessage);
            return Response.json({ error: parsedError }, { status: response.status });
          }

          const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const aiContent = data.choices?.[0]?.message?.content || "";
          const parsed = parseJsonPayload(aiContent);
          const normalized = normalizeResult(parsed);
          if (!normalized) {
            return Response.json(
              { error: "Failed to parse AI JSON output" },
              { status: 500 }
            );
          }
          return Response.json(normalized);
        } catch (error) {
          console.error("Error in resume generation:", error);
          const status =
            typeof (error as any)?.status === "number"
              ? (error as any).status
              : 500;
          return Response.json(
            { error: formatGeminiErrorMessage(error) },
            { status }
          );
        }
      },
    },
  },
});
