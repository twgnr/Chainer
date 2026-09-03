/**
 * Wird von Next.js beim Serverstart einmalig ausgeführt.
 *
 * Startet drei optionale Hintergrunddienste:
 *  - die Warteschlange für lange Analysen,
 *  - die regelmäßige Prüfung der Watchlist,
 *  - die automatische Aktualisierung von Fällen.
 *
 * Alle drei setzen eine Datenbank voraus. Für mehrere Instanzen oder serverlose
 * Umgebungen ist ein externer Cron-Dienst auf /api/watch/check und
 * /api/cases/refresh die bessere Wahl.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.MONGODB_URI) return;

  /* ---------- Warteschlange für Hintergrund-Aufträge ---------- */
  try {
    const { startJobWorker } = await import("./lib/jobWorker");
    startJobWorker(Number(process.env.JOB_POLL_SECONDS || 5) * 1000);
    console.log("[chainer] Warteschlange für Hintergrund-Aufträge aktiv");
  } catch (e) {
    console.error("[chainer] Warteschlange konnte nicht starten:", e instanceof Error ? e.message : e);
  }

  /* ---------- Watchlist ---------- */
  const watchMinutes = Number(process.env.WATCH_INTERVAL_MINUTES || 0);
  if (watchMinutes > 0) {
    const { checkWatches } = await import("./lib/watch");
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const r = await checkWatches({});
        if (r.changed) console.log(`[chainer] Watchlist: ${r.changed} Änderung(en), ${r.notified} Benachrichtigung(en)`);
      } catch (e) {
        console.error("[chainer] Watchlist-Prüfung fehlgeschlagen:", e instanceof Error ? e.message : e);
      } finally {
        running = false;
      }
    };
    setTimeout(tick, 30_000).unref?.();
    setInterval(tick, Math.max(1, watchMinutes) * 60_000).unref?.();
    console.log(`[chainer] Watchlist-Prüfung aktiv, alle ${watchMinutes} Minuten`);
  }

  /* ---------- Automatische Fallaktualisierung ---------- */
  const caseMinutes = Number(process.env.CASE_REFRESH_INTERVAL_MINUTES || 0);
  if (caseMinutes > 0) {
    const { refreshCases } = await import("./lib/caseRefresh");
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const r = await refreshCases({});
        if (r.changed) console.log(`[chainer] Fälle: ${r.changed} mit Bewegung, ${r.notified} Benachrichtigung(en)`);
      } catch (e) {
        console.error("[chainer] Fallaktualisierung fehlgeschlagen:", e instanceof Error ? e.message : e);
      } finally {
        running = false;
      }
    };
    setTimeout(tick, 60_000).unref?.();
    setInterval(tick, Math.max(1, caseMinutes) * 60_000).unref?.();
    console.log(`[chainer] Fallaktualisierung aktiv, alle ${caseMinutes} Minuten`);
  }
}
