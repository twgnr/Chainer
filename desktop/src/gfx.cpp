#include "gfx.h"
#include <cstdio>
#include <cwchar>

#pragma comment(lib, "d2d1.lib")
#pragma comment(lib, "dwrite.lib")

std::wstring toW(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    std::wstring out((size_t)n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &out[0], n);
    return out;
}

std::string toU8(const std::wstring& s) {
    if (s.empty()) return "";
    int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0, nullptr, nullptr);
    std::string out((size_t)n, '\0');
    WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), &out[0], n, nullptr, nullptr);
    return out;
}

// ---------------------------------------------------------------------------

static bool familyExists(IDWriteFactory* dw, const wchar_t* name) {
    IDWriteFontCollection* col = nullptr;
    if (FAILED(dw->GetSystemFontCollection(&col, FALSE)) || !col) return false;
    UINT32 idx = 0;
    BOOL found = FALSE;
    col->FindFamilyName(name, &idx, &found);
    col->Release();
    return found == TRUE;
}

void Painter::pickFamilies() {
    // Die Webseite laedt Geist ueber `next/font`. Ist die Schrift lokal
    // installiert, wird sie genommen; sonst die naechstbeste Groteske.
    const wchar_t* sans[] = {L"Geist", L"Inter", L"Segoe UI Variable Text", L"Segoe UI", L"Arial"};
    for (auto* n : sans) {
        if (familyExists(dw_, n)) { sansFamily_ = n; break; }
    }
    const wchar_t* mono[] = {L"Geist Mono", L"JetBrains Mono", L"Cascadia Mono", L"Consolas", L"Courier New"};
    for (auto* n : mono) {
        if (familyExists(dw_, n)) { monoFamily_ = n; break; }
    }
}

bool Painter::init(ID2D1RenderTarget* rt, IDWriteFactory* dw, ID2D1Factory* d2d) {
    rt_ = rt;
    dw_ = dw;
    d2d_ = d2d;
    pickFamilies();
    if (FAILED(rt_->CreateSolidColorBrush(D2D1::ColorF(0, 0, 0, 1), &brush_))) return false;

    float dashes[] = {3.f, 3.f};
    d2d_->CreateStrokeStyle(
        D2D1::StrokeStyleProperties(D2D1_CAP_STYLE_FLAT, D2D1_CAP_STYLE_FLAT, D2D1_CAP_STYLE_FLAT,
                                    D2D1_LINE_JOIN_MITER, 10.f, D2D1_DASH_STYLE_CUSTOM, 0.f),
        dashes, 2, &dashStyle_);
    float dots[] = {0.2f, 2.f};
    d2d_->CreateStrokeStyle(
        D2D1::StrokeStyleProperties(D2D1_CAP_STYLE_ROUND, D2D1_CAP_STYLE_ROUND, D2D1_CAP_STYLE_ROUND,
                                    D2D1_LINE_JOIN_ROUND, 10.f, D2D1_DASH_STYLE_CUSTOM, 0.f),
        dots, 2, &dotStyle_);
    return true;
}

void Painter::shutdown() {
    for (auto& kv : layouts_) if (kv.second) kv.second->Release();
    layouts_.clear();
    for (auto& kv : formats_) if (kv.second) kv.second->Release();
    formats_.clear();
    if (brush_) { brush_->Release(); brush_ = nullptr; }
    if (dashStyle_) { dashStyle_->Release(); dashStyle_ = nullptr; }
    if (dotStyle_) { dotStyle_->Release(); dotStyle_ = nullptr; }
}

void Painter::beginFrame() {
    main_.clear();
    overlay_.clear();
    toOverlay_ = false;
    // Der Layout-Cache wuerde sonst unbegrenzt wachsen.
    if (layouts_.size() > 6000) {
        for (auto& kv : layouts_) if (kv.second) kv.second->Release();
        layouts_.clear();
    }
}

// ---------------------------------------------------------------------------
// Aufzeichnen
// ---------------------------------------------------------------------------
size_t Painter::reserve() {
    cur().push_back(DrawCmd{});
    return cur().size() - 1;
}

void Painter::patchRoundRect(size_t idx, Rect rc, float radius, const Color* fill,
                             const Color* stroke, float sw, Dash d) {
    auto& v = cur();
    if (idx >= v.size()) return;
    DrawCmd& c = v[idx];
    c.kind = CmdKind::RoundRect;
    c.rect = rc;
    c.radius = radius;
    c.strokeW = sw;
    c.dash = d;
    if (fill) { c.fill = *fill; c.hasFill = true; }
    if (stroke) { c.stroke = *stroke; c.hasStroke = true; }
}

void Painter::patchClip(size_t idx, Rect rc) {
    auto& v = cur();
    if (idx >= v.size()) return;
    v[idx].kind = CmdKind::ClipPush;
    v[idx].rect = rc;
}

void Painter::roundRect(Rect rc, float radius, const Color* fill, const Color* stroke, float sw, Dash d) {
    DrawCmd c;
    c.kind = CmdKind::RoundRect;
    c.rect = rc;
    c.radius = radius;
    c.strokeW = sw;
    c.dash = d;
    if (fill) { c.fill = *fill; c.hasFill = true; }
    if (stroke) { c.stroke = *stroke; c.hasStroke = true; }
    cur().push_back(std::move(c));
}

void Painter::ring(Rect rc, float radius, Color col, float w, float offset) {
    Rect o = Rect(rc.x - offset - w * 0.5f, rc.y - offset - w * 0.5f,
                  rc.w + 2 * (offset + w * 0.5f), rc.h + 2 * (offset + w * 0.5f));
    roundRect(o, radius + offset, nullptr, &col, w);
}

void Painter::ellipse(Rect rc, const Color* fill, const Color* stroke, float sw) {
    DrawCmd c;
    c.kind = CmdKind::Ellipse;
    c.rect = rc;
    c.strokeW = sw;
    if (fill) { c.fill = *fill; c.hasFill = true; }
    if (stroke) { c.stroke = *stroke; c.hasStroke = true; }
    cur().push_back(std::move(c));
}

void Painter::line(float x0, float y0, float x1, float y1, Color col, float w, Dash d) {
    DrawCmd c;
    c.kind = CmdKind::Line;
    c.x0 = x0; c.y0 = y0; c.x1 = x1; c.y1 = y1;
    c.stroke = col; c.hasStroke = true; c.strokeW = w; c.dash = d;
    cur().push_back(std::move(c));
}

void Painter::bezier(float x0, float y0, float cx0, float cy0, float cx1, float cy1,
                     float x1, float y1, Color col, float w, Dash d) {
    DrawCmd c;
    c.kind = CmdKind::Bezier;
    c.x0 = x0; c.y0 = y0; c.cx0 = cx0; c.cy0 = cy0;
    c.cx1 = cx1; c.cy1 = cy1; c.x1 = x1; c.y1 = y1;
    c.stroke = col; c.hasStroke = true; c.strokeW = w; c.dash = d;
    cur().push_back(std::move(c));
}

void Painter::text(const std::wstring& s, Rect rc, const Font& f, Color col, Align a, bool wrap) {
    if (s.empty()) return;
    DrawCmd c;
    c.kind = CmdKind::Text;
    c.text = s;
    c.rect = rc;
    c.font = f;
    c.fill = col;
    c.hasFill = true;
    c.align = a;
    c.wrap = wrap;
    cur().push_back(std::move(c));
}

void Painter::clipPush(Rect rc) {
    DrawCmd c;
    c.kind = CmdKind::ClipPush;
    c.rect = rc;
    cur().push_back(std::move(c));
}

size_t Painter::clipPushReserve() {
    DrawCmd c;
    c.kind = CmdKind::ClipPush;
    c.rect = Rect(0, 0, 0, 0);
    cur().push_back(std::move(c));
    return cur().size() - 1;
}

void Painter::clipPop() {
    DrawCmd c;
    c.kind = CmdKind::ClipPop;
    cur().push_back(std::move(c));
}

// ---------------------------------------------------------------------------
// Schrift
// ---------------------------------------------------------------------------
static std::wstring fontKey(const Font& f) {
    wchar_t buf[96];
    swprintf(buf, 96, L"%d|%.2f|%d|%.2f|%d", (int)f.fam, f.size, (int)f.wt, f.lh, f.tracking ? 1 : 0);
    return buf;
}

IDWriteTextFormat* Painter::format(const Font& f) {
    std::wstring key = fontKey(f);
    auto it = formats_.find(key);
    if (it != formats_.end()) return it->second;

    IDWriteTextFormat* fmt = nullptr;
    const std::wstring& fam = (f.fam == Fam::Mono) ? monoFamily_ : sansFamily_;
    HRESULT hr = dw_->CreateTextFormat(fam.c_str(), nullptr, (DWRITE_FONT_WEIGHT)(int)f.wt,
                                       f.italic ? DWRITE_FONT_STYLE_ITALIC : DWRITE_FONT_STYLE_NORMAL,
                                       DWRITE_FONT_STRETCH_NORMAL, f.size, L"en-us", &fmt);
    if (FAILED(hr) || !fmt) return nullptr;
    float lh = f.lh > 0 ? f.lh : tailwindLineHeight(f.size);
    fmt->SetLineSpacing(DWRITE_LINE_SPACING_METHOD_UNIFORM, lh, lh * 0.8f);
    fmt->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
    formats_[key] = fmt;
    return fmt;
}

IDWriteTextLayout* Painter::layout(const std::wstring& s, const Font& f, float maxW) {
    wchar_t head[128];
    swprintf(head, 128, L"%s|%.1f|", fontKey(f).c_str(), maxW);
    std::wstring key = head;
    key += s;
    auto it = layouts_.find(key);
    if (it != layouts_.end()) return it->second;

    IDWriteTextFormat* fmt = format(f);
    if (!fmt) return nullptr;
    IDWriteTextLayout* lay = nullptr;
    float w = maxW > 0 ? maxW : 100000.f;
    if (FAILED(dw_->CreateTextLayout(s.c_str(), (UINT32)s.size(), fmt, w, 100000.f, &lay)) || !lay)
        return nullptr;
    lay->SetWordWrapping(maxW > 0 ? DWRITE_WORD_WRAPPING_WRAP : DWRITE_WORD_WRAPPING_NO_WRAP);
    if (f.tracking) {
        // `tracking-wide` = 0.025em. IDWriteTextLayout1 kann das direkt.
        IDWriteTextLayout1* l1 = nullptr;
        if (SUCCEEDED(lay->QueryInterface(__uuidof(IDWriteTextLayout1), (void**)&l1)) && l1) {
            DWRITE_TEXT_RANGE all{0, (UINT32)s.size()};
            l1->SetCharacterSpacing(0.f, f.size * 0.025f, 0.f, all);
            l1->Release();
        }
    }
    layouts_[key] = lay;
    return lay;
}

float Painter::textWidth(const std::wstring& s, const Font& f) {
    if (s.empty()) return 0.f;
    IDWriteTextLayout* lay = layout(s, f, 0.f);
    if (!lay) return 0.f;
    DWRITE_TEXT_METRICS m{};
    lay->GetMetrics(&m);
    return m.widthIncludingTrailingWhitespace;
}

float Painter::textHeight(const std::wstring& s, const Font& f, float maxW) {
    if (s.empty()) return 0.f;
    IDWriteTextLayout* lay = layout(s, f, maxW);
    if (!lay) return 0.f;
    DWRITE_TEXT_METRICS m{};
    lay->GetMetrics(&m);
    float lh = lineHeight(f);
    return (std::max)(lh, (float)m.lineCount * lh);
}

int Painter::caretIndexAt(const std::wstring& s, const Font& f, float dx) {
    IDWriteTextLayout* lay = layout(s, f, 0.f);
    if (!lay) return 0;
    BOOL trailing = FALSE, inside = FALSE;
    DWRITE_HIT_TEST_METRICS m{};
    lay->HitTestPoint(dx, 4.f, &trailing, &inside, &m);
    int idx = (int)m.textPosition + (trailing ? (int)m.length : 0);
    return (std::max)(0, (std::min)((int)s.size(), idx));
}

float Painter::caretX(const std::wstring& s, const Font& f, int index) {
    if (index <= 0) return 0.f;
    IDWriteTextLayout* lay = layout(s, f, 0.f);
    if (!lay) return 0.f;
    float px = 0, py = 0;
    DWRITE_HIT_TEST_METRICS m{};
    lay->HitTestTextPosition((UINT32)(index - 1), TRUE, &px, &py, &m);
    return px;
}

std::wstring Painter::ellipsize(const std::wstring& s, const Font& f, float maxW) {
    if (maxW <= 0 || textWidth(s, f) <= maxW) return s;
    std::wstring out = s;
    while (!out.empty() && textWidth(out + L"…", f) > maxW) out.pop_back();
    return out + L"…";
}

// ---------------------------------------------------------------------------
// Ausfuehren
// ---------------------------------------------------------------------------
ID2D1SolidColorBrush* Painter::brush(const Color& c) {
    brush_->SetColor(D2D1::ColorF(c.r, c.g, c.b, 1.f));
    brush_->SetOpacity(c.a);
    return brush_;
}

ID2D1StrokeStyle* Painter::strokeStyle(Dash d) {
    if (d == Dash::Dashed) return dashStyle_;
    if (d == Dash::Dotted) return dotStyle_;
    return nullptr;
}

void Painter::exec(const std::vector<DrawCmd>& list) {
    int depth = 0;
    for (const DrawCmd& c : list) {
        switch (c.kind) {
        case CmdKind::None:
            break;
        case CmdKind::ClipPush: {
            Rect r = c.rect;
            if (r.w < 0) r.w = 0;
            if (r.h < 0) r.h = 0;
            rt_->PushAxisAlignedClip(D2D1::RectF(r.x, r.y, r.r(), r.b()), D2D1_ANTIALIAS_MODE_ALIASED);
            depth++;
            break;
        }
        case CmdKind::ClipPop:
            if (depth > 0) { rt_->PopAxisAlignedClip(); depth--; }
            break;
        case CmdKind::RoundRect: {
            D2D1_RECT_F rr = D2D1::RectF(c.rect.x, c.rect.y, c.rect.r(), c.rect.b());
            if (c.hasFill) {
                if (c.radius > 0.f)
                    rt_->FillRoundedRectangle(D2D1::RoundedRect(rr, c.radius, c.radius), brush(c.fill));
                else
                    rt_->FillRectangle(rr, brush(c.fill));
            }
            if (c.hasStroke && c.strokeW > 0.f) {
                float h = c.strokeW * 0.5f;
                D2D1_RECT_F sr = D2D1::RectF(rr.left + h, rr.top + h, rr.right - h, rr.bottom - h);
                if (c.dash == Dash::Double) {
                    // `border-double`: zwei duenne Linien mit Zwischenraum
                    float t = (std::max)(1.f, c.strokeW / 3.f);
                    D2D1_RECT_F o = D2D1::RectF(rr.left + t * .5f, rr.top + t * .5f, rr.right - t * .5f, rr.bottom - t * .5f);
                    D2D1_RECT_F i = D2D1::RectF(rr.left + t * 2.5f, rr.top + t * 2.5f, rr.right - t * 2.5f, rr.bottom - t * 2.5f);
                    if (c.radius > 0.f) {
                        rt_->DrawRoundedRectangle(D2D1::RoundedRect(o, c.radius, c.radius), brush(c.stroke), t);
                        if (i.right > i.left && i.bottom > i.top)
                            rt_->DrawRoundedRectangle(D2D1::RoundedRect(i, c.radius, c.radius), brush(c.stroke), t);
                    } else {
                        rt_->DrawRectangle(o, brush(c.stroke), t);
                        if (i.right > i.left && i.bottom > i.top) rt_->DrawRectangle(i, brush(c.stroke), t);
                    }
                } else if (c.radius > 0.f) {
                    rt_->DrawRoundedRectangle(D2D1::RoundedRect(sr, c.radius, c.radius), brush(c.stroke),
                                              c.strokeW, strokeStyle(c.dash));
                } else {
                    rt_->DrawRectangle(sr, brush(c.stroke), c.strokeW, strokeStyle(c.dash));
                }
            }
            break;
        }
        case CmdKind::Ellipse: {
            D2D1_ELLIPSE e = D2D1::Ellipse(D2D1::Point2F(c.rect.cx(), c.rect.cy()), c.rect.w * .5f, c.rect.h * .5f);
            if (c.hasFill) rt_->FillEllipse(e, brush(c.fill));
            if (c.hasStroke) rt_->DrawEllipse(e, brush(c.stroke), c.strokeW);
            break;
        }
        case CmdKind::Line:
            rt_->DrawLine(D2D1::Point2F(c.x0, c.y0), D2D1::Point2F(c.x1, c.y1), brush(c.stroke),
                          c.strokeW, strokeStyle(c.dash));
            break;
        case CmdKind::Bezier: {
            ID2D1PathGeometry* geo = nullptr;
            if (SUCCEEDED(d2d_->CreatePathGeometry(&geo)) && geo) {
                ID2D1GeometrySink* sink = nullptr;
                if (SUCCEEDED(geo->Open(&sink)) && sink) {
                    sink->BeginFigure(D2D1::Point2F(c.x0, c.y0), D2D1_FIGURE_BEGIN_HOLLOW);
                    sink->AddBezier(D2D1::BezierSegment(D2D1::Point2F(c.cx0, c.cy0),
                                                        D2D1::Point2F(c.cx1, c.cy1),
                                                        D2D1::Point2F(c.x1, c.y1)));
                    sink->EndFigure(D2D1_FIGURE_END_OPEN);
                    sink->Close();
                    sink->Release();
                    rt_->DrawGeometry(geo, brush(c.stroke), c.strokeW, strokeStyle(c.dash));
                }
                geo->Release();
            }
            break;
        }
        case CmdKind::Text: {
            IDWriteTextLayout* lay = layout(c.text, c.font, c.wrap ? c.rect.w : 0.f);
            if (!lay) break;
            float x = c.rect.x;
            if (c.align != Align::Left) {
                DWRITE_TEXT_METRICS m{};
                lay->GetMetrics(&m);
                float tw = c.wrap ? c.rect.w : m.widthIncludingTrailingWhitespace;
                if (c.align == Align::Center) x = c.rect.x + (c.rect.w - tw) * .5f;
                else x = c.rect.r() - tw;
            }
            rt_->DrawTextLayout(D2D1::Point2F(x, c.rect.y), lay, brush(c.fill),
                                D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
            break;
        }
        default:
            break;
        }
    }
    while (depth-- > 0) rt_->PopAxisAlignedClip();
}

void Painter::flush() {
    exec(main_);
    exec(overlay_);
    main_.clear();
    overlay_.clear();
}
