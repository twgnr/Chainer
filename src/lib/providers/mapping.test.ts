import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import type { ProviderContext, TxInfo } from "./types";
import { ProviderError, UnsupportedError } from "./types";
import { blockchainInfo } from "./blockchain-info";
import { blockchair } from "./blockchair";
import { blockcypher } from "./blockcypher";
import { blockstream, litecoinSpace, mempoolSpace } from "./esplora";
import { blockscout, etherscan } from "./evm";
import { trongrid } from "./tron";

/**
 * Prüft die Umwandlung echter Anbieter-Antworten ins interne Format.
 *
 * Die Prüfdaten unter `__fixtures__/` sind echte, mit `npm run fixtures`
 * aufgezeichnete Antworten. Kein Test geht ins Netz: das Modul `./http` wird
 * ersetzt und liefert – abhängig von der angefragten URL – die aufgezeichnete
 * Antwort zurück. Fehlt eine Datei, wird der zugehörige Test übersprungen,
 * damit die Testreihe auch ohne Netz durchläuft.
 */

/* ------------------------------------------------------------------ */
/* Prüfdaten laden                                                     */
/* ------------------------------------------------------------------ */

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixtureFile(name: string): string {
  return join(FIXTURE_DIR, `${name}.json`);
}

/** Sind alle genannten Prüfdaten vorhanden? */
function hat(...namen: string[]): boolean {
  return namen.every((n) => existsSync(fixtureFile(n)));
}

/** Lädt Prüfdaten; wirft nur, wenn die Datei entgegen der Prüfung fehlt. */
function lade(name: string): unknown {
  return JSON.parse(readFileSync(fixtureFile(name), "utf8")) as unknown;
}

/** Liest einen Wert aus den Prüfdaten über einen Pfad wie "items.0.hash". */
function wert(quelle: unknown, pfad: string): unknown {
  let aktuell: unknown = quelle;
  for (const teil of pfad.split(".")) {
    if (Array.isArray(aktuell)) aktuell = aktuell[Number(teil)];
    else if (typeof aktuell === "object" && aktuell !== null) aktuell = (aktuell as Record<string, unknown>)[teil];
    else return undefined;
  }
  return aktuell;
}

function textWert(quelle: unknown, pfad: string): string {
  const v = wert(quelle, pfad);
  if (typeof v !== "string") throw new Error(`Prüfdaten: "${pfad}" ist kein Text`);
  return v;
}

function zahlWert(quelle: unknown, pfad: string): number {
  const v = wert(quelle, pfad);
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`Prüfdaten: "${pfad}" ist keine Zahl`);
  return n;
}

/** Liste aus den Prüfdaten (leer, wenn der Pfad nicht auf ein Array zeigt). */
function liste(quelle: unknown, pfad: string): unknown[] {
  const v = pfad ? wert(quelle, pfad) : quelle;
  return Array.isArray(v) ? v : [];
}

/* ------------------------------------------------------------------ */
/* Ersatz für das HTTP-Modul                                           */
/* ------------------------------------------------------------------ */

const http = vi.hoisted(() => ({
  antwort: (url: string): unknown => {
    throw new Error(`Kein Handler für ${url} gesetzt`);
  },
}));

vi.mock("./http", () => ({
  fetchJson: (_provider: string, url: string): Promise<unknown> => Promise.resolve(http.antwort(url)),
  fetchText: (): Promise<string> => Promise.resolve(""),
}));

/** Route: Teilstring der URL -> Antwort. Die erste Übereinstimmung gewinnt. */
type Route = [string, unknown];

/** Setzt die Routen für den nächsten Aufruf. */
function route(...routen: Route[]): void {
  http.antwort = (url: string): unknown => {
    for (const [teil, antwort] of routen) if (url.includes(teil)) return antwort;
    throw new ProviderError("test", `Keine Prüfdaten für URL ${url}`);
  };
}

/** Jede Antwort ist ein leeres Objekt – prüft das Verhalten bei Unerwartetem. */
function routeLeer(): void {
  http.antwort = () => ({});
}

/* ------------------------------------------------------------------ */
/* Gemeinsame Erwartungen                                              */
/* ------------------------------------------------------------------ */

const btcCtx: ProviderContext = { keys: {}, config: {}, chain: "bitcoin" };
const ethCtx: ProviderContext = { keys: {}, config: {}, chain: "ethereum" };
const tronCtx: ProviderContext = { keys: {}, config: {}, chain: "tron" };

/** Alle Beträge sind Zahlen in der kleinsten Einheit, keine Zeichenketten. */
function erwarteBetraegeAlsZahlen(tx: TxInfo): void {
  if (tx.feeSat !== undefined) expect(typeof tx.feeSat).toBe("number");
  for (const i of tx.inputs) if (i.valueSat !== undefined) expect(typeof i.valueSat).toBe("number");
  for (const o of tx.outputs) {
    expect(typeof o.valueSat).toBe("number");
    // Token-Beträge bleiben bewusst Roh-Strings (mehr als 2^53 Einheiten möglich).
    if (o.token) expect(typeof o.token.amount).toBe("string");
  }
}

/** Eine unerwartete Antwort darf höchstens einen kontrollierten Fehler auslösen. */
async function erwarteKontrolliert(aufruf: () => Promise<unknown>): Promise<void> {
  try {
    await aufruf();
  } catch (e) {
    // Ein TypeError bedeutet, dass blind auf ein fehlendes Feld zugegriffen wurde.
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(TypeError);
  }
}

/** Prüft, dass eine Liste absteigend sortiert ist (fehlende Werte am Anfang). */
function istAbsteigend(werte: (number | undefined)[]): boolean {
  const vorhanden = werte.filter((v): v is number => typeof v === "number");
  return vorhanden.every((v, i) => i === 0 || vorhanden[i - 1] >= v);
}

/* ================================================================== */
/* Esplora: mempool.space                                              */
/* ================================================================== */

const meta = hat("_meta") ? lade("_meta") : {};
const BTC_ADDRESS = hat("_meta") ? textWert(meta, "btcAddress") : "";
const BTC_TXID = hat("_meta") ? textWert(meta, "btcTxid") : "";
const BTC_COINBASE_TXID = hat("_meta") ? textWert(meta, "btcCoinbaseTxid") : "";
const EVM_ADDRESS = hat("_meta") ? textWert(meta, "evmAddress") : "";
const EVM_TXID = hat("_meta") ? textWert(meta, "evmTxid") : "";
const TRON_ADDRESS = hat("_meta") ? textWert(meta, "tronAddress") : "";

describe.skipIf(!hat("_meta", "mempool-tx", "mempool-outspends"))("mempool.space: getTx", () => {
  it("bildet die Transaktion vollständig ab", async () => {
    const roh = lade("mempool-tx");
    route([`/tx/${BTC_TXID}/outspends`, lade("mempool-outspends")], [`/tx/${BTC_TXID}`, roh]);

    const tx = await mempoolSpace.getTx(BTC_TXID, btcCtx);

    expect(tx.txid).toBe(BTC_TXID);
    expect(tx.chain).toBe("bitcoin");
    expect(tx.provider).toBe("mempool");
    expect(tx.confirmed).toBe(true);
    expect(tx.blockHeight).toBe(zahlWert(roh, "status.block_height"));
    expect(tx.blockTime).toBe(zahlWert(roh, "status.block_time"));
    expect(tx.feeSat).toBe(zahlWert(roh, "fee"));
    expect(tx.size).toBe(zahlWert(roh, "size"));
    erwarteBetraegeAlsZahlen(tx);
  });

  it("übernimmt Ein- und Ausgänge samt Beträgen", async () => {
    const roh = lade("mempool-tx");
    route([`/tx/${BTC_TXID}/outspends`, lade("mempool-outspends")], [`/tx/${BTC_TXID}`, roh]);

    const tx = await mempoolSpace.getTx(BTC_TXID, btcCtx);

    expect(tx.inputs).toHaveLength(liste(roh, "vin").length);
    expect(tx.inputs[0].txid).toBe(textWert(roh, "vin.0.txid"));
    expect(tx.inputs[0].vout).toBe(zahlWert(roh, "vin.0.vout"));
    expect(tx.inputs[0].valueSat).toBe(zahlWert(roh, "vin.0.prevout.value"));
    expect(tx.inputs[0].coinbase).toBe(false);

    expect(tx.outputs).toHaveLength(liste(roh, "vout").length);
    tx.outputs.forEach((o, n) => {
      expect(o.n).toBe(n);
      expect(o.valueSat).toBe(zahlWert(roh, `vout.${n}.value`));
      expect(o.scriptType).toBe(textWert(roh, `vout.${n}.scriptpubkey_type`));
    });
  });

  it("ergänzt die ausgebenden Transaktionen aus outspends", async () => {
    const outspends = lade("mempool-outspends");
    route([`/tx/${BTC_TXID}/outspends`, outspends], [`/tx/${BTC_TXID}`, lade("mempool-tx")]);

    const tx = await mempoolSpace.getTx(BTC_TXID, btcCtx);

    tx.outputs.forEach((o, i) => {
      expect(o.spent).toBe(wert(outspends, `${i}.spent`));
      expect(o.spentTxid).toBe(wert(outspends, `${i}.txid`));
    });
  });

  it("setzt die Rohmerkmale für den Wallet-Fingerabdruck", async () => {
    const roh = lade("mempool-tx");
    route([`/tx/${BTC_TXID}/outspends`, lade("mempool-outspends")], [`/tx/${BTC_TXID}`, roh]);

    const tx = await mempoolSpace.getTx(BTC_TXID, btcCtx);

    expect(tx.raw).toBeDefined();
    expect(tx.raw?.version).toBe(zahlWert(roh, "version"));
    expect(tx.raw?.locktime).toBe(zahlWert(roh, "locktime"));
    expect(typeof tx.raw?.bip69In).toBe("boolean");
    expect(typeof tx.raw?.bip69Out).toBe("boolean");
  });
});

describe.skipIf(!hat("_meta", "mempool-tx-coinbase"))("mempool.space: Coinbase-Transaktion", () => {
  it("markiert den Eingang als Coinbase und lässt Herkunft leer", async () => {
    const roh = lade("mempool-tx-coinbase");
    route([`/tx/${BTC_COINBASE_TXID}`, roh]);

    const tx = await mempoolSpace.getTx(BTC_COINBASE_TXID, btcCtx);

    expect(tx.inputs).toHaveLength(1);
    expect(tx.inputs[0].coinbase).toBe(true);
    expect(tx.inputs[0].txid).toBeUndefined();
    expect(tx.inputs[0].vout).toBeUndefined();
    expect(tx.outputs[0].valueSat).toBe(zahlWert(roh, "vout.0.value"));
  });
});

describe.skipIf(!hat("_meta", "mempool-address"))("mempool.space: getAddress", () => {
  it("summiert bestätigte und unbestätigte Salden", async () => {
    const roh = lade("mempool-address");
    route([`/address/${BTC_ADDRESS}`, roh]);

    const info = await mempoolSpace.getAddress(BTC_ADDRESS, btcCtx);

    const empfangen = zahlWert(roh, "chain_stats.funded_txo_sum") + zahlWert(roh, "mempool_stats.funded_txo_sum");
    const gesendet = zahlWert(roh, "chain_stats.spent_txo_sum") + zahlWert(roh, "mempool_stats.spent_txo_sum");
    expect(info.receivedSat).toBe(empfangen);
    expect(info.sentSat).toBe(gesendet);
    expect(info.balanceSat).toBe(empfangen - gesendet);
    expect(info.txCount).toBe(zahlWert(roh, "chain_stats.tx_count") + zahlWert(roh, "mempool_stats.tx_count"));
    expect(info.chain).toBe("bitcoin");
    expect(info.provider).toBe("mempool");
    expect(typeof info.balanceSat).toBe("number");
  });
});

describe.skipIf(!hat("_meta", "mempool-address-txs"))("mempool.space: getAddressTxs", () => {
  it("liefert alle Transaktionen der Seite, neueste zuerst", async () => {
    const roh = lade("mempool-address-txs");
    route(["/outspends", []], [`/address/${BTC_ADDRESS}/txs`, roh]);

    const txs = await mempoolSpace.getAddressTxs(BTC_ADDRESS, btcCtx, 50);

    expect(txs).toHaveLength(liste(roh, "").length);
    expect(istAbsteigend(txs.map((t) => t.blockTime))).toBe(true);
    for (const tx of txs) {
      expect(tx.chain).toBe("bitcoin");
      expect(tx.provider).toBe("mempool");
      expect(tx.raw).toBeDefined();
      erwarteBetraegeAlsZahlen(tx);
    }
  });

  it("kürzt auf das angeforderte Limit", async () => {
    route(["/outspends", []], [`/address/${BTC_ADDRESS}/txs`, lade("mempool-address-txs")]);
    const txs = await mempoolSpace.getAddressTxs(BTC_ADDRESS, btcCtx, 2);
    expect(txs).toHaveLength(2);
  });
});

/* ================================================================== */
/* Esplora: Blockstream                                                */
/* ================================================================== */

describe.skipIf(!hat("_meta", "blockstream-tx"))("Blockstream: getTx", () => {
  it("bildet dieselbe Transaktion wie mempool.space ab", async () => {
    const roh = lade("blockstream-tx");
    route([`/tx/${BTC_TXID}`, roh]);

    const tx = await blockstream.getTx(BTC_TXID, btcCtx);

    expect(tx.txid).toBe(BTC_TXID);
    expect(tx.provider).toBe("blockstream");
    expect(tx.chain).toBe("bitcoin");
    expect(tx.confirmed).toBe(true);
    expect(tx.blockHeight).toBe(zahlWert(roh, "status.block_height"));
    expect(tx.blockTime).toBe(zahlWert(roh, "status.block_time"));
    expect(tx.feeSat).toBe(zahlWert(roh, "fee"));
    expect(tx.inputs).toHaveLength(liste(roh, "vin").length);
    expect(tx.outputs).toHaveLength(liste(roh, "vout").length);
    expect(tx.raw?.version).toBe(zahlWert(roh, "version"));
    expect(tx.raw?.locktime).toBe(zahlWert(roh, "locktime"));
    erwarteBetraegeAlsZahlen(tx);
  });
});

describe("Esplora: fremde Chain", () => {
  it("weist einen Aufruf mit falscher Chain ab", async () => {
    route();
    await expect(litecoinSpace.getTx(BTC_TXID, btcCtx)).rejects.toBeInstanceOf(UnsupportedError);
    await expect(mempoolSpace.getAddress(BTC_ADDRESS, tronCtx)).rejects.toBeInstanceOf(UnsupportedError);
  });
});

/* ================================================================== */
/* Blockchain.com                                                      */
/* ================================================================== */

describe.skipIf(!hat("_meta", "blockchain-info-rawtx"))("Blockchain.com: getTx", () => {
  it("bildet die Transaktion vollständig ab", async () => {
    const roh = lade("blockchain-info-rawtx");
    route(["/rawtx/", roh]);

    const tx = await blockchainInfo.getTx(BTC_TXID, btcCtx);

    expect(tx.txid).toBe(BTC_TXID);
    expect(tx.chain).toBe("bitcoin");
    expect(tx.provider).toBe("blockchain-info");
    expect(tx.confirmed).toBe(true);
    expect(tx.blockHeight).toBe(zahlWert(roh, "block_height"));
    expect(tx.blockTime).toBe(zahlWert(roh, "time"));
    expect(tx.feeSat).toBe(zahlWert(roh, "fee"));
    expect(tx.size).toBe(zahlWert(roh, "size"));

    expect(tx.inputs).toHaveLength(liste(roh, "inputs").length);
    expect(tx.inputs[0].address).toBe(textWert(roh, "inputs.0.prev_out.addr"));
    expect(tx.inputs[0].valueSat).toBe(zahlWert(roh, "inputs.0.prev_out.value"));

    expect(tx.outputs).toHaveLength(liste(roh, "out").length);
    tx.outputs.forEach((o, n) => {
      expect(o.n).toBe(zahlWert(roh, `out.${n}.n`));
      expect(o.valueSat).toBe(zahlWert(roh, `out.${n}.value`));
      expect(o.spent).toBe(wert(roh, `out.${n}.spent`));
    });
    erwarteBetraegeAlsZahlen(tx);
  });
});

describe.skipIf(!hat("_meta", "blockchain-info-rawtx-coinbase"))("Blockchain.com: Coinbase-Transaktion", () => {
  // FEHLER IM PROVIDER: src/lib/providers/blockchain-info.ts, mapTx().
  // Der Eingang gilt dort als Coinbase, wenn `prev_out` fehlt. Die echte
  // Antwort von blockchain.info liefert für die Coinbase aber ein `prev_out`
  // mit `tx_index: 0`, `n: 4294967295`, `value: 0` und ohne `addr`; das Feld
  // `coinbase` aus der Typdeklaration existiert in der Antwort gar nicht.
  // Behoben: isCoinbaseInput() prüft zusätzlich auf den Vorgängerindex 0xffffffff
  // ohne Adresse, weil blockchain.info auch für Coinbase ein prev_out liefert.
  it("erkennt Coinbase-Eingänge auch mit vorhandenem prev_out", async () => {
    route(["/rawtx/", lade("blockchain-info-rawtx-coinbase")]);
    const tx = await blockchainInfo.getTx(BTC_COINBASE_TXID, btcCtx);
    expect(tx.inputs[0].coinbase).toBe(true);
  });

  it("bildet den Ausgang der Coinbase trotzdem korrekt ab", async () => {
    const roh = lade("blockchain-info-rawtx-coinbase");
    route(["/rawtx/", roh]);

    const tx = await blockchainInfo.getTx(BTC_COINBASE_TXID, btcCtx);

    expect(tx.txid).toBe(BTC_COINBASE_TXID);
    expect(tx.outputs).toHaveLength(liste(roh, "out").length);
    expect(tx.outputs[0].valueSat).toBe(zahlWert(roh, "out.0.value"));
    expect(tx.inputs[0].address).toBeUndefined();
  });
});

describe.skipIf(!hat("_meta", "blockchain-info-rawaddr"))("Blockchain.com: getAddress und getAddressTxs", () => {
  it("übernimmt Salden und Zähler der Adresse", async () => {
    const roh = lade("blockchain-info-rawaddr");
    route(["/rawaddr/", roh]);

    const info = await blockchainInfo.getAddress(BTC_ADDRESS, btcCtx);

    expect(info.address).toBe(textWert(roh, "address"));
    expect(info.balanceSat).toBe(zahlWert(roh, "final_balance"));
    expect(info.receivedSat).toBe(zahlWert(roh, "total_received"));
    expect(info.sentSat).toBe(zahlWert(roh, "total_sent"));
    expect(info.txCount).toBe(zahlWert(roh, "n_tx"));
    expect(info.chain).toBe("bitcoin");
    expect(info.provider).toBe("blockchain-info");
  });

  it("liefert die Transaktionen der Adresse, neueste zuerst", async () => {
    const roh = lade("blockchain-info-rawaddr");
    route(["/rawaddr/", roh]);

    const txs = await blockchainInfo.getAddressTxs(BTC_ADDRESS, btcCtx, 50);

    expect(txs).toHaveLength(liste(roh, "txs").length);
    expect(istAbsteigend(txs.map((t) => t.blockTime))).toBe(true);
    for (const tx of txs) {
      expect(tx.chain).toBe("bitcoin");
      expect(tx.provider).toBe("blockchain-info");
      erwarteBetraegeAlsZahlen(tx);
    }
  });

  // FEHLER IM PROVIDER: src/lib/providers/blockchain-info.ts, mapTx().
  // `blockHeight: t.block_height` übernimmt den Wert unverändert. Für
  // unbestätigte Transaktionen liefert blockchain.info aber `"block_height": null`,
  // sodass `TxInfo.blockHeight` den Wert `null` trägt, obwohl der Typ
  // `blockHeight?: number` lautet. Behoben: null wird zu undefined vereinheitlicht.
  it("lässt blockHeight bei unbestätigten Transaktionen leer", async () => {
    route(["/rawaddr/", lade("blockchain-info-rawaddr")]);

    const txs = await blockchainInfo.getAddressTxs(BTC_ADDRESS, btcCtx, 50);
    const unbestaetigt = txs.filter((t) => !t.confirmed);

    expect(unbestaetigt.length).toBeGreaterThan(0);
    for (const tx of unbestaetigt) expect(tx.blockHeight).toBeUndefined();
  });
});

/* ================================================================== */
/* BlockCypher                                                         */
/* ================================================================== */

describe.skipIf(!hat("_meta", "blockcypher-tx"))("BlockCypher: getTx", () => {
  it("bildet die Transaktion vollständig ab", async () => {
    const roh = lade("blockcypher-tx");
    route([`/txs/${BTC_TXID}`, roh]);

    const tx = await blockcypher.getTx(BTC_TXID, btcCtx);

    expect(tx.txid).toBe(BTC_TXID);
    expect(tx.chain).toBe("bitcoin");
    expect(tx.provider).toBe("blockcypher");
    expect(tx.confirmed).toBe(true);
    expect(tx.blockHeight).toBe(zahlWert(roh, "block_height"));
    expect(tx.blockTime).toBe(Math.floor(Date.parse(textWert(roh, "confirmed")) / 1000));
    expect(tx.feeSat).toBe(zahlWert(roh, "fees"));
    expect(tx.size).toBe(zahlWert(roh, "size"));

    expect(tx.inputs).toHaveLength(liste(roh, "inputs").length);
    expect(tx.inputs[0].txid).toBe(textWert(roh, "inputs.0.prev_hash"));
    expect(tx.inputs[0].vout).toBe(zahlWert(roh, "inputs.0.output_index"));
    expect(tx.inputs[0].address).toBe(textWert(roh, "inputs.0.addresses.0"));
    expect(tx.inputs[0].valueSat).toBe(zahlWert(roh, "inputs.0.output_value"));
    expect(tx.inputs[0].coinbase).toBe(false);

    expect(tx.outputs).toHaveLength(liste(roh, "outputs").length);
    tx.outputs.forEach((o, n) => {
      expect(o.n).toBe(n);
      expect(o.valueSat).toBe(zahlWert(roh, `outputs.${n}.value`));
      expect(o.address).toBe(textWert(roh, `outputs.${n}.addresses.0`));
      expect(o.scriptType).toBe(textWert(roh, `outputs.${n}.script_type`));
      expect(o.spentTxid).toBe(wert(roh, `outputs.${n}.spent_by`));
    });
    erwarteBetraegeAlsZahlen(tx);
  });

  it("liefert die ausgebenden Transaktionen über getOutspends", async () => {
    const roh = lade("blockcypher-tx");
    route([`/txs/${BTC_TXID}`, roh]);

    const spends = await blockcypher.getOutspends?.(BTC_TXID, btcCtx);

    expect(spends).toHaveLength(liste(roh, "outputs").length);
    expect(spends?.[0].spent).toBe(true);
    expect(spends?.[0].txid).toBe(textWert(roh, "outputs.0.spent_by"));
  });
});

describe.skipIf(!hat("_meta", "blockcypher-address"))("BlockCypher: getAddress", () => {
  it("übernimmt Salden und Zähler der Adresse", async () => {
    const roh = lade("blockcypher-address");
    route([`/addrs/${BTC_ADDRESS}/balance`, roh]);

    const info = await blockcypher.getAddress(BTC_ADDRESS, btcCtx);

    expect(info.address).toBe(textWert(roh, "address"));
    expect(info.balanceSat).toBe(zahlWert(roh, "balance") + zahlWert(roh, "unconfirmed_balance"));
    expect(info.receivedSat).toBe(zahlWert(roh, "total_received"));
    expect(info.sentSat).toBe(zahlWert(roh, "total_sent"));
    expect(info.txCount).toBe(zahlWert(roh, "n_tx"));
    expect(info.chain).toBe("bitcoin");
    expect(info.provider).toBe("blockcypher");
  });
});

describe.skipIf(!hat("_meta", "blockcypher-address-full"))("BlockCypher: getAddressTxs", () => {
  it("liefert die Transaktionen der Adresse, neueste zuerst", async () => {
    const roh = lade("blockcypher-address-full");
    route([`/addrs/${BTC_ADDRESS}/full`, roh]);

    const txs = await blockcypher.getAddressTxs(BTC_ADDRESS, btcCtx, 50);

    expect(txs).toHaveLength(liste(roh, "txs").length);
    expect(istAbsteigend(txs.map((t) => t.blockHeight))).toBe(true);
    for (const tx of txs) {
      expect(tx.chain).toBe("bitcoin");
      expect(tx.provider).toBe("blockcypher");
      erwarteBetraegeAlsZahlen(tx);
    }
  });
});

/* ================================================================== */
/* Blockchair                                                          */
/* ================================================================== */

/**
 * Blockchair beantwortet Anfragen ohne API-Key häufig mit HTTP 430
 * ("IP temporär gesperrt"). Fehlt die Datei `blockchair-tx.json`, konnte sie
 * beim Aufzeichnen nicht geholt werden – die Tests werden dann übersprungen.
 */
describe.skipIf(!hat("_meta", "blockchair-tx"))("Blockchair: getTx", () => {
  it("bildet die Transaktion vollständig ab", async () => {
    const roh = lade("blockchair-tx");
    route(["/dashboards/transaction/", roh]);

    const tx = await blockchair.getTx(BTC_TXID, btcCtx);
    const daten = `data.${BTC_TXID}`;

    expect(tx.txid).toBe(BTC_TXID);
    expect(tx.chain).toBe("bitcoin");
    expect(tx.provider).toBe("blockchair");
    expect(tx.confirmed).toBe(true);
    expect(tx.blockHeight).toBe(zahlWert(roh, `${daten}.transaction.block_id`));
    expect(tx.feeSat).toBe(zahlWert(roh, `${daten}.transaction.fee`));
    expect(tx.inputs).toHaveLength(liste(roh, `${daten}.inputs`).length);
    expect(tx.outputs).toHaveLength(liste(roh, `${daten}.outputs`).length);
    expect(tx.inputs[0].address).toBe(textWert(roh, `${daten}.inputs.0.recipient`));
    expect(tx.inputs[0].valueSat).toBe(zahlWert(roh, `${daten}.inputs.0.value`));
    expect(tx.inputs[0].coinbase).toBe(false);
    expect(tx.outputs[0].valueSat).toBe(zahlWert(roh, `${daten}.outputs.0.value`));
    erwarteBetraegeAlsZahlen(tx);
  });
});

/* ================================================================== */
/* Blockscout (Ethereum)                                               */
/* ================================================================== */

const BS_TX_FIXTURES = ["_meta", "blockscout-tx", "blockscout-tx-token-transfers", "blockscout-tx-internal"];

describe.skipIf(!hat(...BS_TX_FIXTURES))("Blockscout: getTx", () => {
  function bsTxRouten(): Route[] {
    return [
      [`/transactions/${EVM_TXID}/token-transfers`, lade("blockscout-tx-token-transfers")],
      [`/transactions/${EVM_TXID}/internal-transactions`, lade("blockscout-tx-internal")],
      [`/transactions/${EVM_TXID}`, lade("blockscout-tx")],
    ];
  }

  it("bildet die Transaktion vollständig ab", async () => {
    const roh = lade("blockscout-tx");
    route(...bsTxRouten());

    const tx = await blockscout.getTx(EVM_TXID, ethCtx);

    expect(tx.txid).toBe(textWert(roh, "hash"));
    expect(tx.chain).toBe("ethereum");
    expect(tx.provider).toBe("blockscout");
    expect(tx.confirmed).toBe(true);
    expect(tx.blockHeight).toBe(zahlWert(roh, "block_number"));
    expect(tx.blockTime).toBe(Math.floor(Date.parse(textWert(roh, "timestamp")) / 1000));
    expect(tx.feeSat).toBe(Number(textWert(roh, "fee.value")));
    expect(tx.failed).toBeUndefined();
    erwarteBetraegeAlsZahlen(tx);
  });

  it("schreibt Adressen klein und legt Absender als Eingang an", async () => {
    const roh = lade("blockscout-tx");
    route(...bsTxRouten());

    const tx = await blockscout.getTx(EVM_TXID, ethCtx);

    expect(tx.inputs[0].address).toBe(textWert(roh, "from.hash").toLowerCase());
    expect(tx.outputs[0].address).toBe(textWert(roh, "to.hash").toLowerCase());
    expect(tx.outputs[0].valueSat).toBe(Number(textWert(roh, "value")));
    for (const i of tx.inputs) expect(i.address).toBe(i.address?.toLowerCase());
    for (const o of tx.outputs) expect(o.address).toBe(o.address?.toLowerCase());
  });

  it("hängt Token-Transfers als eigene Ausgänge an", async () => {
    const transfers = lade("blockscout-tx-token-transfers");
    route(...bsTxRouten());

    const tx = await blockscout.getTx(EVM_TXID, ethCtx);
    const tokenAusgaenge = tx.outputs.filter((o) => o.token);

    expect(tokenAusgaenge).toHaveLength(liste(transfers, "items").length);
    tokenAusgaenge.forEach((o, i) => {
      const token = o.token;
      expect(token).toBeDefined();
      expect(token?.symbol).toBe(textWert(transfers, `items.${i}.token.symbol`));
      expect(token?.contract).toBe(textWert(transfers, `items.${i}.token.address_hash`).toLowerCase());
      expect(token?.decimals).toBe(zahlWert(transfers, `items.${i}.total.decimals`));
      expect(token?.amount).toBe(textWert(transfers, `items.${i}.total.value`));
      expect(o.valueSat).toBe(0);
      expect(o.address).toBe(textWert(transfers, `items.${i}.to.hash`).toLowerCase());
    });
  });
});

const BS_ADDR_FIXTURES = [
  "_meta",
  "blockscout-address",
  "blockscout-address-counters",
  "blockscout-address-txs",
  "blockscout-address-token-transfers",
];

describe.skipIf(!hat(...BS_ADDR_FIXTURES))("Blockscout: getAddress und getAddressTxs", () => {
  function bsAddrRouten(): Route[] {
    return [
      [`/addresses/${EVM_ADDRESS}/counters`, lade("blockscout-address-counters")],
      [`/addresses/${EVM_ADDRESS}/token-transfers`, lade("blockscout-address-token-transfers")],
      [`/addresses/${EVM_ADDRESS}/transactions`, lade("blockscout-address-txs")],
      [`/addresses/${EVM_ADDRESS}`, lade("blockscout-address")],
    ];
  }

  it("übernimmt Guthaben und Zähler", async () => {
    const roh = lade("blockscout-address");
    const zaehler = lade("blockscout-address-counters");
    route(...bsAddrRouten());

    const info = await blockscout.getAddress(EVM_ADDRESS, ethCtx);

    expect(info.address).toBe(EVM_ADDRESS);
    expect(info.balanceSat).toBe(Number(BigInt(textWert(roh, "coin_balance"))));
    expect(info.txCount).toBe(zahlWert(zaehler, "transactions_count"));
    expect(info.chain).toBe("ethereum");
    expect(info.provider).toBe("blockscout");
    expect(typeof info.receivedSat).toBe("number");
    expect(typeof info.sentSat).toBe("number");
    expect(info.balanceSat).toBeGreaterThan(0);
  });

  it("liefert die Transaktionen der Adresse, neueste zuerst", async () => {
    const roh = lade("blockscout-address-txs");
    route(...bsAddrRouten());

    const txs = await blockscout.getAddressTxs(EVM_ADDRESS, ethCtx, 5);

    expect(txs).toHaveLength(liste(roh, "items").length);
    expect(istAbsteigend(txs.map((t) => t.blockHeight))).toBe(true);
    for (const tx of txs) {
      expect(tx.chain).toBe("ethereum");
      expect(tx.provider).toBe("blockscout");
      expect(tx.inputs.length).toBeGreaterThan(0);
      expect(tx.outputs.length).toBeGreaterThan(0);
      erwarteBetraegeAlsZahlen(tx);
    }
  });
});

describe("Etherscan: fehlender API-Key", () => {
  it("meldet den fehlenden Schlüssel als kontrollierten Fehler", async () => {
    route();
    await expect(etherscan.getTx(EVM_TXID || "0x0", ethCtx)).rejects.toBeInstanceOf(ProviderError);
  });
});

/* ================================================================== */
/* TronGrid                                                            */
/* ================================================================== */

describe.skipIf(!hat("_meta", "trongrid-tx", "trongrid-tx-info"))("TronGrid: getTx", () => {
  it("bildet die TRC20-Transaktion samt Token-Ausgang ab", async () => {
    const info = lade("trongrid-tx-info");
    route(["/wallet/gettransactioninfobyid", info], ["/wallet/gettransactionbyid", lade("trongrid-tx")]);

    const txid = textWert(info, "id");
    const tx = await trongrid.getTx(txid, tronCtx);

    expect(tx.txid).toBe(txid.toLowerCase());
    expect(tx.chain).toBe("tron");
    expect(tx.provider).toBe("trongrid");
    expect(tx.confirmed).toBe(true);
    expect(tx.blockHeight).toBe(zahlWert(info, "blockNumber"));
    expect(tx.blockTime).toBe(Math.floor(zahlWert(info, "blockTimeStamp") / 1000));
    expect(tx.feeSat).toBe(zahlWert(info, "fee"));
    expect(tx.failed).toBeUndefined();

    expect(tx.inputs).toHaveLength(1);
    expect(tx.outputs).toHaveLength(1);
    const token = tx.outputs[0].token;
    expect(token).toBeDefined();
    expect(token?.contract).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(token?.decimals).toBe(6);
    expect(token?.amount).toMatch(/^[0-9]+$/);
    expect(tx.outputs[0].valueSat).toBe(0);
    erwarteBetraegeAlsZahlen(tx);
  });
});

describe.skipIf(!hat("_meta", "trongrid-account", "trongrid-account-txs", "trongrid-trc20"))(
  "TronGrid: getAddress und getAddressTxs",
  () => {
    function tronRouten(): Route[] {
      return [
        [`/v1/accounts/${TRON_ADDRESS}/transactions/trc20`, lade("trongrid-trc20")],
        [`/v1/accounts/${TRON_ADDRESS}/transactions`, lade("trongrid-account-txs")],
        [`/v1/accounts/${TRON_ADDRESS}`, lade("trongrid-account")],
      ];
    }

    it("übernimmt das Guthaben des Kontos", async () => {
      const roh = lade("trongrid-account");
      route(...tronRouten());

      const info = await trongrid.getAddress(TRON_ADDRESS, tronCtx);

      expect(info.address).toBe(TRON_ADDRESS);
      expect(info.balanceSat).toBe(zahlWert(roh, "data.0.balance"));
      expect(info.chain).toBe("tron");
      expect(info.provider).toBe("trongrid");
      expect(typeof info.receivedSat).toBe("number");
      expect(typeof info.sentSat).toBe("number");
      expect(info.txCount).toBeGreaterThan(0);
    });

    it("führt native und TRC20-Transfers zusammen, neueste zuerst", async () => {
      const nativ = lade("trongrid-account-txs");
      const trc20 = lade("trongrid-trc20");
      route(...tronRouten());

      const txs = await trongrid.getAddressTxs(TRON_ADDRESS, tronCtx, 50);

      const ids = new Set<string>();
      for (const e of liste(nativ, "data")) ids.add(textWert(e, "txID").toLowerCase());
      for (const e of liste(trc20, "data")) ids.add(textWert(e, "transaction_id").toLowerCase());
      expect(txs).toHaveLength(ids.size);
      expect(istAbsteigend(txs.map((t) => t.blockTime))).toBe(true);
      for (const tx of txs) {
        expect(tx.chain).toBe("tron");
        expect(tx.provider).toBe("trongrid");
        erwarteBetraegeAlsZahlen(tx);
      }
    });

    it("übernimmt Symbol, Vertrag und Dezimalstellen der TRC20-Transfers", async () => {
      const trc20 = lade("trongrid-trc20");
      route(...tronRouten());

      const txs = await trongrid.getAddressTxs(TRON_ADDRESS, tronCtx, 50);
      const erste = liste(trc20, "data")[0];
      const tx = txs.find((t) => t.txid === textWert(erste, "transaction_id").toLowerCase());

      expect(tx).toBeDefined();
      const token = tx?.outputs[0].token;
      expect(token?.symbol).toBe(textWert(erste, "token_info.symbol"));
      expect(token?.contract).toBe(textWert(erste, "token_info.address"));
      expect(token?.decimals).toBe(zahlWert(erste, "token_info.decimals"));
      expect(token?.amount).toBe(textWert(erste, "value"));
      expect(tx?.inputs[0].address).toBe(textWert(erste, "from"));
      expect(tx?.outputs[0].address).toBe(textWert(erste, "to"));
    });
  },
);

/* ================================================================== */
/* Übergreifend: unerwartete Antworten                                 */
/* ================================================================== */

describe("Alle Provider: leere oder unerwartete Antwort", () => {
  /** Methoden, die eine unerwartete Antwort kontrolliert verarbeiten. */
  const robust: { name: string; aufruf: () => Promise<unknown> }[] = [
    { name: "mempool.getAddressTxs", aufruf: () => mempoolSpace.getAddressTxs("bc1leer", btcCtx) },
    { name: "blockchainInfo.getAddress", aufruf: () => blockchainInfo.getAddress("1leer", btcCtx) },
    { name: "blockcypher.getAddress", aufruf: () => blockcypher.getAddress("1leer", btcCtx) },
    { name: "blockcypher.getAddressTxs", aufruf: () => blockcypher.getAddressTxs("1leer", btcCtx) },
    { name: "blockscout.getTx", aufruf: () => blockscout.getTx("0x00", ethCtx) },
    { name: "blockscout.getAddress", aufruf: () => blockscout.getAddress("0xleer", ethCtx) },
    { name: "blockscout.getAddressTxs", aufruf: () => blockscout.getAddressTxs("0xleer", ethCtx) },
    { name: "trongrid.getTx", aufruf: () => trongrid.getTx("00", tronCtx) },
    { name: "trongrid.getAddress", aufruf: () => trongrid.getAddress("Tleer", tronCtx) },
    { name: "trongrid.getAddressTxs", aufruf: () => trongrid.getAddressTxs("Tleer", tronCtx) },
  ];

  for (const fall of robust) {
    it(`${fall.name} verarbeitet ein leeres Objekt kontrolliert`, async () => {
      routeLeer();
      await erwarteKontrolliert(fall.aufruf);
    });
  }

  /*
   * FEHLER IN DEN PROVIDERN: die folgenden Methoden greifen ungeprüft auf
   * verschachtelte Felder der Antwort zu. Kommt vom Anbieter eine unerwartete
   * Struktur (Wartungsseite, Fehlerobjekt mit HTTP 200, geänderte API), endet
   * das in einem TypeError statt in einem ProviderError – der Aufrufer kann den
   * Fehler dann nicht als Anbieterproblem erkennen und auf eine andere Quelle
   * ausweichen. Behoben: alle unten genannten Stellen prüfen die Struktur und
   * werfen einen ProviderError mit klarer Meldung.
   *
   *   src/lib/providers/esplora.ts        mapTx()          -> t.status.confirmed, t.vin.map
   *   src/lib/providers/esplora.ts        getAddress()     -> a.chain_stats.funded_txo_sum
   *   src/lib/providers/blockchain-info.ts mapTx()         -> t.inputs.map
   *   src/lib/providers/blockchain-info.ts getAddressTxs() -> a.txs.map
   *   src/lib/providers/blockcypher.ts    mapTx()          -> t.inputs.map
   *   src/lib/providers/blockchair.ts     getTx()/getAddress()/getAddressTxs() -> r.data[...]
   */
  const robustheitsFaelle: { name: string; aufruf: () => Promise<unknown> }[] = [
    { name: "mempool.getTx", aufruf: () => mempoolSpace.getTx("00", btcCtx) },
    { name: "mempool.getAddress", aufruf: () => mempoolSpace.getAddress("bc1leer", btcCtx) },
    { name: "blockstream.getTx", aufruf: () => blockstream.getTx("00", btcCtx) },
    { name: "blockchainInfo.getTx", aufruf: () => blockchainInfo.getTx("00", btcCtx) },
    { name: "blockchainInfo.getAddressTxs", aufruf: () => blockchainInfo.getAddressTxs("1leer", btcCtx) },
    { name: "blockcypher.getTx", aufruf: () => blockcypher.getTx("00", btcCtx) },
    { name: "blockchair.getTx", aufruf: () => blockchair.getTx("00", btcCtx) },
    { name: "blockchair.getAddress", aufruf: () => blockchair.getAddress("1leer", btcCtx) },
    { name: "blockchair.getAddressTxs", aufruf: () => blockchair.getAddressTxs("1leer", btcCtx) },
  ];

  for (const fall of robustheitsFaelle) {
    it(`${fall.name} meldet bei einem leeren Objekt einen kontrollierten Anbieterfehler`, async () => {
      routeLeer();
      await erwarteKontrolliert(fall.aufruf);
    });
  }
});
