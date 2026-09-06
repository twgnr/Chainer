#include "net.h"
#include "gfx.h"   // toW / toU8
#include <winhttp.h>
#include <thread>
#include <mutex>
#include <deque>
#include <atomic>
#include <bcrypt.h>
#include <vector>
#include <ctime>

#pragma comment(lib, "bcrypt.lib")

#pragma comment(lib, "winhttp.lib")

// ---------------------------------------------------------------------------
// URL zerlegen
// ---------------------------------------------------------------------------
struct UrlParts {
    std::wstring host, path;
    INTERNET_PORT port = 443;
    bool https = true;
    bool ok = false;
};

static UrlParts splitUrl(const std::wstring& url) {
    UrlParts p;
    URL_COMPONENTS uc{};
    uc.dwStructSize = sizeof(uc);
    wchar_t host[256] = {0};
    wchar_t path[4096] = {0};
    wchar_t extra[4096] = {0};
    uc.lpszHostName = host;
    uc.dwHostNameLength = 255;
    uc.lpszUrlPath = path;
    uc.dwUrlPathLength = 4095;
    uc.lpszExtraInfo = extra;
    uc.dwExtraInfoLength = 4095;
    if (!WinHttpCrackUrl(url.c_str(), (DWORD)url.size(), 0, &uc)) return p;
    p.host = host;
    p.path = std::wstring(path) + extra;
    if (p.path.empty()) p.path = L"/";
    p.port = uc.nPort;
    p.https = uc.nScheme == INTERNET_SCHEME_HTTPS;
    p.ok = true;
    return p;
}

std::wstring urlEncode(const std::wstring& s) {
    static const wchar_t* hex = L"0123456789ABCDEF";
    std::string u8 = toU8(s);
    std::wstring out;
    for (unsigned char c : u8) {
        if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' ||
            c == '_' || c == '.' || c == '~') {
            out += (wchar_t)c;
        } else {
            out += L'%';
            out += hex[c >> 4];
            out += hex[c & 0xf];
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Beweissicherung
// ---------------------------------------------------------------------------
namespace {
std::mutex g_evidenceMutex;
std::vector<EvidenceEntry> g_evidence;
bool g_recording = false;
}  // namespace

// SHA-256 über die Windows-Kryptografie (CNG), als Hexzeichenkette.
static std::wstring sha256Hex(const std::string& data) {
    BCRYPT_ALG_HANDLE alg = nullptr;
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, 0) != 0) return L"";
    DWORD hashLen = 0, cb = 0;
    BCryptGetProperty(alg, BCRYPT_HASH_LENGTH, (PUCHAR)&hashLen, sizeof(hashLen), &cb, 0);
    std::vector<UCHAR> hash(hashLen);
    BCRYPT_HASH_HANDLE h = nullptr;
    std::wstring out;
    if (BCryptCreateHash(alg, &h, nullptr, 0, nullptr, 0, 0) == 0) {
        BCryptHashData(h, (PUCHAR)data.data(), (ULONG)data.size(), 0);
        if (BCryptFinishHash(h, hash.data(), hashLen, 0) == 0) {
            static const wchar_t* hex = L"0123456789abcdef";
            for (UCHAR b : hash) {
                out += hex[b >> 4];
                out += hex[b & 0xf];
            }
        }
        BCryptDestroyHash(h);
    }
    BCryptCloseAlgorithmProvider(alg, 0);
    return out;
}

void evidenceStart() {
    std::lock_guard<std::mutex> lock(g_evidenceMutex);
    g_evidence.clear();
    g_recording = true;
}

void evidenceStop() {
    std::lock_guard<std::mutex> lock(g_evidenceMutex);
    g_recording = false;
}

std::vector<EvidenceEntry> evidenceTake() {
    std::lock_guard<std::mutex> lock(g_evidenceMutex);
    return g_evidence;
}

// Gesamtprüfsumme über alle Einzelprüfsummen - eine nachträgliche Änderung an
// irgendeinem Eintrag fällt damit auf.
std::wstring evidenceDigest(const std::vector<EvidenceEntry>& entries) {
    std::string all;
    for (const EvidenceEntry& e : entries) all += toU8(e.sha256);
    return sha256Hex(all);
}

static void evidenceRecord(const std::wstring& url, int status, const std::string& body) {
    std::lock_guard<std::mutex> lock(g_evidenceMutex);
    if (!g_recording || g_evidence.size() >= 5000) return;
    EvidenceEntry e;
    // Ein Key in der Abfrage gehört nicht ins Protokoll.
    size_t k = url.find(L"apikey=");
    if (k == std::wstring::npos) k = url.find(L"token=");
    if (k == std::wstring::npos) k = url.find(L"key=");
    e.url = k == std::wstring::npos ? url : url.substr(0, k) + L"…";
    e.at = (long long)time(nullptr);
    e.status = status;
    e.bytes = body.size();
    e.sha256 = sha256Hex(body);
    g_evidence.push_back(e);
}

// ---------------------------------------------------------------------------
// Anfrage
// ---------------------------------------------------------------------------
static HINTERNET g_session = nullptr;
static std::mutex g_sessionMutex;

static HINTERNET session() {
    std::lock_guard<std::mutex> lock(g_sessionMutex);
    if (!g_session) {
        g_session = WinHttpOpen(L"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chainer/0.95.06",
                                WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                                WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
        if (g_session) {
            DWORD decomp = WINHTTP_DECOMPRESSION_FLAG_ALL;
            WinHttpSetOption(g_session, WINHTTP_OPTION_DECOMPRESSION, &decomp, sizeof(decomp));
            DWORD proto = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2 | WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3;
            WinHttpSetOption(g_session, WINHTTP_OPTION_SECURE_PROTOCOLS, &proto, sizeof(proto));
        }
    }
    return g_session;
}

HttpResult httpFetch(const HttpRequest& req) {
    HttpResult res;
    LARGE_INTEGER freq, t0, t1;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&t0);

    UrlParts u = splitUrl(req.url);
    if (!u.ok) {
        res.error = L"Ungültige URL";
        return res;
    }
    HINTERNET s = session();
    if (!s) {
        res.error = L"WinHttpOpen fehlgeschlagen";
        return res;
    }

    HINTERNET conn = WinHttpConnect(s, u.host.c_str(), u.port, 0);
    if (!conn) {
        res.error = L"Verbindung nicht möglich";
        return res;
    }

    DWORD flags = u.https ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hreq = WinHttpOpenRequest(conn, req.method.c_str(), u.path.c_str(), nullptr,
                                        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hreq) {
        WinHttpCloseHandle(conn);
        res.error = L"Anfrage nicht möglich";
        return res;
    }

    WinHttpSetTimeouts(hreq, req.timeoutMs, req.timeoutMs, req.timeoutMs, req.timeoutMs);

    std::wstring hdr = L"Accept: application/json, text/plain, */*\r\n";
    for (const auto& h : req.headers) hdr += h.first + L": " + h.second + L"\r\n";
    std::string bodyU8;
    if (!req.body.empty()) {
        bodyU8 = toU8(req.body);
        hdr += L"Content-Type: " + req.contentType + L"\r\n";
    }
    if (!hdr.empty()) WinHttpAddRequestHeaders(hreq, hdr.c_str(), (DWORD)-1, WINHTTP_ADDREQ_FLAG_ADD);

    BOOL sent = WinHttpSendRequest(hreq, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                                   bodyU8.empty() ? WINHTTP_NO_REQUEST_DATA : (LPVOID)bodyU8.data(),
                                   (DWORD)bodyU8.size(), (DWORD)bodyU8.size(), 0);
    if (!sent || !WinHttpReceiveResponse(hreq, nullptr)) {
        DWORD err = GetLastError();
        WinHttpCloseHandle(hreq);
        WinHttpCloseHandle(conn);
        res.error = err == ERROR_WINHTTP_TIMEOUT ? L"Zeitüberschreitung"
                    : err == ERROR_WINHTTP_NAME_NOT_RESOLVED
                        ? L"Server nicht gefunden"
                        : L"Keine Antwort (" + std::to_wstring(err) + L")";
        return res;
    }

    DWORD code = 0, len = sizeof(code);
    WinHttpQueryHeaders(hreq, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr, &code, &len,
                        nullptr);
    res.status = (int)code;

    std::string raw;
    for (;;) {
        DWORD avail = 0;
        if (!WinHttpQueryDataAvailable(hreq, &avail) || avail == 0) break;
        size_t off = raw.size();
        raw.resize(off + avail);
        DWORD read = 0;
        if (!WinHttpReadData(hreq, &raw[off], avail, &read)) break;
        raw.resize(off + read);
        if (raw.size() > 40u * 1024u * 1024u) break;   // Notbremse
    }
    WinHttpCloseHandle(hreq);
    WinHttpCloseHandle(conn);

    QueryPerformanceCounter(&t1);
    res.ms = (long long)((t1.QuadPart - t0.QuadPart) * 1000 / freq.QuadPart);

    evidenceRecord(req.url, (int)code, raw);
    res.body = toW(raw);
    if (code >= 200 && code < 300) {
        res.ok = true;
    } else {
        res.error = L"HTTP " + std::to_wstring(code);
        if (code == 429) res.error += L" (Limit erreicht)";
    }
    return res;
}

HttpResult httpGet(const std::wstring& url, int timeoutMs) {
    HttpRequest r;
    r.url = url;
    r.timeoutMs = timeoutMs;
    return httpFetch(r);
}

// ---------------------------------------------------------------------------
// Auftragsverwaltung
// ---------------------------------------------------------------------------
namespace {
struct Task {
    std::wstring group;
    std::function<void()> done;
    unsigned long long serial = 0;
};

std::mutex g_mutex;
std::deque<Task> g_ready;
std::atomic<int> g_busy{0};
std::atomic<unsigned long long> g_serial{0};
HWND g_wake = nullptr;
bool g_shutdown = false;

std::mutex g_logMutex;
std::vector<TaskInfo> g_log;
}  // namespace

void taskInit(HWND wakeTarget) { g_wake = wakeTarget; }

void taskShutdown() {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_shutdown = true;
    g_ready.clear();
}

void taskRun(const std::wstring& group, const std::wstring& name, std::function<void()> work,
             std::function<void()> done) {
    g_busy++;
    unsigned long long serial = ++g_serial;
    std::wstring id = std::to_wstring(serial);
    {
        std::lock_guard<std::mutex> lock(g_logMutex);
        TaskInfo t;
        t.id = id;
        t.group = group;
        t.name = name;
        t.status = L"running";
        t.created = (long long)time(nullptr);
        g_log.insert(g_log.begin(), t);
        if (g_log.size() > 80) g_log.resize(80);
    }
    std::thread([group, name, work, done, serial, id]() {
        try {
            work();
        } catch (...) {
            /* Ein Anbieterfehler darf die Anwendung nicht beenden. */
        }
        {
            std::lock_guard<std::mutex> lock(g_logMutex);
            for (TaskInfo& t : g_log)
                if (t.id == id) {
                    t.status = L"done";
                    t.finished = (long long)time(nullptr);
                }
        }
        {
            std::lock_guard<std::mutex> lock(g_mutex);
            if (!g_shutdown) g_ready.push_back(Task{group, done, serial});
        }
        g_busy--;
        if (g_wake) PostMessageW(g_wake, WM_APP + 1, 0, 0);
    }).detach();
}

void taskRun(const std::wstring& group, std::function<void()> work, std::function<void()> done) {
    taskRun(group, group, work, done);
}

std::vector<TaskInfo> taskList() {
    std::lock_guard<std::mutex> lock(g_logMutex);
    return g_log;
}

void taskForget(const std::wstring& id) {
    std::lock_guard<std::mutex> lock(g_logMutex);
    for (auto it = g_log.begin(); it != g_log.end(); ++it)
        if (it->id == id) {
            g_log.erase(it);
            return;
        }
}

void taskClearFinished() {
    std::lock_guard<std::mutex> lock(g_logMutex);
    for (auto it = g_log.begin(); it != g_log.end();) {
        if (it->status != L"running") it = g_log.erase(it);
        else ++it;
    }
}

bool taskPoll() {
    std::deque<Task> batch;
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        batch.swap(g_ready);
    }
    if (batch.empty()) return false;
    for (Task& t : batch)
        if (t.done) t.done();
    return true;
}

int taskBusy() { return g_busy.load(); }

void taskCancelGroup(const std::wstring& group) {
    std::lock_guard<std::mutex> lock(g_mutex);
    for (auto it = g_ready.begin(); it != g_ready.end();) {
        if (it->group == group) it = g_ready.erase(it);
        else ++it;
    }
}
