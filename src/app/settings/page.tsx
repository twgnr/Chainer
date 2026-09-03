import KeysForm from "@/components/KeysForm";
import TokensForm from "@/components/TokensForm";
import ProviderStatusList from "@/components/ProviderStatusList";
import AccountTools from "@/components/AccountTools";
import SessionsPanel from "@/components/SessionsPanel";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const Var = ({ children }: { children: React.ReactNode }) => <span className="mono">{children}</span>;

const TXT = {
  en: {
    title: "Data sources & API keys",
    serverTitle: "Server-side configuration",
    keys: (
      <>
        Set keys globally: <Var>BLOCKCYPHER_TOKEN</Var>, <Var>BLOCKCHAIR_KEY</Var>, <Var>CHAINABUSE_KEY</Var>,{" "}
        <Var>ETHERSCAN_KEY</Var>, <Var>BITCOINWHOSWHO_KEY</Var>. They apply to every user without their own key.
      </>
    ),
    infra: (
      <>
        Your own infrastructure: <Var>BITCOIN_RPC_URL</Var>, <Var>BITCOIN_RPC_USER</Var>,{" "}
        <Var>BITCOIN_RPC_PASSWORD</Var>, <Var>ELECTRUM_HOST</Var>, <Var>ELECTRUM_PORT</Var>,{" "}
        <Var>ELECTRUM_PROTOCOL</Var>.
      </>
    ),
    tagpacks: (
      <>
        Additional label lists: <Var>TAGPACK_URLS</Var> (comma-separated URLs to TagPack YAML, CSV or JSON files).
        Without it, the public GraphSense TagPacks are loaded.
      </>
    ),
    notify: (
      <>
        Notifications: <Var>SMTP_HOST</Var>, <Var>SMTP_PORT</Var>, <Var>SMTP_USER</Var>, <Var>SMTP_PASSWORD</Var>,{" "}
        <Var>SMTP_FROM</Var>, <Var>TELEGRAM_BOT_TOKEN</Var>. Automatic watchlist checks:{" "}
        <Var>WATCH_INTERVAL_MINUTES</Var>, or an external cron service calling <Var>/api/watch/check</Var> with{" "}
        <Var>CRON_SECRET</Var>.
      </>
    ),
  },
  de: {
    title: "Datenquellen & API-Keys",
    serverTitle: "Serverseitige Konfiguration",
    keys: (
      <>
        Keys global setzen: <Var>BLOCKCYPHER_TOKEN</Var>, <Var>BLOCKCHAIR_KEY</Var>, <Var>CHAINABUSE_KEY</Var>,{" "}
        <Var>ETHERSCAN_KEY</Var>, <Var>BITCOINWHOSWHO_KEY</Var>. Sie gelten für alle Nutzer ohne eigenen Key.
      </>
    ),
    infra: (
      <>
        Eigene Infrastruktur: <Var>BITCOIN_RPC_URL</Var>, <Var>BITCOIN_RPC_USER</Var>, <Var>BITCOIN_RPC_PASSWORD</Var>,{" "}
        <Var>ELECTRUM_HOST</Var>, <Var>ELECTRUM_PORT</Var>, <Var>ELECTRUM_PROTOCOL</Var>.
      </>
    ),
    tagpacks: (
      <>
        Zusätzliche Label-Listen: <Var>TAGPACK_URLS</Var> (kommagetrennte URLs zu TagPack-YAML-, CSV- oder
        JSON-Dateien). Ohne Angabe werden die öffentlichen GraphSense-TagPacks geladen.
      </>
    ),
    notify: (
      <>
        Benachrichtigungen: <Var>SMTP_HOST</Var>, <Var>SMTP_PORT</Var>, <Var>SMTP_USER</Var>, <Var>SMTP_PASSWORD</Var>,{" "}
        <Var>SMTP_FROM</Var>, <Var>TELEGRAM_BOT_TOKEN</Var>. Automatische Watchlist-Prüfung:{" "}
        <Var>WATCH_INTERVAL_MINUTES</Var> oder ein externer Cron-Dienst auf <Var>/api/watch/check</Var> mit{" "}
        <Var>CRON_SECRET</Var>.
      </>
    ),
  },
};

export default async function SettingsPage() {
  const t = await getT(TXT);
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">{t.title}</h1>
      <ProviderStatusList />
      <KeysForm />
      <AccountTools />
      <SessionsPanel />
      <TokensForm />
      <div className="card space-y-2 text-sm text-muted">
        <h2 className="font-semibold text-foreground">{t.serverTitle}</h2>
        <p>{t.keys}</p>
        <p>{t.infra}</p>
        <p>{t.tagpacks}</p>
        <p>{t.notify}</p>
      </div>
    </div>
  );
}
