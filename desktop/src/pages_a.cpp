// ---------------------------------------------------------------------------
// pages_a.cpp - Suche, Trace, Verbindung, Massenpruefung.
// Vorbilder: src/app/page.tsx, TraceView.tsx, PathView.tsx, ScreenView.tsx.
// ---------------------------------------------------------------------------
#include "app.h"
#include <ctime>
#include <cmath>

// Karten in einem Raster gleich hoch machen (CSS-Grid streckt die Zeile).
struct GridCard {
    CardCtx ctx;
    float contentH = 0;
};
static float equalizeRow(Ui& u, std::vector<GridCard>& cards) {
    float maxH = 0;
    for (auto& g : cards) maxH = (std::max)(maxH, g.contentH);
    for (auto& g : cards) cardEnd(u, g.ctx, maxH);
    return maxH + 2 * CARD_PAD;
}

// ---------------------------------------------------------------------------
// Startseite
// ---------------------------------------------------------------------------
float pageHome(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    Col col(u, x, y, w, 32.f);   // space-y-8

    // --- Kopfbereich: mx-auto max-w-3xl space-y-4 pt-8 text-center ---------
    {
        float secW = (std::min)(768.f, w);
        float secX = x + (w - secW) * .5f;
        float cy = col.startBlock() + 32.f;   // pt-8
        float y0 = cy;

        Font h1 = f3Xl(Wt::Bold);
        std::vector<Span> title = {
            Span(tr(L"Trace ", L"Kryptowährungen "), h1, th.foreground),
            Span(tr(L"cryptocurrencies", L"zurückverfolgen"), h1, th.brand),
        };
        drawSpansLine(u, secX, cy, title, secW, Align::Center);
        cy += 36.f + 16.f;   // text-3xl Zeilenhoehe + space-y-4

        std::wstring lead = tr(
            L"Analyse addresses and transactions across several free data sources, follow the flow of funds "
            L"as a graph, spot wallet clusters, work out the share coming from one source and check "
            L"addresses against scam, mixer, ransomware and sanctions lists.",
            L"Adressen und Transaktionen über mehrere kostenlose Datenquellen analysieren, Geldflüsse als "
            L"Graph verfolgen, Wallet-Cluster erkennen, den Anteil aus einer Quelle berechnen und Adressen "
            L"gegen Scam-, Mixer-, Ransomware- und Sanktionslisten prüfen.");
        float lh = textH(u, lead, fBase(), secW);
        u.p->text(lead, Rect(secX, cy, secW, lh), fBase(), th.muted, Align::Center, true);
        cy += lh + 16.f;

        cy += searchBox(a, secX, cy, secW, true) + 16.f;

        // Zwei Links, mittig
        {
            std::wstring l1 = tr(L"To the trace graph →", L"Zum Trace-Graph →");
            std::wstring l2 = tr(L"Watch addresses →", L"Adressen beobachten →");
            float w1 = textW(u, l1, fSm()), w2 = textW(u, l2, fSm());
            float total = w1 + 16.f + w2;
            float lx = secX + (secW - total) * .5f;
            if (link(u, L"home-l1", Rect(lx, cy, w1, 20.f), l1, fSm(), th.brand)) a.go(Page::Trace);
            if (link(u, L"home-l2", Rect(lx + w1 + 16.f, cy, w2, 20.f), l2, fSm(), th.brand))
                a.go(Page::Watchlist);
            cy += 20.f + 16.f;
        }

        liveEnsurePrice(a, 0);
        std::wstring supported = tr(L"Supported:", L"Unterstützt:");
        for (size_t i = 0; i < CHAINS.size(); i++) supported += (i ? L" · " : L" ") + CHAINS[i].symbol;
        if (a.priceEur > 0)
            supported += L" · BTC " + fmtFiat(100000000.0, a.priceEur, 8) + L" (" + a.priceSource + L")";
        else if (a.priceLoading)
            supported += tr(L" · loading the rate…", L" · lade Kurs…");
        float sh = textH(u, supported, fXs(), secW);
        u.p->text(supported, Rect(secX, cy, secW, sh), fXs(), th.subtle, Align::Center, true);
        cy += sh;

        col.endBlock(cy - y0 + 32.f);
    }

    // --- Vier Karten: grid gap-4 md:grid-cols-4 ---------------------------
    {
        struct F { const wchar_t* te; const wchar_t* td; const wchar_t* be; const wchar_t* bd; };
        const F feats[4] = {
            {L"1 · Search", L"1 · Suchen",
             L"Enter an address or transaction: balance, history, labels and values at the rate of the day.",
             L"Adresse oder Transaktion eingeben: Saldo, Verlauf, Labels und Werte zum damaligen Kurs."},
            {L"2 · Follow", L"2 · Verfolgen",
             L"Address-based or UTXO-exact, forwards and backwards over several hops, live in the graph.",
             L"Adressbasiert oder UTXO-genau, vorwärts und rückwärts über mehrere Hops, live im Graph."},
            {L"3 · Assess", L"3 · Bewerten",
             L"Clustering, change detection, CoinJoin, peeling chains, timing patterns, taint share and risk labels.",
             L"Clustering, Wechselgeld, CoinJoin, Peeling-Ketten, Zeitmuster, Taint-Anteil und Risiko-Labels."},
            {L"4 · Document", L"4 · Dokumentieren",
             L"Cases with several traces, an audit log, your own labels and a printable report.",
             L"Fälle mit mehreren Traces, Protokoll, eigenen Labels und druckbarem Bericht."},
        };
        int cols = w >= 768.f ? 4 : (w >= 480.f ? 2 : 1);
        float gap = 16.f;
        float cw = (w - gap * (cols - 1)) / cols;
        float cy = col.startBlock();
        float rowY = cy;
        std::vector<GridCard> rowCards;
        float total = 0;
        for (int i = 0; i < 4; i++) {
            int cIdx = i % cols;
            if (i && cIdx == 0) {
                total += equalizeRow(u, rowCards) + gap;
                rowCards.clear();
                rowY = cy + total;
            }
            GridCard g;
            g.ctx = cardBegin(u, x + cIdx * (cw + gap), rowY, cw);
            float iy = g.ctx.inner;
            u.p->text(tr(feats[i].te, feats[i].td), Rect(g.ctx.x + CARD_PAD, iy, cw - 2 * CARD_PAD, 24.f),
                      fBase(Wt::Semibold), th.foreground);
            iy += 24.f;
            std::wstring body = tr(feats[i].be, feats[i].bd);
            float bh = textH(u, body, fSm(), cw - 2 * CARD_PAD);
            u.p->text(body, Rect(g.ctx.x + CARD_PAD, iy, cw - 2 * CARD_PAD, bh), fSm(), th.muted, Align::Left,
                      true);
            iy += bh;
            g.contentH = iy - g.ctx.inner;
            rowCards.push_back(g);
        }
        total += equalizeRow(u, rowCards);
        col.endBlock(total);
    }

    // --- Datenquellen ------------------------------------------------------
    {
        float cy = col.startBlock();
        col.endBlock(providerStatusList(a, x, cy, w));
    }
    return col.used();
}

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------
static float traceForm(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    CardCtx c = cardBegin(u, x, y, w);
    float innerW = w - 2 * CARD_PAD;
    float cx = c.x + CARD_PAD, cy = c.inner;

    int cols = w >= 1024.f ? 8 : (w >= 768.f ? 4 : 2);
    float gap = 12.f;
    float unit = (innerW - gap * (cols - 1)) / cols;
    auto span = [&](int n) { return unit * n + gap * (n - 1); };
    int wideSpan = cols >= 8 ? 3 : cols;   // lg:col-span-3, sonst volle Breite

    const ChainMeta& chain = chainAt(a.traceChain);

    float rowTopY = cy, rowTailX = cx;

    // Zeile 1
    {
        float fx = cx;
        fieldLabel(u, fx, cy, tr(L"Start (address or transaction ID)", L"Start (Adresse oder Transaktions-ID)"));
        inputBox(u, L"tr-start", Rect(fx, cy + LABEL_H, span(wideSpan), INPUT_H), a.traceStart, L"", true);
        fx += span(wideSpan) + gap;
        if (cols < 8) { cy += LABEL_H + INPUT_H + gap; fx = cx; }
        fieldLabel(u, fx, cy, tr(L"More starting points (one per line, optional)",
                                 L"Weitere Startpunkte (eine pro Zeile, optional)"));
        textArea(u, L"tr-more", Rect(fx, cy + LABEL_H, span(wideSpan), INPUT_H + 20.f), a.traceMore,
                 tr(L"e.g. further victim addresses", L"z. B. weitere Opferadressen"), true);
        rowTopY = cy;                  // Zeile 1 beginnt hier
        rowTailX = fx + span(wideSpan) + gap;
        cy += LABEL_H + INPUT_H + 20.f + gap;
    }

    // Auswahlfelder und Zahlen
    struct Field { const wchar_t* le; const wchar_t* ld; int kind; };  // kind 0=select 1=number
    std::vector<std::wstring> chainNames;
    for (const ChainMeta& m : CHAINS) chainNames.push_back(m.name + L" (" + m.symbol + L")");
    std::vector<std::wstring> modes = {tr(L"address-based", L"adressbasiert"), tr(L"UTXO-exact", L"UTXO-genau")};
    std::vector<std::wstring> dirs = {tr(L"Forward (where to?)", L"Vorwärts (wohin?)"),
                                      tr(L"Backward (where from?)", L"Rückwärts (woher?)"),
                                      tr(L"Both", L"Beides")};
    std::vector<std::wstring> taints = {tr(L"Haircut (proportional)", L"Haircut (anteilig)"),
                                        tr(L"FIFO (order)", L"FIFO (Reihenfolge)"),
                                        tr(L"Poison (strict)", L"Poison (streng)"),
                                        tr(L"none", L"keins")};

    // Chain und Modus sitzen im Raster noch in Zeile 1, rechts neben den
    // beiden breiten Feldern (lg: Spalten 7 und 8).
    bool tailInRow1 = cols >= 8;
    if (tailInRow1) {
        fieldLabel(u, rowTailX, rowTopY, tr(L"Chain", L"Chain"));
        selectBox(u, L"tr-chain", Rect(rowTailX, rowTopY + LABEL_H, unit, INPUT_H), chainNames, a.traceChain);
        float mx = rowTailX + unit + gap;
        fieldLabel(u, mx, rowTopY, tr(L"Mode", L"Modus"));
        Rect mr(mx, rowTopY + LABEL_H, unit, INPUT_H);
        selectBox(u, L"tr-mode", mr, modes, a.traceMode);
        tooltip(u, mr, tr(L"Address-based follows every transaction of an address. UTXO-exact follows only "
                          L"the specific coins.",
                          L"Adressbasiert folgt allen Transaktionen einer Adresse. UTXO-genau folgt nur den "
                          L"konkreten Coins."));
    }

    int perRow = cols;
    int idx = 0;
    auto cell = [&](int i) {
        int cIdx = i % perRow;
        return cx + cIdx * (unit + gap);
    };
    auto rowAdvance = [&](int i) {
        if (i && i % perRow == 0) cy += LABEL_H + INPUT_H + gap;
    };

    if (!tailInRow1) {
    rowAdvance(idx);
    fieldLabel(u, cell(idx), cy, tr(L"Chain", L"Chain"));
    selectBox(u, L"tr-chain", Rect(cell(idx), cy + LABEL_H, unit, INPUT_H), chainNames, a.traceChain);
    idx++;
    rowAdvance(idx);
    fieldLabel(u, cell(idx), cy, tr(L"Mode", L"Modus"));
    {
        Rect r(cell(idx), cy + LABEL_H, unit, INPUT_H);
        selectBox(u, L"tr-mode", r, modes, a.traceMode);
        tooltip(u, r, tr(L"Address-based follows every transaction of an address. UTXO-exact follows only "
                         L"the specific coins.",
                         L"Adressbasiert folgt allen Transaktionen einer Adresse. UTXO-genau folgt nur den "
                         L"konkreten Coins."));
    }
    idx++;
    }
    rowAdvance(idx);
    fieldLabel(u, cell(idx), cy, tr(L"Direction", L"Richtung"));
    selectBox(u, L"tr-dir", Rect(cell(idx), cy + LABEL_H, unit, INPUT_H), dirs, a.traceDir);
    idx++;
    rowAdvance(idx);
    fieldLabel(u, cell(idx), cy, tr(L"Taint model", L"Taint-Modell"));
    {
        Rect r(cell(idx), cy + LABEL_H, unit, INPUT_H);
        selectBox(u, L"tr-taint", r, taints, a.traceTaint);
        tooltip(u, r, tr(L"Haircut: proportional. Poison: everything is tainted. FIFO: order-based.",
                         L"Haircut: anteilig. Poison: alles gilt als belastet. FIFO: nach Reihenfolge."));
    }
    idx++;

    struct NumF { const wchar_t* le; const wchar_t* ld; std::wstring* v; };
    std::wstring minLabel = tr(L"Min. ", L"Min. ") + chain.unit;
    NumF nums[5] = {
        {L"Depth", L"Tiefe", &a.traceDepth},
        {L"Tx / address", L"Tx / Adresse", &a.traceTxPerAddr},
        {L"Addr. / tx", L"Adr. / Tx", &a.traceAddrPerTx},
        {nullptr, nullptr, &a.traceMinValue},
        {L"Max. nodes", L"Max. Knoten", &a.traceMaxNodes},
    };
    for (int i = 0; i < 5; i++) {
        rowAdvance(idx);
        std::wstring lab = nums[i].le ? tr(nums[i].le, nums[i].ld) : minLabel;
        fieldLabel(u, cell(idx), cy, lab);
        wchar_t id[32];
        swprintf(id, 32, L"tr-num%d", i);
        inputBox(u, id, Rect(cell(idx), cy + LABEL_H, unit, INPUT_H), *nums[i].v, L"");
        idx++;
    }
    cy += LABEL_H + INPUT_H + gap;

    // Schaltflaechen und Ankreuzfelder
    {
        Row row(u, cx, cy, innerW, 12.f, 8.f, BTN_H);
        std::wstring startLabel = a.traceRunning ? tr(L"Tracing…", L"Verfolge…")
                                                 : tr(L"Start the trace", L"Trace starten");
        Rect br = row.place(btnW(u, startLabel), BTN_H);
        if (btn(u, L"tr-run", br, startLabel, Btn::Primary, a.traceStart.empty() || a.traceRunning))
            liveStartTrace(a);
        if (a.traceRunning) {
            std::wstring cancel = tr(L"Cancel", L"Abbrechen");
            if (btn(u, L"tr-cancel", row.place(btnW(u, cancel), BTN_H), cancel, Btn::Secondary))
                liveCancelTrace(a);
        }

        struct Chk { const wchar_t* e; const wchar_t* d; bool* v; bool disabled; };
        Chk chks[4] = {
            {L"Labels", L"Labels", &a.traceEnrich, false},
            {L"historic rates", L"historische Kurse", &a.tracePrices, false},
            {L"Lightning", L"Lightning", &a.traceLightning, a.traceChain != 0},
            {L"include medium risk", L"mittleres Risiko einbeziehen", &a.traceMedium, false},
        };
        for (int i = 0; i < 4; i++) {
            std::wstring lab = tr(chks[i].e, chks[i].d);
            Rect r = row.place(checkboxW(u, lab, fSm()), 20.f);
            wchar_t id[32];
            swprintf(id, 32, L"tr-chk%d", i);
            checkbox(u, id, r.x, r.y, 20.f, *chks[i].v, lab, fSm(), th.foreground, chks[i].disabled);
            if (i == 3)
                tooltip(u, r, tr(L"Also count mixers and addresses with medium risk as a harmful origin",
                                 L"Mixer und Adressen mit mittlerem Risiko ebenfalls als schädliche Herkunft zählen"));
        }
        cy += row.height();
    }

    // Fortschrittszeile während des Laufs
    if (a.traceRunning) {
        cy += 8.f;
        Row pr(u, cx, cy, innerW, 12.f, 4.f, 20.f);
        Color dot = th.accent;
        Rect dr = pr.place(8.f, 8.f);
        u.p->ellipse(Rect(dr.x, dr.y, 8.f, 8.f), &dot, nullptr);
        std::wstring phase = a.tracePhase;
        if (!phase.empty()) u.p->text(phase, pr.place(textW(u, phase, fXs()), 16.f), fXs(), th.muted);
        if (!a.traceMessage.empty())
            u.p->text(a.traceMessage, pr.place(textW(u, a.traceMessage, fXs()), 16.f), fXs(), th.muted);
        wchar_t counts[160];
        swprintf(counts, 160,
                 g_locale == Loc::De ? L"%d Knoten · %d Kanten · %d API-Aufrufe"
                                     : L"%d nodes · %d edges · %d API calls",
                 a.traceProgressNodes, a.traceProgressEdges, a.traceProgressCalls);
        Rect cr2 = pr.placeRight(textW(u, counts, fXs()), 16.f);
        u.p->text(counts, cr2, fXs(), th.muted);
        cy += pr.height();
    }
    if (!a.traceError.empty()) {
        cy += 8.f;
        float eh = textH(u, a.traceError, fSm(), innerW);
        u.p->text(a.traceError, Rect(cx, cy, innerW, eh), fSm(), th.tw(Tw::Red400), Align::Left, true);
        cy += eh;
    }
    return cardEnd(u, c, cy - c.inner);
}

static float traceStats(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    const ChainMeta& chain = chainAt(a.traceChain);
    const TraceData& t = a.trace;

    CardCtx c = cardBegin(u, x, y, w);
    float innerW = w - 2 * CARD_PAD;
    Row row(u, c.x + CARD_PAD, c.inner, innerW, 24.f, 8.f, BTN_H);   // gap-x-6 gap-y-2

    auto pair = [&](const std::wstring& bold, const std::wstring& rest, Color col) {
        std::vector<Span> sp = {Span(bold, fSm(Wt::Bold), col), Span(L" " + rest, fSm(), col)};
        float ww = spansWidth(u, sp);
        Rect r = row.place(ww, 20.f);
        drawSpansLine(u, r.x, r.y, sp);
    };
    pair(std::to_wstring(t.addresses), tr(L"addresses", L"Adressen"), th.foreground);
    pair(std::to_wstring(t.txs), tr(L"transactions", L"Transaktionen"), th.foreground);
    pair(std::to_wstring(t.clusters), tr(L"clusters", L"Cluster"), th.foreground);
    pair(std::to_wstring(t.riskAddresses), tr(L"risk addresses", L"Risiko-Adressen"), th.foreground);

    if (t.riskSources > 0) {
        std::wstring s = L"⚠ " + fmtAmount((double)t.riskInflowSat, chain.decimals, chain.symbol, 4) +
                         tr(L" from ", L" von ") + std::to_wstring(t.riskSources) +
                         (t.riskSources == 1 ? tr(L" harmful address", L" schädlichen Adresse")
                                             : tr(L" harmful addresses", L" schädlichen Adressen"));
        Rect r = row.place(textW(u, s, fSm(Wt::Semibold)), 20.f);
        u.p->text(s, r, fSm(Wt::Semibold), th.tw(Tw::Red400));
        tooltip(u, r, tr(L"Money in the graph that comes from harmful addresses",
                         L"Geld im Graph, das von schädlichen Adressen stammt"));
    }
    if (a.optTaint) {
        std::wstring s = fmtAmount((double)t.taintedOutSat, chain.decimals, chain.symbol, 4) +
                         tr(L" traced", L" verfolgt");
        Rect r = row.place(textW(u, s, fSm()), 20.f);
        u.p->text(s, r, fSm(), th.tw(Tw::Orange300));
    }
    {
        std::wstring providers;
        for (size_t i = 0; i < t.providersUsed.size(); i++)
            providers += (i ? L", " : L"") + t.providersUsed[i];
        std::wstring s = std::to_wstring(t.apiCalls) + tr(L" API calls · ", L" API-Aufrufe · ") +
                         fmtNumber(t.durationMs / 1000.0, 1) + L" s · " + providers;
        Rect r = row.place((std::min)(textW(u, s, fSm()), innerW), 20.f);
        u.p->text(truncate(u, s, fSm(), r.w), r, fSm(), th.muted);
    }

    // ml-auto: Export / Speichern
    {
        std::wstring ex = tr(L"Export JSON", L"JSON exportieren");
        float exW = btnW(u, ex);
        std::wstring sv = tr(L"Save as a case", L"Als Fall speichern");
        float svW = btnW(u, sv);
        float total = exW + 8.f + 160.f + 8.f + svW;
        Rect g = row.placeRight(total, BTN_H);
        if (btn(u, L"tr-export", Rect(g.x, g.y, exW, BTN_H), ex, Btn::Secondary)) exportTraceJson(a);
        inputBox(u, L"tr-savename", Rect(g.x + exW + 8.f, g.y - 3.f, 160.f, INPUT_H), a.saveName,
                 tr(L"Name", L"Name"));
        if (btn(u, L"tr-save", Rect(g.r() - svW, g.y, svW, BTN_H), sv, Btn::Secondary)) {
            CaseRow cr;
            cr.id = newId();
            cr.name = a.saveName.empty() ? tr(L"Unnamed trace", L"Trace ohne Namen") : a.saveName;
            cr.start = a.traceStart;
            cr.chain = chain.id;
            cr.mode = a.traceMode == 1 ? L"utxo" : L"address";
            cr.direction = a.traceDir == 1 ? L"backward" : a.traceDir == 2 ? L"both" : L"forward";
            cr.traces = 1;
            cr.depth = _wtoi(a.traceDepth.c_str());
            cr.updatedAt = (long long)time(nullptr);
            a.cases.insert(a.cases.begin(), cr);
            a.saveName.clear();
            a.message = tr(L"Saved as a case.", L"Als Fall gespeichert.");
            a.dirty = true;
        }
    }
    float used = row.height();
    if (!a.message.empty()) {
        u.p->text(a.message, Rect(c.x + CARD_PAD, c.inner + used + 6.f, innerW, 20.f), fSm(),
                  th.tw(Tw::Green400));
        used += 26.f;
    }
    return cardEnd(u, c, used);
}

static float traceRiskBanner(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    const ChainMeta& chain = chainAt(a.traceChain);
    const TraceData& t = a.trace;
    if (t.riskSources <= 0) return 0.f;

    Color bd = th.tw(Tw::Red500).op(0.7f).over(th.background);
    Color bg = th.tw(Tw::Red950).op(0.4f).over(th.background);
    CardCtx c = cardBegin(u, x, y, w, 12.f, bd, bg);
    float cx = c.x + 12.f, cy = c.inner, innerW = w - 24.f;

    Row row(u, cx, cy, innerW, 12.f, 8.f, BTN_H);
    std::wstring title = L"⚠ " + std::to_wstring(t.riskSources) +
                         (t.riskSources == 1
                              ? tr(L" address classified as harmful in the graph",
                                   L" als schädlich eingestufte Adresse im Graph")
                              : tr(L" addresses classified as harmful in the graph",
                                   L" als schädlich eingestufte Adressen im Graph"));
    Rect r1 = row.place(textW(u, title, fSm(Wt::Semibold)), 20.f);
    u.p->text(title, r1, fSm(Wt::Semibold), th.tw(Tw::Red300));

    std::wstring body = std::to_wstring(t.riskAffected) +
                        (t.riskAffected == 1
                             ? tr(L" downstream address received money from them, ",
                                  L" nachgelagerte Adresse hat Geld von ihnen erhalten, ")
                             : tr(L" downstream addresses received money from them, ",
                                  L" nachgelagerte Adressen haben Geld von ihnen erhalten, ")) +
                        fmtAmount((double)t.riskInflowSat, chain.decimals, chain.symbol, 5) +
                        tr(L" in total.", L" insgesamt.");
    Rect r2 = row.place((std::min)(textW(u, body, fSm()), innerW - 200.f), 20.f);
    u.p->text(truncate(u, body, fSm(), r2.w), r2, fSm(), th.fg2);

    std::wstring vb = tr(L"View the warnings", L"Warnungen ansehen");
    Rect r3 = row.placeRight(btnW(u, vb), BTN_H);
    if (btn(u, L"tr-viewrisk", r3, vb, Btn::Secondary)) a.traceTab = 3;

    float used = row.height() + 8.f;
    // Quellen-Chips
    Row chips(u, cx, cy + used, innerW, 8.f, 8.f, 20.f);
    for (const GNode& n : a.trace.nodes) {
        if (!n.isRiskSource) continue;
        std::wstring s = n.label + L" (" + tr(L"ransomware", L"Ransomware") + L")";
        Font f = fXs();
        Rect r = chips.place(badgeW(u, s, f), 20.f);
        badge(u, r, s, th.tw(Tw::Red700), Color::hex(0xffffff), f);
        tooltip(u, r, n.address + L" · " + tr(L"source: ", L"Quelle: ") + n.labelSource);
    }
    used += chips.height();
    return cardEnd(u, c, used);
}

static float traceControls(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    Row row(u, x, y, w, 16.f, 8.f, BTN_H);

    // Reiter: flex overflow-hidden rounded-md border border-border
    {
        struct Tab { std::wstring name; };
        std::vector<std::wstring> tabs = {
            tr(L"Graph", L"Graph"), tr(L"History", L"Verlauf"), tr(L"Patterns", L"Muster"),
            a.trace.riskSources ? tr(L"Warnings (", L"Warnungen (") + std::to_wstring(a.trace.riskSources) + L")"
                                : tr(L"Warnings", L"Warnungen"),
            tr(L"Forensics", L"Forensik"),
        };
        float total = 0;
        std::vector<float> ws;
        for (auto& t2 : tabs) {
            float tw2 = textW(u, t2, fSm()) + 24.f;   // px-3
            ws.push_back(tw2);
            total += tw2;
        }
        Rect g = row.place(total, 30.f);
        Color bd = th.border;
        u.p->roundRect(g, R_MD, nullptr, &bd, 1.f);
        u.p->clipPush(g.inset(1.f));
        float cx = g.x;
        for (size_t i = 0; i < tabs.size(); i++) {
            Rect r(cx, g.y, ws[i], g.h);
            bool sel = (int)i == a.traceTab;
            Color fg = th.foreground;
            if (sel) {
                Color acc = th.accent;
                u.p->rect(r, acc);
                fg = Color::hex(0x000000);
            } else if (i == 3 && a.trace.riskSources) {
                fg = th.tw(Tw::Red400);
            }
            if (u.mouseIn(r)) {
                u.cursorHand = true;
                if (!sel) { Color hv = th.hover; u.p->rect(r, hv); }
                if (u.in.pressed) a.traceTab = (int)i;
            }
            u.p->text(tabs[i], Rect(r.x, r.y + 5.f, r.w, 20.f), fSm(), fg, Align::Center);
            cx += ws[i];
        }
        u.p->clipPop();
    }

    if (a.traceTab == 0) {
        std::wstring lab = tr(L"Layout", L"Layout");
        std::vector<std::wstring> layouts = {tr(L"left → right", L"links → rechts"),
                                             tr(L"top → bottom", L"oben → unten"),
                                             tr(L"Time axis", L"Zeitachse")};
        float selW = 0;
        for (auto& s : layouts) selW = (std::max)(selW, textW(u, s, fSm()) + 44.f);
        Rect r = row.place(textW(u, lab, fSm()) + 4.f + selW, INPUT_SM_H);
        u.p->text(lab, Rect(r.x, r.y + 5.f, 200.f, 20.f), fSm(), th.foreground);
        selectBox(u, L"tr-layout", Rect(r.x + textW(u, lab, fSm()) + 4.f, r.y, selW, INPUT_SM_H), layouts,
                  a.traceLayout);

        struct C2 { const wchar_t* e; const wchar_t* d; bool* v; Color col; };
        C2 opts[] = {
            {L"colour by cluster", L"nach Cluster färben", &a.optCluster, th.foreground},
            {L"hide change", L"Wechselgeld ausblenden", &a.optHideChange, th.foreground},
            {L"colour by taint", L"nach Taint färben", &a.optTaint, th.foreground},
            {L"highlight the origin", L"Herkunft hervorheben", &a.optRisk, th.foreground},
            {L"tainted flows only", L"nur belastete Flüsse", &a.optOnlyRisk, th.tw(Tw::Red300)},
        };
        for (int i = 0; i < 5; i++) {
            std::wstring l2 = tr(opts[i].e, opts[i].d);
            Rect r2 = row.place(checkboxW(u, l2, fSm()), 20.f);
            wchar_t id[32];
            swprintf(id, 32, L"tr-opt%d", i);
            checkbox(u, id, r2.x, r2.y, 20.f, *opts[i].v, l2, fSm(), opts[i].col);
        }
    }
    {
        std::wstring l2 = tr(L"show EUR", L"EUR anzeigen");
        Rect r2 = row.place(checkboxW(u, l2, fSm()), 20.f);
        checkbox(u, L"tr-fiat", r2.x, r2.y, 20.f, a.optFiat, l2, fSm(), th.foreground);
    }

    // Legende, rechtsbuendig
    {
        struct Leg { std::wstring text; int kind; Color col; };
        std::vector<Leg> legs = {
            {tr(L"high risk", L"hohes Risiko"), 1, th.tw(Tw::Red500)},
            {tr(L"known service", L"bekannter Dienst"), 1, th.tw(Tw::Blue400)},
            {tr(L"Start", L"Start"), 2, th.accent},
            {tr(L"⟲ change", L"⟲ Wechselgeld"), 0, th.tw(Tw::Yellow400)},
            {tr(L"green = coinbase", L"grün = Coinbase"), 0, th.tw(Tw::Green400)},
            {tr(L"⚠ red = money from a harmful address", L"⚠ rot = Geld von schädlicher Adresse"), 0,
             th.tw(Tw::Red400)},
        };
        float total = 0;
        Font lf = fXs();
        for (auto& l2 : legs) total += (l2.kind ? 16.f : 0.f) + textW(u, l2.text, lf) + 12.f;
        Rect g = row.placeRight((std::min)(total, w), 20.f);
        float cx = g.x;
        for (auto& l2 : legs) {
            if (l2.kind) {
                Rect sw(cx, g.y + 4.f, 12.f, 12.f);
                if (l2.kind == 1) u.p->roundRect(sw, 3.f, nullptr, &l2.col, 2.f);
                else u.p->ring(sw, 3.f, l2.col, 2.f, 0.f);
                cx += 16.f;
            }
            float tw2 = textW(u, l2.text, lf);
            u.p->text(l2.text, Rect(cx, g.y + 2.f, tw2, 16.f), lf, l2.kind ? th.muted : l2.col);
            cx += tw2 + 12.f;
        }
    }
    return row.height();
}

// Reiter „Warnungen“
static float traceRiskPanel(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    const ChainMeta& chain = chainAt(a.traceChain);
    CardCtx c = cardBegin(u, x, y, w);
    float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;

    u.p->text(tr(L"Where the money comes from", L"Woher das Geld stammt"),
              Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
    cy += 24.f;
    std::wstring lead = tr(L"Addresses reported by an external source, and the addresses downstream that "
                           L"received money from them.",
                           L"Adressen, die eine externe Quelle als schädlich meldet, und die nachgelagerten "
                           L"Adressen, die Geld von ihnen erhalten haben.");
    float lh = textH(u, lead, fSm(), innerW);
    u.p->text(lead, Rect(cx, cy, innerW, lh), fSm(), th.muted, Align::Left, true);
    cy += lh + 12.f;

    const wchar_t* heads[5][2] = {{L"Address", L"Adresse"}, {L"Label", L"Label"}, {L"Source", L"Quelle"},
                                  {L"Share", L"Anteil"},    {L"Amount", L"Betrag"}};
    float colW[5] = {0.28f, 0.22f, 0.18f, 0.14f, 0.18f};
    float colX[6];
    colX[0] = cx;
    for (int i = 0; i < 5; i++) colX[i + 1] = colX[i] + innerW * colW[i];
    Font hf = fXs();
    for (int i = 0; i < 5; i++) {
        std::wstring s = tr(heads[i][0], heads[i][1]);
        std::wstring up;
        for (wchar_t ch : s) up += (wchar_t)towupper(ch);
        u.p->text(up, Rect(colX[i], cy, colX[i + 1] - colX[i] - 8.f, 16.f), hf, th.subtle,
                  i >= 3 ? Align::Right : Align::Left);
    }
    cy += 22.f;
    for (const GNode& n : a.trace.nodes) {
        if (!n.isRiskSource && n.riskFromRatio <= 0.001) continue;
        hline(u, cx, cy, innerW, th.border);
        float ty = cy + 6.f;
        Rect ar(colX[0], ty, colX[1] - colX[0] - 8.f, 20.f);
        Color ac = u.mouseIn(ar) ? th.brand : th.foreground;
        if (u.mouseIn(ar)) {
            u.cursorHand = true;
            if (u.in.pressed) a.go(Page::Address, n.address);
        }
        u.p->text(shortHash(n.address, 10), ar, mXs(), ac);
        u.p->text(n.label.empty() ? L"–" : n.label, Rect(colX[1], ty, colX[2] - colX[1] - 8.f, 20.f), fSm(),
                  n.isRiskSource ? th.tw(Tw::Red300) : th.foreground);
        u.p->text(n.labelSource, Rect(colX[2], ty, colX[3] - colX[2] - 8.f, 20.f), fSm(), th.muted);
        u.p->text(fmtPercent(n.isRiskSource ? 1.0 : n.riskFromRatio, 0),
                  Rect(colX[3], ty, colX[4] - colX[3] - 8.f, 20.f), fSm(), th.foreground, Align::Right);
        u.p->text(fmtAmount((double)(n.isRiskSource ? n.receivedSat
                                                    : (long long)(n.receivedSat * n.riskFromRatio)),
                            chain.decimals, chain.symbol, 4),
                  Rect(colX[4], ty, colX[5] - colX[4], 20.f), fSm(), th.fg2, Align::Right);
        cy += 32.f;
    }
    return cardEnd(u, c, cy - c.inner);
}

// Reiter „Muster“ - alles aus dem geladenen Graphen berechnet
static float tracePatterns(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    const ChainMeta& chain = chainAt(a.traceChain);
    const TraceData& t = a.trace;
    Col col(u, x, y, w, 16.f);

    // --- Aktivitätsmuster ---------------------------------------------------
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Activity pattern", L"Aktivitätsmuster"), Rect(cx, cy, innerW, 24.f),
                  fBase(Wt::Semibold), th.foreground);
        cy += 28.f;
        std::vector<long long> times;
        for (const GNode& n : t.nodes)
            if (!n.isAddress && n.blockTime) times.push_back(n.blockTime);
        cy += activityHeatmap(a, cx, cy, innerW, times);
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    // --- Peeling-Ketten -----------------------------------------------------
    // Eine Peeling-Kette zweigt bei jedem Schritt einen kleinen Betrag ab und
    // schiebt den Rest weiter. Erkannt an Transaktionen mit zwei Ausgängen,
    // von denen einer den weitaus größten Teil trägt.
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Peeling chains", L"Peeling-Ketten"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold),
                  th.foreground);
        cy += 26.f;

        struct Step { std::wstring txid; double kept, peeled; };
        std::vector<Step> steps;
        for (const GNode& n : t.nodes) {
            if (n.isAddress || n.outputCount != 2) continue;
            // "small" ist ein Makro aus windows.h - deshalb andere Namen.
            double largest = 0, second = 0;
            for (const GEdge& e : t.edges) {
                if (e.from != n.id) continue;
                if (e.valueSat >= largest) {
                    second = largest;
                    largest = e.valueSat;
                } else if (e.valueSat > second) {
                    second = e.valueSat;
                }
            }
            double sum = largest + second;
            if (sum <= 0 || largest / sum < 0.7) continue;
            steps.push_back({n.txid, largest, second});
        }

        if (steps.empty()) {
            std::wstring none = tr(L"No peeling chain detected. Such chains peel off small amounts step by "
                                   L"step and pass the rest on – typical when cashing out.",
                                   L"Keine Peeling-Kette erkannt. Solche Ketten zweigen schrittweise kleine "
                                   L"Beträge ab und geben den Rest weiter – typisch beim Auszahlen.");
            float nh = textH(u, none, fSm(), innerW);
            u.p->text(none, Rect(cx, cy, innerW, nh), fSm(), th.subtle, Align::Left, true);
            cy += nh;
        } else {
            double peeled = 0, rest = 0;
            for (const Step& st : steps) peeled += st.peeled;
            rest = steps.back().kept;
            std::wstring line = tr(L"Chain over ", L"Kette über ") + std::to_wstring(steps.size()) +
                                tr(L" steps · peeled off ", L" Schritten · abgezweigt ") +
                                fmtAmount(peeled, chain.decimals, chain.symbol, 6);
            u.p->text(line, Rect(cx, cy, innerW, 20.f), fSm(), th.foreground);
            cy += 20.f;
            u.p->text(tr(L"Remaining at the end: ", L"Rest am Ende: ") +
                          fmtAmount(rest, chain.decimals, chain.symbol, 6),
                      Rect(cx, cy, innerW, 20.f), fSm(), th.muted);
            cy += 24.f;
            for (size_t i = 0; i < steps.size() && i < 12; i++) {
                Rect r(cx, cy, innerW, 16.f);
                Color lc = u.mouseIn(r) ? th.brand : th.fg2;
                if (u.mouseIn(r)) {
                    u.cursorHand = true;
                    if (u.in.pressed) {
                        a.route.chain = a.traceChain;
                        a.go(Page::Tx, steps[i].txid);
                    }
                }
                u.p->text(L"tx " + shortHash(steps[i].txid, 8) + L"  →  " +
                              fmtAmount(steps[i].kept, chain.decimals, chain.symbol, 6) + L"  /  " +
                              fmtAmount(steps[i].peeled, chain.decimals, chain.symbol, 6),
                          r, mXs(), lc);
                cy += 18.f;
            }
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    // --- Auffälliges Verhalten ---------------------------------------------
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Addresses with notable behaviour", L"Adressen mit auffälligem Verhalten"),
                  Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
        cy += 26.f;

        struct Note { std::wstring address, text; };
        std::vector<Note> notes;
        for (const GNode& n : t.nodes) {
            if (!n.isAddress || n.address.empty()) continue;
            int inEdges = 0, outEdges = 0;
            double roundSum = 0;
            int roundCount = 0;
            for (const GEdge& e : t.edges) {
                if (e.to == n.id) {
                    inEdges++;
                    double units = e.valueSat / std::pow(10.0, chain.decimals);
                    if (units > 0 && std::fabs(units * 100.0 - std::floor(units * 100.0 + 0.5)) < 1e-9 &&
                        units >= 0.01) {
                        roundCount++;
                        roundSum += e.valueSat;
                    }
                }
                if (e.from == n.id) outEdges++;
            }
            std::wstring text;
            if (roundCount >= 2)
                text = std::to_wstring(roundCount) + tr(L" incoming payments in round amounts",
                                                        L" Eingänge mit runden Beträgen");
            else if (inEdges >= 5)
                text = std::to_wstring(inEdges) + tr(L" incoming payments – looks like collecting",
                                                     L" Eingänge – wirkt wie ein Sammelpunkt");
            else if (outEdges >= 3)
                text = std::to_wstring(outEdges) + tr(L" outgoing payments – looks like distributing",
                                                      L" Ausgänge – wirkt wie eine Verteilung");
            if (!text.empty()) notes.push_back({n.address, text});
        }

        if (notes.empty()) {
            u.p->text(tr(L"No notable behaviour patterns detected.",
                         L"Keine auffälligen Verhaltensmuster erkannt."),
                      Rect(cx, cy, innerW, 20.f), fSm(), th.subtle);
            cy += 20.f;
        } else {
            for (size_t i = 0; i < notes.size() && i < 12; i++) {
                Color dc = th.tw(Tw::Cyan300);
                u.p->ellipse(Rect(cx + 3.f, cy + 8.f, 4.f, 4.f), &dc, nullptr);
                Rect r(cx + 16.f, cy, innerW - 16.f, 20.f);
                std::vector<Span> sp = {Span(shortHash(notes[i].address, 8) + L" · ", mXs(), th.foreground),
                                        Span(notes[i].text, fXs(), th.tw(Tw::Cyan300))};
                drawSpansLine(u, r.x, r.y + 2.f, sp);
                cy += 20.f;
            }
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }
    return col.used();
}

// Reiter „Forensik“ - Einzahlungsadressen und das Abfrageprotokoll
static float traceForensics(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    const ChainMeta& chain = chainAt(a.traceChain);
    const TraceData& t = a.trace;
    Col col(u, x, y, w, 16.f);

    // --- Einzahlungsadressen ------------------------------------------------
    // Eine Einzahlungsadresse nimmt Geld an und schiebt nahezu alles an eine
    // einzige weitere Adresse weiter - das Muster von Börsen-Einzahlungen.
    struct Deposit { std::wstring address, forwardsTo; double ratio; int events; };
    std::vector<Deposit> deposits;
    for (const GNode& n : t.nodes) {
        if (!n.isAddress || n.address.empty()) continue;
        double received = 0, forwarded = 0;
        std::map<std::wstring, double> targets;
        int events = 0;
        for (const GEdge& e : t.edges) {
            if (e.to == n.id) received += e.valueSat;
            if (e.from != n.id) continue;
            events++;
            forwarded += e.valueSat;
            // Wohin fließt es hinter der Transaktion weiter?
            for (const GEdge& e2 : t.edges)
                if (e2.from == e.to) targets[e2.to] += e2.valueSat;
        }
        if (received <= 0 || forwarded <= 0 || targets.empty()) continue;
        std::wstring best;
        double bestVal = 0, total = 0;
        for (auto& kv : targets) {
            total += kv.second;
            if (kv.second > bestVal) {
                bestVal = kv.second;
                best = kv.first;
            }
        }
        double ratio = total > 0 ? bestVal / total : 0;
        if (ratio < 0.9 || forwarded / received < 0.8) continue;
        deposits.push_back({n.address, best.size() > 2 ? best.substr(2) : best, ratio, events});
    }

    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Deposit addresses (", L"Einzahlungsadressen (") + std::to_wstring(deposits.size()) +
                      L")",
                  Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
        cy += 26.f;
        std::wstring lead = tr(L"Addresses that forward incoming money to a single next address almost "
                               L"unchanged.",
                               L"Adressen, die eingehendes Geld nahezu unverändert an eine einzige weitere "
                               L"Adresse weiterleiten.");
        float lh = textH(u, lead, fSm(), innerW);
        u.p->text(lead, Rect(cx, cy, innerW, lh), fSm(), th.muted, Align::Left, true);
        cy += lh + 8.f;

        if (deposits.empty()) {
            u.p->text(tr(L"None detected.", L"Keine erkannt."), Rect(cx, cy, innerW, 20.f), fSm(), th.subtle);
            cy += 20.f;
        } else {
            const wchar_t* heads[4][2] = {{L"Deposit address", L"Einzahlungsadresse"},
                                          {L"Forwards to", L"Leitet weiter an"},
                                          {L"Share", L"Anteil"},
                                          {L"Events", L"Ereignisse"}};
            float fr[4] = {0.34f, 0.34f, 0.16f, 0.16f};
            float colX[5];
            colX[0] = cx;
            for (int k = 0; k < 4; k++) colX[k + 1] = colX[k] + innerW * fr[k];
            for (int k = 0; k < 4; k++) {
                std::wstring s2 = tr(heads[k][0], heads[k][1]);
                std::wstring up;
                for (wchar_t ch : s2) up += (wchar_t)towupper(ch);
                u.p->text(up, Rect(colX[k], cy, colX[k + 1] - colX[k] - 8.f, 16.f), fXs(), th.subtle,
                          k >= 2 ? Align::Right : Align::Left);
            }
            cy += 22.f;
            for (const Deposit& d : deposits) {
                hline(u, cx, cy, innerW, th.border);
                float ty = cy + 6.f;
                Rect ar(colX[0], ty, colX[1] - colX[0] - 8.f, 20.f);
                Color ac = u.mouseIn(ar) ? th.brand : th.foreground;
                if (u.mouseIn(ar)) {
                    u.cursorHand = true;
                    if (u.in.pressed) {
                        a.route.chain = a.traceChain;
                        a.go(Page::Address, d.address);
                    }
                }
                u.p->text(shortHash(d.address, 8), ar, mXs(), ac);
                Rect fr2(colX[1], ty, colX[2] - colX[1] - 8.f, 20.f);
                Color fc = u.mouseIn(fr2) ? th.brand : th.foreground;
                if (u.mouseIn(fr2)) {
                    u.cursorHand = true;
                    if (u.in.pressed) {
                        a.route.chain = a.traceChain;
                        a.go(Page::Address, d.forwardsTo);
                    }
                }
                u.p->text(shortHash(d.forwardsTo, 8), fr2, mXs(), fc);
                u.p->text(fmtPercent(d.ratio, 0), Rect(colX[2], ty, colX[3] - colX[2] - 8.f, 20.f), fSm(),
                          th.foreground, Align::Right);
                u.p->text(std::to_wstring(d.events), Rect(colX[3], ty, colX[4] - colX[3], 20.f), fSm(),
                          th.muted, Align::Right);
                cy += 30.f;
            }
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    // --- Beweissicherung ----------------------------------------------------
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        u.p->text(tr(L"Evidence log", L"Beweissicherung"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold),
                  th.foreground);
        cy += 26.f;

        if (t.evidence.empty()) {
            u.p->text(tr(L"No queries recorded yet.", L"Noch keine Abfragen aufgezeichnet."),
                      Rect(cx, cy, innerW, 20.f), fSm(), th.subtle);
            cy += 20.f;
        } else {
            std::wstring lead = tr(L"Every query of this trace with its time and the SHA-256 checksum of "
                                   L"the answer. The overall checksum covers all entries.",
                                   L"Jede Abfrage dieses Traces mit Zeitpunkt und der SHA-256-Prüfsumme der "
                                   L"Antwort. Die Gesamtprüfsumme deckt alle Einträge ab.");
            float lh = textH(u, lead, fSm(), innerW);
            u.p->text(lead, Rect(cx, cy, innerW, lh), fSm(), th.muted, Align::Left, true);
            cy += lh + 8.f;

            Row r2(u, cx, cy, innerW, 24.f, 4.f, 20.f);
            std::vector<Span> s1 = {Span(std::to_wstring(t.evidence.size()), fSm(Wt::Bold), th.foreground),
                                    Span(tr(L" queries", L" Abfragen"), fSm(), th.foreground)};
            Rect p1 = r2.place(spansWidth(u, s1), 20.f);
            drawSpansLine(u, p1.x, p1.y, s1);
            std::wstring created = tr(L"recorded ", L"aufgezeichnet ") + fmtDate(t.startedAt);
            u.p->text(created, r2.place(textW(u, created, fSm()), 20.f), fSm(), th.foreground);
            std::wstring dg = tr(L"digest ", L"Prüfsumme ") + t.evidenceDigest;
            Rect p3 = r2.place((std::min)(textW(u, dg, mXs()), innerW), 20.f);
            u.p->text(truncate(u, dg, mXs(), p3.w), p3, mXs(), th.muted);
            tooltip(u, p3, t.evidenceDigest);
            cy += r2.height() + 10.f;

            const wchar_t* heads[4][2] = {{L"Query", L"Abfrage"}, {L"Time", L"Zeit"},
                                          {L"Status", L"Status"}, {L"SHA-256", L"SHA-256"}};
            float fr[4] = {0.46f, 0.14f, 0.10f, 0.30f};
            float colX[5];
            colX[0] = cx;
            for (int k = 0; k < 4; k++) colX[k + 1] = colX[k] + innerW * fr[k];
            for (int k = 0; k < 4; k++) {
                std::wstring s2 = tr(heads[k][0], heads[k][1]);
                std::wstring up;
                for (wchar_t ch : s2) up += (wchar_t)towupper(ch);
                u.p->text(up, Rect(colX[k], cy, colX[k + 1] - colX[k] - 8.f, 16.f), fXs(), th.subtle);
            }
            cy += 20.f;
            size_t shown = (std::min)(t.evidence.size(), (size_t)120);
            for (size_t i = 0; i < shown; i++) {
                const EvidenceEntry& e = t.evidence[i];
                hline(u, cx, cy, innerW, th.border);
                float ty = cy + 5.f;
                u.p->text(truncate(u, e.url, mXs(), colX[1] - colX[0] - 8.f),
                          Rect(colX[0], ty, colX[1] - colX[0] - 8.f, 16.f), mXs(), th.fg2);
                u.p->text(fmtTime(e.at), Rect(colX[1], ty, colX[2] - colX[1] - 8.f, 16.f), fXs(), th.muted);
                u.p->text(std::to_wstring(e.status), Rect(colX[2], ty, colX[3] - colX[2] - 8.f, 16.f), fXs(),
                          e.status >= 200 && e.status < 300 ? th.tw(Tw::Green400) : th.tw(Tw::Red400));
                u.p->text(e.sha256.substr(0, 32) + L"…", Rect(colX[3], ty, colX[4] - colX[3], 16.f), mXs(),
                          th.subtle);
                cy += 22.f;
            }
            if (t.evidence.size() > shown) {
                u.p->text(L"… " + std::to_wstring(t.evidence.size() - shown) + tr(L" more", L" weitere"),
                          Rect(cx, cy + 4.f, innerW, 16.f), fXs(), th.subtle);
                cy += 22.f;
            }
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }
    return col.used();
}

float pageTrace(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    Col col(u, x, y, w, 16.f);   // space-y-4
    col.endBlock(sectionHeading(a, x, col.startBlock(), w, L"Trace"));
    col.endBlock(traceForm(a, x, col.startBlock(), w));
    if (!a.traceHasResult) return col.used();

    col.endBlock(traceStats(a, x, col.startBlock(), w));
    float rb = traceRiskBanner(a, x, col.startBlock(), w);
    col.endBlock(rb);
    col.endBlock(traceControls(a, x, col.startBlock(), w));

    switch (a.traceTab) {
    case 0: {
        // grid gap-4 lg:grid-cols-[1fr_380px] mit h-[72vh]
        float cy = col.startBlock();
        float gh = (std::max)(360.f, u.viewport.h * 0.72f);
        float gap = 16.f;
        bool wide = w >= 1024.f;
        float sideW = wide ? 380.f : w;
        float graphW = wide ? w - sideW - gap : w;
        traceGraphCanvas(a, x, cy, graphW, gh);
        if (wide) {
            traceSidePanel(a, x + graphW + gap, cy, sideW, gh);
            col.endBlock(gh);
        } else {
            traceSidePanel(a, x, cy + gh + gap, sideW, gh);
            col.endBlock(gh * 2 + gap);
        }
        break;
    }
    case 1: col.endBlock(traceTimeline(a, x, col.startBlock(), w)); break;
    case 2: col.endBlock(tracePatterns(a, x, col.startBlock(), w)); break;
    case 3: col.endBlock(traceRiskPanel(a, x, col.startBlock(), w)); break;
    default: col.endBlock(traceForensics(a, x, col.startBlock(), w)); break;
    }
    return col.used();
}

// ---------------------------------------------------------------------------
// Verbindung suchen
// ---------------------------------------------------------------------------
float pagePath(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    const ChainMeta& chain = chainAt(a.pathChain);
    Col col(u, x, y, w, 16.f);

    {
        float cy = col.startBlock();
        float y0 = cy;
        cy += sectionHeading(a, x, cy, w, tr(L"Find a connection", L"Verbindung suchen"));
        std::wstring lead = tr(
            L"Looks for money paths between two addresses. The search runs from both ends at once: forward "
            L"from the starting point along the payments and backward from the destination. Where the two "
            L"sides meet, a connection has been found.",
            L"Sucht Geldwege zwischen zwei Adressen. Die Suche läuft gleichzeitig von beiden Seiten: "
            L"vorwärts vom Startpunkt entlang der Zahlungen und rückwärts vom Ziel. Treffen sich beide "
            L"Seiten, ist eine Verbindung gefunden.");
        float lh = textH(u, lead, fSm(), w);
        u.p->text(lead, Rect(x, cy, w, lh), fSm(), th.muted, Align::Left, true);
        cy += lh;
        col.endBlock(cy - y0);
    }

    // --- Formular ----------------------------------------------------------
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        int cols = w >= 1024.f ? 6 : (w >= 768.f ? 3 : 1);
        float gap = 12.f;
        float unit = (innerW - gap * (cols - 1)) / cols;
        auto span = [&](int n) { return unit * n + gap * (n - 1); };

        float fx = cx;
        fieldLabel(u, fx, cy, tr(L"From (address)", L"Von (Adresse)"));
        inputBox(u, L"pa-from", Rect(fx, cy + LABEL_H, span(cols >= 6 ? 2 : cols), INPUT_H), a.pathFrom,
                 L"bc1…", true);
        if (cols >= 6) fx += span(2) + gap;
        else cy += LABEL_H + INPUT_H + gap;
        fieldLabel(u, fx, cy, tr(L"To (address)", L"Nach (Adresse)"));
        inputBox(u, L"pa-to", Rect(fx, cy + LABEL_H, span(cols >= 6 ? 2 : cols), INPUT_H), a.pathTo, L"bc1…",
                 true);
        if (cols >= 6) fx += span(2) + gap;
        else cy += LABEL_H + INPUT_H + gap;

        std::vector<std::wstring> chainNames;
        for (const ChainMeta& m : CHAINS) chainNames.push_back(m.name);
        fieldLabel(u, fx, cy, tr(L"Chain", L"Chain"));
        selectBox(u, L"pa-chain", Rect(fx, cy + LABEL_H, cols >= 6 ? unit : innerW, INPUT_H), chainNames,
                  a.pathChain);
        if (cols >= 6) fx += unit + gap;
        else cy += LABEL_H + INPUT_H + gap;
        fieldLabel(u, fx, cy, tr(L"Max. depth", L"Max. Tiefe"));
        inputBox(u, L"pa-depth", Rect(fx, cy + LABEL_H, cols >= 6 ? unit : innerW, INPUT_H), a.pathDepth,
                 L"");
        cy += LABEL_H + INPUT_H + gap;

        Row row(u, cx, cy, innerW, 12.f, 8.f, BTN_H);
        std::wstring go = a.pathRunning ? tr(L"Searching…", L"Suche…")
                                        : tr(L"Search for a connection", L"Verbindung suchen");
        if (btn(u, L"pa-run", row.place(btnW(u, go), BTN_H), go, Btn::Primary,
                a.pathRunning || a.pathFrom.empty() || a.pathTo.empty()))
            liveStartPath(a);
        std::wstring hint = tr(L"Both directions are searched at the same time.",
                               L"Es wird gleichzeitig von beiden Seiten gesucht.");
        u.p->text(hint, row.place(textW(u, hint, fXs()), 20.f), fXs(), th.subtle);
        cy += row.height();

        if (!a.pathError.empty()) {
            cy += 8.f;
            float eh = textH(u, a.pathError, fSm(), innerW);
            u.p->text(a.pathError, Rect(cx, cy, innerW, eh), fSm(), th.tw(Tw::Yellow400), Align::Left, true);
            cy += eh;
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    if (!a.pathHasResult || a.pathResults.empty()) return col.used();

    // --- Ergebnis ----------------------------------------------------------
    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        Row row(u, cx, cy, innerW, 24.f, 8.f, 24.f);
        std::vector<Span> s1 = {Span(std::to_wstring(a.pathResults.size()), fSm(Wt::Bold), th.foreground),
                                Span(a.pathResults.size() == 1
                                         ? tr(L" connection found", L" Verbindung gefunden")
                                         : tr(L" connections found", L" Verbindungen gefunden"),
                                     fSm(), th.foreground)};
        Rect p1 = row.place(spansWidth(u, s1), 20.f);
        drawSpansLine(u, p1.x, p1.y, s1);
        size_t shortest = a.pathResults.front().hops.size() / 2;
        std::wstring st = tr(L"shortest path: ", L"kürzester Weg: ") + std::to_wstring(shortest) +
                          tr(L" hops", L" Hops");
        u.p->text(st, row.place(textW(u, st, fSm()), 20.f), fSm(), th.muted);
        std::wstring api = std::to_wstring(a.pathCalls) + tr(L" API calls · ", L" API-Aufrufe · ") +
                           fmtNumber(a.pathSeconds, 1) + L" s";
        u.p->text(api, row.place(textW(u, api, fSm()), 20.f), fSm(), th.muted);
        cy += row.height() + 12.f;

        for (size_t p = 0; p < a.pathResults.size(); p++) {
            const PathResult& res = a.pathResults[p];
            hline(u, cx, cy, innerW, th.border);
            cy += 10.f;
            std::wstring head = tr(L"Path ", L"Weg ") + std::to_wstring(p + 1) + L" · " +
                                std::to_wstring(res.hops.size() / 2) + tr(L" hops", L" Hops");
            if (res.value > 0)
                head += L" · " + tr(L"smallest step ", L"kleinster Schritt ") +
                        fmtAmount(res.value, chain.decimals, chain.symbol, 6);
            u.p->text(head, Rect(cx, cy, innerW, 20.f), fSm(Wt::Semibold), th.foreground);
            cy += 22.f;

            Row hr(u, cx, cy, innerW, 8.f, 8.f, 24.f);
            for (size_t i = 0; i < res.hops.size(); i++) {
                const PathHop& h = res.hops[i];
                std::wstring lab = (h.isTx ? L"tx " : L"") + shortHash(h.id, 6);
                Font f = mXs();
                Rect r = hr.place(badgeW(u, lab, f, 8.f), 22.f);
                Color bg = h.isTx ? th.panel.op(0.6f).over(th.background) : th.background;
                Color bd = h.isTx ? th.muted : th.border;
                u.p->roundRect(r, R_SM, &bg, &bd, 1.f, h.isTx ? Dash::Dashed : Dash::Solid);
                u.p->text(lab, Rect(r.x, r.y + 3.f, r.w, 16.f), f, th.foreground, Align::Center);
                tooltip(u, r, h.id);
                if (u.mouseIn(r)) {
                    u.cursorHand = true;
                    if (u.in.pressed) {
                        a.route.chain = a.pathChain;
                        a.go(h.isTx ? Page::Tx : Page::Address, h.id);
                    }
                }
                if (i + 1 < res.hops.size()) {
                    Rect ar = hr.place(12.f, 22.f);
                    u.p->text(L"→", Rect(ar.x, ar.y + 2.f, 12.f, 18.f), fSm(), th.subtle);
                }
            }
            cy += hr.height() + 8.f;
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }
    return col.used();
}

// ---------------------------------------------------------------------------
// Massenpruefung
// ---------------------------------------------------------------------------
float pageScreen(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    Col col(u, x, y, w, 16.f);

    {
        float cy = col.startBlock();
        float y0 = cy;
        cy += sectionHeading(a, x, cy, w, tr(L"Bulk check", L"Massenprüfung")) + 4.f;
        std::wstring lead = tr(
            L"Check many addresses at once against every connected source: the OFAC sanctions list, "
            L"Ransomwhere, GraphSense TagPacks, WalletExplorer, CryptoScamDB, Chainabuse, Bitcoin Who's Who "
            L"and your own labels. Paste addresses or upload a file – the results can be exported as CSV.",
            L"Viele Adressen auf einmal gegen alle angebundenen Quellen prüfen: OFAC-Sanktionsliste, "
            L"Ransomwhere, GraphSense-TagPacks, WalletExplorer, CryptoScamDB, Chainabuse, Bitcoin Who's Who "
            L"und die eigenen Labels. Adressen einfügen oder eine Datei hochladen – die Ergebnisse lassen "
            L"sich als CSV ausgeben.");
        float lw = (std::min)(768.f, w);   // max-w-3xl
        float lh = textH(u, lead, fSm(), lw);
        u.p->text(lead, Rect(x, cy, lw, lh), fSm(), th.muted, Align::Left, true);
        cy += lh;
        col.endBlock(cy - y0);
    }

    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        fieldLabel(u, cx, cy, tr(L"Addresses (one per line, max. 200)", L"Adressen (eine pro Zeile, max. 200)"));
        cy += LABEL_H;
        textArea(u, L"sc-input", Rect(cx, cy, innerW, 130.f), a.screenInput,
                 L"bc1…\n1A1z…\n3FZb…", true);
        cy += 130.f + 12.f;

        Row row(u, cx, cy, innerW, 12.f, 8.f, BTN_H);
        std::vector<std::wstring> chainNames;
        for (const ChainMeta& m : CHAINS) chainNames.push_back(m.name);
        float selW = 0;
        for (auto& s : chainNames) selW = (std::max)(selW, textW(u, s, fSm()) + 44.f);
        selectBox(u, L"sc-chain", row.place(selW, INPUT_H), chainNames, a.screenChain);
        std::wstring go = a.screenRunning
                              ? std::to_wstring(a.screenDone) + L"/" + std::to_wstring(a.screenTotal)
                              : tr(L"Check", L"Prüfen");
        if (btn(u, L"sc-run", row.place(btnW(u, go), BTN_H), go, Btn::Primary, a.screenRunning))
            liveRunScreening(a);
        std::wstring up = tr(L"Load a file", L"Datei laden");
        if (btn(u, L"sc-upload", row.place(btnW(u, up), BTN_H), up, Btn::Secondary)) importAddressList(a);
        std::wstring csv = tr(L"Export CSV", L"CSV ausgeben");
        if (btn(u, L"sc-csv", row.placeRight(btnW(u, csv), BTN_H), csv, Btn::Secondary))
            exportScreenCsv(a);
        cy += row.height();
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }

    if (!a.screenHasResult) return col.used();

    {
        CardCtx c = cardBegin(u, x, col.startBlock(), w);
        float cx = c.x + CARD_PAD, cy = c.inner, innerW = w - 2 * CARD_PAD;
        const wchar_t* heads[4][2] = {{L"Address", L"Adresse"},
                                      {L"Result", L"Ergebnis"},
                                      {L"Labels", L"Labels"},
                                      {L"Sources", L"Quellen"}};
        float fr[4] = {0.34f, 0.14f, 0.28f, 0.24f};
        float colX[5];
        colX[0] = cx;
        for (int i = 0; i < 4; i++) colX[i + 1] = colX[i] + innerW * fr[i];
        for (int i = 0; i < 4; i++) {
            std::wstring s = tr(heads[i][0], heads[i][1]);
            std::wstring upS;
            for (wchar_t ch : s) upS += (wchar_t)towupper(ch);
            u.p->text(upS, Rect(colX[i], cy, colX[i + 1] - colX[i] - 8.f, 16.f), fXs(), th.subtle);
        }
        cy += 22.f;
        for (const ScreenResultRow& r : a.screenResults) {
            hline(u, cx, cy, innerW, th.border);
            float ty = cy + 7.f;
            Rect ar(colX[0], ty, colX[1] - colX[0] - 8.f, 20.f);
            Color ac = u.mouseIn(ar) ? th.brand : th.foreground;
            if (u.mouseIn(ar)) {
                u.cursorHand = true;
                if (u.in.pressed) a.go(Page::Address, r.address);
            }
            u.p->text(shortHash(r.address, 12), ar, mXs(), ac);

            Color bg = r.risk == L"high"     ? th.tw(Tw::Red600)
                       : r.risk == L"medium" ? th.tw(Tw::Orange500)
                       : r.risk == L"low"    ? th.tw(Tw::Blue500)
                                             : th.tw(Tw::Gray600);
            Color fg = r.risk == L"medium" ? Color::hex(0x000000) : Color::hex(0xffffff);
            Font bf = fXs();
            badge(u, Rect(colX[1], ty, badgeW(u, r.verdict, bf), 20.f), r.verdict, bg, fg, bf);

            u.p->text(truncate(u, r.labels, fSm(), colX[3] - colX[2] - 8.f),
                      Rect(colX[2], ty, colX[3] - colX[2] - 8.f, 20.f), fSm(), th.foreground);
            u.p->text(truncate(u, r.sources, fXs(), colX[4] - colX[3]),
                      Rect(colX[3], ty + 2.f, colX[4] - colX[3], 16.f), fXs(), th.subtle);
            cy += 34.f;
        }
        col.endBlock(cardEnd(u, c, cy - c.inner));
    }
    return col.used();
}
