import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import { getSession, getUserSettings } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chainer – Blockchain-Tracing",
  description: "Bitcoin und weitere Chains über kostenlose Datenquellen zurückverfolgen",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const settings = await getUserSettings(session);
  const dbConfigured = isDbConfigured() && !!process.env.AUTH_SECRET;
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Nav email={session?.email ?? null} dbConfigured={dbConfigured} orgName={settings.orgName} />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-border px-4 py-3 text-center text-xs text-gray-500 print:hidden">
          Chainer · Quellen: mempool.space, Blockstream, litecoinspace, Blockchain.com, BlockCypher, Blockchair,
          Blockscout, Etherscan, eigener Knoten und Electrum · Labels: OFAC, Ransomwhere, GraphSense-TagPacks,
          WalletExplorer, CryptoScamDB, Chainabuse, Bitcoin Who&apos;s Who · Kurse: CoinGecko ·
          Heuristiken sind Wahrscheinlichkeitsaussagen, keine Beweise.
        </footer>
      </body>
    </html>
  );
}
