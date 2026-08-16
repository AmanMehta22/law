import { describe, expect, it } from "vitest";
import { knowledgeService } from "./knowledge.service";

describe("KnowledgeService", () => {
  it("returns the lowest-priority missing field", () => {
    const result = knowledgeService.getNextRequirement([
      "issue",
      "reliefSought",
      "productOrService",
    ]);

    expect(result.id).toBe("productOrService");
  });

  it("respects priority order", () => {
    const result = knowledgeService.getNextRequirement([
      "reliefSought",
      "seller",
    ]);

    expect(result.id).toBe("seller");
  });

  it("returns undefined when nothing is missing", () => {
    expect(knowledgeService.getNextRequirement([])).toBeUndefined();
  });
});