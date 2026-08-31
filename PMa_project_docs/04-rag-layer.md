?# PMa RAG Service Layer: Detailed Analysis

## 4.1 Project Structure

```
RAG/src/
├── api.py                 # FastAPI endpoints
├── config.py              # Tunable parameters
├── vectorStore.py         # ChromaDB wrapper
├── retriever.py           # Hybrid retrieval + concept routing
├── concept_routing.py     # Lay-language → statutory concept mapping
├── documentBuilder.py     # Knowledge card → Document conversion
├── embeddings.py          # Embedding model
├── ingest.py              # Data ingestion pipeline
├── jsonLoader.py          # JSON loader
├── statuteLoader.py       # Statute loader
└── eval/                  # Evaluation framework
    ├── run_eval.py        # Automated evaluation
    ├── consumer-eval-set.jsonl  # 106 test questions
    ├── anchor-audit.md    # Citation quality audit
    └── anchor-plausibility.md   # Citation validity check
```

## 4.2 API Endpoints

### 4.2.1 Health Check

`GET /health`

```json
{
  "status": "healthy"
}
```

### 4.2.2 Query (Retrieval)

`POST /query`

**Request**:
```json
{
  "query": "consumer rights for defective product refund",
  "top_k": 5
}
```

**Response**:
```json
{
  "query": "consumer rights for defective product refund",
  "results": [
    {
      "content": "A consumer has the right to...",
      "metadata": {
        "concept_id": "right.right_to_refund",
        "category": "rights",
        "statute": "Consumer Protection Act, 2019",
        "sections": ["Section 14"]
      }
    }
  ]
}
```

## 4.3 Retrieval Engine (`src/retriever.py` - 1252 lines)

### 4.3.1 Overview

The heart of the RAG system. Implements hybrid search (dense + BM25) fused via Reciprocal Rank Fusion (RRF), with concept routing, section lifting, definition lifting, canonical twin promotion, and structural slot budgeting.

### 4.3.2 Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `DENSE_CANDIDATES` | 30 | Dense search candidates |
| `BM25_CANDIDATES` | 20 | BM25 search candidates |
| `DENSE_RANK_CONST` | 40 | RRF dense weight |
| `BM25_RANK_CONST` | 60 | RRF BM25 weight |
| `DEFINITION_LIFT_RANK_CONST` | 44 | Definition card lift weight |
| `DEFINITION_V1_LIFT_RANK_CONST` | 74 | V1 statutory definition lift weight |
| `SECTION_LIFT_RANK_CONST` | 10 | User-named section (high trust) |
| `SECTION_LIFT_V2_RANK_CONST` | 46 | Derived cards (was 30, prevents crowding) |
| `SECTION_LIFT_V2_LIMIT` | 6 | Max derived cards per section |
| `ROUTED_SECTION_LIFT_RANK_CONST` | 14 | Inferred sections (lower trust) |
| `CONCEPT_ROUTE_RANK_CONST` | 42 | Inferred concept cards |
| `MAX_ROUTED_STATUTE_SLOTS` | 2 | Cap on routed statute chunks |
| `MAX_ROUTED_CARD_SLOTS` | 2 | Cap on routed concept cards |
| `MAX_EXAMPLES_IN_RESULT` | 2 | Cap on example cards |
| `MAX_RESERVED_SLOTS` | 2 | Floor guarantee for routing |
| `TYPE_WEIGHTS["example"]` | 0.70 | Penalize verbose illustrations |
| `TYPE_WEIGHTS["relationship"]` | 0.55 | Relationship cards |
| `TYPE_WEIGHTS["alias"]` | 0.40 | Boilerplate (confidence 0.0) |
| `TYPE_WEIGHTS["intent"]` | 0.40 | Boilerplate (confidence 0.0) |

### 4.3.3 `retrieve(query, k=5)` Pipeline

```
┌─────────────────────────────────────────────────────┐
│  retrieve(query, k=5)                              │
│                                                    │
│  1. route_query(query)  ← RAW query for routing    │
│     │ Cached concepts, terms, sections, lifts      │
│                                                    │
│  2. _normalize_query(query, routing.terms)          │
│     │                                                │
│  3. _section_targets(query)                         │
│     │ Find "section 2(9)" patterns                  │
│                                                    │
│  4. _hybrid_retrieve(normalized, k, targets, routing)│
│     │                                                │
├────┼────────────────────────────────────────────────┘
│    │
│    ├─► Dense search (filter source=v2, k=30)
│    ├─► BM25 search (k=20)
│    ├─► Definition lift (if definition-intent query)
│    ├─► Section lift (user-named sections, const=10)
│    ├─► Routed section lift (inferred sections, const=14)
│    ├─► Routed concept lift (force-included cards, const=42)
│    ├─► RRF fusion with type weights
│    ├─► Canonical twin promotion
│    ├─► Slot budget enforcement (_select_ids)
│    └─► Return top k docs
```

### 4.3.4 Hybrid Retrieval (`_hybrid_retrieve`)

#### Dense Search

```python
dense = self.vector_store.similarity_search(
    query=query,
    k=self.DENSE_CANDIDATES,
    filter={"source": "v2"},   # Only knowledge cards, not statute chunks
)
```

#### BM25 Search

```python
bm25_docs = self._bm25_retrieve(query, self.BM25_CANDIDATES)
```

BM25 index built once from full corpus at startup (warm()), excluding `alias`/`intent`/`relationship` type cards.

#### Definition Lift (`_lift_definition_docs`)

Fires when `_is_definition_intent()` detects definition-style query patterns:

```python
DEFINITION_INTENT_PATTERNS = [
    re.compile(r"\bconsidered\b"),
    re.compile(r"\bwho (?:is|are|can|does|qualifies)\b"),
    re.compile(r"\bwhat (?:is|are|does|counts)\b"),
    re.compile(r"\b(?:definition|defines?|define|meaning|means|interpretation)\b"),
    re.compile(r"\bdoes [a-z0-9 ]{0,60}include\b"),
    re.compile(r"\binclude a (?:person|user|beneficiary)\b"),
    re.compile(r"\buser of (?:such |the |those )?goods\b"),
    re.compile(r"\b(gift|gifted)\b"),
    re.compile(r"\bfalls? (?:within|under)\b"),
]
```

#### Section Lift (`_lift_section_docs`)

**Two paths**:
1. User-named sections (high trust, `SECTION_LIFT_RANK_CONST=10`)
2. Routed sections (inferred, `ROUTED_SECTION_LIFT_RANK_CONST=14`)

For each section target, lifts:
- V1 statute chunks (via `_lift_v1_section`) - verbatim text
- V2 knowledge cards derived from section (via `_lift_v2_section`)

**`_lift_v1_section`**: Queries ChromaDB for `source="v1"`, `section_number=section`, `subsection_number=(subsection)`. Creates `Document` with page_content = official_text + metadata.

**`_lift_v2_section`**: Queries cards with `derived_from` containing `-S{section}-{subsection}'`. Filters out alias/intent/relationship types. Sorts by `CANONICAL_TYPE_ORDER`. Limits to `SECTION_LIFT_V2_LIMIT=6`.

**Subtlety - `_derived_from_filters`**:

```python
def _derived_from_filters(self, section, subsection):
    if subsection:
        return [{"derived_from": {"$contains": f"-S{section}-{subsection}'"}}]
    return [
        {"derived_from": {"$contains": f"-S{section}-"}},
        {"derived_from": {"$contains": f"-S{section}'"}},
    ]
```

The trailing single quote anchors the subsection:
- `-S2-4` matches the whole `-S2-41` through `-S2-47` range incorrectly
- Anchoring with `'` prevents this

Also, 51 statute nodes have no subsection segment at all (like `CPA2019-CH2-S5`, `CPA2019-CH3-S12`), so `-S{n}-` isn't enough.

#### Routed Concept Lift (`_lift_concept_docs`)

```python
def _lift_concept_docs(self, concept_ids):
    if self._bm25 is None:
        self._ensure_bm25()
    return list(self._fetch_by_concept_ids(concept_ids).values())
```

Force-includes cards that concept routing identified. Without this, a consumer writing "a gym forces me to buy their protein powder" never reaches s.2(41), because the strict wording doesn't match.

#### RRF Fusion

```python
for index, doc in enumerate(dense):
    doc_id = self._doc_id(doc)
    retrieved_ids.add(doc_id)
    rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (self.DENSE_RANK_CONST + index + 1)

for index, doc in enumerate(bm25_docs):
    doc_id = self._doc_id(doc)
    retrieved_ids.add(doc_id)
    rank_map[doc_id] = rank_map.get(doc_id, 0) + 1.0 / (self.BM25_RANK_CONST + index + 1)
```

Then weighted by type:

```python
weighted = {
    doc_id: score * self._type_weight(by_id.get(doc_id))
    for doc_id, score in rank_map.items()
}
```

#### Slot Budgeting (`_select_ids`)

```
Fills k slots in score order, subject to budgets:
- MAX_ROUTED_STATUTE_SLOTS=2
- MAX_ROUTED_CARD_SLOTS=2
- MAX_EXAMPLES_IN_RESULT=2
- MAX_RESERVED_SLOTS=2 (floor guarantee)

Anything rejected by a budget is deferred rather than dropped.
```

**Reserved IDs** (`_reserved_ids`):
- One subsection from each inferred section (breadth-first)
- One card per matched route (handles multi-frame questions)
- Caps at MAX_RESERVED_SLOTS

### 4.3.5 `explain(query)` - Debug Tool

Returns routing decision and ranked results for tracing:

```json
{
  "query": "gym forces me to buy protein powder",
  "normalized": "gym forces me to buy protein powder restrictive trade practice tie up sales conditions",
  "named_sections": [],
  "routes": ["tie_in_or_forced_purchase"],
  "routed_sections": ["2(41)"],
  "routed_concepts": ["definition.restrictive_trade_practice"],
  "lifted_sections": ["2(41)"],
  "results": [
    {"id": "definition.restrictive_trade_practice", "concept_type": "definition", "source": "v2", "origin": "routed_card", "score": 0.0842},
    {"id": "CPA2019-CH1-S2-41", "concept_type": null, "source": "v1", "section": "2(41)", "origin": "routed_statute", "score": 0.0612},
    {"id": "example.restrictive_trade_practice_1", "concept_type": "example", "source": "v2", "origin": "retrieved", "score": 0.0451}
  ]
}
```

Origins:
- `retrieved` - found by dense and/or BM25
- `named_section` - user cited this section
- `routed_statute` - section inferred from wording
- `routed_card` - card inferred from wording
- `lifted_definition` - definition card lifted

### 4.3.6 `warm()` - Startup Optimization

```python
def warm(self):
    self._ensure_bm25()
    try:
        self.retrieve("who is a consumer and what are my rights")
    except Exception:
        pass
```

Pays one-time retrieval costs at startup: BM25 index build + embedding model warm-up. Critically, uses a definition-style question so the v1 definition-term scan is warmed too.

## 4.4 Concept Routing (`src/concept_routing.py` - 1014 lines)

### 4.4.1 Why It Exists

Consumers don't write in statutory vocabulary:

- "gym forces me to buy protein powder" → `restrictive trade practice` (s.2(41))
- "shop charged more than printed price" → `unfair trade practice` (s.2(47))
- "builder delayed flat by three years" → `deficiency` in `service` (s.2(11), s.2(42))

The corpus's 2,411 `alias`/`intent` cards are boilerplate (confidence 0.0). So concept routing builds a bridge from lay language to statutory provisions BEFORE retrieval.

### 4.4.2 `Route` Definition

```python
@dataclass(frozen=True)
class Route:
    name: str
    patterns: tuple[re.Pattern[str], ...]
    concepts: tuple[str, ...]
    terms: tuple[str, ...]
    sections: tuple[str, ...]
    lift_sections: tuple[str, ...] = ()
    priority: int = 50
    note: str = ""

    def matches(self, query: str) -> bool:
        return any(pattern.search(query) for pattern in self.patterns)
```

### 4.4.3 Route Priority Tiers

| Priority | Tier | Example Routes |
|----------|------|----------------|
| 10 | Named rights | `right_to_safety`, `right_to_be_informed`, `right_to_choose`, `right_to_be_heard`, `right_to_redressal`, `right_to_consumer_education`, `product_liability_defences` |
| 20 | Explicit statutory terms | `unfair_trade_practice`, `restrictive_trade_practice`, `deficiency`, `product_liability`, `explicit_statutory_term` |
| 25 | Overview questions | `consumer_rights_overview` ("my rights", "what are my rights") |
| 30 | Remedies sought | `remedies_sought` ("refund", "replace", "compensate", "damages") |
| 50 | Fact patterns | `defect_in_goods`, `deficiency_in_service`, `delayed_possession`, `medical_service`, `ecommerce`, `spurious_goods`, `misleading_advertisement`, `tie_in_or_forced_purchase`, `overcharging_above_printed_price`, `hidden_or_undisclosed_charges`, `insurance_claim_repudiated`, `delayed_possession_or_construction`, `medical_or_professional_service`, `ecommerce_or_online_purchase`, `spurious_or_counterfeit_goods`, `misleading_advertisement`, `harm_injury_or_product_liability`, `unfair_contract_terms`, `endorsement_by_celebrity`, `direct_selling`, `appeal_against_order`, `consumer_status_threshold` |
| 60 | Background nouns | `warranty_or_guarantee`, `laboratory_testing_of_goods`, `forum_and_pecuniary_jurisdiction` |

### 4.4.4 Special Handling: Consumer Status

Two routes handle "am I a consumer?":

- **Priority 20** (`consumer_status_question`): Outright question ("am I a consumer?", "gift recipient") → wins routed slots
- **Priority 50** (`consumer_status_threshold`): Background in narrative ("I bought a fridge") → fact-pattern routes win

The priority distinction is critical:
- Question asks about consumer status directly → definition.consumer wins
- Question about product/defect → fact-pattern route wins instead

### 4.4.5 `RoutingResult`

```python
@dataclass
class RoutingResult:
    terms: tuple[str, ...] = ()
    concepts: tuple[str, ...] = ()
    routes: tuple[str, ...] = ()
    sections: tuple[str, ...] = field(default=())
    lift_targets: tuple[tuple[str, str | None], ...] = ()
    concept_groups: tuple[tuple[str, ...], ...] = ()

    def __bool__(self):
        return bool(self.concepts or self.terms or self.lift_targets)
```

### 4.4.6 Caps

```python
MAX_ROUTED_CONCEPTS = 6
MAX_ROUTED_TERMS = 12
MAX_ROUTED_LIFT_SECTIONS = 3
```

These prevent routing from sweeping the result set.

### 4.4.7 Full Route Lexicon

The complete Russian doll of routes is too detailed to list fully here, but key routes include:

| Route | Priority | Patterns | Concepts | Sections | Lift Sections |
|-------|----------|----------|----------|----------|---------------|
| `right_to_safety` | 10 | willing, hazardous, dangerous, life, property | `right.right_to_protection_against_hazardous_goods`, `definition.consumer_rights` | "2(9)(i)" | - |
| `right_to_be_informed` | 10 | quality, quantity, price, informed | `right.right_to_information`, `definition.consumer_rights` | "2(9)(ii)" | - |
| `right_to_choose` | 10 | variety, competitive, price | `right.right_to_access_to_variety_of_goods`, `definition.consumer_rights` | "2(9)(iii)" | - |
| `right_to_be_heard` | 10 | heard, due consideration | `right.right_to_be_heard`, `definition.consumer_rights` | "2(9)(iv)" | - |
| `right_to_redressal` | 10 | redressal, unscrupulous exploitation | `right.right_to_redressal`, `definition.consumer_rights` | "2(9)(v)" | - |
| `right_to_consumer_education` | 10 | consumer education/awareness | `right.right_to_consumer_awareness`, `definition.consumer_rights` | "2(9)(vi)" | - |
| `product_liability_defences` | 10 | defence, exception, exempt, escape, not liable | (none) | "87" | "87" |
| `explicit_statutory_term` | 20 | `unfair trade practice` | `definition.unfair_trade_practice` | "2(47)" | - |
| `explicit_statutory_term_restrictive` | 20 | `restrictive trade practice` | `definition.restrictive_trade_practice` | "2(41)" | - |
| `explicit_statutory_term_deficiency` | 20 | deficiency | `definition.deficiency`, `definition.service` | "2(11)", "2(42)" | - |
| `explicit_statutory_term_product_liability` | 20 | product liability | `definition.product_liability`, `definition.harm` | "2(34)", "2(22)" | "84","85","86" |
| `who_is_liable` | 50 | who is/are responsible/liable, seller or manufacturer | `definition.product_liability` | "2(34)" | "84","85","86" |
| `mediation` | 50 | mediation, out of court, amicable | `definition.mediation`, `definition.mediator` | "2(25)", "2(26)", "74" | "37","79","80" |
| `punishment_for_spurious_or_adulterated_goods` | 50 | spurious, adulterated, counterfeit, fake | `definition.spurious_goods` | "90", "91" | "91", "90" |
| `penalty_or_punishment` | 50 | penalty, punishment, fine, imprisonment | (none) | "72", "88", "89" | "72", "88", "89" |
| `orders_the_commission_may_pass` | 50 | orders, may/can/shall, withdrawal, recall | (none) | "39" | "39", "20" |
| `establishment_and_appointments` | 50 | establish, constitute, set up, composition | (none) | "28", "42", "53" | "28", "42", "53" |
| `immovable_property_purchase` | 50 | plot, land, flat, apartment, villa, house | `definition.goods`, `definition.service` | "2(21)", "2(42)" | - |
| `tie_in_or_forced_purchase` | 50 | force, compel, insist, must buy, tie-in, tying, bundling | `definition.restrictive_trade_practice` | "2(41)" | - |
| `overcharging_above_printed_price` | 50 | printed price, displayed, MRP, overcharge | `definition.unfair_trade_practice`, `definition.complaint` | "2(47)", "2(6)" | - |
| `hidden_or_undisclosed_charges` | 50 | hidden, undisclosed, secret charge, service charge | `definition.unfair_trade_practice`, `definition.complaint` | "2(47)", "2(6)" | - |
| `insurance_claim_repudiated` | 50 | insurance claim, denied, repudiated | `definition.deficiency`, `definition.service` | "2(11)", "2(42)" | - |
| `delayed_possession_or_construction` | 50 | delay, late, possession, flat, builder, housing | `definition.deficiency`, `definition.service` | "2(11)", "2(42)" | - |
| `medical_or_professional_service` | 50 | doctor, hospital, medical, treatment | `definition.service`, `definition.deficiency` | "2(42)", "2(11)" | - |
| `ecommerce_or_online_purchase` | 50 | online, ecommerce, marketplace, website, app | `definition.e_commerce`, `definition.electronic_service_provider`, `definition.product_seller` | "2(16)", "2(17)", "2(37)" | - |
| `spurious_or_counterfeit_goods` | 50 | fake, duplicate, counterfeit, spurious, not genuine | `definition.spurious_goods`, `definition.goods` | "2(43)", "2(21)" | - |
| `misleading_advertisement` | 50 | advert, misleading, false, exaggeration | `definition.misleading_advertisement`, `definition.unfair_trade_practice`, `definition.advertisement` | "2(28)", "2(47)", "2(1)" | - |
| `warranty_or_guarantee` | 60 | warranty, guarantee period, under warranty | `definition.express_warranty`, `definition.product_service_provider` | "2(20)", "2(38)" | - |
| `harm_injury_or_product_liability` | 50 | injury, hurt, burn, poisoned, caught fire | `definition.harm`, `definition.product_liability`, `definition.product_liability_action` | "2(22)", "2(34)", "2(35)" | - |
| `unfair_contract_terms` | 50 | one-sided, unfair term, fine print, take it or leave it | `definition.unfair_contract` | "2(46)" | - |
| `endorsement_by_celebrity` | 50 | celebrity, actor, influencer, brand ambassador | `definition.endorsement` | "2(18)" | - |
| `direct_selling` | 50 | door-to-door, direct selling, multi-level | `definition.direct_selling` | "2(13)" | - |
| `appeal_against_order` | 50 | appeal, challenge, set aside, aggrieved, higher forum | (none) | "41", "51", "67" | "41", "51", "67" |
| `laboratory_testing_of_goods` | 60 | laboratory, lab test, sample, examination | `definition.appropriate_laboratory` | "38" | "38" |
| `forum_and_pecuniary_jurisdiction` | 50 | where/which file, pecuniary, how much claim | `definition.jurisdiction.*` | "34(1)", "47(1)", "58(1)" | - |
| `limitation_period` | 50 | time limit, too late, limitation, time-barred | `timeline.two_years`, `right.right_to_file_a_late_complaint` | "69(1)", "69(2)" | - |
| `consumer_rights_overview` | 25 | my rights, consumer rights, what can I do | `definition.consumer_rights`, `definition.complaint` | "2(9)", "2(6)" | - |
| `remedies_sought` | 30 | refund, replace, compensate, damages, remedy | `right.right_to_refund`, `right.right_to_replacement`, `right.right_to_compensation` | "39(1)" | - |
| `defect_in_goods` | 50 | defect, fault, broken, not working, poor quality | `definition.defect`, `definition.goods` | "2(10)", "2(21)" | - |
| `deficiency_in_service` | 50 | service not provided, negligent, shoddy, deficient | `definition.deficiency`, `definition.service` | "2(11)", "2(42)" | - |
| `consumer_status_question` | 20 | am I a consumer?, treated as consumer, counts as | `definition.consumer`, `definition.complainant` | "2(7)" | "2(7)" |
| `consumer_status_threshold` | 50 | I bought, I purchased, I ordered, I paid | `definition.consumer`, `definition.complaint` | "2(7)", "2(6)" | - |
| `filing_procedure` | 50 | file a case, complaint process, format | `definition.complaint`, `definition.complainant`, `right.right_to_file_complaint` | "2(6)", "2(5)", "17" | - |

### 4.4.8 `route_query()` Function

```python
def route_query(query, *, max_concepts=6, max_terms=12, max_lift_sections=3, routes=ROUTES):
    matched = [route for route in routes if route.matches(query)]
    if not matched:
        return RoutingResult()

    # Sort by priority, keep tuple order as tie-break
    order = {id(route): index for index, route in enumerate(routes)}
    matched.sort(key=lambda route: (route.priority, order[id(route)]))

    concepts = _dedupe(c for route in matched for c in route.concepts)[:max_concepts]
    terms = _dedupe(t for route in matched for t in route.terms)[:max_terms]
    sections = _dedupe(s for route in matched for s in route.sections)
    lifts = _dedupe(s for route in matched for s in route.lift_sections)[:max_lift_sections]

    kept = set(concepts)
    groups = tuple(tuple(c for c in route.concepts if c in kept) for route in matched)

    return RoutingResult(
        terms=tuple(terms),
        concepts=tuple(concepts),
        routes=tuple(route.name for route in matched),
        sections=tuple(sections),
        lift_targets=tuple(_parse_lift(section) for section in lifts),
        concept_groups=tuple(group for group in groups if group),
    )
```

### 4.4.9 `_parse_lift()`

```python
_LIFT = re.compile(r"^\s*(\w+)\s*(?:\(\s*([^)]+?)\s*\))?\s*$")

def _parse_lift(section: str) -> tuple[str, str | None]:
    # "39" -> ('39', None);  "2(7)" -> ('2', '7')
    match = _LIFT.match(section)
    if not match:
        return section, None
    return match.group(1), match.group(2)
```

Some provisions worth lifting verbatim are a single clause of a very long section. s.2 alone holds 47 definitions, so lifting all of "2" to reach s.2(7) would fill the statute budget with arbitrary neighbors. Naming the subsection lifts exactly the definition the route is about.

### 4.4.10 Special Handling Details

#### `tie_in_or_forced_purchase` route

```python
patterns=_r(
    r"\b(?:forc\w+|compel\w+|insist\w*|oblig\w+)\b[^.?!]{0,40}\b(?:buy|purchase|take|subscrib\w*)\b",
    r"\b(?:made|makes?|making)\b[^.?!]{0,20}\b(?:buy|purchase|take|subscrib\w*)\b",
    r"\bmust\b[^.?!]{0,20}\b(?:also\s+)?(?:buy|purchase|take)\b",
    r"\bonly if (?:i|we)\b[^.?!]{0,20}\b(?:buy|purchase|take)\b",
    r"\bas a condition\b",
    r"\b(?:tie[- ]?in|tying|tied sale|bundl\w+|combo|package deal)\b",
    r"\b(?:refus\w+|won'?t|will not|would not)\b[^.?!]{0,30}\bunless\b",
    r"\b(?:before|unless|until)\b[^.?!]{0,30}\b(?:renew\w*|continu\w*|activat\w*)\b",
)
```

#### `consumer_status_question` - priority 20

```python
patterns=_r(
    r"\b(?:am|are|is|was|were|be|been|being)\b[^.?!]{0,40}\bconsumer\b[^.?!]{0,10}\?",
    r"\b(?:treated|regarded|considered|counted?|classified|qualify|qualifies)\b[^.?!]{0,25}\bconsumer\b",
    r"\bcounts? as a consumer\b",
    r"\bwho (?:is|are|counts? as)\b[^.?!]{0,20}\bconsumer\b",
    r"\bdefinition of (?:a )?consumer\b",
    r"\b(?:personally|myself|actually)\b[^.?!]{0,20}\bpay\b",
    r"\b(?:gift|gifted|present)\w*\b[^.?!]{0,40}\b(?:consumer|complain\w*|claim)\b",
    r"\b(?:someone else|my (?:father|mother|husband|wife|son|daughter|brother|sister|friend|employer))\b[^.?!]{0,40}\b(?:bought|paid|purchased|ordered|booked)\b",
    r"\b(?:user|beneficiary)\b[^.?!]{0,30}\b(?:goods|service|product)\b",
)
```

These patterns handle the two limbs of s.2(7):
- **s.2(7)(i)**: Person who buys goods for consideration, INCLUDING any user of such goods other than the buyer
- **s.2(7)(ii)**: Person who hires/avails of services for consideration, INCLUDING any beneficiary

So a gift recipient and a service beneficiary are both consumers.

## 4.5 Vector Store (`src/vectorStore.py`)

### 4.5.1 ChromaDB Wrapper

```python
class VectorStoreManager:
    def __init__(self, persist_dir: str = "./data/chroma_db"):
        self.persist_dir = persist_dir

    def load(self) -> Chroma:
        self.client = chromadb.PersistentClient(path=self.persist_dir)
        self.collection = self.client.get_or_create_collection(
            name="consumer_protection_v2",
            embedding_function=self._get_embedding_function(),
            metadata={"hnsw:space": "cosine"}
        )
        return Chroma(
            client=self.client,
            collection_name="consumer_protection_v2",
            embedding_function=self._get_embedding_function()
        )

    def rebuild(self, documents: List[Document]):
        self.client.delete_collection("consumer_protection_v2")
        return self.load().add_documents(documents)
```

### 4.5.2 Embedding Model

```python
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
```

### 4.5.3 HNSW Parameters

```python
metadata = {
    "hnsw:space": "cosine",
    "hnsw:construction_ef": 200,    # Higher = better recall, slower build
    "hnsw:search_ef": 100,          # Higher = better recall, slower search
    "hnsw:M": 16                    # Connections per node
}
```

## 4.6 Document Processing (`src/documentBuilder.py`)

### 4.6.1 Knowledge Card v2 Parser

```python
class DocumentBuilder:
    def build_documents(self, json_path: str) -> List[Document]:
        cards = load_json(json_path)
        documents = []

        for card in cards:
            doc = Document(
                page_content=self._format_content(card),
                metadata={
                    "concept_id": card["concept_id"],
                    "title": card["title"],
                    "category": card["category"],
                    "statute": card.get("statute", ""),
                    "sections": card.get("sections", []),
                    "tags": card.get("tags", []),
                    "jurisdiction": card.get("jurisdiction", "india"),
                    "source": "knowledge_card_v2"
                }
            )
            documents.append(doc)

            # Example documents (separate chunks for retrieval)
            for ex in card.get("examples", []):
                documents.append(Document(
                    page_content=f"Example: {ex}",
                    metadata={**doc.metadata, "type": "example"}
                ))

        return documents
```

### 4.6.2 Content Formatting

```python
def _format_content(self, card: dict) -> str:
    parts = [f"Title: {card['title']}", f"Category: {card['category']}"]
    if card.get("statute"):
        parts.append(f"Statute: {card['statute']}")
    if card.get("sections"):
        parts.append(f"Sections: {', '.join(card['sections'])}")
    parts.append(f"Content: {card['content']}")
    return "\n".join(parts)
```

## 4.7 Ingestion Pipeline (`src/ingest.py`)

```python
def build_vector_store():
    """Full rebuild pipeline"""
    # 1. Load knowledge cards
    cards = load_knowledge_cards(
        "legal-dataset/acts/consumer-protection-act-2019/final/v2-knowledge-cards.json"
    )

    # 2. Build documents
    builder = DocumentBuilder()
    documents = builder.build_documents(cards)

    # 3. Create vector store
    manager = VectorStoreManager()
    vector_store = manager.load()

    # 4. Batch add
    vector_store.add_documents(documents)

    print(f"Indexed {len(documents)} documents")
    return vector_store
```

## 4.8 Configuration (`src/config.py`)

```python
# Vector Store
CHROMA_PERSIST_DIR = "./data/chroma_db"
COLLECTION_NAME = "consumer_protection_v2"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Retrieval
TOP_K = 5
BM25_WEIGHT = 0.3
VECTOR_WEIGHT = 0.7
RRF_CONSTANT = 60

# Section Lift
SECTION_LIFT_RANK_CONST = 10
SECTION_LIFT_V2_RANK_CONST = 46
SECTION_LIFT_V2_LIMIT = 6
ROUTED_SECTION_LIFT_RANK_CONST = 14
CONCEPT_ROUTE_RANK_CONST = 42

# Slot Budgets
MAX_ROUTED_STATUTE_SLOTS = 2
MAX_ROUTED_CARD_SLOTS = 2
MAX_EXAMPLES_IN_RESULT = 2
MAX_RESERVED_SLOTS = 2

# Type Weights
TYPE_WEIGHTS = {
    "example": 0.70,
    "relationship": 0.55,
    "alias": 0.40,
    "intent": 0.40,
}

# API
API_HOST = "0.0.0.0"
API_PORT = 8000
```

## 4.9 Dependencies (`requirements.txt`)

```
chromadb>=1.5.9
fastapi>=0.141.1
google-genai>=2.16.0
google-generativeai>=0.8.6
langchain>=1.3.14
langchain-chroma>=1.1.0
langchain-community>=0.4.2
langchain-core>=1.5.3
langchain-google-genai>=4.3.2
langchain-huggingface>=1.2.2
rank-bm25==0.2.2              # NEW
sentence-transformers>=6.0.0   # Updated from 5.6.1
onnxruntime>=1.24.1           # Fixed for Python 3.14
```

## 4.10 Evaluation Framework (`eval/run_eval.py`)

### 4.10.1 Overview

Evaluates retrieval quality using 106 questions from `consumer-eval-set.jsonl`.

### 4.10.2 Test Question Format

```jsonl
{"id": "ev-001", "category": "rights", "question": "What are consumer rights under CPA 2019?", "expected": ["right.right_to_safety", "right.right_to_information"], "alternatives": ["example.right_to_safety"]}
{"id": "ev-067", "category": "procedures", "question": "How can a consumer appeal against an order of the National Commission?", "expected": ["procedure.filing_an_appeal_to_the_supreme_court"], "alternatives": ["example.filing_an_appeal_to_the_supreme_court"]}
```

### 4.10.3 Metrics

- **Strict recall@5**: Exact concept_id match against expected
- **Content recall@5**: Expected OR alternative match

### 4.10.4 Current Results

```
Eval set: 106 questions (k=5)
Strict recall@5:  73.6%  (78/106)
Content recall@5: 99.1%  (105/106)

Category breakdown:
  definitions       21  100.0%   100.0%
  evidence           2  100.0%   100.0%
  exceptions         2    0.0%  100.0%
  jurisdiction      10   60.0%  100.0%
  limitation         2   50.0%  100.0%
  obligations        4   75.0%  100.0%
  offences           4  100.0%  100.0%
  penalties         10   70.0%  100.0%
  procedures        16   50.0%   93.8%
  remedies          11   72.7%  100.0%
  rights            14  100.0%  100.0%
  timelines         10   40.0%  100.0%
```

**Weakest Categories** (need improvement):
- `procedures`: 16/50 (50% strict, 93.8% content)
- `timelines`: 10/40 (40% strict, 100% content)
- `exceptions`: 2/2 (0% strict, 100% content)

## 4.11 Debugging & Monitoring

### 4.11.1 Explain Retrieval

```bash
py -3 -c "
from src.retriever import RAGRetriever
from src.vectorStore import VectorStoreManager
manager = VectorStoreManager()
retriever = RAGRetriever(manager.load())
import json
print(json.dumps(retriever.explain('gym forces me to buy protein powder'), indent=2))
"
```

### 4.11.2 Logging

```python
logger.info(f"Query: {query}")
logger.info(f"Routes: {routing.routes}")
logger.info(f"Routed sections: {routing.lift_targets}")
logger.info(f"Routed concepts: {routing.concepts}")
logger.info(f"Concept groups: {routing.concept_groups}")
```

### 4.11.3 Common Issues

| Issue | Solution |
|-------|----------|
| ChromaDB lock error | Delete `data/chroma_db/*.lock` files |
| Empty results | Check collection exists: `client.list_collections()` |
| Slow queries | Reduce `TOP_K`, increase `hnsw:search_ef` |
| Memory issues | Batch ingestion, don't load all docs in memory |
| Route not firing | Check regex patterns in `concept_routing.py`, verify priority |

## 4.12 Performance Targets

| Operation | Target |
|-----------|--------|
| Vector search (k=5) | < 100ms |
| BM25 search | < 50ms |
| Fusion + filtering | < 20ms |
| **Total retrieval** | **< 200ms** |

## 4.13 Extending for New Domains

### 4.13.1 Add New Act

```bash
# 1. Add JSON cards to legal-dataset/acts/new-act/
# 2. Follow v2 schema (concept_id, category, derived_from, etc.)
# 3. Update ingest.py to load new path
# 4. Rebuild index
py -3 -c "from src.ingest import build_vector_store; build_vector_store()"
# 5. Add eval questions to consumer-eval-set.jsonl
# 6. Run evaluation
py -3 eval/run_eval.py
```

### 4.13.2 Add New Route

```python
# In concept_routing.py, add to ROUTES tuple:
Route(
    name="new_concept",
    priority=50,
    patterns=_r(r"pattern1", r"pattern2"),
    concepts=("definition.new_concept",),
    terms=("new", "concept", "vocabulary"),
    sections=("2(XX)",),
    lift_sections=("XX",),
    note="Explanation of what this route covers"
)
```

## 4.14 Key Files Reference

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/retriever.py` | Core retrieval logic | `RAGRetriever`, `RoutingResult` |
| `src/concept_routing.py` | Lay-language → statutory mapping | `route_query()`, `ROUTES`, `Route` |
| `src/vectorStore.py` | ChromaDB wrapper | `VectorStoreManager` |
| `src/documentBuilder.py` | Knowledge card → Document | `DocumentBuilder` |
| `src/ingest.py` | Index rebuild pipeline | `build_vector_store()` |
| `src/api.py` | FastAPI endpoints | `app`, `QueryRequest`, `QueryResponse` |
| `src/config.py` | Tunable parameters | Constants above |
| `eval/run_eval.py` | Automated evaluation | `main()` |
| `eval/consumer-eval-set.jsonl` | Ground truth questions | 106 test cases |
| `requirements.txt` | Dependencies | See section 3.9 |