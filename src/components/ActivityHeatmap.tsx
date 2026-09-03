"use client";

import type { ActivityPattern } from "@/lib/trace/types";
import { useFormatters, useT } from "@/lib/i18n/provider";

const TXT = {
  en: {
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    noData: "No timestamps available for a pattern analysis.",
    cellTitle: (day: string, hour: string, count: number) =>
      `${day} ${hour}:00 UTC – ${count} transaction${count === 1 ? "" : "s"}`,
    total: (n: string) => `${n} transactions with a timestamp · hours in UTC`,
    range: (from: string, to: string) => `${from} to ${to}`,
    guessed: "Estimated time zone: UTC",
    derivedFrom: "– derived from the quietest six-hour stretch",
  },
  de: {
    days: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
    noData: "Keine Zeitstempel für eine Musteranalyse vorhanden.",
    cellTitle: (day: string, hour: string, count: number) => `${day} ${hour}:00 UTC – ${count} Transaktion(en)`,
    total: (n: string) => `${n} Transaktionen mit Zeitstempel · Stunden in UTC`,
    range: (from: string, to: string) => `${from} bis ${to}`,
    guessed: "Geschätzte Zeitzone: UTC",
    derivedFrom: "– abgeleitet aus der ruhigsten Sechs-Stunden-Phase",
  },
};

/**
 * Aktivität nach Wochentag und Stunde (UTC). Ruhige Nachtstunden erlauben eine
 * grobe Schätzung der Zeitzone des Besitzers.
 */
export default function ActivityHeatmap({ activity, compact = false }: { activity: ActivityPattern; compact?: boolean }) {
  const t = useT(TXT);
  const fmt = useFormatters();
  if (!activity || !activity.total) {
    return <p className="text-sm text-subtle">{t.noData}</p>;
  }
  const max = Math.max(1, ...activity.matrix.flat());
  const cell = compact ? 10 : 14;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="text-[8px] font-normal text-subtle">
                  {h % 3 === 0 ? h : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activity.matrix.map((row, d) => (
              <tr key={d}>
                <td className="pr-1 text-[9px] text-subtle">{t.days[d]}</td>
                {row.map((v, h) => (
                  <td key={h}>
                    <div
                      title={t.cellTitle(t.days[d], String(h).padStart(2, "0"), v)}
                      style={{
                        width: cell,
                        height: cell,
                        borderRadius: 2,
                        // Leere Zellen nehmen die Rahmenfarbe des Designs auf,
                        // damit das Raster in beiden Modi sichtbar bleibt.
                        background: v === 0 ? "var(--border)" : `rgba(247,147,26,${0.15 + 0.85 * (v / max)})`,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-0.5 text-xs text-muted">
        <div>
          {t.total(fmt.number(activity.total))}
          {activity.firstSeen && (
            <>
              {" · "}
              {t.range(fmt.date(activity.firstSeen), fmt.date(activity.lastSeen))}
            </>
          )}
        </div>
        {activity.guessedUtcOffset !== undefined && (
          <div className="text-brand">
            {t.guessed}
            {activity.guessedUtcOffset >= 0 ? "+" : ""}
            {activity.guessedUtcOffset}
            {activity.guessedRegion ? ` (${activity.guessedRegion})` : ""} {t.derivedFrom}
          </div>
        )}
      </div>
    </div>
  );
}
