// ---------------------------------------------------------------------------
// export.cpp - Ergebnisse als Datei ausgeben.
//
// Alles bleibt auf dem Rechner: ein gewoehnlicher Speichern-Dialog, dann eine
// JSON- bzw. CSV-Datei. Kein Netzverkehr.
// ---------------------------------------------------------------------------
#include "app.h"
#include "store.h"
#include <commdlg.h>

#pragma comment(lib, "comdlg32.lib")

// Speichern-Dialog; liefert einen leeren Pfad, wenn abgebrochen wurde.
static std::wstring askSavePath(const std::wstring& suggested, const wchar_t* filter,
                                const wchar_t* defExt) {
    wchar_t buf[MAX_PATH] = {0};
    wcsncpy_s(buf, suggested.c_str(), _TRUNCATE);
    OPENFILENAMEW ofn{};
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner = GetActiveWindow();
    ofn.lpstrFilter = filter;
    ofn.lpstrFile = buf;
    ofn.nMaxFile = MAX_PATH;
    ofn.lpstrDefExt = defExt;
    ofn.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    if (!GetSaveFileNameW(&ofn)) return L"";
    return buf;
}

static bool writeTextFile(const std::wstring& path, const std::wstring& text) {
    HANDLE h = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    std::string raw = toU8(text);
    DWORD written = 0;
    BOOL ok = WriteFile(h, raw.data(), (DWORD)raw.size(), &written, nullptr);
    CloseHandle(h);
    return ok != 0;
}

// Adressliste aus einer Text- oder CSV-Datei in die Massenprüfung übernehmen.
void importAddressList(App& a) {
    wchar_t buf[MAX_PATH] = {0};
    OPENFILENAMEW ofn{};
    ofn.lStructSize = sizeof(ofn);
    ofn.hwndOwner = GetActiveWindow();
    ofn.lpstrFilter = L"Text / CSV\0*.txt;*.csv\0Alle Dateien\0*.*\0\0";
    ofn.lpstrFile = buf;
    ofn.nMaxFile = MAX_PATH;
    ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    if (!GetOpenFileNameW(&ofn)) return;

    HANDLE h = CreateFileW(buf, GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                           FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) {
        a.message = tr(L"The file could not be opened.", L"Die Datei konnte nicht geöffnet werden.");
        return;
    }
    LARGE_INTEGER size{};
    GetFileSizeEx(h, &size);
    std::string raw((size_t)(std::min)(size.QuadPart, (LONGLONG)4 * 1024 * 1024), '\0');
    DWORD read = 0;
    if (!raw.empty()) ReadFile(h, &raw[0], (DWORD)raw.size(), &read, nullptr);
    CloseHandle(h);
    raw.resize(read);
    a.screenInput = toW(raw);
    a.message = tr(L"Address list loaded.", L"Adressliste geladen.");
}

void exportTraceJson(App& a) {
    const ChainMeta& chain = chainAt(a.traceChain);
    Json root = Json::object();
    root.set(L"start", Json::of(a.traceStart));
    root.set(L"chain", Json::of(chain.id));
    root.set(L"mode", Json::of(a.traceMode == 1 ? L"utxo" : L"address"));
    root.set(L"direction",
             Json::of(a.traceDir == 1 ? L"backward" : a.traceDir == 2 ? L"both" : L"forward"));

    Json stats = Json::object();
    stats.set(L"addresses", Json::of(a.trace.addresses));
    stats.set(L"txs", Json::of(a.trace.txs));
    stats.set(L"clusters", Json::of(a.trace.clusters));
    stats.set(L"riskAddresses", Json::of(a.trace.riskAddresses));
    stats.set(L"riskInflowSat", Json::of(a.trace.riskInflowSat));
    stats.set(L"taintedOutSat", Json::of(a.trace.taintedOutSat));
    stats.set(L"apiCalls", Json::of(a.trace.apiCalls));
    stats.set(L"durationMs", Json::of(a.trace.durationMs));
    root.set(L"stats", stats);

    Json nodes = Json::array();
    for (const GNode& n : a.trace.nodes) {
        Json o = Json::object();
        o.set(L"id", Json::of(n.id));
        o.set(L"type", Json::of(n.isAddress ? L"address" : L"tx"));
        if (n.isAddress) {
            o.set(L"address", Json::of(n.address));
            o.set(L"risk", Json::of(n.risk));
            o.set(L"receivedSat", Json::of(n.receivedSat));
            o.set(L"sentSat", Json::of(n.sentSat));
            o.set(L"clusterId", Json::of(n.clusterId));
            if (!n.label.empty()) {
                o.set(L"label", Json::of(n.label));
                o.set(L"labelSource", Json::of(n.labelSource));
            }
            if (n.isRiskSource) o.set(L"isRiskSource", Json::of(true));
            if (n.riskFromRatio > 0) o.set(L"riskFromRatio", Json::of(n.riskFromRatio));
            if (n.taintRatio > 0) o.set(L"taintRatio", Json::of(n.taintRatio));
        } else {
            o.set(L"txid", Json::of(n.txid));
            o.set(L"inputCount", Json::of(n.inputCount));
            o.set(L"outputCount", Json::of(n.outputCount));
            o.set(L"totalOutSat", Json::of(n.totalOutSat));
            o.set(L"feeSat", Json::of(n.feeSat));
            o.set(L"blockTime", Json::of(n.blockTime));
            o.set(L"blockHeight", Json::of(n.blockHeight));
        }
        o.set(L"depth", Json::of(n.depth));
        nodes.push(o);
    }
    root.set(L"nodes", nodes);

    Json edges = Json::array();
    for (const GEdge& e : a.trace.edges) {
        Json o = Json::object();
        o.set(L"source", Json::of(e.from));
        o.set(L"target", Json::of(e.to));
        o.set(L"valueSat", Json::of(e.valueSat));
        if (e.change) o.set(L"change", Json::of(true));
        if (e.risky) o.set(L"risky", Json::of(true));
        edges.push(o);
    }
    root.set(L"edges", edges);

    std::wstring path = askSavePath(L"trace.json", L"JSON\0*.json\0\0", L"json");
    if (path.empty()) return;
    a.message = writeTextFile(path, root.dump() + L"\n")
                    ? tr(L"Exported to ", L"Gespeichert unter ") + path
                    : tr(L"Export failed.", L"Export fehlgeschlagen.");
}

void exportScreenCsv(App& a) {
    std::wstring csv = tr(L"address;result;labels;sources\n", L"Adresse;Ergebnis;Labels;Quellen\n");
    for (const ScreenResultRow& r : a.screenResults) {
        csv += r.address + L";" + r.verdict + L";" + r.labels + L";" + r.sources + L"\n";
    }
    std::wstring path = askSavePath(L"screening.csv", L"CSV\0*.csv\0\0", L"csv");
    if (path.empty()) return;
    a.message = writeTextFile(path, csv) ? tr(L"Exported to ", L"Gespeichert unter ") + path
                                         : tr(L"Export failed.", L"Export fehlgeschlagen.");
}

void exportStoreCopy(App& a) {
    std::wstring text;
    Json dummy;
    (void)dummy;
    std::wstring path = askSavePath(L"chainer-backup.json", L"JSON\0*.json\0\0", L"json");
    if (path.empty()) return;
    // Der aktuelle Stand steht bereits in der Ablagedatei; sie wird kopiert.
    storeSave(a);
    a.message = CopyFileW(storePath().c_str(), path.c_str(), FALSE)
                    ? tr(L"Copied to ", L"Kopiert nach ") + path
                    : tr(L"Copy failed.", L"Kopieren fehlgeschlagen.");
    (void)text;
}
