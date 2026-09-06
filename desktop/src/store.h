// ---------------------------------------------------------------------------
// store.h - Ablage der Daten in einer JSON-Datei.
//
// Die Desktop-Fassung kennt weder Anmeldung noch Datenbank. Alles, was der
// Anwender anlegt (eigene Labels, Beobachtungen, Fälle, Aufträge, Keys und
// Einstellungen), steht in einer einzigen lesbaren Datei:
//
//     %LOCALAPPDATA%\Chainer\chainer.json
//
// Der kleine JSON-Leser und -Schreiber unten kommt ohne Fremdbibliothek aus.
// ---------------------------------------------------------------------------
#pragma once
#include <string>
#include <vector>
#include <utility>

struct App;

// --- Minimaler JSON-Wert ---------------------------------------------------
struct Json {
    enum class T { Null, Bool, Num, Str, Arr, Obj } t = T::Null;
    bool b = false;
    double num = 0;
    std::wstring str;
    std::vector<Json> arr;
    std::vector<std::pair<std::wstring, Json>> obj;   // Reihenfolge bleibt erhalten

    static Json object() { Json j; j.t = T::Obj; return j; }
    static Json array() { Json j; j.t = T::Arr; return j; }
    static Json of(const std::wstring& s) { Json j; j.t = T::Str; j.str = s; return j; }
    static Json of(const wchar_t* s) { return of(std::wstring(s)); }
    static Json of(double v) { Json j; j.t = T::Num; j.num = v; return j; }
    static Json of(long long v) { return of((double)v); }
    static Json of(int v) { return of((double)v); }
    static Json of(bool v) { Json j; j.t = T::Bool; j.b = v; return j; }

    void set(const std::wstring& key, Json v);
    void push(Json v) { t = T::Arr; arr.push_back(std::move(v)); }

    const Json* find(const std::wstring& key) const;
    std::wstring s(const std::wstring& key, const std::wstring& def = L"") const;
    double n(const std::wstring& key, double def = 0) const;
    long long i(const std::wstring& key, long long def = 0) const;
    bool flag(const std::wstring& key, bool def = false) const;
    const Json* a(const std::wstring& key) const;   // Feld als Array, sonst nullptr

    std::wstring dump(int indent = 0) const;
};

bool jsonParse(const std::wstring& text, Json& out);

// --- Ablage ----------------------------------------------------------------
// Zugangsdaten werden mit der Windows-Datenschutz-API (DPAPI) an das
// Benutzerkonto gebunden verschlüsselt; in der JSON-Datei steht nur der
// Geheimtext in Base64.
std::wstring secretProtect(const std::wstring& plain);
std::wstring secretUnprotect(const std::wstring& blob);

std::wstring storePath();      // vollständiger Pfad der JSON-Datei
bool storeLoad(App& a);        // false, wenn noch keine Datei vorhanden ist
bool storeSave(const App& a);
