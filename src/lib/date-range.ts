// ---------------------------------------------------------------------------
// Shared date-range utility
// ---------------------------------------------------------------------------

export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
}

export type PresetKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "last7Days"
  | "lastWeek"
  | "thisMonth"
  | "last30Days"
  | "lastMonth"
  | "thisQuarter"
  | "lastQuarter"
  | "thisYear"
  | "lastYear"
  | "allTime";

export const PRESETS: { value: PresetKey; label: string; group?: string }[] = [
  // Quick
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisWeek", label: "This Week" },
  { value: "last7Days", label: "Last 7 Days" },
  { value: "lastWeek", label: "Last Week" },
  // Monthly
  { value: "thisMonth", label: "This Month" },
  { value: "last30Days", label: "Last 30 Days" },
  { value: "lastMonth", label: "Last Month" },
  // Quarterly / Yearly
  { value: "thisQuarter", label: "This Quarter" },
  { value: "lastQuarter", label: "Last Quarter" },
  { value: "thisYear", label: "This Year" },
  { value: "lastYear", label: "Last Year" },
  // Everything
  { value: "allTime", label: "All Time" },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Returns { startDate, endDate } for a given preset key.
 * All dates are in LOCAL time (no UTC conversion).
 */
export function getDateRangeFromPreset(preset: PresetKey): DateRange {
  const now = new Date();
  const today = startOfDay(now);

  switch (preset) {
    case "today":
      return { startDate: today, endDate: endOfDay(now), label: "Today" };

    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { startDate: y, endDate: endOfDay(y), label: "Yesterday" };
    }

    case "thisWeek": {
      const day = today.getDay(); // 0=Sun
      const mon = new Date(today);
      mon.setDate(mon.getDate() - ((day + 6) % 7)); // Monday
      return { startDate: mon, endDate: endOfDay(now), label: "This Week" };
    }

    case "last7Days": {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      return { startDate: s, endDate: endOfDay(now), label: "Last 7 Days" };
    }

    case "lastWeek": {
      const day = today.getDay();
      const thisMon = new Date(today);
      thisMon.setDate(thisMon.getDate() - ((day + 6) % 7));
      const lastMon = new Date(thisMon);
      lastMon.setDate(lastMon.getDate() - 7);
      const lastSun = new Date(thisMon);
      lastSun.setDate(lastSun.getDate() - 1);
      return { startDate: lastMon, endDate: endOfDay(lastSun), label: "Last Week" };
    }

    case "thisMonth": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: first, endDate: endOfDay(now), label: "This Month" };
    }

    case "last30Days": {
      const s = new Date(today);
      s.setDate(s.getDate() - 29);
      return { startDate: s, endDate: endOfDay(now), label: "Last 30 Days" };
    }

    case "lastMonth": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: first, endDate: endOfDay(last), label: "Last Month" };
    }

    case "thisQuarter": {
      const q = Math.floor(today.getMonth() / 3);
      const first = new Date(today.getFullYear(), q * 3, 1);
      return { startDate: first, endDate: endOfDay(now), label: "This Quarter" };
    }

    case "lastQuarter": {
      const q = Math.floor(today.getMonth() / 3);
      const first = new Date(today.getFullYear(), (q - 1) * 3, 1);
      const last = new Date(today.getFullYear(), q * 3, 0);
      return { startDate: first, endDate: endOfDay(last), label: "Last Quarter" };
    }

    case "thisYear": {
      const first = new Date(today.getFullYear(), 0, 1);
      return { startDate: first, endDate: endOfDay(now), label: "This Year" };
    }

    case "lastYear": {
      const first = new Date(today.getFullYear() - 1, 0, 1);
      const last = new Date(today.getFullYear() - 1, 11, 31);
      return { startDate: first, endDate: endOfDay(last), label: "Last Year" };
    }

    case "allTime": {
      const first = new Date(2020, 0, 1);
      return { startDate: first, endDate: endOfDay(now), label: "All Time" };
    }
  }
}

/**
 * Generate month options going back `monthsBack` months from current month.
 * Used by Costs tab for period selection.
 */
export function getMonthOptions(monthsBack: number = 36): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];

  for (let i = -monthsBack; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    options.push({ value, label });
  }

  return options;
}

/**
 * Format a YYYY-MM period string to a readable label.
 */
export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

/**
 * Format a date for display in the filter bar.
 */
export function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}