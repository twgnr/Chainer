// ---------------------------------------------------------------------------
// demo.cpp - Die Liste der Datenquellen und der leere Anfangszustand.
//
// Die Anwendung erfindet keine Blockchain-Daten. Beim ersten Start ist alles
// leer; die Zahlen kommen aus den Quellen (providers.cpp), die Labels vom
// Anwender. Hier steht nur, welche Quellen es gibt und was sie brauchen.
// ---------------------------------------------------------------------------
#include "app.h"

// ---------------------------------------------------------------------------
static void demoProviders(App& a) {
    a.providers = {
        {L"mempool",        L"mempool.space",               L"https://mempool.space",        true,  1, L"none",         L"~10/min",              true},
        {L"blockstream",    L"Blockstream Esplora",         L"https://blockstream.info",     true,  1, L"none",         L"~10/min",              true},
        {L"litecoinspace",  L"litecoinspace.org",           L"https://litecoinspace.org",    true,  1, L"none",         L"~10/min",              true},
        {L"blockchain",     L"Blockchain.com",              L"https://blockchain.com",       true,  1, L"none",         L"~30/min",              true},
        {L"blockcypher",    L"BlockCypher",                 L"https://blockcypher.com",      true,  4, L"optional",     tr(L"3/s, 200/h without a key", L"3/s, 200/h ohne Key"),  true},
        {L"blockchair",     L"Blockchair",                  L"https://blockchair.com",       true,  4, L"optional",     tr(L"1440/day without a key", L"1440/Tag ohne Key"),    true},
        {L"blockscout",     L"Blockscout",                  L"https://blockscout.com",       true,  3, L"none",         L"~10/s",                true},
        {L"etherscan",      L"Etherscan",                   L"https://etherscan.io",         true,  4, L"missing",      tr(L"5/s with a key", L"5/s mit Key"),          false},
        {L"trongrid",       L"TronGrid",                    L"https://trongrid.io",          true,  1, L"optional",     L"15/s",                 true},
        {L"bitcoinrpc",     L"Bitcoin Core (eigener Knoten)", L"https://bitcoincore.org",    true,  1, L"unconfigured", L"–",                    false},
        {L"electrum",       L"Electrum-Server (eigener)",   L"https://electrum.org",         true,  1, L"unconfigured", L"–",                    false},
        {L"ofac",           L"OFAC-Sanktionsliste",         L"https://sanctionssearch.ofac.treas.gov", false, 0, L"none", tr(L"list, daily", L"Liste, täglich"),   true},
        {L"ransomwhere",    L"Ransomwhere",                 L"https://ransomwhe.re",         false, 0, L"none",         tr(L"list, daily", L"Liste, täglich"),      true},
        {L"tagpacks",       L"GraphSense-TagPacks",         L"https://github.com/graphsense", false, 0, L"none",         tr(L"list, weekly", L"Liste, wöchentlich"),  true},
        {L"walletexplorer", L"WalletExplorer",              L"https://www.walletexplorer.com", false, 1, L"none",       L"~1/s",                 true},
        {L"cryptoscamdb",   L"CryptoScamDB",                L"https://cryptoscamdb.org",     false, 0, L"none",         L"~1/s",                 true},
        {L"chainabuse",     L"Chainabuse",                  L"https://chainabuse.com",       false, 0, L"missing",      tr(L"with a key", L"mit Key"),              false},
        {L"whoswho",        L"Bitcoin Who's Who",           L"https://bitcoinwhoswho.com",   false, 1, L"optional",     tr(L"100/day", L"100/Tag"),              true},
        {L"stablecoin",     L"Stablecoin-Sperrlisten",      L"https://tether.to",            false, 3, L"none",         L"on-chain",             true},
        {L"annotations",    L"Eigene Labels & Notizen",     L"",                             false, 0, L"none",         L"–",                    true},
    };
}

void loadDemoData(App& a) {
    demoProviders(a);
    a.cases.clear();
    a.watches.clear();
    a.annotations.clear();
    a.screenResults.clear();
    a.jobs.clear();
    a.trace = TraceData();
    a.traceHasResult = false;
    a.pathResults.clear();
    a.pathHasResult = false;
    a.btcPrice = 0;
    a.priceEur = a.priceUsd = 0;
    a.priceSource.clear();
}
