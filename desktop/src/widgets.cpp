// ---------------------------------------------------------------------------
// widgets.cpp - Bausteine, die auf mehreren Seiten vorkommen.
//
// Vorbilder: src/components/ProviderStatusList.tsx, SearchBox.tsx,
// LabelBadges.tsx, LoginRequired.tsx, ActivityHeatmap.tsx, TraceGraph.tsx.
// ---------------------------------------------------------------------------
#include "app.h"
#include <cmath>

// ---------------------------------------------------------------------------
// Ueberschrift einer Seite: `h1 text-lg font-semibold`
// ---------------------------------------------------------------------------
float sectionHeading(App& a, float x, float y, float w, const std::wstring& title) {
    a.ui.p->text(title, Rect(x, y, w, 28.f), fLg(Wt::Semibold), a.ui.th.foreground);
    return 28.f;
}

// ---------------------------------------------------------------------------
// Label-Farben (LabelBadges.tsx)
// ---------------------------------------------------------------------------
Color categoryColor(const Theme& th, const std::wstring& cat, Color* fgOut) {
    Color white = Color::hex(0xffffff);
    Color black = Color::hex(0x000000);
    if (fgOut) *fgOut = white;
    if (cat == L"sanctioned") return th.tw(Tw::Red600);
    if (cat == L"ransomware") return th.tw(Tw::Red700);
    if (cat == L"scam") return th.tw(Tw::Red500).op(0.8f).over(th.panel);
    if (cat == L"darknet") return th.tw(Tw::Purple600).op(0.8f).over(th.panel);
    if (cat == L"mixer") { if (fgOut) *fgOut = black; return th.tw(Tw::Orange500).op(0.8f).over(th.panel); }
    if (cat == L"gambling") return th.tw(Tw::Pink600).op(0.7f).over(th.panel);
    if (cat == L"exchange") return th.tw(Tw::Blue500).op(0.8f).over(th.panel);
    if (cat == L"mining") return th.tw(Tw::Green600).op(0.7f).over(th.panel);
    if (cat == L"service") return th.tw(Tw::Indigo500).op(0.8f).over(th.panel);
    if (cat == L"swap") return th.tw(Tw::Teal600).op(0.8f).over(th.panel);
    if (cat == L"bridge") return th.tw(Tw::Cyan700).op(0.8f).over(th.panel);
    if (cat == L"wallet") return th.tw(Tw::Gray600);
    if (cat == L"custom") return th.tw(Tw::Emerald600);
    if (fgOut) *fgOut = th.fg2;
    return th.tw(Tw::Gray700);
}

float labelBadges(App& a, float x, float y, float w, const std::vector<LabelRow>& labels, bool compact) {
    Ui& u = a.ui;
    if (labels.empty()) {
        if (compact) return 0.f;
        u.p->text(tr(L"no labels known", L"keine Labels bekannt"), Rect(x, y, w, 16.f), fXs(), u.th.subtle);
        return 16.f;
    }
    Row row(u, x, y, w, 4.f, 4.f, 20.f);
    for (const LabelRow& l : labels) {
        Color fg;
        Color bg = categoryColor(u.th, l.category, &fg);
        std::wstring text = (l.own ? std::wstring(L"✎ ") : std::wstring()) + l.label;
        if (!compact) text += L" · " + l.source;
        Font f = fXs();
        Rect r = row.place(badgeW(u, text, f), 20.f);
        badge(u, r, text, bg, fg, f);
        if (l.own) {
            Color ring = u.th.tw(Tw::Green300);
            u.p->ring(r, R_SM, ring, 1.f, 0.f);
        }
        std::wstring tip = l.source + (l.details.empty() ? L"" : L": " + l.details);
        tooltip(u, r, tip);
    }
    return row.height();
}

// ---------------------------------------------------------------------------
// Kennzahlkarte (Stat auf der Adressseite)
// ---------------------------------------------------------------------------
float statCard(App& a, float x, float y, float w, const std::wstring& label,
               const std::wstring& value, const std::wstring& sub) {
    Ui& u = a.ui;
    CardCtx c = cardBegin(u, x, y, w);
    float cy = c.inner;
    fieldLabel(u, c.x + c.pad, cy, label);
    cy += LABEL_H;
    u.p->text(value, Rect(c.x + c.pad, cy, w - 2 * c.pad, 28.f), fLg(Wt::Semibold), u.th.foreground);
    cy += 28.f;
    if (!sub.empty()) {
        u.p->text(sub, Rect(c.x + c.pad, cy, w - 2 * c.pad, 16.f), fXs(), u.th.subtle);
        cy += 16.f;
    }
    return cardEnd(u, c, cy - c.inner);
}

// ---------------------------------------------------------------------------
// SearchBox
// ---------------------------------------------------------------------------
float searchBox(App& a, float x, float y, float w, bool large) {
    Ui& u = a.ui;
    float h = large ? INPUT_LG_H : INPUT_H;

    std::vector<std::wstring> chainOpts;
    chainOpts.push_back(tr(L"auto-detect", L"automatisch"));
    for (const ChainMeta& c : CHAINS) chainOpts.push_back(c.symbol);

    Font selF = large ? fBase() : fSm();
    float selW = 0;
    for (const std::wstring& o : chainOpts) selW = (std::max)(selW, textW(u, o, selF) + 46.f);

    std::wstring submit = tr(L"Search", L"Suchen");
    float bw = btnW(u, submit);
    float gap = 8.f;
    float inputW = w - selW - bw - 2 * gap;

    selectBox(u, L"search-chain", Rect(x, y, selW, h), chainOpts, a.searchChain,
              large ? 16.f : 14.f);
    inputBox(u, L"search-q", Rect(x + selW + gap, y, inputW, h), a.searchQuery,
             tr(L"Address or transaction ID", L"Adresse oder Transaktions-ID"), true, large ? 16.f : 14.f);
    bool go = btn(u, L"search-go", Rect(x + selW + gap + inputW + gap, y, bw, h), submit, Btn::Primary);
    if (go || (u.focusId == L"search-q" && u.keyDown(VK_RETURN))) {
        std::wstring v = a.searchQuery;
        while (!v.empty() && v.front() == L' ') v.erase(v.begin());
        while (!v.empty() && v.back() == L' ') v.pop_back();
        int target = a.searchChain > 0 ? a.searchChain - 1 : guessChain(v);
        if (v.empty() || target < 0) {
            a.searchError = tr(L"Format not recognised. Please pick the chain manually.",
                               L"Format nicht erkannt. Bitte die Chain manuell wählen.");
        } else {
            int kind = classifyInput(v, target);
            if (kind == 1) {
                a.searchError.clear();
                a.route.chain = target;
                a.go(Page::Address, v);
            } else if (kind == 2) {
                a.searchError.clear();
                a.route.chain = target;
                a.go(Page::Tx, v);
            } else {
                a.searchError = g_locale == Loc::De
                                    ? L"„" + v + L"“ passt nicht zum Format einer " +
                                          chainAt(target).name + L"-Adresse oder -Transaktion."
                                    : L"\u201c" + v + L"\u201d does not match the format of a " +
                                          chainAt(target).name + L" address or transaction.";
            }
        }
    }
    float used = h;
    if (!a.searchError.empty()) {
        u.p->text(a.searchError, Rect(x, y + h + 8.f, w, 20.f), fSm(), u.th.tw(Tw::Red400));
        used += 28.f;
    }
    return used;
}

// ---------------------------------------------------------------------------
// ProviderStatusList
// ---------------------------------------------------------------------------
float providerStatusList(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    CardCtx c = cardBegin(u, x, y, w);
    float innerW = w - 2 * c.pad;
    float cx = c.x + c.pad;
    float cy = c.inner;

    // Kopfzeile: mb-3 flex flex-wrap items-center gap-3
    {
        Row row(u, cx, cy, innerW, 12.f, 8.f, 32.f);
        std::wstring title = tr(L"Data sources", L"Datenquellen");
        Rect tr1 = row.place(textW(u, title, fBase(Wt::Semibold)), 24.f);
        u.p->text(title, tr1, fBase(Wt::Semibold), th.foreground);

        std::vector<std::wstring> names;
        for (const ChainMeta& m : CHAINS) names.push_back(m.name);
        float selW = 0;
        for (auto& n : names) selW = (std::max)(selW, textW(u, n, fSm()) + 44.f);
        if (selectBox(u, L"prov-chain", row.place(selW, INPUT_SM_H), names, a.providerChain))
            a.dirty = true;

        std::wstring bl = a.pinging ? tr(L"Checking…", L"Prüfe…")
                                    : tr(L"Check reachability", L"Erreichbarkeit prüfen");
        if (btn(u, L"prov-ping", row.place(btnW(u, bl), BTN_H), bl, Btn::Secondary, a.pinging))
            livePingProviders(a);

        cy += row.height() + 12.f;   // mb-3
    }

    // Tabelle: text-sm, Kopf text-xs uppercase text-subtle
    const float frac[6] = {0.235f, 0.115f, 0.075f, 0.135f, 0.235f, 0.205f};
    float colX[7];
    colX[0] = cx;
    for (int i = 0; i < 6; i++) colX[i + 1] = colX[i] + innerW * frac[i];

    {
        const wchar_t* heads[6][2] = {
            {L"Source", L"Quelle"}, {L"Type", L"Typ"}, {L"Chains", L"Chains"},
            {L"Key", L"Key"}, {L"Limit", L"Limit"}, {L"Status", L"Status"},
        };
        Font hf = fXs();
        hf.tracking = false;
        for (int i = 0; i < 6; i++) {
            std::wstring s = tr(heads[i][0], heads[i][1]);
            std::wstring up;
            for (wchar_t ch : s) up += (wchar_t)towupper(ch);
            u.p->text(up, Rect(colX[i], cy + 4.f, colX[i + 1] - colX[i] - 8.f, 16.f), hf, th.subtle);
        }
        cy += 24.f;
    }

    for (const ProviderRow& p : a.providers) {
        float rowY = cy;
        hline(u, cx, rowY, innerW, th.border);
        float op = p.active ? 1.f : 0.5f;
        float ty = rowY + 6.f;

        // Quelle (Link)
        Rect nameR(colX[0], ty, colX[1] - colX[0] - 8.f, 20.f);
        Color nameC = th.foreground.op(op);
        bool over = u.mouseIn(nameR) && !p.url.empty();
        if (over) nameC = th.brand;
        u.p->text(truncate(u, p.name, fSm(), nameR.w), nameR, fSm(), nameC);
        if (over) {
            u.cursorHand = true;
            if (u.in.pressed) openUrl(p.url);
        }

        u.p->text(p.dataKind ? tr(L"Blockchain", L"Blockchain") : tr(L"Labels/risk", L"Labels/Risiko"),
                  Rect(colX[1], ty, colX[2] - colX[1] - 8.f, 20.f), fSm(), th.muted.op(op));

        std::wstring chains = p.chains ? std::to_wstring(p.chains) : tr(L"all", L"alle");
        u.p->text(chains, Rect(colX[2], ty + 2.f, colX[3] - colX[2] - 8.f, 16.f), fXs(), th.subtle.op(op));

        std::wstring keyText;
        bool hasKey = a.keys.has(p.id);
        if (p.key == L"unconfigured") keyText = tr(L"not configured", L"nicht konfiguriert");
        else if (p.key == L"none") keyText = tr(L"not needed", L"nicht nötig");
        else if (hasKey) keyText = tr(L"✓ set", L"✓ gesetzt");
        else if (p.key == L"missing") keyText = tr(L"key required", L"Key nötig");
        else keyText = tr(L"optional", L"optional");
        u.p->text(keyText, Rect(colX[3], ty, colX[4] - colX[3] - 8.f, 20.f), fSm(), th.muted.op(op));

        u.p->text(truncate(u, p.rateLimit, fXs(), colX[5] - colX[4] - 8.f),
                  Rect(colX[4], ty + 2.f, colX[5] - colX[4] - 8.f, 16.f), fXs(), th.subtle.op(op));

        Rect statusR(colX[5], ty, colX[6] - colX[5], 20.f);
        bool needsKey = !p.ok && (p.pingError == L"Key fehlt" ||
                                  p.pingError == L"Keine Instanz für diese Chain");
        if (p.ms < 0 || needsKey) {
            std::wstring st = needsKey ? (p.pingError == L"Key fehlt"
                                              ? tr(L"key required", L"Key nötig")
                                              : tr(L"no instance", L"keine Instanz"))
                                       : (p.active ? tr(L"active", L"aktiv") : tr(L"inactive", L"inaktiv"));
            u.p->text(st, statusR, fSm(), th.subtle.op(op));
        } else if (p.ok) {
            u.p->text(L"OK (" + std::to_wstring(p.ms) + L" ms)", statusR, fSm(), th.tw(Tw::Green400));
        } else {
            u.p->text(tr(L"Error", L"Fehler"), statusR, fSm(), th.tw(Tw::Red400));
            tooltip(u, statusR, p.pingError);
        }
        cy += 32.f;
    }

    return cardEnd(u, c, cy - c.inner);
}

// ---------------------------------------------------------------------------
// ActivityHeatmap
// ---------------------------------------------------------------------------
float activityHeatmap(App& a, float x, float y, float w, const std::vector<long long>& times) {
    Ui& u = a.ui;
    const wchar_t* daysEn[7] = {L"Sun", L"Mon", L"Tue", L"Wed", L"Thu", L"Fri", L"Sat"};
    const wchar_t* daysDe[7] = {L"So", L"Mo", L"Di", L"Mi", L"Do", L"Fr", L"Sa"};

    if (times.empty()) {
        u.p->text(tr(L"No timestamps available for a pattern analysis.",
                     L"Keine Zeitstempel für eine Musteranalyse vorhanden."),
                  Rect(x, y, w, 20.f), fSm(), u.th.subtle);
        return 20.f;
    }

    // Wochentag und Stunde in UTC, wie in der Web-Fassung
    int matrix[7][24] = {{0}};
    int total = 0, maxV = 1;
    long long first = 0, last = 0;
    for (long long t : times) {
        if (!t) continue;
        long long days = t / 86400;
        int dow = (int)((days + 4) % 7);   // 1970-01-01 war ein Donnerstag
        int hour = (int)((t % 86400) / 3600);
        if (dow < 0) dow += 7;
        matrix[dow][hour]++;
        total++;
        if (matrix[dow][hour] > maxV) maxV = matrix[dow][hour];
        if (!first || t < first) first = t;
        if (t > last) last = t;
    }
    if (!total) {
        u.p->text(tr(L"No timestamps available for a pattern analysis.",
                     L"Keine Zeitstempel für eine Musteranalyse vorhanden."),
                  Rect(x, y, w, 20.f), fSm(), u.th.subtle);
        return 20.f;
    }

    float cell = 14.f, spacing = 2.f;
    float labelW = 24.f;
    float cy = y;

    for (int h = 0; h < 24; h++) {
        if (h % 3) continue;
        float hx = x + labelW + h * (cell + spacing);
        u.p->text(std::to_wstring(h), Rect(hx, cy, cell, 12.f), fPx(8.f), u.th.subtle, Align::Center);
    }
    cy += 14.f;

    for (int d = 0; d < 7; d++) {
        u.p->text(g_locale == Loc::De ? daysDe[d] : daysEn[d], Rect(x, cy + 2.f, labelW - 4.f, 14.f),
                  fPx(9.f), u.th.subtle);
        for (int h = 0; h < 24; h++) {
            float hx = x + labelW + h * (cell + spacing);
            Rect r(hx, cy, cell, cell);
            int v = matrix[d][h];
            Color col = v == 0 ? u.th.border
                               : Color::hex(0xf7931a, 0.15f + 0.85f * ((float)v / (float)maxV))
                                     .over(u.th.panel);
            u.p->roundRect(r, 2.f, &col, nullptr);
            wchar_t buf[96];
            swprintf(buf, 96, L"%s %02d:00 UTC – %d", g_locale == Loc::De ? daysDe[d] : daysEn[d], h, v);
            tooltip(u, r, buf);
        }
        cy += cell + spacing;
    }

    cy += 8.f;
    std::wstring line1 = fmtNumber(total) + tr(L" transactions with a timestamp · hours in UTC",
                                               L" Transaktionen mit Zeitstempel · Stunden in UTC");
    if (first) line1 += L" · " + fmtDate(first) + tr(L" to ", L" bis ") + fmtDate(last);
    float lh = textH(u, line1, fXs(), w);
    u.p->text(line1, Rect(x, cy, w, lh), fXs(), u.th.muted, Align::Left, true);
    cy += lh;

    // Ruhigste Sechs-Stunden-Phase -> grobe Schätzung der Zeitzone
    int hourly[24] = {0};
    for (int d = 0; d < 7; d++)
        for (int h = 0; h < 24; h++) hourly[h] += matrix[d][h];
    int bestStart = 0, bestSum = 1 << 30;
    for (int s0 = 0; s0 < 24; s0++) {
        int sum = 0;
        for (int k = 0; k < 6; k++) sum += hourly[(s0 + k) % 24];
        if (sum < bestSum) {
            bestSum = sum;
            bestStart = s0;
        }
    }
    // Nachtruhe liegt üblicherweise zwischen 1 und 7 Uhr Ortszeit
    int offset = ((1 - bestStart) % 24 + 36) % 24;
    if (offset > 12) offset -= 24;
    std::wstring off = (offset >= 0 ? L"+" : L"") + std::to_wstring(offset);
    std::wstring guess = tr(L"Estimated time zone: UTC", L"Geschätzte Zeitzone: UTC") + off +
                         tr(L" – derived from the quietest six-hour stretch",
                            L" – abgeleitet aus der ruhigsten Sechs-Stunden-Phase");
    float gh = textH(u, guess, fXs(), w);
    u.p->text(guess, Rect(x, cy, w, gh), fXs(), u.th.brand, Align::Left, true);
    cy += gh;
    return cy - y;
}

// ---------------------------------------------------------------------------
// Graph (TraceGraph.tsx)
// ---------------------------------------------------------------------------
static Color riskBorderColor(const Theme& th, const std::wstring& risk, float* width, Dash* dash) {
    if (risk == L"high")   { *width = 4.f; *dash = Dash::Double; return th.tw(Tw::Red400); }
    if (risk == L"medium") { *width = 3.f; *dash = Dash::Dashed; return th.tw(Tw::Yellow300); }
    if (risk == L"low")    { *width = 2.f; *dash = Dash::Dotted; return th.tw(Tw::Blue300); }
    *width = 2.f;
    *dash = Dash::Solid;
    return th.muted;
}

static const wchar_t* riskGlyph(const std::wstring& r) {
    if (r == L"high") return L"▲";
    if (r == L"medium") return L"◆";
    if (r == L"low") return L"◇";
    return L"○";
}

static Color clusterColor(const Theme& th, int id) {
    static const unsigned COLORS[10] = {0xf97316, 0x22d3ee, 0xa3e635, 0xe879f9, 0xfacc15,
                                        0x60a5fa, 0xfb7185, 0x34d399, 0xc084fc, 0xfbbf24};
    if (id <= 0) return th.muted;
    return Color::hex(COLORS[(id - 1) % 10]);
}

static Color riskInflowColor(const Theme& th, double ratio) {
    if (ratio > 0.66) return th.tw(Tw::Red500);
    if (ratio > 0.33) return th.tw(Tw::Orange500);
    return th.tw(Tw::Amber400);
}

static Color taintColor(const Theme& th, double ratio) {
    if (ratio > 0.5) return th.tw(Tw::Red600);
    if (ratio > 0.15) return th.tw(Tw::Orange600);
    return th.tw(Tw::Amber600);
}

float traceGraphCanvas(App& a, float x, float y, float w, float h) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    const ChainMeta& chain = chainAt(a.traceChain);

    Rect canvas(x, y, w, h);
    Color bg = th.background;
    Color bd = th.border;
    u.p->roundRect(canvas, R_LG, &bg, &bd, 1.f);

    // Beim ersten Zeichnen den ganzen Graphen einpassen (React Flow: fitView)
    if (!a.graphFitted && !a.trace.nodes.empty() && w > 50.f && h > 50.f) {
        float minX = 1e9f, minY = 1e9f, maxX = -1e9f, maxY = -1e9f;
        for (const GNode& n : a.trace.nodes) {
            minX = (std::min)(minX, n.x);
            minY = (std::min)(minY, n.y);
            maxX = (std::max)(maxX, n.x + n.w);
            maxY = (std::max)(maxY, n.y + n.h);
        }
        float pad = 24.f;
        float zx = (w - 2 * pad) / (std::max)(1.f, maxX - minX);
        float zy = (h - 2 * pad) / (std::max)(1.f, maxY - minY);
        a.graphZoom = (std::max)(0.3f, (std::min)(1.2f, (std::min)(zx, zy)));
        a.graphPanX = (w - (maxX - minX) * a.graphZoom) * .5f - minX * a.graphZoom;
        a.graphPanY = (h - (maxY - minY) * a.graphZoom) * .5f - minY * a.graphZoom;
        a.graphFitted = true;
    }

    // Ziehen und Zoomen
    bool over = u.mouseIn(canvas);
    if (over) {
        if (u.in.pressed) { a.graphDragging = true; a.dragLastX = u.in.mx; a.dragLastY = u.in.my; }
        if (u.in.wheel != 0.f) {
            float f = u.in.wheel > 0 ? 1.1f : 1.f / 1.1f;
            float nz = (std::max)(0.3f, (std::min)(2.5f, a.graphZoom * f));
            // Auf den Mauszeiger zoomen
            float mx = (u.in.mx - canvas.x - a.graphPanX) / a.graphZoom;
            float my = (u.in.my - canvas.y - a.graphPanY) / a.graphZoom;
            a.graphZoom = nz;
            a.graphPanX = u.in.mx - canvas.x - mx * nz;
            a.graphPanY = u.in.my - canvas.y - my * nz;
            u.in.wheel = 0.f;
        }
    }
    if (a.graphDragging) {
        if (!u.in.down) a.graphDragging = false;
        else {
            a.graphPanX += u.in.mx - a.dragLastX;
            a.graphPanY += u.in.my - a.dragLastY;
            a.dragLastX = u.in.mx;
            a.dragLastY = u.in.my;
        }
    }

    u.p->clipPush(canvas.inset(1.f));
    u.pushHitClip(canvas.inset(1.f));

    // Punktraster wie der React-Flow-Hintergrund
    {
        float step = 20.f * a.graphZoom;
        if (step >= 8.f) {
            Color dot = th.mode == Mode::Dark ? Color::hex(0x243044) : Color::hex(0xd7dde7);
            float ox = fmodf(a.graphPanX, step);
            float oy = fmodf(a.graphPanY, step);
            for (float gx = canvas.x + ox; gx < canvas.r(); gx += step)
                for (float gy = canvas.y + oy; gy < canvas.b(); gy += step)
                    u.p->rect(Rect(gx, gy, 1.f, 1.f), dot);
        }
    }

    auto tx = [&](float vx) { return canvas.x + a.graphPanX + vx * a.graphZoom; };
    auto ty = [&](float vy) { return canvas.y + a.graphPanY + vy * a.graphZoom; };
    float z = a.graphZoom;

    auto nodeById = [&](const std::wstring& id) -> const GNode* {
        for (const GNode& n : a.trace.nodes)
            if (n.id == id) return &n;
        return nullptr;
    };

    // Kanten
    for (const GEdge& e : a.trace.edges) {
        const GNode* s = nodeById(e.from);
        const GNode* t = nodeById(e.to);
        if (!s || !t) continue;
        if (a.optHideChange && e.change) continue;
        if (a.optOnlyRisk && !e.risky) continue;
        float x0 = tx(s->x + s->w), y0 = ty(s->y + s->h * .5f);
        float x1 = tx(t->x), y1 = ty(t->y + t->h * .5f);
        float dx = (std::max)(40.f, (x1 - x0) * .5f);
        Color col = th.muted;
        if (a.optRisk && e.risky) col = th.tw(Tw::Red500);
        else if (e.change) col = th.tw(Tw::Yellow500);
        else if (e.coinbase) col = th.tw(Tw::Green500);
        u.p->bezier(x0, y0, x0 + dx, y0, x1 - dx, y1, x1, y1, col, (std::max)(1.f, 1.5f * z));
        // Pfeilspitze
        float ah = 5.f * z;
        u.p->line(x1 - ah, y1 - ah * .7f, x1, y1, col, (std::max)(1.f, 1.5f * z));
        u.p->line(x1 - ah, y1 + ah * .7f, x1, y1, col, (std::max)(1.f, 1.5f * z));
        // Beschriftung
        if (z > 0.62f) {
            std::wstring lab = fmtAmount((double)e.valueSat, chain.decimals, chain.symbol, 4);
            if (e.change) lab += L" ⟲";
            Font ef = fPx(9.f * z < 7.f ? 7.f : 9.f * z);
            float lw = textW(u, lab, ef);
            float mx = (x0 + x1) * .5f - lw * .5f;
            float my = (y0 + y1) * .5f - 8.f;
            Color lbg = th.background.op(0.85f);
            u.p->roundRect(Rect(mx - 3, my - 1, lw + 6, 14.f), 3.f, &lbg, nullptr);
            u.p->text(lab, Rect(mx, my, lw, 14.f), ef, th.fg2);
        }
    }

    // Knoten
    for (const GNode& n : a.trace.nodes) {
        if (a.optOnlyRisk && !n.isRiskSource && n.riskFromRatio <= 0.001) continue;
        Rect box(tx(n.x), ty(n.y), n.w * z, n.h * z);
        if (box.r() < canvas.x || box.x > canvas.r() || box.b() < canvas.y || box.y > canvas.b()) continue;

        bool dim = !a.traceSelected.empty() && a.traceSelected != n.id;
        float op = dim ? 0.3f : 1.f;
        bool hovered = u.mouseIn(box);
        if (hovered) {
            u.cursorHand = true;
            if (u.in.pressed) a.traceSelected = (a.traceSelected == n.id) ? L"" : n.id;
        }

        float bw2 = 1.f;
        Dash dash = Dash::Solid;
        Color border;
        Color fill;
        if (n.isAddress) {
            border = riskBorderColor(th, n.risk, &bw2, &dash).op(op);
            fill = th.panel.op(op);
            u.p->roundRect(box, R_MD, &fill, &border, bw2 * (std::min)(1.f, z + .3f), dash);
            if (a.optCluster && n.clusterId) {
                Color cc = clusterColor(th, n.clusterId).op(op);
                u.p->rect(Rect(box.x, box.y + 1, 6.f * z, box.h - 2), cc);
            }
        } else {
            fill = th.panel.op(0.8f * op).over(th.background);
            if (n.carriesRisk && a.optRisk) { border = th.tw(Tw::Red400).op(op); bw2 = 3.f; dash = Dash::Dashed; }
            else if (n.coinjoin) { border = th.tw(Tw::Purple300).op(op); bw2 = 2.f; dash = Dash::Dotted; }
            else { border = th.muted.op(op); bw2 = 1.f; dash = Dash::Dashed; }
            u.p->roundRect(box, R_LG, &fill, &border, bw2 * (std::min)(1.f, z + .3f), dash);
        }
        if (n.isStart) u.p->ring(box, R_MD, th.accent.op(op), 2.f, 2.f);
        if (a.traceSelected == n.id) u.p->ring(box, R_MD, th.foreground, 2.f, 2.f);

        if (z < 0.5f) continue;

        float px2 = 8.f * z, py2 = 4.f * z;
        float cy = box.y + py2;
        float innerW = box.w - 2 * px2;
        auto lineF = [&](float px3) { return fPx((std::max)(6.5f, px3 * z)); };

        if (n.isAddress) {
            Font mono = mPx((std::max)(6.5f, 11.f * z));
            std::wstring head = std::wstring(riskGlyph(n.risk)) + L" " + shortHash(n.address, 7);
            u.p->text(head, Rect(box.x + px2, cy, innerW, 16.f * z), mono, th.foreground.op(op));
            if (n.risk != L"none") {
                std::wstring rt = n.risk == L"high" ? tr(L"HIGH", L"HOCH")
                                  : n.risk == L"medium" ? tr(L"MED", L"MITTEL") : tr(L"LOW", L"NIEDRIG");
                Font rf = lineF(9.f);
                float rw = textW(u, rt, rf) + 6.f;
                Color rbg = n.risk == L"high" ? th.tw(Tw::Red600)
                            : n.risk == L"medium" ? th.tw(Tw::Yellow500) : th.tw(Tw::Blue500);
                Color rfg = n.risk == L"medium" ? Color::hex(0x000000) : Color::hex(0xffffff);
                badge(u, Rect(box.r() - px2 - rw, cy, rw, 13.f * z), rt, rbg.op(op), rfg.op(op), rf, 3.f);
            }
            cy += 15.f * z;
            if (n.isStart) {
                u.p->text(tr(L"START", L"START"), Rect(box.x + px2, cy, innerW, 12.f * z), lineF(9.f),
                          th.brand.op(op));
                cy += 11.f * z;
            }
            if (!n.label.empty()) {
                Font lf = lineF(10.f);
                std::wstring txt = (n.labelSource == tr(L"own", L"eigene") ? L"✎ " : L"") + n.label;
                Color lc = n.labelSource == tr(L"own", L"eigene") ? th.tw(Tw::Green200) : th.brand;
                u.p->text(truncate(u, txt, lf, innerW), Rect(box.x + px2, cy, innerW, 13.f * z), lf, lc.op(op));
                cy += 12.f * z;
            }
            if (n.isRiskSource) {
                Font bf = lineF(9.f);
                std::wstring t2 = tr(L"harmful address", L"schädliche Adresse");
                Color c2 = th.tw(Tw::Red700).op(op);
                badge(u, Rect(box.x + px2, cy, innerW, 13.f * z), truncate(u, t2, bf, innerW - 6.f), c2,
                      Color::hex(0xffffff, op), bf, 3.f);
                cy += 14.f * z;
            }
            if (n.deposit) {
                Font bf = lineF(9.f);
                std::wstring t2 = L"⇓ " + tr(L"deposit", L"Einzahlung") +
                                  (n.depositService.empty() ? L"" : L" (" + n.depositService + L")");
                Color c2 = th.tw(Tw::Emerald700).op(op);
                badge(u, Rect(box.x + px2, cy, innerW, 13.f * z), truncate(u, t2, bf, innerW - 6.f), c2,
                      Color::hex(0xffffff, op), bf, 3.f);
                cy += 14.f * z;
            }
            if (!n.swapService.empty()) {
                Font bf = lineF(9.f);
                std::wstring t2 = L"⇄ " + tr(L"bridge", L"Brücke") + L": " + n.swapService;
                Color c2 = th.tw(Tw::Teal700).op(op);
                badge(u, Rect(box.x + px2, cy, innerW, 13.f * z), truncate(u, t2, bf, innerW - 6.f), c2,
                      Color::hex(0xffffff, op), bf, 3.f);
                cy += 14.f * z;
            }
            if (a.optRisk && !n.isRiskSource && n.riskFromRatio > 0.001) {
                Font bf = lineF(9.f);
                std::wstring t2 = L"⚠ " + fmtPercent(n.riskFromRatio, 0) + tr(L" from harm", L" aus Schaden");
                Color c2 = riskInflowColor(th, n.riskFromRatio).op(op);
                badge(u, Rect(box.x + px2, cy, innerW, 13.f * z), truncate(u, t2, bf, innerW - 6.f), c2,
                      Color::hex(0xffffff, op), bf, 3.f);
                cy += 14.f * z;
            }
            Font sf = lineF(9.f);
            std::wstring down = L"↓ " + fmtAmount((double)n.receivedSat, chain.decimals, chain.symbol, 4);
            std::wstring up = L"↑ " + fmtAmount((double)n.sentSat, chain.decimals, chain.symbol, 4);
            u.p->text(down, Rect(box.x + px2, cy, innerW, 12.f * z), sf, th.fg2.op(op));
            u.p->text(up, Rect(box.x + px2, cy, innerW, 12.f * z), sf, th.fg2.op(op), Align::Right);
            cy += 12.f * z;
            if (a.optFiat && a.btcPrice > 0) {
                u.p->text(L"≈ " + fmtFiat((double)n.receivedSat, a.btcPrice, chain.decimals),
                          Rect(box.x + px2, cy, innerW, 12.f * z), sf, th.fg2.op(op));
                cy += 12.f * z;
            }
            if (a.optTaint && n.taintRatio > 0) {
                Color trk = th.tw(Tw::Gray700).op(op);
                u.p->roundRect(Rect(box.x + px2, cy + 2, innerW, 4.f), 2.f, &trk, nullptr);
                Color tc = taintColor(th, n.taintRatio).op(op);
                u.p->roundRect(Rect(box.x + px2, cy + 2, innerW * (float)n.taintRatio, 4.f), 2.f, &tc, nullptr);
                cy += 10.f;
            }
            std::wstring foot = tr(L"depth ", L"Tiefe ") + std::to_wstring(n.depth);
            if (n.clusterId) foot += L" · " + tr(L"cluster ", L"Cluster ") + L"#" + std::to_wstring(n.clusterId);
            if (n.extraLabels > 0) foot += L" · " + std::to_wstring(n.extraLabels) + tr(L" label", L" Label");
            if (n.behaviorCount > 0)
                foot += L" · " + std::to_wstring(n.behaviorCount) + tr(L" patterns", L" Muster");
            if (n.notFollowed) foot += tr(L" · not followed", L" · nicht verfolgt");
            u.p->text(truncate(u, foot, sf, innerW), Rect(box.x + px2, cy, innerW, 12.f * z), sf, th.fg2.op(op));
        } else {
            Font mono = mPx((std::max)(6.5f, 10.f * z));
            Font sf = lineF(9.f);
            u.p->text(L"▭ tx " + shortHash(n.txid, 5), Rect(box.x + px2, cy, innerW, 14.f * z), mono,
                      th.foreground.op(op));
            u.p->text(fmtDateShort(n.blockTime), Rect(box.x + px2, cy + 1, innerW, 12.f * z), sf,
                      th.fg2.op(op), Align::Right);
            cy += 14.f * z;
            wchar_t buf[160];
            swprintf(buf, 160, L"%d in → %d out · %s", n.inputCount, n.outputCount,
                     fmtAmount((double)n.totalOutSat, chain.decimals, chain.symbol, 4).c_str());
            u.p->text(buf, Rect(box.x + px2, cy, innerW, 12.f * z), sf, th.fg2.op(op));
            cy += 12.f * z;
            std::wstring fee = tr(L"fee ", L"Gebühr ") +
                               fmtAmount((double)n.feeSat, chain.decimals, chain.symbol, 6) +
                               (n.blockHeight ? L" · #" + std::to_wstring(n.blockHeight)
                                              : tr(L" · mempool", L" · Mempool"));
            u.p->text(truncate(u, fee, sf, innerW), Rect(box.x + px2, cy, innerW, 12.f * z), sf, th.fg2.op(op));
            cy += 12.f * z;
            if (n.carriesRisk && a.optRisk) {
                u.p->text(tr(L"carries tainted money", L"führt belastetes Geld"),
                          Rect(box.x + px2, cy, innerW, 12.f * z), sf, th.tw(Tw::Red300).op(op));
            } else if (n.coinjoin) {
                u.p->text(L"CoinJoin", Rect(box.x + px2, cy, innerW, 12.f * z), sf, th.tw(Tw::Purple300).op(op));
            }
        }
    }

    u.popHitClip();
    u.p->clipPop();

    // Bedienelemente unten links (wie React Flow)
    {
        float bx = canvas.x + 12.f, by = canvas.b() - 12.f - 4 * 26.f;
        const wchar_t* icons[4] = {L"+", L"−", L"⤢", L"⟳"};
        for (int i = 0; i < 4; i++) {
            Rect r(bx, by + i * 26.f, 26.f, 26.f);
            Color cbg = th.panel, cbd = th.border;
            if (u.mouseIn(r)) { cbg = th.hover.over(th.panel); u.cursorHand = true; }
            u.p->roundRect(r, i == 0 ? 4.f : 0.f, &cbg, &cbd, 1.f);
            u.p->text(icons[i], Rect(r.x, r.y + 4.f, r.w, 18.f), fSm(), th.foreground, Align::Center);
            if (u.mouseIn(r) && u.in.pressed) {
                if (i == 0) a.graphZoom = (std::min)(2.5f, a.graphZoom * 1.2f);
                if (i == 1) a.graphZoom = (std::max)(0.3f, a.graphZoom / 1.2f);
                if (i == 2 || i == 3) a.graphFitted = false;   // erneut einpassen
            }
        }
    }

    // Uebersichtskarte unten rechts
    {
        float mw = 180.f, mh = 110.f;
        Rect mini(canvas.r() - mw - 12.f, canvas.b() - mh - 12.f, mw, mh);
        Color mbg = th.panel.op(0.9f).over(th.background);
        u.p->roundRect(mini, 4.f, &mbg, &bd, 1.f);
        float minX = 1e9f, minY = 1e9f, maxX = -1e9f, maxY = -1e9f;
        for (const GNode& n : a.trace.nodes) {
            minX = (std::min)(minX, n.x); minY = (std::min)(minY, n.y);
            maxX = (std::max)(maxX, n.x + n.w); maxY = (std::max)(maxY, n.y + n.h);
        }
        float sx = (mw - 12.f) / (std::max)(1.f, maxX - minX);
        float sy = (mh - 12.f) / (std::max)(1.f, maxY - minY);
        float s = (std::min)(sx, sy);
        for (const GNode& n : a.trace.nodes) {
            Color c2 = !n.isAddress            ? th.tw(Tw::Slate700)
                       : n.isRiskSource        ? th.tw(Tw::Red600)
                       : (n.riskFromRatio > 0) ? th.tw(Tw::Orange600)
                       : n.risk == L"high"     ? th.tw(Tw::Red500)
                                               : th.accent;
            u.p->rect(Rect(mini.x + 6.f + (n.x - minX) * s, mini.y + 6.f + (n.y - minY) * s,
                           (std::max)(2.f, n.w * s), (std::max)(2.f, n.h * s)),
                      c2);
        }
    }

    return h;
}

// ---------------------------------------------------------------------------
// Verlauf (TraceTimeline.tsx)
// ---------------------------------------------------------------------------
float traceTimeline(App& a, float x, float y, float w) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    const ChainMeta& chain = chainAt(a.traceChain);

    CardCtx c = cardBegin(u, x, y, w);
    float cx = c.x + c.pad, cy = c.inner, innerW = w - 2 * c.pad;

    u.p->text(tr(L"History of the traced money", L"Verlauf des verfolgten Geldes"),
              Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
    cy += 24.f;
    u.p->text(tr(L"Every transaction in the graph in chronological order. The bar shows the amount "
                 L"relative to the largest transaction.",
                 L"Alle Transaktionen des Graphen in zeitlicher Reihenfolge. Der Balken zeigt den Betrag "
                 L"im Verhältnis zur größten Transaktion."),
              Rect(cx, cy, innerW, 40.f), fSm(), th.muted, Align::Left, true);
    cy += textH(u, tr(L"Every transaction in the graph in chronological order. The bar shows the amount "
                      L"relative to the largest transaction.",
                      L"Alle Transaktionen des Graphen in zeitlicher Reihenfolge. Der Balken zeigt den Betrag "
                      L"im Verhältnis zur größten Transaktion."),
                fSm(), innerW) + 12.f;

    double maxVal = 1;
    for (const GNode& n : a.trace.nodes)
        if (!n.isAddress) maxVal = (std::max)(maxVal, n.totalOutSat);

    std::vector<const GNode*> txs;
    for (const GNode& n : a.trace.nodes)
        if (!n.isAddress) txs.push_back(&n);
    for (size_t i = 0; i + 1 < txs.size(); i++)
        for (size_t j = 0; j + 1 < txs.size() - i; j++)
            if (txs[j]->blockTime > txs[j + 1]->blockTime) std::swap(txs[j], txs[j + 1]);

    for (const GNode* n : txs) {
        hline(u, cx, cy, innerW, th.border);
        cy += 8.f;
        float timeW = 150.f, idW = 150.f;
        u.p->text(fmtDate(n->blockTime), Rect(cx, cy, timeW, 20.f), fXs(), th.muted);
        Rect idR(cx + timeW, cy, idW, 20.f);
        Color idc = u.mouseIn(idR) ? th.brand : th.foreground;
        if (u.mouseIn(idR)) u.cursorHand = true;
        u.p->text(L"tx " + shortHash(n->txid, 6), idR, mXs(), idc);

        float barX = cx + timeW + idW + 12.f;
        float barW = innerW - (timeW + idW + 12.f) - 160.f;
        float ratio = (float)(n->totalOutSat / maxVal);
        Color track = th.border;
        u.p->roundRect(Rect(barX, cy + 5.f, barW, 8.f), 4.f, &track, nullptr);
        Color fill = n->carriesRisk ? th.tw(Tw::Red500) : th.accent;
        u.p->roundRect(Rect(barX, cy + 5.f, (std::max)(4.f, barW * ratio), 8.f), 4.f, &fill, nullptr);

        u.p->text(fmtAmount((double)n->totalOutSat, chain.decimals, chain.symbol, 4),
                  Rect(cx, cy, innerW, 20.f), fXs(), th.fg2, Align::Right);
        cy += 24.f;
    }
    return cardEnd(u, c, cy - c.inner);
}
