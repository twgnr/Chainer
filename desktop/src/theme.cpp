#include "theme.h"

Theme Theme::make(Mode m) {
    Theme t;
    t.mode = m;
    if (m == Mode::Dark) {
        t.background = Color::hex(0x0b0f17);
        t.foreground = Color::hex(0xe6e9ef);
        t.panel      = Color::hex(0x121826);
        t.border     = Color::hex(0x243044);
        t.accent     = Color::hex(0xf7931a);
        t.brand      = Color::hex(0xf7931a);
        t.fg2        = Color::hex(0xcbd5e1);
        t.muted      = Color::hex(0x94a3b8);
        t.subtle     = Color::hex(0x64748b);
        t.hover      = Color(1.f, 1.f, 1.f, 0.06f);
    } else {
        t.background = Color::hex(0xf5f6f8);
        t.foreground = Color::hex(0x0f172a);
        t.panel      = Color::hex(0xffffff);
        t.border     = Color::hex(0xd7dde7);
        t.accent     = Color::hex(0xf7931a);
        t.brand      = Color::hex(0x92500a);
        t.fg2        = Color::hex(0x334155);
        t.muted      = Color::hex(0x4b5563);
        t.subtle     = Color::hex(0x6b7280);
        t.hover      = Color(15 / 255.f, 23 / 255.f, 42 / 255.f, 0.06f);
    }
    return t;
}

static unsigned twHex(Tw c) {
    switch (c) {
    case Tw::Red100: return 0xfee2e2; case Tw::Red200: return 0xfecaca;
    case Tw::Red300: return 0xfca5a5; case Tw::Red400: return 0xf87171;
    case Tw::Red500: return 0xef4444; case Tw::Red600: return 0xdc2626;
    case Tw::Red700: return 0xb91c1c; case Tw::Red800: return 0x991b1b;
    case Tw::Red950: return 0x450a0a;
    case Tw::Orange100: return 0xffedd5; case Tw::Orange200: return 0xfed7aa;
    case Tw::Orange300: return 0xfdba74; case Tw::Orange400: return 0xfb923c;
    case Tw::Orange500: return 0xf97316; case Tw::Orange600: return 0xea580c;
    case Tw::Orange700: return 0xc2410c; case Tw::Orange950: return 0x431407;
    case Tw::Amber300: return 0xfcd34d; case Tw::Amber400: return 0xfbbf24;
    case Tw::Amber600: return 0xd97706; case Tw::Amber700: return 0xb45309;
    case Tw::Yellow300: return 0xfde047; case Tw::Yellow400: return 0xfacc15;
    case Tw::Yellow500: return 0xeab308; case Tw::Yellow700: return 0xa16207;
    case Tw::Yellow950: return 0x422006;
    case Tw::Lime400: return 0xa3e635;
    case Tw::Green200: return 0xbbf7d0; case Tw::Green300: return 0x86efac;
    case Tw::Green400: return 0x4ade80; case Tw::Green500: return 0x22c55e;
    case Tw::Green600: return 0x16a34a; case Tw::Green700: return 0x15803d;
    case Tw::Emerald300: return 0x6ee7b7; case Tw::Emerald400: return 0x34d399;
    case Tw::Emerald600: return 0x059669; case Tw::Emerald700: return 0x047857;
    case Tw::Teal200: return 0x99f6e4; case Tw::Teal300: return 0x5eead4;
    case Tw::Teal600: return 0x0d9488; case Tw::Teal700: return 0x0f766e;
    case Tw::Cyan200: return 0xa5f3fc; case Tw::Cyan300: return 0x67e8f9;
    case Tw::Cyan400: return 0x22d3ee; case Tw::Cyan700: return 0x0e7490;
    case Tw::Sky300: return 0x7dd3fc;
    case Tw::Blue300: return 0x93c5fd; case Tw::Blue400: return 0x60a5fa;
    case Tw::Blue500: return 0x3b82f6; case Tw::Blue600: return 0x2563eb;
    case Tw::Blue700: return 0x1d4ed8;
    case Tw::Indigo300: return 0xa5b4fc; case Tw::Indigo500: return 0x6366f1;
    case Tw::Indigo600: return 0x4f46e5; case Tw::Indigo700: return 0x4338ca;
    case Tw::Violet300: return 0xc4b5fd;
    case Tw::Purple300: return 0xd8b4fe; case Tw::Purple600: return 0x9333ea;
    case Tw::Purple700: return 0x7e22ce; case Tw::Fuchsia400: return 0xe879f9;
    case Tw::Pink300: return 0xf9a8d4; case Tw::Pink600: return 0xdb2777;
    case Tw::Rose300: return 0xfda4af; case Tw::Rose400: return 0xfb7185;
    case Tw::Rose700: return 0xbe123c;
    case Tw::Gray600: return 0x4b5563; case Tw::Gray700: return 0x374151;
    case Tw::Slate700: return 0x334155;
    case Tw::White: return 0xffffff; case Tw::Black: return 0x000000;
    }
    return 0x808080;
}

Color Theme::tw(Tw c) const {
    Tw eff = c;
    if (mode == Mode::Light) {
        switch (c) {
        case Tw::Red200: eff = Tw::Red800; break;
        case Tw::Red300: eff = Tw::Red700; break;
        case Tw::Red400: eff = Tw::Red700; break;
        case Tw::Rose300: eff = Tw::Rose700; break;
        case Tw::Orange200: eff = Tw::Orange700; break;
        case Tw::Orange300: eff = Tw::Orange700; break;
        case Tw::Orange400: eff = Tw::Orange700; break;
        case Tw::Amber300: eff = Tw::Amber700; break;
        case Tw::Amber400: eff = Tw::Amber700; break;
        case Tw::Yellow300: eff = Tw::Yellow700; break;
        case Tw::Yellow400: eff = Tw::Yellow700; break;
        case Tw::Lime400: eff = Tw::Yellow700; break;
        case Tw::Green200: eff = Tw::Green700; break;
        case Tw::Green300: eff = Tw::Green700; break;
        case Tw::Green400: eff = Tw::Green700; break;
        case Tw::Emerald300: eff = Tw::Emerald700; break;
        case Tw::Emerald400: eff = Tw::Emerald700; break;
        case Tw::Teal200: eff = Tw::Teal700; break;
        case Tw::Teal300: eff = Tw::Teal700; break;
        case Tw::Cyan200: eff = Tw::Cyan700; break;
        case Tw::Cyan300: eff = Tw::Cyan700; break;
        case Tw::Cyan400: eff = Tw::Cyan700; break;
        case Tw::Sky300: eff = Tw::Cyan700; break;
        case Tw::Blue300: eff = Tw::Blue700; break;
        case Tw::Blue400: eff = Tw::Blue600; break;
        case Tw::Indigo300: eff = Tw::Indigo700; break;
        case Tw::Violet300: eff = Tw::Purple700; break;
        case Tw::Purple300: eff = Tw::Purple700; break;
        case Tw::Pink300: eff = Tw::Pink600; break;
        case Tw::Red950: eff = Tw::Red100; break;
        case Tw::Orange950: eff = Tw::Orange100; break;
        case Tw::Yellow950: return Color::hex(0xfef9c3);  // yellow-100
        default: break;
        }
    }
    return Color::hex(twHex(eff));
}
