// ---------------------------------------------------------------------------
// format.cpp - Zahlen, Betraege und Zeiten wie in `src/lib/format.ts`.
//
// Die Webseite benutzt `Intl` mit en-GB bzw. de-DE. Hier ist dasselbe von Hand
// nachgebildet, damit die Anwendung ohne zusaetzliche Bibliotheken auskommt.
// ---------------------------------------------------------------------------
#include "app.h"
#include <cstdio>
#include <cmath>
#include <ctime>

Loc g_locale = Loc::En;

static wchar_t groupSep() { return g_locale == Loc::De ? L'.' : L','; }
static wchar_t decSep() { return g_locale == Loc::De ? L',' : L'.'; }

std::wstring fmtNumber(double v, int maxFrac, int minFrac) {
    if (std::isnan(v)) return L"–";
    bool neg = v < 0;
    double av = neg ? -v : v;

    wchar_t buf[64];
    swprintf(buf, 64, L"%.*f", maxFrac, av);
    std::wstring s = buf;

    std::wstring intPart = s, fracPart;
    size_t dot = s.find(L'.');
    if (dot != std::wstring::npos) {
        intPart = s.substr(0, dot);
        fracPart = s.substr(dot + 1);
    }
    // Ueberfluessige Nullen weg, aber mindestens `minFrac` Stellen behalten.
    while ((int)fracPart.size() > minFrac && !fracPart.empty() && fracPart.back() == L'0') fracPart.pop_back();

    std::wstring grouped;
    int c = 0;
    for (int i = (int)intPart.size() - 1; i >= 0; i--) {
        grouped.insert(grouped.begin(), intPart[(size_t)i]);
        if (++c % 3 == 0 && i > 0) grouped.insert(grouped.begin(), groupSep());
    }
    std::wstring out = (neg ? L"-" : L"") + grouped;
    if (!fracPart.empty()) out += decSep() + fracPart;
    return out;
}

std::wstring fmtAmount(double smallestUnit, int decimals, const std::wstring& symbol, int digits) {
    double v = smallestUnit / std::pow(10.0, decimals);
    int maxFrac = (std::min)(digits, decimals);
    double av = std::fabs(v);
    if (av > 0 && av < std::pow(10.0, -maxFrac)) maxFrac = decimals;
    return fmtNumber(v, maxFrac) + L" " + symbol;
}

std::wstring fmtFiat(double smallestUnit, double rate, int decimals) {
    if (rate <= 0) return L"";
    double v = smallestUnit / std::pow(10.0, decimals) * rate;
    std::wstring n = fmtNumber(v, 2, 2);
    return g_locale == Loc::De ? n + L" €" : L"€" + n;
}

std::wstring fmtPercent(double v, int digits) {
    return fmtNumber(v * 100.0, digits) + L" %";
}

static void breakTime(long long unixSec, tm& out) {
    time_t t = (time_t)unixSec;
    localtime_s(&out, &t);
}

std::wstring fmtDate(long long unixSec) {
    if (!unixSec) return tr(L"unconfirmed", L"unbestätigt");
    tm d{};
    breakTime(unixSec, d);
    wchar_t buf[64];
    if (g_locale == Loc::De)
        swprintf(buf, 64, L"%02d.%02d.%04d, %02d:%02d:%02d", d.tm_mday, d.tm_mon + 1, d.tm_year + 1900,
                 d.tm_hour, d.tm_min, d.tm_sec);
    else
        swprintf(buf, 64, L"%02d/%02d/%04d, %02d:%02d:%02d", d.tm_mday, d.tm_mon + 1, d.tm_year + 1900,
                 d.tm_hour, d.tm_min, d.tm_sec);
    return buf;
}

std::wstring fmtTimestamp(long long unixSec) {
    if (!unixSec) return L"–";
    return fmtDate(unixSec);
}

std::wstring fmtTime(long long unixSec) {
    if (!unixSec) return L"–";
    tm d{};
    breakTime(unixSec, d);
    wchar_t buf[32];
    swprintf(buf, 32, L"%02d:%02d:%02d", d.tm_hour, d.tm_min, d.tm_sec);
    return buf;
}

std::wstring fmtDateShort(long long unixSec) {
    if (!unixSec) return tr(L"unconf.", L"unbest.");
    tm d{};
    breakTime(unixSec, d);
    wchar_t buf[32];
    if (g_locale == Loc::De)
        swprintf(buf, 32, L"%02d.%02d.%02d", d.tm_mday, d.tm_mon + 1, (d.tm_year + 1900) % 100);
    else
        swprintf(buf, 32, L"%02d/%02d/%02d", d.tm_mday, d.tm_mon + 1, (d.tm_year + 1900) % 100);
    return buf;
}

std::wstring shortHash(const std::wstring& h, int n) {
    if (h.empty() || (int)h.size() <= n * 2 + 1) return h;
    return h.substr(0, (size_t)n) + L"…" + h.substr(h.size() - (size_t)n);
}

// --- Ketten ----------------------------------------------------------------
const std::vector<ChainMeta> CHAINS = {
    {L"bitcoin",      L"Bitcoin",      L"BTC",  L"sat",     L"https://mempool.space",     8,  true},
    {L"litecoin",     L"Litecoin",     L"LTC",  L"litoshi", L"https://litecoinspace.org", 8,  true},
    {L"dogecoin",     L"Dogecoin",     L"DOGE", L"koinu",   L"https://blockchair.com",    8,  true},
    {L"bitcoin-cash", L"Bitcoin Cash", L"BCH",  L"sat",     L"https://blockchair.com",    8,  true},
    {L"ethereum",     L"Ethereum",     L"ETH",  L"wei",     L"https://etherscan.io",      18, false},
    {L"polygon",      L"Polygon",      L"POL",  L"wei",     L"https://polygonscan.com",   18, false},
    {L"arbitrum",     L"Arbitrum",     L"ETH",  L"wei",     L"https://arbiscan.io",       18, false},
    {L"tron",         L"Tron",         L"TRX",  L"sun",     L"https://tronscan.org",      6,  false},
};

const ChainMeta& chainAt(int i) {
    if (i < 0 || i >= (int)CHAINS.size()) return CHAINS[0];
    return CHAINS[(size_t)i];
}
