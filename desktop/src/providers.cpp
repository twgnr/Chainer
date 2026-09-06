// ---------------------------------------------------------------------------
// providers.cpp - Die Datenquellen.
//
// Aufbau wie in der Web-Fassung: pro Kette eine Reihenfolge von Anbietern, der
// erste erreichbare gewinnt. Eigene Zugangsdaten schalten zusätzliche Quellen
// frei (Etherscan) oder heben die Grenzen an (BlockCypher, Blockchair).
// ---------------------------------------------------------------------------
#include "providers.h"
#include "net.h"
#include "store.h"
#include "gfx.h"
#include <windows.h>
#include <shlobj.h>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cwctype>
#include <functional>
#include <map>
#include <mutex>
#include <ctime>

// ---------------------------------------------------------------------------
// Kettenkennungen (Reihenfolge wie in app.h / chains.ts)
// ---------------------------------------------------------------------------
enum Chain { BTC = 0, LTC = 1, DOGE = 2, BCH = 3, ETH = 4, POL = 5, ARB = 6, TRX = 7 };

static bool isEvm(int c) { return c == ETH || c == POL || c == ARB; }
static bool isUtxo(int c) { return c == BTC || c == LTC || c == DOGE || c == BCH; }

static int evmChainId(int c) { return c == ETH ? 1 : c == POL ? 137 : 42161; }

static const wchar_t* blockscoutBase(int c) {
    if (c == ETH) return L"https://eth.blockscout.com/api/v2";
    if (c == POL) return L"https://polygon.blockscout.com/api/v2";
    if (c == ARB) return L"https://arbitrum.blockscout.com/api/v2";
    return nullptr;
}

static const wchar_t* blockchairPath(int c) {
    switch (c) {
    case BTC: return L"bitcoin";
    case LTC: return L"litecoin";
    case DOGE: return L"dogecoin";
    case BCH: return L"bitcoin-cash";
    default: return nullptr;
    }
}

static const wchar_t* blockcypherPath(int c) {
    switch (c) {
    case BTC: return L"btc";
    case LTC: return L"ltc";
    case DOGE: return L"doge";
    default: return nullptr;   // BCH bedient BlockCypher nicht mehr
    }
}

static const wchar_t* esploraBase(int c) {
    if (c == BTC) return L"https://mempool.space/api";
    if (c == LTC) return L"https://litecoinspace.org/api";
    return nullptr;
}
static const wchar_t* esploraBase2(int c) {
    if (c == BTC) return L"https://blockstream.info/api";
    return nullptr;
}

static const wchar_t* coingeckoId(int c) {
    switch (c) {
    case BTC: return L"bitcoin";
    case LTC: return L"litecoin";
    case DOGE: return L"dogecoin";
    case BCH: return L"bitcoin-cash";
    case ETH: return L"ethereum";
    case POL: return L"matic-network";
    case ARB: return L"ethereum";
    case TRX: return L"tron";
    }
    return L"bitcoin";
}

bool ProviderKeys::has(const std::wstring& id) const {
    if (id == L"blockcypher") return !blockcypher.empty();
    if (id == L"blockchair") return !blockchair.empty();
    if (id == L"etherscan") return !etherscan.empty();
    if (id == L"trongrid") return !trongrid.empty();
    if (id == L"chainabuse") return !chainabuse.empty();
    if (id == L"bitcoinwhoswho") return !whoswho.empty();
    return false;
}

double NetTx::totalOut() const {
    double sum = 0;
    for (const NetTxOut& o : outputs) sum += o.value;
    return sum;
}

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------
static std::atomic<long long> g_requests{0};
long long netRequestCount() { return g_requests.load(); }
void netResetRequestCount() { g_requests = 0; }

static HttpResult get(const std::wstring& url, int timeoutMs = 20000) {
    g_requests++;
    return httpGet(url, timeoutMs);
}

static bool getJson(const std::wstring& url, Json& out, std::wstring* err, int timeoutMs = 20000) {
    HttpResult r = get(url, timeoutMs);
    if (!r.ok) {
        if (err) *err = r.error.empty() ? L"Anfrage fehlgeschlagen" : r.error;
        return false;
    }
    if (!jsonParse(r.body, out)) {
        if (err) *err = L"Unerwartete Antwort";
        return false;
    }
    return true;
}

static std::wstring trimmed(const std::wstring& s) {
    size_t a = s.find_first_not_of(L" \t\r\n");
    if (a == std::wstring::npos) return L"";
    size_t b = s.find_last_not_of(L" \t\r\n");
    return s.substr(a, b - a + 1);
}

static std::wstring lower(std::wstring s) {
    for (auto& c : s) c = (wchar_t)towlower(c);
    return s;
}

// Dezimalzeichenkette (auch sehr groß, z. B. Wei) als Gleitkommazahl.
static double parseBigDecimal(const std::wstring& s) {
    double v = 0;
    for (wchar_t c : s) {
        if (c < L'0' || c > L'9') {
            if (c == L'-') return -parseBigDecimal(s.substr(1));
            break;
        }
        v = v * 10.0 + (double)(c - L'0');
    }
    return v;
}

// Zahl aus einem JSON-Feld, das je nach Anbieter Zahl oder Zeichenkette ist.
static double numOrStr(const Json* j) {
    if (!j) return 0;
    if (j->t == Json::T::Num) return j->num;
    if (j->t == Json::T::Str) return parseBigDecimal(j->str);
    return 0;
}
static double fieldNum(const Json& o, const std::wstring& key) { return numOrStr(o.find(key)); }

// ISO-8601 ("2024-03-12T14:22:05.000000Z") -> Unix-Sekunden
static long long isoToUnix(const std::wstring& iso) {
    if (iso.size() < 19) return 0;
    tm t{};
    t.tm_year = _wtoi(iso.substr(0, 4).c_str()) - 1900;
    t.tm_mon = _wtoi(iso.substr(5, 2).c_str()) - 1;
    t.tm_mday = _wtoi(iso.substr(8, 2).c_str());
    t.tm_hour = _wtoi(iso.substr(11, 2).c_str());
    t.tm_min = _wtoi(iso.substr(14, 2).c_str());
    t.tm_sec = _wtoi(iso.substr(17, 2).c_str());
    return (long long)_mkgmtime(&t);
}

// "2024-03-12 14:22:05" (Blockchair) -> Unix-Sekunden
static long long sqlToUnix(const std::wstring& s) {
    if (s.size() < 19) return 0;
    std::wstring iso = s;
    iso[10] = L'T';
    return isoToUnix(iso);
}

// ---------------------------------------------------------------------------
// Eingaben erkennen (Spiegel von chains.ts)
// ---------------------------------------------------------------------------
static bool allOf(const std::wstring& s, size_t from, const wchar_t* set) {
    for (size_t i = from; i < s.size(); i++)
        if (!wcschr(set, s[i])) return false;
    return true;
}

static bool isHex(const std::wstring& s, size_t from, size_t len) {
    if (s.size() != from + len) return false;
    return allOf(s, from, L"0123456789abcdefABCDEF");
}

// Base58 ohne 0, O, I, l
static const wchar_t* B58 = L"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
static const wchar_t* BECH32 = L"qpzry9x8gf2tvdw0s3jn54khce6mua7l";

static bool base58Addr(const std::wstring& v, const wchar_t* prefixes) {
    if (v.size() < 26 || v.size() > 35) return false;
    if (!wcschr(prefixes, v[0])) return false;
    return allOf(v, 1, B58);
}

static bool bech32Addr(const std::wstring& v, const std::wstring& hrp) {
    std::wstring lo = lower(v);
    if (lo.compare(0, hrp.size(), hrp) != 0) return false;
    if (lo.size() < hrp.size() + 26 || lo.size() > hrp.size() + 88) return false;
    if (lo[hrp.size()] != L'1') return false;
    return allOf(lo, hrp.size() + 1, BECH32);
}

bool isChainAddress(const std::wstring& value, int chain) {
    std::wstring v = trimmed(value);
    if (v.empty()) return false;
    switch (chain) {
    case BTC: return base58Addr(v, L"13") || bech32Addr(v, L"bc");
    case LTC: return base58Addr(v, L"LM3") || bech32Addr(v, L"ltc");
    case DOGE: return base58Addr(v, L"DA9");
    case BCH: {
        std::wstring body = v;
        if (lower(v).compare(0, 12, L"bitcoincash:") == 0) body = v.substr(12);
        if ((body.size() >= 39 && body.size() <= 61) && (body[0] == L'q' || body[0] == L'p') &&
            allOf(lower(body), 1, L"0123456789abcdefghijklmnopqrstuvwxyz"))
            return true;
        return base58Addr(v, L"13");
    }
    case ETH:
    case POL:
    case ARB:
        return v.size() == 42 && v[0] == L'0' && (v[1] == L'x' || v[1] == L'X') && isHex(v, 2, 40);
    case TRX:
        return v.size() == 34 && v[0] == L'T' && allOf(v, 1, B58);
    }
    return false;
}

bool isChainTxid(const std::wstring& value, int chain) {
    std::wstring v = trimmed(value);
    if (isEvm(chain))
        return v.size() == 66 && v[0] == L'0' && (v[1] == L'x' || v[1] == L'X') && isHex(v, 2, 64);
    return isHex(v, 0, 64);
}

int classifyInput(const std::wstring& v, int chain) {
    if (isChainTxid(v, chain)) return 2;
    if (isChainAddress(v, chain)) return 1;
    return 0;
}

int guessChain(const std::wstring& value) {
    std::wstring v = trimmed(value);
    if (v.empty()) return -1;
    if (isChainAddress(v, ETH) || isChainTxid(v, ETH)) return ETH;
    if (isChainAddress(v, TRX)) return TRX;
    if (bech32Addr(v, L"bc")) return BTC;
    if (bech32Addr(v, L"ltc")) return LTC;
    if (lower(v).compare(0, 12, L"bitcoincash:") == 0) return BCH;
    if (base58Addr(v, L"DA9") && wcschr(L"DA9", v[0])) return DOGE;
    if (base58Addr(v, L"LM") ) return LTC;
    if (base58Addr(v, L"13")) return BTC;
    if (isHex(v, 0, 64)) return BTC;
    return -1;
}

// ---------------------------------------------------------------------------
// Esplora (mempool.space, Blockstream, litecoinspace)
// ---------------------------------------------------------------------------
static NetTx esploraMapTx(const Json& t, const std::wstring& provider) {
    NetTx tx;
    tx.txid = t.s(L"txid");
    tx.provider = provider;
    tx.size = t.i(L"size");
    tx.fee = fieldNum(t, L"fee");
    if (const Json* st = t.find(L"status")) {
        tx.confirmed = st->flag(L"confirmed");
        tx.blockHeight = st->i(L"block_height");
        tx.blockTime = st->i(L"block_time");
    }
    if (const Json* vin = t.a(L"vin")) {
        for (const Json& v : vin->arr) {
            NetTxIn in;
            in.coinbase = v.flag(L"is_coinbase");
            if (!in.coinbase) {
                in.txid = v.s(L"txid");
                in.vout = (int)v.i(L"vout", -1);
            }
            if (const Json* pv = v.find(L"prevout")) {
                if (pv->t == Json::T::Obj) {
                    in.address = pv->s(L"scriptpubkey_address");
                    in.value = fieldNum(*pv, L"value");
                }
            }
            tx.inputs.push_back(in);
        }
    }
    if (const Json* vout = t.a(L"vout")) {
        int n = 0;
        for (const Json& o : vout->arr) {
            NetTxOut out;
            out.n = n++;
            out.address = o.s(L"scriptpubkey_address");
            out.value = fieldNum(o, L"value");
            out.scriptType = o.s(L"scriptpubkey_type");
            tx.outputs.push_back(out);
        }
    }
    tx.ok = !tx.txid.empty();
    if (!tx.ok) tx.error = L"Unerwartete Antwortstruktur";
    return tx;
}

static NetAddress esploraAddress(const std::wstring& base, const std::wstring& id,
                                 const std::wstring& addr) {
    NetAddress a;
    Json j;
    std::wstring err;
    if (!getJson(base + L"/address/" + urlEncode(addr), j, &err)) {
        a.error = err;
        return a;
    }
    const Json* cs = j.find(L"chain_stats");
    const Json* ms = j.find(L"mempool_stats");
    if (!cs || !ms) {
        a.error = L"Unerwartete Antwortstruktur";
        return a;
    }
    double received = fieldNum(*cs, L"funded_txo_sum") + fieldNum(*ms, L"funded_txo_sum");
    double sent = fieldNum(*cs, L"spent_txo_sum") + fieldNum(*ms, L"spent_txo_sum");
    a.address = j.s(L"address", addr);
    a.received = received;
    a.sent = sent;
    a.balance = received - sent;
    a.txCount = cs->i(L"tx_count") + ms->i(L"tx_count");
    a.provider = id;
    a.ok = true;
    return a;
}

static std::vector<NetTx> esploraAddressTxs(const std::wstring& base, const std::wstring& id,
                                            const std::wstring& addr, int limit, std::wstring* error) {
    std::vector<NetTx> out;
    std::wstring lastSeen;
    while ((int)out.size() < limit) {
        std::wstring url = lastSeen.empty()
                               ? base + L"/address/" + urlEncode(addr) + L"/txs"
                               : base + L"/address/" + urlEncode(addr) + L"/txs/chain/" + lastSeen;
        Json page;
        std::wstring err;
        if (!getJson(url, page, &err)) {
            if (out.empty() && error) *error = err;
            break;
        }
        if (page.t != Json::T::Arr || page.arr.empty()) break;
        int confirmedCount = 0;
        std::wstring lastConfirmed;
        for (const Json& t : page.arr) {
            NetTx tx = esploraMapTx(t, id);
            if (!tx.ok) continue;
            out.push_back(tx);
            if (tx.confirmed) {
                confirmedCount++;
                lastConfirmed = tx.txid;
            }
        }
        if (page.arr.size() < 25 || !confirmedCount) break;
        lastSeen = lastConfirmed;
    }
    if ((int)out.size() > limit) out.resize((size_t)limit);
    return out;
}

// Für die ersten Transaktionen nachtragen, wohin die Ausgänge geflossen sind.
static void esploraOutspends(const std::wstring& base, std::vector<NetTx>& txs, int howMany) {
    int done = 0;
    for (NetTx& tx : txs) {
        if (done++ >= howMany) break;
        Json j;
        if (!getJson(base + L"/tx/" + tx.txid + L"/outspends", j, nullptr, 12000)) continue;
        if (j.t != Json::T::Arr) continue;
        for (size_t i = 0; i < j.arr.size() && i < tx.outputs.size(); i++) {
            tx.outputs[i].spent = j.arr[i].flag(L"spent");
            tx.outputs[i].spentTxid = j.arr[i].s(L"txid");
        }
    }
}

static NetTx esploraTx(const std::wstring& base, const std::wstring& id, const std::wstring& txid) {
    NetTx tx;
    Json j;
    std::wstring err;
    if (!getJson(base + L"/tx/" + urlEncode(txid), j, &err)) {
        tx.error = err;
        return tx;
    }
    tx = esploraMapTx(j, id);
    if (tx.ok) {
        std::vector<NetTx> one{tx};
        esploraOutspends(base, one, 1);
        tx = one[0];
    }
    return tx;
}

// ---------------------------------------------------------------------------
// Blockchair
// ---------------------------------------------------------------------------
static std::wstring blockchairKeyParam(const ProviderKeys& k) {
    return k.blockchair.empty() ? L"" : L"?key=" + urlEncode(k.blockchair);
}

static NetAddress blockchairAddress(int chain, const std::wstring& addr, const ProviderKeys& k) {
    NetAddress a;
    const wchar_t* path = blockchairPath(chain);
    if (!path) {
        a.error = L"Chain nicht unterstützt";
        return a;
    }
    Json j;
    std::wstring err;
    std::wstring url = std::wstring(L"https://api.blockchair.com/") + path + L"/dashboards/address/" +
                       urlEncode(addr) + blockchairKeyParam(k);
    if (!getJson(url, j, &err)) {
        a.error = err;
        return a;
    }
    const Json* data = j.find(L"data");
    if (!data || data->t != Json::T::Obj || data->obj.empty()) {
        a.error = L"Adresse nicht gefunden";
        return a;
    }
    const Json& entry = data->obj[0].second;
    const Json* info = entry.find(L"address");
    if (!info) {
        a.error = L"Unerwartete Antwortstruktur";
        return a;
    }
    a.address = addr;
    a.received = fieldNum(*info, L"received");
    a.sent = fieldNum(*info, L"spent");
    a.balance = fieldNum(*info, L"balance");
    a.txCount = info->i(L"transaction_count");
    a.provider = L"blockchair";
    a.ok = true;
    return a;
}

static NetTx blockchairMapTx(const Json& d) {
    NetTx tx;
    const Json* t = d.find(L"transaction");
    if (!t) {
        tx.error = L"Unerwartete Antwortstruktur";
        return tx;
    }
    tx.txid = t->s(L"hash");
    tx.provider = L"blockchair";
    tx.size = t->i(L"size");
    tx.fee = fieldNum(*t, L"fee");
    long long block = t->i(L"block_id");
    tx.confirmed = block > 0;
    tx.blockHeight = block > 0 ? block : 0;
    tx.blockTime = sqlToUnix(t->s(L"time"));
    if (const Json* ins = d.a(L"inputs")) {
        for (const Json& i : ins->arr) {
            NetTxIn in;
            in.txid = i.s(L"transaction_hash");
            in.vout = (int)i.i(L"index", -1);
            in.coinbase = i.flag(L"is_from_coinbase");
            in.address = i.s(L"recipient");
            in.value = fieldNum(i, L"value");
            tx.inputs.push_back(in);
        }
    }
    if (const Json* outs = d.a(L"outputs")) {
        for (const Json& o : outs->arr) {
            NetTxOut out;
            out.n = (int)o.i(L"index");
            out.address = o.s(L"recipient");
            out.value = fieldNum(o, L"value");
            out.spent = o.flag(L"is_spent");
            out.spentTxid = o.s(L"spending_transaction_hash");
            out.scriptType = o.s(L"type");
            tx.outputs.push_back(out);
        }
    }
    tx.ok = !tx.txid.empty();
    return tx;
}

static NetTx blockchairTx(int chain, const std::wstring& txid, const ProviderKeys& k) {
    NetTx tx;
    const wchar_t* path = blockchairPath(chain);
    if (!path) {
        tx.error = L"Chain nicht unterstützt";
        return tx;
    }
    Json j;
    std::wstring err;
    std::wstring url = std::wstring(L"https://api.blockchair.com/") + path + L"/dashboards/transaction/" +
                       urlEncode(txid) + blockchairKeyParam(k);
    if (!getJson(url, j, &err)) {
        tx.error = err;
        return tx;
    }
    const Json* data = j.find(L"data");
    if (!data || data->t != Json::T::Obj || data->obj.empty()) {
        tx.error = L"Transaktion nicht gefunden";
        return tx;
    }
    return blockchairMapTx(data->obj[0].second);
}

static std::vector<NetTx> blockchairAddressTxs(int chain, const std::wstring& addr, int limit,
                                               const ProviderKeys& k, std::wstring* error) {
    std::vector<NetTx> out;
    const wchar_t* path = blockchairPath(chain);
    if (!path) {
        if (error) *error = L"Chain nicht unterstützt";
        return out;
    }
    Json j;
    std::wstring err;
    std::wstring url = std::wstring(L"https://api.blockchair.com/") + path + L"/dashboards/address/" +
                       urlEncode(addr) + (k.blockchair.empty() ? L"?" : L"?key=" + urlEncode(k.blockchair) + L"&") +
                       L"limit=" + std::to_wstring((std::min)(limit, 100));
    if (!getJson(url, j, &err)) {
        if (error) *error = err;
        return out;
    }
    const Json* data = j.find(L"data");
    if (!data || data->t != Json::T::Obj || data->obj.empty()) return out;
    const Json* list = data->obj[0].second.a(L"transactions");
    if (!list) return out;
    // Blockchair liefert im Dashboard nur die Hashes; jede Transaktion einzeln
    // nachladen wäre zu teuer, deshalb nur die ersten.
    int take = (std::min)((int)list->arr.size(), (std::min)(limit, 25));
    for (int i = 0; i < take; i++) {
        if (list->arr[(size_t)i].t != Json::T::Str) continue;
        NetTx tx = blockchairTx(chain, list->arr[(size_t)i].str, k);
        if (tx.ok) out.push_back(tx);
    }
    return out;
}

// ---------------------------------------------------------------------------
// BlockCypher
// ---------------------------------------------------------------------------
static std::wstring blockcypherToken(const ProviderKeys& k, bool first) {
    if (k.blockcypher.empty()) return L"";
    return (first ? L"?token=" : L"&token=") + urlEncode(k.blockcypher);
}

static NetAddress blockcypherAddress(int chain, const std::wstring& addr, const ProviderKeys& k) {
    NetAddress a;
    const wchar_t* path = blockcypherPath(chain);
    if (!path) {
        a.error = L"Chain nicht unterstützt";
        return a;
    }
    Json j;
    std::wstring err;
    std::wstring url = std::wstring(L"https://api.blockcypher.com/v1/") + path + L"/main/addrs/" +
                       urlEncode(addr) + L"/balance" + blockcypherToken(k, true);
    if (!getJson(url, j, &err)) {
        a.error = err;
        return a;
    }
    a.address = addr;
    a.balance = fieldNum(j, L"final_balance");
    a.received = fieldNum(j, L"total_received");
    a.sent = fieldNum(j, L"total_sent");
    a.txCount = j.i(L"final_n_tx");
    a.provider = L"blockcypher";
    a.ok = true;
    return a;
}

static NetTx blockcypherMapTx(const Json& t) {
    NetTx tx;
    tx.txid = t.s(L"hash");
    tx.provider = L"blockcypher";
    tx.size = t.i(L"size");
    tx.fee = fieldNum(t, L"fees");
    tx.blockHeight = t.i(L"block_height");
    tx.confirmed = tx.blockHeight > 0;
    tx.blockTime = isoToUnix(t.s(L"confirmed"));
    if (const Json* ins = t.a(L"inputs")) {
        for (const Json& i : ins->arr) {
            NetTxIn in;
            in.txid = i.s(L"prev_hash");
            in.vout = (int)i.i(L"output_index", -1);
            in.value = fieldNum(i, L"output_value");
            in.coinbase = in.txid.empty();
            if (const Json* addrs = i.a(L"addresses"))
                if (!addrs->arr.empty() && addrs->arr[0].t == Json::T::Str) in.address = addrs->arr[0].str;
            tx.inputs.push_back(in);
        }
    }
    if (const Json* outs = t.a(L"outputs")) {
        int n = 0;
        for (const Json& o : outs->arr) {
            NetTxOut out;
            out.n = n++;
            out.value = fieldNum(o, L"value");
            out.scriptType = o.s(L"script_type");
            out.spentTxid = o.s(L"spent_by");
            out.spent = !out.spentTxid.empty();
            if (const Json* addrs = o.a(L"addresses"))
                if (!addrs->arr.empty() && addrs->arr[0].t == Json::T::Str) out.address = addrs->arr[0].str;
            tx.outputs.push_back(out);
        }
    }
    tx.ok = !tx.txid.empty();
    return tx;
}

static NetTx blockcypherTx(int chain, const std::wstring& txid, const ProviderKeys& k) {
    NetTx tx;
    const wchar_t* path = blockcypherPath(chain);
    if (!path) {
        tx.error = L"Chain nicht unterstützt";
        return tx;
    }
    Json j;
    std::wstring err;
    std::wstring url = std::wstring(L"https://api.blockcypher.com/v1/") + path + L"/main/txs/" +
                       urlEncode(txid) + blockcypherToken(k, true);
    if (!getJson(url, j, &err)) {
        tx.error = err;
        return tx;
    }
    return blockcypherMapTx(j);
}

static std::vector<NetTx> blockcypherAddressTxs(int chain, const std::wstring& addr, int limit,
                                                const ProviderKeys& k, std::wstring* error) {
    std::vector<NetTx> out;
    const wchar_t* path = blockcypherPath(chain);
    if (!path) {
        if (error) *error = L"Chain nicht unterstützt";
        return out;
    }
    Json j;
    std::wstring err;
    std::wstring url = std::wstring(L"https://api.blockcypher.com/v1/") + path + L"/main/addrs/" +
                       urlEncode(addr) + L"/full?limit=" + std::to_wstring((std::min)(limit, 50)) +
                       blockcypherToken(k, false);
    if (!getJson(url, j, &err)) {
        if (error) *error = err;
        return out;
    }
    if (const Json* txs = j.a(L"txs")) {
        for (const Json& t : txs->arr) {
            NetTx tx = blockcypherMapTx(t);
            if (tx.ok) out.push_back(tx);
            if ((int)out.size() >= limit) break;
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Blockscout (EVM)
// ---------------------------------------------------------------------------
static std::wstring bsBase(int chain, const ProviderKeys& k) {
    if (!k.blockscoutBase.empty()) {
        std::wstring b = k.blockscoutBase;
        while (!b.empty() && b.back() == L'/') b.pop_back();
        return b;
    }
    const wchar_t* b = blockscoutBase(chain);
    return b ? b : L"";
}

static std::wstring evmAddrOf(const Json& o, const std::wstring& key) {
    const Json* v = o.find(key);
    if (!v) return L"";
    if (v->t == Json::T::Str) return v->str;
    if (v->t == Json::T::Obj) return v->s(L"hash");
    return L"";
}

static NetTx bsMapTx(const Json& t) {
    NetTx tx;
    tx.txid = t.s(L"hash");
    tx.provider = L"blockscout";
    tx.blockHeight = t.i(L"block_number", t.i(L"block"));
    tx.blockTime = isoToUnix(t.s(L"timestamp"));
    tx.confirmed = tx.blockHeight > 0;
    if (const Json* fee = t.find(L"fee")) tx.fee = fieldNum(*fee, L"value");
    std::wstring status = lower(t.s(L"status"));
    tx.failed = status == L"error";
    NetTxIn in;
    in.address = evmAddrOf(t, L"from");
    in.value = fieldNum(t, L"value");
    tx.inputs.push_back(in);
    NetTxOut out;
    out.n = 0;
    out.address = evmAddrOf(t, L"to");
    out.value = in.value;
    tx.outputs.push_back(out);
    tx.ok = !tx.txid.empty();
    return tx;
}

static NetAddress bsAddress(int chain, const std::wstring& addr, const ProviderKeys& k) {
    NetAddress a;
    std::wstring base = bsBase(chain, k);
    if (base.empty()) {
        a.error = L"Keine Blockscout-Instanz für diese Chain";
        return a;
    }
    Json j;
    std::wstring err;
    if (!getJson(base + L"/addresses/" + urlEncode(addr), j, &err)) {
        a.error = err;
        return a;
    }
    a.address = addr;
    a.balance = fieldNum(j, L"coin_balance");
    a.provider = L"blockscout";
    a.ok = true;
    Json counters;
    if (getJson(base + L"/addresses/" + urlEncode(addr) + L"/counters", counters, nullptr, 12000))
        a.txCount = (long long)fieldNum(counters, L"transactions_count");
    return a;
}

static std::vector<NetTx> bsAddressTxs(int chain, const std::wstring& addr, int limit,
                                       const ProviderKeys& k, std::wstring* error) {
    std::vector<NetTx> out;
    std::wstring base = bsBase(chain, k);
    if (base.empty()) {
        if (error) *error = L"Keine Blockscout-Instanz für diese Chain";
        return out;
    }
    Json j;
    std::wstring err;
    if (!getJson(base + L"/addresses/" + urlEncode(addr) + L"/transactions", j, &err)) {
        if (error) *error = err;
        return out;
    }
    if (const Json* items = j.a(L"items")) {
        for (const Json& t : items->arr) {
            NetTx tx = bsMapTx(t);
            if (tx.ok) out.push_back(tx);
            if ((int)out.size() >= limit) break;
        }
    }
    return out;
}

static NetTx bsTx(int chain, const std::wstring& txid, const ProviderKeys& k) {
    NetTx tx;
    std::wstring base = bsBase(chain, k);
    if (base.empty()) {
        tx.error = L"Keine Blockscout-Instanz für diese Chain";
        return tx;
    }
    Json j;
    std::wstring err;
    if (!getJson(base + L"/transactions/" + urlEncode(txid), j, &err)) {
        tx.error = err;
        return tx;
    }
    return bsMapTx(j);
}

// ---------------------------------------------------------------------------
// Etherscan (V2, ein Key für alle EVM-Ketten)
// ---------------------------------------------------------------------------
static std::wstring esUrl(int chain, const std::wstring& params, const ProviderKeys& k) {
    return L"https://api.etherscan.io/v2/api?chainid=" + std::to_wstring(evmChainId(chain)) + L"&" + params +
           L"&apikey=" + urlEncode(k.etherscan);
}

static NetAddress esAddress(int chain, const std::wstring& addr, const ProviderKeys& k) {
    NetAddress a;
    if (k.etherscan.empty()) {
        a.error = L"Etherscan-Key fehlt";
        return a;
    }
    Json j;
    std::wstring err;
    if (!getJson(esUrl(chain, L"module=account&action=balance&tag=latest&address=" + urlEncode(addr), k), j,
                 &err)) {
        a.error = err;
        return a;
    }
    if (j.s(L"status") == L"0") {
        a.error = j.s(L"result", j.s(L"message", L"Anfrage abgelehnt"));
        return a;
    }
    a.address = addr;
    a.balance = numOrStr(j.find(L"result"));
    a.provider = L"etherscan";
    a.ok = true;
    return a;
}

static NetTx esMapTx(const Json& t) {
    NetTx tx;
    tx.txid = t.s(L"hash");
    tx.provider = L"etherscan";
    tx.blockHeight = (long long)fieldNum(t, L"blockNumber");
    tx.blockTime = (long long)fieldNum(t, L"timeStamp");
    tx.confirmed = tx.blockHeight > 0;
    tx.failed = t.s(L"isError") == L"1";
    tx.fee = fieldNum(t, L"gasUsed") * fieldNum(t, L"gasPrice");
    NetTxIn in;
    in.address = t.s(L"from");
    in.value = fieldNum(t, L"value");
    tx.inputs.push_back(in);
    NetTxOut out;
    out.n = 0;
    out.address = t.s(L"to");
    out.value = in.value;
    tx.outputs.push_back(out);
    tx.ok = !tx.txid.empty();
    return tx;
}

static std::vector<NetTx> esAddressTxs(int chain, const std::wstring& addr, int limit,
                                       const ProviderKeys& k, std::wstring* error) {
    std::vector<NetTx> out;
    if (k.etherscan.empty()) {
        if (error) *error = L"Etherscan-Key fehlt";
        return out;
    }
    Json j;
    std::wstring err;
    std::wstring params = L"module=account&action=txlist&sort=desc&page=1&offset=" +
                          std::to_wstring((std::min)(limit, 100)) + L"&address=" + urlEncode(addr);
    if (!getJson(esUrl(chain, params, k), j, &err)) {
        if (error) *error = err;
        return out;
    }
    const Json* res = j.a(L"result");
    if (!res) {
        if (error) *error = j.s(L"message", L"Keine Transaktionen");
        return out;
    }
    for (const Json& t : res->arr) {
        NetTx tx = esMapTx(t);
        if (tx.ok) out.push_back(tx);
        if ((int)out.size() >= limit) break;
    }
    return out;
}

// ---------------------------------------------------------------------------
// TronGrid
// ---------------------------------------------------------------------------
static HttpResult tronGet(const std::wstring& url, const ProviderKeys& k) {
    HttpRequest r;
    r.url = url;
    if (!k.trongrid.empty()) r.headers.push_back({L"TRON-PRO-API-KEY", k.trongrid});
    g_requests++;
    return httpFetch(r);
}

static NetAddress tronAddress(const std::wstring& addr, const ProviderKeys& k) {
    NetAddress a;
    HttpResult r = tronGet(L"https://api.trongrid.io/v1/accounts/" + urlEncode(addr), k);
    if (!r.ok) {
        a.error = r.error;
        return a;
    }
    Json j;
    if (!jsonParse(r.body, j)) {
        a.error = L"Unerwartete Antwort";
        return a;
    }
    const Json* data = j.a(L"data");
    if (!data || data->arr.empty()) {
        a.error = L"Konto nicht gefunden";
        return a;
    }
    a.address = addr;
    a.balance = fieldNum(data->arr[0], L"balance");
    a.provider = L"trongrid";
    a.ok = true;
    return a;
}

static std::vector<NetTx> tronAddressTxs(const std::wstring& addr, int limit, const ProviderKeys& k,
                                         std::wstring* error) {
    std::vector<NetTx> out;
    HttpResult r = tronGet(L"https://api.trongrid.io/v1/accounts/" + urlEncode(addr) +
                               L"/transactions?limit=" + std::to_wstring((std::min)(limit, 200)),
                           k);
    if (!r.ok) {
        if (error) *error = r.error;
        return out;
    }
    Json j;
    if (!jsonParse(r.body, j)) {
        if (error) *error = L"Unerwartete Antwort";
        return out;
    }
    const Json* data = j.a(L"data");
    if (!data) return out;
    for (const Json& t : data->arr) {
        NetTx tx;
        tx.txid = t.s(L"txID");
        tx.provider = L"trongrid";
        tx.blockTime = t.i(L"block_timestamp") / 1000;
        tx.confirmed = tx.blockTime > 0;
        const Json* rawData = t.find(L"raw_data");
        if (rawData) {
            const Json* contracts = rawData->a(L"contract");
            if (contracts && !contracts->arr.empty()) {
                const Json* param = contracts->arr[0].find(L"parameter");
                const Json* value = param ? param->find(L"value") : nullptr;
                if (value) {
                    NetTxIn in;
                    in.address = value->s(L"owner_address");
                    in.value = fieldNum(*value, L"amount");
                    tx.inputs.push_back(in);
                    NetTxOut o;
                    o.n = 0;
                    o.address = value->s(L"to_address");
                    o.value = in.value;
                    tx.outputs.push_back(o);
                }
            }
        }
        if (!tx.txid.empty()) {
            tx.ok = true;
            out.push_back(tx);
        }
        if ((int)out.size() >= limit) break;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Auswahl der Quelle je Kette
// ---------------------------------------------------------------------------
std::vector<std::wstring> netProvidersFor(int chain) {
    switch (chain) {
    case BTC: return {L"mempool", L"blockstream", L"blockchair", L"blockcypher"};
    case LTC: return {L"litecoinspace", L"blockchair", L"blockcypher"};
    case DOGE: return {L"blockchair", L"blockcypher"};
    case BCH: return {L"blockchair"};
    case ETH:
    case POL:
    case ARB: return {L"blockscout", L"etherscan"};
    case TRX: return {L"trongrid"};
    }
    return {};
}

NetAddress netFetchAddress(int chain, const std::wstring& address, const ProviderKeys& k) {
    std::wstring addr = trimmed(address);
    NetAddress last;
    last.error = L"Keine Quelle verfügbar";
    for (const std::wstring& id : netProvidersFor(chain)) {
        NetAddress a;
        if (id == L"mempool" || id == L"litecoinspace") a = esploraAddress(esploraBase(chain), id, addr);
        else if (id == L"blockstream") a = esploraAddress(esploraBase2(chain), id, addr);
        else if (id == L"blockchair") a = blockchairAddress(chain, addr, k);
        else if (id == L"blockcypher") a = blockcypherAddress(chain, addr, k);
        else if (id == L"blockscout") a = bsAddress(chain, addr, k);
        else if (id == L"etherscan") a = esAddress(chain, addr, k);
        else if (id == L"trongrid") a = tronAddress(addr, k);
        if (a.ok) return a;
        last = a;
    }
    return last;
}

std::vector<NetTx> netFetchAddressTxs(int chain, const std::wstring& address, int limit,
                                      const ProviderKeys& k, std::wstring* error) {
    std::wstring addr = trimmed(address);
    std::wstring err;
    for (const std::wstring& id : netProvidersFor(chain)) {
        std::vector<NetTx> txs;
        std::wstring e;
        if (id == L"mempool" || id == L"litecoinspace") {
            txs = esploraAddressTxs(esploraBase(chain), id, addr, limit, &e);
            if (!txs.empty()) esploraOutspends(esploraBase(chain), txs, 10);
        } else if (id == L"blockstream") {
            txs = esploraAddressTxs(esploraBase2(chain), id, addr, limit, &e);
            if (!txs.empty()) esploraOutspends(esploraBase2(chain), txs, 10);
        } else if (id == L"blockchair") {
            txs = blockchairAddressTxs(chain, addr, limit, k, &e);
        } else if (id == L"blockcypher") {
            txs = blockcypherAddressTxs(chain, addr, limit, k, &e);
        } else if (id == L"blockscout") {
            txs = bsAddressTxs(chain, addr, limit, k, &e);
        } else if (id == L"etherscan") {
            txs = esAddressTxs(chain, addr, limit, k, &e);
        } else if (id == L"trongrid") {
            txs = tronAddressTxs(addr, limit, k, &e);
        }
        if (!txs.empty()) return txs;
        if (err.empty()) err = e;
    }
    if (error) *error = err;
    return {};
}

NetTx netFetchTx(int chain, const std::wstring& txid, const ProviderKeys& k) {
    std::wstring id2 = trimmed(txid);
    NetTx last;
    last.error = L"Keine Quelle verfügbar";
    for (const std::wstring& id : netProvidersFor(chain)) {
        NetTx tx;
        if (id == L"mempool" || id == L"litecoinspace") tx = esploraTx(esploraBase(chain), id, id2);
        else if (id == L"blockstream") tx = esploraTx(esploraBase2(chain), id, id2);
        else if (id == L"blockchair") tx = blockchairTx(chain, id2, k);
        else if (id == L"blockcypher") tx = blockcypherTx(chain, id2, k);
        else if (id == L"blockscout") tx = bsTx(chain, id2, k);
        else continue;
        if (tx.ok) return tx;
        last = tx;
    }
    return last;
}

// ---------------------------------------------------------------------------
// Kurse (CoinGecko, Fallback Blockchain.com)
// ---------------------------------------------------------------------------
bool netFetchPrice(int chain, double* eur, double* usd, std::wstring* source) {
    std::wstring cg = coingeckoId(chain);
    Json j;
    if (getJson(L"https://api.coingecko.com/api/v3/simple/price?ids=" + cg + L"&vs_currencies=eur,usd", j,
                nullptr, 15000)) {
        if (const Json* p = j.find(cg)) {
            if (eur) *eur = fieldNum(*p, L"eur");
            if (usd) *usd = fieldNum(*p, L"usd");
            if (source) *source = L"CoinGecko";
            if ((eur ? *eur : 1) > 0) return true;
        }
    }
    if (chain != BTC) return false;
    Json t;
    if (getJson(L"https://blockchain.info/ticker", t, nullptr, 15000)) {
        const Json* e = t.find(L"EUR");
        const Json* u = t.find(L"USD");
        if (e && u) {
            if (eur) *eur = fieldNum(*e, L"last");
            if (usd) *usd = fieldNum(*u, L"last");
            if (source) *source = L"Blockchain.com";
            return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Label- und Risikoquellen
// ---------------------------------------------------------------------------
namespace {
struct ListCache {
    std::map<std::wstring, std::wstring> entries;   // Adresse -> Bezeichnung
    long long loadedAt = 0;
    bool tried = false;
};
std::mutex g_listMutex;
std::map<std::wstring, ListCache> g_lists;
const long long LIST_TTL = 6 * 60 * 60;   // sechs Stunden

// Sicherung gegen tote Quellen: Antwortet eine Quelle nicht, wird sie fuer
// zwei Minuten uebersprungen. Sonst wartet ein Trace bei jeder einzelnen
// Adresse erneut auf die Zeitueberschreitung.
std::mutex g_failMutex;
std::map<std::wstring, long long> g_failedUntil;

bool sourceDown(const std::wstring& id) {
    std::lock_guard<std::mutex> lock(g_failMutex);
    auto it = g_failedUntil.find(id);
    return it != g_failedUntil.end() && it->second > (long long)time(nullptr);
}
void markDown(const std::wstring& id) {
    std::lock_guard<std::mutex> lock(g_failMutex);
    g_failedUntil[id] = (long long)time(nullptr) + 120;
}
void markUp(const std::wstring& id) {
    std::lock_guard<std::mutex> lock(g_failMutex);
    g_failedUntil.erase(id);
}
}  // namespace

static std::wstring cacheDir() {
    wchar_t* base = nullptr;
    std::wstring dir;
    if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &base)) && base) {
        dir = base;
        CoTaskMemFree(base);
    }
    dir += L"\\Chainer\\cache";
    SHCreateDirectoryExW(nullptr, dir.c_str(), nullptr);
    return dir;
}

static bool readCacheFile(const std::wstring& name, std::wstring& out, long long maxAgeSec) {
    std::wstring path = cacheDir() + L"\\" + name;
    HANDLE h = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                           FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    FILETIME ft{};
    GetFileTime(h, nullptr, nullptr, &ft);
    ULARGE_INTEGER ul{};
    ul.LowPart = ft.dwLowDateTime;
    ul.HighPart = ft.dwHighDateTime;
    long long fileTime = (long long)(ul.QuadPart / 10000000ULL) - 11644473600LL;
    if ((long long)time(nullptr) - fileTime > maxAgeSec) {
        CloseHandle(h);
        return false;
    }
    LARGE_INTEGER size{};
    GetFileSizeEx(h, &size);
    std::string raw((size_t)size.QuadPart, '\0');
    DWORD read = 0;
    if (size.QuadPart > 0) ReadFile(h, &raw[0], (DWORD)size.QuadPart, &read, nullptr);
    CloseHandle(h);
    raw.resize(read);
    out = toW(raw);
    return !out.empty();
}

static void writeCacheFile(const std::wstring& name, const std::wstring& text) {
    std::wstring path = cacheDir() + L"\\" + name;
    HANDLE h = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL,
                           nullptr);
    if (h == INVALID_HANDLE_VALUE) return;
    std::string raw = toU8(text);
    DWORD written = 0;
    WriteFile(h, raw.data(), (DWORD)raw.size(), &written, nullptr);
    CloseHandle(h);
}

// OFAC-Sanktionsliste: eine Adresse je Zeile
static const wchar_t* ofacFile(int chain) {
    switch (chain) {
    case BTC: return L"XBT.txt";
    case LTC: return L"LTC.txt";
    case BCH: return L"BCH.txt";
    case ETH: return L"ETH.txt";
    default: return nullptr;
    }
}

static bool loadLineList(const std::wstring& key, const std::wstring& url, ListCache& cache,
                         bool lowercase) {
    std::wstring text;
    if (!readCacheFile(key + L".txt", text, LIST_TTL)) {
        HttpResult r = get(url, 30000);
        if (!r.ok) return false;
        text = r.body;
        writeCacheFile(key + L".txt", text);
    }
    size_t start = 0;
    while (start <= text.size()) {
        size_t nl = text.find(L'\n', start);
        std::wstring line = trimmed(text.substr(start, (nl == std::wstring::npos ? text.size() : nl) - start));
        if (!line.empty() && line[0] != L'#') cache.entries[lowercase ? lower(line) : line] = L"";
        if (nl == std::wstring::npos) break;
        start = nl + 1;
    }
    cache.loadedAt = (long long)time(nullptr);
    return true;
}

// Ransomwhere: Spiegel im GraphSense-TagPack (YAML, zeilenweise ausgewertet)
static bool loadRansomwhere(ListCache& cache) {
    std::wstring text;
    if (!readCacheFile(L"ransomwhere.yaml", text, 24 * 60 * 60)) {
        HttpResult r = get(L"https://raw.githubusercontent.com/graphsense/graphsense-tagpacks/master/packs/"
                           L"ransomwhere.yaml",
                           40000);
        if (!r.ok) return false;
        text = r.body;
        writeCacheFile(L"ransomwhere.yaml", text);
    }
    std::wstring address;
    size_t start = 0;
    while (start <= text.size()) {
        size_t nl = text.find(L'\n', start);
        std::wstring line = trimmed(text.substr(start, (nl == std::wstring::npos ? text.size() : nl) - start));
        auto value = [&](const wchar_t* prefix) -> std::wstring {
            std::wstring p = prefix;
            std::wstring l = line;
            if (l.compare(0, 2, L"- ") == 0) l = trimmed(l.substr(2));
            if (l.compare(0, p.size(), p) != 0) return L"";
            std::wstring v = trimmed(l.substr(p.size()));
            if (!v.empty() && (v.front() == L'"' || v.front() == L'\'')) v = v.substr(1);
            if (!v.empty() && (v.back() == L'"' || v.back() == L'\'')) v.pop_back();
            return v;
        };
        std::wstring a = value(L"address:");
        if (!a.empty()) address = a;
        std::wstring l2 = value(L"label:");
        if (!l2.empty() && !address.empty()) {
            cache.entries[address] = l2;
            address.clear();
        }
        if (nl == std::wstring::npos) break;
        start = nl + 1;
    }
    cache.loadedAt = (long long)time(nullptr);
    return !cache.entries.empty();
}

static bool listLookup(const std::wstring& key, const std::wstring& needle, std::wstring* labelOut,
                       const std::function<bool(ListCache&)>& loader) {
    std::lock_guard<std::mutex> lock(g_listMutex);
    ListCache& c = g_lists[key];
    long long now = (long long)time(nullptr);
    if (c.entries.empty() && (!c.tried || now - c.loadedAt > LIST_TTL)) {
        c.tried = true;
        loader(c);
    }
    auto it = c.entries.find(needle);
    if (it == c.entries.end()) return false;
    if (labelOut) *labelOut = it->second;
    return true;
}

std::vector<NetLabel> netFetchLabels(int chain, const std::wstring& address, const ProviderKeys& k,
                                     std::vector<std::wstring>* unreachable) {
    std::vector<NetLabel> out;
    std::wstring addr = trimmed(address);

    // --- OFAC-Sanktionsliste -------------------------------------------------
    if (const wchar_t* file = ofacFile(chain)) {
        bool lc = chain == ETH;
        std::wstring url = std::wstring(L"https://raw.githubusercontent.com/0xB10C/"
                                        L"ofac-sanctioned-digital-currency-addresses/lists/"
                                        L"sanctioned_addresses_") +
                           file;
        std::wstring key = L"ofac-" + std::to_wstring(chain);
        bool loaded = true;
        if (listLookup(key, lc ? lower(addr) : addr, nullptr,
                       [&](ListCache& c) { loaded = loadLineList(key, url, c, lc); return loaded; })) {
            NetLabel l;
            l.source = L"ofac";
            l.label = L"OFAC-sanktioniert";
            l.category = L"sanctioned";
            l.risk = L"high";
            l.url = L"https://sanctionssearch.ofac.treas.gov/";
            l.details = L"Adresse steht auf der SDN-Liste des US-Finanzministeriums";
            out.push_back(l);
        }
        if (!loaded && unreachable) unreachable->push_back(L"OFAC-Sanktionsliste");
    }

    // --- Ransomwhere ---------------------------------------------------------
    if (chain == BTC) {
        std::wstring family;
        bool loaded = true;
        if (listLookup(L"ransomwhere", addr, &family,
                       [&](ListCache& c) { loaded = loadRansomwhere(c); return loaded; })) {
            NetLabel l;
            l.source = L"ransomwhere";
            l.label = family.empty() ? L"Ransomware" : family;
            l.category = L"ransomware";
            l.risk = L"high";
            l.url = L"https://ransomwhe.re";
            l.details = L"Gemeldete Ransomware-Zahladresse";
            out.push_back(l);
        }
        if (!loaded && unreachable) unreachable->push_back(L"Ransomwhere");
    }

    // --- WalletExplorer ------------------------------------------------------
    if (chain == BTC && !sourceDown(L"walletexplorer")) {
        Json j;
        std::wstring err;
        if (getJson(L"https://www.walletexplorer.com/api/1/address-lookup?address=" + urlEncode(addr) +
                        L"&caller=chainer",
                    j, &err, 12000)) {
            markUp(L"walletexplorer");
            if (j.flag(L"found")) {
                std::wstring label = j.s(L"label");
                bool named = !label.empty();
                if (label.empty()) label = j.s(L"wallet_id");
                if (!label.empty()) {
                    std::wstring lo = lower(label);
                    std::wstring cat = named ? L"service" : L"wallet";
                    if (lo.find(L"mix") != std::wstring::npos || lo.find(L"tumbl") != std::wstring::npos ||
                        lo.find(L"wasabi") != std::wstring::npos || lo.find(L"blender") != std::wstring::npos)
                        cat = L"mixer";
                    else if (lo.find(L"exchange") != std::wstring::npos ||
                             lo.find(L"binance") != std::wstring::npos ||
                             lo.find(L"kraken") != std::wstring::npos ||
                             lo.find(L"coinbase") != std::wstring::npos ||
                             lo.find(L"bitstamp") != std::wstring::npos ||
                             lo.find(L"bitfinex") != std::wstring::npos)
                        cat = L"exchange";
                    NetLabel l;
                    l.source = L"walletexplorer";
                    l.label = label;
                    l.category = cat;
                    l.risk = cat == L"mixer" ? L"high" : L"low";
                    l.url = L"https://www.walletexplorer.com/wallet/" + urlEncode(label);
                    l.details = named ? L"Bekannter Dienst laut WalletExplorer" : L"Wallet-Cluster " + label;
                    out.push_back(l);
                }
            }
        } else {
            markDown(L"walletexplorer");
            if (unreachable) unreachable->push_back(L"WalletExplorer");
        }
    }

    // --- CryptoScamDB --------------------------------------------------------
    if (!sourceDown(L"cryptoscamdb")) {
        Json j;
        std::wstring err;
        if (getJson(L"https://api.cryptoscamdb.org/v1/check/" + urlEncode(addr), j, &err, 10000)) {
            markUp(L"cryptoscamdb");
            const Json* res = j.find(L"result");
            const Json* entries = res ? res->a(L"entries") : nullptr;
            std::wstring status = res ? res->s(L"status") : L"";
            if (j.flag(L"success") && entries && !entries->arr.empty() &&
                (status.empty() || status == L"blocked")) {
                int count = 0;
                for (const Json& e : entries->arr) {
                    if (count++ >= 3) break;
                    NetLabel l;
                    l.source = L"cryptoscamdb";
                    l.label = e.s(L"name", e.s(L"category", L"Scam-Meldung"));
                    l.category = L"scam";
                    l.risk = L"high";
                    l.url = e.s(L"url");
                    l.details = e.s(L"description");
                    out.push_back(l);
                }
            }
        } else {
            markDown(L"cryptoscamdb");
            if (unreachable) unreachable->push_back(L"CryptoScamDB");
        }
    }

    // --- Bitcoin Who's Who (Key) --------------------------------------------
    if (chain == BTC && !k.whoswho.empty() && !sourceDown(L"bitcoinwhoswho")) {
        Json j;
        std::wstring err;
        if (getJson(L"https://www.bitcoinwhoswho.com/api/scam/" + urlEncode(k.whoswho) + L"/" +
                        urlEncode(addr),
                    j, &err, 15000)) {
            const Json* alert = j.find(L"scam_alert");
            const Json* alerts = alert ? alert->a(L"alerts") : nullptr;
            if (alerts && !alerts->arr.empty()) {
                NetLabel l;
                l.source = L"bitcoinwhoswho";
                l.label = std::to_wstring(alerts->arr.size()) + L" Scam-Meldung(en)";
                l.category = L"scam";
                l.risk = L"high";
                l.url = L"https://www.bitcoinwhoswho.com/address/" + addr;
                l.details = alerts->arr[0].s(L"description");
                out.push_back(l);
            }
            std::wstring tag = j.s(L"tag");
            if (!tag.empty()) {
                NetLabel l;
                l.source = L"bitcoinwhoswho";
                l.label = tag;
                l.category = L"service";
                l.risk = L"low";
                l.url = L"https://www.bitcoinwhoswho.com/address/" + addr;
                out.push_back(l);
            }
        } else {
            markDown(L"bitcoinwhoswho");
            if (unreachable) unreachable->push_back(L"Bitcoin Who's Who");
        }
    }

    // --- Chainabuse (Key) ----------------------------------------------------
    if (!k.chainabuse.empty() && !sourceDown(L"chainabuse")) {
        HttpRequest req;
        req.url = L"https://api.chainabuse.com/v0/reports?address=" + urlEncode(addr) +
                  L"&includePrivate=false&page=1&perPage=10";
        // Basic-Auth mit dem Key als Nutzer und Passwort (wie in der Web-Fassung)
        std::string plain = toU8(k.chainabuse + L":" + k.chainabuse);
        static const char* B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        std::string enc;
        for (size_t i = 0; i < plain.size(); i += 3) {
            unsigned v = (unsigned char)plain[i] << 16;
            if (i + 1 < plain.size()) v |= (unsigned char)plain[i + 1] << 8;
            if (i + 2 < plain.size()) v |= (unsigned char)plain[i + 2];
            enc += B64[(v >> 18) & 63];
            enc += B64[(v >> 12) & 63];
            enc += (i + 1 < plain.size()) ? B64[(v >> 6) & 63] : '=';
            enc += (i + 2 < plain.size()) ? B64[v & 63] : '=';
        }
        req.headers.push_back({L"Authorization", L"Basic " + toW(enc)});
        g_requests++;
        HttpResult r = httpFetch(req);
        Json j;
        if (r.ok && jsonParse(r.body, j) && j.t == Json::T::Arr && !j.arr.empty()) {
            NetLabel l;
            l.source = L"chainabuse";
            l.label = std::to_wstring(j.arr.size()) + L" Chainabuse-Meldung(en)";
            l.category = L"scam";
            l.risk = L"high";
            l.url = L"https://www.chainabuse.com/address/" + urlEncode(addr);
            l.details = j.arr[0].s(L"scamCategory");
            out.push_back(l);
        } else if (!r.ok) {
            markDown(L"chainabuse");
            if (unreachable) unreachable->push_back(L"Chainabuse");
        }
    }

    return out;
}

// ---------------------------------------------------------------------------
// Erreichbarkeit
// ---------------------------------------------------------------------------
PingInfo netPing(const std::wstring& id, int chain, const ProviderKeys& k) {
    PingInfo p;
    std::wstring url;
    if (id == L"mempool") url = L"https://mempool.space/api/blocks/tip/height";
    else if (id == L"blockstream") url = L"https://blockstream.info/api/blocks/tip/height";
    else if (id == L"litecoinspace") url = L"https://litecoinspace.org/api/blocks/tip/height";
    else if (id == L"blockchain") url = L"https://blockchain.info/q/getblockcount";
    else if (id == L"blockcypher")
        url = std::wstring(L"https://api.blockcypher.com/v1/") +
              (blockcypherPath(chain) ? blockcypherPath(chain) : L"btc") + L"/main" +
              blockcypherToken(k, true);
    else if (id == L"blockchair")
        url = std::wstring(L"https://api.blockchair.com/") +
              (blockchairPath(chain) ? blockchairPath(chain) : L"bitcoin") + L"/stats" +
              blockchairKeyParam(k);
    else if (id == L"blockscout") {
        std::wstring base = bsBase(chain, k);
        if (base.empty()) {
            p.error = L"Keine Instanz für diese Chain";
            return p;
        }
        url = base + L"/stats";
    } else if (id == L"etherscan") {
        if (k.etherscan.empty()) {
            p.error = L"Key fehlt";
            return p;
        }
        url = esUrl(chain, L"module=proxy&action=eth_blockNumber", k);
    } else if (id == L"trongrid") {
        HttpResult r = tronGet(L"https://api.trongrid.io/wallet/getnowblock", k);
        p.ok = r.ok;
        p.ms = r.ms;
        p.error = r.error;
        return p;
    } else if (id == L"ofac")
        url = L"https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/"
              L"lists/sanctioned_addresses_XBT.txt";
    else if (id == L"ransomwhere")
        url = L"https://raw.githubusercontent.com/graphsense/graphsense-tagpacks/master/packs/"
              L"ransomwhere.yaml";
    else if (id == L"tagpacks")
        url = L"https://raw.githubusercontent.com/graphsense/graphsense-tagpacks/master/packs/"
              L"ransomwhere.yaml";
    else if (id == L"walletexplorer")
        url = L"https://www.walletexplorer.com/api/1/address-lookup?address="
              L"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa&caller=chainer";
    else if (id == L"cryptoscamdb")
        url = L"https://api.cryptoscamdb.org/v1/check/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    else if (id == L"chainabuse") {
        if (k.chainabuse.empty()) {
            p.error = L"Key fehlt";
            return p;
        }
        url = L"https://api.chainabuse.com/v0/reports?address=1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    } else if (id == L"whoswho") {
        if (k.whoswho.empty()) {
            p.error = L"Key fehlt";
            return p;
        }
        url = L"https://www.bitcoinwhoswho.com/api/scam/" + urlEncode(k.whoswho) +
              L"/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    } else {
        p.error = L"Lokal";
        return p;
    }

    HttpResult r = get(url, 12000);
    p.ok = r.ok;
    p.ms = r.ms;
    p.error = r.error;
    if (r.ok) markUp(id);
    return p;
}
