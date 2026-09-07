// ---------------------------------------------------------------------------
// providers.h - Echte Datenquellen.
//
// Portiert die Anbieter aus `src/lib/providers` auf WinHTTP: Esplora
// (mempool.space, Blockstream, litecoinspace), Blockchair, BlockCypher,
// Blockscout, Etherscan, TronGrid, CoinGecko sowie die Label- und Risikolisten.
//
// Alle Funktionen blockieren und gehören deshalb in einen Hintergrundauftrag
// (`taskRun`), nie in den Oberflächen-Thread.
// ---------------------------------------------------------------------------
#pragma once
#include <string>
#include <vector>

// --- Zugangsdaten des Anwenders -------------------------------------------
// Werden in den Einstellungen eingegeben und lokal gespeichert (mit DPAPI
// verschlüsselt, siehe store.cpp).
struct ProviderKeys {
    std::wstring blockcypher;      // BlockCypher-Token
    std::wstring blockchair;       // Blockchair-Key
    std::wstring etherscan;        // Etherscan-V2-Key (gilt für alle EVM-Ketten)
    std::wstring trongrid;         // TronGrid-Key
    std::wstring chainabuse;       // Chainabuse-Key
    std::wstring whoswho;          // Bitcoin-Who's-Who-Key
    std::wstring blockscoutBase;   // eigene Blockscout-Instanz (optional)
    bool has(const std::wstring& id) const;
};

// --- Ergebnisse ------------------------------------------------------------
struct NetAddress {
    bool ok = false;
    std::wstring error;
    std::wstring address, provider;
    double balance = 0, received = 0, sent = 0;   // kleinste Einheit der Chain
    long long txCount = 0;
};

struct NetTxIn {
    std::wstring txid, address;
    double value = 0;
    int vout = -1;
    bool coinbase = false;
};

struct NetTxOut {
    int n = 0;
    std::wstring address, spentTxid, scriptType;
    double value = 0;
    bool spent = false;
};

struct NetTx {
    bool ok = false;
    std::wstring error;
    std::wstring txid, provider;
    long long blockHeight = 0, blockTime = 0, size = 0;
    double fee = 0;
    bool confirmed = false, failed = false;
    std::vector<NetTxIn> inputs;
    std::vector<NetTxOut> outputs;
    double totalOut() const;
};

struct NetLabel {
    std::wstring source, label, category, risk, details, url;
    bool own = false;
};

struct PingInfo {
    bool ok = false;
    long long ms = 0;
    std::wstring error;
};

// --- Eingaben erkennen -----------------------------------------------------
bool isChainAddress(const std::wstring& v, int chain);
bool isChainTxid(const std::wstring& v, int chain);
int guessChain(const std::wstring& v);            // -1 = unbekannt
int classifyInput(const std::wstring& v, int chain);   // 0 unbekannt, 1 Adresse, 2 Txid

// --- Abfragen (blockierend) ------------------------------------------------
NetAddress netFetchAddress(int chain, const std::wstring& addr, const ProviderKeys& k);
std::vector<NetTx> netFetchAddressTxs(int chain, const std::wstring& addr, int limit,
                                      const ProviderKeys& k, std::wstring* error);
NetTx netFetchTx(int chain, const std::wstring& txid, const ProviderKeys& k);

// Wohin wurde jeder Ausgang einer Transaktion weitergegeben? Index = Ausgangsnummer.
struct NetOutspend {
    bool spent = false;
    std::wstring txid;   // ausgebende Transaktion
    int vin = -1;
};
std::vector<NetOutspend> netFetchOutspends(int chain, const std::wstring& txid, const ProviderKeys& k);
bool netFetchPrice(int chain, double* eur, double* usd, std::wstring* source);
std::vector<NetLabel> netFetchLabels(int chain, const std::wstring& addr, const ProviderKeys& k,
                                     std::vector<std::wstring>* unreachable);
PingInfo netPing(const std::wstring& providerId, int chain, const ProviderKeys& k);

// Welche Anbieter kommen für eine Kette in Frage (Reihenfolge = Vorrang)?
std::vector<std::wstring> netProvidersFor(int chain);
// Zählt die Netzanfragen seit Programmstart (für die Trace-Statistik).
long long netRequestCount();
void netResetRequestCount();
