@echo off
REM ---------------------------------------------------------------------------
REM  Chainer Desktop - Bauen mit MSVC, ohne CMake.
REM
REM  Aufruf aus einem beliebigen Eingabeaufforderungsfenster:  build.bat
REM  Ergebnis:  build\Chainer.exe
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

if defined VSCMD_ARG_TGT_ARCH goto have_compiler
where cl.exe >nul 2>nul && goto have_compiler

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" goto no_vs
set "VSPATH="
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSPATH=%%i"
if not defined VSPATH goto no_vs
call "%VSPATH%\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 goto no_vs

:have_compiler
if not exist build mkdir build

set "SOURCES=src\main.cpp src\app.cpp src\gfx.cpp src\ui.cpp src\theme.cpp src\format.cpp src\demo.cpp src\widgets.cpp src\trace_panel.cpp src\pages_a.cpp src\pages_b.cpp src\pages_c.cpp src\store.cpp src\export.cpp src\net.cpp src\providers.cpp src\live.cpp"

cl /nologo /std:c++17 /EHsc /W3 /O2 /MT /utf-8 /DUNICODE /D_UNICODE ^
   /Fobuild\ /Fdbuild\Chainer.pdb /Febuild\Chainer.exe ^
   %SOURCES% ^
   /link /SUBSYSTEM:WINDOWS /INCREMENTAL:NO advapi32.lib

if errorlevel 1 goto failed
echo.
echo Fertig: build\Chainer.exe
endlocal
exit /b 0

:no_vs
echo Visual Studio mit der Arbeitslast "Desktopentwicklung mit C++" wurde nicht gefunden.
endlocal
exit /b 1

:failed
echo.
echo Der Build ist fehlgeschlagen.
endlocal
exit /b 1
