// ---------------------------------------------------------------------------
// live.cpp - Verbindung zwischen Oberfläche und Datenquellen.
//
// Jede Abfrage läuft in einem Hintergrundauftrag. Der Arbeitsthread schreibt
// ausschließlich in ein eigenes Ergebnisobjekt; erst die Rückmeldung im
// Oberflächen-Thread überträgt es in `App`. So teilt sich kein Thread den
// Zustand mit dem Zeichnen.
// ---------------------------------------------------------------------------
#include "app.h"
#include <windows.h>
#include "net.h"
#include "store.h"
#include <atomic>
#include <memory>
#include <mutex>
#include <algorithm>
#include <map>
#include <set>
#include <ctime>

// ---------------------------------------------------------------------------
// Graph-Layout: Spalte = Tiefe, Zeile = laufende Nummer (wie dagre "LR")
// ---------------------------------------------------------------------------
static void layoutTrace(TraceData& t) {
    const float colW = 300.f, rowH = 130.f;
    std::map<int, int> perDepth;
    for (GNode& n : t.nodes) {
        n.w = n.isAddress ? 210.f : 165.f;
        n.h = n.isAddress ? 96.f : 74.f;
        n.x = 40.f + (float)n.depth * colW;
        n.y = 40.f + (float)perDepth[n.depth] * rowH;
        perDepth[n.depth]++;
    }
    float maxHeight = 0;
    for (auto& kv : perDepth) maxHeight = (std::max)(maxHeight, (float)kv.second * rowH);
    for (auto& kv : perDepth) {
        int d = kv.first;
        float used = (float)kv.second * rowH;
        float shift = (maxHeight - used) * .5f;
        for (GNode& n : t.nodes)
            if (n.depth == d) n.y += shift;
    }
}

void seedEmptyTrace(App& a) {
    a.trace = TraceData();
    a.traceHasResult = false;
    a.traceSelected.clear();
    a.graphFitted = false;
}

// ---------------------------------------------------------------------------
// Kurse
// ---------------------------------------------------------------------------
namespace {
struct PriceJob {
    double eur = 0, usd = 0;
    std::wstring source;
    bool ok = false;
};
}  // namespace

void liveEnsurePrice(App& a, int chain) {
    long long now = (long long)time(nullptr);
    if (a.priceLoading) return;
    if (a.priceEur > 0 && now - a.priceAt < 300 && a.priceChain == chain) return;
    a.priceLoading = true;
    a.priceChain = chain;
    auto job = std::make_shared<PriceJob>();
    App* app = &a;
    taskRun(L"price", tr(L"Rate", L"Kurs"),
            [job, chain]() { job->ok = netFetchPrice(chain, &job->eur, &job->usd, &job->source); },
            [job, app, chain]() {
                app->priceLoading = false;
                if (!job->ok) return;
                app->priceEur = job->eur;
                app->priceUsd = job->usd;
                app->priceSource = job->source;
                app->priceAt = (long long)time(nullptr);
                app->priceChain = chain;
                app->btcPrice = job->eur;
            });
}

// ---------------------------------------------------------------------------
// Adresse
// ---------------------------------------------------------------------------
namespace {
struct AddressJob {
    NetAddress info;
    std::vector<NetTx> txs;
    std::vector<NetLabel> labels;
    std::vector<std::wstring> unreachable;
    std::wstring txError;
};
}  // namespace

void liveEnsureAddress(App& a, int chain, const std::wstring& address) {
    std::wstring key = std::to_wstring(chain) + L"|" + address + L"|" + std::to_wstring(a.addressTxLimit);
    if (a.addrKey == key || a.addrLoading) return;
    a.addrKey = key;
    a.addrLoading = true;
    a.addrInfo = NetAddress();
    a.addrTxs.clear();
    a.addrLabels.clear();
    a.addrUnreachable.clear();
    a.addrTxError.clear();

    auto job = std::make_shared<AddressJob>();
    ProviderKeys keys = a.keys;
    int limit = a.addressTxLimit;
    App* app = &a;
    taskCancelGroup(L"address");
    taskRun(L"address", tr(L"Address ", L"Adresse ") + shortHash(address, 8),
            [job, chain, address, keys, limit]() {
                job->info = netFetchAddress(chain, address, keys);
                job->txs = netFetchAddressTxs(chain, address, limit, keys, &job->txError);
                job->labels = netFetchLabels(chain, address, keys, &job->unreachable);
            },
            [job, app, key]() {
                if (app->addrKey != key) return;   // inzwischen andere Adresse geöffnet
                app->addrLoading = false;
                app->addrInfo = job->info;
                app->addrTxs = job->txs;
                app->addrLabels = job->labels;
                app->addrUnreachable = job->unreachable;
                app->addrTxError = job->txError;
            });
}

// ---------------------------------------------------------------------------
// Transaktion
// ---------------------------------------------------------------------------
void liveEnsureTx(App& a, int chain, const std::wstring& txid) {
    std::wstring key = std::to_wstring(chain) + L"|" + txid;
    if (a.txKey == key || a.txLoading) return;
    a.txKey = key;
    a.txLoading = true;
    a.txInfo = NetTx();

    auto job = std::make_shared<NetTx>();
    ProviderKeys keys = a.keys;
    App* app = &a;
    taskCancelGroup(L"tx");
    taskRun(L"tx", tr(L"Transaction ", L"Transaktion ") + shortHash(txid, 8),
            [job, chain, txid, keys]() { *job = netFetchTx(chain, txid, keys); },
            [job, app, key]() {
                if (app->txKey != key) return;
                app->txLoading = false;
                app->txInfo = *job;
            });
}

// ---------------------------------------------------------------------------
// Erreichbarkeit aller Quellen
// ---------------------------------------------------------------------------
void livePingProviders(App& a) {
    if (a.pinging) return;
    a.pinging = true;
    auto results = std::make_shared<std::vector<std::pair<std::wstring, PingInfo>>>();
    std::vector<std::wstring> ids;
    for (const ProviderRow& p : a.providers) ids.push_back(p.id);
    ProviderKeys keys = a.keys;
    int chain = a.providerChain;
    App* app = &a;
    taskRun(L"ping", tr(L"Reachability check", L"Erreichbarkeitsprüfung"),
            [results, ids, keys, chain]() {
                for (const std::wstring& id : ids) results->push_back({id, netPing(id, chain, keys)});
            },
            [results, app]() {
                app->pinging = false;
                for (auto& r : *results) {
                    for (ProviderRow& p : app->providers) {
                        if (p.id != r.first) continue;
                        if (r.second.error == L"Lokal") {
                            p.ms = -1;
                        } else {
                            p.ms = (int)r.second.ms;
                            p.ok = r.second.ok;
                            p.pingError = r.second.error;
                        }
                    }
                }
            });
}

// ---------------------------------------------------------------------------
// Trace
//
// Adressbasierte Breitensuche: von der Startadresse aus werden die
// Transaktionen geladen, daraus Knoten und Kanten gebaut und die Gegenseiten
// als nächste Ebene weiterverfolgt - so weit, wie Tiefe und Obergrenzen es
// zulassen.
// ---------------------------------------------------------------------------
namespace {
struct TraceCtx {
    std::atomic<bool> cancel{false};
    std::atomic<int> nodes{0}, edges{0}, calls{0};
    std::mutex m;
    std::wstring phase, message, error;
    TraceData result;
    unsigned runId = 0;
};
std::shared_ptr<TraceCtx> g_trace;
std::mutex g_traceMutex;

std::shared_ptr<TraceCtx> currentTrace() {
    std::lock_guard<std::mutex> lock(g_traceMutex);
    return g_trace;
}

void setPhase(TraceCtx& c, const std::wstring& phase, const std::wstring& msg) {
    std::lock_guard<std::mutex> lock(c.m);
    c.phase = phase;
    c.message = msg;
}

// Risikostufe aus den gefundenen Labels
std::wstring riskFromLabels(const std::vector<NetLabel>& labels, std::wstring* mainLabel,
                            std::wstring* mainSource, bool* harmful) {
    std::wstring risk = L"none";
    if (harmful) *harmful = false;
    for (const NetLabel& l : labels) {
        if (l.risk == L"high") {
            risk = L"high";
            if (harmful) *harmful = true;
        } else if (l.risk == L"medium" && risk != L"high") {
            risk = L"medium";
        } else if (l.risk == L"low" && risk == L"none") {
            risk = L"low";
        }
        if (mainLabel && mainLabel->empty() && !l.label.empty()) {
            *mainLabel = l.label;
            if (mainSource) *mainSource = l.source;
        }
    }
    return risk;
}
}  // namespace

void liveCancelTrace(App& a) {
    auto c = currentTrace();
    if (c) c->cancel = true;
    a.traceRunning = false;
}

void liveStartTrace(App& a) {
    if (a.traceRunning) return;
    std::wstring start = a.traceStart;
    while (!start.empty() && (start.front() == L' ')) start.erase(start.begin());
    while (!start.empty() && (start.back() == L' ')) start.pop_back();
    if (start.empty()) return;

    int chain = a.traceChain;
    if (!isChainAddress(start, chain) && !isChainTxid(start, chain)) {
        a.traceError = tr(L"The starting point does not match the format of this chain.",
                          L"Der Startpunkt passt nicht zum Format dieser Chain.");
        return;
    }

    auto ctx = std::make_shared<TraceCtx>();
    ctx->runId = ++a.traceRunId;
    {
        std::lock_guard<std::mutex> lock(g_traceMutex);
        if (g_trace) g_trace->cancel = true;
        g_trace = ctx;
    }

    a.traceRunning = true;
    a.traceError.clear();
    a.tracePhase = tr(L"starting", L"starte");
    a.traceMessage.clear();
    a.traceProgressNodes = a.traceProgressEdges = a.traceProgressCalls = 0;
    a.traceSelected.clear();
    a.graphFitted = false;

    int maxDepth = (std::max)(1, (std::min)(8, _wtoi(a.traceDepth.c_str())));
    int maxTxPerAddr = (std::max)(1, (std::min)(50, _wtoi(a.traceTxPerAddr.c_str())));
    int maxAddrPerTx = (std::max)(1, (std::min)(50, _wtoi(a.traceAddrPerTx.c_str())));
    double minValue = _wtof(a.traceMinValue.c_str());
    int maxNodes = (std::max)(10, (std::min)(2000, _wtoi(a.traceMaxNodes.c_str())));
    int direction = a.traceDir;   // 0 vorwärts, 1 rückwärts, 2 beides
    bool enrich = a.traceEnrich;
    ProviderKeys keys = a.keys;
    App* app = &a;

    netResetRequestCount();
    evidenceStart();

    taskRun(L"trace", tr(L"Trace ", L"Trace ") + shortHash(start, 8),
            [ctx, chain, start, maxDepth, maxTxPerAddr, maxAddrPerTx, minValue, maxNodes, direction,
             enrich, keys]() {
                TraceData& t = ctx->result;
                long long startedMs = (long long)GetTickCount64();
                std::map<std::wstring, size_t> nodeIndex;   // Knoten-Id -> Position
                std::set<std::wstring> seenEdge;
                std::set<std::wstring> visitedAddr, visitedTx;

                auto addAddrNode = [&](const std::wstring& addr, int depth) -> GNode* {
                    std::wstring id = L"a:" + addr;
                    auto it = nodeIndex.find(id);
                    if (it != nodeIndex.end()) return &t.nodes[it->second];
                    if ((int)t.nodes.size() >= maxNodes) return nullptr;
                    GNode n;
                    n.id = id;
                    n.isAddress = true;
                    n.address = addr;
                    n.depth = depth;
                    nodeIndex[id] = t.nodes.size();
                    t.nodes.push_back(n);
                    ctx->nodes = (int)t.nodes.size();
                    return &t.nodes.back();
                };
                auto addTxNode = [&](const NetTx& tx, int depth) -> GNode* {
                    std::wstring id = L"t:" + tx.txid;
                    auto it = nodeIndex.find(id);
                    if (it != nodeIndex.end()) return &t.nodes[it->second];
                    if ((int)t.nodes.size() >= maxNodes) return nullptr;
                    GNode n;
                    n.id = id;
                    n.isAddress = false;
                    n.txid = tx.txid;
                    n.depth = depth;
                    n.inputCount = (int)tx.inputs.size();
                    n.outputCount = (int)tx.outputs.size();
                    n.totalOutSat = tx.totalOut();
                    n.feeSat = tx.fee;
                    n.blockTime = tx.blockTime;
                    n.blockHeight = tx.blockHeight;
                    nodeIndex[id] = t.nodes.size();
                    t.nodes.push_back(n);
                    ctx->nodes = (int)t.nodes.size();
                    return &t.nodes.back();
                };
                auto addEdge = [&](const std::wstring& from, const std::wstring& to, double value,
                                   bool coinbase) {
                    std::wstring key = from + L">" + to;
                    if (seenEdge.count(key)) return;
                    seenEdge.insert(key);
                    GEdge e;
                    e.from = from;
                    e.to = to;
                    e.valueSat = value;
                    e.coinbase = coinbase;
                    t.edges.push_back(e);
                    ctx->edges = (int)t.edges.size();
                };

                // Startpunkt
                std::vector<std::pair<std::wstring, int>> frontier;
                if (isChainAddress(start, chain)) {
                    GNode* n = addAddrNode(start, 0);
                    if (n) n->isStart = true;
                    frontier.push_back({start, 0});
                } else {
                    // Start ist eine Transaktion: ihre Adressen bilden die Ebene 0
                    setPhase(*ctx, L"fetching", L"tx " + start.substr(0, 12));
                    NetTx tx = netFetchTx(chain, start, keys);
                    ctx->calls = (int)netRequestCount();
                    if (!tx.ok) {
                        std::lock_guard<std::mutex> lock(ctx->m);
                        ctx->error = tx.error;
                        return;
                    }
                    GNode* tn = addTxNode(tx, 0);
                    if (tn) tn->isStart = true;
                    for (const NetTxIn& in : tx.inputs) {
                        if (in.address.empty()) continue;
                        if (addAddrNode(in.address, 0))
                            addEdge(L"a:" + in.address, L"t:" + tx.txid, in.value, in.coinbase);
                        frontier.push_back({in.address, 0});
                    }
                    for (const NetTxOut& o : tx.outputs) {
                        if (o.address.empty()) continue;
                        if (addAddrNode(o.address, 1))
                            addEdge(L"t:" + tx.txid, L"a:" + o.address, o.value, false);
                        frontier.push_back({o.address, 1});
                    }
                    visitedTx.insert(tx.txid);
                }

                // Breitensuche
                for (int depth = 0; depth <= maxDepth && !frontier.empty(); depth++) {
                    std::vector<std::pair<std::wstring, int>> next;
                    for (auto& entry : frontier) {
                        if (ctx->cancel) return;
                        const std::wstring& addr = entry.first;
                        int d = entry.second;
                        if (d > maxDepth) continue;
                        if (visitedAddr.count(addr)) continue;
                        visitedAddr.insert(addr);
                        if ((int)t.nodes.size() >= maxNodes) break;

                        setPhase(*ctx, L"expanding",
                                 L"Hop " + std::to_wstring(d) + L"/" + std::to_wstring(maxDepth) + L" · " +
                                     addr.substr(0, 12) + L"…");

                        std::wstring err;
                        std::vector<NetTx> txs =
                            netFetchAddressTxs(chain, addr, maxTxPerAddr, keys, &err);
                        ctx->calls = (int)netRequestCount();
                        if (ctx->cancel) return;

                        GNode* an = addAddrNode(addr, d);
                        if (!an) continue;

                        double received = 0, sent = 0;
                        for (const NetTx& tx : txs) {
                            bool isInput = false, isOutput = false;
                            for (const NetTxIn& in : tx.inputs)
                                if (in.address == addr) {
                                    isInput = true;
                                    sent += in.value;
                                }
                            for (const NetTxOut& o : tx.outputs)
                                if (o.address == addr) {
                                    isOutput = true;
                                    received += o.value;
                                }

                            // Richtung: vorwärts folgt ausgehenden, rückwärts eingehenden
                            bool followForward = (direction == 0 || direction == 2) && isInput;
                            bool followBackward = (direction == 1 || direction == 2) && isOutput;
                            if (!followForward && !followBackward) continue;
                            if (visitedTx.count(tx.txid) && !followForward && !followBackward) continue;
                            visitedTx.insert(tx.txid);

                            GNode* tn = addTxNode(tx, d + (followForward ? 1 : 0));
                            if (!tn) continue;

                            if (followForward) {
                                addEdge(L"a:" + addr, L"t:" + tx.txid, [&] {
                                    double v = 0;
                                    for (const NetTxIn& in : tx.inputs)
                                        if (in.address == addr) v += in.value;
                                    return v;
                                }(), false);
                                int taken = 0;
                                for (const NetTxOut& o : tx.outputs) {
                                    if (taken >= maxAddrPerTx) break;
                                    if (o.address.empty() || o.address == addr) continue;
                                    if (o.value < minValue) continue;
                                    taken++;
                                    if (addAddrNode(o.address, d + 2))
                                        addEdge(L"t:" + tx.txid, L"a:" + o.address, o.value, false);
                                    if (d + 2 <= maxDepth) next.push_back({o.address, d + 2});
                                }
                            }
                            if (followBackward) {
                                addEdge(L"t:" + tx.txid, L"a:" + addr, [&] {
                                    double v = 0;
                                    for (const NetTxOut& o : tx.outputs)
                                        if (o.address == addr) v += o.value;
                                    return v;
                                }(), false);
                                int taken = 0;
                                for (const NetTxIn& in : tx.inputs) {
                                    if (taken >= maxAddrPerTx) break;
                                    if (in.address.empty() || in.address == addr) continue;
                                    if (in.value < minValue) continue;
                                    taken++;
                                    if (addAddrNode(in.address, d + 2))
                                        addEdge(L"a:" + in.address, L"t:" + tx.txid, in.value, in.coinbase);
                                    if (d + 2 <= maxDepth) next.push_back({in.address, d + 2});
                                }
                            }
                        }

                        // Salden der Adresse eintragen
                        for (GNode& n : t.nodes) {
                            if (n.id != L"a:" + addr) continue;
                            n.receivedSat = received;
                            n.sentSat = sent;
                            break;
                        }

                        // Cluster: Adressen, die gemeinsam als Eingang auftreten,
                        // gehören mit hoher Wahrscheinlichkeit derselben Wallet.
                        for (const NetTx& tx : txs) {
                            if (tx.inputs.size() < 2) continue;
                            bool mine = false;
                            for (const NetTxIn& in : tx.inputs)
                                if (in.address == addr) mine = true;
                            if (!mine) continue;
                            int cluster = 0;
                            for (const NetTxIn& in : tx.inputs) {
                                auto it = nodeIndex.find(L"a:" + in.address);
                                if (it != nodeIndex.end() && t.nodes[it->second].clusterId) {
                                    cluster = t.nodes[it->second].clusterId;
                                    break;
                                }
                            }
                            if (!cluster) cluster = ++t.clusters;
                            for (const NetTxIn& in : tx.inputs) {
                                auto it = nodeIndex.find(L"a:" + in.address);
                                if (it != nodeIndex.end()) t.nodes[it->second].clusterId = cluster;
                            }
                        }
                    }
                    frontier.swap(next);
                    if ((int)t.nodes.size() >= maxNodes) {
                        t.truncated = true;
                        break;
                    }
                }
                if (ctx->cancel) return;

                // Labels für die gefundenen Adressen (nur eine begrenzte Anzahl,
                // damit die Fremdquellen nicht überrannt werden).
                if (enrich) {
                    setPhase(*ctx, L"labelling", L"Labels");
                    int done = 0;
                    for (GNode& n : t.nodes) {
                        if (!n.isAddress || done >= 40) continue;
                        if (ctx->cancel) return;
                        done++;
                        std::vector<NetLabel> labels = netFetchLabels(chain, n.address, keys, nullptr);
                        ctx->calls = (int)netRequestCount();
                        if (labels.empty()) continue;
                        std::wstring mainLabel, mainSource;
                        bool harmful = false;
                        n.risk = riskFromLabels(labels, &mainLabel, &mainSource, &harmful);
                        n.label = mainLabel;
                        n.labelSource = mainSource;
                        n.extraLabels = (int)labels.size() - 1;
                        n.isRiskSource = harmful;
                    }
                }

                // Belastete Zuflüsse markieren: alles, was von einer als
                // schädlich gemeldeten Adresse aus erreichbar ist.
                {
                    std::set<std::wstring> tainted;
                    for (const GNode& n : t.nodes)
                        if (n.isRiskSource) tainted.insert(n.id);
                    for (int round = 0; round < 8; round++) {
                        bool changed = false;
                        for (GEdge& e : t.edges) {
                            if (tainted.count(e.from) && !tainted.count(e.to)) {
                                tainted.insert(e.to);
                                changed = true;
                            }
                        }
                        if (!changed) break;
                    }
                    for (GEdge& e : t.edges) e.risky = tainted.count(e.from) > 0;
                    for (GNode& n : t.nodes) {
                        if (!tainted.count(n.id) || n.isRiskSource) continue;
                        if (n.isAddress) {
                            n.riskFromRatio = 1.0;
                            t.riskAffected++;
                        } else {
                            n.carriesRisk = true;
                        }
                    }
                    for (const GNode& n : t.nodes)
                        if (n.isRiskSource) {
                            t.riskSources++;
                            t.riskInflowSat += n.receivedSat;
                        }
                }

                for (const GNode& n : t.nodes) {
                    if (n.isAddress) {
                        t.addresses++;
                        if (n.risk == L"high") t.riskAddresses++;
                    } else {
                        t.txs++;
                    }
                }
                t.apiCalls = (int)netRequestCount();
                t.durationMs = (double)((long long)GetTickCount64() - startedMs);
                t.startedAt = (long long)time(nullptr);
                evidenceStop();
                t.evidence = evidenceTake();
                t.evidenceDigest = ::evidenceDigest(t.evidence);
                // Welche Quellen haben geantwortet?
                std::map<std::wstring, int> used;
                for (const EvidenceEntry& e : t.evidence) {
                    size_t a1 = e.url.find(L"://");
                    if (a1 == std::wstring::npos) continue;
                    size_t a2 = e.url.find(L'/', a1 + 3);
                    std::wstring host = e.url.substr(a1 + 3, (a2 == std::wstring::npos ? e.url.size() : a2) - a1 - 3);
                    used[host]++;
                }
                for (auto& kv : used)
                    t.providersUsed.push_back(kv.first + L" ×" + std::to_wstring(kv.second));
                ctx->calls = t.apiCalls;
                layoutTrace(t);
                setPhase(*ctx, L"done", L"");
            },
            [ctx, app]() {
                if (ctx->cancel) return;
                if (app->traceRunId != ctx->runId) return;
                app->traceRunning = false;
                std::lock_guard<std::mutex> lock(ctx->m);
                if (!ctx->error.empty()) {
                    app->traceError = ctx->error;
                    app->traceHasResult = false;
                    return;
                }
                app->trace = ctx->result;
                app->traceHasResult = true;
                app->graphFitted = false;
                app->tracePhase.clear();
                app->traceMessage.clear();
            });
}

// ---------------------------------------------------------------------------
// Verbindungssuche
//
// Von beiden Enden gleichzeitig: vorwärts vom Start entlang der Ausgänge,
// rückwärts vom Ziel entlang der Eingänge. Trifft eine Adresse in beiden
// Richtungen auf, ist ein Weg gefunden und wird über die Vorgänger-Tabellen
// zusammengesetzt.
// ---------------------------------------------------------------------------
namespace {
struct PathJob {
    std::vector<PathResult> results;
    std::wstring error;
    int calls = 0;
    double seconds = 0;
    std::atomic<bool> cancel{false};
};
std::shared_ptr<PathJob> g_path;

struct Link {
    std::wstring via;    // Transaktion
    std::wstring other;  // Nachbaradresse
    double value = 0;
};
}  // namespace

void liveStartPath(App& a) {
    if (a.pathRunning) return;
    auto trim = [](std::wstring v) {
        while (!v.empty() && v.front() == L' ') v.erase(v.begin());
        while (!v.empty() && v.back() == L' ') v.pop_back();
        return v;
    };
    std::wstring from = trim(a.pathFrom), to = trim(a.pathTo);
    int chain = a.pathChain;
    if (!isChainAddress(from, chain) || !isChainAddress(to, chain)) {
        a.pathError = tr(L"Both fields need an address of the chosen chain.",
                         L"Beide Felder brauchen eine Adresse der gewählten Chain.");
        return;
    }
    if (from == to) {
        a.pathError = tr(L"Start and destination are the same address.",
                         L"Start und Ziel sind dieselbe Adresse.");
        return;
    }

    a.pathRunning = true;
    a.pathError.clear();
    a.pathResults.clear();
    a.pathHasResult = false;
    a.pathPhase = tr(L"searching", L"suche");

    int maxDepth = (std::max)(1, (std::min)(6, _wtoi(a.pathDepth.c_str())));
    ProviderKeys keys = a.keys;
    auto job = std::make_shared<PathJob>();
    g_path = job;
    App* app = &a;

    netResetRequestCount();

    taskRun(L"path", tr(L"Connection search", L"Verbindungssuche"),
            [job, chain, from, to, maxDepth, keys]() {
                long long t0 = (long long)GetTickCount64();
                const int MAX_TX = 12;         // Transaktionen je Adresse
                const int MAX_NEIGHBOURS = 12; // Nachbarn je Transaktion
                const int MAX_VISITS = 120;    // Obergrenze je Richtung

                // Vorgänger: Adresse -> woher sie erreicht wurde
                std::map<std::wstring, Link> fwdFrom, bwdFrom;
                std::set<std::wstring> fwdSeen{from}, bwdSeen{to};
                std::vector<std::wstring> fwdFrontier{from}, bwdFrontier{to};
                std::set<std::wstring> meetings;

                auto expand = [&](bool forward, std::vector<std::wstring>& frontier,
                                  std::set<std::wstring>& seen, std::map<std::wstring, Link>& parents,
                                  const std::set<std::wstring>& otherSide) {
                    std::vector<std::wstring> next;
                    for (const std::wstring& addr : frontier) {
                        if (job->cancel || (int)seen.size() > MAX_VISITS) return next;
                        std::wstring err;
                        std::vector<NetTx> txs = netFetchAddressTxs(chain, addr, MAX_TX, keys, &err);
                        for (const NetTx& tx : txs) {
                            bool isInput = false, isOutput = false;
                            for (const NetTxIn& i : tx.inputs)
                                if (i.address == addr) isInput = true;
                            for (const NetTxOut& o : tx.outputs)
                                if (o.address == addr) isOutput = true;
                            // Vorwärts folgt Ausgängen der Transaktionen, in denen
                            // die Adresse zahlt; rückwärts den Eingängen der
                            // Transaktionen, in denen sie empfängt.
                            if (forward && !isInput) continue;
                            if (!forward && !isOutput) continue;
                            int taken = 0;
                            if (forward) {
                                for (const NetTxOut& o : tx.outputs) {
                                    if (taken >= MAX_NEIGHBOURS) break;
                                    if (o.address.empty() || o.address == addr) continue;
                                    taken++;
                                    if (seen.count(o.address)) continue;
                                    seen.insert(o.address);
                                    parents[o.address] = Link{tx.txid, addr, o.value};
                                    if (otherSide.count(o.address)) meetings.insert(o.address);
                                    next.push_back(o.address);
                                }
                            } else {
                                for (const NetTxIn& i : tx.inputs) {
                                    if (taken >= MAX_NEIGHBOURS) break;
                                    if (i.address.empty() || i.address == addr) continue;
                                    taken++;
                                    if (seen.count(i.address)) continue;
                                    seen.insert(i.address);
                                    parents[i.address] = Link{tx.txid, addr, i.value};
                                    if (otherSide.count(i.address)) meetings.insert(i.address);
                                    next.push_back(i.address);
                                }
                            }
                        }
                    }
                    return next;
                };

                for (int depth = 0; depth < maxDepth && meetings.empty(); depth++) {
                    if (job->cancel) return;
                    fwdFrontier = expand(true, fwdFrontier, fwdSeen, fwdFrom, bwdSeen);
                    if (!meetings.empty()) break;
                    if (job->cancel) return;
                    bwdFrontier = expand(false, bwdFrontier, bwdSeen, bwdFrom, fwdSeen);
                    if (fwdFrontier.empty() && bwdFrontier.empty()) break;
                }

                // Wege zusammensetzen
                for (const std::wstring& meet : meetings) {
                    PathResult r;
                    std::vector<PathHop> head;   // Start -> Treffpunkt
                    std::wstring cur = meet;
                    double minValue = 1e30;
                    int guard = 0;
                    while (cur != from && guard++ < 40) {
                        auto it = fwdFrom.find(cur);
                        if (it == fwdFrom.end()) break;
                        head.push_back({cur, false});
                        head.push_back({it->second.via, true});
                        minValue = (std::min)(minValue, it->second.value);
                        cur = it->second.other;
                    }
                    head.push_back({from, false});
                    std::reverse(head.begin(), head.end());

                    std::vector<PathHop> tail;   // Treffpunkt -> Ziel
                    cur = meet;
                    guard = 0;
                    while (cur != to && guard++ < 40) {
                        auto it = bwdFrom.find(cur);
                        if (it == bwdFrom.end()) break;
                        tail.push_back({it->second.via, true});
                        tail.push_back({it->second.other, false});
                        minValue = (std::min)(minValue, it->second.value);
                        cur = it->second.other;
                    }

                    r.hops = head;
                    for (const PathHop& h : tail) r.hops.push_back(h);
                    r.value = minValue < 1e29 ? minValue : 0;
                    if (r.hops.size() >= 3) job->results.push_back(r);
                    if (job->results.size() >= 8) break;
                }

                std::sort(job->results.begin(), job->results.end(),
                          [](const PathResult& x, const PathResult& y) {
                              return x.hops.size() < y.hops.size();
                          });
                job->calls = (int)netRequestCount();
                job->seconds = (double)((long long)GetTickCount64() - t0) / 1000.0;
            },
            [job, app]() {
                app->pathRunning = false;
                app->pathHasResult = true;
                app->pathResults = job->results;
                app->pathCalls = job->calls;
                app->pathSeconds = job->seconds;
                app->pathPhase.clear();
                if (job->results.empty())
                    app->pathError = tr(L"No connection found within the chosen depth.",
                                        L"Innerhalb der gewählten Tiefe wurde keine Verbindung gefunden.");
            });
}

// ---------------------------------------------------------------------------
// Massenprüfung
// ---------------------------------------------------------------------------
namespace {
struct ScreenJob {
    std::vector<ScreenResultRow> rows;
    std::atomic<int> done{0};
    std::atomic<bool> cancel{false};
};
std::shared_ptr<ScreenJob> g_screen;
}  // namespace

void liveRunScreening(App& a) {
    if (a.screenRunning) return;

    // Eingabe zerlegen
    std::vector<std::wstring> list;
    std::wstring cur;
    for (wchar_t c : a.screenInput) {
        if (c == L'\n' || c == L'\r' || c == L',' || c == L';' || c == L' ' || c == L'\t') {
            if (!cur.empty()) list.push_back(cur);
            cur.clear();
        } else {
            cur += c;
        }
    }
    if (!cur.empty()) list.push_back(cur);
    if (list.size() > 200) list.resize(200);
    if (list.empty()) return;

    a.screenRunning = true;
    a.screenHasResult = true;
    a.screenDone = 0;
    a.screenTotal = (int)list.size();
    a.screenResults.clear();

    auto job = std::make_shared<ScreenJob>();
    g_screen = job;
    ProviderKeys keys = a.keys;
    int chain = a.screenChain;
    std::vector<AnnotationRow> own = a.annotations;
    App* app = &a;

    taskRun(L"screen", tr(L"Bulk check", L"Massenprüfung"),
            [job, list, chain, keys, own]() {
                for (const std::wstring& addr : list) {
                    if (job->cancel) return;
                    ScreenResultRow row;
                    row.address = addr;
                    if (!isChainAddress(addr, chain)) {
                        row.verdict = tr(L"invalid", L"ungültig");
                        row.labels = tr(L"Not an address of this chain",
                                        L"Keine Adresse dieser Chain");
                        row.sources = L"–";
                        job->rows.push_back(row);
                        job->done++;
                        continue;
                    }
                    std::vector<NetLabel> labels = netFetchLabels(chain, addr, keys, nullptr);
                    // Eigene Labels ergänzen
                    for (const AnnotationRow& an : own) {
                        if (an.address != addr) continue;
                        NetLabel l;
                        l.source = tr(L"own label", L"eigenes Label");
                        l.label = an.label;
                        l.category = an.category;
                        l.risk = an.risk;
                        l.own = true;
                        labels.push_back(l);
                    }
                    std::wstring mainLabel, mainSource;
                    bool harmful = false;
                    std::wstring risk = riskFromLabels(labels, &mainLabel, &mainSource, &harmful);
                    row.risk = risk == L"none" ? L"" : risk;
                    if (labels.empty()) {
                        row.verdict = tr(L"clean", L"unauffällig");
                        row.labels = L"–";
                        row.sources = L"–";
                    } else {
                        bool mixer = false, service = false;
                        for (const NetLabel& l : labels) {
                            if (l.category == L"mixer") mixer = true;
                            if (l.category == L"exchange" || l.category == L"service") service = true;
                        }
                        row.verdict = harmful  ? tr(L"reported", L"gemeldet")
                                      : mixer  ? L"Mixer"
                                      : service ? tr(L"service", L"Dienst")
                                                : tr(L"labelled", L"gelabelt");
                        for (size_t i = 0; i < labels.size() && i < 3; i++)
                            row.labels += (i ? L", " : L"") + labels[i].label;
                        std::set<std::wstring> srcs;
                        for (const NetLabel& l : labels) srcs.insert(l.source);
                        for (const std::wstring& s : srcs) row.sources += (row.sources.empty() ? L"" : L", ") + s;
                    }
                    job->rows.push_back(row);
                    job->done++;
                }
            },
            [job, app]() {
                app->screenRunning = false;
                app->screenResults = job->rows;
                app->screenDone = job->done;
            });
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------
namespace {
struct WatchJob {
    std::vector<std::wstring> ids;
    std::vector<NetAddress> results;
};
}  // namespace

void liveCheckWatches(App& a) {
    if (a.watches.empty()) return;
    auto job = std::make_shared<WatchJob>();
    std::vector<std::pair<std::wstring, std::pair<int, std::wstring>>> targets;
    for (const WatchRow& w : a.watches) {
        if (w.paused) continue;
        int chain = 0;
        for (size_t i = 0; i < CHAINS.size(); i++)
            if (CHAINS[i].id == w.chain) chain = (int)i;
        targets.push_back({w.id, {chain, w.address}});
    }
    if (targets.empty()) return;
    for (WatchRow& w : a.watches)
        if (!w.paused) w.checking = true;

    ProviderKeys keys = a.keys;
    App* app = &a;
    taskRun(L"watch", tr(L"Watchlist check", L"Watchlist-Prüfung"),
            [job, targets, keys]() {
                for (auto& t : targets) {
                    job->ids.push_back(t.first);
                    job->results.push_back(netFetchAddress(t.second.first, t.second.second, keys));
                }
            },
            [job, app]() {
                long long now = (long long)time(nullptr);
                for (size_t i = 0; i < job->ids.size(); i++) {
                    for (WatchRow& w : app->watches) {
                        if (w.id != job->ids[i]) continue;
                        w.checking = false;
                        const NetAddress& r = job->results[i];
                        if (!r.ok) {
                            w.error = r.error;
                            continue;
                        }
                        w.error.clear();
                        // Änderung gegenüber dem letzten Stand als Ereignis vermerken
                        if (w.lastCheck && (w.balanceSat != r.balance || w.txCount != (int)r.txCount)) {
                            WatchEvent e;
                            e.at = now;
                            e.kind = L"tx";
                            double diff = r.balance - w.balanceSat;
                            const ChainMeta* meta = &CHAINS[0];
                            for (const ChainMeta& m : CHAINS)
                                if (m.id == w.chain) meta = &m;
                            e.text = (diff >= 0 ? tr(L"Incoming ", L"Eingang ") : tr(L"Outgoing ", L"Ausgang ")) +
                                     fmtAmount(diff < 0 ? -diff : diff, meta->decimals, meta->symbol, 8);
                            e.read = false;
                            w.events.insert(w.events.begin(), e);
                            if (w.events.size() > 20) w.events.resize(20);
                        }
                        w.balanceSat = r.balance;
                        w.txCount = (int)r.txCount;
                        w.lastCheck = now;
                    }
                }
                app->dirty = true;
            });
}

void liveRefreshWatch(App& a, size_t index) {
    if (index >= a.watches.size()) return;
    liveCheckWatches(a);
}

// ---------------------------------------------------------------------------
// Fortschritt in die Oberfläche übernehmen (einmal je Bild)
// ---------------------------------------------------------------------------
void liveTick(App& a) {
    taskPoll();
    if (a.traceRunning) {
        auto c = currentTrace();
        if (c) {
            a.traceProgressNodes = c->nodes;
            a.traceProgressEdges = c->edges;
            a.traceProgressCalls = c->calls;
            std::lock_guard<std::mutex> lock(c->m);
            a.tracePhase = c->phase;
            a.traceMessage = c->message;
        }
    }
    if (a.screenRunning && g_screen) a.screenDone = g_screen->done;
}
