import { describe, expect, it } from "vitest";
import { calculatorsService } from "./calculators.service";

describe("calculatorsService.calculateLimitation", () => {
  it("returns a deadline two years after the cause of action date", () => {
    const result = calculatorsService.calculateLimitation("2025-06-15");

    expect(result.limitationPeriodYears).toBe(2);
    expect(result.deadline).toBe("2027-06-15");
    expect(result.section).toContain("Section 69");
    expect(result.expired).toBe(false);
    expect(result.daysRemaining).toBeGreaterThan(0);
  });

  it("flags a complaint as expired when the deadline has passed", () => {
    const result = calculatorsService.calculateLimitation("2020-01-01");

    expect(result.expired).toBe(true);
    expect(result.daysRemaining).toBeGreaterThan(0);
  });

  it("handles leap-year cause dates without crashing", () => {
    const result = calculatorsService.calculateLimitation("2024-02-29");

    expect(result.deadline).toBe("2026-02-28");
  });

  it("attributes condonation of delay to s.69(2), not to a proviso to s.69", () => {
    // s.69(2) is the condonation power; the proviso to s.69(2) is the narrower
    // requirement that the Commission record its reasons. The old wording
    // ("proviso to Section 69") pointed at neither.
    const result = calculatorsService.calculateLimitation("2025-06-15");

    expect(result.explanation).toContain("Section 69(1)");
    expect(result.explanation).toContain("Section 69(2)");
    expect(result.explanation).toContain("record its reasons");
  });
});

// The Act as enacted: District up to one crore (s.34(1)); State above one crore
// to ten crore (s.47(1)(a)(i)); National above ten crore (s.58(1)(a)(i)).
const ONE_CRORE = 10_000_000;
const TEN_CRORE = 100_000_000;

describe("calculatorsService.calculateJurisdiction", () => {
  it("routes values up to one crore to the District Commission", () => {
    const result = calculatorsService.calculateJurisdiction(ONE_CRORE);

    expect(result.forum).toBe("District Commission");
    expect(result.section).toContain("Section 34(1)");
  });

  it("routes values just above one crore to the State Commission", () => {
    const result = calculatorsService.calculateJurisdiction(ONE_CRORE + 1);

    expect(result.forum).toBe("State Commission");
    expect(result.section).toContain("Section 47(1)(a)(i)");
  });

  it("routes exactly ten crore to the State Commission", () => {
    const result = calculatorsService.calculateJurisdiction(TEN_CRORE);

    expect(result.forum).toBe("State Commission");
    expect(result.section).toContain("Section 47");
  });

  it("routes values above ten crore to the National Commission", () => {
    const result = calculatorsService.calculateJurisdiction(TEN_CRORE + 1);

    expect(result.forum).toBe("National Commission");
    expect(result.section).toContain("Section 58(1)(a)(i)");
  });

  it("routes small claims to the District Commission and states the enacted range", () => {
    const result = calculatorsService.calculateJurisdiction(25000);

    expect(result.forum).toBe("District Commission");
    expect(result.valueRange).toContain("1,00,00,000");
  });

  it("never states a value the Act does not contain", () => {
    // Guard against the post-enactment prescribed figures returning. They are
    // subordinate legislation, not part of the Act, and this service must not
    // attribute them to s.34/47/58.
    const outputs = [25000, ONE_CRORE, ONE_CRORE + 1, TEN_CRORE + 1].map((value) =>
      JSON.stringify(calculatorsService.calculateJurisdiction(value)),
    );

    for (const output of outputs) {
      expect(output).not.toContain("50,00,000");
      expect(output).not.toContain("2,00,00,000");
      expect(output).not.toContain("fifty lakh");
      expect(output).not.toContain("two crore rupees");
    }
  });

  it("cites only provisions that exist and uses the Act's own value formula", () => {
    for (const value of [25000, ONE_CRORE + 1, TEN_CRORE + 1]) {
      const result = calculatorsService.calculateJurisdiction(value);

      // s.34(1) has no clauses, so "Section 34(1)(a)" was a fabricated citation.
      expect(result.section).not.toContain("Section 34(1)(a)");

      // The 2019 Act measures the consideration paid. Adding compensation
      // claimed is the 1986 Act's formula and inflates the claim value.
      expect(result.explanation).toContain("paid as consideration");
      expect(result.explanation).not.toContain("compensation claimed");
    }
  });

  it("carries the prescription proviso on every result", () => {
    for (const value of [25000, ONE_CRORE + 1, TEN_CRORE + 1]) {
      const result = calculatorsService.calculateJurisdiction(value);

      expect(result.prescribedValueNote).toContain("prescribe such other value");
      expect(result.prescribedValueNote).toContain("not part of the Act");
    }
  });
});