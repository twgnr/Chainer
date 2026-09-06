// ---------------------------------------------------------------------------
// store.cpp - JSON lesen/schreiben und die Ablage der Anwendung.
// ---------------------------------------------------------------------------
#include "app.h"
#include "store.h"
#include <shlobj.h>
#include <wincrypt.h>
#include <cstdio>
#include <cwchar>

#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "crypt32.lib")

// ---------------------------------------------------------------------------
// Zugangsdaten verschlüsseln
//
// CryptProtectData bindet den Geheimtext an das Windows-Benutzerkonto: eine
// kopierte JSON-Datei lässt sich auf einem anderen Rechner nicht auslesen.
// ---------------------------------------------------------------------------
static std::wstring toBase64(const BYTE* data, DWORD len) {
    DWORD chars = 0;
    CryptBinaryToStringW(data, len, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &chars);
    std::wstring out(chars, L'\0');
    CryptBinaryToStringW(data, len, CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, &out[0], &chars);
    out.resize(chars);
    return out;
}

static bool fromBase64(const std::wstring& s, std::vector<BYTE>& out) {
    DWORD len = 0;
    if (!CryptStringToBinaryW(s.c_str(), (DWORD)s.size(), CRYPT_STRING_BASE64, nullptr, &len, nullptr,
                              nullptr))
        return false;
    out.resize(len);
    return CryptStringToBinaryW(s.c_str(), (DWORD)s.size(), CRYPT_STRING_BASE64, out.data(), &len, nullptr,
                                nullptr) != 0;
}

std::wstring secretProtect(const std::wstring& plain) {
    if (plain.empty()) return L"";
    DATA_BLOB in{(DWORD)((plain.size() + 1) * sizeof(wchar_t)), (BYTE*)plain.c_str()};
    DATA_BLOB out{};
    if (!CryptProtectData(&in, L"Chainer", nullptr, nullptr, nullptr, 0, &out)) return L"";
    std::wstring b64 = toBase64(out.pbData, out.cbData);
    LocalFree(out.pbData);
    return b64;
}

std::wstring secretUnprotect(const std::wstring& blob) {
    if (blob.empty()) return L"";
    std::vector<BYTE> raw;
    if (!fromBase64(blob, raw) || raw.empty()) return L"";
    DATA_BLOB in{(DWORD)raw.size(), raw.data()};
    DATA_BLOB out{};
    if (!CryptUnprotectData(&in, nullptr, nullptr, nullptr, nullptr, 0, &out)) return L"";
    std::wstring plain((const wchar_t*)out.pbData);
    SecureZeroMemory(out.pbData, out.cbData);
    LocalFree(out.pbData);
    return plain;
}

// ---------------------------------------------------------------------------
// JSON-Wert
// ---------------------------------------------------------------------------
void Json::set(const std::wstring& key, Json v) {
    t = T::Obj;
    for (auto& kv : obj) {
        if (kv.first == key) { kv.second = std::move(v); return; }
    }
    obj.emplace_back(key, std::move(v));
}

const Json* Json::find(const std::wstring& key) const {
    if (t != T::Obj) return nullptr;
    for (const auto& kv : obj)
        if (kv.first == key) return &kv.second;
    return nullptr;
}

std::wstring Json::s(const std::wstring& key, const std::wstring& def) const {
    const Json* j = find(key);
    return (j && j->t == T::Str) ? j->str : def;
}
double Json::n(const std::wstring& key, double def) const {
    const Json* j = find(key);
    return (j && j->t == T::Num) ? j->num : def;
}
long long Json::i(const std::wstring& key, long long def) const {
    const Json* j = find(key);
    return (j && j->t == T::Num) ? (long long)j->num : def;
}
bool Json::flag(const std::wstring& key, bool def) const {
    const Json* j = find(key);
    return (j && j->t == T::Bool) ? j->b : def;
}
const Json* Json::a(const std::wstring& key) const {
    const Json* j = find(key);
    return (j && j->t == T::Arr) ? j : nullptr;
}

// --- Schreiben -------------------------------------------------------------
static void escapeInto(const std::wstring& s, std::wstring& out) {
    out += L'"';
    for (wchar_t c : s) {
        switch (c) {
        case L'"': out += L"\\\""; break;
        case L'\\': out += L"\\\\"; break;
        case L'\n': out += L"\\n"; break;
        case L'\r': out += L"\\r"; break;
        case L'\t': out += L"\\t"; break;
        default:
            if (c < 0x20) {
                wchar_t buf[8];
                swprintf(buf, 8, L"\\u%04x", (unsigned)c);
                out += buf;
            } else {
                out += c;
            }
        }
    }
    out += L'"';
}

static void numberInto(double v, std::wstring& out) {
    wchar_t buf[64];
    if (v == (long long)v && v < 9.0e15 && v > -9.0e15) swprintf(buf, 64, L"%lld", (long long)v);
    else swprintf(buf, 64, L"%.10g", v);
    out += buf;
}

static void dumpInto(const Json& j, int indent, std::wstring& out) {
    std::wstring pad(indent * 2, L' ');
    std::wstring pad2((indent + 1) * 2, L' ');
    switch (j.t) {
    case Json::T::Null: out += L"null"; break;
    case Json::T::Bool: out += j.b ? L"true" : L"false"; break;
    case Json::T::Num: numberInto(j.num, out); break;
    case Json::T::Str: escapeInto(j.str, out); break;
    case Json::T::Arr:
        if (j.arr.empty()) { out += L"[]"; break; }
        out += L"[\n";
        for (size_t k = 0; k < j.arr.size(); k++) {
            out += pad2;
            dumpInto(j.arr[k], indent + 1, out);
            if (k + 1 < j.arr.size()) out += L',';
            out += L'\n';
        }
        out += pad + L"]";
        break;
    case Json::T::Obj:
        if (j.obj.empty()) { out += L"{}"; break; }
        out += L"{\n";
        for (size_t k = 0; k < j.obj.size(); k++) {
            out += pad2;
            escapeInto(j.obj[k].first, out);
            out += L": ";
            dumpInto(j.obj[k].second, indent + 1, out);
            if (k + 1 < j.obj.size()) out += L',';
            out += L'\n';
        }
        out += pad + L"}";
        break;
    }
}

std::wstring Json::dump(int indent) const {
    std::wstring out;
    dumpInto(*this, indent, out);
    return out;
}

// --- Lesen -----------------------------------------------------------------
namespace {
struct Parser {
    const std::wstring& s;
    size_t i = 0;
    explicit Parser(const std::wstring& text) : s(text) {}

    void ws() {
        while (i < s.size() && (s[i] == L' ' || s[i] == L'\t' || s[i] == L'\n' || s[i] == L'\r')) i++;
    }
    bool lit(const wchar_t* w) {
        size_t n = wcslen(w);
        if (s.compare(i, n, w) != 0) return false;
        i += n;
        return true;
    }
    bool value(Json& out) {
        ws();
        if (i >= s.size()) return false;
        wchar_t c = s[i];
        if (c == L'{') return objectV(out);
        if (c == L'[') return arrayV(out);
        if (c == L'"') { out.t = Json::T::Str; return stringV(out.str); }
        if (lit(L"true")) { out.t = Json::T::Bool; out.b = true; return true; }
        if (lit(L"false")) { out.t = Json::T::Bool; out.b = false; return true; }
        if (lit(L"null")) { out.t = Json::T::Null; return true; }
        return numberV(out);
    }
    bool stringV(std::wstring& out) {
        if (s[i] != L'"') return false;
        i++;
        out.clear();
        while (i < s.size() && s[i] != L'"') {
            wchar_t c = s[i++];
            if (c != L'\\') { out += c; continue; }
            if (i >= s.size()) return false;
            wchar_t e = s[i++];
            switch (e) {
            case L'n': out += L'\n'; break;
            case L'r': out += L'\r'; break;
            case L't': out += L'\t'; break;
            case L'b': out += L'\b'; break;
            case L'f': out += L'\f'; break;
            case L'u': {
                if (i + 4 > s.size()) return false;
                unsigned v = 0;
                for (int k = 0; k < 4; k++) {
                    wchar_t h = s[i + k];
                    v <<= 4;
                    if (h >= L'0' && h <= L'9') v |= (unsigned)(h - L'0');
                    else if (h >= L'a' && h <= L'f') v |= (unsigned)(h - L'a' + 10);
                    else if (h >= L'A' && h <= L'F') v |= (unsigned)(h - L'A' + 10);
                    else return false;
                }
                i += 4;
                out += (wchar_t)v;
                break;
            }
            default: out += e;
            }
        }
        if (i >= s.size()) return false;
        i++;   // schliessendes "
        return true;
    }
    bool numberV(Json& out) {
        size_t start = i;
        if (i < s.size() && (s[i] == L'-' || s[i] == L'+')) i++;
        while (i < s.size() && ((s[i] >= L'0' && s[i] <= L'9') || s[i] == L'.' || s[i] == L'e' ||
                               s[i] == L'E' || s[i] == L'-' || s[i] == L'+'))
            i++;
        if (i == start) return false;
        out.t = Json::T::Num;
        out.num = wcstod(s.substr(start, i - start).c_str(), nullptr);
        return true;
    }
    bool arrayV(Json& out) {
        out = Json::array();
        i++;   // [
        ws();
        if (i < s.size() && s[i] == L']') { i++; return true; }
        for (;;) {
            Json v;
            if (!value(v)) return false;
            out.arr.push_back(std::move(v));
            ws();
            if (i < s.size() && s[i] == L',') { i++; continue; }
            if (i < s.size() && s[i] == L']') { i++; return true; }
            return false;
        }
    }
    bool objectV(Json& out) {
        out = Json::object();
        i++;   // {
        ws();
        if (i < s.size() && s[i] == L'}') { i++; return true; }
        for (;;) {
            ws();
            std::wstring key;
            if (i >= s.size() || s[i] != L'"' || !stringV(key)) return false;
            ws();
            if (i >= s.size() || s[i] != L':') return false;
            i++;
            Json v;
            if (!value(v)) return false;
            out.obj.emplace_back(key, std::move(v));
            ws();
            if (i < s.size() && s[i] == L',') { i++; continue; }
            if (i < s.size() && s[i] == L'}') { i++; return true; }
            return false;
        }
    }
};
}  // namespace

bool jsonParse(const std::wstring& text, Json& out) {
    Parser p(text);
    if (!p.value(out)) return false;
    p.ws();
    return true;
}

// ---------------------------------------------------------------------------
// Dateiablage
// ---------------------------------------------------------------------------
static std::wstring storeDir() {
    wchar_t* base = nullptr;
    std::wstring dir;
    if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &base)) && base) {
        dir = base;
        CoTaskMemFree(base);
    } else {
        wchar_t buf[MAX_PATH];
        GetTempPathW(MAX_PATH, buf);
        dir = buf;
    }
    dir += L"\\Chainer";
    return dir;
}

std::wstring storePath() { return storeDir() + L"\\chainer.json"; }

static bool readFileUtf8(const std::wstring& path, std::wstring& out) {
    HANDLE h = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                           FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    LARGE_INTEGER size{};
    GetFileSizeEx(h, &size);
    std::string raw((size_t)size.QuadPart, '\0');
    DWORD read = 0;
    if (size.QuadPart > 0) ReadFile(h, &raw[0], (DWORD)size.QuadPart, &read, nullptr);
    CloseHandle(h);
    raw.resize(read);
    if (raw.size() >= 3 && (unsigned char)raw[0] == 0xEF && (unsigned char)raw[1] == 0xBB &&
        (unsigned char)raw[2] == 0xBF)
        raw = raw.substr(3);
    out = toW(raw);
    return true;
}

static bool writeFileUtf8(const std::wstring& path, const std::wstring& text) {
    SHCreateDirectoryExW(nullptr, storeDir().c_str(), nullptr);
    // Erst in eine Nebendatei schreiben, dann ersetzen - so bleibt bei einem
    // Absturz mitten im Schreiben die alte Datei heil.
    std::wstring tmp = path + L".tmp";
    HANDLE h = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    std::string raw = toU8(text);
    DWORD written = 0;
    BOOL ok = WriteFile(h, raw.data(), (DWORD)raw.size(), &written, nullptr);
    CloseHandle(h);
    if (!ok) return false;
    return MoveFileExW(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING) != 0;
}

// ---------------------------------------------------------------------------
// Abbildung App <-> JSON
// ---------------------------------------------------------------------------
bool storeSave(const App& a) {
    Json root = Json::object();
    root.set(L"app", Json::of(L"Chainer"));
    root.set(L"version", Json::of(APP_VERSION));

    Json settings = Json::object();
    settings.set(L"theme", Json::of(a.theme == ThemeChoice::Light   ? L"light"
                                    : a.theme == ThemeChoice::Dark  ? L"dark"
                                                                    : L"system"));
    settings.set(L"locale", Json::of(g_locale == Loc::De ? L"de" : L"en"));
    settings.set(L"providerChain", Json::of(a.providerChain));
    root.set(L"settings", settings);

    // Zugangsdaten: verschlüsselt, nie im Klartext
    Json creds = Json::object();
    creds.set(L"blockcypher", Json::of(secretProtect(a.keys.blockcypher)));
    creds.set(L"blockchair", Json::of(secretProtect(a.keys.blockchair)));
    creds.set(L"etherscan", Json::of(secretProtect(a.keys.etherscan)));
    creds.set(L"trongrid", Json::of(secretProtect(a.keys.trongrid)));
    creds.set(L"chainabuse", Json::of(secretProtect(a.keys.chainabuse)));
    creds.set(L"bitcoinwhoswho", Json::of(secretProtect(a.keys.whoswho)));
    creds.set(L"blockscoutBase", Json::of(a.keys.blockscoutBase));   // keine Geheimnis
    root.set(L"credentials", creds);

    Json annotations = Json::array();
    for (const AnnotationRow& r : a.annotations) {
        Json o = Json::object();
        o.set(L"id", Json::of(r.id));
        o.set(L"address", Json::of(r.address));
        o.set(L"label", Json::of(r.label));
        o.set(L"note", Json::of(r.note));
        o.set(L"category", Json::of(r.category));
        o.set(L"chain", Json::of(r.chain));
        o.set(L"risk", Json::of(r.risk));
        o.set(L"updatedAt", Json::of(r.updatedAt));
        annotations.push(o);
    }
    root.set(L"annotations", annotations);

    Json watches = Json::array();
    for (const WatchRow& r : a.watches) {
        Json o = Json::object();
        o.set(L"id", Json::of(r.id));
        o.set(L"address", Json::of(r.address));
        o.set(L"note", Json::of(r.note));
        o.set(L"chain", Json::of(r.chain));
        o.set(L"balanceSat", Json::of(r.balanceSat));
        o.set(L"txCount", Json::of(r.txCount));
        o.set(L"lastCheck", Json::of(r.lastCheck));
        o.set(L"paused", Json::of(r.paused));
        Json events = Json::array();
        for (const WatchEvent& e : r.events) {
            Json ev = Json::object();
            ev.set(L"at", Json::of(e.at));
            ev.set(L"kind", Json::of(e.kind));
            ev.set(L"text", Json::of(e.text));
            ev.set(L"read", Json::of(e.read));
            events.push(ev);
        }
        o.set(L"events", events);
        watches.push(o);
    }
    root.set(L"watches", watches);

    Json cases = Json::array();
    for (const CaseRow& r : a.cases) {
        Json o = Json::object();
        o.set(L"id", Json::of(r.id));
        o.set(L"name", Json::of(r.name));
        o.set(L"start", Json::of(r.start));
        o.set(L"chain", Json::of(r.chain));
        o.set(L"mode", Json::of(r.mode));
        o.set(L"direction", Json::of(r.direction));
        o.set(L"traces", Json::of(r.traces));
        o.set(L"depth", Json::of(r.depth));
        o.set(L"updatedAt", Json::of(r.updatedAt));
        cases.push(o);
    }
    root.set(L"cases", cases);



    return writeFileUtf8(storePath(), root.dump() + L"\n");
}

bool storeLoad(App& a) {
    std::wstring text;
    if (!readFileUtf8(storePath(), text)) return false;
    Json root;
    if (!jsonParse(text, root) || root.t != Json::T::Obj) return false;

    if (const Json* s = root.find(L"settings")) {
        std::wstring th = s->s(L"theme", L"dark");
        a.theme = th == L"light" ? ThemeChoice::Light : th == L"system" ? ThemeChoice::System
                                                                       : ThemeChoice::Dark;
        g_locale = s->s(L"locale", L"en") == L"de" ? Loc::De : Loc::En;
        a.providerChain = (int)s->i(L"providerChain", 0);
    }

    if (const Json* c = root.find(L"credentials")) {
        a.keys.blockcypher = secretUnprotect(c->s(L"blockcypher"));
        a.keys.blockchair = secretUnprotect(c->s(L"blockchair"));
        a.keys.etherscan = secretUnprotect(c->s(L"etherscan"));
        a.keys.trongrid = secretUnprotect(c->s(L"trongrid"));
        a.keys.chainabuse = secretUnprotect(c->s(L"chainabuse"));
        a.keys.whoswho = secretUnprotect(c->s(L"bitcoinwhoswho"));
        a.keys.blockscoutBase = c->s(L"blockscoutBase");
    }

    if (const Json* arr = root.a(L"annotations")) {
        a.annotations.clear();
        for (const Json& o : arr->arr) {
            AnnotationRow r;
            r.id = o.s(L"id");
            r.address = o.s(L"address");
            r.label = o.s(L"label");
            r.note = o.s(L"note");
            r.category = o.s(L"category", L"custom");
            r.chain = o.s(L"chain", L"bitcoin");
            r.risk = o.s(L"risk");
            r.updatedAt = o.i(L"updatedAt");
            a.annotations.push_back(r);
        }
    }

    if (const Json* arr = root.a(L"watches")) {
        a.watches.clear();
        for (const Json& o : arr->arr) {
            WatchRow r;
            r.id = o.s(L"id");
            r.address = o.s(L"address");
            r.note = o.s(L"note");
            r.chain = o.s(L"chain", L"bitcoin");
            r.balanceSat = o.n(L"balanceSat");
            r.txCount = (int)o.i(L"txCount");
            r.lastCheck = o.i(L"lastCheck");
            r.paused = o.flag(L"paused");
            if (const Json* evs = o.a(L"events")) {
                for (const Json& e : evs->arr) {
                    WatchEvent ev;
                    ev.at = e.i(L"at");
                    ev.kind = e.s(L"kind");
                    ev.text = e.s(L"text");
                    ev.read = e.flag(L"read");
                    r.events.push_back(ev);
                }
            }
            a.watches.push_back(r);
        }
    }

    if (const Json* arr = root.a(L"cases")) {
        a.cases.clear();
        for (const Json& o : arr->arr) {
            CaseRow r;
            r.id = o.s(L"id");
            r.name = o.s(L"name");
            r.start = o.s(L"start");
            r.chain = o.s(L"chain", L"bitcoin");
            r.mode = o.s(L"mode", L"address");
            r.direction = o.s(L"direction", L"forward");
            r.traces = (int)o.i(L"traces", 1);
            r.depth = (int)o.i(L"depth", 3);
            r.updatedAt = o.i(L"updatedAt");
            a.cases.push_back(r);
        }
    }

    return true;
}
