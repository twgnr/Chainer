import { describe, expect, it } from "vitest";
import { crossChainHint, detectSwapService, SWAP_SERVICES } from "./crosschain";
import type { AddressLabel } from "../providers/types";

const label = (l: string, source = "tagpacks", details?: string): AddressLabel => ({ source, label: l, details });

describe("Erkennung von Tausch- und Brückendiensten", () => {
  it("erkennt einen Tauschdienst am Label", () => {
    const m = detectSwapService([label("FixedFloat hot wallet")]);
    expect(m?.service.name).toBe("FixedFloat");
    expect(m?.service.kind).toBe("swap");
  });

  it("erkennt eine Brücke am Label", () => {
    const m = detectSwapService([label("THORChain vault")]);
    expect(m?.service.name).toBe("THORChain");
    expect(m?.service.kind).toBe("bridge");
  });

  it("berücksichtigt auch das Detailfeld", () => {
    const m = detectSwapService([label("Unbekannt", "eigene", "vermutlich changenow einzahlung")]);
    expect(m?.service.name).toBe("ChangeNOW");
  });

  it("liefert nichts bei unauffälligen Labels", () => {
    expect(detectSwapService([label("Binance reserve wallet")])).toBeNull();
    expect(detectSwapService([])).toBeNull();
  });

  it("unterscheidet Groß- und Kleinschreibung nicht", () => {
    expect(detectSwapService([label("SIDESHIFT AI")])?.service.name).toBe("SideShift");
  });

  it("formuliert einen verständlichen Hinweis", () => {
    const m = detectSwapService([label("Wormhole bridge")])!;
    const hint = crossChainHint(m);
    expect(hint).toContain("Wormhole");
    expect(hint).toContain("Brücke");
  });

  it("führt zu jedem Dienst mindestens ein Erkennungsmuster", () => {
    for (const s of SWAP_SERVICES) {
      expect(s.patterns.length).toBeGreaterThan(0);
      expect(s.name.length).toBeGreaterThan(0);
    }
  });
});
