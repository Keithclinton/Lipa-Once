import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SampleButton } from "./SampleButton";

export const metadata: Metadata = { title: "Demo — Lipa Moja" };

// Reads sandbox credentials from env at request time.
export const dynamic = "force-dynamic";

const SAMPLES = [
  {
    sample: "genuine",
    title: "Genuine invoice",
    expect: "APPROVE",
    body: "Mlima Girls, Form 3 Term 3. Everything matches the verified registry.",
  },
  {
    sample: "doctored",
    title: "Doctored invoice",
    expect: "BLOCK",
    body: "Same school, but the paybill digits are swapped and two invented levies push the total to 2.3× the usual fee.",
  },
  {
    sample: "blurry",
    title: "Blurry photo",
    expect: "FLAG",
    body: "A genuine Lakeside Boys invoice, photographed badly with a stain over the total.",
  },
  {
    sample: "duplicate",
    title: "Already paid",
    expect: "BLOCK",
    body: "A re-issue of a bill a relative already paid in September (ref LM-H7K2P).",
  },
] as const;

const BADGE = {
  APPROVE: "bg-approve/10 text-approve",
  FLAG: "bg-ochre-soft text-flag",
  BLOCK: "bg-block/10 text-block",
} as const;

export default function DemoPage() {
  const buyerEmail = process.env.SANDBOX_BUYER_EMAIL;
  const buyerPassword = process.env.SANDBOX_BUYER_PASSWORD;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-6">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Try Lipa Moja</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Each sample runs the full flow: the AI reads the invoice, we check it against the registry, and you can pay
          with a PayPal sandbox account. All schools, students and numbers are fictional.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {SAMPLES.map((s) => (
            <article key={s.sample} className="flex flex-col overflow-hidden rounded-3xl border border-ink/10 bg-white">
              <div className="relative h-48 overflow-hidden border-b border-ink/10 bg-sand">
                <Image
                  src={`/samples/${s.sample}-invoice.png`}
                  alt={`${s.title} sample`}
                  fill
                  sizes="(min-width: 640px) 480px, 100vw"
                  className="object-cover object-top"
                />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{s.title}</h2>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[s.expect]}`}>
                    Expect {s.expect}
                  </span>
                </div>
                <p className="flex-1 text-sm text-muted">{s.body}</p>
                <SampleButton sample={s.sample} label="Check this invoice" />
                <a href={`/samples/${s.sample}-invoice.png`} download className="text-center text-xs text-forest underline">
                  Download to upload yourself
                </a>
              </div>
            </article>
          ))}
        </div>

        <section className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-3xl border border-ink/10 bg-white p-6">
            <h2 className="font-display text-xl font-semibold">PayPal sandbox buyer</h2>
            {buyerEmail ? (
              <dl className="mt-3 space-y-1 text-sm">
                <div>
                  <dt className="inline text-muted">Email: </dt>
                  <dd className="inline font-mono">{buyerEmail}</dd>
                </div>
                <div>
                  <dt className="inline text-muted">Password: </dt>
                  <dd className="inline font-mono">{buyerPassword}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted">Sandbox buyer details are listed in the project README.</p>
            )}
            <p className="mt-3 text-xs text-muted">Test money only. No real payments are made.</p>
          </div>
          <div className="rounded-3xl border border-ink/10 bg-white p-6">
            <h2 className="font-display text-xl font-semibold">School dashboard</h2>
            <p className="mt-3 text-sm text-muted">
              See payments arriving at Mlima Girls, with flagged and blocked attempts highlighted.
            </p>
            {process.env.DASHBOARD_PASSCODE && (
              <p className="mt-2 text-sm">
                Passcode: <span className="font-mono">{process.env.DASHBOARD_PASSCODE}</span>
              </p>
            )}
            <Link
              href="/institution/mlima-girls-eldoret"
              className="mt-4 inline-block rounded-full border border-forest/30 px-4 py-2 text-sm font-medium text-forest hover:bg-sand"
            >
              Open the dashboard
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
