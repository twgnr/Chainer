// ---------------------------------------------------------------------------
// app.cpp - Gemeinsamer Rahmen: Kopfleiste, Inhalt, Fusszeile.
//
// Entspricht `src/app/layout.tsx` und `src/components/Nav.tsx`:
//
//   <body class="min-h-full flex flex-col">
//     <Nav/>                                       border-b, bg-panel
//     <main class="mx-auto max-w-[1600px] flex-1 px-4 py-6">…</main>
//     <footer class="border-t px-4 py-3 text-center text-xs text-subtle">…</footer>
// ---------------------------------------------------------------------------
#include "app.h"
#include "store.h"
#include <shellapi.h>
#include <ctime>

App g_app;

// Link im Standardbrowser oeffnen (der einzige Weg nach draussen; die
// Anwendung selbst spricht mit keinem Server).
void openUrl(const std::wstring& url) {
    if (url.empty()) return;
    ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
}

// Fortlaufende Kennung fuer neu angelegte Eintraege.
std::wstring newId() {
    static unsigned counter = 0;
    wchar_t buf[32];
    swprintf(buf, 32, L"%llx%x", (unsigned long long)time(nullptr), ++counter);
    return buf;
}

Mode App::mode() const {
    if (theme == ThemeChoice::Light) return Mode::Light;
    if (theme == ThemeChoice::Dark) return Mode::Dark;
    return systemLight ? Mode::Light : Mode::Dark;
}

void App::go(Page p, const std::wstring& param) {
    history.push_back(route);
    route.page = p;
    route.param = param;
    scroll = 0.f;
    ui.focusId.clear();
    message.clear();
}

// ---------------------------------------------------------------------------
// Kopfleiste
// ---------------------------------------------------------------------------
struct NavItem { Page page; const wchar_t* en; const wchar_t* de; };

static const NavItem NAV[] = {
    {Page::Home,        L"Search",       L"Suche"},
    {Page::Trace,       L"Trace",        L"Trace"},
    {Page::Path,        L"Connection",   L"Verbindung"},
    {Page::Screen,      L"Bulk check",   L"Massenprüfung"},
    {Page::Cases,       L"Cases",        L"Fälle"},
    {Page::Jobs,        L"Jobs",         L"Aufträge"},
    {Page::Watchlist,   L"Watchlist",    L"Watchlist"},
    {Page::Annotations, L"Labels",       L"Labels"},
    {Page::Settings,    L"Sources",      L"Quellen"},
    {Page::ApiDocs,     L"API",          L"API"},
    {Page::Info,        L"Info",         L"Info"},
};

static float drawNav(App& a, float y, float viewW) {
    Ui& u = a.ui;
    const Theme& th = u.th;

    float maxW = 1600.f;
    float outerX = (std::max)(0.f, (viewW - maxW) * .5f);
    float innerW = (std::min)(viewW, maxW);
    float padX = viewW >= 640.f ? 16.f : 12.f;   // px-3 sm:px-4
    float x = outerX + padX;
    float w = innerW - 2 * padX;

    size_t bg = u.p->reserve();

    // gap-x-5 (20) gap-y-2 (8), items-center, py-3 (12)
    Row row(u, x, y + 12.f, w, 20.f, 8.f, 32.f);

    // Logo: text-lg font-bold, "⛓" in der Markenfarbe
    Font logoF = fLg(Wt::Bold);
    std::vector<Span> logo = {Span(L"⛓", logoF, th.brand), Span(L" Chainer", logoF, th.foreground)};
    float logoW = spansWidth(u, logo);
    Rect lr = row.place(logoW, 28.f);
    drawSpansLine(u, lr.x, lr.y, logo);
    if (u.mouseIn(lr)) {
        u.cursorHand = true;
        if (u.in.pressed) a.go(Page::Home);
    }

    // Navigation: gap-4 (16), text-sm
    Font navF = fSm();
    {
        // Die Links bilden eine eigene Flexbox; sie brechen als Gruppe um.
        int unread = 0;
        for (const WatchRow& wr : a.watches)
            for (const WatchEvent& e : wr.events)
                if (!e.read) unread++;
        float need = 0;
        for (const NavItem& it : NAV) need += textW(u, tr(it.en, it.de), navF) + 16.f;
        if (unread > 0) need += 24.f;
        Rect group = row.place((std::min)(need - 16.f, w), 20.f);
        float cx = group.x;
        float cy = group.y;
        for (const NavItem& it : NAV) {
            std::wstring label = tr(it.en, it.de);
            float tw = textW(u, label, navF);
            bool active = a.route.page == it.page;
            Color c = active ? th.brand : th.fg2;
            Rect r(cx, cy, tw, 20.f);
            bool over = u.mouseIn(r);
            if (over && !active) c = th.foreground;
            u.p->text(label, r, navF, c);
            if (over) {
                u.cursorHand = true;
                if (u.in.pressed) a.go(it.page);
            }
            cx += tw;
            if (it.page == Page::Watchlist && unread > 0) {
                // `rounded-full bg-accent px-1.5 text-[10px] text-black`
                Font bf = fPx(10.f);
                std::wstring n = std::to_wstring(unread);
                float bw = textW(u, n, bf) + 12.f;
                Rect br(cx + 4.f, cy + 2.f, bw, 15.f);
                badge(u, br, n, th.accent, Color::hex(0x000000), bf, 7.5f);
                cx += 4.f + bw;
            }
            cx += 16.f;
        }
    }

    // Rechte Seite: ml-auto, gap-3 (12), text-sm
    {
        struct RItem { float w, h; int kind; std::wstring text; };
        std::vector<RItem> items;
        Font smF = fSm();

        // Sprachauswahl: 🌐 + kleines Auswahlfeld
        float globeW = textW(u, L"🌐", fSm());
        float selW = (std::max)(textW(u, L"English", fXs()), textW(u, L"Deutsch", fXs())) + 34.f;
        items.push_back({globeW + 4.f + selW, 26.f, 0, L""});

        // Farbschema
        const wchar_t* icon = a.theme == ThemeChoice::Light ? L"☀" : a.theme == ThemeChoice::Dark ? L"☾" : L"◐";
        std::wstring name = a.theme == ThemeChoice::Light   ? tr(L"Light", L"Hell")
                            : a.theme == ThemeChoice::Dark  ? tr(L"Dark", L"Dunkel")
                                                            : tr(L"System", L"System");
        std::wstring themeLabel = std::wstring(icon) + L" " + name;
        items.push_back({btnW(u, themeLabel), BTN_H, 1, themeLabel});

        float total = 0;
        for (auto& it : items) total += it.w;
        total += 12.f * (items.size() - 1);

        Rect group = row.placeRight(total, 32.f);
        float cx = group.x;
        for (auto& it : items) {
            Rect r(cx, group.y + (32.f - it.h) * .5f, it.w, it.h);
            switch (it.kind) {
            case 0: {
                u.p->text(L"🌐", Rect(r.x, r.y + 4.f, 100.f, 18.f), fSm(), th.subtle);
                std::vector<std::wstring> langs = {L"English", L"Deutsch"};
                int idx = g_locale == Loc::De ? 1 : 0;
                Rect sr(r.x + globeW + 4.f, r.y, selW, 26.f);
                // `rounded-md border border-border bg-panel px-1.5 py-1 text-xs`
                Color bg = th.panel, bd = th.border;
                bool open = u.popup.open && u.popup.id == L"nav-locale";
                if (open) bd = th.accent;
                u.p->roundRect(sr, R_MD, &bg, &bd, 1.f);
                u.p->text(langs[(size_t)idx], Rect(sr.x + 6.f, sr.y + 5.f, sr.w - 22.f, 16.f), fXs(),
                          th.foreground);
                float ax = sr.r() - 11.f, ay = sr.cy() - 1.f;
                u.p->line(ax - 3.5f, ay - 2, ax, ay + 2, th.muted, 1.3f);
                u.p->line(ax, ay + 2, ax + 3.5f, ay - 2, th.muted, 1.3f);
                if (u.popupResultId == L"nav-locale") {
                    g_locale = u.popupResultIndex == 1 ? Loc::De : Loc::En;
                    u.popupResultId.clear();
                    a.dirty = true;
                }
                if (u.mouseIn(sr)) {
                    u.cursorHand = true;
                    if (u.in.pressed) {
                        u.popup.open = !open;
                        u.popup.id = L"nav-locale";
                        u.popup.anchor = sr;
                        u.popup.options = langs;
                        u.popup.selected = idx;
                        u.popup.scroll = 0;
                    }
                }
                tooltip(u, r, tr(L"Language", L"Sprache"));
                break;
            }
            case 1: {
                std::wstring next = a.theme == ThemeChoice::Light   ? tr(L"Dark", L"Dunkel")
                                    : a.theme == ThemeChoice::Dark  ? tr(L"System", L"System")
                                                                    : tr(L"Light", L"Hell");
                if (btn(u, L"nav-theme", r, it.text, Btn::Secondary)) {
                    a.theme = a.theme == ThemeChoice::Light   ? ThemeChoice::Dark
                              : a.theme == ThemeChoice::Dark  ? ThemeChoice::System
                                                              : ThemeChoice::Light;
                    a.dirty = true;
                }
                tooltip(u, r, tr(L"Switch to: ", L"Umschalten auf: ") + next);
                break;
            }
            }
            cx += it.w + 12.f;
        }
    }

    float h = row.height() + 24.f;   // py-3 oben und unten
    Rect bar(0, y, viewW, h);
    Color fill = th.panel;
    u.p->patchRoundRect(bg, bar, 0.f, &fill, nullptr);
    hline(u, 0, y + h - 1.f, viewW, th.border);
    return h;
}

// ---------------------------------------------------------------------------
// Fusszeile
// ---------------------------------------------------------------------------
static float drawFooter(App& a, float y, float viewW) {
    Ui& u = a.ui;
    std::wstring text = tr(
        L"Chainer · Sources: mempool.space, Blockstream, litecoinspace, Blockchain.com, BlockCypher, "
        L"Blockchair, Blockscout, Etherscan, your own node and Electrum · Labels: OFAC, Ransomwhere, "
        L"GraphSense TagPacks, WalletExplorer, CryptoScamDB, Chainabuse, Bitcoin Who's Who · Rates: "
        L"CoinGecko · Heuristics are statements of probability, not proof.",
        L"Chainer · Quellen: mempool.space, Blockstream, litecoinspace, Blockchain.com, BlockCypher, "
        L"Blockchair, Blockscout, Etherscan, eigener Knoten und Electrum · Labels: OFAC, Ransomwhere, "
        L"GraphSense-TagPacks, WalletExplorer, CryptoScamDB, Chainabuse, Bitcoin Who's Who · Kurse: "
        L"CoinGecko · Heuristiken sind Wahrscheinlichkeitsaussagen, keine Beweise.");
    float w = viewW - 32.f;
    float h = textH(u, text, fXs(), w);
    hline(u, 0, y, viewW, u.th.border);
    u.p->text(text, Rect(16.f, y + 12.f, w, h), fXs(), u.th.subtle, Align::Center, true);
    return h + 24.f;
}

// ---------------------------------------------------------------------------
// Seiteninhalt
// ---------------------------------------------------------------------------
static float drawPage(App& a, float x, float y, float w) {
    switch (a.route.page) {
    case Page::Home:        return pageHome(a, x, y, w);
    case Page::Trace:       return pageTrace(a, x, y, w);
    case Page::Path:        return pagePath(a, x, y, w);
    case Page::Screen:      return pageScreen(a, x, y, w);
    case Page::Cases:       return pageCases(a, x, y, w);
    case Page::Jobs:        return pageJobs(a, x, y, w);
    case Page::Watchlist:   return pageWatchlist(a, x, y, w);
    case Page::Annotations: return pageAnnotations(a, x, y, w);
    case Page::Settings:    return pageSettings(a, x, y, w);
    case Page::ApiDocs:     return pageApiDocs(a, x, y, w);
    case Page::Info:        return pageInfo(a, x, y, w);
    case Page::Address:     return pageAddress(a, x, y, w);
    case Page::Tx:          return pageTx(a, x, y, w);
    default:                return pageHome(a, x, y, w);
    }
}

// ---------------------------------------------------------------------------
// Ein Bild
// ---------------------------------------------------------------------------
void appFrame(App& a, float viewW, float viewH) {
    Ui& u = a.ui;
    u.th = Theme::make(a.mode());
    u.viewport = Rect(0, 0, viewW, viewH);

    // Untergrund
    Color bg = u.th.background;
    u.p->rect(Rect(0, 0, viewW, viewH), bg);

    // Fertige Netzabfragen übernehmen, bevor gezeichnet wird
    liveTick(a);

    uiBeginFrame(u);

    // Bildlauf mit dem Rad; die gesamte Seite laeuft, wie im Browser.
    if (u.in.wheel != 0.f && u.popup.open == false) {
        a.scroll -= u.in.wheel;
        u.in.wheel = 0.f;
    }
    if (u.keyDown(VK_NEXT)) a.scroll += viewH * 0.9f;
    if (u.keyDown(VK_PRIOR)) a.scroll -= viewH * 0.9f;
    if (u.keyDown(VK_HOME) && u.focusId.empty()) a.scroll = 0;

    float navH = drawNav(a, -a.scroll, viewW);

    float maxW = 1600.f;
    float outerX = (std::max)(0.f, (viewW - maxW) * .5f);
    float innerW = (std::min)(viewW, maxW);
    float px = 16.f;   // px-4
    float contentX = outerX + px;
    float contentW = innerW - 2 * px;
    float mainTop = -a.scroll + navH;

    float used = drawPage(a, contentX, mainTop + 24.f, contentW);   // py-6
    float mainH = used + 48.f;

    // `flex-1`: bei kurzem Inhalt fuellt der Hauptbereich den Rest.
    float footerProbeW = viewW - 32.f;
    std::wstring footProbe = L"x";
    (void)footProbe;
    float minMain = viewH - navH - 60.f;
    if (mainH < minMain) mainH = minMain;
    (void)footerProbeW;

    float footerH = drawFooter(a, -a.scroll + navH + mainH, viewW);

    a.contentH = navH + mainH + footerH;
    float maxScroll = (std::max)(0.f, a.contentH - viewH);
    if (a.scroll > maxScroll) a.scroll = maxScroll;
    if (a.scroll < 0) a.scroll = 0;

    // Bildlaufleiste wie im Browser
    if (maxScroll > 0.5f) {
        float trackW = 10.f;
        float x = viewW - trackW - 2.f;
        float thumbH = (std::max)(30.f, viewH * (viewH / a.contentH));
        float t = a.scroll / maxScroll;
        float ty = t * (viewH - thumbH);
        Color c = u.th.mode == Mode::Dark ? Color(1, 1, 1, 0.22f) : Color(0, 0, 0, 0.22f);
        u.p->overlayBegin();
        u.p->roundRect(Rect(x, ty + 2.f, trackW - 2.f, thumbH - 4.f), 4.f, &c, nullptr);
        u.p->overlayEnd();
    }

    uiEndFrame(u);

    // Aenderungen dieses Bildes in die JSON-Datei schreiben.
    if (a.dirty) {
        storeSave(a);
        a.dirty = false;
    }
}
