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
#include "taint.h"
#include <deque>
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
                            std::wstring* mainSource, bool* harmful, bool includeMedium = false) {
    std::wstring risk = L"none";
    if (harmful) *harmful = false;
    for (const NetLabel& l : labels) {
        if (l.risk == L"high") {
            risk = L"high";
            if (harmful) *harmful = true;
        } else if (l.risk == L"medium" && risk != L"high") {
            risk = L"medium";
            // Mit der Option gelten auch Mixer und mittleres Risiko als Herkunft
            if (includeMedium && harmful) *harmful = true;
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
    if (a.traceMode == 1 && !isUtxoChain(chain)) {
        a.traceError = tr(L"UTXO-exact tracing only works on chains with unspent outputs.",
                          L"UTXO-genaues Verfolgen gibt es nur bei Ketten mit unverbrauchten Ausgängen.");
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
    bool utxoMode = a.traceMode == 1;
    TaintModel model = (TaintModel)(std::max)(0, (std::min)(3, a.traceTaint));
    bool enrich = a.traceEnrich;
    bool includeMedium = a.traceMedium;
    ProviderKeys keys = a.keys;
    App* app = &a;

    netResetRequestCount();
    evidenceStart();

    taskRun(L"trace", tr(L"Trace ", L"Trace ") + shortHash(start, 8),
            [ctx, chain, start, maxDepth, maxTxPerAddr, maxAddrPerTx, minValue, maxNodes, direction,
             utxoMode, model, enrich, includeMedium, keys]() {
                TraceData& t = ctx->result;
                long long startedMs = (long long)GetTickCount64();

                std::map<std::wstring, size_t> nodeIndex;
                std::set<std::wstring> seenEdge, visitedAddr, visitedTx;
                std::map<std::wstring, NetTx> txCache;
                std::vector<std::wstring> startIds;

                // --- Bausteine des Graphen -----------------------------------
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
                                   bool coinbase, bool change) {
                    std::wstring key = from + L">" + to;
                    if (seenEdge.count(key)) return;
                    seenEdge.insert(key);
                    GEdge e;
                    e.from = from;
                    e.to = to;
                    e.valueSat = value;
                    e.coinbase = coinbase;
                    e.change = change;
                    t.edges.push_back(e);
                    ctx->edges = (int)t.edges.size();
                };

                // Verdrahtet eine ganze Transaktion: alle bekannten Ein- und
                // Ausgangsadressen bekommen Knoten und Kanten. Das ist die
                // Grundlage für eine belastbare Taint-Rechnung.
                struct Wiring { std::vector<std::wstring> inputs, outputs; };
                auto addTx = [&](const NetTx& tx, int depth) -> Wiring {
                    Wiring w;
                    GNode* tn = addTxNode(tx, depth);
                    if (!tn) return w;
                    std::wstring txId = L"t:" + tx.txid;
                    std::set<std::wstring> inputAddrs;
                    for (const NetTxIn& in : tx.inputs) {
                        std::wstring addr = in.coinbase ? L"coinbase" : in.address;
                        if (addr.empty()) continue;
                        inputAddrs.insert(addr);
                        if (!addAddrNode(addr, (std::max)(0, depth - 1))) continue;
                        addEdge(L"a:" + addr, txId, in.value, in.coinbase, false);
                        w.inputs.push_back(addr);
                    }
                    for (const NetTxOut& o : tx.outputs) {
                        if (o.address.empty()) continue;
                        // Wechselgeld: der Ausgang geht an eine der Eingangsadressen
                        bool change = inputAddrs.count(o.address) > 0;
                        if (!addAddrNode(o.address, depth + 1)) continue;
                        addEdge(txId, L"a:" + o.address, o.value, false, change);
                        w.outputs.push_back(o.address);
                    }
                    return w;
                };

                auto loadTx = [&](const std::wstring& txid) -> const NetTx* {
                    auto it = txCache.find(txid);
                    if (it != txCache.end()) return it->second.ok ? &it->second : nullptr;
                    NetTx tx = netFetchTx(chain, txid, keys);
                    ctx->calls = (int)netRequestCount();
                    txCache[txid] = tx;
                    return tx.ok ? &txCache[txid] : nullptr;
                };

                // --- Warteschlange -------------------------------------------
                struct Item {
                    bool isOutput = false;
                    std::wstring address, txid;
                    int vout = 0, depth = 0, direction = 0;
                };
                std::deque<Item> queue;

                auto enqueueAddresses = [&](const std::vector<std::wstring>& addrs, int depth, int dir,
                                            const NetTx& tx, bool wantOutputs) {
                    int taken = 0;
                    for (const std::wstring& addr : addrs) {
                        if (taken >= maxAddrPerTx) break;
                        if (addr == L"coinbase") continue;
                        // Mindestbetrag prüfen
                        double value = 0;
                        if (wantOutputs) {
                            for (const NetTxOut& o : tx.outputs)
                                if (o.address == addr) value += o.value;
                        } else {
                            for (const NetTxIn& i : tx.inputs)
                                if (i.address == addr) value += i.value;
                        }
                        if (value < minValue) continue;
                        taken++;
                        if (depth > maxDepth) continue;
                        Item it;
                        it.address = addr;
                        it.depth = depth;
                        it.direction = dir;
                        queue.push_back(it);
                    }
                };

                // --- Startpunkt ----------------------------------------------
                if (isChainTxid(start, chain)) {
                    setPhase(*ctx, L"fetching", L"tx " + start.substr(0, 12));
                    const NetTx* tx = loadTx(start);
                    if (!tx) {
                        std::lock_guard<std::mutex> lock(ctx->m);
                        ctx->error = txCache.count(start) ? txCache[start].error : L"Nicht gefunden";
                        return;
                    }
                    NetTx copy = *tx;
                    Wiring w = addTx(copy, 0);
                    startIds.push_back(L"t:" + copy.txid);
                    for (GNode& n : t.nodes)
                        if (n.id == L"t:" + copy.txid) n.isStart = true;
                    visitedTx.insert(copy.txid);
                    if (utxoMode) {
                        // Nur die konkreten Ausgänge weiterverfolgen
                        for (const NetTxOut& o : copy.outputs) {
                            if (o.value < minValue) continue;
                            Item it;
                            it.isOutput = true;
                            it.txid = copy.txid;
                            it.vout = o.n;
                            it.depth = 0;
                            queue.push_back(it);
                        }
                        if (direction != 0) enqueueAddresses(w.inputs, 1, 1, copy, false);
                    } else {
                        if (direction != 1) enqueueAddresses(w.outputs, 1, 0, copy, true);
                        if (direction != 0) enqueueAddresses(w.inputs, 1, 1, copy, false);
                    }
                } else {
                    addAddrNode(start, 0);
                    for (GNode& n : t.nodes)
                        if (n.id == L"a:" + start) n.isStart = true;
                    startIds.push_back(L"a:" + start);
                    if (utxoMode) {
                        // Die konkreten Coins dieser Adresse: jeder Ausgang, der
                        // an sie zahlt, wird einzeln weiterverfolgt.
                        setPhase(*ctx, L"fetching", start.substr(0, 12) + L"…");
                        std::wstring err;
                        std::vector<NetTx> txs =
                            netFetchAddressTxs(chain, start, maxTxPerAddr, keys, &err);
                        ctx->calls = (int)netRequestCount();
                        if (txs.empty()) {
                            std::lock_guard<std::mutex> lock(ctx->m);
                            ctx->error = err.empty() ? tr(L"No transactions found.",
                                                          L"Keine Transaktionen gefunden.")
                                                     : err;
                            return;
                        }
                        for (const NetTx& tx : txs) {
                            txCache[tx.txid] = tx;
                            bool paysStart = false;
                            for (const NetTxOut& o : tx.outputs)
                                if (o.address == start) paysStart = true;
                            if (!paysStart) continue;
                            addTx(tx, 0);
                            visitedTx.insert(tx.txid);
                            for (const NetTxOut& o : tx.outputs) {
                                if (o.address != start || o.value < minValue) continue;
                                Item it;
                                it.isOutput = true;
                                it.txid = tx.txid;
                                it.vout = o.n;
                                it.depth = 1;
                                queue.push_back(it);
                            }
                        }
                    } else {
                        Item it;
                        it.address = start;
                        it.depth = 0;
                        it.direction = direction;
                        queue.push_back(it);
                    }
                }

                // --- Durchlauf ------------------------------------------------
                while (!queue.empty()) {
                    if (ctx->cancel) return;
                    if ((int)t.nodes.size() >= maxNodes) {
                        t.truncated = true;
                        break;
                    }
                    Item item = queue.front();
                    queue.pop_front();

                    // --- UTXO-genau: einen einzelnen Ausgang weiterverfolgen ---
                    if (item.isOutput) {
                        if (item.depth >= maxDepth) {
                            t.truncated = true;
                            continue;
                        }
                        auto itTx = txCache.find(item.txid);
                        const NetTx* tx = itTx != txCache.end() && itTx->second.ok ? &itTx->second
                                                                                  : loadTx(item.txid);
                        if (!tx) continue;
                        const NetTxOut* out = nullptr;
                        for (const NetTxOut& o : tx->outputs)
                            if (o.n == item.vout) out = &o;
                        if (!out) continue;
                        std::wstring outKey = out->address;

                        setPhase(*ctx, L"following",
                                 tr(L"coin ", L"Coin ") + shortHash(item.txid, 6) + L":" +
                                     std::to_wstring(item.vout));

                        std::wstring spendTxid = out->spentTxid;
                        bool knownUnspent = false;
                        if (spendTxid.empty()) {
                            std::vector<NetOutspend> spends = netFetchOutspends(chain, item.txid, keys);
                            ctx->calls = (int)netRequestCount();
                            if (item.vout >= 0 && item.vout < (int)spends.size()) {
                                spendTxid = spends[(size_t)item.vout].txid;
                                knownUnspent = !spends[(size_t)item.vout].spent;
                            }
                        }
                        if (spendTxid.empty()) {
                            // Der Coin liegt noch unverbraucht auf der Adresse
                            if (!outKey.empty()) {
                                GNode* n = addAddrNode(outKey, item.depth);
                                if (n) {
                                    n->notFollowed = !knownUnspent;
                                    if (knownUnspent && n->label.empty()) {
                                        n->label = tr(L"not spent yet", L"noch nicht ausgegeben");
                                        n->labelSource = L"chainer";
                                    }
                                }
                            }
                            continue;
                        }
                        const NetTx* next = loadTx(spendTxid);
                        if (!next) continue;
                        NetTx copy = *next;
                        if (!visitedTx.count(copy.txid)) {
                            addTx(copy, item.depth + 1);
                            visitedTx.insert(copy.txid);
                        }
                        int taken = 0;
                        for (const NetTxOut& o : copy.outputs) {
                            if (taken >= maxAddrPerTx) break;
                            if (o.value < minValue) continue;
                            if (!o.address.empty() && o.address == outKey) continue;
                            taken++;
                            Item nit;
                            nit.isOutput = true;
                            nit.txid = copy.txid;
                            nit.vout = o.n;
                            nit.depth = item.depth + 2;
                            queue.push_back(nit);
                        }
                        continue;
                    }

                    // --- Adressbasiert ----------------------------------------
                    if (visitedAddr.count(item.address)) continue;
                    visitedAddr.insert(item.address);
                    GNode* an = addAddrNode(item.address, item.depth);
                    if (!an) continue;
                    if (item.depth >= maxDepth) {
                        an->notFollowed = true;
                        continue;
                    }

                    setPhase(*ctx, L"expanding",
                             L"Hop " + std::to_wstring(item.depth) + L"/" + std::to_wstring(maxDepth) +
                                 L" · " + shortHash(item.address, 8));

                    std::wstring err;
                    std::vector<NetTx> txs =
                        netFetchAddressTxs(chain, item.address, maxTxPerAddr, keys, &err);
                    ctx->calls = (int)netRequestCount();
                    if (ctx->cancel) return;

                    double received = 0, sent = 0;
                    int used = 0;
                    for (const NetTx& tx : txs) {
                        txCache[tx.txid] = tx;
                        bool asInput = false, asOutput = false;
                        for (const NetTxIn& in : tx.inputs)
                            if (in.address == item.address) {
                                asInput = true;
                                sent += in.value;
                            }
                        for (const NetTxOut& o : tx.outputs)
                            if (o.address == item.address) {
                                asOutput = true;
                                received += o.value;
                            }
                        // Nur Transaktionen, die zur Richtung passen
                        if (item.direction == 0 && !asInput) continue;
                        if (item.direction == 1 && !asOutput) continue;
                        if (!asInput && !asOutput) continue;
                        if (used++ >= maxTxPerAddr) {
                            an = &t.nodes[nodeIndex[L"a:" + item.address]];
                            an->notFollowed = true;
                            break;
                        }
                        if (visitedTx.count(tx.txid)) continue;
                        visitedTx.insert(tx.txid);

                        Wiring w = addTx(tx, item.depth + 1);
                        if (item.direction == 2) {
                            enqueueAddresses(w.outputs, item.depth + 2, 2, tx, true);
                            enqueueAddresses(w.inputs, item.depth + 2, 2, tx, false);
                        } else if (item.direction == 0 && asInput) {
                            enqueueAddresses(w.outputs, item.depth + 2, 0, tx, true);
                        } else if (item.direction == 1 && asOutput) {
                            enqueueAddresses(w.inputs, item.depth + 2, 1, tx, false);
                        }
                    }

                    // Salden eintragen
                    {
                        auto it = nodeIndex.find(L"a:" + item.address);
                        if (it != nodeIndex.end()) {
                            t.nodes[it->second].receivedSat = received;
                            t.nodes[it->second].sentSat = sent;
                        }
                    }

                    // Cluster: gemeinsame Eingänge gehören derselben Wallet
                    for (const NetTx& tx : txs) {
                        if (tx.inputs.size() < 2) continue;
                        bool mine = false;
                        for (const NetTxIn& in : tx.inputs)
                            if (in.address == item.address) mine = true;
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
                if (!queue.empty()) t.truncated = true;
                if (ctx->cancel) return;

                // --- Salden der Knoten aus dem Graphen ergänzen ---------------
                // Adressen, die nur als Gegenseite auftauchen, haben noch keine
                // Zahlen; sie ergeben sich aus den Kanten.
                for (GNode& n : t.nodes) {
                    if (!n.isAddress || n.receivedSat > 0 || n.sentSat > 0) continue;
                    for (const GEdge& e : t.edges) {
                        if (e.to == n.id) n.receivedSat += e.valueSat;
                        if (e.from == n.id) n.sentSat += e.valueSat;
                    }
                }

                // --- Labels ---------------------------------------------------
                if (enrich) {
                    setPhase(*ctx, L"labelling", tr(L"labels", L"Labels"));
                    int done = 0;
                    for (GNode& n : t.nodes) {
                        if (!n.isAddress || n.address == L"coinbase" || done >= 40) continue;
                        if (ctx->cancel) return;
                        done++;
                        std::vector<NetLabel> labels = netFetchLabels(chain, n.address, keys, nullptr);
                        ctx->calls = (int)netRequestCount();
                        if (labels.empty()) continue;
                        std::wstring mainLabel, mainSource;
                        bool harmful = false;
                        n.risk = riskFromLabels(labels, &mainLabel, &mainSource, &harmful, includeMedium);
                        if (n.label.empty() || n.labelSource == L"chainer") {
                            n.label = mainLabel;
                            n.labelSource = mainSource;
                        }
                        n.extraLabels = (int)labels.size() - 1;
                        n.isRiskSource = harmful;
                    }
                }

                // --- Taint ab dem Startpunkt ----------------------------------
                setPhase(*ctx, L"taint", tr(L"taint analysis", L"Taint-Analyse"));
                t.taintedOutSat = propagateTaint(t.nodes, t.edges, startIds, model);
                t.taintModel = model;

                // --- Herkunft: Geld von schädlichen Adressen ------------------
                setPhase(*ctx, L"heuristics", tr(L"origin", L"Herkunft"));
                {
                    std::map<std::wstring, double> outSum;
                    for (const GEdge& e : t.edges) outSum[e.from] += e.valueSat;

                    std::map<std::wstring, double> riskSeeds;
                    for (const GNode& n : t.nodes) {
                        if (!n.isAddress || !n.isRiskSource) continue;
                        double outflow = outSum.count(n.id) ? outSum[n.id] : 0.0;
                        t.riskSources++;
                        if (outflow > 0) riskSeeds[n.id] = outflow;
                    }

                    if (!riskSeeds.empty()) {
                        TaintModel riskModel = model == TaintModel::None ? TaintModel::Haircut : model;
                        FlowResult flow = propagateFlow(t.nodes, t.edges, riskSeeds, riskModel, true);
                        for (size_t i = 0; i < t.edges.size(); i++) {
                            t.edges[i].riskSat = flow.edgeAmount[i];
                            t.edges[i].risky = flow.edgeAmount[i] > 0;
                        }
                        for (GNode& n : t.nodes) {
                            if (!n.isAddress) continue;
                            double amount = flow.nodeAmount.count(n.id) ? flow.nodeAmount[n.id] : 0.0;
                            if (amount <= 0) continue;
                            n.riskFromSat = amount;
                            n.riskFromRatio =
                                n.receivedSat > 0 ? (std::min)(1.0, amount / n.receivedSat) : 1.0;
                            auto it = flow.nodeSources.find(n.id);
                            if (it != flow.nodeSources.end())
                                for (const std::wstring& src : it->second)
                                    n.riskSources.push_back(src.substr(2));
                            if (!n.isRiskSource) t.riskAffected++;
                        }
                        t.riskInflowSat = flow.totalOut;

                        // Transaktionen kennzeichnen, die belastetes Geld bewegen
                        for (GNode& n : t.nodes) {
                            if (n.isAddress) continue;
                            for (const GEdge& e : t.edges)
                                if (e.to == n.id && e.riskSat > 0) n.carriesRisk = true;
                        }

                        // Was ging direkt an eine schädliche Adresse?
                        std::set<std::wstring> riskIds;
                        for (const GNode& n : t.nodes)
                            if (n.isRiskSource) riskIds.insert(n.id);
                        for (const GNode& tx : t.nodes) {
                            if (tx.isAddress) continue;
                            double paidToRisk = 0;
                            for (const GEdge& e : t.edges)
                                if (e.from == tx.id && riskIds.count(e.to)) paidToRisk += e.valueSat;
                            if (paidToRisk <= 0) continue;
                            for (const GEdge& e : t.edges) {
                                if (e.to != tx.id) continue;
                                auto it = nodeIndex.find(e.from);
                                if (it == nodeIndex.end()) continue;
                                GNode& src = t.nodes[it->second];
                                if (!src.isAddress) continue;
                                src.sentToRiskSat += (std::min)(e.valueSat, paidToRisk);
                            }
                        }
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
                std::map<std::wstring, int> usedHosts;
                for (const EvidenceEntry& e : t.evidence) {
                    size_t a1 = e.url.find(L"://");
                    if (a1 == std::wstring::npos) continue;
                    size_t a2 = e.url.find(L'/', a1 + 3);
                    std::wstring host =
                        e.url.substr(a1 + 3, (a2 == std::wstring::npos ? e.url.size() : a2) - a1 - 3);
                    usedHosts[host]++;
                }
                for (auto& kv : usedHosts)
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
