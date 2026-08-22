"""
Lay-language -> statutory-concept routing for the Consumer Protection Act, 2019.

WHY THIS EXISTS
---------------
Consumers do not write in statutory vocabulary. They write:

    "a gym forces me to buy their protein powder as a condition for membership"
    "a shop charged me more than the printed price"
    "my builder delayed my flat by three years"

The Act calls those things "restrictive trade practice" (s.2(41)), "unfair trade
practice" (s.2(47)) and "deficiency" in a "service" (s.2(11), s.2(42)). A dense
embedding of the consumer's sentence does not come close to the embedding of
    "restrictive trade practice means a trade practice which tends to bring about
     manipulation of price or its conditions of delivery ..."
so the definitional provision that actually classifies the complaint is never
retrieved. Measured on the 150-question set, every one of the 10 results for a
scenario question was an `example.*` card and the anchor provision was missed
for 11 of them.

The corpus was clearly meant to solve this: it ships 591 `alias.*` and 1,820
`intent.*` cards. But all 2,411 are `KeywordAliasAgent` boilerplate with
`confidence: 0.0`, `review_status: "draft"` and templated `user_queries`
("What is X?", "How does X work?"). They contain no lay language at all - the
corpus has no occurrence of "tying", "MRP", "printed price" or "service charge".
So the bridge has to be built here.

WHAT THIS IS AND IS NOT
-----------------------
This is a RETRIEVAL HINT, not a legal conclusion. A route firing means "put the
provision in front of the model", never "this conduct is unlawful". The answer is
still written only from the verbatim statute the retriever surfaces (PART A of
the rendered context), so a route that fires on a question it does not really fit
costs a little context space and nothing else. Routes are therefore allowed to be
generous.

Every route records the sections it routes to so this file can be reviewed
against the Act itself. The section numbers below were verified against
`legal-dataset/.../final/v2-knowledge-cards.json`, whose 48 `definition.*` cards
map exactly onto s.2(1)-s.2(47), and against the source Gazette PDF.

HOW TO EXTEND
-------------
Add a Route. Keep `concepts` to ids that really exist in the card corpus - a
missing id is skipped silently, so a typo degrades quietly into no routing.
`terms` are appended to the query text and so help both the dense and the BM25
leg; keep them to words that actually appear in the Act.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Sequence

# A single question should not be allowed to drag the entire definitions chapter
# into the candidate set. Broad routes (defect, remedies) fire on almost every
# consumer narrative, so without a cap a five-slot answer context would be all
# routed cards and no retrieved ones.
MAX_ROUTED_CONCEPTS = 6

# Likewise for query expansion: past ~12 added tokens the extra statutory
# vocabulary starts to dominate the embedding of the user's actual sentence.
MAX_ROUTED_TERMS = 12

# Routed section lifts pull VERBATIM statute into the authoritative part of the
# answer context, so a wrongly-inferred section puts irrelevant law in front of
# the model. Three is enough for every question in the 150-question set and
# keeps that risk small.
MAX_ROUTED_LIFT_SECTIONS = 3


@dataclass(frozen=True)
class Route:
    """One lay-language pattern group and the statutory material it points at."""

    name: str
    patterns: tuple[re.Pattern[str], ...]
    concepts: tuple[str, ...]
    terms: tuple[str, ...]
    sections: tuple[str, ...]
    note: str = ""
    # Sections whose verbatim text should be lifted even though the user never
    # named a number. Use this when the question is *about* a provision rather
    # than about a defined term - "how does mediation work", "what is the penalty
    # for ...", "which orders can the Commission pass". Cards summarise; for
    # these questions the consumer needs the provision.
    lift_sections: tuple[str, ...] = ()
    # Lower wins. When several routes match, the retriever can only act on the
    # first few concepts, so this decides which route gets those slots.
    #
    # The distinction that matters is between a route matching what the question
    # ASKS and one matching an incidental noun in the facts. "A washing machine
    # stops working during the warranty period - what consumer-rights issues
    # arise?" matches both the warranty route and the consumer-rights route; the
    # question is about rights, and warranty is background. Relying on physical
    # order in this tuple to express that was too fragile to maintain, so it is
    # stated here instead.
    #
    #   10  the question names a specific right or a specific defence
    #   20  the question uses a statutory term of art
    #   25  the question names its own frame ("what are my rights", "what can I do")
    #   30  the question names the relief sought
    #   50  default: a recognisable fact pattern
    #   60  an incidental noun that is usually background, not the question
    priority: int = 50

    def matches(self, query: str) -> bool:
        return any(pattern.search(query) for pattern in self.patterns)


def _r(*patterns: str) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(p, re.I) for p in patterns)


# ---------------------------------------------------------------------------
# The lexicon. Ordered most-specific-first, because MAX_ROUTED_CONCEPTS trims
# from the end: a precise route (tie-in sales) must outrank a broad one (defect).
# ---------------------------------------------------------------------------

ROUTES: tuple[Route, ...] = (
    # ------------------------------------------------------------------
    # The six rights in s.2(9), first because a question that names one of
    # them is asking about that right and nothing else. Each right has its own
    # card, and the card's `derived_from` points straight at CPA2019-CH1-S2-9.
    #
    # Careful: `right.right_to_protection` is NOT one of these - it derives from
    # s.5 (the Central Consumer Protection Council). The s.2(9)(i) card is
    # `right.right_to_protection_against_hazardous_goods`. Routing to the
    # similarly named card would cite the wrong provision, which is exactly the
    # class of error this whole exercise exists to remove.
    # ------------------------------------------------------------------
    Route(
        name="right_to_safety",
        priority=10,
        patterns=_r(
            r"\bright to (?:protection|safety|be protected)\b",
            r"\bright\b[^.?!]{0,30}\b(?:hazardous|unsafe|dangerous)\b",
            r"\b(?:hazardous|dangerous)\b[^.?!]{0,30}\b(?:to life|to property|goods|products?|chemical)\b",
        ),
        concepts=(
            "right.right_to_protection_against_hazardous_goods",
            "definition.consumer_rights",
        ),
        terms=("right", "protection", "hazardous", "life", "property"),
        sections=("2(9)(i)",),
        note="s.2(9)(i): the right to be protected against the marketing of goods, "
        "products or services which are hazardous to life and property.",
    ),
    Route(
        name="right_to_be_informed",
        priority=10,
        patterns=_r(
            r"\bright to (?:be informed|information)\b",
            r"\b(?:quality|quantity|potency|purity|standard)\b[^.?!]{0,40}\bprice\b",
        ),
        concepts=(
            "right.right_to_information",
            "definition.consumer_rights",
        ),
        terms=("right", "informed", "quality", "quantity", "potency", "purity"),
        sections=("2(9)(ii)",),
        note="s.2(9)(ii): the right to be informed about the quality, quantity, "
        "potency, purity, standard and price of goods or services.",
    ),
    Route(
        name="right_to_choose",
        priority=10,
        patterns=_r(
            r"\bright to (?:choose|choice)\b",
            r"\bright of access to (?:a )?variety\b",
        ),
        concepts=(
            "right.right_to_access_to_variety_of_goods",
            "definition.consumer_rights",
        ),
        terms=("right", "access", "variety", "competitive", "price"),
        sections=("2(9)(iii)",),
        note="s.2(9)(iii): the right to be assured, wherever possible, of access to "
        "a variety of goods, products or services at competitive prices.",
    ),
    Route(
        name="right_to_be_heard",
        priority=10,
        patterns=_r(
            r"\bright to be heard\b",
            r"\bright\b[^.?!]{0,30}\bdue consideration\b",
        ),
        concepts=(
            "right.right_to_be_heard",
            "definition.consumer_rights",
        ),
        terms=("right", "heard", "due", "consideration", "appropriate", "forum"),
        sections=("2(9)(iv)",),
        note="s.2(9)(iv): the right to be heard and to be assured that consumer's "
        "interests will receive due consideration at appropriate fora. It is a right "
        "to be heard, not a right to a particular outcome - questions asking whether "
        "it guarantees a refund or a replacement are answered by this provision "
        "read with s.39.",
    ),
    Route(
        name="right_to_redressal",
        priority=10,
        patterns=_r(
            r"\bright to (?:seek )?redressal\b",
            r"\bunscrupulous exploitation\b",
        ),
        concepts=(
            "right.right_to_redressal",
            "definition.consumer_rights",
        ),
        terms=("right", "redressal", "unfair", "restrictive", "exploitation"),
        sections=("2(9)(v)",),
        note="s.2(9)(v): the right to seek redressal against unfair or restrictive "
        "trade practices or unscrupulous exploitation of consumers.",
    ),
    Route(
        name="right_to_consumer_education",
        priority=10,
        patterns=_r(
            r"\bright to consumer (?:education|awareness)\b",
            r"\bconsumer (?:education|awareness)\b",
        ),
        concepts=(
            "right.right_to_consumer_awareness",
            "definition.consumer_rights",
        ),
        terms=("right", "consumer", "education", "awareness"),
        sections=("2(9)(vi)",),
        note="s.2(9)(vi): the right to consumer awareness.",
    ),
    Route(
        name="product_liability_defences",
        priority=10,
        patterns=_r(
            r"\b(?:defence|defense|exception|exempt\w*|escape|avoid|not liable|excluded from liability)\w*\b[^.?!]{0,60}\b(?:liab\w+|manufacturer|seller|action)\b",
            r"\b(?:liab\w+|manufacturer|seller)\b[^.?!]{0,40}\b(?:defence|defense|exception|not liable|exempt\w*)\b",
            r"\b(?:misuse[d]?|alter\w+|modif\w+)\b[^.?!]{0,40}\bproduct\b",
        ),
        concepts=(),
        terms=("exception", "liability", "misused", "altered", "modified", "warning"),
        sections=("87",),
        lift_sections=("87",),
        note="s.87 lists the exceptions to a product liability action - the defences. "
        "Kept ahead of the other product-liability routes, which lift s.84/85/86 "
        "(who is liable) and would otherwise answer a defences question with the "
        "liability provisions.",
    ),
    Route(
        name="explicit_statutory_term",
        priority=20,
        patterns=_r(
            r"\bunfair trade practice\b",
        ),
        concepts=("definition.unfair_trade_practice",),
        terms=("unfair", "trade", "practice"),
        sections=("2(47)",),
        note="The user used the statutory term itself, so the defining provision is "
        "certainly relevant. Cheap and high-precision - never rely on the dense "
        "leg to find a definition the question already named.",
    ),
    Route(
        name="explicit_statutory_term_restrictive",
        priority=20,
        patterns=_r(r"\brestrictive trade practice\b"),
        concepts=("definition.restrictive_trade_practice",),
        terms=("restrictive", "trade", "practice"),
        sections=("2(41)",),
    ),
    Route(
        name="explicit_statutory_term_deficiency",
        priority=20,
        patterns=_r(r"\bdeficiency (?:of|in) service\b", r"\bdeficiency\b"),
        concepts=("definition.deficiency", "definition.service"),
        terms=("deficiency", "service"),
        sections=("2(11)", "2(42)"),
    ),
    Route(
        name="explicit_statutory_term_product_liability",
        priority=20,
        patterns=_r(r"\bproduct liability\b"),
        concepts=(
            "definition.product_liability",
            "definition.harm",
        ),
        terms=("product", "liability", "harm"),
        sections=("2(34)", "2(22)"),
        lift_sections=("84", "85", "86"),
        note="Chapter VI fixes liability on the product manufacturer (s.84), the "
        "product service provider (s.85) and the product seller (s.86); a product "
        "liability question is nearly always asking which of the three answers.",
    ),
    Route(
        name="who_is_liable",
        patterns=_r(
            r"\bwho (?:is|are|would be|will be)\b[^.?!]{0,25}\b(?:responsible|liable|at fault)\b",
            r"\b(?:seller or (?:the )?manufacturer|manufacturer or (?:the )?seller)\b",
            r"\bcan (?:a |the )?(?:product )?manufacturer be held liable\b",
            r"\bheld liable\b",
        ),
        concepts=("definition.product_liability",),
        terms=("liable", "liability", "manufacturer", "seller", "provider"),
        sections=("2(34)",),
        lift_sections=("84", "85", "86"),
        note="Routes to the three liability provisions rather than guessing one.",
    ),
    Route(
        name="mediation",
        patterns=_r(
            r"\bmediat\w+\b",
            r"\b(?:settle|settlement)\b[^.?!]{0,30}\b(?:out of court|amicabl\w+|mutual\w*)\b",
        ),
        concepts=("definition.mediation", "definition.mediator"),
        terms=("mediation", "settlement", "mediator", "cell"),
        sections=("2(25)", "2(26)", "74"),
        lift_sections=("37", "79", "80"),
        note="s.37(1) is the provision that refers a dispute to mediation and the "
        "one that carries the exclusion - settlement is referred 'except in such "
        "cases as may be prescribed' - so a question about when mediation is or is "
        "not available is answered from there. s.79 where mediation is held, s.80 "
        "the settlement record. s.74 is deliberately NOT lifted: it only requires "
        "the State Government to establish mediation cells, and lifting it filled "
        "the statute slots with administrative text while the substantive "
        "provisions were pushed out.",
    ),
    Route(
        name="punishment_for_spurious_or_adulterated_goods",
        patterns=_r(
            r"\b(?:penalt(?:y|ies)|punish\w+|fine|imprison\w+|jail|sentence)\b[^.?!]{0,60}\b(?:spurious|adulter\w+|counterfeit|fake|duplicate)\b",
            r"\b(?:spurious|adulter\w+)\b[^.?!]{0,60}\b(?:penalt(?:y|ies)|punish\w+|fine|imprison\w+|jail)\b",
        ),
        concepts=("definition.spurious_goods",),
        terms=("spurious", "adulterant", "punishment", "imprisonment", "fine"),
        sections=("90", "91"),
        lift_sections=("91", "90"),
        note="s.91 punishes manufacture/storage/sale/distribution/import of spurious "
        "goods and s.90 does the same for products containing an adulterant. Both "
        "grade the punishment by the injury caused, so the text must be quoted "
        "exactly. Listed ahead of the general penalty route because the general one "
        "also matches and its sections (72/88/89) are the wrong ones here.",
    ),
    Route(
        name="penalty_or_punishment",
        patterns=_r(
            r"\b(?:penalt(?:y|ies)|punish\w+|fine|imprison\w+|jail|sentence|prosecut\w+)\b",
            r"\bwhat happens (?:if|for|when)\b[^.?!]{0,40}\b(?:fail|not compl\w+|contraven\w+|violat\w+|second|subsequent)\b",
            r"\b(?:civil or criminal|criminal or civil)\b",
            r"\bobstruct\w+\b",
        ),
        concepts=(),
        terms=("penalty", "punishment", "imprisonment", "fine", "contravention"),
        sections=("72", "88", "89"),
        lift_sections=("72", "88", "89"),
        note="s.72 non-compliance with a Commission order, s.88 non-compliance with "
        "a Central Authority direction under s.20/21, s.89 false or misleading "
        "advertisement by a manufacturer or service provider. Deliberately lifts "
        "the provisions instead of naming concept cards, because the amount of the "
        "fine and the term of imprisonment must be quoted exactly.",
    ),
    Route(
        name="orders_the_commission_may_pass",
        patterns=_r(
            r"\borders?\b[^.?!]{0,35}\b(?:district commission|state commission|national commission|commission) (?:may|can|shall)\b",
            r"\b(?:which|what) (?:provision|section)\b[^.?!]{0,40}\borders?\b",
            r"\b(?:withdraw\w*|recall|remov\w+|discontinu\w+)\b[^.?!]{0,35}\b(?:hazardous|dangerous|unsafe|from the market)\b",
            r"\bcan the commission (?:order|direct)\b",
        ),
        concepts=(),
        terms=("orders", "district", "commission", "direct", "remove", "withdraw"),
        sections=("39",),
        lift_sections=("39", "20"),
        note="s.39 lists the orders a District Commission may make; s.20 gives the "
        "Central Authority the recall and withdrawal powers.",
    ),
    Route(
        name="establishment_and_appointments",
        patterns=_r(
            r"\b(?:establish\w*|constitut\w+|set up|composition)\b[^.?!]{0,40}\b(?:commission|authority|council)\b",
            r"\bwho appoints\b",
            r"\b(?:president|member)s?\b[^.?!]{0,30}\b(?:appoint\w*|qualif\w+|tenure|salary)\b",
        ),
        concepts=(),
        terms=("establish", "notification", "president", "members", "appointed"),
        sections=("28", "42", "53"),
        lift_sections=("28", "42", "53"),
        note="s.28 District Commission, s.42 State Commission, s.53 National "
        "Commission - the establishment provisions.",
    ),
    Route(
        name="immovable_property_purchase",
        patterns=_r(
            r"\b(?:plot|land|flat|apartment|villa|house|property)\b[^.?!]{0,40}\b(?:purchas\w+|bought|booked|not deliver\w*|possession)\b",
            r"\b(?:purchas\w+|bought|booked)\b[^.?!]{0,25}\b(?:plot|land|flat|apartment|villa|house)\b",
        ),
        concepts=(
            "definition.goods",
            "definition.service",
        ),
        terms=("goods", "service", "immovable", "property", "housing"),
        sections=("2(21)", "2(42)"),
        note="Whether immovable property is 'goods' under s.2(21) or the "
        "transaction is a 'service' under s.2(42) is the threshold question in "
        "every real-estate consumer dispute.",
    ),
    Route(
        name="tie_in_or_forced_purchase",
        patterns=_r(
            r"\b(?:forc\w+|compel\w+|insist\w*|oblig\w+)\b[^.?!]{0,40}\b(?:buy|purchase|take|subscrib\w*)\b",
            # "made me buy", "makes us take" - the commonest lay phrasing of a
            # tie-in, and the one the eval set happened not to contain.
            r"\b(?:made|makes?|making)\b[^.?!]{0,20}\b(?:buy|purchase|take|subscrib\w*)\b",
            r"\bmust\b[^.?!]{0,20}\b(?:also\s+)?(?:buy|purchase|take)\b",
            r"\bonly if (?:i|we)\b[^.?!]{0,20}\b(?:buy|purchase|take)\b",
            r"\bas a condition\b",
            r"\b(?:tie[- ]?in|tying|tied sale|bundl\w+|combo|package deal)\b",
            r"\b(?:refus\w+|won'?t|will not|would not)\b[^.?!]{0,30}\bunless\b",
            # Conditioning a renewal or continuation on a further purchase.
            r"\b(?:before|unless|until)\b[^.?!]{0,30}\b(?:renew\w*|continu\w*|activat\w*)\b",
        ),
        concepts=("definition.restrictive_trade_practice",),
        terms=("restrictive", "trade", "practice", "tie", "up", "sales", "conditions"),
        sections=("2(41)",),
        note="s.2(41) covers practices manipulating price or conditions of delivery, "
        "including tie-up sales.",
    ),
    Route(
        name="overcharging_above_printed_price",
        patterns=_r(
            r"\b(?:more|higher|extra|above|over|beyond)\b[^.?!]{0,30}\b(?:printed|displayed|marked|listed|mrp|maximum retail)\b",
            r"\bovercharg\w*\b",
            r"\bcharg\w+ (?:me |us )?(?:more|extra|higher)\b",
            r"\b(?:printed|marked|displayed|labelled|labeled) (?:price|rate|mrp)\b",
            # "MRP" is retail shorthand that a consumer uses only when price is
            # the complaint, so the bare term is a safe signal on its own. It is
            # also absent from every card in the corpus, which is why the dense
            # leg can never bridge it.
            r"\bm\.?r\.?p\.?\b",
            r"\bmaximum retail price\b",
            r"\babove mrp\b",
        ),
        concepts=(
            "definition.unfair_trade_practice",
            "definition.complaint",
        ),
        terms=("unfair", "trade", "practice", "price", "charging", "excess"),
        sections=("2(47)", "2(6)"),
        note="Charging in excess of the displayed price is dealt with as an unfair "
        "trade practice under s.2(47).",
    ),
    Route(
        name="hidden_or_undisclosed_charges",
        patterns=_r(
            r"\b(?:hidden|undisclosed|secret)\b[^.?!]{0,20}\b(?:charge|fee|cost|clause|term)\w*\b",
            r"\bwithout (?:telling|informing|mentioning|disclosing|my knowledge|consent)\b",
            r"\b(?:service charge|surcharge|convenience fee|handling (?:fee|charge))\b",
            r"\badded\b[^.?!]{0,25}\b(?:to (?:my|the) bill|automatically)\b",
        ),
        concepts=(
            "definition.unfair_trade_practice",
            "definition.complaint",
        ),
        terms=("unfair", "trade", "practice", "deceptive", "statement", "charge"),
        sections=("2(47)", "2(6)"),
        note="Undisclosed charges are approached through the unfair-trade-practice "
        "definition in s.2(47).",
    ),
    Route(
        name="insurance_claim_repudiated",
        patterns=_r(
            r"\binsur\w+\b[^.?!]{0,40}\b(?:claim|reject\w*|denie?d|repudiat\w*)\b",
            r"\bclaim (?:was |got )?(?:rejected|denied|repudiated|refused)\b",
            r"\bpolicy\b[^.?!]{0,25}\b(?:reject\w*|denie?d|lapse\w*)\b",
        ),
        concepts=(
            "definition.deficiency",
            "definition.service",
        ),
        terms=("deficiency", "service", "insurance", "shortcoming", "inadequacy"),
        sections=("2(11)", "2(42)"),
        note="Insurance is an enumerated service in s.2(42); a repudiated claim is "
        "framed as deficiency under s.2(11).",
    ),
    Route(
        name="delayed_possession_or_construction",
        patterns=_r(
            r"\b(?:delay\w*|late|not (?:deliver|complet|hand)\w*|never (?:deliver|complet)\w*)\b[^.?!]{0,45}\b(?:possession|flat|apartment|house|villa|plot|project|construction|booking)\b",
            r"\b(?:builder|developer|promoter|contractor)\b",
            r"\bhousing (?:project|society)\b",
        ),
        concepts=(
            "definition.deficiency",
            "definition.service",
        ),
        terms=("deficiency", "service", "housing", "construction", "performance"),
        sections=("2(11)", "2(42)"),
        note="Housing construction is a service under s.2(42); delay is deficiency "
        "under s.2(11).",
    ),
    Route(
        name="medical_or_professional_service",
        patterns=_r(
            r"\b(?:doctor|physician|surgeon|dentist|hospital|clinic|nursing home|medical|treatment|surgery|diagnos\w+|prescription)\b",
            r"\b(?:lawyer|advocate|architect|chartered accountant|engineer)\b[^.?!]{0,30}\b(?:negligen\w+|fail\w+|wrong)\b",
        ),
        concepts=(
            "definition.service",
            "definition.deficiency",
        ),
        terms=("service", "deficiency", "negligence", "performance", "quality"),
        sections=("2(42)", "2(11)"),
        note="Routes to the service and deficiency definitions. Whether a given "
        "professional service is covered is for the model to reason about from "
        "the text of s.2(42), not for this table to decide.",
    ),
    Route(
        name="ecommerce_or_online_purchase",
        patterns=_r(
            r"\b(?:online|e-?commerce|marketplace|website|web site|mobile app|the app)\b",
            r"\bordered\b[^.?!]{0,20}\b(?:online|on the app|from the website)\b",
            r"\b(?:third[- ]party seller|platform|aggregator)\b",
            r"\bnever (?:arrived|delivered|showed up)\b",
        ),
        concepts=(
            "definition.e_commerce",
            "definition.electronic_service_provider",
            "definition.product_seller",
        ),
        terms=("commerce", "electronic", "service", "provider", "digital", "network"),
        sections=("2(16)", "2(17)", "2(37)"),
        note="s.2(16) e-commerce, s.2(17) electronic service provider, s.2(37) "
        "product seller - the three provisions that decide who a consumer can "
        "proceed against online.",
    ),
    Route(
        name="spurious_or_counterfeit_goods",
        patterns=_r(
            r"\b(?:fake|duplicate|counterfeit|spurious|imitation|first copy|not genuine|knock[- ]?off)\b",
            r"\bfalsely (?:claim|represent)\w*\b",
        ),
        concepts=(
            "definition.spurious_goods",
            "definition.goods",
        ),
        terms=("spurious", "goods", "falsely", "claimed", "genuine"),
        sections=("2(43)", "2(21)"),
        note="s.2(43) defines spurious goods as goods falsely claimed to be genuine.",
    ),
    Route(
        name="misleading_advertisement",
        patterns=_r(
            r"\b(?:advertis\w+|ad|commercial|promotion|brochure|hoarding)\b[^.?!]{0,45}\b(?:false|misleading|wrong|untrue|not true|exaggerat\w+|never mentioned)\b",
            r"\b(?:false|misleading)\b[^.?!]{0,25}\b(?:claim|promise|representation|advertis\w+|description)\b",
            r"\bmisleading\b",
            r"\badvertised\b[^.?!]{0,40}\bbut\b",
        ),
        concepts=(
            "definition.misleading_advertisement",
            "definition.unfair_trade_practice",
            "definition.advertisement",
        ),
        terms=("misleading", "advertisement", "false", "description", "guarantee"),
        sections=("2(28)", "2(47)", "2(1)"),
        note="s.2(28) misleading advertisement; s.2(47) unfair trade practice, whose "
        "opening limb covers false representations made to promote goods or "
        "services - an advertising complaint almost always engages both.",
    ),
    Route(
        name="warranty_or_guarantee",
        priority=60,
        patterns=_r(
            r"\b(?:warrant(?:y|ies)|guarantee\w*|assured|promised)\b[^.?!]{0,30}\b(?:year|month|period|replace\w*|repair\w*)\b",
            r"\bwarrant(?:y|ies|ed)\b",
            # "guarantee" on its own is dropped deliberately. In ordinary English
            # it is a verb meaning "ensure" - "does the right to be heard
            # guarantee a refund?" is a question about s.2(9)(iv), not about an
            # express warranty, and routing it here cited the wrong provision.
            # Only noun uses are safe to match.
            r"\b(?:under|within|during|covered by) (?:the )?guarantee\b",
            r"\bguarantee (?:period|card|certificate)\b",
            r"\bwithin (?:the )?(?:warranty|guarantee) period\b",
        ),
        concepts=(
            "definition.express_warranty",
            "definition.product_service_provider",
        ),
        terms=("express", "warranty", "conform", "product", "undertaking"),
        sections=("2(20)", "2(38)"),
        note="s.2(20) express warranty. Liability for failing to conform to it sits "
        "in Chapter VI, which the model reaches from the retrieved statute.",
    ),
    Route(
        name="harm_injury_or_product_liability",
        patterns=_r(
            r"\b(?:injur\w+|hurt|wounded|burn\w*|electric shock|explod\w*|caught fire|poison\w*|food poisoning)\b",
            r"\bcaused\b[^.?!]{0,25}\b(?:harm|injury|damage|illness|death)\b",
            r"\b(?:fell ill|got sick|hospitalis\w+|hospitaliz\w+)\b",
            r"\bproduct liability\b",
        ),
        concepts=(
            "definition.harm",
            "definition.product_liability",
            "definition.product_liability_action",
        ),
        terms=("harm", "injury", "product", "liability", "compensation", "damage"),
        sections=("2(22)", "2(34)", "2(35)"),
        note="s.2(22) harm, s.2(34) product liability, s.2(35) product liability action.",
    ),
    Route(
        name="unfair_contract_terms",
        patterns=_r(
            r"\b(?:one[- ]sided|unfair)\b[^.?!]{0,25}\b(?:term|clause|contract|condition|agreement)\w*\b",
            r"\b(?:fine print|standard form contract|take it or leave it)\b",
            r"\bcontract\b[^.?!]{0,30}\b(?:unilateral\w*|change\w* (?:the )?terms)\b",
        ),
        concepts=("definition.unfair_contract",),
        terms=("unfair", "contract", "significant", "change", "rights"),
        sections=("2(46)",),
        note="s.2(46) unfair contract.",
    ),
    Route(
        name="endorsement_by_celebrity",
        patterns=_r(
            r"\b(?:celebrit\w+|actor|actress|cricketer|influencer|brand ambassador)\b",
            r"\bendors\w+\b",
        ),
        concepts=("definition.endorsement",),
        terms=("endorsement", "advertisement", "representation"),
        sections=("2(18)",),
        note="s.2(18) endorsement.",
    ),
    Route(
        name="direct_selling",
        patterns=_r(
            r"\b(?:door[- ]to[- ]door|direct selling|multi[- ]level|network marketing)\b",
            r"\b(?:agent|salesman|representative)\b[^.?!]{0,25}\b(?:came|visited|home|house)\b",
        ),
        concepts=("definition.direct_selling",),
        terms=("direct", "selling", "marketing", "goods", "services"),
        sections=("2(13)",),
        note="s.2(13) direct selling.",
    ),
    Route(
        name="appeal_against_order",
        patterns=_r(
            r"\bappeal\w*\b",
            r"\b(?:challenge|contest|set aside|revision|review)\b[^.?!]{0,30}\b(?:order|decision|judgment|award)\b",
            r"\b(?:aggrieved|unhappy|dissatisfied)\b[^.?!]{0,30}\b(?:order|decision|judgment)\b",
            r"\b(?:higher|next) (?:forum|commission|authority|court)\b",
        ),
        concepts=(),
        terms=("appeal", "aggrieved", "order", "prefer", "days", "period"),
        sections=("41", "51", "67"),
        lift_sections=("41", "51", "67"),
        note="s.41 appeal from the District Commission to the State Commission "
        "(forty-five days), s.51 State to National, s.67 National to the Supreme "
        "Court. Lifted verbatim because the appeal window and the deposit "
        "requirement have to be exact. Placed before the forum route: an appeal "
        "question is about which order is being challenged, not about pecuniary "
        "jurisdiction, and letting the forum route answer it returned the "
        "pecuniary-limit cards instead of the appeal provision.",
    ),
    Route(
        name="laboratory_testing_of_goods",
        priority=60,
        patterns=_r(
            r"\b(?:laborator\w+|lab test\w*)\b",
            r"\bsample\b[^.?!]{0,30}\b(?:sent|sealed|test\w*|examin\w+|analys\w+)\b",
            r"\b(?:sent|refer\w+|submit\w+)\b[^.?!]{0,25}\bfor (?:testing|analysis)\b",
            r"\bhow (?:are|is)\b[^.?!]{0,30}\bdefects?\b[^.?!]{0,20}\b(?:examin\w+|determin\w+|prov\w+)\b",
        ),
        concepts=("definition.appropriate_laboratory",),
        terms=("appropriate", "laboratory", "sample", "defect", "analysis", "report"),
        sections=("38",),
        lift_sections=("38",),
        note="s.38 governs the District Commission's procedure on admission of a "
        "complaint, including referring a sample of the goods to an appropriate "
        "laboratory and the fee and time limits for the analysis. s.2(1) defines "
        "'appropriate laboratory'.",
    ),
    Route(
        name="forum_and_pecuniary_jurisdiction",
        patterns=_r(
            r"\bwh(?:ere|ich)\b[^.?!]{0,30}\b(?:file|complain|approach|forum|commission|court)\b",
            r"\bpecuniary (?:limit|jurisdiction|value)\b",
            r"\bhow much\b[^.?!]{0,30}\b(?:claim|value|worth)\b",
            # Naming a Commission is not on its own a jurisdiction question:
            # "how do I appeal against an order of the District Commission?"
            # used to land here and get the pecuniary-limit cards. Require the
            # name to sit next to a jurisdiction or filing word.
            r"\b(?:district|state|national) commission\b[^.?!]{0,40}\b(?:jurisdiction|limit|value|competent|entertain|up to|exceed\w*)\b",
            r"\b(?:jurisdiction|limit|value|competent|entertain)\b[^.?!]{0,40}\b(?:district|state|national) commission\b",
            r"\b(?:claim|complaint|dispute|goods|services)\b[^.?!]{0,30}\b(?:worth|valued at|of)\b[^.?!]{0,20}\b(?:lakh|crore|rupees)\b",
        ),
        concepts=(
            "jurisdiction.district_commission_up_to_one_crore_rupees_where_the_opposite_party_resides_or_c",
            "jurisdiction.state_commission_exceeds_rupees_one_crore_but_does_not_exceed_rupees_ten_crore_w",
            "jurisdiction.national_commission_exceeds_ten_crore_rupees_no_territorial_limits_mentioned",
        ),
        terms=("jurisdiction", "pecuniary", "value", "consideration", "commission"),
        sections=("34(1)", "47(1)", "58(1)"),
        note="The enacted values in s.34/47/58 each carry a proviso letting the "
        "Central Government prescribe other values, so the retrieved statute must "
        "be read together with the current prescription.",
    ),
    Route(
        name="limitation_period",
        patterns=_r(
            r"\b(?:time limit|how long|too late|deadline|limitation period|time[- ]barred)\b",
            r"\b(?:\d+|two|three|four|five|several)\s+(?:years?|months?)\s+(?:ago|later|back)\b",
            r"\bstill (?:file|complain)\b",
        ),
        concepts=(
            "timeline.two_years",
            "right.right_to_file_a_late_complaint",
        ),
        terms=("limitation", "two", "years", "period", "cause", "action"),
        sections=("69(1)", "69(2)"),
        note="s.69(1) two-year limitation; s.69(2) condonation of delay.",
    ),
    Route(
        name="consumer_rights_overview",
        priority=25,
        patterns=_r(
            # Singular "consumer right" matters: "the difference between a
            # consumer right and a consumer remedy" is a rights question.
            r"\b(?:my rights|consumer[- ]rights?|what rights|rights under the act|six rights)\b",
            r"\bwhat (?:can|should|do) i do\b",
            r"\bwhat are my (?:options|remedies|choices)\b",
        ),
        concepts=(
            "definition.consumer_rights",
            "definition.complaint",
        ),
        terms=("consumer", "rights", "redressal", "relief"),
        sections=("2(9)", "2(6)"),
        note="s.2(9) enumerates the six consumer rights; s.2(6) what may be "
        "complained of.",
    ),
    Route(
        name="remedies_sought",
        priority=30,
        patterns=_r(
            r"\b(?:refund|money back|replace\w*|compensat\w*|damages|relief|remedy|remedies)\b",
            r"\bcan i (?:get|claim|recover)\b",
        ),
        concepts=(
            "right.right_to_refund",
            "right.right_to_replacement",
            "right.right_to_compensation",
        ),
        terms=("refund", "replacement", "compensation", "order", "relief"),
        sections=("39(1)",),
        note="s.39(1) lists the orders a District Commission may make.",
    ),
    Route(
        name="defect_in_goods",
        patterns=_r(
            r"\b(?:defect\w*|fault\w*|broken|damaged|malfunction\w*|not working|stopped working|does ?n[o']?t work)\b",
            r"\b(?:poor|bad|substandard|inferior) quality\b",
        ),
        concepts=(
            "definition.defect",
            "definition.goods",
        ),
        terms=("defect", "goods", "fault", "imperfection", "standard", "quality"),
        sections=("2(10)", "2(21)"),
        note="s.2(10) defect, s.2(21) goods.",
    ),
    Route(
        name="deficiency_in_service",
        patterns=_r(
            r"\b(?:poor|bad|inadequate|negligent|shoddy) service\b",
            r"\bservice\b[^.?!]{0,25}\b(?:not (?:provided|rendered|performed)|never (?:provided|came))\b",
            r"\bnegligen\w+\b",
            r"\bdeficien\w+\b",
        ),
        concepts=(
            "definition.deficiency",
            "definition.service",
        ),
        terms=("deficiency", "service", "quality", "nature", "performance"),
        sections=("2(11)", "2(42)"),
        note="s.2(11) deficiency, s.2(42) service.",
    ),
    # ------------------------------------------------------------------
    # "Am I even a consumer?" is the threshold question in every case, and it
    # arrives in two very different shapes. Asked OUTRIGHT it is the whole
    # question and must win the routed slots. Present only as background - "I
    # bought a fridge and it broke" - it is incidental, and the fact-pattern
    # route (defect, deficiency, delayed possession) should win instead. The
    # two shapes are therefore separate routes at different priorities; merging
    # them would either bury the outright question or let every first-person
    # narrative in the corpus outrank its own facts.
    # ------------------------------------------------------------------
    Route(
        name="consumer_status_question",
        priority=20,
        patterns=_r(
            # "am I a consumer", "is he a consumer", "can I be treated as a
            # consumer", "would that make me a consumer", "count as a consumer"
            r"\b(?:am|are|is|was|were|be|been|being)\b[^.?!]{0,40}\bconsumer\b[^.?!]{0,10}\?",
            r"\b(?:treated|regarded|considered|counted?|classified|qualify|qualifies)\b"
            r"[^.?!]{0,25}\bconsumer\b",
            r"\bcounts? as a consumer\b",
            r"\bwho (?:is|are|counts? as)\b[^.?!]{0,20}\bconsumer\b",
            r"\bdefinition of (?:a )?consumer\b",
            # b035: "Does a person have to personally pay for a product to be a
            # consumer?" - the consideration limb. b036: a gift, i.e. the
            # "includes any user of such goods other than the person who buys"
            # limb of s.2(7)(i), and its "beneficiary of such service" twin in
            # s.2(7)(ii). Neither matched the old pattern set.
            r"\b(?:personally|myself|actually)\b[^.?!]{0,20}\bpay\b",
            r"\b(?:didn'?t|did not|never|not)\s+(?:personally\s+)?pay\b",
            r"\b(?:gift|gifted|present)\w*\b[^.?!]{0,40}\b(?:consumer|complain\w*|claim)\b",
            r"\b(?:someone else|my (?:father|mother|husband|wife|son|daughter|"
            r"brother|sister|friend|employer))\b[^.?!]{0,40}\b(?:bought|paid|"
            r"purchased|ordered|booked)\b",
            r"\b(?:user|beneficiary)\b[^.?!]{0,30}\b(?:goods|service|product)\b",
        ),
        concepts=(
            "definition.consumer",
            "definition.complainant",
        ),
        terms=(
            "consumer",
            "consideration",
            "user",
            "beneficiary",
            "approval",
            "deferred payment",
        ),
        sections=("2(7)",),
        # Lifted at clause level: s.2 carries 47 definitions, so lifting the
        # whole section would spend the statute budget on arbitrary neighbours.
        lift_sections=("2(7)",),
        note="s.2(7) verbatim: 'consumer' means any person who (i) buys any "
        "goods for a consideration ... and includes any user of such goods "
        "other than the person who buys such goods ... when such use is made "
        "with the approval of such person; and (ii) hires or avails of any "
        "service ... and includes any beneficiary of such service. So a gift "
        "recipient and a service beneficiary are both consumers, and paying "
        "personally is not required - which is exactly what these questions "
        "ask. The Explanation carries the 'commercial purpose' carve-out and "
        "the livelihood-by-self-employment exception.",
    ),
    Route(
        name="consumer_status_threshold",
        patterns=_r(
            r"\bi (?:bought|purchased|ordered|paid|hired|availed|booked|engaged)\b",
            r"\bam i a consumer\b",
            r"\b(?:my|our) (?:purchase|order|booking)\b",
        ),
        concepts=(
            "definition.consumer",
            "definition.complaint",
        ),
        terms=("consumer", "consideration", "goods", "services", "complaint"),
        sections=("2(7)", "2(6)"),
        note="Whether the person is a 'consumer' under s.2(7) is the threshold "
        "question in every case, so any first-person purchase narrative routes "
        "to it. Kept at default priority: here consumer status is background, "
        "not the question - see `consumer_status_question` above.",
    ),
    Route(
        name="filing_procedure",
        patterns=_r(
            r"\bhow (?:do|to|can) i\b[^.?!]{0,25}\b(?:file|lodge|register|submit)\b",
            r"\bfile a (?:case|complaint|suit)\b",
            r"\bcomplaint (?:process|procedure|format)\b",
        ),
        concepts=(
            "definition.complaint",
            "definition.complainant",
            "right.right_to_file_complaint",
        ),
        terms=("complaint", "complainant", "file", "manner", "prescribed"),
        sections=("2(6)", "2(5)", "17"),
        note="s.2(6) complaint, s.2(5) complainant, s.17 right to file.",
    ),
)


@dataclass
class RoutingResult:
    """What routing decided, kept inspectable so it can be logged and audited."""

    terms: tuple[str, ...] = ()
    concepts: tuple[str, ...] = ()
    routes: tuple[str, ...] = ()
    sections: tuple[str, ...] = field(default=())
    # (section, subsection) pairs in the shape `_lift_section_docs` expects, so
    # the retriever can reuse the existing statute-lift path unchanged.
    lift_targets: tuple[tuple[str, str | None], ...] = ()
    # `concepts` again, but grouped by the route that contributed each one and
    # in the same priority order as `routes`.
    #
    # The flat list loses which route asked for what, and that matters: a
    # question often has two frames at once - "a shop charged me above the
    # printed price" (the conduct) and "what remedy do I have" (the relief) -
    # and a complete answer needs one provision from each. Given only the flat
    # list the retriever cannot tell where one route's concepts end and the
    # next route's begin, so it would spend its whole reservation on the
    # first route and drop the other frame entirely.
    concept_groups: tuple[tuple[str, ...], ...] = ()

    def __bool__(self) -> bool:
        return bool(self.concepts or self.terms or self.lift_targets)


def _dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            out.append(value)
    return out


def route_query(
    query: str,
    *,
    max_concepts: int = MAX_ROUTED_CONCEPTS,
    max_terms: int = MAX_ROUTED_TERMS,
    max_lift_sections: int = MAX_ROUTED_LIFT_SECTIONS,
    routes: Sequence[Route] = ROUTES,
) -> RoutingResult:
    """
    Map a consumer's own words onto the provisions of the Act that classify them.

    Returns the concept ids to force into the candidate set, the sections whose
    verbatim text should be lifted, and the statutory vocabulary to append to the
    query. All three are capped: routing is meant to supplement retrieval, not
    replace it.
    """

    if not query or not query.strip():
        return RoutingResult()

    matched = [route for route in routes if route.matches(query)]

    if not matched:
        return RoutingResult()

    # Sort by priority, keeping the tuple order as the tie-break so the lexicon
    # stays readable top-to-bottom. Everything downstream is capped, so this
    # sort is what decides which route's material actually reaches the answer.
    matched.sort(key=lambda route: (route.priority, routes.index(route)))

    concepts = _dedupe(c for route in matched for c in route.concepts)[:max_concepts]
    terms = _dedupe(t for route in matched for t in route.terms)[:max_terms]
    sections = _dedupe(s for route in matched for s in route.sections)
    lifts = _dedupe(s for route in matched for s in route.lift_sections)[
        :max_lift_sections
    ]

    # Grouped the same way, and trimmed to the concepts that survived the cap so
    # the retriever is never handed an id that routing already discarded.
    kept = set(concepts)
    groups = tuple(
        tuple(c for c in route.concepts if c in kept) for route in matched
    )

    return RoutingResult(
        terms=tuple(terms),
        concepts=tuple(concepts),
        routes=tuple(route.name for route in matched),
        sections=tuple(sections),
        lift_targets=tuple(_parse_lift(section) for section in lifts),
        concept_groups=tuple(group for group in groups if group),
    )


_LIFT = re.compile(r"^\s*(\w+)\s*(?:\(\s*([^)]+?)\s*\))?\s*$")


def _parse_lift(section: str) -> tuple[str, str | None]:
    """
    `"39"` -> ('39', None);  `"2(7)"` -> ('2', '7').

    Some provisions worth lifting verbatim are a single clause of a very long
    section. s.2 alone holds 47 definitions, so lifting all of "2" to reach
    s.2(7) would fill the statute budget with arbitrary neighbours - whichever
    two subsections happened to sort first. Naming the subsection lifts exactly
    the definition the route is about.
    """

    match = _LIFT.match(section)

    if not match:
        return section, None

    return match.group(1), match.group(2)


def describe_routes() -> str:
    """Human-readable dump of the lexicon, for review against the Act."""

    lines = []
    for route in ROUTES:
        lines.append(f"{route.name}  ->  s.{', s.'.join(route.sections)}")
        if route.concepts:
            lines.append(f"    concepts: {', '.join(route.concepts)}")
        if route.lift_sections:
            lines.append(
                f"    lifts verbatim: s.{', s.'.join(route.lift_sections)}"
            )
        if route.note:
            lines.append(f"    note: {route.note}")
    return "\n".join(lines)
