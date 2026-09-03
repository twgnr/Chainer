import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Wächter über die aufgezeichneten Prüfdaten.
 *
 * Geprüft wird nur, dass jede erwartete Datei vorhanden und gültiges JSON ist.
 * Fehlende Dateien machen den Test bewusst NICHT rot: auf Rechnern ohne Netz
 * (oder wenn ein Anbieter beim Aufzeichnen gesperrt hat) soll die Testreihe
 * trotzdem durchlaufen. Der übersprungene Test nennt die fehlende Datei.
 */

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

/** Erwartete Prüfdaten je Anbieter. `optional` = darf beim Aufzeichnen fehlschlagen. */
const ERWARTET: { datei: string; quelle: string; optional?: boolean }[] = [
  { datei: "_meta", quelle: "Adressen und IDs der Aufzeichnung" },

  { datei: "mempool-address", quelle: "mempool.space /api/address/…" },
  { datei: "mempool-address-txs", quelle: "mempool.space /api/address/…/txs" },
  { datei: "mempool-tx", quelle: "mempool.space /api/tx/…" },
  { datei: "mempool-outspends", quelle: "mempool.space /api/tx/…/outspends" },
  { datei: "mempool-tx-coinbase", quelle: "mempool.space /api/tx/… (Coinbase aus Block 1)" },

  { datei: "blockstream-tx", quelle: "blockstream.info /api/tx/…" },

  { datei: "blockchain-info-rawaddr", quelle: "blockchain.info /rawaddr/…?limit=5" },
  { datei: "blockchain-info-rawtx", quelle: "blockchain.info /rawtx/…" },
  { datei: "blockchain-info-rawtx-coinbase", quelle: "blockchain.info /rawtx/… (Coinbase aus Block 1)" },

  { datei: "blockcypher-tx", quelle: "api.blockcypher.com /v1/btc/main/txs/…?limit=50" },
  { datei: "blockcypher-address", quelle: "api.blockcypher.com /v1/btc/main/addrs/…/balance" },
  { datei: "blockcypher-address-full", quelle: "api.blockcypher.com /v1/btc/main/addrs/…/full?limit=50" },

  // Blockchair antwortet ohne API-Key häufig mit HTTP 430 (IP gesperrt).
  { datei: "blockchair-tx", quelle: "api.blockchair.com /bitcoin/dashboards/transaction/…", optional: true },

  { datei: "blockscout-tx", quelle: "eth.blockscout.com /api/v2/transactions/…" },
  { datei: "blockscout-tx-token-transfers", quelle: "eth.blockscout.com /api/v2/transactions/…/token-transfers" },
  { datei: "blockscout-tx-internal", quelle: "eth.blockscout.com /api/v2/transactions/…/internal-transactions" },
  { datei: "blockscout-address", quelle: "eth.blockscout.com /api/v2/addresses/…" },
  { datei: "blockscout-address-counters", quelle: "eth.blockscout.com /api/v2/addresses/…/counters" },
  { datei: "blockscout-address-txs", quelle: "eth.blockscout.com /api/v2/addresses/…/transactions" },
  { datei: "blockscout-address-token-transfers", quelle: "eth.blockscout.com /api/v2/addresses/…/token-transfers" },

  { datei: "trongrid-account", quelle: "api.trongrid.io /v1/accounts/…" },
  { datei: "trongrid-account-txs", quelle: "api.trongrid.io /v1/accounts/…/transactions" },
  { datei: "trongrid-trc20", quelle: "api.trongrid.io /v1/accounts/…/transactions/trc20" },
  { datei: "trongrid-tx", quelle: "api.trongrid.io /wallet/gettransactionbyid" },
  { datei: "trongrid-tx-info", quelle: "api.trongrid.io /wallet/gettransactioninfobyid" },
];

function pfad(datei: string): string {
  return join(FIXTURE_DIR, `${datei}.json`);
}

function fehlt(datei: string): boolean {
  return !existsSync(pfad(datei));
}

const HINWEIS = "mit `npm run fixtures` neu aufzeichnen";

describe("Prüfdaten der Anbieter", () => {
  for (const { datei, quelle, optional } of ERWARTET) {
    const name = `${datei}.json ist vorhanden und gültiges JSON (${quelle})`;

    if (fehlt(datei)) {
      // Bewusst überspringen statt scheitern: ohne Netz gibt es keine Prüfdaten.
      it.skip(`${name} – FEHLT, ${HINWEIS}${optional ? " (optional, Anbieter oft gesperrt)" : ""}`, () => {
        // Absichtlich leer; siehe Testname.
      });
      continue;
    }

    it(name, () => {
      const inhalt = readFileSync(pfad(datei), "utf8");
      expect(statSync(pfad(datei)).size, `${datei}.json ist leer – ${HINWEIS}`).toBeGreaterThan(0);
      const daten: unknown = JSON.parse(inhalt);
      expect(daten, `${datei}.json enthält kein Objekt und keine Liste – ${HINWEIS}`).toBeTypeOf("object");
      expect(daten).not.toBeNull();
    });
  }

  it("nennt fehlende Prüfdaten in der Zusammenfassung", () => {
    const fehlend = ERWARTET.filter((e) => fehlt(e.datei) && !e.optional).map((e) => `${e.datei}.json`);
    // Kein Fehlschlag: die Liste wird nur ausgegeben, damit sie im Bericht auftaucht.
    if (fehlend.length) {
      console.warn(`Fehlende Prüfdaten (${fehlend.join(", ")}) – ${HINWEIS}.`);
    }
    expect(Array.isArray(fehlend)).toBe(true);
  });
});
