// ---------------------------------------------------------------------------
// trace_panel.cpp - Seitenpanel des Trace-Graphen.
//
// Vorbild: `<aside className="card h-[72vh] overflow-y-auto text-sm">` in
// src/components/TraceView.tsx mit OverviewPanel, AddressPanel und TxPanel.
// ---------------------------------------------------------------------------
#include "app.h"
#include <ctime>

// gleiche Cluster-Farben wie TraceGraph.tsx
static Color clusterColorLocal(const Theme& th, int id) {
    static const unsigned COLORS[10] = {0xf97316, 0x22d3ee, 0xa3e635, 0xe879f9, 0xfacc15,
                                        0x60a5fa, 0xfb7185, 0x34d399, 0xc084fc, 0xfbbf24};
    if (id <= 0) return th.muted;
    return Color::hex(COLORS[(id - 1) % 10]);
}

float traceSidePanel(App& a, float x, float y, float w, float h) {
    Ui& u = a.ui;
    const Theme& th = u.th;
    const ChainMeta& chain = chainAt(a.traceChain);

    Color fill = th.panel, bd = th.border;
    u.p->roundRect(Rect(x, y, w, h), R_LG, &fill, &bd, 1.f);

    // Eigener Bildlauf innerhalb des Panels
    ScrollState& sc = u.scrolls[L"trace-side"];
    Rect view(x, y, w, h);
    if (u.mouseIn(view) && u.in.wheel != 0.f) {
        sc.y -= u.in.wheel;
        u.in.wheel = 0.f;
    }
    float maxScroll = (std::max)(0.f, sc.contentH - (h - 2 * CARD_PAD));
    sc.y = (std::max)(0.f, (std::min)(maxScroll, sc.y));

    u.p->clipPush(view.inset(1.f));
    u.pushHitClip(view.inset(1.f));

    float cx = x + CARD_PAD;
    float innerW = w - 2 * CARD_PAD;
    float cy = y + CARD_PAD - sc.y;
    float y0 = cy;

    const GNode* sel = nullptr;
    for (const GNode& n : a.trace.nodes)
        if (n.id == a.traceSelected) sel = &n;

    if (!sel) {
        // --- Cluster-Uebersicht --------------------------------------------
        u.p->text(tr(L"Clusters", L"Cluster"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
        cy += 24.f + 16.f;
        if (!a.trace.clusters) {
            u.p->text(tr(L"No clusters detected.", L"Keine Cluster erkannt."), Rect(cx, cy, innerW, 20.f),
                      fSm(), th.subtle);
            cy += 26.f;
        }

        for (int id = 1; id <= a.trace.clusters; id++) {
            std::vector<const GNode*> members;
            double received = 0;
            for (const GNode& n : a.trace.nodes)
                if (n.isAddress && n.clusterId == id) {
                    members.push_back(&n);
                    received += n.receivedSat;
                }
            if (members.empty()) continue;

            float boxTop = cy;
            size_t box = u.p->reserve();
            float iy = boxTop + 8.f;
            float ix = cx + 10.f, iw = innerW - 18.f;

            Row head(u, ix, iy, iw, 8.f, 4.f, 22.f);
            std::wstring title = tr(L"Cluster #", L"Cluster #") + std::to_wstring(id);
            u.p->text(title, head.place(textW(u, title, fSm(Wt::Medium)), 20.f), fSm(Wt::Medium),
                      th.foreground);
            std::wstring coll = tr(L"collapse", L"einklappen");
            Font bf = fXs();
            float bw = textW(u, coll, bf) + 16.f;
            Rect br = head.placeRight(bw, 22.f);
            Color hv = th.hover;
            u.p->roundRect(br, R_MD, u.mouseIn(br) ? &hv : nullptr, &bd, 1.f);
            u.p->text(coll, Rect(br.x, br.y + 3.f, br.w, 16.f), bf, th.foreground, Align::Center);
            if (u.mouseIn(br)) u.cursorHand = true;
            iy += head.height() + 2.f;

            std::wstring stats = std::to_wstring(members.size()) + tr(L" addresses · ", L" Adressen · ") +
                                 fmtAmount((double)received, chain.decimals, chain.symbol, 4) +
                                 tr(L" received", L" empfangen");
            u.p->text(truncate(u, stats, fXs(), iw), Rect(ix, iy, iw, 16.f), fXs(), th.muted);
            iy += 18.f;

            for (const GNode* n : members) {
                Rect ar(ix, iy, iw, 15.f);
                Color ac = u.mouseIn(ar) ? th.brand : th.foreground;
                if (u.mouseIn(ar)) {
                    u.cursorHand = true;
                    if (u.in.pressed) a.go(Page::Address, n->address);
                }
                u.p->text(truncate(u, n->address, mPx(11.f), iw), ar, mPx(11.f), ac);
                iy += 15.f;
            }
            iy += 8.f;

            Color cc = clusterColorLocal(th, id);
            u.p->patchRoundRect(box, Rect(cx, boxTop, innerW, iy - boxTop), R_SM, nullptr, &bd, 1.f);
            u.p->rect(Rect(cx, boxTop + 1.f, 4.f, iy - boxTop - 2.f), cc);
            cy = iy + 16.f;
        }

        std::vector<std::wstring> notes;
        if (a.trace.truncated)
            notes.push_back(tr(L"The graph was cut down by the node limit; not every path was followed.",
                               L"Der Graph wurde durch die Knotengrenze gekürzt; nicht jeder Weg wurde "
                               L"verfolgt."));
        if (a.trace.addresses && !a.trace.txs)
            notes.push_back(tr(L"No transaction matched the chosen direction.",
                               L"Keine Transaktion passte zur gewählten Richtung."));
        if (!notes.empty()) {
            u.p->text(tr(L"Notes", L"Hinweise"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold),
                      th.tw(Tw::Yellow400));
            cy += 24.f;
            for (const std::wstring& wtxt : notes) {
                Color dc = th.muted;
                u.p->ellipse(Rect(cx + 4.f, cy + 6.f, 4.f, 4.f), &dc, nullptr);
                float wh = textH(u, wtxt, fXs(), innerW - 16.f);
                u.p->text(wtxt, Rect(cx + 16.f, cy, innerW - 16.f, wh), fXs(), th.muted, Align::Left, true);
                cy += wh + 2.f;
            }
            cy += 12.f;
        }

        std::wstring help = tr(L"Click a node for details; connected paths are highlighted. Nodes can be "
                               L"moved, hidden and commented on; the view is saved with the case.",
                               L"Knoten anklicken für Details, verbundene Pfade werden hervorgehoben. Knoten "
                               L"lassen sich verschieben, ausblenden und kommentieren; die Ansicht wird im "
                               L"Fall gespeichert.");
        float hh = textH(u, help, fXs(), innerW);
        u.p->text(help, Rect(cx, cy, innerW, hh), fXs(), th.subtle, Align::Left, true);
        cy += hh;
    } else if (sel->isAddress) {
        // --- Adresse --------------------------------------------------------
        u.p->text(tr(L"Address", L"Adresse"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold), th.foreground);
        cy += 24.f + 8.f;
        float ah = textH(u, sel->address, mXs(), innerW);
        u.p->text(sel->address, Rect(cx, cy, innerW, ah), mXs(), th.foreground, Align::Left, true);
        cy += ah + 8.f;

        if (!sel->label.empty()) {
            std::vector<LabelRow> ls;
            LabelRow l;
            l.label = sel->label;
            l.source = sel->labelSource;
            l.category = sel->isRiskSource ? L"ransomware" : L"custom";
            l.own = (sel->labelSource == tr(L"own", L"eigene"));
            ls.push_back(l);
            cy += labelBadges(a, cx, cy, innerW, ls, false) + 8.f;
        }

        auto line = [&](const std::wstring& label, const std::wstring& value, Color vc, bool bold) {
            std::vector<Span> sp = {Span(label + L" ", fBase(), th.foreground),
                                    Span(value, bold ? fBase(Wt::Bold) : fBase(), vc)};
            drawSpansLine(u, cx, cy, sp);
            cy += 24.f;
        };
        line(tr(L"Risk:", L"Risiko:"),
             sel->risk == L"high"     ? tr(L"high", L"hoch")
             : sel->risk == L"medium" ? tr(L"medium", L"mittel")
             : sel->risk == L"low"    ? tr(L"low", L"niedrig")
                                      : tr(L"none", L"keins"),
             sel->risk == L"high" ? th.tw(Tw::Red400) : th.foreground, true);
        line(tr(L"Depth:", L"Tiefe:"), std::to_wstring(sel->depth), th.foreground, false);
        if (sel->clusterId) {
            u.p->text(tr(L"Cluster #", L"Cluster #") + std::to_wstring(sel->clusterId),
                      Rect(cx, cy, innerW, 24.f), fBase(), clusterColorLocal(th, sel->clusterId));
            cy += 24.f;
        }
        line(tr(L"Received:", L"Empfangen:"),
             fmtAmount((double)sel->receivedSat, chain.decimals, chain.symbol), th.foreground, false);
        line(tr(L"Sent:", L"Gesendet:"), fmtAmount((double)sel->sentSat, chain.decimals, chain.symbol),
             th.foreground, false);

        if (a.optTaint && sel->taintRatio > 0) {
            std::wstring s = tr(L"From the source: ", L"Aus der Quelle: ") +
                             fmtAmount((double)sel->receivedSat * sel->taintRatio, chain.decimals,
                                       chain.symbol, 4) +
                             L" (" + fmtPercent(sel->taintRatio) + L")";
            u.p->text(s, Rect(cx, cy, innerW, 24.f), fBase(), th.tw(Tw::Orange300));
            cy += 24.f;
        }

        if (sel->isRiskSource) {
            std::wstring s = L"⚠ " + tr(L"This address is reported as harmful",
                                        L"Diese Adresse ist als schädlich gemeldet");
            Color bg = th.tw(Tw::Red700);
            float bh = textH(u, s, fXs(Wt::Semibold), innerW - 16.f) + 8.f;
            u.p->roundRect(Rect(cx, cy, innerW, bh), R_SM, &bg, nullptr);
            u.p->text(s, Rect(cx + 8.f, cy + 4.f, innerW - 16.f, bh), fXs(Wt::Semibold), Color::hex(0xffffff),
                      Align::Left, true);
            cy += bh + 8.f;
        } else if (sel->riskFromRatio > 0) {
            Color bbd = th.tw(Tw::Red500).op(0.6f).over(th.panel);
            Color bbg = th.tw(Tw::Red950).op(0.4f).over(th.panel);
            float boxTop = cy;
            size_t box = u.p->reserve();
            float iy = boxTop + 8.f;
            u.p->text(L"⚠ " + tr(L"Tainted inflow", L"Belasteter Zufluss"),
                      Rect(cx + 8.f, iy, innerW - 16.f, 16.f), fXs(Wt::Semibold), th.tw(Tw::Red300));
            iy += 18.f;
            std::wstring body = fmtAmount((double)sel->receivedSat * sel->riskFromRatio, chain.decimals,
                                          chain.symbol, 4) +
                                L" (" + fmtPercent(sel->riskFromRatio) +
                                tr(L" of the inflow) comes from addresses classified as harmful.",
                                   L" des Zuflusses) stammen von als schädlich eingestuften Adressen.");
            float bh = textH(u, body, fXs(), innerW - 16.f);
            u.p->text(body, Rect(cx + 8.f, iy, innerW - 16.f, bh), fXs(), th.foreground, Align::Left, true);
            iy += bh + 8.f;
            u.p->patchRoundRect(box, Rect(cx, boxTop, innerW, iy - boxTop), R_SM, &bbg, &bbd, 1.f);
            cy = iy + 8.f;
        }

        // Verbindungen
        int conn = 0;
        for (const GEdge& e : a.trace.edges)
            if (e.from == sel->id || e.to == sel->id) conn++;
        u.p->text(tr(L"Connections (", L"Verbindungen (") + std::to_wstring(conn) + L")",
                  Rect(cx, cy + 8.f, innerW, 24.f), fBase(Wt::Medium), th.foreground);
        cy += 32.f;
        for (const GEdge& e : a.trace.edges) {
            if (e.from != sel->id && e.to != sel->id) continue;
            bool out = e.from == sel->id;
            std::wstring other = out ? e.to : e.from;
            std::wstring s = (out ? std::wstring(L"→ tx ") : std::wstring(L"← tx ")) +
                             shortHash(other.substr(2), 5);
            u.p->text(s, Rect(cx, cy, innerW, 16.f), mXs(), th.foreground);
            std::wstring v = fmtAmount((double)e.valueSat, chain.decimals, chain.symbol, 5) +
                             (e.change ? L" ⟲" : L"");
            u.p->text(v, Rect(cx, cy, innerW, 16.f), fXs(), th.foreground, Align::Right);
            cy += 18.f;
        }
        cy += 8.f;

        {
            Row row(u, cx, cy, innerW, 8.f, 8.f, BTN_H);
            std::wstring b1 = tr(L"Details", L"Details");
            if (btn(u, L"sp-details", row.place(btnW(u, b1), BTN_H), b1, Btn::Secondary))
                a.go(Page::Address, sel->address);
            std::wstring b2 = tr(L"Trace from here", L"Trace von hier");
            if (btn(u, L"sp-from", row.place(btnW(u, b2), BTN_H), b2, Btn::Secondary)) {
                a.traceStart = sel->address;
                a.traceSelected.clear();
            }
            std::wstring b3 = tr(L"Hide", L"Ausblenden");
            btn(u, L"sp-hide", row.place(btnW(u, b3), BTN_H), b3, Btn::Secondary);
            std::wstring b4 = tr(L"Watch", L"Beobachten");
            if (btn(u, L"sp-watch", row.place(btnW(u, b4), BTN_H), b4, Btn::Secondary)) {
                WatchRow wr;
                wr.id = newId();
                wr.address = sel->address;
                wr.chain = chain.id;
                wr.lastCheck = (long long)time(nullptr);
                a.watches.push_back(wr);
                a.message = tr(L"Added to the watchlist.", L"Zur Watchlist hinzugefügt.");
                a.dirty = true;
            }
            cy += row.height() + 12.f;
        }
        {
            fieldLabel(u, cx, cy, tr(L"Merge with another address", L"Mit anderer Adresse zusammenführen"));
            cy += LABEL_H;
            static std::wstring mergeWith;
            std::wstring mb = tr(L"Merge", L"Zusammenführen");
            float mbw = btnW(u, mb);
            inputBox(u, L"sp-merge", Rect(cx, cy, innerW - mbw - 8.f, INPUT_H), mergeWith,
                     tr(L"Address", L"Adresse"), true, 12.f);
            btn(u, L"sp-mergebtn", Rect(cx + innerW - mbw, cy + (INPUT_H - BTN_H) * .5f, mbw, BTN_H), mb,
                Btn::Secondary, mergeWith.empty());
            cy += INPUT_H + 4.f;
            std::wstring hint = tr(L"Corrects the automatic cluster detection. The trace is recalculated "
                                   L"afterwards.",
                                   L"Korrigiert die automatische Cluster-Erkennung. Der Trace wird danach "
                                   L"neu berechnet.");
            float hh = textH(u, hint, fPx(11.f), innerW);
            u.p->text(hint, Rect(cx, cy, innerW, hh), fPx(11.f), th.subtle, Align::Left, true);
            cy += hh + 12.f;
        }
    } else {
        // --- Transaktion ----------------------------------------------------
        u.p->text(tr(L"Transaction", L"Transaktion"), Rect(cx, cy, innerW, 24.f), fBase(Wt::Semibold),
                  th.foreground);
        cy += 24.f + 8.f;
        float ah = textH(u, sel->txid, mXs(), innerW);
        u.p->text(sel->txid, Rect(cx, cy, innerW, ah), mXs(), th.foreground, Align::Left, true);
        cy += ah + 8.f;

        auto line2 = [&](const std::wstring& s, Color c) {
            u.p->text(s, Rect(cx, cy, innerW, 24.f), fBase(), c);
            cy += 24.f;
        };
        line2(fmtDate(sel->blockTime) + (sel->blockHeight ? tr(L" · block ", L" · Block ") +
                                                                std::to_wstring(sel->blockHeight)
                                                          : std::wstring()),
              th.muted);
        line2(std::to_wstring(sel->inputCount) + tr(L" inputs → ", L" Eingänge → ") +
                  std::to_wstring(sel->outputCount) + tr(L" outputs", L" Ausgänge"),
              th.foreground);
        line2(tr(L"Volume: ", L"Volumen: ") +
                  fmtAmount((double)sel->totalOutSat, chain.decimals, chain.symbol),
              th.foreground);
        line2(tr(L"Fee: ", L"Gebühr: ") + fmtAmount((double)sel->feeSat, chain.decimals, chain.symbol, 6),
              th.foreground);
        if (sel->carriesRisk) {
            std::wstring s = tr(L"This transaction moves money that comes from an address classified as "
                                L"harmful.",
                                L"Diese Transaktion bewegt Geld, das von einer als schädlich eingestuften "
                                L"Adresse stammt.");
            float hh = textH(u, s, fXs(), innerW);
            u.p->text(s, Rect(cx, cy, innerW, hh), fXs(), th.tw(Tw::Red300), Align::Left, true);
            cy += hh + 8.f;
        }

        u.p->text(tr(L"Money flow", L"Geldfluss"), Rect(cx, cy + 4.f, innerW, 24.f), fBase(Wt::Medium),
                  th.foreground);
        cy += 30.f;
        for (const GEdge& e : a.trace.edges) {
            if (e.from != sel->id && e.to != sel->id) continue;
            bool out = e.from == sel->id;
            std::wstring other = (out ? e.to : e.from).substr(2);
            std::wstring s = (out ? tr(L"to ", L"nach ") : tr(L"from ", L"von ")) + shortHash(other, 7);
            u.p->text(s, Rect(cx, cy, innerW, 16.f), mXs(), th.foreground);
            u.p->text(fmtAmount((double)e.valueSat, chain.decimals, chain.symbol, 5),
                      Rect(cx, cy, innerW, 16.f), fXs(), th.foreground, Align::Right);
            cy += 18.f;
        }
        cy += 8.f;
        std::wstring b3 = tr(L"Hide", L"Ausblenden");
        btn(u, L"sp-hidetx", Rect(cx, cy, btnW(u, b3), BTN_H), b3, Btn::Secondary);
        cy += BTN_H;
    }

    // Kommentarfeld (CommentBox)
    {
        cy += 8.f;
        fieldLabel(u, cx, cy, tr(L"Comment (saved with the case)", L"Kommentar (wird im Fall gespeichert)"));
        cy += LABEL_H;
        static std::wstring comment;
        textArea(u, L"sp-comment", Rect(cx, cy, innerW, 58.f), comment, L"");
        cy += 58.f;
    }

    sc.contentH = cy - y0;
    u.popHitClip();
    u.p->clipPop();

    // Bildlaufleiste des Panels
    if (maxScroll > 0.5f) {
        float thumbH = (std::max)(24.f, h * (h / (sc.contentH + 2 * CARD_PAD)));
        float t = maxScroll > 0 ? sc.y / maxScroll : 0.f;
        Color c2 = th.mode == Mode::Dark ? Color(1, 1, 1, 0.2f) : Color(0, 0, 0, 0.2f);
        u.p->roundRect(Rect(x + w - 8.f, y + 3.f + t * (h - thumbH - 6.f), 5.f, thumbH), 3.f, &c2, nullptr);
    }
    return h;
}
