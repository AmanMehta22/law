# JSON Rules

Formatting and structural rules for every JSON file in `dataset/`.

## Formatting

1. **Valid JSON only.** Every file must parse as JSON (no trailing commas, no comments, no unquoted keys).
2. **UTF-8 encoding.** All files are saved as UTF-8, no BOM.
3. **Double quotes only.** Keys and string values use `"` — never single quotes.
4. **Preserve punctuation.** Statutory text keeps its original punctuation exactly, including the trailing semicolon `;`.
5. **Indentation.** 2 spaces per level.
6. **Preserve statutory wording.** Never rephrase, reorder or "fix" the wording of the Act.
7. **No HTML or markdown** inside string values.

## Structure

8. **Keep field order identical to the schema.** Keys appear in the same order as in `schema/section.json` / `schema/definition.json`.
9. **Do not add fields.** Extra keys are rejected by the schema (`additionalProperties: false`).
10. **Do not remove fields.** All required keys must be present, even when the value is `null`.
11. **Do not rename fields.** Key names match the schema exactly.
12. **Type discipline.**
    - `chapter_number` is an integer (`1`), never a string.
    - `section_number` and `subsection_number` are strings (`"2"`, `"(1)"`).
    - `node_type` is exactly `"section"` or `"definition"`.

## Values

13. **`term` / `definition`:** non-empty strings for definition nodes; `null` for section nodes.
14. **`citations`:** at least one entry; chapter written in Roman numerals (`"I"`); subsection with parentheses (`"(1)"`).
15. **`references`:** empty array `[]` when there are no cross-references; never omit the key.
16. **`metadata`:** `jurisdiction`, `language` and `version` are always present.

## Filenames

17. Filename equals the node `id` plus `.json` (see `docs/naming-convention.md`).
18. The `id` in the file must match the filename, e.g. `CPA2019-CH1-S2-1.json` contains `"id": "CPA2019-CH1-S2-1"`.

## Validation

19. Validate against `schema/section.json` or `schema/definition.json` before saving.
20. A file that does not validate is **not** part of the dataset.
