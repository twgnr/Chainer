import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth";
import { findPaths, DEFAULT_PATH_PARAMS } from "@/lib/trace/path";
import { chainEnum } from "@/lib/trace/params";
import { isChainAddress } from "@/lib/chains";
import { errMsg, jsonError } from "@/lib/api";
import { withLogging } from "@/lib/logger";
import { guard } from "@/lib/ratelimit";

export const maxDuration = 300;

const schema = z.object({
  from: z.string().trim().min(10),
  to: z.string().trim().min(10),
  chain: chainEnum.default(DEFAULT_PATH_PARAMS.chain),
  maxDepth: z.number().int().min(1).max(5).default(DEFAULT_PATH_PARAMS.maxDepth),
  maxTxPerAddress: z.number().int().min(1).max(30).default(DEFAULT_PATH_PARAMS.maxTxPerAddress),
  maxAddrPerTx: z.number().int().min(1).max(30).default(DEFAULT_PATH_PARAMS.maxAddrPerTx),
  minValueSat: z.number().int().min(0).default(DEFAULT_PATH_PARAMS.minValueSat),
  maxApiCalls: z.number().int().min(10).max(500).default(DEFAULT_PATH_PARAMS.maxApiCalls),
  maxPaths: z.number().int().min(1).max(20).default(DEFAULT_PATH_PARAMS.maxPaths),
  directed: z.boolean().default(true),
  skipHubs: z.boolean().default(true),
  enrich: z.boolean().default(true),
});

/** Sucht Verbindungen zwischen zwei Adressen (bidirektionale Breitensuche). */
async function handler(req: Request) {
  const limited = guard(req, "path");
  if (limited) return limited;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Parameter: " + parsed.error.issues.map((i) => i.message).join(", "));
  const p = parsed.data;
  if (!isChainAddress(p.from, p.chain)) return jsonError(`„${p.from}“ ist keine gültige ${p.chain}-Adresse`);
  if (!isChainAddress(p.to, p.chain)) return jsonError(`„${p.to}“ ist keine gültige ${p.chain}-Adresse`);
  if (p.from === p.to) return jsonError("Start- und Zieladresse sind identisch");

  const { ctx } = await getRequestContext({ chain: p.chain });
  try {
    return NextResponse.json(await findPaths(ctx, p));
  } catch (e) {
    return jsonError(errMsg(e), 502);
  }
}

export const POST = withLogging("/api/path", handler);
