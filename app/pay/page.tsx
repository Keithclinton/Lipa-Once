import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { UploadForm } from "./UploadForm";

export const metadata: Metadata = { title: "Pay a bill — Lipa Moja" };

export default function PayPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-6">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Pay a school or hospital bill</h1>
        <p className="mt-3 text-muted">
          Upload the invoice your family sent. We&rsquo;ll read it, check it against the institution&rsquo;s verified
          details, and show you exactly what you&rsquo;ll pay before anything happens.
        </p>
        <div className="mt-8">
          <UploadForm />
        </div>
        <p className="mt-8 text-sm text-muted">
          No invoice handy?{" "}
          <Link href="/demo" className="text-forest underline">
            Try one of our sample invoices
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
