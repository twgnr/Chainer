import type { TxInfo } from "../providers/types";

/**
 * Wallet-Fingerabdruck.
 *
 * Wallet-Programme bauen Transaktionen unterschiedlich: Version, Sperrzeit,
 * Sequenznummern, Sortierung der Ein- und Ausgänge, Skript-Typen. Diese
 * Merkmale sind für sich genommen unauffällig, in Kombination aber ein
 * brauchbarer Hinweis darauf, dass zwei Transaktionen mit derselben Software
 * erstellt wurden – auch ohne gemeinsame Eingänge.
 *
 * Alle Aussagen sind Indizien, keine Beweise.
 */

export interface RawTxFeatures {
  version?: number;
  locktime?: number;
  /** Mindestens ein Eingang signalisiert Ersetzbarkeit (BIP125) */
  rbf?: boolean;
  /** Eingänge nach BIP69 sortiert (txid, dann Index) */
  bip69In?: boolean;
  /** Ausgänge nach BIP69 sortiert (Betrag, dann Skript) */
  bip69Out?: boolean;
  /** Häufigster Sequenzwert als Hex, z. B. "fffffffd" */
  sequence?: string;
}

/** Prüft, ob die Eingänge der BIP69-Sortierung folgen. */
export function bip69Inputs(ins: { txid?: string; vout?: number }[]): boolean {
  if (ins.length < 2) return false;
  for (let i = 1; i < ins.length; i++) {
    const a = ins[i - 1];
    const b = ins[i];
    if (!a.txid || !b.txid) return false;
    if (a.txid > b.txid) return false;
    if (a.txid === b.txid && (a.vout ?? 0) > (b.vout ?? 0)) return false;
  }
  return true;
}

/** Prüft, ob die Ausgänge der BIP69-Sortierung folgen. */
export function bip69Outputs(outs: { valueSat: number; script?: string }[]): boolean {
  if (outs.length < 2) return false;
  for (let i = 1; i < outs.length; i++) {
    const a = outs[i - 1];
    const b = outs[i];
    if (a.valueSat > b.valueSat) return false;
    if (a.valueSat === b.valueSat && (a.script ?? "") > (b.script ?? "")) return false;
  }
  return true;
}

/** Fasst die Rohmerkmale einer Transaktion zusammen. */
export function computeRawFeatures(input: {
  version?: number;
  locktime?: number;
  sequences?: number[];
  ins: { txid?: string; vout?: number }[];
  outs: { valueSat: number; script?: string }[];
}): RawTxFeatures {
  const seqs = input.sequences ?? [];
  // Häufigsten Sequenzwert bestimmen
  const counts = new Map<number, number>();
  for (const s of seqs) counts.set(s, (counts.get(s) ?? 0) + 1);
  let common: number | undefined;
  let best = 0;
  for (const [v, c] of counts) {
    if (c > best) {
      best = c;
      common = v;
    }
  }
  return {
    version: input.version,
    locktime: input.locktime,
    // BIP125: ein Eingang mit sequence < 0xfffffffe signalisiert Ersetzbarkeit
    rbf: seqs.length ? seqs.some((s) => s < 0xfffffffe) : undefined,
    bip69In: bip69Inputs(input.ins),
    bip69Out: bip69Outputs(input.outs),
    sequence: common !== undefined ? common.toString(16) : undefined,
  };
}

export interface Fingerprint {
  /** Kurzform der Merkmale, gleiche Zeichenkette = gleiches Bauverhalten */
  signature: string;
  /** Lesbare Merkmale für die Anzeige */
  traits: string[];
  /** Wallet-Programme, zu denen die Merkmale passen */
  candidates: string[];
}

const scriptTypeName: Record<string, string> = {
  p2pkh: "P2PKH",
  p2sh: "P2SH",
  v0_p2wpkh: "P2WPKH",
  v0_p2wsh: "P2WSH",
  v1_p2tr: "Taproot",
  p2wpkh: "P2WPKH",
  p2wsh: "P2WSH",
  p2tr: "Taproot",
};

/**
 * Bildet aus den Rohmerkmalen einen Fingerabdruck. Die Zuordnung zu konkreten
 * Programmen beruht auf öffentlich dokumentiertem Verhalten und ist bewusst als
 * Kandidatenliste formuliert.
 */
export function walletFingerprint(tx: TxInfo): Fingerprint | null {
  const r = tx.raw;
  if (!r || (r.version === undefined && r.locktime === undefined && r.bip69In === undefined)) return null;

  const outTypes = [...new Set(tx.outputs.map((o) => o.scriptType).filter(Boolean))] as string[];
  const typeKey = outTypes.map((t) => scriptTypeName[t] ?? t).sort().join("+");

  const parts = [
    `v${r.version ?? "?"}`,
    r.locktime && r.locktime > 0 ? "lt>0" : "lt0",
    r.rbf === undefined ? "rbf?" : r.rbf ? "rbf" : "final",
    r.sequence ? `seq${r.sequence}` : "seq?",
    r.bip69In ? "in69" : "in-",
    r.bip69Out ? "out69" : "out-",
    typeKey || "typ?",
  ];

  const traits: string[] = [];
  if (r.version !== undefined) traits.push(`Version ${r.version}`);
  if (r.locktime !== undefined)
    traits.push(r.locktime > 0 ? `Sperrzeit gesetzt (${r.locktime})` : "Sperrzeit 0");
  if (r.rbf !== undefined) traits.push(r.rbf ? "ersetzbar (BIP125)" : "nicht ersetzbar");
  if (r.sequence) traits.push(`Sequenz 0x${r.sequence}`);
  if (r.bip69In || r.bip69Out)
    traits.push(
      `BIP69-Sortierung (${[r.bip69In ? "Eingänge" : null, r.bip69Out ? "Ausgänge" : null].filter(Boolean).join(" und ")})`,
    );
  if (outTypes.length) traits.push(`Ausgangstypen: ${typeKey}`);

  /* --- Zuordnung zu Programmen (Indizien) --- */
  const candidates: string[] = [];
  const lockSet = (r.locktime ?? 0) > 0;
  const bip69 = !!(r.bip69In && r.bip69Out);

  if (lockSet && r.rbf && !bip69) candidates.push("Bitcoin Core", "Electrum");
  if (lockSet && !r.rbf) candidates.push("Bitcoin Core (ohne Ersetzbarkeit)");
  if (bip69) candidates.push("Trezor Suite", "BlueWallet", "andere BIP69-Wallets");
  if (!lockSet && r.sequence === "ffffffff") candidates.push("Börsen-Batch oder ältere Wallet");
  if (r.version === 1 && !lockSet) candidates.push("ältere oder eigene Implementierung");

  return { signature: parts.join("/"), traits, candidates: [...new Set(candidates)] };
}

export interface FingerprintGroup {
  signature: string;
  txids: string[];
  traits: string[];
  candidates: string[];
}

/**
 * Gruppiert Transaktionen mit identischem Fingerabdruck. Nur Gruppen ab zwei
 * Transaktionen sind aussagekräftig.
 */
export function groupByFingerprint(txs: TxInfo[]): FingerprintGroup[] {
  const groups = new Map<string, FingerprintGroup>();
  for (const tx of txs) {
    const fp = walletFingerprint(tx);
    if (!fp) continue;
    const g = groups.get(fp.signature) ?? {
      signature: fp.signature,
      txids: [],
      traits: fp.traits,
      candidates: fp.candidates,
    };
    g.txids.push(tx.txid);
    groups.set(fp.signature, g);
  }
  return [...groups.values()].filter((g) => g.txids.length >= 2).sort((a, b) => b.txids.length - a.txids.length);
}
