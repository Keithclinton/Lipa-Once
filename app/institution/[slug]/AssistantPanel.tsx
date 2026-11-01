"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string; activity?: { tool: string; summary: string }[] };

const TOOL_ICON: Record<string, string> = {
  search_payments: "🔎",
  unpaid_students: "📋",
  payment_totals: "∑",
  check_payout: "PayPal",
  send_fee_invoice: "PayPal",
};

export function AssistantPanel({ slug, suggestions }: { slug: string; suggestions: string[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, messages: next.slice(-20).map(({ role, content }) => ({ role, content })) }),
      });
      const body = (await res.json()) as {
        text?: string;
        activity?: Message["activity"];
        changedData?: boolean;
        error?: string;
      };
      if (!res.ok || !body.text) throw new Error(body.error ?? "The assistant isn't available right now.");
      setMessages([...next, { role: "assistant", content: body.text, activity: body.activity }]);
      if (body.changedData) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant isn't available right now.");
      setMessages(messages);
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  return (
    <section className="flex h-full flex-col rounded-3xl border border-ink/10 bg-white" aria-labelledby="assistant-title">
      <div className="border-b border-ink/10 px-5 py-4">
        <h2 id="assistant-title" className="font-display text-xl font-semibold">
          Ask Lipa Once
        </h2>
        <p className="text-sm text-muted">Questions about your payments, or send a fee invoice by PayPal.</p>
      </div>

      <div className="max-h-[440px] min-h-[220px] flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted">Try asking:</p>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                className="block w-full rounded-2xl bg-sand/70 px-4 py-2 text-left text-sm hover:bg-sand"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="ml-8 rounded-2xl bg-forest px-4 py-2 text-sm text-white">
              {m.content}
            </p>
          ) : (
            <div key={i} className="mr-4 space-y-2">
              {m.activity && m.activity.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="What the assistant checked">
                  {m.activity.map((a, j) => (
                    <li key={j} className="rounded-full bg-ochre-soft/70 px-2.5 py-0.5 text-xs text-ochre">
                      <span aria-hidden>{TOOL_ICON[a.tool] ?? "•"} </span>
                      {a.summary}
                    </li>
                  ))}
                </ul>
              )}
              <p className="whitespace-pre-wrap rounded-2xl bg-cream px-4 py-2 text-sm">{linkify(m.content)}</p>
            </div>
          ),
        )}
        {busy && <p className="animate-pulse text-sm text-muted">Checking your records…</p>}
        {error && (
          <p role="alert" className="text-sm text-block">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-ink/10 p-3">
        <label htmlFor="assistant-input" className="sr-only">
          Ask a question
        </label>
        <input
          id="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Who hasn't paid Term 3?"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm focus:border-forest focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest-dark disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </section>
  );
}

// Turns bare URLs (e.g. the PayPal invoice link) into links.
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-forest underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
