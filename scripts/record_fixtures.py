#!/usr/bin/env python3
"""Record provider responses as test fixtures."""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "lib" / "providers" / "__fixtures__"
FORCE = "--force" in sys.argv

BTC_ADDRESS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
BTC_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16"
BTC_COINBASE_TXID = "0e3e2357e806b6cdb1f70b54c3a3a17b6714ee1f0e68bebb44a74b1efd512098"
EVM_ADDRESS = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"
TRON_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
MAX_ITEMS = 5

report: list[dict[str, str]] = []


def is_record(value: Any) -> bool:
    return isinstance(value, dict)


def shrink_list(key: str | None):
    def shrink(value: Any) -> Any:
        if key is None:
            return value[:MAX_ITEMS] if isinstance(value, list) else value
        if not is_record(value) or not isinstance(value.get(key), list):
            return value
        shortened = len(value[key]) > MAX_ITEMS
        result = {**value, key: value[key][:MAX_ITEMS]}
        if shortened and "next_page_params" in result:
            result["next_page_params"] = None
        return result

    return shrink


def shrink_tron_account(value: Any) -> Any:
    if not is_record(value) or not isinstance(value.get("data"), list):
        return value
    data = []
    for entry in value["data"][:MAX_ITEMS]:
        if is_record(entry):
            entry = dict(entry)
            for key in ("trc20", "assetV2", "free_asset_net_usageV2", "frozenV2"):
                if isinstance(entry.get(key), list):
                    entry[key] = entry[key][:MAX_ITEMS]
        data.append(entry)
    return {**value, "data": data}


def fixture_path(name: str) -> Path:
    return OUT_DIR / f"{name}.json"


def read_fixture(name: str) -> Any:
    try:
        return json.loads(fixture_path(name).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def request_json(url: str, init: dict[str, Any] | None = None) -> Any:
    options = init or {}
    headers = {
        "Accept": "application/json",
        "User-Agent": "Chainer-Fixtures/1.0",
        **options.get("headers", {}),
    }
    body = options.get("body")
    if isinstance(body, str):
        body = body.encode("utf-8")
    req = Request(url, data=body, headers=headers, method=options.get("method"))
    try:
        with urlopen(req) as response:
            return json.loads(response.read())
    except HTTPError as error:
        body_text = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"HTTP {error.code} {error.reason} – {body_text[:160]}"
        ) from error


def record(
    name: str,
    url: str,
    *,
    init: dict[str, Any] | None = None,
    shrink=None,
    optional: bool = False,
    pause_ms: int = 350,
    note: str | None = None,
) -> Any:
    target = fixture_path(name)
    relative_path = target.relative_to(ROOT).as_posix()

    try:
        if target.exists() and not FORCE:
            existing = read_fixture(name)
            report.append({
                "name": name,
                "status": "vorhanden",
                "info": f"{relative_path} (unverändert, --force überschreibt)",
            })
            return existing

        raw = request_json(url, init)
        data = shrink(raw) if shrink else raw
        text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        target.write_text(text, encoding="utf-8")
        suffix = f" – {note}" if note else ""
        report.append({
            "name": name,
            "status": "aufgezeichnet",
            "info": f"{relative_path} ({len(text.encode('utf-8')) / 1024:.1f} kB){suffix}",
        })
        return data
    except Exception as error:
        suffix = " (optional, Test wird übersprungen)" if optional else ""
        report.append({
            "name": name,
            "status": "übersprungen" if optional else "FEHLER",
            "info": f"{url} – {error}{suffix}",
        })
        return None
    finally:
        time.sleep(pause_ms / 1000)


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    meta: dict[str, Any] = {
        "btcAddress": BTC_ADDRESS,
        "btcTxid": BTC_TXID,
        "btcCoinbaseTxid": BTC_COINBASE_TXID,
        "evmAddress": EVM_ADDRESS,
        "tronAddress": TRON_ADDRESS,
    }

    mempool = "https://mempool.space/api"
    record("mempool-address", f"{mempool}/address/{BTC_ADDRESS}")
    record("mempool-address-txs", f"{mempool}/address/{BTC_ADDRESS}/txs", shrink=shrink_list(None))
    record("mempool-tx", f"{mempool}/tx/{BTC_TXID}")
    record("mempool-outspends", f"{mempool}/tx/{BTC_TXID}/outspends")
    record("mempool-tx-coinbase", f"{mempool}/tx/{BTC_COINBASE_TXID}", note="Coinbase-Transaktion aus Block 1")

    record("blockstream-tx", f"https://blockstream.info/api/tx/{BTC_TXID}")

    blockchain_info = "https://blockchain.info"
    record("blockchain-info-rawaddr", f"{blockchain_info}/rawaddr/{BTC_ADDRESS}?limit=5", shrink=shrink_list("txs"), pause_ms=2000)
    record("blockchain-info-rawtx", f"{blockchain_info}/rawtx/{BTC_TXID}", pause_ms=2000)
    record("blockchain-info-rawtx-coinbase", f"{blockchain_info}/rawtx/{BTC_COINBASE_TXID}", pause_ms=2000, note="Coinbase-Transaktion aus Block 1")

    blockcypher = "https://api.blockcypher.com/v1/btc/main"
    record("blockcypher-tx", f"{blockcypher}/txs/{BTC_TXID}?limit=50")
    record("blockcypher-address", f"{blockcypher}/addrs/{BTC_ADDRESS}/balance?x=1")
    record("blockcypher-address-full", f"{blockcypher}/addrs/{BTC_ADDRESS}/full?limit=50", shrink=shrink_list("txs"))

    record(
        "blockchair-tx",
        f"https://api.blockchair.com/bitcoin/dashboards/transaction/{BTC_TXID}",
        optional=True,
        note="ohne API-Key häufig HTTP 430",
    )

    blockscout = "https://eth.blockscout.com/api/v2"
    transfers = record(
        "blockscout-address-token-transfers",
        f"{blockscout}/addresses/{EVM_ADDRESS}/token-transfers",
        shrink=shrink_list("items"),
    )
    record("blockscout-address", f"{blockscout}/addresses/{EVM_ADDRESS}")
    record("blockscout-address-counters", f"{blockscout}/addresses/{EVM_ADDRESS}/counters")
    record("blockscout-address-txs", f"{blockscout}/addresses/{EVM_ADDRESS}/transactions", shrink=shrink_list("items"))

    items = transfers.get("items", []) if is_record(transfers) else []
    first_transfer = items[0] if items else None
    evm_txid = None
    if is_record(first_transfer):
        evm_txid = first_transfer.get("transaction_hash") or first_transfer.get("tx_hash")
    if isinstance(evm_txid, str):
        meta["evmTxid"] = evm_txid
        record("blockscout-tx", f"{blockscout}/transactions/{evm_txid}")
        record("blockscout-tx-token-transfers", f"{blockscout}/transactions/{evm_txid}/token-transfers", shrink=shrink_list("items"))
        record("blockscout-tx-internal", f"{blockscout}/transactions/{evm_txid}/internal-transactions", shrink=shrink_list("items"), optional=True)
    else:
        old = read_fixture("_meta")
        if is_record(old) and old.get("evmTxid"):
            meta["evmTxid"] = old["evmTxid"]
        report.append({
            "name": "blockscout-tx",
            "status": "übersprungen",
            "info": "keine Token-Transfer-Liste vorhanden, aus der eine Transaktions-ID stammen könnte",
        })

    trongrid = "https://api.trongrid.io"
    record("trongrid-account", f"{trongrid}/v1/accounts/{TRON_ADDRESS}", shrink=shrink_tron_account, pause_ms=800)
    tron_txs = record(
        "trongrid-account-txs",
        f"{trongrid}/v1/accounts/{TRON_ADDRESS}/transactions?limit=5&order_by=block_timestamp,desc",
        shrink=shrink_list("data"),
        pause_ms=800,
    )
    record(
        "trongrid-trc20",
        f"{trongrid}/v1/accounts/{TRON_ADDRESS}/transactions/trc20?limit=5&order_by=block_timestamp,desc",
        shrink=shrink_list("data"),
        pause_ms=800,
    )

    data = tron_txs.get("data", []) if is_record(tron_txs) else []
    first_tron = data[0] if data else None
    tron_txid = first_tron.get("txID") if is_record(first_tron) else None
    if isinstance(tron_txid, str):
        meta["tronTxid"] = tron_txid
        post = lambda body: {
            "method": "POST",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(body),
        }
        record("trongrid-tx", f"{trongrid}/wallet/gettransactionbyid", init=post({"value": tron_txid}), pause_ms=800)
        record("trongrid-tx-info", f"{trongrid}/wallet/gettransactioninfobyid", init=post({"value": tron_txid}), pause_ms=800)
    else:
        old = read_fixture("_meta")
        if is_record(old) and old.get("tronTxid"):
            meta["tronTxid"] = old["tronTxid"]
        report.append({"name": "trongrid-tx", "status": "übersprungen", "info": "keine Transaktionsliste vorhanden"})

    old_meta = read_fixture("_meta")
    recorded = any(entry["status"] == "aufgezeichnet" for entry in report)
    merged = {
        "recordedAt": old_meta.get("recordedAt") if is_record(old_meta) else timestamp(),
        **(old_meta if is_record(old_meta) else {}),
        **meta,
    }
    if recorded:
        merged["recordedAt"] = timestamp()
    meta_text = json.dumps(merged, ensure_ascii=False, indent=2) + "\n"
    unchanged = is_record(old_meta) and meta_text == json.dumps(old_meta, ensure_ascii=False, indent=2) + "\n"
    if not unchanged:
        fixture_path("_meta").write_text(meta_text, encoding="utf-8")
    report.append({
        "name": "_meta",
        "status": "vorhanden" if unchanged else "aktualisiert" if old_meta else "aufgezeichnet",
        "info": "Adressen und IDs der Prüfdaten",
    })

    width = max(len(entry["name"]) for entry in report)
    relative_dir = OUT_DIR.relative_to(ROOT).as_posix()
    force_suffix = " (--force)" if FORCE else ""
    print(f"\nPrüfdaten in {relative_dir}{force_suffix}:\n")
    for entry in report:
        print(f"  {entry['name']:<{width}}  {entry['status']:<13} {entry['info']}")

    failed = sum(entry["status"] == "FEHLER" for entry in report)
    skipped = sum(entry["status"] == "übersprungen" for entry in report)
    recorded_count = sum(entry["status"] == "aufgezeichnet" for entry in report)
    existing_count = sum(entry["status"] == "vorhanden" for entry in report)
    print(f"\n{recorded_count} aufgezeichnet, {existing_count} unverändert, {skipped} übersprungen, {failed} fehlgeschlagen.\n")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Aufzeichnung abgebrochen: {error}", file=sys.stderr)
        raise SystemExit(1) from error
