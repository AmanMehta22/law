import { describe, expect, it } from "vitest";
import { DOCUMENT_TEMPLATES } from "./documentTemplates";

/**
 * These templates are the one output a consumer files with a Commission, so a
 * wrong figure or a wrong definition number here is worse than a wrong chat
 * answer - it goes on the record.
 *
 * Every citation asserted below was read out of
 * `legal-dataset/.../final/v1-statute.jsonl`, which is verified against the
 * Gazette PDF. The bugs these tests lock out were all real:
 *
 *   - "does not exceed fifty lakh rupees" - a value prescribed after enactment,
 *     asserted to the Commission as though the Act said it.
 *   - "value of the goods purchased and the compensation claimed" - the 1986
 *     Act's formula. s.34(1) measures only "the value of the goods or services
 *     paid as consideration", so adding compensation inflates the value and can
 *     send the complaint to the wrong Commission.
 *   - "SECTION 34(1)(a)" - s.34(1) has no clauses, so the citation named a
 *     provision that does not exist.
 *   - "defect ... Section 2(11) or deficiency ... Section 2(20)" - both wrong.
 *     Defect is s.2(10), deficiency is s.2(11), and s.2(20) is express warranty.
 */
const allTemplates = () =>
  DOCUMENT_TEMPLATES.map((template) => template.structure).join("\n\n");

describe("document templates stay inside the Consumer Protection Act, 2019", () => {
  it("states no monetary limit the Act does not contain", () => {
    const text = allTemplates();

    expect(text).not.toContain("fifty lakh");
    expect(text).not.toContain("50,00,000");
    expect(text).not.toContain("two crore");
  });

  it("uses the Act's own value formula, not the 1986 Act's", () => {
    const text = allTemplates();

    expect(text).toContain("value of the goods or services paid as consideration");
    expect(text).not.toContain("goods purchased and the compensation claimed");
    expect(text).not.toContain("value of goods/services plus compensation claimed");
  });

  it("cites the pecuniary jurisdiction provisions as they are numbered", () => {
    const text = allTemplates();

    // s.34(1) has no clause (a).
    expect(text).not.toContain("SECTION 34(1)(a)");
    expect(text).not.toContain("Section 34(1)(a)");
    expect(text).toContain("SECTION 34(1) OF THE CONSUMER PROTECTION ACT, 2019");
  });

  it("cites defect and deficiency by their real definition numbers", () => {
    const text = allTemplates();

    expect(text).toContain("Section 2(10)");
    expect(text).toContain("Section 2(11)");
    // s.2(20) is "express warranty" - it is not deficiency, and nothing in these
    // templates has any occasion to cite it.
    expect(text).not.toContain("Section 2(20)");
  });

  it("surfaces the prescription proviso wherever it asserts the District limit", () => {
    const text = allTemplates();

    expect(text).toContain("prescribed by the Central Government");
  });
});
