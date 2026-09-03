import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import { getSession, getUserSettings } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db";
import { getLocale, getT, getTheme } from "@/lib/i18n/server";
import { LocaleProvider, ThemeProvider } from "@/lib/i18n/provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chainer – Blockchain tracing",
  description: "Trace Bitcoin and other chains through free data sources",
};

const TXT = {
  en: {
    footer: (
      <>
        Chainer · Sources: mempool.space, Blockstream, litecoinspace, Blockchain.com, BlockCypher, Blockchair,
        Blockscout, Etherscan, your own node and Electrum · Labels: OFAC, Ransomwhere, GraphSense TagPacks,
        WalletExplorer, CryptoScamDB, Chainabuse, Bitcoin Who&apos;s Who · Rates: CoinGecko · Heuristics are
        statements of probability, not proof.
      </>
    ),
  },
  de: {
    footer: (
      <>
        Chainer · Quellen: mempool.space, Blockstream, litecoinspace, Blockchain.com, BlockCypher, Blockchair,
        Blockscout, Etherscan, eigener Knoten und Electrum · Labels: OFAC, Ransomwhere, GraphSense-TagPacks,
        WalletExplorer, CryptoScamDB, Chainabuse, Bitcoin Who&apos;s Who · Kurse: CoinGecko · Heuristiken sind
        Wahrscheinlichkeitsaussagen, keine Beweise.
      </>
    ),
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const settings = await getUserSettings(session);
  const dbConfigured = isDbConfigured() && !!process.env.AUTH_SECRET;
  const locale = await getLocale();
  const theme = await getTheme();
  const t = await getT(TXT);
  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Setzt `data-theme` noch während des Parsens, damit die Seite nicht
            kurz im falschen Modus aufblitzt. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={locale}>
          <ThemeProvider theme={theme}>
            <Nav
              email={session?.email ?? null}
              dbConfigured={dbConfigured}
              orgName={settings.orgName}
              locale={locale}
              theme={theme}
            />
            <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">{children}</main>
            <footer className="border-t border-border px-4 py-3 text-center text-xs text-subtle print:hidden">
              {t.footer}
            </footer>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
