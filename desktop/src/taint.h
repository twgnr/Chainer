// ---------------------------------------------------------------------------
// taint.h - Flussverfolgung im Graphen.
//
// Portierung von `src/lib/trace/taint.ts`. Verteilt Beträge von Quellknoten
// über die Transaktionen weiter und wird für zwei Zwecke genutzt:
//
//   1. Taint-Analyse ab dem Startpunkt der Untersuchung.
//   2. Herkunfts-Warnung ab allen als schädlich gemeldeten Adressen.
//
// Modelle:
//   haircut  Jeder Ausgang erbt den Anteil der gesamten Transaktion.
//            Konservativ und weit verbreitet, verwässert über viele Hops.
//   poison   Sobald eine Transaktion belastetes Geld enthält, gelten alle
//            Ausgänge als vollständig belastet. Sehr streng.
//   fifo     „first in, first out“ – Eingänge werden der Reihe nach den
//            Ausgängen zugeordnet (Clayton's Case).
// ---------------------------------------------------------------------------
#pragma once
#include <map>
#include <set>
#include <string>
#include <vector>

struct GNode;
struct GEdge;

enum class TaintModel { Haircut = 0, Fifo = 1, Poison = 2, None = 3 };

struct FlowResult {
    std::vector<double> edgeAmount;                              // je Kantenindex
    std::map<std::wstring, double> nodeAmount;                   // Adressknoten -> Zufluss
    std::map<std::wstring, std::set<std::wstring>> nodeSources;  // Adressknoten -> Herkunft
    double totalOut = 0;                                         // liegt an Endpunkten
};

// `seeds`: Knoten-Id -> Betrag, der von dort ausgehen darf.
FlowResult propagateFlow(const std::vector<GNode>& nodes, const std::vector<GEdge>& edges,
                         const std::map<std::wstring, double>& seeds, TaintModel model,
                         bool trackSources);

// Taint ab dem Startpunkt; schreibt das Ergebnis in Knoten und Kanten.
double propagateTaint(std::vector<GNode>& nodes, std::vector<GEdge>& edges,
                      const std::vector<std::wstring>& startIds, TaintModel model);
