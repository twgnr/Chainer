import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth";
import { correlateMixerOutputs } from "@/lib/trace/mixer";
import { chainEnum } from "@/lib/trace/params";
import { isChainAddress } from "@/lib/chains";
import { guard } from "@/lib/ratelimit";
import { errMsg, jsonError } from "@/lib/api";

export const maxDuration = 120;

const schema = z.object({
  mixerAddress: z.string().trim().min(10),
  amountSat: z.number().int().positive(),
  afterTime: z.number().int().positive(),
  chain: chainEnum.default("bitcoin"),
  windowHours: z.number().min(1).max(720).default(72),
  tolerance: z.number().min(0).max(0.5).default(0.05),
  maxTxs: z.number().int().min(10).max(300).default(100),
  limit: z.number().int().min(1).max(100).default(25),
});

/** Sucht Ausgänge eines Mixers, die zeitlich und betragsmäßig zu einer Einzahlung passen. */
export async function POST(req: Request) {
  const limited = guard(req, "trace");
  if (limited) return limited;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Ungültige Parameter: " + parsed.error.issues.map((i) => i.message).join(", "));
  const p = parsed.data;
  if (!isChainAddress(p.mixerAddress, p.chain)) return jsonError(`Keine gültige ${p.chain}-Adresse`);
  const { ctx } = await getRequestContext({ chain: p.chain });
  try {
    return NextResponse.json(await correlateMixerOutputs(ctx, p));
  } catch (e) {
    return jsonError(errMsg(e), 502);
  }
}
