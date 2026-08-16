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
});

describe("calculatorsService.calculateJurisdiction", () => {
  it("routes values up to fifty lakh to the District Commission", () => {
    const result = calculatorsService.calculateJurisdiction(5000000);

    expect(result.forum).toBe("District Commission");
    expect(result.section).toContain("Section 34");
  });

  it("routes values above fifty lakh up to two crore to the State Commission", () => {
    const result = calculatorsService.calculateJurisdiction(5000001);

    expect(result.forum).toBe("State Commission");
    expect(result.section).toContain("Section 47");
  });

  it("routes exactly two crore to the State Commission", () => {
    const result = calculatorsService.calculateJurisdiction(20000000);

    expect(result.forum).toBe("State Commission");
    expect(result.section).toContain("Section 47");
  });

  it("routes values above two crore to the National Commission", () => {
    const result = calculatorsService.calculateJurisdiction(20000001);

    expect(result.forum).toBe("National Commission");
    expect(result.section).toContain("Section 58");
  });

  it("routes small claims to the District Commission", () => {
    const result = calculatorsService.calculateJurisdiction(25000);

    expect(result.forum).toBe("District Commission");
    expect(result.valueRange).toContain("50,00,000");
  });
});