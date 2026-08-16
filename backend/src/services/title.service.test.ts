import { describe, expect, it } from "vitest";
import { titleService } from "./title.service";

describe("TitleService", () => {
  it("keeps short messages as-is", () => {
    expect(titleService.generate("hello world")).toBe("hello world");
  });

  it("collapses whitespace", () => {
    expect(titleService.generate("  hello   world  ")).toBe("hello world");
  });

  it("truncates long messages at 60 chars with ellipsis", () => {
    const long = "a".repeat(80);
    const result = titleService.generate(long);
    expect(result).toHaveLength(63);
    expect(result.endsWith("...")).toBe(true);
  });

  it("does not truncate messages of exactly 60 chars", () => {
    const message = "b".repeat(60);
    expect(titleService.generate(message)).toBe(message);
  });
});