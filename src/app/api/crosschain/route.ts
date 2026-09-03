import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth";
import { correlateCrossChain } from "@/lib/trace/crosschain";
import { chainEnum } from "@/lib/trace/params";
import { isChainAddress } from "@/lib/chains";
import { guard } from "@/lib/ratelimit";
import { errMsg, jsonError } from "@/lib/api";

export const maxDuration = 120;

const schema = z.object({
  fromChain: chainEnum,
  toChain: chainEnum,
  amountSat: z.number().int().positive(),
  atTime: z.number().int().positive(),
  candidateAddress: z.string().trim().min(10),
  windowMinutes: z.number().int().min(1).max(10080).default(120),
  tolerance: z.number().min(0).max(0.5).default(0.05),
  maxTxs: z.number().int().min(10).max(200).default(50),
});

/**
 * Prüft, ob auf der Zielkette bei einer Kandidatenadresse ein Eingang liegt, der
 * dem abgeflossenen Betrag entspricht.
 */
export async function POST(req: Request) {
  const limited = guard(req, "trace");
  if (limited) return limited;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Parameter: " + parsed.error.issues.map((i) => i.message).join(", "));
  const p = parsed.data;
  if (p.fromChain === p.toChain) return jsonError("Ausgangs- und Zielkette sind identisch");
  if (!isChainAddress(p.candidateAddress, p.toChain))
    return jsonError(`„${p.candidateAddress}“ ist keine gültige ${p.toChain}-Adresse`);
  const { ctx } = await getRequestContext({ chain: p.fromChain });
  try {
    return NextResponse.json(await correlateCrossChain(ctx, p));
  } catch (e) {
    return jsonError(errMsg(e), 502);
  }
}
