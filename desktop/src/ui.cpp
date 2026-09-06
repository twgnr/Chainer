#include "ui.h"
#include <cmath>

// ---------------------------------------------------------------------------
// Rahmenablauf
// ---------------------------------------------------------------------------
static void drawPopup(Ui& u);

void uiBeginFrame(Ui& u) {
    u.hotId.clear();
    u.cursorHand = false;
    u.cursorText = false;
    u.tipText.clear();
    // Die offene Auswahlliste liegt ueber allem und bekommt den Klick zuerst.
    if (u.popup.open) drawPopup(u);
}

void uiEndFrame(Ui& u) {
    if (!u.tipText.empty()) {
        u.p->overlayBegin();
        Font f = fXs();
        float pad = 6.f;
        float w = (std::min)(360.f, textW(u, u.tipText, f) + 2 * pad);
        float h = textH(u, u.tipText, f, w - 2 * pad) + 2 * pad;
        float x = (std::min)(u.tipAnchor.x, u.viewport.r() - w - 8.f);
        float y = u.tipAnchor.b() + 6.f;
        if (y + h > u.viewport.b()) y = u.tipAnchor.y - h - 6.f;
        Rect r(x, y, w, h);
        Color bg = u.th.mode == Mode::Dark ? Color::hex(0x1e293b) : Color::hex(0x1f2937);
        Color bd = u.th.border;
        u.p->roundRect(r, R_MD, &bg, &bd, 1.f);
        u.p->text(u.tipText, Rect(r.x + pad, r.y + pad, r.w - 2 * pad, r.h), f, Color::hex(0xe6e9ef),
                  Align::Left, true);
        u.p->overlayEnd();
    }
    if (u.in.released) u.activeId.clear();
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
float textW(Ui& u, const std::wstring& s, const Font& f) { return u.p->textWidth(s, f); }
float textH(Ui& u, const std::wstring& s, const Font& f, float maxW) { return u.p->textHeight(s, f, maxW); }
std::wstring truncate(Ui& u, const std::wstring& s, const Font& f, float maxW) {
    return u.p->ellipsize(s, f, maxW);
}

float drawText(Ui& u, float x, float y, const std::wstring& s, const Font& f, Color c) {
    u.p->text(s, Rect(x, y, 100000.f, u.p->lineHeight(f)), f, c);
    return u.p->textWidth(s, f);
}

float drawTextIn(Ui& u, Rect r, const std::wstring& s, const Font& f, Color c, Align a, bool wrap) {
    u.p->text(s, r, f, c, a, wrap);
    return wrap ? u.p->textHeight(s, f, r.w) : u.p->lineHeight(f);
}

// ---------------------------------------------------------------------------
// Mehrfarbige Textstuecke
// ---------------------------------------------------------------------------
float spansWidth(Ui& u, const std::vector<Span>& sp) {
    float w = 0;
    for (const Span& s : sp) w += u.p->textWidth(s.text, s.font);
    return w;
}

static bool spanHit(Ui& u, const Span& s, Rect r, std::wstring& clicked) {
    if (s.link.empty()) return false;
    bool over = u.mouseIn(r);
    if (over) {
        u.cursorHand = true;
        if (s.underlineOnHover) {
            float yb = r.b() - 2.f;
            u.p->line(r.x, yb, r.r(), yb, s.color, 1.f);
        }
        if (u.in.pressed) clicked = s.link;
    }
    return over;
}

std::wstring drawSpansLine(Ui& u, float x, float y, const std::vector<Span>& sp, float boxW, Align a) {
    float total = spansWidth(u, sp);
    float cx = x;
    if (a == Align::Center && boxW > 0) cx = x + (boxW - total) * .5f;
    else if (a == Align::Right && boxW > 0) cx = x + boxW - total;
    std::wstring clicked;
    for (const Span& s : sp) {
        float w = u.p->textWidth(s.text, s.font);
        float lh = u.p->lineHeight(s.font);
        Rect r(cx, y, w, lh);
        u.p->text(s.text, r, s.font, s.color);
        spanHit(u, s, r, clicked);
        cx += w;
    }
    return clicked;
}

// Zerlegt einen Textabschnitt in Woerter und laesst sie umbrechen.
std::wstring drawSpanFlow(Ui& u, float x, float y, float w, const std::vector<Span>& sp,
                          float lineH, float* outH, Align a) {
    struct Word { std::wstring t; const Span* s; float w; bool space; };
    std::vector<Word> words;
    for (const Span& s : sp) {
        size_t i = 0;
        while (i < s.text.size()) {
            size_t j = s.text.find(L' ', i);
            if (j == std::wstring::npos) j = s.text.size();
            if (j > i) {
                Word wd;
                wd.t = s.text.substr(i, j - i);
                wd.s = &s;
                wd.w = u.p->textWidth(wd.t, s.font);
                wd.space = false;
                words.push_back(wd);
            }
            if (j < s.text.size()) {
                Word sp2;
                sp2.t = L" ";
                sp2.s = &s;
                sp2.w = u.p->textWidth(L" ", s.font);
                sp2.space = true;
                words.push_back(sp2);
            }
            i = j + 1;
        }
    }
    // In Zeilen aufteilen
    std::vector<std::vector<const Word*>> lines;
    std::vector<const Word*> line;
    float cw = 0;
    for (const Word& wd : words) {
        if (wd.space && line.empty()) continue;
        if (!wd.space && cw + wd.w > w && !line.empty()) {
            while (!line.empty() && line.back()->space) { cw -= line.back()->w; line.pop_back(); }
            lines.push_back(line);
            line.clear();
            cw = 0;
        }
        line.push_back(&wd);
        cw += wd.w;
    }
    if (!line.empty()) lines.push_back(line);

    std::wstring clicked;
    float cy = y;
    for (auto& ln : lines) {
        float lw = 0;
        for (const Word* wd : ln) lw += wd->w;
        float cx = x;
        if (a == Align::Center) cx = x + (w - lw) * .5f;
        else if (a == Align::Right) cx = x + w - lw;
        for (const Word* wd : ln) {
            Rect r(cx, cy, wd->w, lineH);
            u.p->text(wd->t, r, wd->s->font, wd->s->color);
            // Auch die Leerzeichen innerhalb eines Links sind anklickbar und
            // werden mit unterstrichen - wie ein <a> im Browser.
            spanHit(u, *wd->s, r, clicked);
            cx += wd->w;
        }
        cy += lineH;
    }
    if (outH) *outH = lines.empty() ? 0.f : (float)lines.size() * lineH;
    return clicked;
}

// ---------------------------------------------------------------------------
// Karte
// ---------------------------------------------------------------------------
CardCtx cardBegin(Ui& u, float x, float y, float w, float pad) {
    return cardBegin(u, x, y, w, pad, u.th.border, u.th.panel);
}

CardCtx cardBegin(Ui& u, float x, float y, float w, float pad, Color border, Color fill) {
    CardCtx c;
    c.x = x; c.y = y; c.w = w; c.pad = pad;
    c.border = border; c.fill = fill;
    c.overlay = u.p->inOverlay();
    c.bg = u.p->reserve();
    c.inner = y + pad;
    return c;
}

float cardEnd(Ui& u, CardCtx& c, float contentH) {
    float h = contentH + 2 * c.pad;
    u.p->patchRoundRect(c.bg, Rect(c.x, c.y, c.w, h), R_LG, &c.fill, &c.border, 1.f);
    return h;
}

// ---------------------------------------------------------------------------
// Schaltflaechen
// ---------------------------------------------------------------------------
float btnW(Ui& u, const std::wstring& label) {
    return u.p->textWidth(label, fSm(Wt::Medium)) + 2 * BTN_PADX;
}

bool btn(Ui& u, const std::wstring& id, Rect r, const std::wstring& label, Btn kind, bool disabled) {
    bool over = !disabled && u.mouseIn(r);
    bool clicked = false;
    if (over) {
        u.hotId = id;
        u.cursorHand = true;
        if (u.in.pressed) u.activeId = id;
        if (u.in.released && u.activeId == id) clicked = true;
    }
    float op = disabled ? 0.5f : 1.f;
    if (kind == Btn::Primary) {
        Color bg = u.th.accent;
        if (over && !disabled) bg = bg.brightness(1.1f);
        bg = bg.op(op);
        u.p->roundRect(r, R_MD, &bg, nullptr);
        Color fg = Color::hex(0x000000, op);
        u.p->text(label, Rect(r.x, r.y + (r.h - 20.f) * .5f, r.w, 20.f), fSm(Wt::Medium), fg, Align::Center);
    } else {
        Color bd = u.th.border.op(op);
        if (over && !disabled) {
            Color hv = u.th.hover;
            u.p->roundRect(r, R_MD, &hv, &bd, 1.f);
        } else {
            u.p->roundRect(r, R_MD, nullptr, &bd, 1.f);
        }
        Color fg = u.th.foreground.op(op);
        u.p->text(label, Rect(r.x, r.y + (r.h - 20.f) * .5f, r.w, 20.f), fSm(), fg, Align::Center);
    }
    return clicked;
}

bool link(Ui& u, const std::wstring& id, Rect r, const std::wstring& label, const Font& f, Color c,
          Align a, bool underline) {
    bool over = u.mouseIn(r);
    bool clicked = false;
    if (over) {
        u.hotId = id;
        u.cursorHand = true;
        if (u.in.pressed) u.activeId = id;
        if (u.in.released && u.activeId == id) clicked = true;
    }
    u.p->text(label, r, f, c, a);
    if (over && underline) {
        float w = u.p->textWidth(label, f);
        float x = r.x;
        if (a == Align::Center) x = r.x + (r.w - w) * .5f;
        else if (a == Align::Right) x = r.r() - w;
        float yb = r.y + u.p->lineHeight(f) - 2.f;
        u.p->line(x, yb, x + w, yb, c, 1.f);
    }
    return clicked;
}

// ---------------------------------------------------------------------------
// Textfeld
// ---------------------------------------------------------------------------
static void clampCaret(Ui& u, const std::wstring& v) {
    if (u.caret < 0) u.caret = 0;
    if (u.caret > (int)v.size()) u.caret = (int)v.size();
}

// Gemeinsame Tastenbehandlung fuer ein- und mehrzeilige Felder.
static bool editKeys(Ui& u, std::wstring& v, bool multiline) {
    bool changed = false;
    clampCaret(u, v);
    for (UINT k : u.in.keys) {
        switch (k) {
        case VK_LEFT:  if (u.caret > 0) u.caret--; break;
        case VK_RIGHT: if (u.caret < (int)v.size()) u.caret++; break;
        case VK_HOME:  u.caret = 0; break;
        case VK_END:   u.caret = (int)v.size(); break;
        case VK_DELETE:
            if (u.caret < (int)v.size()) { v.erase((size_t)u.caret, 1); changed = true; }
            break;
        case VK_UP:
        case VK_DOWN:
            if (multiline) {
                // Zeilenweise bewegen
                int line = 0, col = 0;
                for (int i = 0; i < u.caret; i++) {
                    if (v[(size_t)i] == L'\n') { line++; col = 0; } else col++;
                }
                int target = (k == VK_UP) ? line - 1 : line + 1;
                if (target >= 0) {
                    int cur = 0, pos = 0, c2 = 0;
                    int best = -1;
                    for (int i = 0; i <= (int)v.size(); i++) {
                        if (cur == target && (c2 == col || i == (int)v.size() || v[(size_t)i] == L'\n')) {
                            best = i;
                            if (c2 == col) break;
                        }
                        if (i < (int)v.size() && v[(size_t)i] == L'\n') { cur++; c2 = 0; } else c2++;
                        pos = i;
                    }
                    (void)pos;
                    if (best >= 0) u.caret = best;
                }
            }
            break;
        default: break;
        }
    }
    for (wchar_t ch : u.in.chars) {
        if (ch == 8) {  // Backspace
            if (u.caret > 0) { v.erase((size_t)u.caret - 1, 1); u.caret--; changed = true; }
        } else if (ch == 13 || ch == 10) {
            if (multiline) { v.insert((size_t)u.caret, 1, L'\n'); u.caret++; changed = true; }
        } else if (ch == 1) {  // Ctrl+A
            u.caret = (int)v.size();
        } else if (ch >= 32) {
            v.insert((size_t)u.caret, 1, ch);
            u.caret++;
            changed = true;
        }
    }
    clampCaret(u, v);
    return changed;
}

bool inputBox(Ui& u, const std::wstring& id, Rect r, std::wstring& value,
              const std::wstring& placeholder, bool mono, float fontSize, bool password) {
    bool over = u.mouseIn(r);
    bool focused = (u.focusId == id);
    if (over) {
        u.cursorText = true;
        if (u.in.pressed) {
            if (!focused) { u.focusId = id; focused = true; }
            u.caret = u.p->caretIndexAt(value, Font(mono ? Fam::Mono : Fam::Sans, fontSize),
                                        u.in.mx - (r.x + INPUT_PADX));
        }
    } else if (u.in.pressed && focused) {
        u.focusId.clear();
        focused = false;
    }

    Color bd = focused ? u.th.accent : u.th.border;
    Color bg = u.th.background;
    u.p->roundRect(r, R_MD, &bg, &bd, 1.f);

    Font f(mono ? Fam::Mono : Fam::Sans, fontSize);
    float lh = u.p->lineHeight(f);
    float ty = r.y + (r.h - lh) * .5f;
    u.p->clipPush(Rect(r.x + 2, r.y, r.w - 4, r.h));
    std::wstring shown = password ? std::wstring(value.size(), L'•') : value;
    if (shown.empty() && !placeholder.empty() && !focused) {
        u.p->text(placeholder, Rect(r.x + INPUT_PADX, ty, r.w, lh), f, u.th.subtle);
    } else {
        u.p->text(shown, Rect(r.x + INPUT_PADX, ty, r.w, lh), f, u.th.foreground);
    }
    bool changed = false;
    if (focused) {
        changed = editKeys(u, value, false);
        if (password) shown = std::wstring(value.size(), L'•');
        // Cursor blinkt
        if (fmod(u.time, 1.0) < 0.55) {
            float cx = r.x + INPUT_PADX + u.p->caretX(password ? std::wstring(value.size(), L'•') : value,
                                                      f, u.caret);
            u.p->line(cx, ty + 1, cx, ty + lh - 1, u.th.foreground, 1.f);
        }
        u.redraw = true;
    }
    u.p->clipPop();
    return changed;
}

bool textArea(Ui& u, const std::wstring& id, Rect r, std::wstring& value,
              const std::wstring& placeholder, bool mono, float fontSize) {
    bool over = u.mouseIn(r);
    bool focused = (u.focusId == id);
    if (over) {
        u.cursorText = true;
        if (u.in.pressed) { u.focusId = id; focused = true; u.caret = (int)value.size(); }
    } else if (u.in.pressed && focused) {
        u.focusId.clear();
        focused = false;
    }
    Color bd = focused ? u.th.accent : u.th.border;
    Color bg = u.th.background;
    u.p->roundRect(r, R_MD, &bg, &bd, 1.f);

    Font f(mono ? Fam::Mono : Fam::Sans, fontSize);
    float lh = u.p->lineHeight(f);
    u.p->clipPush(r.inset(1.f));
    float ty = r.y + 8.f;
    if (value.empty() && !placeholder.empty() && !focused) {
        u.p->text(placeholder, Rect(r.x + INPUT_PADX, ty, r.w - 2 * INPUT_PADX, lh), f, u.th.subtle);
    }
    // Zeilenweise ausgeben
    size_t start = 0;
    int lineIdx = 0;
    float caretX = -1, caretY = -1;
    int consumed = 0;
    while (start <= value.size()) {
        size_t nl = value.find(L'\n', start);
        std::wstring lineStr = value.substr(start, (nl == std::wstring::npos ? value.size() : nl) - start);
        float y = ty + lineIdx * lh;
        if (y < r.b() - 2) u.p->text(lineStr, Rect(r.x + INPUT_PADX, y, r.w - 2 * INPUT_PADX, lh), f, u.th.foreground);
        if (focused && u.caret >= consumed && u.caret <= consumed + (int)lineStr.size()) {
            caretX = r.x + INPUT_PADX + u.p->caretX(lineStr, f, u.caret - consumed);
            caretY = y;
        }
        consumed += (int)lineStr.size() + 1;
        lineIdx++;
        if (nl == std::wstring::npos) break;
        start = nl + 1;
    }
    bool changed = false;
    if (focused) {
        changed = editKeys(u, value, true);
        if (caretX >= 0 && fmod(u.time, 1.0) < 0.55)
            u.p->line(caretX, caretY + 1, caretX, caretY + lh - 1, u.th.foreground, 1.f);
        u.redraw = true;
    }
    u.p->clipPop();
    return changed;
}

// ---------------------------------------------------------------------------
// Auswahlliste
// ---------------------------------------------------------------------------
static void drawPopup(Ui& u) {
    Popup& p = u.popup;
    u.p->overlayBegin();
    Font f = fSm();
    float itemH = 26.f;
    float w = (std::max)(p.anchor.w, 120.f);
    for (const std::wstring& o : p.options) w = (std::max)(w, u.p->textWidth(o, f) + 40.f);
    float maxH = (std::min)(360.f, u.viewport.h - 24.f);
    float h = (std::min)(maxH, p.options.size() * itemH + 8.f);
    float x = (std::min)(p.anchor.x, u.viewport.r() - w - 8.f);
    float y = p.anchor.b() + 2.f;
    if (y + h > u.viewport.b() - 4.f) y = (std::max)(4.f, p.anchor.y - h - 2.f);
    Rect box(x, y, w, h);

    Color bg = u.th.panel;
    Color bd = u.th.border;
    u.p->roundRect(box, R_MD, &bg, &bd, 1.f);
    u.p->clipPush(box.inset(1.f));
    float cy = y + 4.f - p.scroll;
    for (size_t i = 0; i < p.options.size(); i++) {
        Rect item(x + 1, cy, w - 2, itemH);
        bool over = item.hit(u.in.mx, u.in.my) && box.hit(u.in.mx, u.in.my);
        if (over) {
            Color hv = u.th.hover;
            u.p->rect(item, hv);
            u.cursorHand = true;
        }
        if ((int)i == p.selected) {
            Color acc = u.th.accent.op(0.18f);
            u.p->rect(item, acc);
        }
        u.p->text(p.options[i], Rect(item.x + 10.f, item.y + (itemH - 20.f) * .5f, item.w - 20.f, 20.f), f,
                  u.th.foreground);
        if (over && u.in.pressed) {
            u.popupResultId = p.id;
            u.popupResultIndex = (int)i;
            p.open = false;
        }
        cy += itemH;
    }
    u.p->clipPop();
    u.p->overlayEnd();

    if (box.hit(u.in.mx, u.in.my) && u.in.wheel != 0.f) {
        p.scroll -= u.in.wheel;
        float maxScroll = (std::max)(0.f, p.options.size() * itemH + 8.f - h);
        p.scroll = (std::max)(0.f, (std::min)(maxScroll, p.scroll));
        u.in.wheel = 0.f;
    }
    // Klick daneben oder Esc schliesst
    if (p.open && u.in.pressed && !box.hit(u.in.mx, u.in.my)) p.open = false;
    if (p.open && u.keyDown(VK_ESCAPE)) p.open = false;
    // Der Klick ist verbraucht, damit er nicht auch die Seite darunter trifft.
    if (u.in.pressed) {
        u.in.pressed = false;
        u.in.down = false;
    }
    u.in.keys.clear();
}

bool selectBox(Ui& u, const std::wstring& id, Rect r, const std::vector<std::wstring>& options,
               int& index, float fontSize) {
    bool changed = false;
    if (u.popupResultId == id) {
        if (u.popupResultIndex >= 0 && u.popupResultIndex < (int)options.size() && index != u.popupResultIndex) {
            index = u.popupResultIndex;
            changed = true;
        }
        u.popupResultId.clear();
        u.popupResultIndex = -1;
    }
    bool over = u.mouseIn(r);
    bool open = u.popup.open && u.popup.id == id;
    if (over) {
        u.cursorHand = true;
        if (u.in.pressed) {
            u.popup.open = !open;
            u.popup.id = id;
            u.popup.anchor = r;
            u.popup.options = options;
            u.popup.selected = index;
            u.popup.scroll = 0.f;
        }
    }
    Color bd = open ? u.th.accent : u.th.border;
    Color bg = u.th.background;
    u.p->roundRect(r, R_MD, &bg, &bd, 1.f);
    Font f(Fam::Sans, fontSize);
    float lh = u.p->lineHeight(f);
    std::wstring label = (index >= 0 && index < (int)options.size()) ? options[(size_t)index] : L"";
    u.p->clipPush(Rect(r.x + 1, r.y, r.w - 26.f, r.h));
    u.p->text(label, Rect(r.x + INPUT_PADX, r.y + (r.h - lh) * .5f, r.w, lh), f, u.th.foreground);
    u.p->clipPop();
    // Pfeil
    float ax = r.r() - 14.f, ay = r.cy() - 1.f;
    u.p->line(ax - 4, ay - 2, ax, ay + 2, u.th.muted, 1.4f);
    u.p->line(ax, ay + 2, ax + 4, ay - 2, u.th.muted, 1.4f);
    return changed;
}

// ---------------------------------------------------------------------------
// Ankreuzfeld
// ---------------------------------------------------------------------------
float checkboxW(Ui& u, const std::wstring& label, const Font& f) {
    return 13.f + (label.empty() ? 0.f : 4.f + u.p->textWidth(label, f));
}

bool checkbox(Ui& u, const std::wstring& id, float x, float y, float lineH, bool& value,
              const std::wstring& label, const Font& f, Color c, bool disabled) {
    float boxSize = 13.f;
    Rect box(x, y + (lineH - boxSize) * .5f, boxSize, boxSize);
    Rect all(x, y, checkboxW(u, label, f), lineH);
    bool over = !disabled && u.mouseIn(all);
    bool clicked = false;
    if (over) {
        u.cursorHand = true;
        if (u.in.pressed) { value = !value; clicked = true; }
    }
    float op = disabled ? 0.45f : 1.f;
    if (value) {
        Color acc = u.th.accent.op(op);
        u.p->roundRect(box, 2.f, &acc, nullptr);
        // Haken
        Color k = Color::hex(0x000000, op);
        u.p->line(box.x + 2.5f, box.y + 6.5f, box.x + 5.f, box.y + 9.5f, k, 1.8f);
        u.p->line(box.x + 5.f, box.y + 9.5f, box.x + 10.5f, box.y + 3.5f, k, 1.8f);
    } else {
        // Wie ein Ankreuzfeld des Browsers bei `color-scheme: dark/light`:
        // gefuellt in der Seitenfarbe mit deutlich sichtbarem Rand.
        Color bg = u.th.background.op(op);
        Color bd = u.th.muted.op(op * 0.9f);
        u.p->roundRect(box, 2.f, &bg, &bd, 1.f);
    }
    if (!label.empty()) {
        float lh = u.p->lineHeight(f);
        u.p->text(label, Rect(x + boxSize + 4.f, y + (lineH - lh) * .5f, 100000.f, lh), f, c.op(op));
    }
    return clicked;
}

// ---------------------------------------------------------------------------
// Kleinteile
// ---------------------------------------------------------------------------
void fieldLabel(Ui& u, float x, float y, const std::wstring& s) {
    std::wstring up;
    for (wchar_t ch : s) up += (wchar_t)towupper(ch);
    Font f = fXs();
    f.tracking = true;
    u.p->text(up, Rect(x, y, 100000.f, 16.f), f, u.th.muted);
}

float badgeW(Ui& u, const std::wstring& s, const Font& f, float padX) {
    return u.p->textWidth(s, f) + 2 * padX;
}

void badge(Ui& u, Rect r, const std::wstring& s, Color bg, Color fg, const Font& f, float radius) {
    u.p->roundRect(r, radius, &bg, nullptr);
    float lh = u.p->lineHeight(f);
    u.p->text(s, Rect(r.x, r.y + (r.h - lh) * .5f, r.w, lh), f, fg, Align::Center);
}

void hline(Ui& u, float x, float y, float w, Color c) {
    u.p->rect(Rect(x, y, w, 1.f), c);
}

void tooltip(Ui& u, Rect anchor, const std::wstring& text) {
    if (text.empty()) return;
    if (u.mouseIn(anchor)) {
        u.tipText = text;
        u.tipAnchor = anchor;
    }
}

// ---------------------------------------------------------------------------
// Reihe mit Umbruch
// ---------------------------------------------------------------------------
Rect Row::place(float iw, float ih) {
    if (!firstInLine && cx + gx + iw > rightEdge + 0.5f) newline();
    if (!firstInLine) cx += gx;
    firstInLine = false;
    Rect r(cx, cy + (lineH - ih) * .5f, iw, ih);
    cx += iw;
    return r;
}

Rect Row::placeRight(float iw, float ih) {
    float x = rightEdge - iw;
    if (x < cx + (firstInLine ? 0.f : gx)) {
        newline();
        x = rightEdge - iw;
    }
    Rect r(x, cy + (lineH - ih) * .5f, iw, ih);
    cx = rightEdge;
    firstInLine = false;
    return r;
}

void Row::newline() {
    cy += lineH + gy;
    cx = x0;
    firstInLine = true;
}
