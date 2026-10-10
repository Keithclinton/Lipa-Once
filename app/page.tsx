import Link from "next/link";

const steps = [
  {
    title: "Upload the bill",
    body: "Snap the fee invoice or hospital bill your family sent you. A photo or PDF is fine.",
  },
  {
    title: "We check it",
    body: "AI reads every line and checks the school, the payment details and the amount against our verified registry.",
  },
  {
    title: "Pay the institution directly",
    body: "You pay in dollars with PayPal. The money goes straight to the school or hospital, and your family gets a receipt.",
  },
];

const problems = [
  {
    title: "Money meant for fees gets spent elsewhere",
    body: "Cash sent to a relative has to be carried to the bursar. Too often it never arrives.",
  },
  {
    title: "Invoices get doctored",
    body: "An inflated total or a swapped paybill number, and the extra goes to someone else.",
  },
  {
    title: "The same bill gets paid twice",
    body: "Two aunts, one term's fees, and nobody knows the other already paid.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/" className="font-display text-xl font-semibold text-forest">
          Lipa Moja
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/demo" className="text-muted hover:text-ink">
            Demo
          </Link>
          <Link
            href="/pay"
            className="rounded-full bg-forest px-4 py-2 font-medium text-white hover:bg-forest-dark"
          >
            Pay a bill
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:pt-16">
          <p className="mb-4 inline-block rounded-full bg-ochre-soft px-3 py-1 text-sm font-medium text-ochre">
            For Kenyans abroad paying bills back home
          </p>
          <h1 className="font-display max-w-3xl text-4xl leading-tight font-semibold sm:text-6xl">
            Pay the bill, <span className="text-forest">not the person.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted">
            School fees and hospital bills paid straight to the verified institution. We check every invoice
            before you pay, and your family gets proof it&rsquo;s settled.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/pay"
              className="rounded-full bg-forest px-6 py-3 text-center font-medium text-white hover:bg-forest-dark"
            >
              Pay a bill
            </Link>
            <Link
              href="/demo"
              className="rounded-full border border-forest/30 px-6 py-3 text-center font-medium text-forest hover:bg-sand"
            >
              Try the demo invoices
            </Link>
          </div>
        </section>

        <section className="bg-sand/60 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">Sending fees home shouldn&rsquo;t take faith</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {problems.map((p) => (
                <div key={p.title} className="rounded-2xl bg-cream p-6">
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-2 text-muted">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-ink/10 bg-white p-6">
                <span className="font-display flex h-10 w-10 items-center justify-center rounded-full bg-forest text-lg text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20">
          <div className="rounded-3xl bg-forest px-6 py-10 text-white sm:px-10">
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">
              Every shilling reaches the school.
            </h2>
            <p className="mt-3 max-w-2xl text-white/80">
              Lipa Moja only pays institutions we&rsquo;ve verified, and blocks invoices whose payment details or
              amounts don&rsquo;t add up.
            </p>
            <Link
              href="/pay"
              className="mt-6 inline-block rounded-full bg-cream px-6 py-3 font-medium text-forest hover:bg-sand"
            >
              Pay a bill
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/10 py-8 text-center text-sm text-muted">
        Lipa Moja · Sandbox demo · Institutions shown are fictional
      </footer>
    </div>
  );
}
