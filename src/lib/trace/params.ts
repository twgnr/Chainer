import { z } from "zod";
import { CHAINS, type ChainId } from "../chains";
import { DEFAULT_PARAMS } from "./types";

/** Zod-Enum über alle unterstützten Chains, damit neue Chains nicht vergessen werden. */
export const chainEnum = z.enum(Object.keys(CHAINS) as [ChainId, ...ChainId[]]);

/** Gemeinsames Schema für die Trace-Endpunkte (normal und Streaming). */
export const traceParamsSchema = z.object({
  start: z.string().trim().min(20),
  /** Weitere Startpunkte für eine gemeinsame Verfolgung */
  starts: z.array(z.string().trim().min(20)).max(20).optional(),
  chain: chainEnum.default(DEFAULT_PARAMS.chain),
  mode: z.enum(["address", "utxo"]).default(DEFAULT_PARAMS.mode),
  direction: z.enum(["forward", "backward", "both"]).default(DEFAULT_PARAMS.direction),
  taintModel: z.enum(["none", "haircut", "poison", "fifo"]).default(DEFAULT_PARAMS.taintModel),
  maxDepth: z.number().int().min(1).max(8).default(DEFAULT_PARAMS.maxDepth),
  maxTxPerAddress: z.number().int().min(1).max(50).default(DEFAULT_PARAMS.maxTxPerAddress),
  maxAddrPerTx: z.number().int().min(1).max(50).default(DEFAULT_PARAMS.maxAddrPerTx),
  minValueSat: z.number().int().min(0).default(DEFAULT_PARAMS.minValueSat),
  maxNodes: z.number().int().min(10).max(2000).default(DEFAULT_PARAMS.maxNodes),
  enrich: z.boolean().default(DEFAULT_PARAMS.enrich),
  historicPrices: z.boolean().default(true),
  lightning: z.boolean().default(true),
  includeMediumRisk: z.boolean().default(false),
  /** Nachweis der verwendeten Rohdaten mitführen */
  evidence: z.boolean().default(true),
  merges: z.array(z.array(z.string())).max(200).optional(),
});

export type TraceParamsInput = z.infer<typeof traceParamsSchema>;
