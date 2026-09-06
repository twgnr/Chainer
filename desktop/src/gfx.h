// ---------------------------------------------------------------------------
// gfx.h - Zeichenschicht auf Direct2D/DirectWrite.
//
// Alles, was die Oberflaeche zeichnet, geht ueber `Painter`. Der Painter
// sammelt Zeichenbefehle erst in einer Liste ein und fuehrt sie am Ende des
// Bildes aus. Das ist noetig, weil Karten (`.card`) ihren Hintergrund hinter
// ihrem Inhalt zeichnen, die Hoehe aber erst nach dem Inhalt feststeht: der
// Hintergrund wird als Platzhalter vorgemerkt und spaeter nachgetragen.
//
// Koordinaten sind DIPs und entsprechen damit 1:1 den CSS-Pixeln der Webseite.
// ---------------------------------------------------------------------------
#pragma once
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <d2d1.h>
#include <dwrite_1.h>
#include <string>
#include <vector>
#include <unordered_map>
#include <algorithm>

// ---------------------------------------------------------------------------
// Farbe
// ---------------------------------------------------------------------------
struct Color {
    float r = 0, g = 0, b = 0, a = 1;
    Color() {}
    Color(float rr, float gg, float bb, float aa = 1.f) : r(rr), g(gg), b(bb), a(aa) {}

    // #rrggbb als 0xRRGGBB
    static Color hex(unsigned rgb, float alpha = 1.f) {
        return Color(((rgb >> 16) & 0xff) / 255.f, ((rgb >> 8) & 0xff) / 255.f, (rgb & 0xff) / 255.f, alpha);
    }
    Color op(float alpha) const { return Color(r, g, b, a * alpha); }
    // Legt diese Farbe mit ihrem Alpha ueber `bg` - wie CSS es auf einem
    // undurchsichtigen Grund tut.
    Color over(const Color& bg) const {
        float ia = 1.f - a;
        return Color(r * a + bg.r * ia, g * a + bg.g * ia, b * a + bg.b * ia, 1.f);
    }
    Color mix(const Color& o, float t) const {
        return Color(r + (o.r - r) * t, g + (o.g - g) * t, b + (o.b - b) * t, a + (o.a - a) * t);
    }
    // `hover:brightness-110`
    Color brightness(float f) const {
        return Color((std::min)(1.f, r * f), (std::min)(1.f, g * f), (std::min)(1.f, b * f), a);
    }
    bool operator==(const Color& o) const { return r == o.r && g == o.g && b == o.b && a == o.a; }
};

// ---------------------------------------------------------------------------
// Rechteck
// ---------------------------------------------------------------------------
struct Rect {
    float x = 0, y = 0, w = 0, h = 0;
    Rect() {}
    Rect(float xx, float yy, float ww, float hh) : x(xx), y(yy), w(ww), h(hh) {}
    float r() const { return x + w; }
    float b() const { return y + h; }
    float cx() const { return x + w * 0.5f; }
    float cy() const { return y + h * 0.5f; }
    bool hit(float px, float py) const { return px >= x && px < x + w && py >= y && py < y + h; }
    Rect inset(float d) const { return Rect(x + d, y + d, w - 2 * d, h - 2 * d); }
    Rect offset(float dx, float dy) const { return Rect(x + dx, y + dy, w, h); }
    Rect intersect(const Rect& o) const {
        float x0 = (std::max)(x, o.x), y0 = (std::max)(y, o.y);
        float x1 = (std::min)(r(), o.r()), y1 = (std::min)(b(), o.b());
        return Rect(x0, y0, (std::max)(0.f, x1 - x0), (std::max)(0.f, y1 - y0));
    }
    bool empty() const { return w <= 0.f || h <= 0.f; }
};

// ---------------------------------------------------------------------------
// Schrift
// ---------------------------------------------------------------------------
enum class Fam { Sans, Mono };
enum class Wt { Regular = 400, Medium = 500, Semibold = 600, Bold = 700 };

struct Font {
    Fam fam = Fam::Sans;
    float size = 16.f;      // wie `font-size` in px
    Wt wt = Wt::Regular;
    float lh = 0.f;         // 0 = Tailwind-Vorgabe zur Groesse
    bool tracking = false;  // `tracking-wide` (0.025em)
    bool italic = false;
    Font() {}
    Font(Fam f, float s, Wt w = Wt::Regular) : fam(f), size(s), wt(w) {}
    Font& track() { tracking = true; return *this; }
    Font& leading(float v) { lh = v; return *this; }
};

// Die Schriftgroessen der Webseite (Tailwind) mit ihren Zeilenhoehen.
inline float tailwindLineHeight(float size) {
    if (size <= 10.5f) return 14.f;   // text-[9px] / text-[10px]
    if (size <= 12.5f) return 16.f;   // text-[11px] / text-xs
    if (size <= 14.5f) return 20.f;   // text-sm
    if (size <= 16.5f) return 24.f;   // text-base
    if (size <= 18.5f) return 28.f;   // text-lg
    if (size <= 20.5f) return 28.f;   // text-xl
    if (size <= 24.5f) return 32.f;   // text-2xl
    if (size <= 30.5f) return 36.f;   // text-3xl
    return size * 1.2f;
}

// Kurzschreibweisen fuer die Tailwind-Klassen der Webseite
inline Font fXs(Wt w = Wt::Regular)   { return Font(Fam::Sans, 12.f, w); }
inline Font fSm(Wt w = Wt::Regular)   { return Font(Fam::Sans, 14.f, w); }
inline Font fBase(Wt w = Wt::Regular) { return Font(Fam::Sans, 16.f, w); }
inline Font fLg(Wt w = Wt::Regular)   { return Font(Fam::Sans, 18.f, w); }
inline Font fXl(Wt w = Wt::Regular)   { return Font(Fam::Sans, 20.f, w); }
inline Font f3Xl(Wt w = Wt::Bold)     { return Font(Fam::Sans, 30.f, w); }
inline Font fPx(float px, Wt w = Wt::Regular) { return Font(Fam::Sans, px, w); }
inline Font mXs(Wt w = Wt::Regular)   { return Font(Fam::Mono, 12.f, w); }
inline Font mSm(Wt w = Wt::Regular)   { return Font(Fam::Mono, 14.f, w); }
inline Font mPx(float px, Wt w = Wt::Regular) { return Font(Fam::Mono, px, w); }

enum class Align { Left, Center, Right };
enum class Dash { Solid, Dashed, Dotted, Double };

// ---------------------------------------------------------------------------
// Zeichenbefehl
// ---------------------------------------------------------------------------
enum class CmdKind { None, RoundRect, Line, Text, ClipPush, ClipPop, Ellipse, Bezier, Ring };

struct DrawCmd {
    CmdKind kind = CmdKind::None;
    Rect rect;
    Color fill, stroke;
    bool hasFill = false, hasStroke = false;
    float radius = 0.f, strokeW = 1.f;
    Dash dash = Dash::Solid;
    // Text
    std::wstring text;
    Font font;
    Align align = Align::Left;
    bool wrap = false;
    // Linie / Bezier / Ring
    float x0 = 0, y0 = 0, x1 = 0, y1 = 0, cx0 = 0, cy0 = 0, cx1 = 0, cy1 = 0;
};

// ---------------------------------------------------------------------------
// Painter
// ---------------------------------------------------------------------------
class Painter {
public:
    bool init(ID2D1RenderTarget* rt, IDWriteFactory* dw, ID2D1Factory* d2d);
    void shutdown();
    void setTarget(ID2D1RenderTarget* rt) { rt_ = rt; }

    void beginFrame();
    void flush();  // fuehrt Haupt- und Overlay-Liste aus

    // --- Aufzeichnen -------------------------------------------------------
    size_t reserve();  // Platzhalter, spaeter mit patch* gefuellt
    void patchRoundRect(size_t idx, Rect rc, float radius, const Color* fill,
                        const Color* stroke, float sw = 1.f, Dash d = Dash::Solid);
    void patchClip(size_t idx, Rect rc);

    void rect(Rect rc, Color fill) { roundRect(rc, 0.f, &fill, nullptr); }
    void roundRect(Rect rc, float radius, const Color* fill, const Color* stroke,
                   float sw = 1.f, Dash d = Dash::Solid);
    void ring(Rect rc, float radius, Color c, float w, float offset);
    void ellipse(Rect rc, const Color* fill, const Color* stroke, float sw = 1.f);
    void line(float x0, float y0, float x1, float y1, Color c, float w = 1.f, Dash d = Dash::Solid);
    void bezier(float x0, float y0, float cx0, float cy0, float cx1, float cy1,
                float x1, float y1, Color c, float w = 1.f, Dash d = Dash::Solid);
    void text(const std::wstring& s, Rect rc, const Font& f, Color c,
              Align a = Align::Left, bool wrap = false);

    void clipPush(Rect rc);
    size_t clipPushReserve();
    void clipPop();

    void overlayBegin() { toOverlay_ = true; }
    void overlayEnd() { toOverlay_ = false; }
    bool inOverlay() const { return toOverlay_; }

    // --- Messen ------------------------------------------------------------
    float textWidth(const std::wstring& s, const Font& f);
    float textHeight(const std::wstring& s, const Font& f, float maxW);
    float lineHeight(const Font& f) const { return f.lh > 0 ? f.lh : tailwindLineHeight(f.size); }
    int caretIndexAt(const std::wstring& s, const Font& f, float dx);
    float caretX(const std::wstring& s, const Font& f, int index);
    // Kuerzt mit "..." bis der Text in `maxW` passt (`truncate`).
    std::wstring ellipsize(const std::wstring& s, const Font& f, float maxW);

    const std::wstring& sansFamily() const { return sansFamily_; }
    const std::wstring& monoFamily() const { return monoFamily_; }

private:
    std::vector<DrawCmd>& cur() { return toOverlay_ ? overlay_ : main_; }
    void exec(const std::vector<DrawCmd>& list);
    IDWriteTextFormat* format(const Font& f);
    IDWriteTextLayout* layout(const std::wstring& s, const Font& f, float maxW);
    ID2D1SolidColorBrush* brush(const Color& c);
    ID2D1StrokeStyle* strokeStyle(Dash d);
    void pickFamilies();

    ID2D1RenderTarget* rt_ = nullptr;
    ID2D1Factory* d2d_ = nullptr;
    IDWriteFactory* dw_ = nullptr;
    ID2D1SolidColorBrush* brush_ = nullptr;
    ID2D1StrokeStyle* dashStyle_ = nullptr;
    ID2D1StrokeStyle* dotStyle_ = nullptr;

    std::wstring sansFamily_ = L"Segoe UI";
    std::wstring monoFamily_ = L"Consolas";

    std::unordered_map<std::wstring, IDWriteTextFormat*> formats_;
    std::unordered_map<std::wstring, IDWriteTextLayout*> layouts_;

    std::vector<DrawCmd> main_, overlay_;
    bool toOverlay_ = false;
};

// UTF-8 <-> UTF-16
std::wstring toW(const std::string& s);
std::string toU8(const std::wstring& s);
