import { describe, expect, it } from "vitest";
import { documentTemplateService } from "./documentTemplate.service";
import { DOCUMENT_TEMPLATES } from "../templates/documentTemplates";

describe("documentTemplateService", () => {
  it("exposes at least three templates covering notice, complaint and checklist", () => {
    const kinds = DOCUMENT_TEMPLATES.map((template) => template.kind);

    expect(DOCUMENT_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(kinds).toContain("notice");
    expect(kinds).toContain("complaint");
    expect(kinds).toContain("checklist");
  });

  it("selects the legal notice template for notice requests", () => {
    const template = documentTemplateService.selectTemplate(
      "Please draft a legal notice to the seller",
    );

    expect(template.kind).toBe("notice");
  });

  it("selects the complaint template for complaint requests", () => {
    const template = documentTemplateService.selectTemplate(
      "I want to file a complaint before the district commission",
    );

    expect(template.kind).toBe("complaint");
  });

  it("defaults to the checklist template for other document requests", () => {
    const template = documentTemplateService.selectTemplate(
      "What documents do I need?",
    );

    expect(template.kind).toBe("checklist");
  });

  it("keeps the verified legal structure in every template", () => {
    for (const template of DOCUMENT_TEMPLATES) {
      expect(template.structure.length).toBeGreaterThan(200);
    }
  });

  it("contains the key statutory references in the notice template", () => {
    const notice = DOCUMENT_TEMPLATES.find(
      (template) => template.kind === "notice",
    );

    expect(notice?.structure).toContain("Section 2(7)");
    expect(notice?.structure).toContain("Section 39");
    expect(notice?.structure).toContain("Section 69");
  });
});