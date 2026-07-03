import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Send,
  Loader2,
  Undo2,
  Wrench,
  Square,
  Bot,
  User as UserIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet-no-overlay";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import { getAICredentials, supportsToolCalling } from "@/lib/ai/client";
import { useAIConfiguration } from "@/hooks/useAIConfiguration";
import { useResumeStore } from "@/store/useResumeStore";
import { runAgent, type AgentMessage } from "@/lib/agent/loop";

type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; result?: string };

export function AgentChatPanel() {
  const t = useTranslations("agent");
  const router = useRouter();
  const { checkConfiguration } = useAIConfiguration();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const snapshotRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openHandler = () => setIsOpen(true);
    document.addEventListener("open-agent-panel", openHandler);
    return () => document.removeEventListener("open-agent-panel", openHandler);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items, running]);

  const handleEvent = (ev: any) => {
    if (ev.type === "tool_call") {
      setItems((prev) => [...prev, { kind: "tool", name: ev.name }]);
    } else if (ev.type === "tool_result") {
      setItems((prev) => {
        // attach the result to the most recent tool item of this name w/o result
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          const it = next[i];
          if (it.kind === "tool" && it.name === ev.name && it.result === undefined) {
            next[i] = { ...it, result: ev.result };
            break;
          }
        }
        return next;
      });
    } else if (ev.type === "assistant_text") {
      setItems((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === "assistant" && last.text === ev.text) return prev;
        return [...prev, { kind: "assistant", text: ev.text }];
      });
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || running) return;
    if (!checkConfiguration()) return;

    const creds = getAICredentials();
    if (!supportsToolCalling(creds.modelType)) {
      toast.error(t("unsupportedProvider"));
      return;
    }

    const resume = useResumeStore.getState().activeResume;
    if (!resume) {
      toast.error(t("noResume"));
      return;
    }

    // Snapshot for one-step undo before the agent mutates anything.
    snapshotRef.current = JSON.parse(JSON.stringify(resume));
    setCanUndo(false);

    setItems((prev) => [...prev, { kind: "user", text }]);
    setInput("");
    setRunning(true);
    abortRef.current = new AbortController();

    try {
      const result = await runAgent({
        userText: text,
        history,
        creds,
        signal: abortRef.current.signal,
        onEvent: handleEvent,
      });
      setHistory(result.history);
      setCanUndo(true);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setItems((prev) => [...prev, { kind: "assistant", text: t("stopped") }]);
      } else {
        toast.error(
          error instanceof Error ? error.message : t("error")
        );
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleUndo = () => {
    const snap = snapshotRef.current;
    if (!snap) return;
    useResumeStore.getState().updateResume(snap.id, snap);
    snapshotRef.current = null;
    setCanUndo(false);
    toast.success(t("reverted"));
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("title")}
          </SheetTitle>
          <SheetDescription>{t("subtitle")}</SheetDescription>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
        >
          {items.length === 0 && !running && (
            <div className="mt-6 space-y-3 text-sm text-muted-foreground">
              <p>{t("emptyHint")}</p>
              <ul className="space-y-1.5">
                <li className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  {t("example1")}
                </li>
                <li className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  {t("example2")}
                </li>
                <li className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  {t("example3")}
                </li>
              </ul>
            </div>
          )}

          {items.map((it, i) => {
            if (it.kind === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="flex max-w-[85%] items-start gap-2">
                    <div className="rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                      {it.text}
                    </div>
                    <div className="mt-0.5 rounded-full bg-primary/10 p-1.5">
                      <UserIcon className="h-3.5 w-3.5 text-primary" />
                    </div>
                  </div>
                </div>
              );
            }
            if (it.kind === "assistant") {
              return (
                <div key={i} className="flex justify-start">
                  <div className="flex max-w-[90%] items-start gap-2">
                    <div className="mt-0.5 rounded-full bg-muted p-1.5">
                      <Bot className="h-3.5 w-3.5 text-foreground" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-sm">
                      <Streamdown className="prose prose-sm dark:prose-invert max-w-none">
                        {it.text}
                      </Streamdown>
                    </div>
                  </div>
                </div>
              );
            }
            // tool activity
            return (
              <div
                key={i}
                className="flex items-center gap-2 pl-9 text-xs text-muted-foreground"
              >
                {it.result === undefined ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Wrench className="h-3.5 w-3.5 text-green-600" />
                )}
                <span className="font-mono">{it.name}</span>
                {it.result && (
                  <span className="truncate text-muted-foreground/70">
                    · {it.result}
                  </span>
                )}
              </div>
            );
          })}

          {running && (
            <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("thinking")}
            </div>
          )}
        </div>

        {canUndo && !running && (
          <div className="border-t border-border px-5 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              className="h-8 text-xs text-muted-foreground"
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" />
              {t("undo")}
            </Button>
          </div>
        )}

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t("inputPlaceholder")}
              rows={2}
              disabled={running}
              className="max-h-32 min-h-[44px] resize-none"
            />
            {running ? (
              <Button
                size="icon"
                variant="outline"
                onClick={handleStop}
                className="h-11 w-11 shrink-0"
                aria-label={t("stop")}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim()}
                className="h-11 w-11 shrink-0"
                aria-label={t("send")}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
