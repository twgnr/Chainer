// ---------------------------------------------------------------------------
// theme.h - Die Farbtoken aus `src/app/globals.css`.
//
// Hell- und Dunkelmodus haben dieselben Namen; `Theme::of()` liefert je nach
// Modus den passenden Wert. Zusaetzlich stehen die Stufen der Tailwind-Palette
// bereit, die die Webseite benutzt - inklusive der Umkehrung, die globals.css
// im Hellmodus vornimmt (helle Stufen werden dort zu dunklen Schriftfarben).
// ---------------------------------------------------------------------------
#pragma once
#include "gfx.h"

enum class Mode { Light, Dark };
enum class ThemeChoice { Light, Dark, System };  // wie THEMES in src/lib/theme.ts

// Namen der Tailwind-Stufen, die in der Anwendung vorkommen.
enum class Tw {
    Red100, Red200, Red300, Red400, Red500, Red600, Red700, Red800, Red950,
    Orange100, Orange200, Orange300, Orange400, Orange500, Orange600, Orange700, Orange950,
    Amber300, Amber400, Amber600, Amber700,
    Yellow300, Yellow400, Yellow500, Yellow700, Yellow950,
    Lime400,
    Green200, Green300, Green400, Green500, Green600, Green700,
    Emerald300, Emerald400, Emerald600, Emerald700,
    Teal200, Teal300, Teal600, Teal700,
    Cyan200, Cyan300, Cyan400, Cyan700,
    Sky300,
    Blue300, Blue400, Blue500, Blue600, Blue700,
    Indigo300, Indigo500, Indigo600, Indigo700,
    Violet300, Purple300, Purple600, Purple700, Fuchsia400,
    Pink300, Pink600, Rose300, Rose400, Rose700,
    Gray600, Gray700, Slate700,
    White, Black,
};

struct Theme {
    Mode mode = Mode::Dark;

    Color background, foreground, panel, border, accent, brand, fg2, muted, subtle, hover;

    static Theme make(Mode m);
    // Tailwind-Stufe unter Beruecksichtigung der Hellmodus-Umkehrung.
    Color tw(Tw c) const;
    // Farbe mit Alpha ueber den Seitenhintergrund gelegt (fuer `bg-red-950/40`).
    Color onBg(Color c) const { return c.over(background); }
    Color onPanel(Color c) const { return c.over(panel); }
};
