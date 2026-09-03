#!/usr/bin/env node
/**
 * Zeichnet echte Antworten der Blockchain-Anbieter auf und legt sie als
 * Prüfdaten (Fixtures) unter `src/lib/providers/__fixtures__/` ab.
 *
 * Aufruf:
 *   npm run fixtures            – nur fehlende Dateien holen
 *   npm run fixtures -- --force – alle Dateien neu aufzeichnen
 *
 * Nur dieses Skript geht ins Netz; die Tests lesen ausschließlich die
 * abgelegten Dateien. Sehr große Listen werden auf die ersten Einträge
 * gekürzt, damit die Dateien handhabbar bleiben. Wird eine Liste gekürzt,
 * entfernen wir auch den Paginierungszeiger (`next_page_params`), weil er
 * nach dem Kürzen nicht mehr zur Liste passt.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src", "lib", "providers", "__fixtures__");

const FORCE = process.argv.includes("--force");

/** Bekannte, dauerhaft existierende Objekte. */
const BTC_ADDRESS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"; // Genesis-Adresse
const BTC_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16"; // erste Zahlung
const BTC_COINBASE_TXID = "0e3e2357e806b6cdb1f70b54c3a3a17b6714ee1f0e68bebb44a74b1efd512098"; // Coinbase Block 1
const EVM_ADDRESS = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"; // aktive Adresse
const TRON_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // USDT-TRC20-Vertrag

/** Maximale Anzahl Einträge in gekürzten Listen. */
const MAX_ITEMS = 5;

/* ------------------------------------------------------------------ */
/* Hilfen                                                              */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Kürzt eine Liste unter `key` (oder die Wurzel-Liste) auf MAX_ITEMS. */
function shrinkList(key) {
  return (value) => {
    if (key === null) return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : value;
    if (!isRecord(value) || !Array.isArray(value[key])) return value;
    const shortened = value[key].length > MAX_ITEMS;
    const out = { ...value, [key]: value[key].slice(0, MAX_ITEMS) };
    // Der Paginierungszeiger passt nach dem Kürzen nicht mehr zur Liste.
    if (shortened && "next_page_params" in out) out.next_page_params = null;
    return out;
  };
}

/**
 * Ein Tron-Konto führt alle TRC10-/TRC20-Guthaben mit; bei stark genutzten
 * Konten sind das Tausende Einträge. Für das Mapping zählt nur `balance`.
 */
function shrinkTronAccount(value) {
  if (!isRecord(value) || !Array.isArray(value.data)) return value;
  const data = value.data.slice(0, MAX_ITEMS).map((entry) => {
    if (!isRecord(entry)) return entry;
    const out = { ...entry };
    for (const key of ["trc20", "assetV2", "free_asset_net_usageV2", "frozenV2"]) {
      if (Array.isArray(out[key])) out[key] = out[key].slice(0, MAX_ITEMS);
    }
    return out;
  });
  return { ...value, data };
}

function fixturePath(name) {
  return join(OUT_DIR, `${name}.json`);
}

async function readFixture(name) {
  try {
    return JSON.parse(await readFile(fixturePath(name), "utf8"));
  } catch {
    return undefined;
  }
}

async function request(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", "User-Agent": "Chainer-Fixtures/1.0", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status} ${res.statusText} – ${body.slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const report = [];

/**
 * Holt eine Antwort und legt sie ab.
 * Liefert die (gekürzten) Daten oder undefined, wenn übersprungen/fehlgeschlagen.
 */
async function record(name, url, opts = {}) {
  const { init, shrink, optional = false, pauseMs = 350, note } = opts;
  const target = fixturePath(name);
  const rel = relative(ROOT, target).split("\\").join("/");

  if (existsSync(target) && !FORCE) {
    const existing = await readFixture(name);
    report.push({ name, status: "vorhanden", info: `${rel} (unverändert, --force überschreibt)` });
    return existing;
  }

  try {
    const raw = await request(url, init);
    const data = shrink ? shrink(raw) : raw;
    const text = JSON.stringify(data, null, 2) + "\n";
    await writeFile(target, text, "utf8");
    report.push({
      name,
      status: "aufgezeichnet",
      info: `${rel} (${(Buffer.byteLength(text) / 1024).toFixed(1)} kB)${note ? ` – ${note}` : ""}`,
    });
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.push({
      name,
      status: optional ? "übersprungen" : "FEHLER",
      info: `${url} – ${msg}${optional ? " (optional, Test wird übersprungen)" : ""}`,
    });
    return undefined;
  } finally {
    await sleep(pauseMs);
  }
}

/* ------------------------------------------------------------------ */
/* Aufzeichnung                                                        */
/* ------------------------------------------------------------------ */

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const meta = {
    btcAddress: BTC_ADDRESS,
    btcTxid: BTC_TXID,
    btcCoinbaseTxid: BTC_COINBASE_TXID,
    evmAddress: EVM_ADDRESS,
    evmTxid: undefined,
    tronAddress: TRON_ADDRESS,
    tronTxid: undefined,
  };

  /* --- Esplora: mempool.space --- */
  const MEMPOOL = "https://mempool.space/api";
  await record("mempool-address", `${MEMPOOL}/address/${BTC_ADDRESS}`);
  await record("mempool-address-txs", `${MEMPOOL}/address/${BTC_ADDRESS}/txs`, { shrink: shrinkList(null) });
  await record("mempool-tx", `${MEMPOOL}/tx/${BTC_TXID}`);
  await record("mempool-outspends", `${MEMPOOL}/tx/${BTC_TXID}/outspends`);
  await record("mempool-tx-coinbase", `${MEMPOOL}/tx/${BTC_COINBASE_TXID}`, {
    note: "Coinbase-Transaktion aus Block 1",
  });

  /* --- Esplora: Blockstream --- */
  await record("blockstream-tx", `https://blockstream.info/api/tx/${BTC_TXID}`);

  /* --- Blockchain.com (empfohlen: höchstens ca. 1 Anfrage / 10 s) --- */
  const BI = "https://blockchain.info";
  await record("blockchain-info-rawaddr", `${BI}/rawaddr/${BTC_ADDRESS}?limit=5`, {
    shrink: shrinkList("txs"),
    pauseMs: 2000,
  });
  await record("blockchain-info-rawtx", `${BI}/rawtx/${BTC_TXID}`, { pauseMs: 2000 });
  await record("blockchain-info-rawtx-coinbase", `${BI}/rawtx/${BTC_COINBASE_TXID}`, {
    pauseMs: 2000,
    note: "Coinbase-Transaktion aus Block 1",
  });

  /* --- BlockCypher (ohne Token 3 Anfragen/s, 100/h) --- */
  const BCY = "https://api.blockcypher.com/v1/btc/main";
  await record("blockcypher-tx", `${BCY}/txs/${BTC_TXID}?limit=50`);
  await record("blockcypher-address", `${BCY}/addrs/${BTC_ADDRESS}/balance?x=1`);
  await record("blockcypher-address-full", `${BCY}/addrs/${BTC_ADDRESS}/full?limit=50`, {
    shrink: shrinkList("txs"),
  });

  /* --- Blockchair (ohne Key oft HTTP 430; dann wird die Datei übersprungen) --- */
  await record("blockchair-tx", `https://api.blockchair.com/bitcoin/dashboards/transaction/${BTC_TXID}`, {
    optional: true,
    note: "ohne API-Key häufig HTTP 430",
  });

  /* --- Blockscout (Ethereum) --- */
  const BS = "https://eth.blockscout.com/api/v2";
  const bsTokenTransfers = await record(
    "blockscout-address-token-transfers",
    `${BS}/addresses/${EVM_ADDRESS}/token-transfers`,
    { shrink: shrinkList("items") },
  );
  await record("blockscout-address", `${BS}/addresses/${EVM_ADDRESS}`);
  await record("blockscout-address-counters", `${BS}/addresses/${EVM_ADDRESS}/counters`);
  await record("blockscout-address-txs", `${BS}/addresses/${EVM_ADDRESS}/transactions`, {
    shrink: shrinkList("items"),
  });

  // Für die Transaktions-Prüfdaten eine Transaktion mit Token-Transfer wählen,
  // damit das Mapping der Token-Ausgänge geprüft werden kann.
  const firstTransfer = isRecord(bsTokenTransfers) ? (bsTokenTransfers.items ?? [])[0] : undefined;
  const evmTxid = isRecord(firstTransfer) ? (firstTransfer.transaction_hash ?? firstTransfer.tx_hash) : undefined;
  if (typeof evmTxid === "string") {
    meta.evmTxid = evmTxid;
    await record("blockscout-tx", `${BS}/transactions/${evmTxid}`);
    await record("blockscout-tx-token-transfers", `${BS}/transactions/${evmTxid}/token-transfers`, {
      shrink: shrinkList("items"),
    });
    await record("blockscout-tx-internal", `${BS}/transactions/${evmTxid}/internal-transactions`, {
      shrink: shrinkList("items"),
      optional: true,
    });
  } else {
    // Beim erneuten Lauf ohne --force liegt die Liste schon vor; dann die
    // bereits aufgezeichnete Transaktions-ID aus _meta.json weiterverwenden.
    const old = await readFixture("_meta");
    if (old && old.evmTxid) meta.evmTxid = old.evmTxid;
    report.push({
      name: "blockscout-tx",
      status: "übersprungen",
      info: "keine Token-Transfer-Liste vorhanden, aus der eine Transaktions-ID stammen könnte",
    });
  }

  /* --- TronGrid (ohne API-Key nur 3 Anfragen/s: nacheinander mit Pause) --- */
  const TG = "https://api.trongrid.io";
  await record("trongrid-account", `${TG}/v1/accounts/${TRON_ADDRESS}`, {
    shrink: shrinkTronAccount,
    pauseMs: 800,
  });
  const tronTxs = await record(
    "trongrid-account-txs",
    `${TG}/v1/accounts/${TRON_ADDRESS}/transactions?limit=5&order_by=block_timestamp,desc`,
    { shrink: shrinkList("data"), pauseMs: 800 },
  );
  await record(
    "trongrid-trc20",
    `${TG}/v1/accounts/${TRON_ADDRESS}/transactions/trc20?limit=5&order_by=block_timestamp,desc`,
    { shrink: shrinkList("data"), pauseMs: 800 },
  );

  const firstTron = isRecord(tronTxs) ? (tronTxs.data ?? [])[0] : undefined;
  const tronTxid = isRecord(firstTron) ? firstTron.txID : undefined;
  if (typeof tronTxid === "string") {
    meta.tronTxid = tronTxid;
    const post = (body) => ({
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      pauseMs: 800,
    });
    await record("trongrid-tx", `${TG}/wallet/gettransactionbyid`, post({ value: tronTxid }));
    await record("trongrid-tx-info", `${TG}/wallet/gettransactioninfobyid`, post({ value: tronTxid }));
  } else {
    const old = await readFixture("_meta");
    if (old && old.tronTxid) meta.tronTxid = old.tronTxid;
    report.push({ name: "trongrid-tx", status: "übersprungen", info: "keine Transaktionsliste vorhanden" });
  }

  /* --- Begleitdaten --- */
  // `recordedAt` nur fortschreiben, wenn tatsächlich etwas geholt wurde: ein
  // Lauf ohne neue Aufzeichnung soll keine Datei verändern.
  const old = await readFixture("_meta");
  const neuGeholt = report.some((r) => r.status === "aufgezeichnet");
  const merged = {
    recordedAt: old?.recordedAt ?? new Date().toISOString(),
    ...(old ?? {}),
    ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)),
  };
  if (neuGeholt) merged.recordedAt = new Date().toISOString();
  const metaText = JSON.stringify(merged, null, 2) + "\n";
  const unveraendert = old !== undefined && metaText === JSON.stringify(old, null, 2) + "\n";
  if (!unveraendert) await writeFile(fixturePath("_meta"), metaText, "utf8");
  report.push({
    name: "_meta",
    status: unveraendert ? "vorhanden" : old ? "aktualisiert" : "aufgezeichnet",
    info: "Adressen und IDs der Prüfdaten",
  });

  /* --- Bericht --- */
  const width = Math.max(...report.map((r) => r.name.length));
  console.log(`\nPrüfdaten in ${relative(ROOT, OUT_DIR).split("\\").join("/")}${FORCE ? " (--force)" : ""}:\n`);
  for (const r of report) {
    console.log(`  ${r.name.padEnd(width)}  ${r.status.padEnd(13)} ${r.info}`);
  }
  const failed = report.filter((r) => r.status === "FEHLER");
  const skipped = report.filter((r) => r.status === "übersprungen");
  console.log(
    `\n${report.filter((r) => r.status === "aufgezeichnet").length} aufgezeichnet, ` +
      `${report.filter((r) => r.status === "vorhanden").length} unverändert, ` +
      `${skipped.length} übersprungen, ${failed.length} fehlgeschlagen.\n`,
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Aufzeichnung abgebrochen:", e);
  process.exitCode = 1;
});
