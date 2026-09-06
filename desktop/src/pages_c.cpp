// ---------------------------------------------------------------------------
// pages_c.cpp - Einstellungen, API, Anmeldung, Adressseite.
// Vorbilder: src/app/settings/page.tsx, api-docs/page.tsx, AuthForm.tsx,
// src/app/address/[addr]/page.tsx.
// ---------------------------------------------------------------------------
#include "app.h"
#include "store.h"
#include <ctime>
#include <cmath>

// ---------------------------------------------------------------------------
// Einstellungen
//
// Die Desktop-Fassung kennt kein Konto und keinen Server; statt der Formulare
// fuer Keys, Sitzungen und Zugriffstoken steht hier, wo die eigenen Daten
// liegen und wie man sie sichert.
// ---------------------------------------------------------------------------
static float storageCard(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    CardCtx c = cardBegin(u, x, y, w);
    float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;

    u.p->text(tr(L"Local storage", L"Lokale Ablage"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold),
              th.foreground);
    cy += 26.f;
    std::wstring lead = tr(L"Cases, watches, your own labels and your API keys are kept in a single file "
                           L"on this computer. There is neither an account nor a database; keys are "
                           L"stored encrypted.",
                           L"Fälle, Beobachtungen, eigene Labels und die API-Keys stehen in einer einzigen "
                           L"Datei auf diesem Rechner. Es gibt weder ein Konto noch eine Datenbank; Keys "
                           L"werden verschlüsselt abgelegt.");
    float lh = textH(u, lead, fSm(), innerW);
    u.p->text(lead, Rect(cx, cy, innerW, lh), fSm(), th.muted, Align::Left, true);
    cy += lh + 12.f;

    fieldLabel(u, cx, cy, tr(L"File", L"Datei"));
    cy += LABEL_H;
    std::wstring path = storePath();
    float ph = textH(u, path, mXs(), innerW);
    u.p->text(path, Rect(cx, cy, innerW, ph), mXs(), th.fg2, Align::Left, true);
    cy += ph + 12.f;

    Row row(u, cx, cy, innerW, 12.f, 8.f, BTN_H);
    std::wstring b1 = tr(L"Open the folder", L"Ordner öffnen");
    if (btn(u, L"st-open", row.place(btnW(u, b1), BTN_H), b1, Btn::Secondary)) {
        std::wstring dir = path.substr(0, path.find_last_of(L'\\'));
        openUrl(dir);
    }
    std::wstring b2 = tr(L"Save a copy", L"Kopie sichern");
    if (btn(u, L"st-copy", row.place(btnW(u, b2), BTN_H), b2, Btn::Secondary)) exportStoreCopy(a);
    std::wstring b3 = tr(L"Delete all data", L"Alle Daten löschen");
    if (btn(u, L"st-reset", row.place(btnW(u, b3), BTN_H), b3, Btn::Secondary)) {
        loadDemoData(a);
        a.message = tr(L"All local data deleted.", L"Alle lokalen Daten gelöscht.");
        a.dirty = true;
    }
    cy += row.height();

    if (!a.message.empty()) {
        cy += 8.f;
        float mh = textH(u, a.message, fSm(), innerW);
        u.p->text(a.message, Rect(cx, cy, innerW, mh), fSm(), th.tw(Tw::Green400), Align::Left, true);
        cy += mh;
    }
    return cardEnd(u, c, cy - c.inner);
}

// Zugangsdaten der Datenquellen. Sie werden verschlüsselt in der JSON-Datei
// abgelegt (DPAPI, an das Windows-Konto gebunden).
static float keysCard(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    CardCtx c = cardBegin(u, x, y, w);
    float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;

    u.p->text(tr(L"API keys", L"API-Keys"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
    cy += 26.f;
    std::wstring lead = tr(L"Optional. A key raises the limits of a source or unlocks it. Keys are stored "
                           L"encrypted with the Windows data protection API and never leave this computer "
                           L"except towards the source itself.",
                           L"Freiwillig. Ein Key hebt die Grenzen einer Quelle an oder schaltet sie frei. "
                           L"Keys werden mit der Windows-Datenschutz-API verschlüsselt gespeichert und "
                           L"verlassen den Rechner nur in Richtung der Quelle selbst.");
    float lh = textH(u, lead, fSm(), innerW);
    u.p->text(lead, Rect(cx, cy, innerW, lh), fSm(), th.muted, Align::Left, true);
    cy += lh + 12.f;

    struct KF { const wchar_t* label; const wchar_t* hint; const wchar_t* link; std::wstring* v; bool secret; };
    KF fields[7] = {
        {L"BlockCypher", L"blockcypher.com", L"https://accounts.blockcypher.com/", &a.keys.blockcypher, true},
        {L"Blockchair", L"blockchair.com", L"https://blockchair.com/api/plans", &a.keys.blockchair, true},
        {L"Etherscan", L"etherscan.io (ETH, Polygon, Arbitrum)", L"https://etherscan.io/apis",
         &a.keys.etherscan, true},
        {L"TronGrid", L"trongrid.io", L"https://www.trongrid.io/", &a.keys.trongrid, true},
        {L"Chainabuse", L"chainabuse.com", L"https://www.chainabuse.com/", &a.keys.chainabuse, true},
        {L"Bitcoin Who's Who", L"bitcoinwhoswho.com", L"https://www.bitcoinwhoswho.com/api",
         &a.keys.whoswho, true},
        {L"Blockscout", nullptr, nullptr, &a.keys.blockscoutBase, false},
    };

    int cols = w >= 1024.f ? 3 : (w >= 640.f ? 2 : 1);
    float gap = 12.f;
    float unit = (innerW - gap * (cols - 1)) / cols;
    float rowH = LABEL_H + INPUT_H + 18.f + gap;
    for (int i = 0; i < 7; i++) {
        float fx = cx + (i % cols) * (unit + gap);
        float fy = cy + (i / cols) * rowH;
        fieldLabel(u, fx, fy, fields[i].label);
        wchar_t id[32];
        swprintf(id, 32, L"key%d", i);
        if (inputBox(u, id, Rect(fx, fy + LABEL_H, unit, INPUT_H), *fields[i].v,
                     fields[i].secret ? tr(L"(no key)", L"(kein Key)") : L"https://…", true, 13.f))
            a.dirty = true;
        Rect hintR(fx, fy + LABEL_H + INPUT_H + 3.f, unit, 16.f);
        if (fields[i].link) {
            if (link(u, std::wstring(L"keylink") + fields[i].label, hintR, fields[i].hint, fXs(), th.brand))
                openUrl(fields[i].link);
        } else {
            std::wstring hint = fields[i].hint
                                    ? std::wstring(fields[i].hint)
                                    : tr(L"your own instance, e.g. https://eth.blockscout.com/api/v2",
                                         L"eigene Instanz, z. B. https://eth.blockscout.com/api/v2");
            u.p->text(truncate(u, hint, fXs(), unit), hintR, fXs(), th.subtle);
            tooltip(u, hintR, hint);
        }
    }
    cy += ((7 + cols - 1) / cols) * rowH;

    Row row(u, cx, cy, innerW, 12.f, 8.f, BTN_H);
    std::wstring save2 = tr(L"Save", L"Speichern");
    if (btn(u, L"keys-save", row.place(btnW(u, save2), BTN_H), save2, Btn::Primary)) {
        a.dirty = true;
        a.message = tr(L"Keys saved.", L"Keys gespeichert.");
    }
    std::wstring test = a.pinging ? tr(L"Checking…", L"Prüfe…") : tr(L"Test the sources", L"Quellen testen");
    if (btn(u, L"keys-test", row.place(btnW(u, test), BTN_H), test, Btn::Secondary, a.pinging))
        livePingProviders(a);
    cy += row.height();
    return cardEnd(u, c, cy - c.inner);
}

static float appearanceCard(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    CardCtx c = cardBegin(u, x, y, w);
    float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;

    u.p->text(tr(L"Language & colour scheme", L"Sprache & Farbschema"), Rect(cx, cy, innerW, 24.f),
              fBase(Wt::Semibold), th.foreground);
    cy += 28.f;

    int cols = w >= 900.f ? 2 : 1;
    float gap = 12.f;
    float unit = (innerW - gap * (cols - 1)) / cols;

    fieldLabel(u, cx, cy, tr(L"Language", L"Sprache"));
    std::vector<std::wstring> langs = {L"English", L"Deutsch"};
    int li = g_locale == Loc::De ? 1 : 0;
    if (selectBox(u, L"set-lang", Rect(cx, cy + LABEL_H, unit, INPUT_H), langs, li)) {
        g_locale = li == 1 ? Loc::De : Loc::En;
        a.dirty = true;
    }

    float fx = cols > 1 ? cx + unit + gap : cx;
    float fy = cols > 1 ? cy : cy + LABEL_H + INPUT_H + gap;
    fieldLabel(u, fx, fy, tr(L"Colour scheme", L"Farbschema"));
    std::vector<std::wstring> themes = {tr(L"Light", L"Hell"), tr(L"Dark", L"Dunkel"),
                                        tr(L"System", L"System")};
    int ti = a.theme == ThemeChoice::Light ? 0 : a.theme == ThemeChoice::Dark ? 1 : 2;
    if (selectBox(u, L"set-theme", Rect(fx, fy + LABEL_H, unit, INPUT_H), themes, ti)) {
        a.theme = ti == 0 ? ThemeChoice::Light : ti == 1 ? ThemeChoice::Dark : ThemeChoice::System;
        a.dirty = true;
    }
    cy = fy + LABEL_H + INPUT_H;
    return cardEnd(u, c, cy - c.inner);
}

float pageSettings(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    Col col(u, x, y, w, 24.f);   // space-y-6
    {
        float cy = col.startBlock();
        float y0 = cy;
        cy += sectionHeading(a, x, cy, w, tr(L"Data sources & storage", L"Datenquellen & Ablage")) + 4.f;
        std::wstring lead = tr(L"The sources this application queries. Most of them work without a key; "
                               L"your own key raises the limits or unlocks a source.",
                               L"Die Quellen, die diese Anwendung abfragt. Die meisten arbeiten ohne Key; "
                               L"ein eigener Key hebt die Grenzen an oder schaltet eine Quelle frei.");
        float lh = textH(u, lead, fSm(), w);
        u.p->text(lead, Rect(x, cy, w, lh), fSm(), th.muted, Align::Left, true);
        cy += lh;
        col.endBlock(cy - y0);
    }
    col.endBlock(providerStatusList(a, x, col.startBlock(), w));
    col.endBlock(keysCard(a, x, col.startBlock(), w));
    col.endBlock(storageCard(a, x, col.startBlock(), w));
    col.endBlock(appearanceCard(a, x, col.startBlock(), w));
    return col.used();
}

// ---------------------------------------------------------------------------
// API-Beschreibung
// ---------------------------------------------------------------------------
struct Endpoint { const wchar_t* path; const wchar_t* method; const wchar_t* pe; const wchar_t* pd;
                  const wchar_t* ae; const wchar_t* ad; };

static const Endpoint ENDPOINTS[] = {
    {L"/api/address/{addr}", L"GET", L"Address with balance, transactions, labels and inflow risk",
     L"Adresse mit Saldo, Transaktionen, Labels und Herkunftsrisiko", L"open or token", L"offen oder Token"},
    {L"/api/tx/{txid}", L"GET", L"Transaction with inputs and outputs, Lightning hints",
     L"Transaktion mit Ein- und Ausgängen, Lightning-Hinweise", L"open or token", L"offen oder Token"},
    {L"/api/trace", L"POST", L"Follow the flow of funds, full graph in the response",
     L"Geldfluss verfolgen, vollständiger Graph in der Antwort", L"open or token", L"offen oder Token"},
    {L"/api/trace/stream", L"POST", L"Like /api/trace, but line by line as NDJSON with intermediate states",
     L"Wie /api/trace, aber zeilenweise als NDJSON mit Zwischenständen", L"open or token", L"offen oder Token"},
    {L"/api/path", L"POST", L"Search for connections between two addresses",
     L"Verbindungen zwischen zwei Adressen suchen", L"open or token", L"offen oder Token"},
    {L"/api/screen", L"POST", L"Check up to 200 addresses against reporting lists",
     L"Bis zu 200 Adressen gegen Meldelisten prüfen", L"open or token", L"offen oder Token"},
    {L"/api/providers", L"GET", L"Data sources, chains and cache", L"Datenquellen, Chains und Cache",
     L"open or token", L"offen oder Token"},
    {L"/api/price", L"GET", L"Current rate or rate series (from/to in Unix seconds)",
     L"Aktueller Kurs oder Kursreihe (from/to in Unix-Sekunden)", L"open", L"offen"},
    {L"/api/health", L"GET", L"Status report for monitoring and operations",
     L"Statusbericht für Überwachung und Betrieb", L"open", L"offen"},
    {L"/api/openapi", L"GET", L"This interface as an OpenAPI 3.1 document",
     L"Diese Schnittstelle als OpenAPI-3.1-Dokument", L"open", L"offen"},
    {L"/api/cases", L"GET, POST", L"List and create cases", L"Fälle auflisten und anlegen", L"cookie", L"Cookie"},
    {L"/api/cases/{id}", L"GET, PATCH, DELETE", L"Read, change or delete a case",
     L"Fall lesen, ändern oder löschen", L"cookie", L"Cookie"},
    {L"/api/annotations", L"GET, POST", L"List, create or change your own labels",
     L"Eigene Labels auflisten, anlegen oder ändern", L"cookie", L"Cookie"},
    {L"/api/annotations/{id}", L"DELETE", L"Delete a label", L"Label löschen", L"cookie", L"Cookie"},
    {L"/api/watch", L"GET, POST, PUT", L"Read and extend the watchlist, configure notifications",
     L"Watchlist lesen und erweitern, Benachrichtigungen einstellen", L"cookie", L"Cookie"},
    {L"/api/watch/{id}", L"PATCH, DELETE", L"Change or remove an entry", L"Eintrag ändern oder entfernen",
     L"cookie", L"Cookie"},
    {L"/api/watch/check", L"GET, POST", L"Check the watched addresses", L"Beobachtete Adressen prüfen",
     L"cookie or CRON_SECRET", L"Cookie oder CRON_SECRET"},
    {L"/api/tokens", L"GET, POST", L"List and create access tokens", L"Zugriffstoken auflisten und erstellen",
     L"cookie only", L"nur Cookie"},
    {L"/api/tokens/{id}", L"DELETE", L"Revoke an access token", L"Zugriffstoken widerrufen", L"cookie only",
     L"nur Cookie"},
};

float pageApiDocs(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    Col col(u, x, y, w, 24.f);
    Font body = fSm();
    Font var = mSm();
    Color m = th.muted, f = th.foreground;

    {
        float cy = col.startBlock();
        float y0 = cy;
        cy += sectionHeading(a, x, cy, w,
                             tr(L"Interface for your own scripts", L"Schnittstelle für eigene Skripte")) + 6.f;
        std::vector<Span> lead = {
            Span(tr(L"Every endpoint returns JSON; errors appear in the ",
                    L"Jeder Endpunkt antwortet mit JSON; Fehler stehen im Feld "), body, m),
            Span(L"error", var, f),
            Span(tr(L" field. The machine-readable OpenAPI 3.1 description lives at ",
                    L". Die maschinenlesbare OpenAPI-3.1-Beschreibung liegt unter "), body, m),
            Span(L"/api/openapi", var, th.brand, L"openapi"),
            Span(L".", body, m),
        };
        float h = 0;
        drawSpanFlow(u, x, cy, w, lead, 20.f, &h);
        cy += h;
        col.endBlock(cy - y0);
    }

    // Token anlegen und benutzen
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Creating and using a token", L"Token anlegen und benutzen"), Rect(cx, cy, innerW, 24.f),
                  fBase(Wt::Semibold), th.foreground);
        cy += 28.f;

        std::vector<std::vector<Span>> steps = {
            {Span(tr(L"Log in and create a token with a name and permissions under ",
                     L"Einloggen und unter "), body, m),
             Span(tr(L"Settings", L"Einstellungen"), body, th.brand, L"settings"),
             Span(tr(L", in the “Access tokens for scripts” section.",
                     L" ein Token mit Bezeichnung und Berechtigungen anlegen, Abschnitt "
                     L"„Zugriffstoken für Skripte“."), body, m)},
            {Span(tr(L"The token starts with ", L"Der Token beginnt mit "), body, m),
             Span(L"chk_", var, f),
             Span(tr(L" and is shown ", L" und wird "), body, m),
             Span(tr(L"exactly once", L"genau einmal"), fSm(Wt::Bold), f),
             Span(tr(L" – only its hash is stored on the server.",
                     L" angezeigt – auf dem Server liegt nur sein Hashwert."), body, m)},
            {Span(tr(L"Send it with every request as ", L"Bei jeder Anfrage mitschicken als "), body, m),
             Span(L"Authorization: Bearer chk_…", var, f),
             Span(tr(L" or in the ", L" oder im Header "), body, m),
             Span(L"X-API-Key", var, f), Span(tr(L" header.", L"."), body, m)},
            {Span(tr(L"Revoke lost or exposed tokens in the settings and create a new one.",
                     L"Verlorene oder offengelegte Token in den Einstellungen widerrufen und einen neuen "
                     L"anlegen."), body, m)},
        };
        int n = 1;
        for (auto& st : steps) {
            u.p->text(std::to_wstring(n++) + L".", Rect(cx, cy, 20.f, 20.f), body, th.subtle);
            float h = 0;
            std::wstring clicked = drawSpanFlow(u, cx + 22.f, cy, innerW - 22.f, st, 20.f, &h);
            if (clicked == L"settings") a.go(Page::Settings);
            cy += h + 6.f;
        }
        cy += 6.f;

        // Beispiel
        {
            std::wstring code =
                L"curl -s -X POST https://<host>/api/trace \\\n"
                L"  -H \"Authorization: Bearer chk_…\" -H \"Content-Type: application/json\" \\\n"
                L"  -d '{\"start\":\"1A1z…\",\"chain\":\"bitcoin\",\"maxDepth\":2}'";
            Color cbg = th.background;
            Color cbd = th.border;
            float lines = 3.f;
            float ch = lines * 20.f + 20.f;
            u.p->roundRect(Rect(cx, cy, innerW, ch), R_MD, &cbg, &cbd, 1.f);
            float ly = cy + 10.f;
            size_t start = 0;
            while (start <= code.size()) {
                size_t nl = code.find(L'\n', start);
                std::wstring line = code.substr(start, (nl == std::wstring::npos ? code.size() : nl) - start);
                u.p->text(line, Rect(cx + 12.f, ly, innerW - 24.f, 20.f), mXs(), th.fg2);
                ly += 20.f;
                if (nl == std::wstring::npos) break;
                start = nl + 1;
            }
            cy += ch + 12.f;
        }

        std::wstring note = tr(L"For token requests your stored provider keys apply exactly as they do in the "
                               L"interface. Managing the tokens themselves requires the session cookie – a "
                               L"token cannot create further tokens.",
                               L"Für Token-Anfragen gelten die hinterlegten Provider-Keys genauso wie in der "
                               L"Oberfläche. Die Verwaltung der Token selbst braucht das Sitzungs-Cookie – "
                               L"ein Token kann keine weiteren Token anlegen.");
        float nh = textH(u, note, fSm(), innerW);
        u.p->text(note, Rect(cx, cy, innerW, nh), fSm(), th.muted, Align::Left, true);
        cy += nh + 12.f;

        Row row(u, cx, cy, innerW, 12.f, 8.f, BTN_H);
        std::wstring mt = tr(L"Manage tokens", L"Token verwalten");
        if (btn(u, L"api-tokens", row.place(btnW(u, mt), BTN_H), mt, Btn::Secondary)) a.go(Page::Settings);
        std::wstring oo = tr(L"Open the OpenAPI document", L"OpenAPI-Dokument öffnen");
        btn(u, L"api-openapi", row.place(btnW(u, oo), BTN_H), oo, Btn::Secondary);
        cy += row.height();
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    // Endpunkte
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Endpoints", L"Endpunkte"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
        cy += 30.f;
        const wchar_t* heads[4][2] = {{L"Path", L"Pfad"}, {L"Method", L"Methode"}, {L"Purpose", L"Zweck"},
                                      {L"Authentication", L"Authentifizierung"}};
        float fr[4] = {0.24f, 0.14f, 0.42f, 0.20f};
        float colX[5];
        colX[0] = cx;
        for (int i = 0; i < 4; i++) colX[i + 1] = colX[i] + innerW * fr[i];
        for (int i = 0; i < 4; i++) {
            std::wstring s = tr(heads[i][0], heads[i][1]);
            std::wstring up;
            for (wchar_t ch : s) up += (wchar_t)towupper(ch);
            u.p->text(up, Rect(colX[i], cy, colX[i + 1] - colX[i] - 8.f, 16.f), fXs(), th.subtle);
        }
        cy += 22.f;
        for (const Endpoint& e : ENDPOINTS) {
            hline(u, cx, cy, innerW, th.border);
            float ty = cy + 7.f;
            u.p->text(e.path, Rect(colX[0], ty + 1.f, colX[1] - colX[0] - 8.f, 18.f), mXs(), th.foreground);
            u.p->text(e.method, Rect(colX[1], ty + 1.f, colX[2] - colX[1] - 8.f, 18.f), mXs(), th.brand);
            u.p->text(truncate(u, tr(e.pe, e.pd), fSm(), colX[3] - colX[2] - 8.f),
                      Rect(colX[2], ty, colX[3] - colX[2] - 8.f, 20.f), fSm(), th.foreground);
            u.p->text(tr(e.ae, e.ad), Rect(colX[3], ty, colX[4] - colX[3], 20.f), fSm(), th.muted);
            cy += 30.f;
        }
        cy += 8.f;
        std::wstring note = tr(L"“open or token” means: usable without signing in, and with a token your own "
                               L"provider keys apply as well. “Cookie” refers to being signed in to the web "
                               L"interface.",
                               L"„offen oder Token“ bedeutet: ohne Anmeldung nutzbar, mit Token gelten "
                               L"zusätzlich die eigenen Provider-Keys. „Cookie“ meint die Anmeldung in der "
                               L"Weboberfläche.");
        float nh = textH(u, note, fXs(), innerW);
        u.p->text(note, Rect(cx, cy, innerW, nh), fXs(), th.subtle, Align::Left, true);
        cy += nh;
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    // Grenzen
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Limits and notes", L"Grenzen und Hinweise"), Rect(cx, cy, innerW, 24.f),
                  fBase(Wt::Semibold), th.foreground);
        cy += 28.f;
        auto para = [&](std::vector<Span> sp) {
            float h = 0;
            drawSpanFlow(u, cx, cy, innerW, sp, 20.f, &h);
            cy += h + 8.f;
        };
        para({Span(tr(L"The expensive endpoints are limited per source IP: ",
                      L"Die teuren Endpunkte sind je Quell-IP begrenzt: "), body, m),
              Span(L"trace", var, f), Span(L" 20, ", body, m), Span(L"path", var, f), Span(L" 10, ", body, m),
              Span(L"screen", var, f), Span(L" 5, ", body, m), Span(L"address", var, f),
              Span(tr(L" and ", L" und "), body, m), Span(L"tx", var, f),
              Span(tr(L" 120 requests per minute each. Above that the server answers with status 429 and a ",
                      L" je 120 Anfragen pro Minute. Darüber antwortet der Server mit Status 429 und einem "),
                   body, m),
              Span(L"Retry-After", var, f), Span(tr(L" header.", L"-Header."), body, m)});
        para({Span(tr(L"A trace can run for several minutes. For long runs use ",
                      L"Ein Trace kann mehrere Minuten laufen. Für lange Läufe "), body, m),
              Span(L"/api/trace/stream", var, f),
              Span(tr(L": the response is NDJSON, each line an intermediate state, and the last line carries ",
                      L" nutzen: die Antwort ist NDJSON, jede Zeile ein Zwischenstand, die letzte Zeile trägt "),
                   body, m),
              Span(L"phase=\"done\"", var, f),
              Span(tr(L" with the result under ", L" mit dem Ergebnis unter "), body, m),
              Span(L"result", var, f), Span(L".", body, m)});
        para({Span(tr(L"The chain is chosen through the ", L"Die Kette wird über den Abfrageparameter "), body, m),
              Span(L"chain", var, f),
              Span(tr(L" query parameter on GET requests and through the field of the same name in the JSON "
                      L"body on POST requests.",
                      L" bei GET-Anfragen und über das gleichnamige Feld im JSON-Rumpf bei POST-Anfragen "
                      L"gewählt."), body, m)});
        col.endBlock(cardEnd(u, c, cy - c.inner - 8.f));
    }
    return col.used();
}

// ---------------------------------------------------------------------------
// Info
// ---------------------------------------------------------------------------
float pageInfo(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    float cw = (std::min)(768.f, w);   // max-w-3xl
    float cx0 = x + (w - cw) * .5f;
    Col col(u, cx0, y, cw, 16.f);

    {
        CardCtx c = cardBegin(u, cx0, col.startBlock(), cw);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = cw - 2 * CARD_PAD;

        // Wortmarke wie in der Kopfleiste, nur groesser
        Font logoF = f3Xl(Wt::Bold);
        std::vector<Span> logo = {Span(L"⛓", logoF, th.brand), Span(L" Chainer", logoF, th.foreground)};
        drawSpansLine(u, cx, cy, logo, innerW, Align::Center);
        cy += 36.f + 4.f;

        std::wstring ver = tr(L"Version ", L"Version ") + std::wstring(APP_VERSION);
        u.p->text(ver, Rect(cx, cy, innerW, 24.f), fBase(), th.muted, Align::Center);
        cy += 24.f + 16.f;

        std::wstring lead = tr(L"Blockchain tracing as a desktop application: the same interface as the "
                               L"web version, written in plain C++ on Win32 with Direct2D and DirectWrite "
                               L"– no additional frameworks.",
                               L"Blockchain-Tracing als Desktop-Anwendung: dieselbe Oberfläche wie die "
                               L"Web-Fassung, geschrieben in reinem C++ auf Win32 mit Direct2D und "
                               L"DirectWrite – ohne zusätzliche Frameworks.");
        float lh = textH(u, lead, fSm(), innerW);
        u.p->text(lead, Rect(cx, cy, innerW, lh), fSm(), th.muted, Align::Center, true);
        cy += lh + 16.f;

        std::wstring copyright = L"Copyright (c) by " + std::wstring(APP_AUTHOR);
        u.p->text(copyright, Rect(cx, cy, innerW, 20.f), fSm(), th.foreground, Align::Center);
        cy += 20.f + 8.f;

        {
            std::vector<Span> repo = {Span(APP_REPO, fSm(), th.brand, L"repo")};
            std::wstring clicked = drawSpansLine(u, cx, cy, repo, innerW, Align::Center);
            if (clicked == L"repo") openUrl(APP_REPO);
            cy += 20.f;
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    // Fakten zur Anwendung
    {
        CardCtx c = cardBegin(u, cx0, col.startBlock(), cw);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = cw - 2 * CARD_PAD;
        u.p->text(tr(L"About this version", L"Über diese Fassung"), Rect(cx, cy, innerW, 24.f),
                  fBase(Wt::Semibold), th.foreground);
        cy += 28.f;

        struct Fact { std::wstring key, value; bool mono; };
        std::vector<Fact> facts = {
            {tr(L"Application", L"Anwendung"), std::wstring(L"Chainer ") + APP_VERSION, false},
            {tr(L"Author", L"Autor"), APP_AUTHOR, false},
            {tr(L"Repository", L"Repository"), APP_REPO, true},
            {tr(L"Interface", L"Oberfläche"), L"Win32 · Direct2D · DirectWrite", false},
            {tr(L"Account", L"Konto"), tr(L"none – no sign-in, no registration",
                                          L"keins – keine Anmeldung, keine Registrierung"), false},
            {tr(L"Storage", L"Ablage"), storePath(), true},
            {tr(L"Network", L"Netzwerk"),
             tr(L"queries the configured data sources directly",
                L"fragt die eingestellten Datenquellen direkt ab"), false},
        };
        float keyW = 0;
        for (const Fact& f : facts) keyW = (std::max)(keyW, textW(u, f.key, fSm()));
        keyW += 24.f;
        for (const Fact& f : facts) {
            u.p->text(f.key, Rect(cx, cy, keyW, 20.f), fSm(), th.muted);
            Font vf = f.mono ? mXs() : fSm();
            float vh = textH(u, f.value, vf, innerW - keyW);
            Rect vr(cx + keyW, cy + (f.mono ? 2.f : 0.f), innerW - keyW, vh);
            bool isLink = f.value.compare(0, 4, L"http") == 0;
            Color vc = th.foreground;
            if (isLink) {
                vc = th.brand;
                if (u.mouseIn(vr)) {
                    u.cursorHand = true;
                    if (u.in.pressed) openUrl(f.value);
                }
            }
            u.p->text(f.value, vr, vf, vc, Align::Left, true);
            cy += (std::max)(20.f, vh) + 6.f;
        }
        col.endBlock(cardEnd(u, c, cy - c.inner - 6.f));
    }

    // Quellen und Hinweis
    {
        CardCtx c = cardBegin(u, cx0, col.startBlock(), cw);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = cw - 2 * CARD_PAD;
        u.p->text(tr(L"Note", L"Hinweis"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
        cy += 26.f;
        std::wstring note = tr(L"Heuristics are statements of probability, not proof. Addresses you look "
                               L"up are sent to the data sources you have enabled; the results and your "
                               L"own labels stay on this computer.",
                               L"Heuristiken sind Wahrscheinlichkeitsaussagen, keine Beweise. Abgefragte "
                               L"Adressen gehen an die eingeschalteten Datenquellen; die Ergebnisse und "
                               L"die eigenen Labels bleiben auf diesem Rechner.");
        float nh = textH(u, note, fSm(), innerW);
        u.p->text(note, Rect(cx, cy, innerW, nh), fSm(), th.muted, Align::Left, true);
        cy += nh;
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }
    return col.used();
}

// ---------------------------------------------------------------------------
// Adressseite - echte Daten der angebundenen Quellen
// ---------------------------------------------------------------------------
static void researchLinks(App& a, float x, float& cy, float w, int chain, const std::wstring& addr) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    struct L { std::wstring name, url; };
    std::vector<L> links;
    switch (chain) {
    case 0:
        links.push_back({L"mempool.space", L"https://mempool.space/address/" + addr});
        links.push_back({L"Blockstream", L"https://blockstream.info/address/" + addr});
        links.push_back({L"WalletExplorer", L"https://www.walletexplorer.com/address/" + addr});
        break;
    case 1: links.push_back({L"litecoinspace", L"https://litecoinspace.org/address/" + addr}); break;
    case 4: links.push_back({L"Etherscan", L"https://etherscan.io/address/" + addr}); break;
    case 5: links.push_back({L"Polygonscan", L"https://polygonscan.com/address/" + addr}); break;
    case 6: links.push_back({L"Arbiscan", L"https://arbiscan.io/address/" + addr}); break;
    case 7: links.push_back({L"Tronscan", L"https://tronscan.org/#/address/" + addr}); break;
    default: break;
    }
    links.push_back({L"Blockchair", L"https://blockchair.com/search?q=" + addr});
    links.push_back({L"OFAC", L"https://sanctionssearch.ofac.treas.gov/"});

    Row rr(u, x, cy, w, 8.f, 8.f, 20.f);
    for (const L& l : links) {
        Rect r = rr.place(textW(u, l.name, fSm()), 20.f);
        if (link(u, L"ad-link" + l.name, r, l.name, fSm(), th.brand)) openUrl(l.url);
    }
    cy += rr.height();
}

float pageAddress(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    int chain = a.route.chain;
    const ChainMeta& meta = chainAt(chain);
    std::wstring addr = a.route.param;
    Col col(u, x, y, w, 16.f);

    liveEnsureAddress(a, chain, addr);
    liveEnsurePrice(a, chain);
    double price = a.priceChain == chain ? a.priceEur : 0;

    // --- Kopfzeile ---------------------------------------------------------
    {
        float cy = col.startBlock();
        Row row(u, x, cy, w, 12.f, 8.f, BTN_H);
        std::wstring h1 = tr(L"Address", L"Adresse");
        u.p->text(h1, row.place(textW(u, h1, fLg(Wt::Semibold)), 28.f), fLg(Wt::Semibold), th.foreground);
        Font bf = fXs();
        Rect cb = row.place(badgeW(u, meta.name, bf, 8.f), 20.f);
        badge(u, cb, meta.name, th.panel, th.brand, bf);
        Rect ar = row.place((std::min)(textW(u, addr, mSm()), w * .45f), 20.f);
        u.p->text(truncate(u, addr, mSm(), ar.w), ar, mSm(), th.foreground);
        tooltip(u, ar, addr);
        if (a.addrLoading) {
            std::wstring l = tr(L"Loading…", L"Lade…");
            u.p->text(l, row.place(textW(u, l, fSm()), 20.f), fSm(), th.muted);
        }

        std::wstring b1 = tr(L"Trace forward", L"Vorwärts verfolgen");
        std::wstring b2 = tr(L"Trace the origin", L"Herkunft verfolgen");
        float bw1 = btnW(u, b1), bw2 = btnW(u, b2);
        Rect g = row.placeRight(bw1 + 8.f + bw2, BTN_H);
        if (btn(u, L"ad-fwd", Rect(g.x, g.y, bw1, BTN_H), b1, Btn::Primary)) {
            a.traceStart = addr;
            a.traceChain = chain;
            a.traceDir = 0;
            a.go(Page::Trace);
            liveStartTrace(a);
        }
        if (btn(u, L"ad-back", Rect(g.x + bw1 + 8.f, g.y, bw2, BTN_H), b2, Btn::Secondary)) {
            a.traceStart = addr;
            a.traceChain = chain;
            a.traceDir = 1;
            a.go(Page::Trace);
            liveStartTrace(a);
        }
        col.endBlock(row.height());
    }

    // --- Fehler ------------------------------------------------------------
    if (!a.addrLoading && !a.addrInfo.ok && !a.addrInfo.error.empty()) {
        float cy = col.startBlock();
        Color bd = th.tw(Tw::Red500).op(0.6f).over(th.background);
        Color bg = th.tw(Tw::Red950).op(0.4f).over(th.background);
        CardCtx c = cardBegin(u, x, cy, w, CARD_PAD, bd, bg);
        std::wstring msg = tr(L"The address could not be loaded: ", L"Die Adresse konnte nicht geladen werden: ") +
                           a.addrInfo.error;
        float h = textH(u, msg, fSm(), w - 2 * CARD_PAD);
        u.p->text(msg, Rect(c.x + CARD_PAD, c.inner, w - 2 * CARD_PAD, h), fSm(), th.tw(Tw::Red300),
                  Align::Left, true);
        col.endBlock(cardEnd(u, c, h));
    }

    // --- Kennzahlen --------------------------------------------------------
    {
        float cy = col.startBlock();
        int cols = w >= 768.f ? 4 : (w >= 480.f ? 2 : 1);
        float gap = 16.f;
        float cw = (w - gap * (cols - 1)) / cols;
        const NetAddress& info = a.addrInfo;
        auto amount = [&](double v) {
            return info.ok ? fmtAmount(v, meta.decimals, meta.symbol) : std::wstring(L"–");
        };
        auto fiat = [&](double v) {
            return info.ok && price > 0 ? fmtFiat(v, price, meta.decimals) : std::wstring();
        };
        struct S { std::wstring label, value, sub; };
        S stats[4] = {
            {tr(L"Balance", L"Saldo"), amount(info.balance), fiat(info.balance)},
            {tr(L"Received", L"Empfangen"), amount(info.received), fiat(info.received)},
            {tr(L"Sent", L"Gesendet"), amount(info.sent), fiat(info.sent)},
            {tr(L"Transactions", L"Transaktionen"), info.ok ? fmtNumber((double)info.txCount) : L"–",
             info.ok ? tr(L"Source: ", L"Quelle: ") + info.provider : L""},
        };
        float maxH = 0;
        for (int i = 0; i < 4; i++) {
            float sx = x + (i % cols) * (cw + gap);
            float sy = cy + (i / cols) * (94.f + gap);
            float h = statCard(a, sx, sy, cw, stats[i].label, stats[i].value, stats[i].sub);
            maxH = (std::max)(maxH, (float)((i / cols) * (94.f + gap)) + h);
        }
        col.endBlock(maxH);
    }

    // --- Labels und Aktivitätsmuster ---------------------------------------
    {
        float cy = col.startBlock();
        float gap = 16.f;
        bool wide = w >= 1024.f;
        float leftW = wide ? w - 360.f - gap : w;
        float rightW = wide ? 360.f : w;

        float leftH = 0, rightH = 0;
        {
            CardCtx c = cardBegin(u, x, cy, leftW);
            float cx = c.x + CARD_PAD, iy = c.inner, innerW = leftW - 2 * CARD_PAD;
            u.p->text(tr(L"Labels & risk", L"Labels & Risiko"), Rect(cx, iy, innerW, 24.f),
                      fBase(Wt::Semibold), th.foreground);
            iy += 26.f;

            std::vector<LabelRow> labels;
            for (const AnnotationRow& an : a.annotations) {
                if (an.address != addr) continue;
                LabelRow l;
                l.label = an.label;
                l.source = tr(L"own", L"eigene");
                l.category = an.category;
                l.details = an.note;
                l.risk = an.risk;
                l.own = true;
                labels.push_back(l);
            }
            for (const NetLabel& n : a.addrLabels) {
                LabelRow l;
                l.label = n.label;
                l.source = n.source;
                l.category = n.category;
                l.details = n.details;
                l.risk = n.risk;
                l.url = n.url;
                labels.push_back(l);
            }
            if (a.addrLoading && labels.empty()) {
                u.p->text(tr(L"Loading…", L"Lade…"), Rect(cx, iy, innerW, 20.f), fXs(), th.subtle);
                iy += 20.f;
            } else {
                iy += labelBadges(a, cx, iy, innerW, labels, false);
            }
            iy += 16.f;
            u.p->text(tr(L"Further research", L"Weitere Recherche"), Rect(cx, iy, innerW, 20.f),
                      fSm(Wt::Semibold), th.foreground);
            iy += 22.f;
            researchLinks(a, cx, iy, innerW, chain, addr);
            if (!a.addrUnreachable.empty()) {
                iy += 8.f;
                std::wstring un = tr(L"Not reachable: ", L"Nicht erreichbar: ");
                for (size_t i = 0; i < a.addrUnreachable.size(); i++)
                    un += (i ? L", " : L"") + a.addrUnreachable[i];
                float uh = textH(u, un, fXs(), innerW);
                u.p->text(un, Rect(cx, iy, innerW, uh), fXs(), th.subtle, Align::Left, true);
                iy += uh;
            }
            leftH = cardEnd(u, c, iy - c.inner);
        }
        {
            float rx = wide ? x + leftW + gap : x;
            float ry = wide ? cy : cy + leftH + gap;
            CardCtx c = cardBegin(u, rx, ry, rightW);
            float cx = c.x + CARD_PAD, iy = c.inner, innerW = rightW - 2 * CARD_PAD;
            u.p->text(tr(L"Activity pattern", L"Aktivitätsmuster"), Rect(cx, iy, innerW, 24.f),
                      fBase(Wt::Semibold), th.foreground);
            iy += 28.f;
            std::vector<long long> times;
            for (const NetTx& t : a.addrTxs)
                if (t.blockTime) times.push_back(t.blockTime);
            iy += activityHeatmap(a, cx, iy, innerW, times);
            rightH = cardEnd(u, c, iy - c.inner);
            if (!wide) rightH += leftH + gap;
        }
        col.endBlock(wide ? (std::max)(leftH, rightH) : rightH);
    }

    // --- Transaktionen -----------------------------------------------------
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        Row head(u, cx, cy, innerW, 8.f, 8.f, 24.f);
        std::wstring t = tr(L"Transactions", L"Transaktionen");
        u.p->text(t, head.place(textW(u, t, fBase(Wt::Semibold)), 24.f), fBase(Wt::Semibold), th.foreground);
        std::wstring sub;
        if (a.addrLoading) {
            sub = tr(L"(loading…)", L"(lade…)");
        } else if (!a.addrTxs.empty()) {
            sub = L"(" + std::to_wstring(a.addrTxs.size());
            if (a.addrInfo.ok && a.addrInfo.txCount > (long long)a.addrTxs.size())
                sub += tr(L" of ", L" von ") + fmtNumber((double)a.addrInfo.txCount);
            sub += tr(L", most recent first, source: ", L", neueste zuerst, Quelle: ") +
                   a.addrTxs.front().provider + L")";
        }
        if (!sub.empty()) u.p->text(sub, head.place(textW(u, sub, fSm()), 20.f), fSm(), th.muted);
        cy += head.height() + 10.f;

        const wchar_t* heads[6][2] = {{L"Transaction", L"Transaktion"}, {L"Time", L"Zeit"},
                                      {L"Direction", L"Richtung"},      {L"Amount", L"Betrag"},
                                      {L"Fee", L"Gebühr"},              {L"Counterparty", L"Gegenseite"}};
        float fr[6] = {0.20f, 0.18f, 0.10f, 0.16f, 0.12f, 0.24f};
        float colX[7];
        colX[0] = cx;
        for (int i = 0; i < 6; i++) colX[i + 1] = colX[i] + innerW * fr[i];
        bool right[6] = {false, false, false, true, true, false};
        for (int i = 0; i < 6; i++) {
            std::wstring s2 = tr(heads[i][0], heads[i][1]);
            std::wstring up;
            for (wchar_t ch : s2) up += (wchar_t)towupper(ch);
            u.p->text(up, Rect(colX[i], cy, colX[i + 1] - colX[i] - 8.f, 16.f), fXs(), th.subtle,
                      right[i] ? Align::Right : Align::Left);
        }
        cy += 22.f;

        for (const NetTx& tx : a.addrTxs) {
            // Betrag und Richtung aus Sicht dieser Adresse
            double in = 0, out = 0;
            std::wstring counterparty;
            for (const NetTxIn& i : tx.inputs) {
                if (i.address == addr) out += i.value;
                else if (counterparty.empty() && !i.address.empty()) counterparty = i.address;
            }
            for (const NetTxOut& o : tx.outputs) {
                if (o.address == addr) in += o.value;
            }
            bool incoming = in >= out;
            double value = incoming ? in - out : out - in;
            if (!incoming) {
                counterparty.clear();
                for (const NetTxOut& o : tx.outputs)
                    if (o.address != addr && !o.address.empty()) {
                        counterparty = o.address;
                        break;
                    }
            }

            hline(u, cx, cy, innerW, th.border);
            float ty = cy + 7.f;
            Rect tr1(colX[0], ty + 1.f, colX[1] - colX[0] - 8.f, 18.f);
            Color tc = u.mouseIn(tr1) ? th.brand : th.foreground;
            if (u.mouseIn(tr1)) {
                u.cursorHand = true;
                if (u.in.pressed) {
                    a.route.chain = chain;
                    a.go(Page::Tx, tx.txid);
                }
            }
            u.p->text(shortHash(tx.txid, 8), tr1, mXs(), tc);
            tooltip(u, tr1, tx.txid);

            u.p->text(tx.blockTime ? fmtDate(tx.blockTime) : tr(L"unconfirmed", L"unbestätigt"),
                      Rect(colX[1], ty, colX[2] - colX[1] - 8.f, 20.f), fSm(), th.muted);
            std::wstring dir = incoming ? tr(L"In", L"Eingang") : tr(L"Out", L"Ausgang");
            u.p->text(dir, Rect(colX[2], ty, colX[3] - colX[2] - 8.f, 20.f), fSm(),
                      incoming ? th.tw(Tw::Green400) : th.tw(Tw::Orange300));
            u.p->text(fmtAmount(value, meta.decimals, meta.symbol),
                      Rect(colX[3], ty, colX[4] - colX[3] - 8.f, 20.f), fSm(), th.foreground, Align::Right);
            u.p->text(tx.fee > 0 ? fmtAmount(tx.fee, meta.decimals, meta.symbol, 6) : L"–",
                      Rect(colX[4], ty, colX[5] - colX[4] - 8.f, 20.f), fSm(), th.subtle, Align::Right);
            Rect cpr(colX[5], ty + 1.f, colX[6] - colX[5], 18.f);
            if (!counterparty.empty()) {
                Color cc = u.mouseIn(cpr) ? th.brand : th.foreground;
                if (u.mouseIn(cpr)) {
                    u.cursorHand = true;
                    if (u.in.pressed) {
                        a.route.chain = chain;
                        a.go(Page::Address, counterparty);
                    }
                }
                u.p->text(shortHash(counterparty, 10), cpr, mXs(), cc);
                tooltip(u, cpr, counterparty);
            } else {
                u.p->text(L"–", cpr, mXs(), th.subtle);
            }
            cy += 30.f;
        }

        if (a.addrTxs.empty()) {
            std::wstring msg = a.addrLoading ? tr(L"Loading…", L"Lade…")
                               : !a.addrTxError.empty()
                                   ? a.addrTxError
                                   : tr(L"No transactions found.", L"Keine Transaktionen gefunden.");
            u.p->text(msg, Rect(cx, cy + 6.f, innerW, 24.f), fSm(), th.muted);
            cy += 30.f;
        } else if (a.addrInfo.ok && a.addrInfo.txCount > (long long)a.addrTxs.size() &&
                   a.addressTxLimit < 500) {
            cy += 10.f;
            std::wstring more = tr(L"Load 50 more", L"50 weitere laden");
            if (btn(u, L"ad-more", Rect(cx, cy, btnW(u, more), BTN_H), more, Btn::Secondary,
                    a.addrLoading)) {
                a.addressTxLimit = (std::min)(500, a.addressTxLimit + 50);
                a.addrKey.clear();   // erzwingt das Nachladen
            }
            cy += BTN_H;
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }
    return col.used();
}

// ---------------------------------------------------------------------------
// Transaktionsseite
// ---------------------------------------------------------------------------
float pageTx(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    int chain = a.route.chain;
    const ChainMeta& meta = chainAt(chain);
    std::wstring txid = a.route.param;
    Col col(u, x, y, w, 16.f);

    liveEnsureTx(a, chain, txid);
    liveEnsurePrice(a, chain);
    double price = a.priceChain == chain ? a.priceEur : 0;
    const NetTx& tx = a.txInfo;

    {
        float cy = col.startBlock();
        Row row(u, x, cy, w, 12.f, 8.f, BTN_H);
        std::wstring h1 = tr(L"Transaction", L"Transaktion");
        u.p->text(h1, row.place(textW(u, h1, fLg(Wt::Semibold)), 28.f), fLg(Wt::Semibold), th.foreground);
        Font bf = fXs();
        Rect cb = row.place(badgeW(u, meta.name, bf, 8.f), 20.f);
        badge(u, cb, meta.name, th.panel, th.brand, bf);
        Rect ar = row.place((std::min)(textW(u, txid, mSm()), w * .5f), 20.f);
        u.p->text(truncate(u, txid, mSm(), ar.w), ar, mSm(), th.foreground);
        tooltip(u, ar, txid);
        if (a.txLoading) {
            std::wstring l = tr(L"Loading…", L"Lade…");
            u.p->text(l, row.place(textW(u, l, fSm()), 20.f), fSm(), th.muted);
        }
        std::wstring ex = tr(L"Open in the explorer", L"Im Explorer öffnen");
        if (btn(u, L"tx-explorer", row.placeRight(btnW(u, ex), BTN_H), ex, Btn::Secondary)) {
            std::wstring url = chain == 0   ? L"https://mempool.space/tx/" + txid
                               : chain == 1 ? L"https://litecoinspace.org/tx/" + txid
                               : chain == 4 ? L"https://etherscan.io/tx/" + txid
                               : chain == 5 ? L"https://polygonscan.com/tx/" + txid
                               : chain == 6 ? L"https://arbiscan.io/tx/" + txid
                               : chain == 7 ? L"https://tronscan.org/#/transaction/" + txid
                                            : L"https://blockchair.com/search?q=" + txid;
            openUrl(url);
        }
        col.endBlock(row.height());
    }

    if (!a.txLoading && !tx.ok && !tx.error.empty()) {
        float cy = col.startBlock();
        Color bd = th.tw(Tw::Red500).op(0.6f).over(th.background);
        Color bg = th.tw(Tw::Red950).op(0.4f).over(th.background);
        CardCtx c = cardBegin(u, x, cy, w, CARD_PAD, bd, bg);
        std::wstring msg = tr(L"The transaction could not be loaded: ",
                              L"Die Transaktion konnte nicht geladen werden: ") + tx.error;
        float h = textH(u, msg, fSm(), w - 2 * CARD_PAD);
        u.p->text(msg, Rect(c.x + CARD_PAD, c.inner, w - 2 * CARD_PAD, h), fSm(), th.tw(Tw::Red300),
                  Align::Left, true);
        col.endBlock(cardEnd(u, c, h));
        return col.used();
    }

    // Kennzahlen
    {
        float cy = col.startBlock();
        int cols = w >= 768.f ? 4 : (w >= 480.f ? 2 : 1);
        float gap = 16.f;
        float cw = (w - gap * (cols - 1)) / cols;
        struct S { std::wstring label, value, sub; };
        double total = tx.totalOut();
        S stats[4] = {
            {tr(L"Volume", L"Volumen"), tx.ok ? fmtAmount(total, meta.decimals, meta.symbol) : L"–",
             tx.ok && price > 0 ? fmtFiat(total, price, meta.decimals) : L""},
            {tr(L"Fee", L"Gebühr"), tx.ok ? fmtAmount(tx.fee, meta.decimals, meta.symbol, 8) : L"–",
             tx.ok && price > 0 ? fmtFiat(tx.fee, price, meta.decimals) : L""},
            {tr(L"Time", L"Zeit"),
             tx.blockTime ? fmtDate(tx.blockTime) : tr(L"unconfirmed", L"unbestätigt"),
             tx.blockHeight ? tr(L"Block ", L"Block ") + fmtNumber((double)tx.blockHeight) : L""},
            {tr(L"Structure", L"Struktur"),
             tx.ok ? std::to_wstring(tx.inputs.size()) + L" → " + std::to_wstring(tx.outputs.size()) : L"–",
             tx.ok ? tr(L"Source: ", L"Quelle: ") + tx.provider : L""},
        };
        float maxH = 0;
        for (int i = 0; i < 4; i++) {
            float sx = x + (i % cols) * (cw + gap);
            float sy = cy + (i / cols) * (94.f + gap);
            float h = statCard(a, sx, sy, cw, stats[i].label, stats[i].value, stats[i].sub);
            maxH = (std::max)(maxH, (float)((i / cols) * (94.f + gap)) + h);
        }
        col.endBlock(maxH);
    }

    // Ein- und Ausgänge
    {
        float cy = col.startBlock();
        float gap = 16.f;
        bool wide = w >= 900.f;
        float half = wide ? (w - gap) * .5f : w;

        auto side = [&](float sx, float sy, float sw, bool inputs) -> float {
            CardCtx c = cardBegin(u, sx, sy, sw);
            float cx = c.x + CARD_PAD, iy = c.inner, innerW = sw - 2 * CARD_PAD;
            size_t count = inputs ? tx.inputs.size() : tx.outputs.size();
            std::wstring title = (inputs ? tr(L"Inputs", L"Eingänge") : tr(L"Outputs", L"Ausgänge")) +
                                 L" (" + std::to_wstring(count) + L")";
            u.p->text(title, Rect(cx, iy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
            iy += 28.f;
            if (a.txLoading) {
                u.p->text(tr(L"Loading…", L"Lade…"), Rect(cx, iy, innerW, 20.f), fSm(), th.muted);
                iy += 20.f;
            }
            size_t shown = 0;
            for (size_t i = 0; i < count && shown < 60; i++, shown++) {
                std::wstring address = inputs ? tx.inputs[i].address : tx.outputs[i].address;
                double value = inputs ? tx.inputs[i].value : tx.outputs[i].value;
                bool coinbase = inputs && tx.inputs[i].coinbase;
                bool spent = !inputs && tx.outputs[i].spent;
                hline(u, cx, iy, innerW, th.border);
                float ty = iy + 6.f;
                Rect ar(cx, ty + 1.f, innerW * .55f, 18.f);
                if (coinbase) {
                    u.p->text(L"coinbase", ar, mXs(), th.tw(Tw::Green400));
                } else if (address.empty()) {
                    u.p->text(tr(L"(unknown)", L"(unbekannt)"), ar, fXs(), th.subtle);
                } else {
                    Color ac = u.mouseIn(ar) ? th.brand : th.foreground;
                    if (u.mouseIn(ar)) {
                        u.cursorHand = true;
                        if (u.in.pressed) {
                            a.route.chain = chain;
                            a.go(Page::Address, address);
                        }
                    }
                    u.p->text(shortHash(address, 12), ar, mXs(), ac);
                    tooltip(u, ar, address);
                }
                u.p->text(fmtAmount(value, meta.decimals, meta.symbol),
                          Rect(cx, ty, innerW - (spent ? 60.f : 0.f), 20.f), fSm(), th.foreground,
                          Align::Right);
                if (spent)
                    u.p->text(tr(L"spent", L"ausgegeben"), Rect(cx, ty + 2.f, innerW, 16.f), fPx(10.f),
                              th.subtle, Align::Right);
                iy += 28.f;
            }
            if (!count && !a.txLoading) {
                u.p->text(L"–", Rect(cx, iy, innerW, 20.f), fSm(), th.subtle);
                iy += 20.f;
            }
            return cardEnd(u, c, iy - c.inner);
        };

        float h1 = side(x, cy, half, true);
        float h2 = side(wide ? x + half + gap : x, wide ? cy : cy + h1 + gap, half, false);
        col.endBlock(wide ? (std::max)(h1, h2) : h1 + gap + h2);
    }
    return col.used();
}
