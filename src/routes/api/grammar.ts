import { createFileRoute } from "@tanstack/react-router";
import { AIModelType, AI_MODEL_CONFIGS } from "@/config/ai";
import { formatGeminiErrorMessage, getGeminiModelInstance } from "@/lib/server/gemini";
import { resolveLanguageName } from "@/lib/ai/language";

const parseUpstreamError = (raw: string, fallback: string) => {
  if (!raw) return { message: fallback };
  try {
    const data = JSON.parse(raw) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    return {
      message: data.error?.message || data.message || fallback,
      code: data.error?.code
    };
  } catch {
    return { message: raw };
  }
};

export const Route = createFileRoute("/api/grammar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { apiKey, model, content, modelType, apiEndpoint, language } = body as {
            apiKey: string;
            model: string;
            content: string;
            modelType: AIModelType;
            apiEndpoint?: string;
            language?: string;
          };

          const modelConfig = AI_MODEL_CONFIGS[modelType as AIModelType];
          if (!modelConfig) {
            throw new Error("Invalid model type");
          }

          const langHint = language
            ? ` (the text is likely written in ${resolveLanguageName(language)})`
            : "";

          const systemPrompt = `You are a meticulous multilingual proofreader for resumes. Detect the language of the text${langHint} and find ONLY genuine spelling and grammar/punctuation errors in that language.

Strictly forbidden:
1. Do NOT suggest style, tone, rewriting, or "polish" changes. If a sentence is grammatically correct (even if it is not elegant), do NOT report it.
2. Do NOT report "no errors found" or similar as an error. If there are no errors, the "errors" array MUST be empty.
3. Do NOT over-correct domain/technical terms unless context makes it clearly a typo.
4. For CJK text, do NOT report the common, accepted practice of using ASCII punctuation, or spacing between CJK and Latin characters.

Only report:
1. Real spelling errors / typos (an actual misspelling of a word).
2. Clear grammar or punctuation mistakes (e.g. duplicated punctuation, an obviously wrong verb form).

Return ONLY this JSON (no prose, no code fences):
{
  "errors": [
    {
      "context": "the full original sentence containing the error (verbatim from the input)",
      "text": "the exact erroneous substring (must exist verbatim in the input)",
      "suggestion": "only the corrected word or fragment (not the whole sentence unless the whole sentence is wrong)",
      "reason": "a short reason",
      "type": "spelling"
    }
  ]
}

The "type" field must be either "spelling" or "grammar". If the text is clean, return {"errors": []}.`;

          if (modelType === "gemini") {
            const geminiModel = model || "gemini-flash-latest";
            const modelInstance = getGeminiModelInstance({
              apiKey,
              model: geminiModel,
              systemInstruction: systemPrompt,
              generationConfig: {
                temperature: 0,
                responseMimeType: "application/json",
              },
            });

            const result = await modelInstance.generateContent(content);
            const text = result.response.text() || "";

            return Response.json({
              choices: [
                {
                  message: {
                    content: text,
                  },
                },
              ],
            });
          }

          const response = await fetch(modelConfig.url(apiEndpoint), {
            method: "POST",
            headers: modelConfig.headers(apiKey),
            body: JSON.stringify({
              model: modelConfig.requiresModelId ? model : modelConfig.defaultModel,
              response_format: {
                type: "json_object"
              },
              messages: [
                {
                  role: "system",
                  content: systemPrompt
                },
                {
                  role: "user",
                  content
                }
              ]
            })
          });

          const raw = await response.text();
          if (!response.ok) {
            const fallbackMessage = `Upstream API error: ${response.status} ${response.statusText}`;
            const parsedError = parseUpstreamError(raw, fallbackMessage);
            return Response.json(
              { error: parsedError },
              { status: response.status }
            );
          }

          let data: unknown;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            return Response.json(
              { error: "Invalid upstream response: expected JSON payload" },
              { status: 502 }
            );
          }

          return Response.json(data);
        } catch (error) {
          console.error("Error in grammar check:", error);
          return Response.json(
            { error: formatGeminiErrorMessage(error) },
            { status: 500 }
          );
        }
      }
    }
  }
});
