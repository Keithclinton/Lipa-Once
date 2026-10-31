"use client";

import {
  AllCommunityModule,
  type ColDef,
  type ICellRendererParams,
  ModuleRegistry,
  type RowClassRules,
  themeQuartz,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useState } from "react";

ModuleRegistry.registerModules([AllCommunityModule]);

export type PaymentRow = {
  reference: string;
  createdAt: string; // ISO
  beneficiaryName: string;
  beneficiaryRef: string | null;
  level: string | null;
  term: string | null;
  amountKes: number;
  status: string;
  verdict: string;
  reasons: string[];
  senderName: string | null;
};

const theme = themeQuartz.withParams({
  accentColor: "#14532d",
  backgroundColor: "#ffffff",
  foregroundColor: "#1d2420",
  headerBackgroundColor: "#f1e8d9",
  headerFontWeight: 600,
  borderRadius: 12,
  wrapperBorderRadius: 16,
  fontFamily: "inherit",
});

const STATUS_LABEL: Record<string, string> = {
  VERIFIED: "Awaiting payment",
  PAID: "Paid",
  PAYOUT_PENDING: "On its way",
  SETTLED: "Settled",
  FAILED: "Payout failed",
  BLOCKED: "Blocked",
  DRAFT: "Draft",
};

const PILL: Record<string, string> = {
  APPROVE: "bg-approve/10 text-approve",
  FLAG: "bg-ochre-soft text-flag",
  BLOCK: "bg-block/10 text-block",
  SETTLED: "bg-approve/10 text-approve",
  FAILED: "bg-block/10 text-block",
  BLOCKED: "bg-block/10 text-block",
};

function Pill({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[value] ?? "bg-sand text-ink"}`}>
      {label ?? value}
    </span>
  );
}

const rowClassRules: RowClassRules<PaymentRow> = {
  "lm-row-block": (p) => p.data?.verdict === "BLOCK" || p.data?.status === "FAILED",
  "lm-row-flag": (p) => p.data?.verdict === "FLAG" && p.data?.status !== "FAILED",
};

export function PaymentsGrid({ rows }: { rows: PaymentRow[] }) {
  const [search, setSearch] = useState("");

  const columns = useMemo<ColDef<PaymentRow>[]>(
    () => [
      {
        field: "createdAt",
        headerName: "Date",
        sort: "desc",
        width: 130,
        valueFormatter: (p) =>
          p.value ? new Date(p.value as string).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "",
      },
      { field: "beneficiaryName", headerName: "Student", minWidth: 160, flex: 1 },
      { field: "beneficiaryRef", headerName: "Adm no.", width: 110 },
      { field: "level", headerName: "Class", width: 110 },
      {
        field: "term",
        headerName: "Term",
        width: 110,
        valueFormatter: (p) => String(p.value ?? "").replace(/^(\d{4})-T(\d)$/, "T$2 $1"),
      },
      {
        field: "amountKes",
        headerName: "Amount (KES)",
        width: 140,
        type: "rightAligned",
        valueFormatter: (p) => Number(p.value ?? 0).toLocaleString("en-KE"),
      },
      {
        field: "status",
        width: 150,
        cellRenderer: (p: ICellRendererParams<PaymentRow>) =>
          p.value ? <Pill value={p.value as string} label={STATUS_LABEL[p.value as string] ?? (p.value as string)} /> : null,
      },
      {
        field: "verdict",
        headerName: "AI check",
        width: 120,
        cellRenderer: (p: ICellRendererParams<PaymentRow>) => (p.value ? <Pill value={p.value as string} /> : null),
      },
      {
        field: "reasons",
        headerName: "Why",
        minWidth: 220,
        flex: 2,
        valueFormatter: (p) => (p.value as string[] | undefined)?.join(" · ") ?? "",
        tooltipValueGetter: (p) => (p.value as string[] | undefined)?.join("\n") ?? "",
      },
      { field: "senderName", headerName: "Paid by", width: 150 },
      { field: "reference", headerName: "Ref", width: 120 },
    ],
    [],
  );

  return (
    <div>
      <label className="mb-3 block max-w-sm text-sm">
        <span className="sr-only">Search payments</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by student, adm no. or reference"
          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 focus:border-forest focus:outline-none"
        />
      </label>
      <div style={{ height: 520 }}>
        <AgGridReact<PaymentRow>
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          rowClassRules={rowClassRules}
          quickFilterText={search}
          tooltipShowDelay={300}
          pagination
          paginationPageSize={20}
          paginationPageSizeSelector={[20, 50, 100]}
          overlayNoRowsTemplate="No payments yet"
        />
      </div>
    </div>
  );
}
