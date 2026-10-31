export function formatKes(amount: number): string {
  return `KES ${amount.toLocaleString("en-KE")}`;
}

// "2026-T3" -> "Term 3 2026"; anything else is returned unchanged.
export function termLabel(term: string | null | undefined): string {
  if (!term) return "";
  const m = /^(\d{4})-T([123])$/.exec(term);
  return m ? `Term ${m[2]} ${m[1]}` : term;
}

// "Mlima Girls National School, Eldoret" -> "Mlima Girls National School"
export function shortName(institutionName: string): string {
  return institutionName.split(",")[0].trim();
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
}
