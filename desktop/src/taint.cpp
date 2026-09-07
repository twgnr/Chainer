// ---------------------------------------------------------------------------
// taint.cpp - Flussverfolgung, Portierung von src/lib/trace/taint.ts.
// ---------------------------------------------------------------------------
#include "app.h"
#include "taint.h"
#include <algorithm>
#include <cmath>

namespace {
const size_t MAX_SOURCES = 8;

void mergeSources(std::set<std::wstring>& target, const std::set<std::wstring>& from) {
    for (const std::wstring& s : from) {
        if (target.size() >= MAX_SOURCES) return;
        target.insert(s);
    }
}
}  // namespace

FlowResult propagateFlow(const std::vector<GNode>& nodes, const std::vector<GEdge>& edges,
                         const std::map<std::wstring, double>& seeds, TaintModel model,
                         bool trackSources) {
    FlowResult result;
    result.edgeAmount.assign(edges.size(), 0.0);
    if (seeds.empty() || edges.empty()) return result;

    // Kanten nach Quelle und Ziel vorsortieren
    std::map<std::wstring, std::vector<size_t>> inEdges, outEdges;
    for (size_t i = 0; i < edges.size(); i++) {
        outEdges[edges[i].from].push_back(i);
        inEdges[edges[i].to].push_back(i);
    }

    // Noch nicht weitergegebener belasteter Betrag je Knoten
    std::map<std::wstring, double> available = seeds;
    std::map<std::wstring, std::set<std::wstring>> availableSources;
    if (trackSources)
        for (const auto& kv : seeds) availableSources[kv.first] = {kv.first};

    // Transaktionen chronologisch abarbeiten; ohne Zeitstempel nach Tiefe
    std::vector<const GNode*> txNodes;
    for (const GNode& n : nodes)
        if (!n.isAddress) txNodes.push_back(&n);
    std::sort(txNodes.begin(), txNodes.end(), [](const GNode* a, const GNode* b) {
        long long ta = a->blockTime ? a->blockTime : 0x7fffffffffffffffLL;
        long long tb = b->blockTime ? b->blockTime : 0x7fffffffffffffffLL;
        if (ta != tb) return ta < tb;
        return a->depth < b->depth;
    });

    std::set<std::wstring> seedTxIds;
    for (const auto& kv : seeds)
        if (kv.first.compare(0, 2, L"t:") == 0) seedTxIds.insert(kv.first);

    for (const GNode* tx : txNodes) {
        auto itIn = inEdges.find(tx->id);
        auto itOut = outEdges.find(tx->id);
        if (itOut == outEdges.end() || itOut->second.empty()) continue;
        static const std::vector<size_t> noEdges;
        const std::vector<size_t>& ins = itIn != inEdges.end() ? itIn->second : noEdges;
        std::vector<size_t> outs = itOut->second;
        std::sort(outs.begin(), outs.end());   // Ausgänge in Erzeugungsreihenfolge

        // Ist die Transaktion selbst Quelle, gelten alle ihre Ausgänge als belastet
        if (seedTxIds.count(tx->id)) {
            for (size_t e : outs) {
                result.edgeAmount[e] = edges[e].valueSat;
                available[edges[e].to] += edges[e].valueSat;
                if (trackSources) availableSources[edges[e].to].insert(tx->id);
            }
            continue;
        }

        // Belasteten Anteil aus den Eingängen einsammeln
        std::set<std::wstring> txSources;
        for (size_t e : ins) {
            double avail = available.count(edges[e].from) ? available[edges[e].from] : 0.0;
            if (avail <= 0) continue;
            double take = (std::min)(avail, edges[e].valueSat);
            result.edgeAmount[e] += take;
            available[edges[e].from] = avail - take;
            if (trackSources) {
                auto it = availableSources.find(edges[e].from);
                if (it != availableSources.end()) mergeSources(txSources, it->second);
            }
        }
        double amountIn = 0, totalIn = 0, totalOut = 0;
        for (size_t e : ins) {
            amountIn += result.edgeAmount[e];
            totalIn += edges[e].valueSat;
        }
        for (size_t e : outs) totalOut += edges[e].valueSat;
        if (amountIn <= 0) continue;
        if (totalIn <= 0) totalIn = amountIn;
        if (totalOut <= 0) continue;

        if (model == TaintModel::Poison) {
            for (size_t e : outs) result.edgeAmount[e] = edges[e].valueSat;
        } else if (model == TaintModel::Haircut) {
            double ratio = (std::min)(1.0, amountIn / totalIn);
            for (size_t e : outs) result.edgeAmount[e] = std::floor(edges[e].valueSat * ratio + 0.5);
        } else {
            // FIFO: Eingänge der Reihe nach auf die Ausgänge abbilden
            struct Chunk { bool loaded; double left; };
            std::vector<Chunk> flat;
            for (size_t e : ins) {
                double t = result.edgeAmount[e];
                if (t > 0) flat.push_back({true, t});
                if (edges[e].valueSat - t > 0) flat.push_back({false, edges[e].valueSat - t});
            }
            size_t idx = 0;
            for (size_t e : outs) {
                double need = edges[e].valueSat;
                double loaded = 0;
                while (need > 0 && idx < flat.size()) {
                    double chunk = (std::min)(need, flat[idx].left);
                    if (flat[idx].loaded) loaded += chunk;
                    flat[idx].left -= chunk;
                    need -= chunk;
                    if (flat[idx].left <= 0) idx++;
                }
                result.edgeAmount[e] = loaded;
            }
        }

        for (size_t e : outs) {
            double amount = result.edgeAmount[e];
            if (amount <= 0) continue;
            available[edges[e].to] += amount;
            if (trackSources && !txSources.empty())
                mergeSources(availableSources[edges[e].to], txSources);
        }
    }

    // Ergebnis je Adressknoten zusammenfassen
    for (const GNode& n : nodes) {
        if (!n.isAddress) continue;
        double incoming = 0, spentOn = 0;
        auto itIn = inEdges.find(n.id);
        if (itIn != inEdges.end())
            for (size_t e : itIn->second) incoming += result.edgeAmount[e];
        auto itOut = outEdges.find(n.id);
        if (itOut != outEdges.end())
            for (size_t e : itOut->second) spentOn += result.edgeAmount[e];
        result.nodeAmount[n.id] = incoming;
        if (trackSources) {
            auto it = availableSources.find(n.id);
            if (it != availableSources.end()) {
                std::set<std::wstring> src;
                // Der Quellknoten selbst gilt nicht als eigene Herkunft
                for (const std::wstring& s : it->second)
                    if (s != n.id) src.insert(s);
                result.nodeSources[n.id] = src;
            }
        }
        if (!seeds.count(n.id)) result.totalOut += (std::max)(0.0, incoming - spentOn);
    }
    return result;
}

double propagateTaint(std::vector<GNode>& nodes, std::vector<GEdge>& edges,
                      const std::vector<std::wstring>& startIds, TaintModel model) {
    for (GEdge& e : edges) e.taintSat = 0;
    for (GNode& n : nodes) {
        n.taintSat = 0;
        n.taintRatio = 0;
    }
    if (model == TaintModel::None || startIds.empty()) return 0;

    std::map<std::wstring, double> outSum;
    for (const GEdge& e : edges) outSum[e.from] += e.valueSat;

    std::map<std::wstring, double> seeds;
    for (const std::wstring& id : startIds) {
        const GNode* node = nullptr;
        for (const GNode& n : nodes)
            if (n.id == id) node = &n;
        if (!node) continue;
        double out = outSum.count(id) ? outSum[id] : 0.0;
        double own = node->isAddress ? (std::max)(node->sentSat, out) : node->totalOutSat;
        seeds[id] = (std::max)(out, own);
    }
    if (seeds.empty()) return 0;

    FlowResult flow = propagateFlow(nodes, edges, seeds, model, false);
    for (size_t i = 0; i < edges.size(); i++) edges[i].taintSat = flow.edgeAmount[i];

    for (GNode& n : nodes) {
        if (!n.isAddress) continue;
        double incoming = flow.nodeAmount.count(n.id) ? flow.nodeAmount[n.id] : 0.0;
        bool isStart = std::find(startIds.begin(), startIds.end(), n.id) != startIds.end();
        n.taintSat = isStart ? (std::max)(n.sentSat, n.receivedSat) : incoming;
        n.taintRatio = n.receivedSat > 0 ? (std::min)(1.0, incoming / n.receivedSat) : (isStart ? 1.0 : 0.0);
    }
    return flow.totalOut;
}
