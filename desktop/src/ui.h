// ---------------------------------------------------------------------------
// ui.h - Kleiner Baukasten fuer die Oberflaeche.
//
// Immediate-Mode: jedes Bild wird die gesamte Seite neu aufgebaut, Zustand
// steckt nur in `Ui` (Fokus, offene Auswahl, Bildlauf) und in den Seitendaten.
// Die Masse entsprechen den Tailwind-Klassen der Webseite:
//
//   .btn            px-3 py-1.5 text-sm  -> 32 px hoch, 12 px Innenabstand
//   .btn-secondary  wie .btn, nur Rahmen
//   .input          px-3 py-2  text-sm   -> 38 px hoch
//   .label          text-xs uppercase tracking-wide + mb-1 -> 20 px
//   .card           rounded-lg border p-4
// ---------------------------------------------------------------------------
#pragma once
#include "gfx.h"
#include "theme.h"
#include <functional>
#include <map>

// --- Masse -----------------------------------------------------------------
constexpr float BTN_H = 32.f;
constexpr float BTN_PADX = 12.f;
constexpr float INPUT_H = 38.f;
constexpr float INPUT_SM_H = 30.f;   // `py-1`
constexpr float INPUT_LG_H = 46.f;   // `py-3`
constexpr float INPUT_PADX = 12.f;
constexpr float LABEL_H = 20.f;      // text-xs (16) + mb-1 (4)
constexpr float CARD_PAD = 16.f;
constexpr float R_LG = 8.f;
constexpr float R_MD = 6.f;
constexpr float R_SM = 4.f;

enum class Btn { Primary, Secondary };

// --- Eingaben --------------------------------------------------------------
struct Input {
    float mx = -1, my = -1;
    bool down = false, pressed = false, released = false;
    bool rightPressed = false;
    float wheel = 0.f;
    std::wstring chars;
    std::vector<UINT> keys;
    bool shift = false, ctrl = false;
    bool doubleClick = false;
};

// --- Auswahlliste (wird ueber allem gezeichnet) ----------------------------
struct Popup {
    bool open = false;
    std::wstring id;
    Rect anchor;
    std::vector<std::wstring> options;
    int selected = 0;
    float scroll = 0.f;
};

struct ScrollState {
    float y = 0.f;
    float contentH = 0.f;
    float viewH = 0.f;
};

struct Ui {
    Painter* p = nullptr;
    Theme th;
    Input in;
    Rect viewport;
    double time = 0.0;

    // Interaktion
    std::wstring hotId, activeId, focusId;
    int caret = 0;
    int selAnchor = -1;
    bool cursorHand = false;
    bool cursorText = false;
    bool redraw = false;

    Popup popup;
    std::wstring popupResultId;
    int popupResultIndex = -1;

    // Kurzhinweis (`title=`), am Ende des Bildes gezeichnet
    std::wstring tipText;
    Rect tipAnchor;

    std::map<std::wstring, ScrollState> scrolls;

    bool mouseIn(const Rect& r) const { return r.hit(in.mx, in.my) && clipAllows(in.mx, in.my); }
    bool clipAllows(float x, float y) const {
        for (const Rect& r : clipStack) if (!r.hit(x, y)) return false;
        return true;
    }
    std::vector<Rect> clipStack;
    void pushHitClip(const Rect& r) { clipStack.push_back(r); }
    void popHitClip() { if (!clipStack.empty()) clipStack.pop_back(); }

    bool keyDown(UINT vk) const {
        for (UINT k : in.keys) if (k == vk) return true;
        return false;
    }
};

// --- Rahmenablauf ----------------------------------------------------------
void uiBeginFrame(Ui& u);
void uiEndFrame(Ui& u);

// --- Text ------------------------------------------------------------------
float drawText(Ui& u, float x, float y, const std::wstring& s, const Font& f, Color c);
float drawTextIn(Ui& u, Rect r, const std::wstring& s, const Font& f, Color c,
                 Align a = Align::Left, bool wrap = false);
float textW(Ui& u, const std::wstring& s, const Font& f);
float textH(Ui& u, const std::wstring& s, const Font& f, float maxW);
std::wstring truncate(Ui& u, const std::wstring& s, const Font& f, float maxW);

// Mehrfarbige Textstuecke in einer Zeile bzw. mit Umbruch.
struct Span {
    std::wstring text;
    Font font;
    Color color;
    std::wstring link;   // nicht leer -> anklickbar
    bool underlineOnHover = true;
    Span() {}
    Span(std::wstring t, Font f, Color c) : text(std::move(t)), font(f), color(c) {}
    Span(std::wstring t, Font f, Color c, std::wstring l)
        : text(std::move(t)), font(f), color(c), link(std::move(l)) {}
};
float spansWidth(Ui& u, const std::vector<Span>& sp);
// Eine Zeile; gibt die angeklickte Link-Kennung zurueck (leer = kein Klick).
std::wstring drawSpansLine(Ui& u, float x, float y, const std::vector<Span>& sp,
                           float boxW = 0, Align a = Align::Left);
// Fliesstext mit Umbruch. `outH` bekommt die verbrauchte Hoehe.
std::wstring drawSpanFlow(Ui& u, float x, float y, float w, const std::vector<Span>& sp,
                          float lineH, float* outH, Align a = Align::Left);

// --- Bausteine -------------------------------------------------------------
struct CardCtx {
    size_t bg = 0;
    float x = 0, y = 0, w = 0, pad = 16.f;
    float inner = 0.f;
    Color border, fill;
    bool overlay = false;
};
CardCtx cardBegin(Ui& u, float x, float y, float w, float pad = CARD_PAD);
CardCtx cardBegin(Ui& u, float x, float y, float w, float pad, Color border, Color fill);
float cardEnd(Ui& u, CardCtx& c, float contentH);

float btnW(Ui& u, const std::wstring& label);
bool btn(Ui& u, const std::wstring& id, Rect r, const std::wstring& label, Btn kind, bool disabled = false);
bool link(Ui& u, const std::wstring& id, Rect r, const std::wstring& label, const Font& f, Color c,
          Align a = Align::Left, bool underline = true);

bool inputBox(Ui& u, const std::wstring& id, Rect r, std::wstring& value,
              const std::wstring& placeholder, bool mono = false, float fontSize = 14.f,
              bool password = false);
bool textArea(Ui& u, const std::wstring& id, Rect r, std::wstring& value,
              const std::wstring& placeholder, bool mono = false, float fontSize = 14.f);
bool selectBox(Ui& u, const std::wstring& id, Rect r, const std::vector<std::wstring>& options,
               int& index, float fontSize = 14.f);
float checkboxW(Ui& u, const std::wstring& label, const Font& f);
bool checkbox(Ui& u, const std::wstring& id, float x, float y, float lineH, bool& value,
              const std::wstring& label, const Font& f, Color c, bool disabled = false);

void fieldLabel(Ui& u, float x, float y, const std::wstring& s);
float badgeW(Ui& u, const std::wstring& s, const Font& f, float padX = 6.f);
void badge(Ui& u, Rect r, const std::wstring& s, Color bg, Color fg, const Font& f,
           float radius = R_SM);

void hline(Ui& u, float x, float y, float w, Color c);
void tooltip(Ui& u, Rect anchor, const std::wstring& text);

// --- Layout ----------------------------------------------------------------
// Senkrechter Stapel mit festem Abstand (`space-y-N`).
struct Col {
    Ui* u = nullptr;
    float x = 0, y = 0, w = 0, gap = 0, y0 = 0;
    bool first = true;
    Col() {}
    Col(Ui& ui, float xx, float yy, float ww, float g) : u(&ui), x(xx), y(yy), w(ww), gap(g), y0(yy) {}
    float startBlock() {
        if (!first) y += gap;
        first = false;
        return y;
    }
    void endBlock(float h) { y += h; }
    Rect block(float h) {
        float yy = startBlock();
        endBlock(h);
        return Rect(x, yy, w, h);
    }
    float used() const { return y - y0; }
};

// Waagerechte Reihe mit Umbruch (`flex flex-wrap`). `lineH` ist die Hoehe der
// Zeile; Elemente werden darin senkrecht zentriert (`items-center`).
struct Row {
    Ui* u = nullptr;
    float x0 = 0, y0 = 0, w = 0, gx = 0, gy = 0, lineH = 0;
    float cx = 0, cy = 0;
    bool firstInLine = true;
    float rightEdge = 0;
    Row() {}
    Row(Ui& ui, float x, float y, float ww, float gapX, float gapY, float lh)
        : u(&ui), x0(x), y0(y), w(ww), gx(gapX), gy(gapY), lineH(lh), cx(x), cy(y) {
        rightEdge = x + ww;
    }
    Rect place(float iw, float ih);
    Rect placeRight(float iw, float ih);
    void newline();
    float height() const { return cy - y0 + lineH; }
};
