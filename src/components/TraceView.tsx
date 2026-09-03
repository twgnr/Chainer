"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import TraceGraph, { EMPTY_VIEW, clusterColor, type GraphOptions, type GraphViewState } from "./TraceGraph";
import TraceTimeline from "./TraceTimeline";
import ActivityHeatmap from "./ActivityHeatmap";
import LabelBadges from "./LabelBadges";
import { DEFAULT_PARAMS, type TraceNode, type TraceParams, type TraceProgress, type TraceResult } from "@/lib/trace/types";
import { shortHash } from "@/lib/format";
import { CHAIN_LIST, chainMeta, type ChainId } from "@/lib/chains";
import { categoryText } from "@/lib/trace/risk";
import { useFormatters, useLocale, useT } from "@/lib/i18n/provider";
import { translateHint, translateHints } from "@/lib/i18n/hints";

const TXT = {
  en: {
    requestFailed: "The request failed",
    addedToCase: "Added to the case.",
    savedAsCase: "Saved as a new case.",
    error: "Error",
    start: "Start (address or transaction ID)",
    moreStarts: "More starting points (one per line, optional)",
    moreStartsPlaceholder: "e.g. further victim addresses",
    chain: "Chain",
    mode: "Mode",
    modeTitle:
      "Address-based follows every transaction of an address. UTXO-exact follows only the specific coins.",
    modeAddress: "address-based",
    modeUtxo: "UTXO-exact",
    direction: "Direction",
    dirForward: "Forward (where to?)",
    dirBackward: "Backward (where from?)",
    dirBoth: "Both",
    taintModel: "Taint model",
    taintTitle: "Haircut: proportional. Poison: everything is tainted. FIFO: order-based.",
    taintHaircut: "Haircut (proportional)",
    taintFifo: "FIFO (order)",
    taintPoison: "Poison (strict)",
    taintNone: "none",
    depth: "Depth",
    txPerAddress: "Tx / address",
    addrPerTx: "Addr. / tx",
    minUnit: (unit: string) => `Min. ${unit}`,
    maxNodes: "Max. nodes",
    tracing: "Tracing…",
    startTrace: "Start the trace",
    cancel: "Cancel",
    labels: "Labels",
    historicPrices: "historic rates",
    includeMediumTitle: "Also count mixers and addresses with medium risk as a harmful origin",
    includeMedium: "include medium risk",
    merges: (n: number) => `${n} manual merge${n === 1 ? "" : "s"}`,
    reset: "reset",
    progressCounts: (nodes: number, edges: number, calls: number) =>
      `${nodes} nodes · ${edges} edges · ${calls} API calls`,
    addresses: "addresses",
    transactions: "transactions",
    clusters: "clusters",
    riskAddresses: "risk addresses",
    riskInflowTitle: "Money in the graph that comes from harmful addresses",
    riskInflow: (amount: string, sources: number) =>
      `${amount} from ${sources} harmful address${sources === 1 ? "" : "es"}`,
    taintedTitle: "Amount from the starting source that sits at endpoints in the graph",
    tracked: "traced",
    apiStats: (calls: number, seconds: string, providers: string) =>
      `${calls} API calls · ${seconds} s · ${providers}`,
    truncated: "cut down by the limits",
    exportJson: "Export JSON",
    name: "Name",
    addToCase: "Add to the case",
    saveAsCase: "Save as a case",
    loginToSave: "Log in to save",
    riskBannerTitle: (n: number) => `${n} address${n === 1 ? "" : "es"} classified as harmful in the graph`,
    riskBannerBody: (affected: number, amount: string, fiat: string) =>
      `${affected} downstream address${affected === 1 ? "" : "es"} received money from them, ${amount}${fiat} in total.`,
    viewWarnings: "View the warnings",
    moreSources: (n: number) => `+${n} more`,
    sourceTitle: (address: string, source: string) => `${address} · source: ${source}`,
    tabGraph: "Graph",
    tabTimeline: "History",
    tabPatterns: "Patterns",
    tabRisk: "Warnings",
    tabRiskCount: (n: number) => `Warnings (${n})`,
    tabForensics: "Forensics",
    layout: "Layout",
    layoutLR: "left → right",
    layoutTB: "top → bottom",
    layoutTime: "Time axis",
    colorByCluster: "colour by cluster",
    hideChange: "hide change",
    showTaint: "colour by taint",
    showRisk: "highlight the origin",
    onlyRisk: "tainted flows only",
    resetView: (hidden: number) => `Reset the view (${hidden} hidden)`,
    showEur: "show EUR",
    legendHigh: "high risk",
    legendKnown: "known service",
    legendStart: "Start",
    legendChange: "⟲ change",
    legendCoinbase: "green = coinbase",
    legendRisk: "red = money from a harmful address",
    activityTitle: "Activity pattern",
    peelingTitle: "Peeling chains",
    noPeeling:
      "No peeling chain detected. Such chains peel off small amounts step by step and pass the rest on – typical when cashing out.",
    peelingChain: (steps: number, peeled: string) => `Chain over ${steps} steps · peeled off ${peeled}`,
    peelingRest: (amount: string) => `Remaining at the end: ${amount}`,
    behaviourTitle: "Addresses with notable behaviour",
    noBehaviour: "No notable behaviour patterns detected.",
    comment: "Comment (saved with the case)",
    cluster: "Cluster",
    noClusters: "No clusters detected.",
    manual: "manual",
    expand: "expand",
    collapse: "collapse",
    clusterStats: (count: number, amount: string) => `${count} addresses · ${amount} received`,
    hidden: (n: number) => `Hidden (${n})`,
    unhide: "show",
    notesTitle: "Notes",
    graphHelp:
      "Click a node for details; connected paths are highlighted. Nodes can be moved, hidden and commented on; the view is saved with the case.",
    expandCluster: "Expand the cluster",
    address: "Address",
    risk: "Risk",
    depthLabel: "Depth:",
    receivedLabel: "Received:",
    sentLabel: "Sent:",
    fromSource: (amount: string, percent: string) => `From the source: ${amount} (${percent})`,
    isRiskSource: "This address is reported as harmful",
    taintedInflow: "Tainted inflow",
    taintedInflowBody: (amount: string, percent: string) =>
      `${amount} (${percent} of the inflow) comes from addresses classified as harmful.`,
    sentToRisk: (amount: string) => `${amount} went straight to an address classified as harmful.`,
    connections: (n: number) => `Connections (${n})`,
    details: "Details",
    traceFromHere: "Trace from here",
    hide: "Hide",
    watch: "Watch",
    watchAdded: "Added to the watchlist.",
    mergeLabel: "Merge with another address",
    mergePlaceholder: "Address",
    merge: "Merge",
    mergeHint: "Corrects the automatic cluster detection. The trace is recalculated afterwards.",
    transaction: "Transaction",
    blockAt: (height: number) => `· block ${height}`,
    inOut: (inputs: number, outputs: number) => `${inputs} inputs → ${outputs} outputs`,
    volume: "Volume:",
    today: "today",
    valueThen: (fiat: string, rate: string) => `Value then: ${fiat} (rate ${rate})`,
    fee: "Fee:",
    txCarriesRisk: "This transaction moves money that comes from an address classified as harmful.",
    moneyFlow: "Money flow",
    from: "from ",
    to: "to ",
    noRiskFound:
      "None of the addresses checked is reported as harmful. The check runs against the OFAC sanctions list, Ransomwhere, the GraphSense TagPacks, CryptoScamDB, Chainabuse, Bitcoin Who’s Who and your own labels. With the “include medium risk” option, mixers are counted as well.",
    riskTableTitle: (n: number) => `Harmful addresses in the graph (${n})`,
    colAddress: "Address",
    colVerdict: "Classification",
    colSource: "Source",
    colPassedOn: "passed on",
    colAffected: "affected",
    affectedTitle: (n: number) => `Addresses with a tainted inflow (${n})`,
    noOutflow: "None of the money from these addresses flowed on within the graph.",
    colTaintedInflow: "tainted inflow",
    colShare: "share",
    colOrigin: "Origin",
    colLabels: "Labels",
    outflowTitle: (n: number) => `Payments to harmful addresses (${n})`,
    colToHarmful: "to a harmful address",
    riskFootnote: (model: string) =>
      `The attribution follows the chosen model (${model}). It is a statement of probability: money arriving over several steps from a reported address does not prove that the recipient was involved.`,
    depositsTitle: (n: number) => `Deposit addresses of services (${n})`,
    depositsLead:
      "These addresses take money in and forward practically all of it to a single collection address. The operator of that collection address knows who the deposit address was assigned to, and is therefore the most promising point of contact for an enquiry.",
    noneDetected: "None detected.",
    colDepositAddress: "Deposit address",
    colService: "Service",
    colForwardsTo: "forwards to",
    colEvents: "Events",
    unknownService: "unknown",
    crossChainTitle: (n: number) => `Moves to other chains (${n})`,
    crossChainLead:
      "When money goes to a swap or bridge service, the trail ends on this chain. From the transaction page you can check whether a matching amount arrived at a candidate address on the destination chain.",
    bridge: "Bridge",
    swapService: "Swap service",
    checkDestChain: "Check the destination chain",
    fingerprintTitle: (n: number) => `Wallet fingerprint (${n} groups)`,
    fingerprintLead:
      "Transactions with identical construction behaviour probably come from the same wallet software. That links transactions even when they share no inputs. It is an indication, not proof.",
    noFingerprints:
      "No group with at least two transactions. The traits currently come only from the Esplora interface (mempool.space, Blockstream, litecoinspace).",
    fingerprintTxs: (n: number) => `${n} transactions`,
    matches: (list: string) => `Matches: ${list}`,
    evidenceTitle: "Record of the raw data",
    noEvidence: "No record was kept for this trace. It is created automatically for every new trace.",
    evidenceLead:
      "For every query it was recorded which source delivered which data and when, together with a checksum over the raw data. That makes it possible to show later that the report rests on exactly this data.",
    evidenceQueries: "queries",
    evidenceCreated: "Created:",
    evidenceDigest: "Checksum:",
    evidenceDetails: "Show the individual queries",
    colKind: "Kind",
    colRef: "Reference",
    colTime: "Time",
  },
  de: {
    requestFailed: "Anfrage fehlgeschlagen",
    addedToCase: "Zum Fall hinzugefügt.",
    savedAsCase: "Als neuer Fall gespeichert.",
    error: "Fehler",
    start: "Start (Adresse oder Transaktions-ID)",
    moreStarts: "Weitere Startpunkte (eine je Zeile, optional)",
    moreStartsPlaceholder: "z. B. weitere Opferadressen",
    chain: "Chain",
    mode: "Modus",
    modeTitle:
      "Adressbasiert verfolgt alle Transaktionen einer Adresse. UTXO-genau folgt nur den konkreten Coins.",
    modeAddress: "adressbasiert",
    modeUtxo: "UTXO-genau",
    direction: "Richtung",
    dirForward: "Vorwärts (wohin?)",
    dirBackward: "Rückwärts (woher?)",
    dirBoth: "Beide",
    taintModel: "Taint-Modell",
    taintTitle: "Haircut: anteilig. Poison: alles verunreinigt. FIFO: Reihenfolge-basiert.",
    taintHaircut: "Haircut (anteilig)",
    taintFifo: "FIFO (Reihenfolge)",
    taintPoison: "Poison (streng)",
    taintNone: "keine",
    depth: "Tiefe",
    txPerAddress: "Tx / Adresse",
    addrPerTx: "Adr. / Tx",
    minUnit: (unit: string) => `Min. ${unit}`,
    maxNodes: "Max. Knoten",
    tracing: "Verfolge…",
    startTrace: "Trace starten",
    cancel: "Abbrechen",
    labels: "Labels",
    historicPrices: "historische Kurse",
    includeMediumTitle: "Zusätzlich Mixer und Adressen mit mittlerem Risiko als schädliche Herkunft werten",
    includeMedium: "mittleres Risiko einbeziehen",
    merges: (n: number) => `${n} manuelle Zusammenführung(en)`,
    reset: "zurücksetzen",
    progressCounts: (nodes: number, edges: number, calls: number) =>
      `${nodes} Knoten · ${edges} Kanten · ${calls} API-Calls`,
    addresses: "Adressen",
    transactions: "Transaktionen",
    clusters: "Cluster",
    riskAddresses: "Risiko-Adressen",
    riskInflowTitle: "Geld, das im Graph von schädlichen Adressen stammt",
    riskInflow: (amount: string, sources: number) => `${amount} von ${sources} schädlichen Adresse(n)`,
    taintedTitle: "Betrag aus der Startquelle, der an Endpunkten im Graph liegt",
    tracked: "verfolgt",
    apiStats: (calls: number, seconds: string, providers: string) =>
      `${calls} API-Calls · ${seconds} s · ${providers}`,
    truncated: "durch Limits beschnitten",
    exportJson: "Export JSON",
    name: "Name",
    addToCase: "Zum Fall hinzufügen",
    saveAsCase: "Als Fall speichern",
    loginToSave: "Zum Speichern einloggen",
    riskBannerTitle: (n: number) => `${n} als schädlich eingestufte Adresse(n) im Graph`,
    riskBannerBody: (affected: number, amount: string, fiat: string) =>
      `${affected} nachgelagerte Adresse(n) haben davon Geld erhalten, zusammen ${amount}${fiat}.`,
    viewWarnings: "Warnungen ansehen",
    moreSources: (n: number) => `+${n} weitere`,
    sourceTitle: (address: string, source: string) => `${address} · Quelle: ${source}`,
    tabGraph: "Graph",
    tabTimeline: "Verlauf",
    tabPatterns: "Muster",
    tabRisk: "Warnungen",
    tabRiskCount: (n: number) => `Warnungen (${n})`,
    tabForensics: "Forensik",
    layout: "Layout",
    layoutLR: "links → rechts",
    layoutTB: "oben → unten",
    layoutTime: "Zeitachse",
    colorByCluster: "Cluster einfärben",
    hideChange: "Wechselgeld ausblenden",
    showTaint: "Taint einfärben",
    showRisk: "Herkunft hervorheben",
    onlyRisk: "nur belastete Flüsse",
    resetView: (hidden: number) => `Ansicht zurücksetzen (${hidden} ausgeblendet)`,
    showEur: "EUR anzeigen",
    legendHigh: "hohes Risiko",
    legendKnown: "bekannter Dienst",
    legendStart: "Start",
    legendChange: "⟲ Wechselgeld",
    legendCoinbase: "grün = Coinbase",
    legendRisk: "rot = Geld von schädlicher Adresse",
    activityTitle: "Aktivitätsmuster",
    peelingTitle: "Peeling-Ketten",
    noPeeling:
      "Keine Peeling-Kette erkannt. Solche Ketten zweigen schrittweise kleine Beträge ab und reichen den Rest weiter – typisch beim Auscashen.",
    peelingChain: (steps: number, peeled: string) => `Kette über ${steps} Schritte · abgezweigt ${peeled}`,
    peelingRest: (amount: string) => `Rest am Ende: ${amount}`,
    behaviourTitle: "Verhaltensauffällige Adressen",
    noBehaviour: "Keine auffälligen Verhaltensmuster erkannt.",
    comment: "Kommentar (wird im Fall gespeichert)",
    cluster: "Cluster",
    noClusters: "Keine Cluster erkannt.",
    manual: "manuell",
    expand: "aufklappen",
    collapse: "falten",
    clusterStats: (count: number, amount: string) => `${count} Adressen · ${amount} empfangen`,
    hidden: (n: number) => `Ausgeblendet (${n})`,
    unhide: "einblenden",
    notesTitle: "Hinweise",
    graphHelp:
      "Knoten anklicken für Details, verbundene Pfade werden hervorgehoben. Knoten lassen sich verschieben, ausblenden und kommentieren; die Ansicht wird im Fall gespeichert.",
    expandCluster: "Cluster aufklappen",
    address: "Adresse",
    risk: "Risiko",
    depthLabel: "Tiefe:",
    receivedLabel: "Empfangen:",
    sentLabel: "Gesendet:",
    fromSource: (amount: string, percent: string) => `Aus der Quelle: ${amount} (${percent})`,
    isRiskSource: "Diese Adresse ist als schädlich gemeldet",
    taintedInflow: "Belasteter Zufluss",
    taintedInflowBody: (amount: string, percent: string) =>
      `${amount} (${percent} des Zuflusses) stammen von als schädlich eingestuften Adressen.`,
    sentToRisk: (amount: string) => `${amount} gingen direkt an eine als schädlich eingestufte Adresse.`,
    connections: (n: number) => `Verbindungen (${n})`,
    details: "Details",
    traceFromHere: "Trace von hier",
    hide: "Ausblenden",
    watch: "Beobachten",
    watchAdded: "Zur Watchlist hinzugefügt.",
    mergeLabel: "Mit anderer Adresse zusammenführen",
    mergePlaceholder: "Adresse",
    merge: "Vereinen",
    mergeHint: "Korrigiert die automatische Cluster-Erkennung. Der Trace wird danach neu berechnet.",
    transaction: "Transaktion",
    blockAt: (height: number) => `· Block ${height}`,
    inOut: (inputs: number, outputs: number) => `${inputs} Eingänge → ${outputs} Ausgänge`,
    volume: "Volumen:",
    today: "heute",
    valueThen: (fiat: string, rate: string) => `Wert damals: ${fiat} (Kurs ${rate})`,
    fee: "Gebühr:",
    txCarriesRisk: "Diese Transaktion bewegt Geld, das von einer als schädlich eingestuften Adresse stammt.",
    moneyFlow: "Geldfluss",
    from: "von ",
    to: "nach ",
    noRiskFound:
      "Keine der geprüften Adressen ist als schädlich gemeldet. Geprüft wird gegen die OFAC-Sanktionsliste, Ransomwhere, die GraphSense-TagPacks, CryptoScamDB, Chainabuse, Bitcoin Who’s Who und eigene Labels. Mit der Option „mittleres Risiko einbeziehen“ werden zusätzlich Mixer gewertet.",
    riskTableTitle: (n: number) => `Schädliche Adressen im Graph (${n})`,
    colAddress: "Adresse",
    colVerdict: "Einstufung",
    colSource: "Quelle",
    colPassedOn: "weitergegeben",
    colAffected: "betroffen",
    affectedTitle: (n: number) => `Adressen mit belastetem Zufluss (${n})`,
    noOutflow: "Kein Geld dieser Adressen ist im Graph weitergeflossen.",
    colTaintedInflow: "belasteter Zufluss",
    colShare: "Anteil",
    colOrigin: "Herkunft",
    colLabels: "Labels",
    outflowTitle: (n: number) => `Zahlungen an schädliche Adressen (${n})`,
    colToHarmful: "an schädliche Adresse",
    riskFootnote: (model: string) =>
      `Die Zuordnung folgt dem gewählten Modell (${model}). Sie ist eine Wahrscheinlichkeitsaussage: dass Geld über mehrere Schritte von einer gemeldeten Adresse stammt, beweist keine Beteiligung des Empfängers.`,
    depositsTitle: (n: number) => `Einzahlungsadressen von Diensten (${n})`,
    depositsLead:
      "Diese Adressen nehmen Geld entgegen und leiten praktisch alles an eine einzige Sammeladresse weiter. Der Betreiber dieser Sammeladresse weiß, wem die Einzahlungsadresse zugeteilt war, und ist damit der erfolgversprechendste Ansprechpartner für eine Auskunft.",
    noneDetected: "Keine erkannt.",
    colDepositAddress: "Einzahlungsadresse",
    colService: "Dienst",
    colForwardsTo: "leitet weiter an",
    colEvents: "Vorgänge",
    unknownService: "unbekannt",
    crossChainTitle: (n: number) => `Übergänge auf andere Chains (${n})`,
    crossChainLead:
      "Geht Geld an einen Tausch- oder Brückendienst, endet die Spur auf dieser Chain. Über die Transaktionsseite lässt sich prüfen, ob bei einer Kandidatenadresse auf der Zielkette ein passender Betrag eingegangen ist.",
    bridge: "Brücke",
    swapService: "Tauschdienst",
    checkDestChain: "Zielkette prüfen",
    fingerprintTitle: (n: number) => `Wallet-Fingerabdruck (${n} Gruppen)`,
    fingerprintLead:
      "Transaktionen mit identischem Bauverhalten stammen wahrscheinlich aus derselben Wallet-Software. Das verknüpft Transaktionen auch dann, wenn sie keine gemeinsamen Eingänge haben. Es ist ein Indiz, kein Beweis.",
    noFingerprints:
      "Keine Gruppe mit mindestens zwei Transaktionen. Die Merkmale liefert derzeit nur die Esplora-Schnittstelle (mempool.space, Blockstream, litecoinspace).",
    fingerprintTxs: (n: number) => `${n} Transaktionen`,
    matches: (list: string) => `Passt zu: ${list}`,
    evidenceTitle: "Nachweis der Rohdaten",
    noEvidence: "Für diesen Trace wurde kein Nachweis mitgeschrieben. Er entsteht automatisch bei jedem neuen Trace.",
    evidenceLead:
      "Zu jeder Abfrage wurde festgehalten, welche Quelle wann welche Daten geliefert hat, mit einem Prüfwert über die Rohdaten. Damit lässt sich später zeigen, dass der Bericht auf genau diesen Daten beruht.",
    evidenceQueries: "Abfragen",
    evidenceCreated: "Erstellt:",
    evidenceDigest: "Prüfwert:",
    evidenceDetails: "Einzelne Abfragen anzeigen",
    colKind: "Art",
    colRef: "Bezug",
    colTime: "Zeit",
  },
};

interface Props {
  initialStart?: string;
  initialChain?: ChainId;
  initialDirection?: TraceParams["direction"];
  initialResult?: TraceResult | null;
  initialView?: GraphViewState;
  initialMerges?: string[][];
  loggedIn: boolean;
  autoRun?: boolean;
  /** Wenn gesetzt, wird in diesen Fall gespeichert statt einen neuen anzulegen */
  caseId?: string;
  canWrite?: boolean;
}

type Tab = "graph" | "timeline" | "patterns" | "risk" | "forensics";

export default function TraceView({
  initialStart = "",
  initialChain,
  initialDirection,
  initialResult = null,
  initialView,
  initialMerges,
  loggedIn,
  autoRun,
  caseId,
  canWrite = true,
}: Props) {
  const t = useT(TXT);
  const fmt = useFormatters();
  const locale = useLocale();
  const [params, setParams] = useState<TraceParams>({
    ...DEFAULT_PARAMS,
    start: initialStart,
    chain: initialChain || DEFAULT_PARAMS.chain,
    direction: initialDirection || DEFAULT_PARAMS.direction,
    ...(initialResult?.params || {}),
    merges: initialMerges || initialResult?.params?.merges,
  });
  const [result, setResult] = useState<TraceResult | null>(initialResult);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<TraceProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TraceNode | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("graph");
  const [view, setView] = useState<GraphViewState>(initialView || EMPTY_VIEW);
  const [opts, setOpts] = useState<GraphOptions>({
    rankdir: "LR",
    colorByCluster: true,
    hideChange: false,
    showFiat: true,
    showTaint: true,
    showRisk: true,
    onlyRisk: false,
  });
  const [moreStarts, setMoreStarts] = useState((initialResult?.params?.starts ?? []).join("\n"));
  const [saveName, setSaveName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ---------------- Trace ausführen (Streaming) ---------------- */
  const run = useCallback(async (p: TraceParams) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setSelected(null);
    setSelectedCluster(null);
    setProgress(null);
    try {
      const res = await fetch("/api/trace/stream", {
        method: "POST",
        body: JSON.stringify(p),
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error || t.requestFailed);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as Omit<TraceProgress, "phase"> & { phase: TraceProgress["phase"] | "error"; result?: TraceResult };
          if (evt.phase === "error") throw new Error(evt.message);
          setProgress(evt as TraceProgress);
          if (evt.result) {
            setResult(evt.result);
            setParams(p);
            // Ansicht auf neue Knoten zurücksetzen, Kommentare behalten
            setView((v) => ({ ...v, hidden: [], collapsedClusters: [], positions: {} }));
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setError(translateHint(e instanceof Error ? e.message : String(e), locale));
    } finally {
      setLoading(false);
      setProgress(null);
      abortRef.current = null;
    }
  }, [t, locale]);

  useEffect(() => {
    if (!autoRun || !initialStart || initialResult) return;
    const t = setTimeout(() => run({ ...params, start: initialStart }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* ---------------- Speichern ---------------- */
  async function save() {
    if (!result) return;
    setMsg(null);
    const body = caseId
      ? { addTrace: { name: saveName || `Trace ${shortHash(params.start, 6)}`, start: params.start, chain: params.chain, params, result } }
      : { name: saveName || `Trace ${shortHash(params.start, 6)}`, start: params.start, chain: params.chain, params, result };
    const res = await fetch(caseId ? `/api/cases/${caseId}` : "/api/cases", {
      method: caseId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setMsg(res.ok ? (caseId ? t.addedToCase : t.savedAsCase) : json.error || t.error);
  }

  async function saveView(next: GraphViewState, merges?: string[][]) {
    if (!caseId || !canWrite) return;
    await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ view: next, ...(merges ? { merges } : {}) }),
    }).catch(() => {});
  }

  function exportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chainer-trace-${shortHash(params.start, 6)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------------- Graph-Bearbeitung ---------------- */

  /**
   * Neuester Stand der Ansicht.
   *
   * Die Ansicht wird auch an anderer Stelle gesetzt (etwa zurückgesetzt, wenn
   * ein neuer Trace läuft). Diese Referenz führt den jeweils aktuellen Wert
   * mit, damit `updateView` ohne Zustands-Updater auskommt: ein Updater muss
   * frei von Nebenwirkungen sein, das Speichern im Fall ist aber genau das.
   */
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const updateView = (fn: (v: GraphViewState) => GraphViewState) => {
    const next = fn(viewRef.current);
    viewRef.current = next;
    setView(next);
    void saveView(next);
  };
  const hideNode = (id: string) => {
    updateView((v) => ({ ...v, hidden: [...new Set([...v.hidden, id])] }));
    setSelected(null);
  };
  const toggleCluster = (id: number) =>
    updateView((v) => ({
      ...v,
      collapsedClusters: v.collapsedClusters.includes(id)
        ? v.collapsedClusters.filter((c) => c !== id)
        : [...v.collapsedClusters, id],
    }));
  const setComment = (id: string, text: string) =>
    updateView((v) => {
      const comments = { ...v.comments };
      if (text.trim()) comments[id] = text.trim();
      else delete comments[id];
      return { ...v, comments };
    });
  const moveNode = (id: string, position: { x: number; y: number }) =>
    updateView((v) => ({ ...v, positions: { ...v.positions, [id]: position } }));

  /** Zwei Adressen manuell demselben Cluster zuordnen und neu berechnen */
  async function mergeAddresses(addresses: string[]) {
    const merges = [...(params.merges || []), addresses];
    const next = { ...params, merges };
    setParams(next);
    if (caseId && canWrite) await saveView(view, merges);
    await run(next);
  }

  const num = (k: keyof TraceParams) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setParams({ ...params, [k]: Number(e.target.value) });
  const selectedId = selected?.id ?? (selectedCluster ? `c:${selectedCluster}` : null);
  const connected = selected && result ? result.edges.filter((e) => e.source === selected.id || e.target === selected.id) : [];
  const graphOpts: GraphOptions = { ...opts, priceEur: result?.priceEur };
  const chain = result?.params.chain ?? params.chain;
  const meta = chainMeta(chain);
  const showTaint = (result?.params.taintModel ?? params.taintModel) !== "none";
  const cluster = selectedCluster ? result?.clusters.find((c) => c.id === selectedCluster) : null;

  return (
    <div className="space-y-4">
      {/* ------------- Parameter ------------- */}
      <form
        className="card grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8"
        onSubmit={(e) => {
          e.preventDefault();
          const extra = moreStarts
            .split(/[\n,;]/)
            .map((x) => x.trim())
            .filter(Boolean);
          run({ ...params, starts: extra.length ? extra : undefined });
        }}
      >
        <div className="col-span-2 md:col-span-4 lg:col-span-3">
          <label className="label">{t.start}</label>
          <input
            className="input mono"
            value={params.start}
            onChange={(e) => setParams({ ...params, start: e.target.value })}
            spellCheck={false}
          />
        </div>
        <div className="col-span-2 md:col-span-4 lg:col-span-3">
          <label className="label">{t.moreStarts}</label>
          <textarea
            className="input mono"
            rows={2}
            value={moreStarts}
            onChange={(e) => setMoreStarts(e.target.value)}
            placeholder={t.moreStartsPlaceholder}
            spellCheck={false}
          />
        </div>
        <div>
          <label className="label">{t.chain}</label>
          <select
            className="input"
            value={params.chain}
            onChange={(e) => setParams({ ...params, chain: e.target.value as ChainId })}
          >
            {CHAIN_LIST.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.symbol})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t.mode}</label>
          <select
            className="input"
            value={params.mode}
            onChange={(e) => setParams({ ...params, mode: e.target.value as TraceParams["mode"] })}
            title={t.modeTitle}
          >
            <option value="address">{t.modeAddress}</option>
            <option value="utxo">{t.modeUtxo}</option>
          </select>
        </div>
        <div>
          <label className="label">{t.direction}</label>
          <select
            className="input"
            value={params.direction}
            onChange={(e) => setParams({ ...params, direction: e.target.value as TraceParams["direction"] })}
          >
            <option value="forward">{t.dirForward}</option>
            <option value="backward">{t.dirBackward}</option>
            <option value="both">{t.dirBoth}</option>
          </select>
        </div>
        <div>
          <label className="label">{t.taintModel}</label>
          <select
            className="input"
            value={params.taintModel}
            onChange={(e) => setParams({ ...params, taintModel: e.target.value as TraceParams["taintModel"] })}
            title={t.taintTitle}
          >
            <option value="haircut">{t.taintHaircut}</option>
            <option value="fifo">{t.taintFifo}</option>
            <option value="poison">{t.taintPoison}</option>
            <option value="none">{t.taintNone}</option>
          </select>
        </div>
        <div>
          <label className="label">{t.depth}</label>
          <input className="input" type="number" min={1} max={8} value={params.maxDepth} onChange={num("maxDepth")} />
        </div>
        <div>
          <label className="label">{t.txPerAddress}</label>
          <input className="input" type="number" min={1} max={50} value={params.maxTxPerAddress} onChange={num("maxTxPerAddress")} />
        </div>
        <div>
          <label className="label">{t.addrPerTx}</label>
          <input className="input" type="number" min={1} max={50} value={params.maxAddrPerTx} onChange={num("maxAddrPerTx")} />
        </div>
        <div>
          <label className="label">{t.minUnit(meta.unit)}</label>
          <input className="input" type="number" min={0} value={params.minValueSat} onChange={num("minValueSat")} />
        </div>
        <div>
          <label className="label">{t.maxNodes}</label>
          <input className="input" type="number" min={10} max={2000} value={params.maxNodes} onChange={num("maxNodes")} />
        </div>
        <div className="col-span-2 flex flex-wrap items-end gap-3 text-sm md:col-span-4 lg:col-span-8">
          <button className="btn" disabled={loading || !params.start}>
            {loading ? t.tracing : t.startTrace}
          </button>
          {loading && (
            <button type="button" className="btn-secondary" onClick={() => abortRef.current?.abort()}>
              {t.cancel}
            </button>
          )}
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={params.enrich} onChange={(e) => setParams({ ...params, enrich: e.target.checked })} />
            {t.labels}
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={params.historicPrices !== false}
              onChange={(e) => setParams({ ...params, historicPrices: e.target.checked })}
            />
            {t.historicPrices}
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={params.lightning !== false}
              onChange={(e) => setParams({ ...params, lightning: e.target.checked })}
              disabled={params.chain !== "bitcoin"}
            />
            Lightning
          </label>
          <label
            className="flex items-center gap-1"
            title={t.includeMediumTitle}
          >
            <input
              type="checkbox"
              checked={params.includeMediumRisk === true}
              onChange={(e) => setParams({ ...params, includeMediumRisk: e.target.checked })}
            />
            {t.includeMedium}
          </label>
          {params.merges?.length ? (
            <span className="text-xs text-muted">
              {t.merges(params.merges.length)}
              <button
                type="button"
                className="ml-2 underline hover:text-brand"
                onClick={() => setParams({ ...params, merges: [] })}
              >
                {t.reset}
              </button>
            </span>
          ) : null}
        </div>
        {progress && (
          <div className="col-span-2 md:col-span-4 lg:col-span-8">
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              <span className="capitalize">{progress.phase}</span>
              <span>{translateHint(progress.message, locale)}</span>
              <span className="ml-auto">
                {t.progressCounts(progress.nodes, progress.edges, progress.apiCalls)}
              </span>
            </div>
          </div>
        )}
      </form>

      {error && <div className="card border-red-500 text-red-300">{error}</div>}

      {result && (
        <>
          {/* ------------- Statistik ------------- */}
          <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              <b>{result.stats.addresses}</b> {t.addresses}
            </span>
            <span>
              <b>{result.stats.txs}</b> {t.transactions}
            </span>
            <span>
              <b>{result.clusters.length}</b> {t.clusters}
            </span>
            <span>
              <b>{result.nodes.filter((n) => n.data.type === "address" && n.data.risk === "high").length}</b>{" "}
              {t.riskAddresses}
            </span>
            {result.riskSources?.length > 0 && (
              <span className="font-semibold text-red-400" title={t.riskInflowTitle}>
                &#9888; {t.riskInflow(fmt.amount(result.stats.riskInflowSat ?? 0, chain, 4), result.riskSources.length)}
              </span>
            )}
            {showTaint && result.stats.taintedOutSat !== undefined && (
              <span className="text-orange-300" title={t.taintedTitle}>
                {fmt.amount(result.stats.taintedOutSat, chain, 4)} {t.tracked}
              </span>
            )}
            <span className="text-muted">
              {t.apiStats(
                result.stats.apiCalls,
                fmt.number(result.stats.durationMs / 1000, 1),
                Object.entries(result.providersUsed)
                  .map(([name, count]) => `${name} ×${count}`)
                  .join(", "),
              )}
            </span>
            {result.stats.truncated && <span className="text-yellow-400">{t.truncated}</span>}
            <span className="ml-auto flex items-center gap-2">
              <button className="btn-secondary" type="button" onClick={exportJson}>
                {t.exportJson}
              </button>
              {loggedIn ? (
                <>
                  <input
                    className="input w-40"
                    placeholder={t.name}
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                  />
                  <button className="btn-secondary" onClick={save} type="button">
                    {caseId ? t.addToCase : t.saveAsCase}
                  </button>
                  {msg && <span className="text-xs text-muted">{msg}</span>}
                </>
              ) : (
                <span className="text-xs text-subtle">{t.loginToSave}</span>
              )}
            </span>
          </div>

          {result.riskSources?.length > 0 && (
            <div className="rounded-lg border border-red-500/70 bg-red-950/40 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-red-300">
                  &#9888; {t.riskBannerTitle(result.riskSources.length)}
                </span>
                <span className="text-sm text-fg-2">
                  {t.riskBannerBody(
                    result.stats.riskAffected ?? 0,
                    fmt.amount(result.stats.riskInflowSat ?? 0, chain, 5),
                    result.priceEur !== undefined
                      ? ` (${fmt.fiat(result.stats.riskInflowSat ?? 0, result.priceEur, chain)})`
                      : "",
                  )}
                </span>
                <button type="button" className="btn-secondary ml-auto" onClick={() => setTab("risk")}>
                  {t.viewWarnings}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.riskSources.slice(0, 6).map((r) => (
                  <span
                    key={r.address}
                    className={`rounded px-1.5 py-0.5 text-xs ${r.severity === "high" ? "bg-red-700 text-white" : "bg-orange-600 text-white"}`}
                    title={t.sourceTitle(r.address, r.source)}
                  >
                    {r.label} ({categoryText(r.category, locale)})
                  </span>
                ))}
                {result.riskSources.length > 6 && (
                  <span className="text-xs text-muted">{t.moreSources(result.riskSources.length - 6)}</span>
                )}
              </div>
            </div>
          )}

          {/* ------------- Ansichtssteuerung ------------- */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex overflow-hidden rounded-md border border-border">
              {(
                [
                  ["graph", t.tabGraph],
                  ["timeline", t.tabTimeline],
                  ["patterns", t.tabPatterns],
                  ["risk", result.riskSources?.length ? t.tabRiskCount(result.riskSources.length) : t.tabRisk],
                  ["forensics", t.tabForensics],
                ] as [Tab, string][]
              ).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  className={`px-3 py-1 ${
                    tab === id ? "bg-accent text-black" : id === "risk" && result.riskSources?.length ? "text-red-400" : ""
                  }`}
                  onClick={() => setTab(id)}
                >
                  {name}
                </button>
              ))}
            </div>
            {tab === "risk" && <RiskPanel result={result} onSelect={setSelected} onFocus={() => setTab("graph")} />}

          {tab === "forensics" && <ForensicsPanel result={result} />}

          {tab === "graph" && (
              <>
                <label className="flex items-center gap-1">
                  {t.layout}
                  <select
                    className="input w-auto py-1"
                    value={opts.rankdir}
                    onChange={(e) => setOpts({ ...opts, rankdir: e.target.value as "LR" | "TB" | "TIME" })}
                  >
                    <option value="LR">{t.layoutLR}</option>
                    <option value="TB">{t.layoutTB}</option>
                    <option value="TIME">{t.layoutTime}</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={opts.colorByCluster}
                    onChange={(e) => setOpts({ ...opts, colorByCluster: e.target.checked })}
                  />
                  {t.colorByCluster}
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={opts.hideChange} onChange={(e) => setOpts({ ...opts, hideChange: e.target.checked })} />
                  {t.hideChange}
                </label>
                {showTaint && (
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={opts.showTaint} onChange={(e) => setOpts({ ...opts, showTaint: e.target.checked })} />
                    {t.showTaint}
                  </label>
                )}
                {result.riskSources?.length > 0 && (
                  <>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={opts.showRisk}
                        onChange={(e) => setOpts({ ...opts, showRisk: e.target.checked })}
                      />
                      {t.showRisk}
                    </label>
                    <label className="flex items-center gap-1 text-red-300">
                      <input
                        type="checkbox"
                        checked={opts.onlyRisk}
                        onChange={(e) => setOpts({ ...opts, onlyRisk: e.target.checked })}
                      />
                      {t.onlyRisk}
                    </label>
                  </>
                )}
                {(view.hidden.length > 0 || view.collapsedClusters.length > 0 || Object.keys(view.positions).length > 0) && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => updateView(() => ({ ...EMPTY_VIEW, comments: view.comments }))}
                  >
                    {t.resetView(view.hidden.length)}
                  </button>
                )}
              </>
            )}
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={opts.showFiat} onChange={(e) => setOpts({ ...opts, showFiat: e.target.checked })} />
              {t.showEur}
            </label>
            <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted">
              <span>
                <span className="inline-block h-3 w-3 rounded border-2 border-red-500 align-middle" /> {t.legendHigh}
              </span>
              <span>
                <span className="inline-block h-3 w-3 rounded border-2 border-blue-400 align-middle" />{" "}
                {t.legendKnown}
              </span>
              <span>
                <span className="inline-block h-3 w-3 rounded ring-2 ring-accent align-middle" /> {t.legendStart}
              </span>
              <span className="text-yellow-400">{t.legendChange}</span>
              <span className="text-green-400">{t.legendCoinbase}</span>
              <span className="text-red-400">&#9888; {t.legendRisk}</span>
            </div>
          </div>

          {/* ------------- Inhalte ------------- */}
          {tab === "timeline" && (
            <TraceTimeline result={result} showFiat={opts.showFiat} selectedId={selected?.id ?? null} onSelect={setSelected} />
          )}

          {tab === "patterns" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card space-y-2">
                <h3 className="font-semibold">{t.activityTitle}</h3>
                <ActivityHeatmap activity={result.activity} />
              </div>
              <div className="card space-y-3">
                <h3 className="font-semibold">{t.peelingTitle}</h3>
                {!result.peeling.length && (
                  <p className="text-sm text-subtle">{t.noPeeling}</p>
                )}
                {result.peeling.map((p, i) => (
                  <div key={i} className="rounded border border-border p-2 text-sm">
                    <div className="font-medium text-orange-300">
                      {t.peelingChain(p.txids.length, fmt.amount(p.totalPeeledSat, chain, 5))}
                    </div>
                    <div className="text-xs text-muted">{t.peelingRest(fmt.amount(p.remainingSat, chain, 5))}</div>
                    <ol className="mono mt-1 max-h-32 list-decimal overflow-y-auto pl-5 text-[11px]">
                      {p.txids.map((txid, k) => (
                        <li key={txid}>
                          <Link href={`/tx/${txid}?chain=${chain}`} className="hover:text-brand">
                            {shortHash(txid, 8)}
                          </Link>
                          <span className="ml-2 text-subtle">−{fmt.amount(p.peeledSat[k], chain, 5)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
              <div className="card lg:col-span-2">
                <h3 className="mb-2 font-semibold">{t.behaviourTitle}</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {result.nodes
                    .filter((n) => n.data.type === "address" && n.data.behavior?.length)
                    .slice(0, 20)
                    .map((n) => {
                      const d = n.data as Extract<typeof n.data, { type: "address" }>;
                      return (
                        <div key={n.id} className="rounded border border-border p-2 text-xs">
                          <Link href={`/address/${d.address}?chain=${chain}`} className="mono hover:text-brand">
                            {shortHash(d.address, 8)}
                          </Link>
                          <ul className="mt-1 list-disc pl-4 text-cyan-300">
                            {translateHints(d.behavior, locale).map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  {!result.nodes.some((n) => n.data.type === "address" && n.data.behavior?.length) && (
                    <p className="text-sm text-subtle">{t.noBehaviour}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "risk" && <RiskPanel result={result} onSelect={setSelected} onFocus={() => setTab("graph")} />}

          {tab === "graph" && (
            <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
              <TraceGraph
                result={result}
                opts={graphOpts}
                view={view}
                selectedId={selectedId}
                onSelect={(n, c) => {
                  setSelected(n);
                  setSelectedCluster(c ?? null);
                }}
                onMoveNode={moveNode}
              />
              <aside className="card h-[72vh] overflow-y-auto text-sm">
                {cluster ? (
                  <ClusterPanel
                    cluster={cluster}
                    chain={chain}
                    comment={view.comments[`c:${cluster.id}`]}
                    onComment={(t) => setComment(`c:${cluster.id}`, t)}
                    onExpand={() => toggleCluster(cluster.id)}
                  />
                ) : !selected ? (
                  <OverviewPanel
                    result={result}
                    view={view}
                    onToggleCluster={toggleCluster}
                    onUnhide={(id) => updateView((v) => ({ ...v, hidden: v.hidden.filter((h) => h !== id) }))}
                  />
                ) : selected.data.type === "address" ? (
                  <AddressPanel
                    data={selected.data}
                    chain={chain}
                    showTaint={showTaint}
                    priceEur={result.priceEur}
                    connected={connected}
                    comment={view.comments[selected.id]}
                    loggedIn={loggedIn}
                    onComment={(t) => setComment(selected.id, t)}
                    onHide={() => hideNode(selected.id)}
                    onTraceFrom={() => run({ ...params, start: (selected.data as { address: string }).address })}
                    onMerge={(other) => mergeAddresses([(selected.data as { address: string }).address, other])}
                  />
                ) : (
                  <TxPanel
                    data={selected.data}
                    chain={chain}
                    priceEur={result.priceEur}
                    connected={connected}
                    comment={view.comments[selected.id]}
                    onComment={(t) => setComment(selected.id, t)}
                    onHide={() => hideNode(selected.id)}
                  />
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- Seitenleisten ---------------- */

function CommentBox({ value, onChange }: { value?: string; onChange: (text: string) => void }) {
  const t = useT(TXT);
  const [text, setText] = useState(value ?? "");
  // Abgeleiteter Zustand: wechselt der ausgewählte Knoten, den Text übernehmen
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value ?? "");
  }
  return (
    <div className="pt-2">
      <label className="label">{t.comment}</label>
      <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(text)} />
    </div>
  );
}

function OverviewPanel({
  result,
  view,
  onToggleCluster,
  onUnhide,
}: {
  result: TraceResult;
  view: GraphViewState;
  onToggleCluster: (id: number) => void;
  onUnhide: (id: string) => void;
}) {
  const t = useT(TXT);
  const fmt = useFormatters();
  const locale = useLocale();
  const chain = result.params.chain;
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{t.clusters}</h3>
      {!result.clusters.length && <p className="text-subtle">{t.noClusters}</p>}
      {result.clusters.map((c) => (
        <div key={c.id} className="rounded border border-border p-2" style={{ borderLeftWidth: 4, borderLeftColor: clusterColor(c.id) }}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">
              {t.cluster} #{c.id} {c.label && <span className="text-brand">· {c.label}</span>}
              {c.manual && <span className="ml-1 text-[10px] text-green-300">{t.manual}</span>}
            </div>
            <button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => onToggleCluster(c.id)}>
              {view.collapsedClusters.includes(c.id) ? t.expand : t.collapse}
            </button>
          </div>
          <div className="text-xs text-muted">
            {t.clusterStats(c.addresses.length, fmt.amount(c.totalReceivedSat, chain, 4))}
          </div>
          {c.behavior?.length ? (
            <div className="text-[11px] text-cyan-300">{translateHints(c.behavior, locale).join(" · ")}</div>
          ) : null}
          <ul className="mono mt-1 max-h-24 overflow-y-auto text-[11px]">
            {c.addresses.map((a) => (
              <li key={a}>
                <Link className="hover:text-brand" href={`/address/${a}?chain=${chain}`}>
                  {a}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {view.hidden.length > 0 && (
        <div>
          <h3 className="font-semibold">{t.hidden(view.hidden.length)}</h3>
          <ul className="space-y-1 text-xs">
            {view.hidden.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2">
                <span className="mono truncate">{id.slice(2, 18)}…</span>
                <button className="underline hover:text-brand" onClick={() => onUnhide(id)}>
                  {t.unhide}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.warnings.length > 0 && (
        <div>
          <h3 className="font-semibold text-yellow-400">{t.notesTitle}</h3>
          <ul className="list-disc pl-4 text-xs text-muted">
            {translateHints(result.warnings.slice(0, 20), locale).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-subtle">{t.graphHelp}</p>
    </div>
  );
}

function ClusterPanel({
  cluster,
  chain,
  comment,
  onComment,
  onExpand,
}: {
  cluster: NonNullable<TraceResult["clusters"][number]>;
  chain: ChainId;
  comment?: string;
  onComment: (t: string) => void;
  onExpand: () => void;
}) {
  const t = useT(TXT);
  const fmt = useFormatters();
  const locale = useLocale();
  return (
    <div className="space-y-2">
      <h3 className="font-semibold" style={{ color: clusterColor(cluster.id) }}>
        {t.cluster} #{cluster.id}
      </h3>
      {cluster.label && <div className="text-brand">{cluster.label}</div>}
      <div>
        {cluster.addresses.length} {t.addresses}
      </div>
      <div>
        {t.receivedLabel} {fmt.amount(cluster.totalReceivedSat, chain)}
      </div>
      {cluster.behavior?.length ? (
        <ul className="list-disc pl-4 text-xs text-cyan-300">
          {translateHints(cluster.behavior, locale).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      <button className="btn-secondary" onClick={onExpand}>
        {t.expandCluster}
      </button>
      <ul className="mono max-h-64 overflow-y-auto text-[11px]">
        {cluster.addresses.map((a) => (
          <li key={a}>
            <Link className="hover:text-brand" href={`/address/${a}?chain=${chain}`}>
              {a}
            </Link>
          </li>
        ))}
      </ul>
      <CommentBox value={comment} onChange={onComment} />
    </div>
  );
}

function AddressPanel({
  data,
  chain,
  showTaint,
  priceEur,
  connected,
  comment,
  loggedIn,
  onComment,
  onHide,
  onTraceFrom,
  onMerge,
}: {
  data: Extract<TraceNode["data"], { type: "address" }>;
  chain: ChainId;
  showTaint: boolean;
  priceEur?: number;
  connected: TraceResult["edges"];
  comment?: string;
  loggedIn: boolean;
  onComment: (t: string) => void;
  onHide: () => void;
  onTraceFrom: () => void;
  onMerge: (other: string) => void;
}) {
  const t = useT(TXT);
  const fmt = useFormatters();
  const locale = useLocale();
  const [mergeWith, setMergeWith] = useState("");
  const [watchMsg, setWatchMsg] = useState<string | null>(null);

  async function watch() {
    const res = await fetch("/api/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain, address: data.address, label: "" }),
    });
    const j = await res.json();
    setWatchMsg(res.ok ? t.watchAdded : j.error);
  }

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{t.address}</h3>
      <div className="mono break-all text-xs">{data.address}</div>
      <LabelBadges labels={data.labels} />
      <div>
        {t.risk}: <b className={data.risk === "high" ? "text-red-400" : ""}>{data.risk}</b>
      </div>
      <div>
        {t.depthLabel} {data.depth}
      </div>
      {data.clusterId && (
        <div style={{ color: clusterColor(data.clusterId) }}>
          {t.cluster} #{data.clusterId}
        </div>
      )}
      <div>
        {t.receivedLabel} {fmt.amount(data.receivedSat, chain)}{" "}
        {priceEur !== undefined && <span className="text-subtle">({fmt.fiat(data.receivedSat, priceEur, chain)})</span>}
      </div>
      <div>
        {t.sentLabel} {fmt.amount(data.sentSat, chain)}{" "}
        {priceEur !== undefined && <span className="text-subtle">({fmt.fiat(data.sentSat, priceEur, chain)})</span>}
      </div>
      {showTaint && data.taintSat !== undefined && (
        <div className="text-orange-300">
          {t.fromSource(fmt.amount(data.taintSat, chain), fmt.percent(data.taintRatio || 0))}
        </div>
      )}
      {data.isRiskSource && (
        <div className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white">
          &#9888; {t.isRiskSource}
        </div>
      )}
      {!data.isRiskSource && (data.riskFromSat ?? 0) > 0 && (
        <div className="space-y-1 rounded border border-red-500/60 bg-red-950/40 p-2 text-xs">
          <div className="font-semibold text-red-300">&#9888; {t.taintedInflow}</div>
          <div>
            {t.taintedInflowBody(fmt.amount(data.riskFromSat, chain), fmt.percent(data.riskFromRatio || 0))}
          </div>
          {data.riskSources?.length ? (
            <ul className="mono space-y-0.5">
              {data.riskSources.map((a) => (
                <li key={a}>
                  <Link href={`/address/${a}?chain=${chain}`} className="hover:text-brand">
                    {shortHash(a, 8)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {(data.sentToRiskSat ?? 0) > 0 && (
        <div className="rounded border border-orange-500/60 bg-orange-950/30 p-2 text-xs text-orange-200">
          &#9888; {t.sentToRisk(fmt.amount(data.sentToRiskSat, chain))}
        </div>
      )}
      {data.behavior?.length ? (
        <ul className="list-disc pl-4 text-xs text-cyan-300">
          {translateHints(data.behavior, locale).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}

      <h4 className="pt-2 font-medium">{t.connections(connected.length)}</h4>
      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
        {connected.map((e) => (
          <li key={e.id} className="flex justify-between gap-2">
            <span className="mono">
              {e.source === `a:${data.address}` ? "→ tx " : "← tx "}
              {shortHash((e.source === `a:${data.address}` ? e.target : e.source).slice(2), 5)}
            </span>
            <span>
              {fmt.amount(e.valueSat, chain, 5)}
              {e.change ? " ⟲" : ""}
            </span>
          </li>
        ))}
      </ul>

      {data.address !== "coinbase" && (
        <>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link className="btn-secondary" href={`/address/${data.address}?chain=${chain}`}>
              {t.details}
            </Link>
            <button className="btn-secondary" type="button" onClick={onTraceFrom}>
              {t.traceFromHere}
            </button>
            <button className="btn-secondary" type="button" onClick={onHide}>
              {t.hide}
            </button>
            {loggedIn && (
              <button className="btn-secondary" type="button" onClick={watch}>
                {t.watch}
              </button>
            )}
          </div>
          {watchMsg && <p className="text-xs text-muted">{watchMsg}</p>}
          <div className="pt-2">
            <label className="label">{t.mergeLabel}</label>
            <div className="flex gap-2">
              <input
                className="input mono text-xs"
                placeholder={t.mergePlaceholder}
                value={mergeWith}
                onChange={(e) => setMergeWith(e.target.value)}
              />
              <button
                className="btn-secondary"
                type="button"
                disabled={!mergeWith.trim()}
                onClick={() => {
                  onMerge(mergeWith.trim());
                  setMergeWith("");
                }}
              >
                {t.merge}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-subtle">{t.mergeHint}</p>
          </div>
        </>
      )}
      <CommentBox value={comment} onChange={onComment} />
    </div>
  );
}

function TxPanel({
  data,
  chain,
  priceEur,
  connected,
  comment,
  onComment,
  onHide,
}: {
  data: Extract<TraceNode["data"], { type: "tx" }>;
  chain: ChainId;
  priceEur?: number;
  connected: TraceResult["edges"];
  comment?: string;
  onComment: (t: string) => void;
  onHide: () => void;
}) {
  const t = useT(TXT);
  const fmt = useFormatters();
  const locale = useLocale();
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{t.transaction}</h3>
      <div className="mono break-all text-xs">{data.txid}</div>
      <div>
        {fmt.date(data.blockTime)} {data.blockHeight ? t.blockAt(data.blockHeight) : ""}
      </div>
      <div>{t.inOut(data.inputCount, data.outputCount)}</div>
      <div>
        {t.volume} {fmt.amount(data.totalOutSat, chain)}{" "}
        {priceEur !== undefined && (
          <span className="text-subtle">
            ({t.today} {fmt.fiat(data.totalOutSat, priceEur, chain)})
          </span>
        )}
      </div>
      {data.priceEur !== undefined && (
        <div className="text-muted">
          {t.valueThen(
            fmt.fiat(data.totalOutSat, data.priceEur, chain),
            data.priceEur.toLocaleString(fmt.intlLocale, { style: "currency", currency: "EUR" }),
          )}
        </div>
      )}
      <div>
        {t.fee} {fmt.amount(data.feeSat, chain)}
      </div>
      {data.carriesRisk && (
        <div className="rounded border border-red-500/60 bg-red-950/40 p-2 text-xs font-semibold text-red-300">
          &#9888; {t.txCarriesRisk}
        </div>
      )}
      {data.hints.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-yellow-300">
          {translateHints(data.hints, locale).map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      <h4 className="pt-2 font-medium">{t.moneyFlow}</h4>
      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
        {connected.map((e) => (
          <li key={e.id} className="flex justify-between gap-2">
            <span className="mono">
              {e.target === `t:${data.txid}` ? t.from : t.to}
              {shortHash((e.target === `t:${data.txid}` ? e.source : e.target).slice(2), 6)}
            </span>
            <span>
              {fmt.amount(e.valueSat, chain, 5)}
              {e.change ? " ⟲" : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 pt-2">
        <Link className="btn-secondary" href={`/tx/${data.txid}?chain=${chain}`}>
          {t.details}
        </Link>
        <button className="btn-secondary" type="button" onClick={onHide}>
          {t.hide}
        </button>
      </div>
      <CommentBox value={comment} onChange={onComment} />
    </div>
  );
}


/* ---------------- Warnungen: Geld von schädlichen Adressen ---------------- */

function RiskPanel({
  result,
  onSelect,
  onFocus,
}: {
  result: TraceResult;
  onSelect: (n: TraceNode | null) => void;
  onFocus: () => void;
}) {
  const t = useT(TXT);
  const fmt = useFormatters();
  const locale = useLocale();
  const chain = result.params.chain;
  const sources = result.riskSources ?? [];
  const byAddress = new Map(result.nodes.filter((n) => n.data.type === "address").map((n) => [n.id, n]));

  const affected = result.nodes
    .filter(
      (n): n is TraceNode & { data: Extract<TraceNode["data"], { type: "address" }> } =>
        n.data.type === "address" && !n.data.isRiskSource && (n.data.riskFromSat ?? 0) > 0,
    )
    .sort((a, b) => (b.data.riskFromSat ?? 0) - (a.data.riskFromSat ?? 0));

  const outflow = result.nodes
    .filter(
      (n): n is TraceNode & { data: Extract<TraceNode["data"], { type: "address" }> } =>
        n.data.type === "address" && (n.data.sentToRiskSat ?? 0) > 0 && !n.data.isRiskSource,
    )
    .sort((a, b) => (b.data.sentToRiskSat ?? 0) - (a.data.sentToRiskSat ?? 0));

  if (!sources.length) {
    return (
      <div className="card text-sm text-muted">{t.noRiskFound}</div>
    );
  }

  const jump = (id: string) => {
    const n = byAddress.get(id);
    if (n) {
      onSelect(n);
      onFocus();
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h3 className="font-semibold text-red-300">{t.riskTableTitle(sources.length)}</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-subtle">
            <tr>
              <th className="py-1">{t.colAddress}</th>
              <th>{t.colVerdict}</th>
              <th>{t.colSource}</th>
              <th className="text-right">{t.colPassedOn}</th>
              <th className="text-right">{t.colAffected}</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((r) => (
              <tr key={r.address} className="border-t border-border">
                <td className="py-1.5">
                  <button className="mono text-xs hover:text-brand" onClick={() => jump(`a:${r.address}`)} title={r.address}>
                    {shortHash(r.address, 8)}
                  </button>
                </td>
                <td>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${r.severity === "high" ? "bg-red-700 text-white" : "bg-orange-600 text-white"}`}
                  >
                    {r.label}
                  </span>
                    <span className="ml-1 text-xs text-muted">{categoryText(r.category, locale)}</span>
                </td>
                <td className="text-xs text-muted">{r.source}</td>
                <td className="text-right">{fmt.amount(r.outflowSat, chain, 5)}</td>
                <td className="text-right text-muted">{r.affectedAddresses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">{t.affectedTitle(affected.length)}</h3>
        {!affected.length && <p className="text-sm text-subtle">{t.noOutflow}</p>}
        {affected.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-subtle">
              <tr>
                <th className="py-1">{t.colAddress}</th>
                <th className="text-right">{t.colTaintedInflow}</th>
                <th className="text-right">{t.colShare}</th>
                <th>{t.colOrigin}</th>
                <th>{t.colLabels}</th>
              </tr>
            </thead>
            <tbody>
              {affected.map((n) => (
                <tr key={n.id} className="border-t border-border">
                  <td className="py-1.5">
                    <button className="mono text-xs hover:text-brand" onClick={() => jump(n.id)} title={n.data.address}>
                      {shortHash(n.data.address, 8)}
                    </button>
                  </td>
                  <td className="text-right text-red-300">
                    {fmt.amount(n.data.riskFromSat, chain, 5)}
                    {result.priceEur !== undefined && (
                      <div className="text-[10px] text-subtle">
                        {fmt.fiat(n.data.riskFromSat, result.priceEur, chain)}
                      </div>
                    )}
                  </td>
                  <td className="text-right">{fmt.percent(n.data.riskFromRatio || 0, 0)}</td>
                  <td className="mono text-[11px] text-muted">
                    {(n.data.riskSources || []).slice(0, 2).map((a) => (
                      <div key={a}>{shortHash(a, 5)}</div>
                    ))}
                    {(n.data.riskSources || []).length > 2 && <div>+{(n.data.riskSources || []).length - 2}</div>}
                  </td>
                  <td>
                    <LabelBadges labels={n.data.labels} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {outflow.length > 0 && (
        <div className="card space-y-3">
          <h3 className="font-semibold">{t.outflowTitle(outflow.length)}</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-subtle">
              <tr>
                <th className="py-1">{t.colAddress}</th>
                <th className="text-right">{t.colToHarmful}</th>
              </tr>
            </thead>
            <tbody>
              {outflow.map((n) => (
                <tr key={n.id} className="border-t border-border">
                  <td className="py-1.5">
                    <button className="mono text-xs hover:text-brand" onClick={() => jump(n.id)} title={n.data.address}>
                      {shortHash(n.data.address, 8)}
                    </button>
                  </td>
                  <td className="text-right text-orange-300">{fmt.amount(n.data.sentToRiskSat, chain, 5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-subtle">
        {t.riskFootnote(result.params.taintModel === "none" ? "haircut" : result.params.taintModel)}
      </p>
    </div>
  );
}


/* ---------------- Forensik: Dienste, Wallet-Merkmale, Nachweis ---------------- */

function ForensicsPanel({ result }: { result: TraceResult }) {
  const t = useT(TXT);
  const fmt = useFormatters();
  const locale = useLocale();
  const chain = result.params.chain;
  const deposits = result.deposits ?? [];
  const fingerprints = result.fingerprints ?? [];
  const crossChain = result.crossChain ?? [];
  const evidence = result.evidence;

  return (
    <div className="space-y-4">
      {/* Einzahlungsadressen */}
      <div className="card space-y-2">
        <h3 className="font-semibold">{t.depositsTitle(deposits.length)}</h3>
        <p className="text-sm text-muted">{t.depositsLead}</p>
        {!deposits.length && <p className="text-sm text-subtle">{t.noneDetected}</p>}
        {deposits.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-subtle">
                <tr>
                  <th className="py-1">{t.colDepositAddress}</th>
                  <th>{t.colService}</th>
                  <th>{t.colForwardsTo}</th>
                  <th className="text-right">{t.colShare}</th>
                  <th className="text-right">{t.colEvents}</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.address} className="border-t border-border">
                    <td className="py-1.5">
                      <Link href={`/address/${d.address}?chain=${chain}`} className="mono text-xs hover:text-brand" title={d.address}>
                        {shortHash(d.address, 8)}
                      </Link>
                    </td>
                    <td className="text-brand">{d.service ?? t.unknownService}</td>
                    <td>
                      <Link href={`/address/${d.forwardsTo}?chain=${chain}`} className="mono text-xs hover:text-brand" title={d.forwardsTo}>
                        {shortHash(d.forwardsTo, 8)}
                      </Link>
                    </td>
                    <td className="text-right">{fmt.percent(d.ratio, 0)}</td>
                    <td className="text-right text-muted">{d.forwardCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Übergänge auf andere Chains */}
      <div className="card space-y-2">
        <h3 className="font-semibold">{t.crossChainTitle(crossChain.length)}</h3>
        <p className="text-sm text-muted">{t.crossChainLead}</p>
        {!crossChain.length && <p className="text-sm text-subtle">{t.noneDetected}</p>}
        {crossChain.map((c) => (
          <div key={c.txid} className="flex flex-wrap items-center gap-2 rounded border border-border p-2 text-sm">
            <span className="rounded bg-teal-700 px-1.5 py-0.5 text-xs text-white">
              {c.kind === "bridge" ? t.bridge : t.swapService}: {c.service}
            </span>
            <Link href={`/tx/${c.txid}?chain=${chain}`} className="mono text-xs hover:text-brand">
              tx {shortHash(c.txid, 8)}
            </Link>
            <span className="text-subtle">→</span>
            <Link href={`/address/${c.address}?chain=${chain}`} className="mono text-xs hover:text-brand">
              {shortHash(c.address, 8)}
            </Link>
            <Link className="btn-secondary ml-auto" href={`/tx/${c.txid}?chain=${chain}`}>
              {t.checkDestChain}
            </Link>
          </div>
        ))}
      </div>

      {/* Wallet-Fingerabdruck */}
      <div className="card space-y-2">
        <h3 className="font-semibold">{t.fingerprintTitle(fingerprints.length)}</h3>
        <p className="text-sm text-muted">{t.fingerprintLead}</p>
        {!fingerprints.length && <p className="text-sm text-subtle">{t.noFingerprints}</p>}
        {fingerprints.map((g) => (
          <div key={g.signature} className="rounded border border-border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono text-xs text-brand">{g.signature}</span>
              <span className="text-muted">{t.fingerprintTxs(g.txids.length)}</span>
            </div>
            <div className="text-xs text-muted">{translateHints(g.traits, locale).join(" · ")}</div>
            {g.candidates.length > 0 && (
              <div className="text-xs text-cyan-300">
                {t.matches(translateHints(g.candidates, locale).join(", "))}
              </div>
            )}
            <ul className="mono mt-1 flex max-h-24 flex-wrap gap-2 overflow-y-auto text-[11px]">
              {g.txids.slice(0, 20).map((txid) => (
                <li key={txid}>
                  <Link href={`/tx/${txid}?chain=${chain}`} className="hover:text-brand">
                    {shortHash(txid, 5)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Beweissicherung */}
      <div className="card space-y-2">
        <h3 className="font-semibold">{t.evidenceTitle}</h3>
        {!evidence ? (
          <p className="text-sm text-subtle">{t.noEvidence}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{t.evidenceLead}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                <b>{evidence.entries.length}</b> {t.evidenceQueries}
              </span>
              <span>
                {t.evidenceCreated} {new Date(evidence.createdAt).toLocaleString(fmt.intlLocale)}
              </span>
              <span className="mono break-all text-xs text-muted">
                {t.evidenceDigest} {evidence.digest}
              </span>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-brand">{t.evidenceDetails}</summary>
              <div className="mt-2 max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-left uppercase text-subtle">
                    <tr>
                      <th className="py-1">{t.colKind}</th>
                      <th>{t.colRef}</th>
                      <th>{t.colSource}</th>
                      <th>{t.colTime}</th>
                      <th>SHA-256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.entries.slice(0, 300).map((e, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1">{e.kind}</td>
                        <td className="mono">{shortHash(e.key, 6)}</td>
                        <td>{e.provider}</td>
                        <td className="text-muted">{new Date(e.at).toLocaleTimeString(fmt.intlLocale)}</td>
                        <td className="mono text-subtle">{e.sha256.slice(0, 16)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
