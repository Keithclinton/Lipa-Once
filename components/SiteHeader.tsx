import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
      <Link href="/" className="font-display text-xl font-semibold text-forest">
        Lipa Moja
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/demo" className="text-muted hover:text-ink">
          Demo
        </Link>
        <Link href="/pay" className="rounded-full bg-forest px-4 py-2 font-medium text-white hover:bg-forest-dark">
          Pay a bill
        </Link>
      </nav>
    </header>
  );
}
