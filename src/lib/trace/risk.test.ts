import { describe, expect, it } from "vitest";
import { allHarmful, categoryText, classifyHarmful } from "@/lib/trace/risk";
import type { AddressLabel, LabelCategory } from "@/lib/providers/types";

function label(over: Partial<AddressLabel> = {}): AddressLabel {
  return { source: "test", label: "Testeintrag", ...over };
}

describe("classifyHarmful", () => {
  it("stuft die schädlichen Kategorien als hoch ein", () => {
    const kategorien: LabelCategory[] = ["sanctioned", "ransomware", "scam", "darknet"];
    for (const category of kategorien) {
      const v = classifyHarmful([label({ category })]);
      expect(v?.severity, category).toBe("high");
      expect(v?.category).toBe(category);
    }
  });

  it("wertet Mixer nur bei includeMedium", () => {
    const labels = [label({ category: "mixer", label: "Tornado Cash" })];
    expect(classifyHarmful(labels)).toBeNull();
    const v = classifyHarmful(labels, true);
    expect(v?.severity).toBe("medium");
    expect(v?.category).toBe("mixer");
  });

  it("zählt risk \"high\" auch ohne Kategorie", () => {
    const v = classifyHarmful([label({ risk: "high" })]);
    expect(v?.severity).toBe("high");
    expect(v?.category).toBeUndefined();
  });

  it("wertet risk \"medium\" nur bei includeMedium", () => {
    const labels = [label({ risk: "medium" })];
    expect(classifyHarmful(labels)).toBeNull();
    expect(classifyHarmful(labels, true)?.severity).toBe("medium");
  });

  it("liefert bei leeren oder harmlosen Labels null", () => {
    expect(classifyHarmful([])).toBeNull();
    expect(classifyHarmful([label({ category: "exchange", risk: "low" })])).toBeNull();
  });

  it("wählt bei mehreren Labels die schwerste Einstufung", () => {
    const labels = [
      label({ category: "mixer", label: "Mixer" }),
      label({ category: "ransomware", label: "Ransomware-Wallet" }),
      label({ category: "exchange", risk: "low", label: "Börse" }),
    ];
    const v = classifyHarmful(labels, true);
    expect(v?.severity).toBe("high");
    expect(v?.label).toBe("Ransomware-Wallet");
    // Auch ohne includeMedium gewinnt die hohe Einstufung
    expect(classifyHarmful(labels)?.label).toBe("Ransomware-Wallet");
  });

  it("übernimmt Quelle, Details und Link der gewählten Einstufung", () => {
    const v = classifyHarmful([
      label({ category: "scam", source: "chainabuse", details: "Meldung 42", url: "https://example.test/42" }),
    ]);
    expect(v?.source).toBe("chainabuse");
    expect(v?.details).toBe("Meldung 42");
    expect(v?.url).toBe("https://example.test/42");
  });
});

describe("allHarmful", () => {
  it("listet jede belastende Einstufung einzeln auf, auch mittlere", () => {
    const out = allHarmful([
      label({ category: "mixer" }),
      label({ category: "darknet" }),
      label({ category: "exchange", risk: "low" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((v) => v.severity)).toEqual(["medium", "high"]);
  });
});

describe("categoryText", () => {
  it("übersetzt bekannte Kategorien ins Deutsche", () => {
    expect(categoryText("sanctioned")).toBe("sanctioned");
    expect(categoryText("darknet")).toBe("darknet market");
    expect(categoryText("sanctioned", "de")).toBe("sanktioniert");
    expect(categoryText("ransomware", "de")).toBe("Ransomware");
    expect(categoryText("scam", "de")).toBe("Betrug");
    expect(categoryText("darknet", "de")).toBe("Darknet-Markt");
    expect(categoryText("mixer", "de")).toBe("Mixer");
  });

  it("gibt unbekannte Kategorien unverändert zurück und nutzt sonst einen Ersatztext", () => {
    expect(categoryText("gambling")).toBe("gambling");
    expect(categoryText(undefined)).toBe("suspicious");
    expect(categoryText(undefined, "de")).toBe("auffällig");
  });
});
