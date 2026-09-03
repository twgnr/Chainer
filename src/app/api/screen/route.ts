import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth";
import { getAddress, lookupLabels } from "@/lib/providers/registry";
import { classifyHarmful, type HarmfulVerdict } from "@/lib/trace/risk";
import { DEFAULT_CHAIN, isChainAddress, type ChainId } from "@/lib/chains";
import type { AddressLabel } from "@/lib/providers/types";
import { errMsg, jsonError } from "@/lib/api";
import { guard } from "@/lib/ratelimit";

/** Massenprüfung kann bei vielen Adressen lange dauern */
export const maxDuration = 300;

/** Höchstzahl an Adressen pro Anfrage */
const MAX_ADDRESSES = 200;
/** Wie viele Adressen gleichzeitig geprüft werden (Rate-Limits der Quellen) */
const BATCH_SIZE = 5;

const screenSchema = z.object({
  addresses: z.array(z.string()).min(1, "mindestens eine Adresse angeben"),
  chain: z.enum(["bitcoin", "litecoin", "dogecoin", "bitcoin-cash", "ethereum"]).optional(),
  includeMedium: z.boolean().optional(),
  withBalance: z.boolean().optional(),
});

export interface ScreenResult {
  address: string;
  valid: boolean;
  reason?: string;
  labels: AddressLabel[];
  verdict: HarmfulVerdict | null;
  balanceSat?: number;
  txCount?: number;
  provider?: string;
  error?: string;
}

export interface ScreenSummary {
  total: number;
  checked: number;
  flagged: number;
  high: number;
  medium: number;
  invalid: number;
  errors: number;
}

export interface ScreenResponse {
  chain: ChainId;
  results: ScreenResult[];
  summary: ScreenSummary;
  durationMs: number;
}

/** Trimmen, Leerzeilen entfernen, Duplikate entfernen (EVM kleingeschrieben) */
function normalise(list: string[], chain: ChainId): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const value = chain === "ethereum" ? trimmed.toLowerCase() : trimmed;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export async function POST(req: Request) {
  const limited = guard(req, "screen");
  if (limited) return limited;
  const parsed = screenSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return jsonError("Ungültige Parameter: " + parsed.error.issues.map((i) => i.message).join(", "));

  const chain: ChainId = parsed.data.chain ?? DEFAULT_CHAIN;
  const includeMedium = parsed.data.includeMedium ?? false;
  const withBalance = parsed.data.withBalance ?? false;

  const addresses = normalise(parsed.data.addresses, chain);
  if (!addresses.length) return jsonError("Keine Adressen gefunden");
  if (addresses.length > MAX_ADDRESSES)
    return jsonError(
      `Zu viele Adressen: ${addresses.length}. Es sind höchstens ${MAX_ADDRESSES} Adressen pro Prüfung möglich.`,
    );

  // Auch im Gastmodus nutzbar; liefert Nutzer-Keys und eigene Labels, falls eingeloggt
  const { ctx } = await getRequestContext({ chain });
  const started = Date.now();

  async function screenOne(address: string): Promise<ScreenResult> {
    if (!isChainAddress(address, chain))
      return {
        address,
        valid: false,
        reason: `keine gültige Adresse für ${chain}`,
        labels: [],
        verdict: null,
      };

    const result: ScreenResult = { address, valid: true, labels: [], verdict: null };
    try {
      const { labels } = await lookupLabels(ctx, address);
      result.labels = labels;
      result.verdict = classifyHarmful(labels, includeMedium);
    } catch (e) {
      result.error = errMsg(e);
    }

    if (withBalance) {
      try {
        const { data, provider } = await getAddress(ctx, address);
        result.balanceSat = data.balanceSat;
        result.txCount = data.txCount;
        result.provider = provider;
      } catch {
        /* Saldo ist optional – Fehler hier lassen die Labelprüfung unberührt */
      }
    }
    return result;
  }

  const results: ScreenResult[] = [];
  try {
    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
      const chunk = addresses.slice(i, i + BATCH_SIZE);
      results.push(...(await Promise.all(chunk.map(screenOne))));
    }
  } catch (e) {
    return jsonError(errMsg(e), 502);
  }

  const summary: ScreenSummary = {
    total: results.length,
    checked: results.filter((r) => r.valid).length,
    flagged: results.filter((r) => r.verdict).length,
    high: results.filter((r) => r.verdict?.severity === "high").length,
    medium: results.filter((r) => r.verdict?.severity === "medium").length,
    invalid: results.filter((r) => !r.valid).length,
    errors: results.filter((r) => r.error).length,
  };

  const response: ScreenResponse = { chain, results, summary, durationMs: Date.now() - started };
  return NextResponse.json(response);
}
