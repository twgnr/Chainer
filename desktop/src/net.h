// ---------------------------------------------------------------------------
// net.h - HTTP über WinHTTP und Hintergrundaufträge.
//
// Die Oberfläche darf nie warten. Jede Abfrage läuft deshalb in einem eigenen
// Thread; das Ergebnis landet in einer Warteschlange, die das Fenster beim
// nächsten Bild ausliest (`taskPoll`). Nach jedem fertigen Auftrag wird das
// Fenster geweckt, damit sich die Anzeige sofort aktualisiert.
//
// Es kommt nur WinHTTP aus dem Windows-SDK zum Einsatz - keine Fremdbibliothek.
// ---------------------------------------------------------------------------
#pragma once
#include <windows.h>
#include <string>
#include <vector>
#include <functional>
#include <memory>

// --- Eine HTTP-Antwort -----------------------------------------------------
struct HttpResult {
    bool ok = false;          // Statuscode 2xx und Antwort gelesen
    int status = 0;
    std::wstring body;        // als UTF-8 gelesen und nach UTF-16 gewandelt
    std::wstring error;       // gefüllt, wenn ok == false
    long long ms = 0;         // Dauer der Anfrage
};

struct HttpRequest {
    std::wstring url;
    std::wstring method = L"GET";
    std::wstring body;                                  // für POST
    std::wstring contentType = L"application/json";
    std::vector<std::pair<std::wstring, std::wstring>> headers;
    int timeoutMs = 20000;
};

// Synchron - nur im Hintergrundthread aufrufen.
HttpResult httpFetch(const HttpRequest& req);
HttpResult httpGet(const std::wstring& url, int timeoutMs = 20000);

// URL-Kodierung eines Pfad-/Abfragebestandteils
std::wstring urlEncode(const std::wstring& s);

// ---------------------------------------------------------------------------
// Beweissicherung
//
// Während eines Traces wird jede Anfrage mit Zeitpunkt, Statuscode und der
// SHA-256-Prüfsumme der Antwort festgehalten. Damit lässt sich später belegen,
// welche Quelle wann was geliefert hat.
// ---------------------------------------------------------------------------
struct EvidenceEntry {
    std::wstring url;
    long long at = 0;      // Unix-Sekunden
    int status = 0;
    size_t bytes = 0;
    std::wstring sha256;
};
void evidenceStart();
void evidenceStop();
std::vector<EvidenceEntry> evidenceTake();
std::wstring evidenceDigest(const std::vector<EvidenceEntry>& entries);

// ---------------------------------------------------------------------------
// Hintergrundaufträge
//
// `taskRun` startet die Arbeit in einem Thread. `done` läuft später im
// Oberflächen-Thread, wenn `taskPoll()` aufgerufen wird.
// ---------------------------------------------------------------------------
void taskInit(HWND wakeTarget);
void taskShutdown();

// Startet einen Auftrag. `work` läuft im Hintergrund, `done` im UI-Thread.
// `group` erlaubt es, ältere Aufträge derselben Art zu verwerfen (z. B. wenn
// der Anwender eine neue Adresse öffnet, bevor die alte geladen ist).
// `name` erscheint in der Auftragsliste.
void taskRun(const std::wstring& group, const std::wstring& name, std::function<void()> work,
             std::function<void()> done);
void taskRun(const std::wstring& group, std::function<void()> work, std::function<void()> done);

// Protokoll der Aufträge (für die Seite „Aufträge“)
struct TaskInfo {
    std::wstring id, group, name, status;   // status: running | done | cancelled
    long long created = 0, finished = 0;
};
std::vector<TaskInfo> taskList();
void taskForget(const std::wstring& id);
void taskClearFinished();

// Führt die fertigen Rückmeldungen aus; liefert true, wenn etwas passiert ist.
bool taskPoll();

// Anzahl gerade laufender Aufträge (für Ladeanzeigen).
int taskBusy();

// Verwirft alle noch offenen Rückmeldungen einer Gruppe.
void taskCancelGroup(const std::wstring& group);
