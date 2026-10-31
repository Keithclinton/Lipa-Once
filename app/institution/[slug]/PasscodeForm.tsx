"use client";

import { useActionState } from "react";
import { unlockDashboard } from "./actions";

export function PasscodeForm({ slug, name }: { slug: string; name: string }) {
  const [error, action, pending] = useActionState(unlockDashboard.bind(null, slug), null);
  return (
    <form action={action} className="mx-auto mt-16 max-w-sm rounded-3xl border border-ink/10 bg-white p-6">
      <h1 className="font-display text-2xl font-semibold">{name}</h1>
      <p className="mt-2 text-sm text-muted">Enter the bursar&rsquo;s passcode to see incoming payments.</p>
      <label className="mt-4 block text-sm">
        <span className="text-muted">Passcode</span>
        <input
          name="passcode"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2 text-base focus:border-forest focus:outline-none"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-block">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-full bg-forest px-4 py-2.5 font-medium text-white hover:bg-forest-dark disabled:opacity-60"
      >
        Open dashboard
      </button>
    </form>
  );
}
