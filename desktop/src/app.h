// ---------------------------------------------------------------------------
// app.h - Zustand der Anwendung, Sprache, Formatierung und die Beispieldaten.
//
// Die Anwendung bildet die Chainer-Webseite nach: dieselben Seiten, dieselbe
// Navigation, dieselben Texte in Deutsch und Englisch. Die Inhalte kommen aus
// `demo.cpp` und entsprechen in Form und Feldern den Antworten der Web-API.
// ---------------------------------------------------------------------------
#pragma once
#include "ui.h"
#include "providers.h"
#include "net.h"
#include "taint.h"
#include <string>
#include <vector>

// --- Sprache ---------------------------------------------------------------
enum class Loc { En, De };
extern Loc g_locale;

inline std::wstring tr(const wchar_t* en, const wchar_t* de) {
    return g_locale == Loc::De ? std::wstring(de) : std::wstring(en);
}

// --- Formatierung (entspricht `src/lib/format.ts` mit en-GB / de-DE) -------
std::wstring fmtNumber(double v, int maxFrac = 0, int minFrac = 0);
std::wstring fmtAmount(double smallestUnit, int decimals, const std::wstring& symbol, int digits = 8);
std::wstring fmtFiat(double smallestUnit, double rate, int decimals);
std::wstring fmtPercent(double v, int digits = 1);
std::wstring fmtTimestamp(long long unixSec);
std::wstring fmtDate(long long unixSec);
std::wstring fmtTime(long long unixSec);
std::wstring fmtDateShort(long long unixSec);
std::wstring shortHash(const std::wstring& s, int n = 6);

// --- Ketten (Spiegel von `src/lib/chains.ts`) ------------------------------
struct ChainMeta {
    std::wstring id, name, symbol, unit, explorer;
    int decimals = 8;
    bool utxo = true;
};
extern const std::vector<ChainMeta> CHAINS;
const ChainMeta& chainAt(int i);
bool isUtxoChain(int i);

// --- Anwendung -------------------------------------------------------------
// Reine lokale Anwendung: keine Anmeldung, keine Datenbank, kein Netzverkehr.
// Was der Anwender anlegt, steht in einer JSON-Datei (siehe store.h).
#define APP_VERSION L"0.95.06"
#define APP_AUTHOR  L"Tobias Wagner (twgnr)"
#define APP_REPO    L"https://github.com/twgnr/Chainer"

// --- Seiten ----------------------------------------------------------------
enum class Page {
    Home, Trace, Path, Screen, Cases, Jobs, Watchlist, Annotations, Settings, ApiDocs,
    Info, Address, Tx
};

struct Route {
    Page page = Page::Home;
    std::wstring param;   // Adresse / Transaktion / Fall-Kennung
    int chain = 0;
};

// --- Beispieldaten ---------------------------------------------------------
struct ProviderRow {
    std::wstring id, name, url;
    bool dataKind = true;          // true = Blockchain, false = Labels/Risiko
    int chains = 0;                // 0 = alle
    std::wstring key;              // "set" | "missing" | "none" | "optional" | "unconfigured"
    std::wstring rateLimit;
    bool active = true;
    int ms = -1;                   // >=0 nach der Erreichbarkeitspruefung
    bool ok = true;
    std::wstring pingError;
};

struct LabelRow {
    std::wstring label, source, category, details, url;
    std::wstring risk;   // "high" | "medium" | "low" | ""
    bool own = false;
};

struct CaseRow {
    std::wstring id, name, start, chain, mode, direction;
    int traces = 1, depth = 3;
    bool shared = false, own = true;
    long long updatedAt = 0;
};

struct JobRow {
    std::wstring id, name, type, status, phase, message, error;
    int nodes = 0, edges = 0, apiCalls = 0;
    long long createdAt = 0, startedAt = 0, finishedAt = 0;
};

struct WatchEvent {
    long long at = 0;
    std::wstring kind, text;
    bool read = false;
};

struct WatchRow {
    std::wstring id, address, note, chain;
    double balanceSat = 0;      // kleinste Einheit der Chain
    long long lastCheck = 0;
    int txCount = 0;
    bool paused = false;
    bool checking = false;
    std::wstring error;
    std::vector<WatchEvent> events;
};

struct AnnotationRow {
    std::wstring id, address, label, note, category, chain;
    std::wstring risk;
    bool shared = false;
    long long updatedAt = 0;
};

struct TxRow {
    std::wstring txid, counterparty;
    long long blockTime = 0;
    double valueSat = 0;
    bool incoming = true;
    double priceThen = 0;
    int more = 0;
};

// --- Trace-Graph -----------------------------------------------------------
struct GNode {
    std::wstring id;             // "a:<addr>" oder "t:<txid>"
    bool isAddress = true;
    std::wstring address, txid, label, labelSource;
    std::wstring risk = L"none"; // none | low | medium | high
    double receivedSat = 0, sentSat = 0, totalOutSat = 0, feeSat = 0;
    double taintRatio = 0, riskFromRatio = 0;
    int depth = 0, clusterId = 0, inputCount = 0, outputCount = 0;
    long long blockTime = 0, blockHeight = 0;
    bool isStart = false, isRiskSource = false, coinbase = false, change = false;
    bool carriesRisk = false, coinjoin = false, deposit = false;
    bool notFollowed = false;              // wegen der Grenzen nicht weiterverfolgt
    std::wstring depositService, swapService;
    double taintSat = 0;                   // Betrag aus der Startquelle
    double riskFromSat = 0;                // Betrag aus schädlichen Adressen
    double sentToRiskSat = 0;              // ging direkt an eine schädliche Adresse
    std::vector<std::wstring> riskSources; // Adressen, aus denen es stammt
    int behaviorCount = 0, extraLabels = 0;
    float x = 0, y = 0, w = 0, h = 0;   // vom Layout gesetzt
};

struct GEdge {
    std::wstring from, to;
    double valueSat = 0;
    double taintSat = 0;   // Anteil aus der Startquelle
    double riskSat = 0;    // Anteil aus schädlichen Adressen
    bool change = false, coinbase = false, risky = false;
};

struct TraceData {
    std::vector<GNode> nodes;
    std::vector<GEdge> edges;
    int addresses = 0, txs = 0, clusters = 0, riskAddresses = 0;
    double riskInflowSat = 0, taintedOutSat = 0;
    int riskSources = 0, riskAffected = 0;
    int apiCalls = 0;
    double durationMs = 0;
    bool truncated = false;
    double priceEur = 0;
    std::vector<std::wstring> providersUsed;
    long long startedAt = 0;
    TaintModel taintModel = TaintModel::Haircut;
    std::vector<EvidenceEntry> evidence;
    std::wstring evidenceDigest;
};

// --- Verbindungssuche ------------------------------------------------------
struct PathHop {
    std::wstring id;    // Adresse oder Transaktions-ID
    bool isTx = false;
};

struct PathResult {
    std::vector<PathHop> hops;
    double value = 0;
};

// --- Bildschirmzustand -----------------------------------------------------
struct ScreenResultRow {
    std::wstring address, verdict, labels, sources;
    std::wstring risk;
};

struct App {
    Ui ui;
    Route route;
    std::vector<Route> history;
    ThemeChoice theme = ThemeChoice::Dark;
    bool systemLight = false;

    // Ungesicherte Aenderungen: wird nach jedem Schreibzugriff gesetzt und
    // am Ende des Bildes in die JSON-Datei geschrieben.
    bool dirty = false;

    float scroll = 0.f;
    float contentH = 0.f;

    // --- Formularzustand je Seite -----------------------------------------
    // Suche
    std::wstring searchQuery;
    int searchChain = 0;   // 0 = automatisch, sonst Index+1
    std::wstring searchError;

    // Trace
    std::wstring traceStart;
    std::wstring traceMore;
    int traceChain = 0, traceMode = 0, traceDir = 0, traceTaint = 0;
    std::wstring traceDepth = L"3", traceTxPerAddr = L"12", traceAddrPerTx = L"12",
                 traceMinValue = L"1000", traceMaxNodes = L"400";
    bool traceEnrich = true, tracePrices = true, traceLightning = true, traceMedium = false;
    int traceTab = 0;         // 0 Graph, 1 Verlauf, 2 Muster, 3 Warnungen, 4 Forensik
    int traceLayout = 0;      // LR / TB / Zeit
    bool optCluster = false, optHideChange = false, optTaint = false, optRisk = true,
         optOnlyRisk = false, optFiat = false;
    bool traceHasResult = true;
    std::wstring traceSelected;
    float graphPanX = 0, graphPanY = 0, graphZoom = 1.f;
    bool graphFitted = false;
    bool graphDragging = false;
    float dragLastX = 0, dragLastY = 0;
    std::wstring saveName = L"";

    // Verbindung
    std::wstring pathFrom, pathTo;
    int pathChain = 0;
    std::wstring pathDepth = L"3";
    bool pathHasResult = false, pathRunning = false;
    std::wstring pathError, pathPhase;
    int pathCalls = 0;
    double pathSeconds = 0;
    std::vector<PathResult> pathResults;

    // Massenpruefung
    std::wstring screenInput;
    int screenChain = 0;
    bool screenHasResult = true;

    // Beobachtungen und eigene Labels
    std::wstring watchNew, watchNote;
    int watchChain = 0;
    std::wstring watchMin = L"0";
    std::wstring annAddress, annLabel, annNote, annEditId;
    int annCategory = 12, annRisk = 0, annChain = 0;
    std::wstring annSearch;
    std::wstring message;        // kurze Rueckmeldung ueber der Liste
    int providerChain = 0;

    // Adressseite (Live-Daten)
    int addressTxLimit = 50;
    std::wstring addrKey;                 // "<chain>|<adresse>" des geladenen Standes
    bool addrLoading = false;
    NetAddress addrInfo;
    std::vector<NetTx> addrTxs;
    std::vector<NetLabel> addrLabels;
    std::vector<std::wstring> addrUnreachable;
    std::wstring addrTxError;

    // Transaktionsseite (Live-Daten)
    std::wstring txKey;
    bool txLoading = false;
    NetTx txInfo;

    // Kurse
    double priceEur = 0, priceUsd = 0;
    bool priceLoading = false;
    long long priceAt = 0;
    int priceChain = -1;

    // Erreichbarkeitsprüfung
    bool pinging = false;

    // Zugangsdaten der Datenquellen
    ProviderKeys keys;

    // Trace über das Netz
    bool traceRunning = false;
    std::wstring traceError, tracePhase, traceMessage;
    int traceProgressNodes = 0, traceProgressEdges = 0, traceProgressCalls = 0;
    unsigned traceRunId = 0;             // steigt bei jedem Start, bricht alte Läufe ab

    // Massenprüfung
    bool screenRunning = false;
    int screenDone = 0, screenTotal = 0;

    // Daten
    std::vector<ProviderRow> providers;
    std::vector<CaseRow> cases;
    std::vector<JobRow> jobs;
    std::vector<WatchRow> watches;
    std::vector<AnnotationRow> annotations;
    std::vector<ScreenResultRow> screenResults;
    TraceData trace;
    double btcPrice = 0;
    std::wstring priceSource;

    void go(Page p, const std::wstring& param = L"");
    Mode mode() const;
};

extern App g_app;

void loadDemoData(App& a);          // Beispielinhalte beim ersten Start
void seedEmptyTrace(App& a);        // leerer Graph, bis ein Trace gelaufen ist
void openUrl(const std::wstring& url);   // Link im Standardbrowser oeffnen
std::wstring newId();               // Kennung fuer neue Eintraege

// --- Live-Abfragen (live.cpp) ---------------------------------------------
void liveEnsurePrice(App& a, int chain);
void liveEnsureAddress(App& a, int chain, const std::wstring& address);
void liveEnsureTx(App& a, int chain, const std::wstring& txid);
void livePingProviders(App& a);
void liveStartTrace(App& a);
void liveStartPath(App& a);
void liveCancelTrace(App& a);
void liveRunScreening(App& a);
void liveCheckWatches(App& a);
void liveRefreshWatch(App& a, size_t index);
void liveTick(App& a);

// --- Ausgabe in Dateien (export.cpp) --------------------------------------
void exportTraceJson(App& a);
void exportScreenCsv(App& a);
void exportStoreCopy(App& a);
void importAddressList(App& a);

// --- Seiten (in pages_*.cpp) ----------------------------------------------
float pageHome(App& a, float x, float y, float w);
float pageTrace(App& a, float x, float y, float w);
float pagePath(App& a, float x, float y, float w);
float pageScreen(App& a, float x, float y, float w);
float pageCases(App& a, float x, float y, float w);
float pageJobs(App& a, float x, float y, float w);
float pageWatchlist(App& a, float x, float y, float w);
float pageAnnotations(App& a, float x, float y, float w);
float pageSettings(App& a, float x, float y, float w);
float pageApiDocs(App& a, float x, float y, float w);
float pageInfo(App& a, float x, float y, float w);
float pageAddress(App& a, float x, float y, float w);
float pageTx(App& a, float x, float y, float w);

// --- Gemeinsame Bausteine (in widgets.cpp) --------------------------------
float providerStatusList(App& a, float x, float y, float w);
float searchBox(App& a, float x, float y, float w, bool large);
float labelBadges(App& a, float x, float y, float w, const std::vector<LabelRow>& labels, bool compact);
Color categoryColor(const Theme& th, const std::wstring& category, Color* fgOut);
float sectionHeading(App& a, float x, float y, float w, const std::wstring& title);
float statCard(App& a, float x, float y, float w, const std::wstring& label,
               const std::wstring& value, const std::wstring& sub);
float activityHeatmap(App& a, float x, float y, float w, const std::vector<long long>& times);
float traceGraphCanvas(App& a, float x, float y, float w, float h);
float traceSidePanel(App& a, float x, float y, float w, float h);
float traceTimeline(App& a, float x, float y, float w);
