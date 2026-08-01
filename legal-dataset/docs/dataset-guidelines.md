# Dataset Guidelines

Rules for creating dataset entries. Follow these for **every** JSON you create.

## Core Rule

> One legal subsection = one JSON.
> One legal definition = one JSON.

## Classification

When reading a subsection from the source PDF, decide which type it is:

| Type | Condition | `node_type` | Folder |
|---|---|---|---|
| Section | Any statutory subsection that is not a definition | `"section"` | `dataset/sections/` |
| Definition | A subsection that defines a legal term (typically in the definitions section, e.g. s.2 of the CPA 2019) | `"definition"` | `dataset/definitions/` |

## Writing rules

1. **Preserve official wording.** `official_text` must be a verbatim copy from the PDF. No corrections, no modernisation, no translation.
2. **Never paraphrase.** `definition` holds the definition text *without* the quoted term prefix — nothing more.
3. **Never invent information.** If the Act does not say it, it does not appear in the JSON.
4. **Preserve punctuation.** Semicolons, commas, quotation marks and dashes stay exactly as printed (including the trailing `;`).
5. **One subsection per file.** Do not merge subsections (except the documented whole-section case).
6. **Fill every field.** Every key in the schema must be present. Fields that do not apply use `null` (e.g. `term`/`definition` for section nodes) or `[]` (e.g. empty `references`).
7. **Consistent IDs.** Generate the ID from the position in the Act, not from the term name.
8. **Empty means empty.** An empty `references` array means "no cross-references found" — never omit the key.

## References

Only add a `references` entry when the text explicitly refers to another
section of the same Act (e.g. "as defined in section 2(47)"). `target` is the
node id of the referenced entry. If the referenced entry has not been created
yet, add the reference anyway — its `target` id is still deterministic.

Relation vocabulary:

- `refers_to` — this node explicitly cites the target section (e.g. s.22(1)
  refers to section 19). Direction: from the referring node to the target.
- `defined_in` — a definition node whose `term` is defined in the target.
- `used_in` — this node's provision is used/applied by the target.

When a section is referred to as a whole, use the whole-section id
(e.g. `CPA2019-CH3-S10`), even if the whole-section file does not exist yet.

## Progress

After creating each entry, tick it off in `docs/progress.md`.

## Verification

Every entry must validate against the corresponding schema in `schema/`
(section.json or definition.json) before it is saved.
