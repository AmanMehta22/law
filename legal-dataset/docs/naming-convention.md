# Naming Convention

Every JSON entry in the dataset has a unique ID and a filename derived from that ID.

## ID Structure

```
{ACT_ID}-CH{CHAPTER}-S{SECTION}-{SUBSECTION}
```

Example: `CPA2019-CH1-S2-1`

| Part | Rule | Example |
|---|---|---|
| Act ID | Uppercase letters + year, no spaces | `CPA2019` |
| Chapter | `CH` followed by the chapter number (no leading zero) | `CH1` |
| Section | `S` followed by the section number | `S2` |
| Subsection | The subsection number, no parentheses | `1` |

## Citation chapter format

Chapter numbers in the `id` use **Arabic numerals** (`CH1`, `CH2`, ...).
The `citations` array uses **Roman numerals** for chapters (`I`, `II`, ...), matching the official Act.

## Whole-section IDs

When one JSON represents an entire section with no single subsection (or a
merged subsection range), omit the subsection part:

```
CPA2019-CH1-S1
```

## Definition IDs

Definitions follow the same structure. The subsection part always refers to
the clause of the definitions section where the term is defined.

```
CPA2019-CH1-S2-1      -> s.2(1) "advertisement"
CPA2019-CH1-S2-7      -> s.2(7) "consumer"
```

## Filenames

A JSON file is named exactly `{ID}.json`.

| Folder | Filename | Content |
|---|---|---|
| `dataset/sections/` | `CPA2019-CH1-S1-1.json` | One subsection, `node_type: "section"` |
| `dataset/definitions/` | `CPA2019-CH1-S2-1.json` | One definition, `node_type: "definition"` |

## Act IDs used in this project

| Act | Act ID |
|---|---|
| Consumer Protection Act, 2019 | `CPA2019` |
| (add future acts here) | |
