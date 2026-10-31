import type { VerdictDetails } from "@/lib/verdict-details";

const STYLES = {
  APPROVE: { box: "border-approve/30 bg-approve/5", badge: "bg-approve", title: "Safe to pay", icon: "✓" },
  FLAG: { box: "border-flag/40 bg-ochre-soft/60", badge: "bg-flag", title: "Check before you pay", icon: "!" },
  BLOCK: { box: "border-block/30 bg-block/5", badge: "bg-block", title: "We can't pay this bill", icon: "✕" },
} as const;

type Verdict = keyof typeof STYLES;

export function VerdictCard({ verdict, details }: { verdict: string; details: VerdictDetails }) {
  const style = STYLES[(verdict in STYLES ? verdict : "FLAG") as Verdict];
  const problems = details.findings.filter((f) => f.severity !== "PASS");
  const passed = details.findings.filter((f) => f.severity === "PASS");

  return (
    <section className={`rounded-3xl border-2 p-6 ${style.box}`} aria-labelledby="verdict-title">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${style.badge}`}
          aria-hidden
        >
          {style.icon}
        </span>
        <h2 id="verdict-title" className="font-display text-2xl font-semibold">
          {style.title}
        </h2>
      </div>
      {details.summary && <p className="mt-3 text-ink/90">{details.summary}</p>}

      {problems.length > 0 && (
        <ul className="mt-4 space-y-2">
          {problems.map((f) => (
            <li key={f.code + f.message} className="flex gap-2">
              <span className={f.severity === "BLOCK" ? "text-block" : "text-flag"} aria-hidden>
                {f.severity === "BLOCK" ? "✕" : "!"}
              </span>
              <span>
                <span className="sr-only">{f.severity === "BLOCK" ? "Blocked: " : "Warning: "}</span>
                {f.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      {details.concerns.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Also worth checking</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {details.concerns.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {passed.length > 0 && (
        <details className="mt-4 text-sm text-muted">
          <summary className="cursor-pointer">{passed.length} checks passed</summary>
          <ul className="mt-2 space-y-1">
            {passed.map((f) => (
              <li key={f.code} className="flex gap-2">
                <span className="text-approve" aria-hidden>
                  ✓
                </span>
                {f.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
