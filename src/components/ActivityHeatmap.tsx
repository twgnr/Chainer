"use client";

import type { ActivityPattern } from "@/lib/trace/types";
import { formatDate } from "@/lib/format";

const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/**
 * Aktivität nach Wochentag und Stunde (UTC). Ruhige Nachtstunden erlauben eine
 * grobe Schätzung der Zeitzone des Besitzers.
 */
export default function ActivityHeatmap({ activity, compact = false }: { activity: ActivityPattern; compact?: boolean }) {
  if (!activity || !activity.total) {
    return <p className="text-sm text-gray-500">Keine Zeitstempel für eine Musteranalyse vorhanden.</p>;
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
                <th key={h} className="text-[8px] font-normal text-gray-500">
                  {h % 3 === 0 ? h : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activity.matrix.map((row, d) => (
              <tr key={d}>
                <td className="pr-1 text-[9px] text-gray-500">{DAYS[d]}</td>
                {row.map((v, h) => (
                  <td key={h}>
                    <div
                      title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 UTC – ${v} Transaktion(en)`}
                      style={{
                        width: cell,
                        height: cell,
                        borderRadius: 2,
                        background: v === 0 ? "#1e293b" : `rgba(247,147,26,${0.15 + 0.85 * (v / max)})`,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-0.5 text-xs text-gray-400">
        <div>
          {activity.total} Transaktionen mit Zeitstempel · Stunden in UTC
          {activity.firstSeen && (
            <>
              {" · "}
              {formatDate(activity.firstSeen)} bis {formatDate(activity.lastSeen)}
            </>
          )}
        </div>
        {activity.guessedUtcOffset !== undefined && (
          <div className="text-accent">
            Geschätzte Zeitzone: UTC{activity.guessedUtcOffset >= 0 ? "+" : ""}
            {activity.guessedUtcOffset}
            {activity.guessedRegion ? ` (${activity.guessedRegion})` : ""} – abgeleitet aus der ruhigsten
            Sechs-Stunden-Phase
          </div>
        )}
      </div>
    </div>
  );
}
