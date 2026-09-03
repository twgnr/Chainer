import KeysForm from "@/components/KeysForm";
import TokensForm from "@/components/TokensForm";
import ProviderStatusList from "@/components/ProviderStatusList";
import AccountTools from "@/components/AccountTools";
import SessionsPanel from "@/components/SessionsPanel";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Datenquellen & API-Keys</h1>
      <ProviderStatusList />
      <KeysForm />
      <AccountTools />
      <SessionsPanel />
      <TokensForm />
      <div className="card space-y-2 text-sm text-gray-400">
        <h2 className="font-semibold text-foreground">Serverseitige Konfiguration</h2>
        <p>
          Keys global setzen: <span className="mono">BLOCKCYPHER_TOKEN</span>, <span className="mono">BLOCKCHAIR_KEY</span>,{" "}
          <span className="mono">CHAINABUSE_KEY</span>, <span className="mono">ETHERSCAN_KEY</span>,{" "}
          <span className="mono">BITCOINWHOSWHO_KEY</span>. Sie gelten für alle Nutzer ohne eigenen Key.
        </p>
        <p>
          Eigene Infrastruktur: <span className="mono">BITCOIN_RPC_URL</span>, <span className="mono">BITCOIN_RPC_USER</span>,{" "}
          <span className="mono">BITCOIN_RPC_PASSWORD</span>, <span className="mono">ELECTRUM_HOST</span>,{" "}
          <span className="mono">ELECTRUM_PORT</span>, <span className="mono">ELECTRUM_PROTOCOL</span>.
        </p>
        <p>
          Zusätzliche Label-Listen: <span className="mono">TAGPACK_URLS</span> (kommagetrennte URLs zu TagPack-YAML-,
          CSV- oder JSON-Dateien). Ohne Angabe werden die öffentlichen GraphSense-TagPacks geladen.
        </p>
        <p>
          Benachrichtigungen: <span className="mono">SMTP_HOST</span>, <span className="mono">SMTP_PORT</span>,{" "}
          <span className="mono">SMTP_USER</span>, <span className="mono">SMTP_PASSWORD</span>,{" "}
          <span className="mono">SMTP_FROM</span>, <span className="mono">TELEGRAM_BOT_TOKEN</span>. Automatische
          Watchlist-Prüfung: <span className="mono">WATCH_INTERVAL_MINUTES</span> oder ein externer Cron-Dienst auf{" "}
          <span className="mono">/api/watch/check</span> mit <span className="mono">CRON_SECRET</span>.
        </p>
      </div>
    </div>
  );
}
