// ---------------------------------------------------------------------------
// pages_b.cpp - Faelle, Auftraege, Watchlist, eigene Labels, Team.
// Vorbilder: CasesList.tsx, JobsView.tsx, WatchlistView.tsx, AnnotationsView.tsx,
// TeamView.tsx.
// ---------------------------------------------------------------------------
#include "app.h"
#include <ctime>

// Gemeinsame Uebersetzungen (src/lib/i18n/labels.ts)
static std::wstring cSave()   { return tr(L"Save", L"Speichern"); }
static std::wstring cCancel() { return tr(L"Cancel", L"Abbrechen"); }
static std::wstring cEdit()   { return tr(L"Edit", L"Bearbeiten"); }
static std::wstring cDelete() { return tr(L"Delete", L"Löschen"); }
static std::wstring cChain()  { return tr(L"Chain", L"Chain"); }
static std::wstring cShared() { return tr(L"shared", L"geteilt"); }

// Kategorien in der Reihenfolge der Auswahlliste (wie SELECTABLE_CATEGORIES).
static const wchar_t* const CATEGORY_IDS[14] = {
    L"exchange", L"mixer", L"scam", L"sanctioned", L"ransomware", L"darknet", L"gambling",
    L"mining", L"service", L"swap", L"bridge", L"wallet", L"custom", L"other"};

static std::wstring categoryLabel(const std::wstring& c) {
    if (c == L"exchange") return tr(L"Exchange", L"Börse");
    if (c == L"mixer") return L"Mixer";
    if (c == L"scam") return tr(L"Scam", L"Betrug");
    if (c == L"sanctioned") return tr(L"Sanctioned", L"Sanktioniert");
    if (c == L"ransomware") return L"Ransomware";
    if (c == L"darknet") return L"Darknet";
    if (c == L"gambling") return tr(L"Gambling", L"Glücksspiel");
    if (c == L"mining") return L"Mining";
    if (c == L"service") return tr(L"Service", L"Dienst");
    if (c == L"swap") return L"Swap";
    if (c == L"bridge") return tr(L"Bridge", L"Brücke");
    if (c == L"wallet") return L"Wallet";
    if (c == L"custom") return tr(L"Own", L"Eigene");
    return tr(L"Other", L"Sonstige");
}

static std::wstring riskLabel(const std::wstring& r) {
    if (r == L"low") return tr(L"low", L"niedrig");
    if (r == L"medium") return tr(L"medium", L"mittel");
    if (r == L"high") return tr(L"high", L"hoch");
    return L"–";
}

// Kopfzeile einer Tabelle: text-left text-xs uppercase text-subtle
static void tableHead(Ui& u, float* colX, int n, const wchar_t* const heads[][2], float y,
                      const bool* rightAlign = nullptr) {
    for (int i = 0; i < n; i++) {
        std::wstring s = tr(heads[i][0], heads[i][1]);
        std::wstring up;
        for (wchar_t ch : s) up += (wchar_t)towupper(ch);
        u.p->text(up, Rect(colX[i], y, colX[i + 1] - colX[i] - 8.f, 16.f), fXs(), u.th.subtle,
                  (rightAlign && rightAlign[i]) ? Align::Right : Align::Left);
    }
}

// ---------------------------------------------------------------------------
// Faelle
// ---------------------------------------------------------------------------
float pageCases(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    Col col(u, x, y, w, 16.f);
    col.endBlock(sectionHeading(a, x, col.startBlock(), w, tr(L"Saved cases", L"Gespeicherte Fälle")));

    CardCtx c = cardBegin(u, x, col.startBlock(), w);
    float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;

    const wchar_t* heads[7][2] = {{L"Name", L"Name"},   {L"Chain", L"Chain"}, {L"Start", L"Start"},
                                  {L"Traces", L"Traces"}, {L"Mode", L"Modus"},  {L"Changed", L"Geändert"},
                                  {L"", L""}};
    float fr[7] = {0.24f, 0.06f, 0.13f, 0.06f, 0.20f, 0.14f, 0.17f};
    float colX[8];
    colX[0] = cx;
    for (int i = 0; i < 7; i++) colX[i + 1] = colX[i] + innerW * fr[i];
    tableHead(u, colX, 7, heads, cy + 4.f);
    cy += 24.f;

    int removeCase = -1;
    for (size_t rowIdx = 0; rowIdx < a.cases.size(); rowIdx++) {
        const CaseRow& r = a.cases[rowIdx];
        hline(u, cx, cy, innerW, th.border);
        float ty = cy + 8.f;
        // Name mit Abzeichen
        {
            Font nf = fSm(Wt::Medium);
            float nw = textW(u, r.name, nf);
            Rect nr(colX[0], ty, (std::min)(nw, colX[1] - colX[0] - 8.f), 20.f);
            Color nc = u.mouseIn(nr) ? th.brand : th.foreground;
            if (u.mouseIn(nr)) u.cursorHand = true;
            u.p->text(truncate(u, r.name, nf, nr.w), nr, nf, nc);
            float bx = nr.r() + 8.f;
            if (r.shared) {
                Font bf = fPx(10.f);
                float bw = badgeW(u, cShared(), bf);
                if (bx + bw < colX[1] - 4.f) {
                    badge(u, Rect(bx, ty + 2.f, bw, 16.f), cShared(), th.tw(Tw::Indigo600).op(0.7f).over(th.panel),
                          Color::hex(0xffffff), bf);
                    bx += bw + 4.f;
                }
            }
            if (!r.own && bx < colX[1] - 40.f)
                u.p->text(tr(L"from the team", L"vom Team"), Rect(bx, ty + 2.f, colX[1] - bx, 14.f), fPx(10.f),
                          th.subtle);
        }
        std::wstring sym = L"BTC";
        for (const ChainMeta& m : CHAINS)
            if (m.id == r.chain) sym = m.symbol;
        u.p->text(sym, Rect(colX[1], ty, colX[2] - colX[1] - 8.f, 20.f), fSm(), th.muted);
        u.p->text(shortHash(r.start, 8), Rect(colX[2], ty + 2.f, colX[3] - colX[2] - 8.f, 16.f), mXs(),
                  th.foreground);
        u.p->text(std::to_wstring(r.traces), Rect(colX[3], ty, colX[4] - colX[3] - 8.f, 20.f), fSm(), th.muted);
        std::wstring dir = r.direction == L"forward"    ? tr(L"forward", L"vorwärts")
                           : r.direction == L"backward" ? tr(L"backward", L"rückwärts")
                                                        : tr(L"both directions", L"beide Richtungen");
        std::wstring mode = (r.mode == L"utxo" ? L"UTXO" : tr(L"Address", L"Adresse")) + L" · " + dir + L" · " +
                            tr(L"depth ", L"Tiefe ") + std::to_wstring(r.depth);
        u.p->text(truncate(u, mode, fSm(), colX[5] - colX[4] - 8.f),
                  Rect(colX[4], ty, colX[5] - colX[4] - 8.f, 20.f), fSm(), th.muted);
        u.p->text(truncate(u, fmtTimestamp(r.updatedAt), fSm(), colX[6] - colX[5] - 8.f),
                  Rect(colX[5], ty, colX[6] - colX[5] - 8.f, 20.f), fSm(), th.muted);

        // Aktionen, rechtsbuendig
        {
            std::wstring rep = tr(L"Report", L"Bericht");
            float rw = btnW(u, rep), dw = btnW(u, cDelete());
            float bx = colX[7] - dw;
            if (btn(u, L"case-del" + r.id, Rect(bx, ty - 6.f, dw, BTN_H), cDelete(), Btn::Secondary))
                removeCase = (int)rowIdx;
            btn(u, L"case-rep" + r.id, Rect(bx - 8.f - rw, ty - 6.f, rw, BTN_H), rep, Btn::Secondary);
        }
        cy += 40.f;
    }
    if (a.cases.empty()) {
        u.p->text(tr(L"No cases saved yet. Start a trace and save it.",
                     L"Noch keine Fälle gespeichert. Starte einen Trace und speichere ihn."),
                  Rect(cx, cy + 6.f, innerW, 24.f), fSm(), th.muted);
        cy += 30.f;
    }
    if (removeCase >= 0) {
        a.cases.erase(a.cases.begin() + removeCase);
        a.dirty = true;
    }
    col.endBlock(cardEnd(u, c, cy - c.inner));
    return col.used();
}

// ---------------------------------------------------------------------------
// Hintergrund-Auftraege
//
// Jede Netzabfrage der Anwendung laeuft als Auftrag in einem eigenen Thread.
// Diese Seite zeigt, was gerade laeuft und was zuletzt gelaufen ist.
// ---------------------------------------------------------------------------
float pageJobs(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    Col col(u, x, y, w, 16.f);

    std::vector<TaskInfo> tasks = taskList();

    {
        float cy = col.startBlock();
        float y0 = cy;
        Row row(u, x, cy, w, 12.f, 8.f, BTN_H);
        std::wstring title = tr(L"Background jobs", L"Hintergrund-Aufträge");
        u.p->text(title, row.place(textW(u, title, fLg(Wt::Semibold)), 28.f), fLg(Wt::Semibold),
                  th.foreground);
        int running = 0;
        for (const TaskInfo& t : tasks)
            if (t.status == L"running") running++;
        std::wstring sub = running ? std::to_wstring(running) + tr(L" running", L" laufend")
                                   : tr(L"nothing running", L"nichts läuft gerade");
        u.p->text(sub, row.place(textW(u, sub, fSm()), 20.f), fSm(), running ? th.brand : th.muted);
        std::wstring clr = tr(L"Clear the list", L"Liste leeren");
        if (btn(u, L"job-clear", row.placeRight(btnW(u, clr), BTN_H), clr, Btn::Secondary))
            taskClearFinished();
        col.endBlock(row.height());
        (void)y0;
    }

    CardCtx c = cardBegin(u, x, col.startBlock(), w, 0.f);
    float cx = c.x, cy = c.inner, innerW = w;

    const wchar_t* heads[5][2] = {{L"Job", L"Auftrag"},       {L"Kind", L"Art"},
                                  {L"Status", L"Status"},     {L"Started", L"Gestartet"},
                                  {L"Duration", L"Dauer"}};
    float fr[5] = {0.38f, 0.14f, 0.14f, 0.20f, 0.14f};
    float colX[6];
    colX[0] = cx + 12.f;
    for (int i = 0; i < 5; i++) colX[i + 1] = colX[i] + (innerW - 24.f) * fr[i];
    {
        for (int i = 0; i < 5; i++) {
            std::wstring s2 = tr(heads[i][0], heads[i][1]);
            std::wstring up;
            for (wchar_t ch : s2) up += (wchar_t)towupper(ch);
            Font f = fXs();
            f.tracking = true;
            u.p->text(up, Rect(colX[i], cy + 12.f, colX[i + 1] - colX[i] - 8.f, 16.f), f, th.muted);
        }
        cy += 40.f;
        hline(u, cx, cy, innerW, th.border);
    }

    long long now = (long long)time(nullptr);
    for (const TaskInfo& t : tasks) {
        float ty = cy + 10.f;
        u.p->text(truncate(u, t.name, fSm(Wt::Medium), colX[1] - colX[0] - 8.f),
                  Rect(colX[0], ty, colX[1] - colX[0] - 8.f, 20.f), fSm(Wt::Medium), th.foreground);

        std::wstring kind = t.group == L"trace"     ? L"Trace"
                            : t.group == L"path"    ? tr(L"Connection", L"Verbindung")
                            : t.group == L"screen"  ? tr(L"Bulk check", L"Massenprüfung")
                            : t.group == L"address" ? tr(L"Address", L"Adresse")
                            : t.group == L"tx"      ? tr(L"Transaction", L"Transaktion")
                            : t.group == L"watch"   ? L"Watchlist"
                            : t.group == L"ping"    ? tr(L"Sources", L"Quellen")
                            : t.group == L"price"   ? tr(L"Rate", L"Kurs")
                                                    : t.group;
        u.p->text(kind, Rect(colX[1], ty, colX[2] - colX[1] - 8.f, 20.f), fSm(), th.fg2);

        bool running = t.status == L"running";
        std::wstring st = running ? tr(L"running", L"läuft") : tr(L"done", L"fertig");
        Color bg = running ? th.tw(Tw::Blue500).op(0.2f).over(th.panel)
                           : th.tw(Tw::Green600).op(0.22f).over(th.panel);
        Color fg = running ? th.tw(Tw::Blue300) : th.tw(Tw::Green300);
        Font bf = fXs();
        badge(u, Rect(colX[2], ty, badgeW(u, st, bf, 8.f), 20.f), st, bg, fg, bf, 10.f);

        u.p->text(fmtTimestamp(t.created), Rect(colX[3], ty, colX[4] - colX[3] - 8.f, 20.f), fXs(),
                  th.muted);

        long long end = t.finished ? t.finished : now;
        long long secs = end - t.created;
        std::wstring dur = secs < 60 ? std::to_wstring(secs) + L" s"
                                     : std::to_wstring(secs / 60) + tr(L" min ", L" Min ") +
                                           std::to_wstring(secs % 60) + L" s";
        u.p->text(dur, Rect(colX[4], ty, colX[5] - colX[4], 20.f), fXs(), th.muted);

        cy += 40.f;
        hline(u, cx, cy, innerW, th.border.op(0.6f).over(th.panel));
    }

    if (tasks.empty()) {
        u.p->text(tr(L"No queries yet. Every search, trace and check appears here.",
                     L"Noch keine Abfragen. Jede Suche, jeder Trace und jede Prüfung erscheint hier."),
                  Rect(cx + 12.f, cy + 12.f, innerW - 24.f, 24.f), fSm(), th.muted);
        cy += 40.f;
    }

    col.endBlock(cardEnd(u, c, cy - c.inner));
    return col.used();
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------
float pageWatchlist(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    Col col(u, x, y, w, 16.f);
    col.endBlock(sectionHeading(a, x, col.startBlock(), w, L"Watchlist"));

    int unread = 0;
    for (const WatchRow& r : a.watches)
        for (const WatchEvent& e : r.events)
            if (!e.read) unread++;

    // Kopfzeile mit Zaehler und „Jetzt prüfen“
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        Row row(u, cx, cy, innerW, 12.f, 8.f, BTN_H);
        std::wstring s = unread ? std::to_wstring(unread) + tr(L" unread events", L" ungelesene Ereignisse")
                                : tr(L"No unread events", L"Keine ungelesenen Ereignisse");
        Rect r1 = row.place(textW(u, s, fSm(Wt::Semibold)), 20.f);
        u.p->text(s, r1, fSm(Wt::Semibold), unread ? th.brand : th.muted);
        bool busy = false;
        for (const WatchRow& wr : a.watches)
            if (wr.checking) busy = true;
        std::wstring auto1 = busy ? tr(L"Checking…", L"Prüfe…")
                                  : tr(L"The addresses are checked when you press the button.",
                                       L"Die Adressen werden auf Knopfdruck geprüft.");
        u.p->text(auto1, row.place(textW(u, auto1, fXs()), 20.f), fXs(), th.subtle);
        std::wstring chk = tr(L"Check now", L"Jetzt prüfen");
        if (btn(u, L"wl-check", row.placeRight(btnW(u, chk), BTN_H), chk, Btn::Secondary))
            liveCheckWatches(a);
        col.endBlock(cardEnd(u, c, row.height()));
    }

    // Adresse aufnehmen
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Watch an address", L"Adresse beobachten"), Rect(cx, cy, innerW, 24.f),
                  fBase(Wt::Semibold), th.foreground);
        cy += 28.f;
        int cols = w >= 900.f ? 4 : 1;
        float gap = 12.f;
        float unit = (innerW - gap * (cols - 1)) / cols;
        float fx = cx;
        auto next = [&]() {
            if (cols == 1) { cy += LABEL_H + INPUT_H + gap; }
            else fx += unit + gap;
        };
        fieldLabel(u, fx, cy, tr(L"Address", L"Adresse"));
        inputBox(u, L"wl-addr", Rect(fx, cy + LABEL_H, unit, INPUT_H), a.watchNew, L"bc1…", true);
        next();
        fieldLabel(u, fx, cy, tr(L"Name", L"Bezeichnung"));
        inputBox(u, L"wl-note", Rect(fx, cy + LABEL_H, unit, INPUT_H), a.watchNote,
                 tr(L"e.g. exchange wallet", L"z. B. Börsen-Wallet"));
        next();
        fieldLabel(u, fx, cy, cChain());
        std::vector<std::wstring> names;
        for (const ChainMeta& m : CHAINS) names.push_back(m.name);
        selectBox(u, L"wl-chain", Rect(fx, cy + LABEL_H, unit, INPUT_H), names, a.watchChain);
        next();
        fieldLabel(u, fx, cy, tr(L"Minimum amount (sat)", L"Mindestbetrag (sat)"));
        inputBox(u, L"wl-min", Rect(fx, cy + LABEL_H, unit, INPUT_H), a.watchMin, L"");
        cy += LABEL_H + INPUT_H + 8.f;

        std::wstring hint = tr(L"The minimum amount is given in the smallest unit of the chain (sat). "
                               L"0 reports every movement.",
                               L"Der Mindestbetrag wird in der kleinsten Einheit der Chain angegeben (sat). "
                               L"0 meldet jede Bewegung.");
        float hh = textH(u, hint, fXs(), innerW);
        u.p->text(hint, Rect(cx, cy, innerW, hh), fXs(), th.subtle, Align::Left, true);
        cy += hh + 12.f;
        std::wstring add = tr(L"Watch", L"Beobachten");
        if (btn(u, L"wl-add", Rect(cx, cy, btnW(u, add), BTN_H), add, Btn::Primary,
                a.watchNew.empty())) {
            WatchRow wr;
            wr.id = newId();
            wr.address = a.watchNew;
            wr.note = a.watchNote;
            wr.chain = chainAt(a.watchChain).id;
            wr.lastCheck = (long long)time(nullptr);
            a.watches.push_back(wr);
            a.watchNew.clear();
            a.watchNote.clear();
            a.message = tr(L"This address is now being watched.", L"Adresse wird jetzt beobachtet.");
            a.dirty = true;
            liveCheckWatches(a);
        }
        cy += BTN_H;
        if (!a.message.empty()) {
            u.p->text(a.message, Rect(cx, cy + 8.f, innerW, 20.f), fSm(), th.tw(Tw::Green400));
            cy += 28.f;
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    // Beobachtete Adressen
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Watched addresses", L"Beobachtete Adressen"), Rect(cx, cy, innerW, 24.f),
                  fBase(Wt::Semibold), th.foreground);
        cy += 30.f;

        const wchar_t* heads[6][2] = {{L"Address", L"Adresse"},     {L"Name", L"Bezeichnung"},
                                      {L"Balance", L"Saldo"},        {L"Last check", L"Letzte Prüfung"},
                                      {L"Status", L"Status"},        {L"", L""}};
        float fr[6] = {0.26f, 0.20f, 0.14f, 0.16f, 0.10f, 0.14f};
        float colX[7];
        colX[0] = cx;
        for (int i = 0; i < 6; i++) colX[i + 1] = colX[i] + innerW * fr[i];
        tableHead(u, colX, 6, heads, cy);
        cy += 22.f;

        int removeWatch = -1;
        for (size_t wi = 0; wi < a.watches.size(); wi++) {
            const WatchRow& r = a.watches[wi];
            hline(u, cx, cy, innerW, th.border);
            float ty = cy + 8.f;
            const ChainMeta* meta = &CHAINS[0];
            for (const ChainMeta& m : CHAINS)
                if (m.id == r.chain) meta = &m;

            Rect ar(colX[0], ty + 2.f, colX[1] - colX[0] - 8.f, 16.f);
            Color ac = u.mouseIn(ar) ? th.brand : th.foreground;
            if (u.mouseIn(ar)) {
                u.cursorHand = true;
                if (u.in.pressed) a.go(Page::Address, r.address);
            }
            u.p->text(shortHash(r.address, 10), ar, mXs(), ac);
            u.p->text(truncate(u, r.note.empty() ? tr(L"(no name)", L"(ohne Bezeichnung)") : r.note, fSm(),
                               colX[2] - colX[1] - 8.f),
                      Rect(colX[1], ty, colX[2] - colX[1] - 8.f, 20.f), fSm(), th.foreground);
            u.p->text(fmtAmount((double)r.balanceSat, meta->decimals, meta->symbol, 4),
                      Rect(colX[2], ty, colX[3] - colX[2] - 8.f, 20.f), fSm(), th.fg2);
            u.p->text(truncate(u, fmtTimestamp(r.lastCheck), fSm(), colX[4] - colX[3] - 8.f),
                      Rect(colX[3], ty, colX[4] - colX[3] - 8.f, 20.f), fSm(), th.muted);
            std::wstring st = r.checking  ? tr(L"checking…", L"prüfe…")
                              : !r.error.empty() ? tr(L"error", L"Fehler")
                              : r.paused    ? tr(L"paused", L"pausiert")
                                            : tr(L"active", L"aktiv");
            Rect stR(colX[4], ty, colX[5] - colX[4] - 8.f, 20.f);
            u.p->text(st, stR, fSm(),
                      !r.error.empty() ? th.tw(Tw::Red400)
                      : r.paused       ? th.subtle
                                       : th.tw(Tw::Green400));
            if (!r.error.empty()) tooltip(u, stR, r.error);

            int un = 0;
            for (const WatchEvent& e : r.events)
                if (!e.read) un++;
            {
                Row rw(u, colX[5], ty - 6.f, colX[6] - colX[5], 8.f, 8.f, BTN_H);
                if (un) {
                    std::wstring b = std::to_wstring(un) + tr(L" unread", L" ungelesen");
                    Font bf = fPx(10.f);
                    Rect br = rw.place(badgeW(u, b, bf), 18.f);
                    badge(u, br, b, th.accent, Color::hex(0x000000), bf, 9.f);
                    tooltip(u, br, tr(L"Mark as read", L"Als gelesen markieren"));
                    if (u.mouseIn(br)) {
                        u.cursorHand = true;
                        if (u.in.pressed) {
                            for (WatchEvent& e : a.watches[wi].events) e.read = true;
                            a.dirty = true;
                        }
                    }
                }
                if (btn(u, L"wl-del" + r.id, rw.placeRight(btnW(u, cDelete()), BTN_H), cDelete(),
                        Btn::Secondary))
                    removeWatch = (int)wi;
            }
            cy += 36.f;

            // Ereignisse
            for (const WatchEvent& e : r.events) {
                Color evC = e.read ? th.subtle : th.accent;
                u.p->ellipse(Rect(colX[0] + 4.f, cy + 7.f, 5.f, 5.f), &evC, nullptr);
                u.p->text(fmtTimestamp(e.at), Rect(colX[0] + 16.f, cy, 200.f, 16.f), fXs(), th.subtle);
                u.p->text(e.text, Rect(colX[1], cy, innerW - (colX[1] - cx), 16.f), fXs(),
                          e.read ? th.muted : th.foreground);
                cy += 20.f;
            }
            if (!r.events.empty()) cy += 4.f;
        }
        if (a.watches.empty()) {
            u.p->text(tr(L"No addresses in the watchlist yet.",
                         L"Noch keine Adressen in der Watchlist."),
                      Rect(cx, cy + 6.f, innerW, 24.f), fSm(), th.muted);
            cy += 30.f;
        }
        if (removeWatch >= 0) {
            a.watches.erase(a.watches.begin() + removeWatch);
            a.dirty = true;
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    // Benachrichtigungen
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Notifications", L"Benachrichtigungen"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold),
                  th.foreground);
        cy += 30.f;
        static bool desktopNote = true;
        std::wstring lab = tr(L"Show a notice in the app", L"Hinweis in der App anzeigen");
        checkbox(u, L"wl-note", cx, cy, 20.f, desktopNote, lab, fSm(), th.foreground);
        cy += 26.f;
        int cols = w >= 900.f ? 2 : 1;
        float gap = 12.f;
        float unit = (innerW - gap * (cols - 1)) / cols;
        static std::wstring tg, hook;
        fieldLabel(u, cx, cy, tr(L"Telegram chat ID", L"Telegram-Chat-ID"));
        inputBox(u, L"wl-tg", Rect(cx, cy + LABEL_H, unit, INPUT_H), tg, tr(L"e.g. 123456789", L"z. B. 123456789"));
        float fx2 = cols > 1 ? cx + unit + gap : cx;
        float fy2 = cols > 1 ? cy : cy + LABEL_H + INPUT_H + gap;
        fieldLabel(u, fx2, fy2, tr(L"Webhook URL", L"Webhook-URL"));
        inputBox(u, L"wl-hook", Rect(fx2, fy2 + LABEL_H, unit, INPUT_H), hook, L"https://…");
        cy = fy2 + LABEL_H + INPUT_H + 8.f;
        std::wstring hint = tr(L"Events are sent as JSON by POST to this URL. Leave empty to switch it off.",
                               L"Ereignisse werden als JSON per POST an diese URL gesendet. Leer lassen "
                               L"schaltet es ab.");
        float hh = textH(u, hint, fXs(), innerW);
        u.p->text(hint, Rect(cx, cy, innerW, hh), fXs(), th.subtle, Align::Left, true);
        cy += hh + 12.f;
        btn(u, L"wl-save", Rect(cx, cy, btnW(u, cSave()), BTN_H), cSave(), Btn::Primary);
        cy += BTN_H;
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }
    return col.used();
}

// ---------------------------------------------------------------------------
// Eigene Labels
// ---------------------------------------------------------------------------
static Color annCategoryColor(const Theme& th, const std::wstring& c, Color* fg) {
    Color white = Color::hex(0xffffff), black = Color::hex(0x000000);
    *fg = white;
    if (c == L"exchange") return th.tw(Tw::Blue500).op(0.8f).over(th.panel);
    if (c == L"mixer") { *fg = black; return th.tw(Tw::Orange500).op(0.8f).over(th.panel); }
    if (c == L"scam") return th.tw(Tw::Red500).op(0.8f).over(th.panel);
    if (c == L"sanctioned") return th.tw(Tw::Red600);
    if (c == L"ransomware") return th.tw(Tw::Rose700);
    if (c == L"darknet") return th.tw(Tw::Purple600).op(0.8f).over(th.panel);
    if (c == L"gambling") return th.tw(Tw::Emerald600).op(0.8f).over(th.panel);
    if (c == L"mining") { *fg = black; return th.tw(Tw::Amber600).op(0.8f).over(th.panel); }
    if (c == L"service") return th.tw(Tw::Indigo500).op(0.8f).over(th.panel);
    if (c == L"swap") return th.tw(Tw::Teal600).op(0.8f).over(th.panel);
    if (c == L"bridge") return th.tw(Tw::Cyan700).op(0.8f).over(th.panel);
    if (c == L"wallet") return th.tw(Tw::Gray600);
    if (c == L"custom") { *fg = black; return th.accent; }
    *fg = th.fg2;
    return th.tw(Tw::Gray700);
}

float pageAnnotations(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    Col col(u, x, y, w, 16.f);
    {
        float cy = col.startBlock();
        float y0 = cy;
        cy += sectionHeading(a, x, cy, w,
                             tr(L"Your own labels and notes", L"Eigene Labels und Notizen")) + 4.f;
        std::wstring lead = tr(
            L"Here you give addresses your own names. Your labels appear everywhere in the app – on the "
            L"address page, in the graph and in the history – marked as source “own”, and they "
            L"take precedence over external databases.",
            L"Hier vergibst du eigene Bezeichnungen für Adressen. Eigene Labels erscheinen überall in der "
            L"App – auf der Adressseite, im Graph und im Verlauf – mit der Quelle „eigene“ und "
            L"haben Vorrang vor externen Datenbanken.");
        float lh = textH(u, lead, fSm(), w);
        u.p->text(lead, Rect(x, cy, w, lh), fSm(), th.muted, Align::Left, true);
        cy += lh;
        col.endBlock(cy - y0);
    }

    // Neues Label
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        bool editing = !a.annEditId.empty();
        u.p->text(editing ? tr(L"Edit label", L"Label bearbeiten")
                          : tr(L"Create a new label", L"Neues Label anlegen"),
                  Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
        cy += 28.f;

        int cols = w >= 1024.f ? 4 : (w >= 640.f ? 2 : 1);
        float gap = 12.f;
        float unit = (innerW - gap * (cols - 1)) / cols;
        int i = 0;
        auto slot = [&](int idx) {
            float fx = cx + (idx % cols) * (unit + gap);
            float fy = cy + (idx / cols) * (LABEL_H + INPUT_H + gap);
            return Rect(fx, fy, unit, INPUT_H);
        };
        Rect r = slot(i++);
        fieldLabel(u, r.x, r.y, tr(L"Address", L"Adresse"));
        inputBox(u, L"an-addr", Rect(r.x, r.y + LABEL_H, r.w, INPUT_H), a.annAddress, L"bc1…", true);
        r = slot(i++);
        fieldLabel(u, r.x, r.y, tr(L"Name", L"Bezeichnung"));
        inputBox(u, L"an-label", Rect(r.x, r.y + LABEL_H, r.w, INPUT_H), a.annLabel,
                 tr(L"e.g. payout address of suspect A", L"z. B. Auszahlungsadresse Verdächtiger A"));
        r = slot(i++);
        fieldLabel(u, r.x, r.y, tr(L"Category", L"Kategorie"));
        std::vector<std::wstring> cats;
        for (auto* cid : CATEGORY_IDS) cats.push_back(categoryLabel(cid));
        selectBox(u, L"an-cat", Rect(r.x, r.y + LABEL_H, r.w, INPUT_H), cats, a.annCategory);
        r = slot(i++);
        fieldLabel(u, r.x, r.y, tr(L"Risk", L"Risiko"));
        std::vector<std::wstring> risks = {tr(L"none", L"keins"), riskLabel(L"low"), riskLabel(L"medium"),
                                           riskLabel(L"high")};
        selectBox(u, L"an-risk", Rect(r.x, r.y + LABEL_H, r.w, INPUT_H), risks, a.annRisk);

        cy += ((i + cols - 1) / cols) * (LABEL_H + INPUT_H + gap);
        fieldLabel(u, cx, cy, tr(L"Note", L"Notiz"));
        textArea(u, L"an-note", Rect(cx, cy + LABEL_H, innerW, 64.f), a.annNote,
                 tr(L"Free text about the address, source of the information, case reference …",
                    L"Freitext zur Adresse, Herkunft der Information, Fallbezug …"));
        cy += LABEL_H + 64.f + 12.f;

        Row row(u, cx, cy, innerW, 12.f, 8.f, BTN_H);
        std::wstring sub = editing ? tr(L"Save changes", L"Änderungen speichern")
                                   : tr(L"Create label", L"Label anlegen");
        bool incomplete = a.annAddress.empty() || a.annLabel.empty();
        if (btn(u, L"an-submit", row.place(btnW(u, sub), BTN_H), sub, Btn::Primary, incomplete)) {
            const wchar_t* riskIds[] = {L"", L"low", L"medium", L"high"};
            AnnotationRow* target = nullptr;
            if (editing) {
                for (AnnotationRow& an : a.annotations)
                    if (an.id == a.annEditId) target = &an;
            }
            if (!target) {
                AnnotationRow fresh;
                fresh.id = newId();
                a.annotations.insert(a.annotations.begin(), fresh);
                target = &a.annotations.front();
            }
            target->address = a.annAddress;
            target->label = a.annLabel;
            target->note = a.annNote;
            target->category = CATEGORY_IDS[a.annCategory < 14 ? a.annCategory : 13];
            target->risk = riskIds[a.annRisk < 4 ? a.annRisk : 0];
            target->chain = chainAt(a.annChain).id;
            target->updatedAt = (long long)time(nullptr);
            a.message = editing ? tr(L"Label updated.", L"Label aktualisiert.")
                                : tr(L"Label saved.", L"Label gespeichert.");
            a.annAddress.clear();
            a.annLabel.clear();
            a.annNote.clear();
            a.annEditId.clear();
            a.dirty = true;
        }
        if (editing) {
            if (btn(u, L"an-cancel", row.place(btnW(u, cCancel()), BTN_H), cCancel(), Btn::Secondary)) {
                a.annAddress.clear();
                a.annLabel.clear();
                a.annNote.clear();
                a.annEditId.clear();
            }
        }
        if (!a.message.empty()) {
            Rect mr = row.place(textW(u, a.message, fSm()), 20.f);
            u.p->text(a.message, mr, fSm(), th.tw(Tw::Green400));
        }
        cy += row.height() + 6.f;
        std::wstring hint = tr(L"There is exactly one of your own labels per address and chain; saving again "
                               L"overwrites the existing one.",
                               L"Pro Adresse und Chain gibt es genau ein eigenes Label; erneutes Speichern "
                               L"überschreibt das vorhandene.");
        float hh = textH(u, hint, fXs(), innerW);
        u.p->text(hint, Rect(cx, cy, innerW, hh), fXs(), th.subtle, Align::Left, true);
        cy += hh;
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    // Liste
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        Row head(u, cx, cy, innerW, 12.f, 8.f, INPUT_H);
        std::wstring t2 = tr(L"My labels", L"Meine Labels");
        u.p->text(t2, head.place(textW(u, t2, fBase(Wt::Semibold)), 24.f), fBase(Wt::Semibold), th.foreground);
        inputBox(u, L"an-search", head.placeRight((std::min)(300.f, innerW * .4f), INPUT_H), a.annSearch,
                 tr(L"Search in address, name, note", L"Suche in Adresse, Bezeichnung, Notiz"));
        cy += head.height() + 12.f;

        const wchar_t* heads[6][2] = {{L"Address", L"Adresse"},   {L"Name", L"Bezeichnung"},
                                      {L"Category", L"Kategorie"}, {L"Risk", L"Risiko"},
                                      {L"Note", L"Notiz"},        {L"", L""}};
        float fr[6] = {0.22f, 0.18f, 0.11f, 0.08f, 0.26f, 0.15f};
        float colX[7];
        colX[0] = cx;
        for (int i = 0; i < 6; i++) colX[i + 1] = colX[i] + innerW * fr[i];
        tableHead(u, colX, 6, heads, cy);
        cy += 22.f;

        auto matches = [&](const AnnotationRow& r) {
            if (a.annSearch.empty()) return true;
            std::wstring hay = r.address + L" " + r.label + L" " + r.note;
            std::wstring needle = a.annSearch;
            for (auto& ch : hay) ch = (wchar_t)towlower(ch);
            for (auto& ch : needle) ch = (wchar_t)towlower(ch);
            return hay.find(needle) != std::wstring::npos;
        };
        int removeAnn = -1, editAnn = -1, shown = 0;
        for (size_t ai = 0; ai < a.annotations.size(); ai++) {
            const AnnotationRow& r = a.annotations[ai];
            if (!matches(r)) continue;
            shown++;
            hline(u, cx, cy, innerW, th.border);
            float ty = cy + 8.f;
            Rect ar(colX[0], ty + 2.f, colX[1] - colX[0] - 8.f, 16.f);
            Color ac = u.mouseIn(ar) ? th.brand : th.foreground;
            if (u.mouseIn(ar)) {
                u.cursorHand = true;
                if (u.in.pressed) a.go(Page::Address, r.address);
            }
            u.p->text(shortHash(r.address, 8), ar, mXs(), ac);

            {
                float nx = colX[1];
                Font nf = fSm();
                float nw = (std::min)(textW(u, r.label, nf), colX[2] - colX[1] - 8.f);
                u.p->text(truncate(u, r.label, nf, nw), Rect(nx, ty, nw, 20.f), nf, th.foreground);
                if (r.shared) {
                    Font bf = fPx(10.f);
                    float bw = badgeW(u, cShared(), bf);
                    if (nx + nw + 6.f + bw < colX[2])
                        badge(u, Rect(nx + nw + 6.f, ty + 2.f, bw, 16.f), cShared(),
                              th.tw(Tw::Indigo600).op(0.7f).over(th.panel), Color::hex(0xffffff), bf);
                }
            }
            {
                Color fg;
                Color bg = annCategoryColor(th, r.category, &fg);
                Font bf = fXs();
                std::wstring cl = categoryLabel(r.category);
                badge(u, Rect(colX[2], ty, badgeW(u, cl, bf), 20.f), cl, bg, fg, bf);
            }
            Color rc = r.risk == L"high"     ? th.tw(Tw::Red400)
                       : r.risk == L"medium" ? th.tw(Tw::Amber400)
                       : r.risk == L"low"    ? th.tw(Tw::Emerald400)
                                             : th.muted;
            u.p->text(riskLabel(r.risk), Rect(colX[3], ty, colX[4] - colX[3] - 8.f, 20.f), fSm(), rc);
            u.p->text(truncate(u, r.note.empty() ? L"–" : r.note, fXs(), colX[5] - colX[4] - 8.f),
                      Rect(colX[4], ty + 2.f, colX[5] - colX[4] - 8.f, 16.f), fXs(), th.muted);
            {
                Row rw(u, colX[5], ty - 6.f, colX[6] - colX[5], 8.f, 8.f, BTN_H);
                float ew = btnW(u, cEdit()), dw = btnW(u, cDelete());
                if (btn(u, L"an-edit" + r.id, Rect(colX[6] - dw - 8.f - ew, ty - 6.f, ew, BTN_H), cEdit(),
                        Btn::Secondary))
                    editAnn = (int)ai;
                if (btn(u, L"an-del" + r.id, Rect(colX[6] - dw, ty - 6.f, dw, BTN_H), cDelete(),
                        Btn::Secondary))
                    removeAnn = (int)ai;
            }
            cy += 40.f;
        }
        if (!shown) {
            u.p->text(tr(L"No labels yet.", L"Noch keine Labels."), Rect(cx, cy + 6.f, innerW, 24.f), fSm(),
                      th.muted);
            cy += 30.f;
        }
        if (editAnn >= 0) {
            const AnnotationRow& r = a.annotations[(size_t)editAnn];
            a.annEditId = r.id;
            a.annAddress = r.address;
            a.annLabel = r.label;
            a.annNote = r.note;
            a.annCategory = 13;
            for (int k = 0; k < 14; k++)
                if (r.category == CATEGORY_IDS[k]) a.annCategory = k;
            a.annRisk = r.risk == L"low" ? 1 : r.risk == L"medium" ? 2 : r.risk == L"high" ? 3 : 0;
            for (int k = 0; k < (int)CHAINS.size(); k++)
                if (CHAINS[(size_t)k].id == r.chain) a.annChain = k;
            a.message.clear();
        }
        if (removeAnn >= 0) {
            a.annotations.erase(a.annotations.begin() + removeAnn);
            a.message = tr(L"Label deleted.", L"Label gelöscht.");
            a.dirty = true;
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }
    return col.used();
}
