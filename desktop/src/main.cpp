// ---------------------------------------------------------------------------
// main.cpp - Fenster, Direct2D und Nachrichtenschleife.
//
// Reines Win32 mit Direct2D/DirectWrite aus dem Windows-SDK; keine weiteren
// Bibliotheken. Gezeichnet wird in DIPs, damit eine Einheit genau einem
// CSS-Pixel der Webseite entspricht - auch auf Bildschirmen mit Skalierung.
// ---------------------------------------------------------------------------
#define WINVER 0x0A00
#define _WIN32_WINNT 0x0A00
#include "app.h"
#include "store.h"
#include "net.h"
#include <d2d1.h>
#include <dwrite.h>
#include <dwmapi.h>
#include <windowsx.h>

#pragma comment(lib, "d2d1.lib")
#pragma comment(lib, "dwrite.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "ole32.lib")

void appFrame(App& a, float viewW, float viewH);

static ID2D1Factory* g_d2d = nullptr;
static IDWriteFactory* g_dw = nullptr;
static ID2D1HwndRenderTarget* g_rt = nullptr;
static Painter g_painter;
static HWND g_hwnd = nullptr;
static float g_dpi = 96.f;
static bool g_dirty = true;
static Mode g_lastMode = Mode::Dark;

// ---------------------------------------------------------------------------
static void applyTitleBar(HWND hwnd, Mode m) {
    BOOL dark = (m == Mode::Dark) ? TRUE : FALSE;
    // DWMWA_USE_IMMERSIVE_DARK_MODE = 20 (ab Windows 10 2004)
    DwmSetWindowAttribute(hwnd, 20, &dark, sizeof(dark));
}

static bool createTarget() {
    if (g_rt) return true;
    RECT rc;
    GetClientRect(g_hwnd, &rc);
    D2D1_SIZE_U size = D2D1::SizeU((UINT32)(rc.right - rc.left), (UINT32)(rc.bottom - rc.top));
    if (size.width == 0 || size.height == 0) return false;

    D2D1_RENDER_TARGET_PROPERTIES props = D2D1::RenderTargetProperties(
        D2D1_RENDER_TARGET_TYPE_DEFAULT,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_IGNORE), g_dpi, g_dpi);
    HRESULT hr = g_d2d->CreateHwndRenderTarget(
        props, D2D1::HwndRenderTargetProperties(g_hwnd, size, D2D1_PRESENT_OPTIONS_NONE), &g_rt);
    if (FAILED(hr)) return false;
    // Graustufen-Kantenglaettung wie im Browser
    g_rt->SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE);
    g_painter.setTarget(g_rt);
    return true;
}

static void discardTarget() {
    g_painter.shutdown();
    if (g_rt) { g_rt->Release(); g_rt = nullptr; }
}

static void render() {
    if (!createTarget()) return;
    D2D1_SIZE_F size = g_rt->GetSize();   // in DIPs

    App& a = g_app;
    a.ui.p = &g_painter;
    a.ui.time = (double)GetTickCount64() / 1000.0;
    a.ui.redraw = false;

    if (a.mode() != g_lastMode) {
        g_lastMode = a.mode();
        applyTitleBar(g_hwnd, g_lastMode);
    }

    g_painter.beginFrame();
    g_rt->BeginDraw();
    g_rt->Clear(D2D1::ColorF(0, 0, 0, 1));
    appFrame(a, size.width, size.height);
    g_painter.flush();
    HRESULT hr = g_rt->EndDraw();
    if (hr == D2DERR_RECREATE_TARGET) discardTarget();

    // Zustand fuer das naechste Bild zuruecksetzen
    a.ui.in.pressed = false;
    a.ui.in.released = false;
    a.ui.in.rightPressed = false;
    a.ui.in.doubleClick = false;
    a.ui.in.wheel = 0.f;
    a.ui.in.chars.clear();
    a.ui.in.keys.clear();
    if (a.ui.redraw) g_dirty = true;
}

// ---------------------------------------------------------------------------
static float toDipX(LPARAM lp) { return (float)GET_X_LPARAM(lp) * 96.f / g_dpi; }
static float toDipY(LPARAM lp) { return (float)GET_Y_LPARAM(lp) * 96.f / g_dpi; }

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    Input& in = g_app.ui.in;
    switch (msg) {
    case WM_CREATE:
        g_dpi = (float)GetDpiForWindow(hwnd);
        return 0;

    case WM_SIZE:
        if (g_rt) {
            RECT rc;
            GetClientRect(hwnd, &rc);
            g_rt->Resize(D2D1::SizeU((UINT32)(rc.right - rc.left), (UINT32)(rc.bottom - rc.top)));
        }
        g_dirty = true;
        return 0;

    case WM_DPICHANGED: {
        g_dpi = (float)LOWORD(wp);
        RECT* r = (RECT*)lp;
        SetWindowPos(hwnd, nullptr, r->left, r->top, r->right - r->left, r->bottom - r->top,
                     SWP_NOZORDER | SWP_NOACTIVATE);
        discardTarget();
        g_dirty = true;
        return 0;
    }

    case WM_SETTINGCHANGE:
        // Hell-/Dunkelmodus des Systems kann sich geaendert haben.
        g_dirty = true;
        return 0;

    case WM_MOUSEMOVE:
        in.mx = toDipX(lp);
        in.my = toDipY(lp);
        g_dirty = true;
        return 0;

    case WM_MOUSELEAVE:
        in.mx = in.my = -1000.f;
        g_dirty = true;
        return 0;

    case WM_LBUTTONDOWN:
        SetCapture(hwnd);
        SetFocus(hwnd);
        in.shift = (GetKeyState(VK_SHIFT) & 0x8000) != 0;
        in.mx = toDipX(lp);
        in.my = toDipY(lp);
        in.down = true;
        in.pressed = true;
        g_dirty = true;
        return 0;

    case WM_LBUTTONDBLCLK:
        SetCapture(hwnd);
        in.mx = toDipX(lp);
        in.my = toDipY(lp);
        in.doubleClick = true;
        in.pressed = true;
        in.down = true;
        g_dirty = true;
        return 0;

    case WM_LBUTTONUP:
        ReleaseCapture();
        in.mx = toDipX(lp);
        in.my = toDipY(lp);
        in.down = false;
        in.released = true;
        g_dirty = true;
        return 0;

    case WM_MOUSEWHEEL: {
        // Wie im Browser: rund 100 CSS-Pixel je Rastung
        int delta = GET_WHEEL_DELTA_WPARAM(wp);
        in.wheel += (float)delta / (float)WHEEL_DELTA * 100.f;
        POINT pt{GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
        ScreenToClient(hwnd, &pt);
        in.mx = (float)pt.x * 96.f / g_dpi;
        in.my = (float)pt.y * 96.f / g_dpi;
        g_dirty = true;
        return 0;
    }

    case WM_CHAR:
        in.chars += (wchar_t)wp;
        g_dirty = true;
        return 0;

    case WM_KEYDOWN:
        in.keys.push_back((UINT)wp);
        in.shift = (GetKeyState(VK_SHIFT) & 0x8000) != 0;
        in.ctrl = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
        g_dirty = true;
        return 0;

    case WM_SETCURSOR:
        if (LOWORD(lp) == HTCLIENT) {
            if (g_app.ui.cursorHand) SetCursor(LoadCursor(nullptr, IDC_HAND));
            else if (g_app.ui.cursorText) SetCursor(LoadCursor(nullptr, IDC_IBEAM));
            else SetCursor(LoadCursor(nullptr, IDC_ARROW));
            return TRUE;
        }
        break;

    case WM_APP + 1:        // ein Hintergrundauftrag ist fertig
        g_dirty = true;
        return 0;

    case WM_PAINT: {
        PAINTSTRUCT ps;
        BeginPaint(hwnd, &ps);
        EndPaint(hwnd, &ps);
        g_dirty = true;
        return 0;
    }

    case WM_ERASEBKGND:
        return 1;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProc(hwnd, msg, wp, lp);
}

// ---------------------------------------------------------------------------
int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, PWSTR, int nCmdShow) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    if (FAILED(D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &g_d2d))) return 1;
    if (FAILED(DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory),
                                   (IUnknown**)&g_dw)))
        return 1;

    // Programmsymbol aus den Ressourcen (siehe version.rc)
    HICON iconBig = (HICON)LoadImageW(hInst, MAKEINTRESOURCEW(1), IMAGE_ICON,
                                      GetSystemMetrics(SM_CXICON), GetSystemMetrics(SM_CYICON), 0);
    HICON iconSmall = (HICON)LoadImageW(hInst, MAKEINTRESOURCEW(1), IMAGE_ICON,
                                        GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), 0);

    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW | CS_DBLCLKS;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = nullptr;
    wc.hIcon = iconBig;
    wc.hIconSm = iconSmall;
    wc.lpszClassName = L"ChainerDesktopWindow";
    RegisterClassExW(&wc);

    // Startgroesse: wie ein uebliches Browserfenster
    int w = 1500, h = 950;
    g_hwnd = CreateWindowExW(0, wc.lpszClassName, L"Chainer – Blockchain tracing",
                             WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, w, h, nullptr, nullptr,
                             hInst, nullptr);
    if (!g_hwnd) return 1;

    g_dpi = (float)GetDpiForWindow(g_hwnd);

    // Vorgaben wie in der Web-Fassung: Englisch, dunkel.
    g_locale = Loc::En;
    g_app.theme = ThemeChoice::Dark;
    {
        // „System“ braucht die Einstellung des Betriebssystems.
        HKEY key;
        DWORD value = 1, size = sizeof(value);
        if (RegOpenKeyExW(HKEY_CURRENT_USER,
                          L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", 0,
                          KEY_READ, &key) == ERROR_SUCCESS) {
            RegQueryValueExW(key, L"AppsUseLightTheme", nullptr, nullptr, (LPBYTE)&value, &size);
            RegCloseKey(key);
        }
        g_app.systemLight = value != 0;
    }
    // Beim ersten Start Beispielinhalte anlegen, sonst die eigene Ablage laden.
    loadDemoData(g_app);
    if (!storeLoad(g_app)) storeSave(g_app);
    g_lastMode = g_app.mode();
    applyTitleBar(g_hwnd, g_lastMode);

    if (!createTarget()) return 1;
    if (!g_painter.init(g_rt, g_dw, g_d2d)) return 1;

    taskInit(g_hwnd);

    ShowWindow(g_hwnd, nCmdShow);
    UpdateWindow(g_hwnd);

    for (;;) {
        MSG msg;
        bool quit = false;
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            if (msg.message == WM_QUIT) { quit = true; break; }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        if (quit) break;

        if (g_dirty) {
            g_dirty = false;
            render();
        } else {
            // Ohne Eingaben schlafen; bei aktivem Textfeld fuer den blinkenden
            // Cursor regelmaessig aufwachen.
            DWORD wait = (!g_app.ui.focusId.empty() || taskBusy() > 0) ? 120 : INFINITE;
            MsgWaitForMultipleObjectsEx(0, nullptr, wait, QS_ALLINPUT, MWMO_INPUTAVAILABLE);
            if (!g_app.ui.focusId.empty() || taskBusy() > 0) g_dirty = true;
        }
    }

    storeSave(g_app);
    taskShutdown();
    discardTarget();
    if (g_dw) g_dw->Release();
    if (g_d2d) g_d2d->Release();
    CoUninitialize();
    return 0;
}
