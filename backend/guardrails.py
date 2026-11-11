"""Guardrails for the LLM chat paths.

Why this module exists
----------------------
The chat endpoints send user text to an LLM and render the reply. Three things
can go wrong, and each is handled here:

1. Prompt injection. A user writes "ignore the above and ..." and the model
   obeys. The structural fix lives in app2.py (instructions go in the system
   role, data in the user role); this module strips the text that tries to
   break out of that structure and blocks the attempts it recognises.

2. Scope escape. The bot is a real estate assistant, but the underlying model
   is general purpose, so "write me a SQL query" gets answered. `scan_input`
   refuses off-domain requests *before* any model call, so there is no reply to
   leak and no tokens spent.

3. Second-order injection. Listing text (amenities, location names) is written
   by agents and then spliced into prompts. `neutralize_context_text` means a
   listing cannot carry instructions to the model.

Detection is deterministic: stdlib regex only, no extra dependency and no
second model call. That keeps latency flat and makes every rule testable. It
also means novel phrasings can slip past the patterns, which is why the system
role separation and the output scan matter -- this module is one layer, not the
only one.

Nothing here raises: a guardrail that crashes the request is worse than the
request it was meant to check.
"""

import re
import time
import unicodedata
from typing import NamedTuple

try:  # optional, and absent in the test environment
    import mlflow
except Exception:  # pragma: no cover
    mlflow = None

try:
    from monitoring import increment_guardrail
except Exception:  # pragma: no cover
    def increment_guardrail(event_type: str):
        pass


# ---------------------------------------------------------------- limits

MAX_MESSAGE_CHARS = 2000      # one chat message
MAX_MESSAGES = 14             # turns accepted per request
MAX_CONTEXT_FIELD_CHARS = 400 # one DB-sourced free-text field in a prompt

# Characters that let text escape a prompt block or impersonate a speaker.
_ZERO_WIDTH = re.compile(r"[​-‏‪-‮⁠﻿­]")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]")
_ROLE_LABEL = re.compile(
    r"^[ \t>*#-]*(system|assistant|user|human|ai|bot|developer)[ \t]*:",
    re.IGNORECASE | re.MULTILINE,
)
_CHAT_TEMPLATE = re.compile(
    r"(<\|[a-z_]+\|>|\[/?INST\]|\[/?SYS\]|<</?SYS>>|###\s*(system|instruction|prompt)"
    r"|<\?claude|</?system>"
    # The delimiter tags app2.py wraps data in. Without this a message could
    # close its own block early and continue as if it were our prompt.
    r"|</?(conversation_so_far|current_user_message|user_request|listing_data"
    r"|search_summary|comparison_insights)\s*/?>)",
    re.IGNORECASE,
)
_CODE_FENCE = re.compile(r"```+|~~~+")
_PROMPT_RULE = re.compile(r"^[ \t]*(-{3,}|={3,}|\*{3,})[ \t]*$", re.MULTILINE)


class GuardResult(NamedTuple):
    """`allowed` is the decision; `reason` is safe to show the user."""
    allowed: bool
    category: str | None = None
    reason: str | None = None
    detail: str | None = None  # for logs only, never shown


ALLOWED = GuardResult(True)


def log_event(event_type: str, detail: str = ""):
    """Public wrapper, so callers outside this module can record an event."""
    _log(event_type, detail)


def _log(event_type: str, detail: str):
    try:
        increment_guardrail(event_type)
    except Exception:
        pass
    if mlflow is None:
        return
    try:
        # Only when a run is already open. Calling log_metric outside a run
        # makes mlflow create an experiment and a run directory on disk, which
        # for a web endpoint means a write per blocked request -- and a flood of
        # junk runs under load. Prometheus above is the channel that matters
        # here; mlflow is for when this is driven from an experiment.
        if mlflow.active_run() is None:
            return
        mlflow.log_metric("guardrail_violations", 1)
        mlflow.set_tag(f"guardrail_event_{int(time.time())}", f"{event_type}:{detail}")
    except Exception:
        pass


# ---------------------------------------------------------------- normalising

def _normalize(text: str) -> str:
    """Fold the tricks that hide a pattern from a plain regex.

    NFKC collapses fullwidth and styled letters (fullwidth "ignore" becomes
    plain "ignore"), zero-width characters are dropped, and runs of whitespace
    and separator punctuation are collapsed so "i.g.n.o.r.e" and
    "ignore    previous" both reduce to something the patterns match.
    """
    t = unicodedata.normalize("NFKC", text or "")
    t = _ZERO_WIDTH.sub("", t)
    t = _CONTROL.sub(" ", t)
    t = t.lower()
    # "i g n o r e" / "i.g.n.o.r.e" -> "ignore": only when single letters are
    # separated one after another, so ordinary prose is untouched.
    t = re.sub(r"\b(?:[a-z][.\-_ ]){3,}[a-z]\b",
               lambda m: re.sub(r"[.\-_ ]", "", m.group(0)), t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def sanitize_user_text(text: str, limit: int = MAX_MESSAGE_CHARS) -> str:
    """Make text safe to place inside a prompt, without changing its meaning.

    This does not decide anything -- `scan_input` does that. This only removes
    the scaffolding an injection needs: fake speaker labels, chat-template
    markers, code fences and horizontal rules that would look like the end of
    our own prompt block.
    """
    t = unicodedata.normalize("NFKC", text or "")
    t = _ZERO_WIDTH.sub("", t)
    t = _CONTROL.sub(" ", t)
    t = _ROLE_LABEL.sub(r"\1-", t)        # "System:" -> "system-"
    t = _CHAT_TEMPLATE.sub("[removed]", t)
    t = _CODE_FENCE.sub("[removed]", t)
    t = _PROMPT_RULE.sub("[removed]", t)
    t = t.replace("\r\n", "\n")
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    t = t.strip()
    if len(t) > limit:
        t = t[:limit].rstrip() + " [truncated]"
    return t


# ---------------------------------------------------------------- patterns

def _c(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.IGNORECASE)


# Overriding our instructions, or re-assigning the model's role.
_INJECTION_PATTERNS = [
    _c(r"\b(ignore|disregard|forget|override|bypass|skip)\b[^.\n]{0,40}"
       r"\b(previous|prior|earlier|above|preceding|all|any|your|the)\b[^.\n]{0,25}"
       r"\b(instruction|prompt|rule|direction|guideline|constraint|context|message|order)s?\b"),
    _c(r"\b(ignore|disregard|forget)\b[^.\n]{0,15}\b(everything|all)\b[^.\n]{0,20}"
       r"\b(above|before|prior|said)\b"),
    _c(r"\byou are (now|no longer|actually)\b"),
    _c(r"\b(act|behave|respond|reply) as (if you (are|were) )?(a|an|the)?\s*\w*\s*"
       r"(assistant|model|ai|dba|developer|engineer|expert)\b"),
    _c(r"\bpretend (that )?(you|to be)\b"),
    _c(r"\bfrom now on\b[^.\n]{0,40}\b(you|respond|reply|answer|act)\b"),
    _c(r"\bnew (system )?(instruction|prompt|persona|role|rule)s?\b"),
    _c(r"\b(disable|turn off|remove|lift)\b[^.\n]{0,25}"
       r"\b(guardrail|filter|restriction|safety|limit|rule)s?\b"),
    _c(r"\b(developer|debug|god|admin|dan) mode\b"),
    _c(r"\bdo anything now\b"),
    _c(r"\bjailbreak\b"),
    _c(r"\bwithout (any )?(restriction|limitation|filter|rule)s?\b"),
    _c(r"\byour (real|true|actual|original) (instruction|prompt|purpose|rule)s?\b"),
]

# Trying to read our own configuration back out.
_EXFIL_PATTERNS = [
    _c(r"\b(repeat|print|show|reveal|output|display|echo|dump|list|recite)\b[^.\n]{0,35}"
       r"\b(system prompt|your (instruction|prompt|rule|guideline|system|config)s?"
       r"|the (above|preceding)|initial prompt|prompt above|everything above)\b"),
    _c(r"\b(what|which)\b[^.\n]{0,25}\b(your|the)\b[^.\n]{0,15}"
       r"\b(system prompt|instructions|rules|guidelines|prompt)\b"),
    _c(r"\b(tell|show) me\b[^.\n]{0,25}\b(your (instruction|prompt|rule)s?|system prompt)\b"),
    _c(r"\b(verbatim|word for word|exactly as written)\b[^.\n]{0,30}\b(prompt|instruction)s?\b"),
    _c(r"\b(api[_ -]?key|secret key|access token|credential|password|connection string"
       r"|env(ironment)? variable)s?\b"),
    _c(r"\b(schema|table name|column name|database name|table structure)s?\b"),
]

# SQL. Patterns are deliberately structural: a bare "select" or "from" is
# ordinary English ("select the best one from these"), so a match needs either
# "select * from" or a second SQL clause keyword following the FROM.
_SQL_PATTERNS = [
    _c(r"\bselect\s+\*\s+from\b"),
    _c(r"\bselect\b[\s\S]{0,120}\bfrom\b[\s\S]{0,100}"
       r"\b(where|join|group\s+by|order\s+by|having|limit|offset|union)\b"),
    _c(r"\bunion\s+(all\s+)?select\b"),
    _c(r"\b(drop|truncate|alter|create)\s+(table|database|schema|index|view|user|role)\b"),
    _c(r"\b(delete\s+from|insert\s+into|update)\b[^.\n]{0,40}\b(where|set|values)\b"),
    _c(r"\b(information_schema|pg_catalog|pg_sleep|pg_user|pg_shadow|pg_tables"
       r"|sqlite_master)\b"),
    _c(r"\b(current_database|current_user|load_file)\s*\(\s*\)"),
    _c(r"\bor\s+[\'\"]?1[\'\"]?\s*=\s*[\'\"]?1\b"),
    _c(r"(--|/\*)\s*$"),
    _c(r";\s*(drop|delete|insert|update|select|alter|truncate|grant)\b"),
    _c(r"\b(sql|postgres|postgresql|mysql|psql)\b[^.\n]{0,30}"
       r"\b(quer(y|ies)|statement|command|injection|syntax)\b"),
    _c(r"\b(quer(y|ies)|statement)\b[^.\n]{0,20}\b(sql|postgres|postgresql|mysql)\b"),
]

# Off-domain requests. The nouns carry the match, never a bare verb: "write a
# pitch" and "write a description for this listing" are the job, so only the
# code/academic nouns below count as out of scope.
_OFF_DOMAIN_PATTERNS = [
    # The nouns below are guarded against real estate collocations that would
    # otherwise read as code requests: "postal code", "function hall" (a venue),
    # "first class apartment".
    _c(r"\b(write|generate|create|produce|give me|show me|make|build|compose|draft"
       r"|provide)\b[^.\n]{0,40}"
       r"\b(sql|query|script|snippet|regex|algorithm|api|endpoint|program"
       r"|python|javascript|typescript|java|c\+\+|c#|golang|ruby|php|rust"
       r"|bash|shell|powershell|html|css|react|dockerfile|yaml|unit test"
       r"|(?<!postal )(?<!zip )(?<!area )(?<!dial )code"
       r"|function(?!\s+(hall|room|space|venue))"
       r")\b"),
    _c(r"\b(code|script|program|function|regex|algorithm)\b[^.\n]{0,25}"
       r"\b(in|using|with)\b[^.\n]{0,15}"
       r"\b(python|javascript|typescript|java|c\+\+|c#|sql|bash|rust|go|php|ruby)\b"),
    _c(r"\b(debug|refactor|compile|lint|unit test|stack trace|syntax error"
       r"|traceback)\b"),
    _c(r"\b(write|compose|draft|generate)\b[^.\n]{0,30}"
       r"\b(essay|poem|poetry|story|song|lyrics|novel|screenplay|thesis|dissertation"
       r"|homework|assignment|cover letter|resume|cv)\b"),
    _c(r"\btranslate\b[^.\n]{0,30}\b(into|to)\b"),
    _c(r"\b(solve|calculate)\b[^.\n]{0,25}"
       r"\b(equation|integral|derivative|polynomial|homework)\b"),
    _c(r"\b(medical|legal|investment|tax) advice\b"),
]

# Encoded payloads: a long opaque blob is only suspicious when the message also
# asks for it to be decoded and acted on.
_ENCODING_HINT = _c(r"\b(base64|rot13|hex|binary|morse|caesar|url ?encod|decode"
                    r"|decrypt|unescape)\b")
_LONG_BLOB = _c(r"[A-Za-z0-9+/]{40,}={0,2}")


def neutralize_context_text(text: str, limit: int = MAX_CONTEXT_FIELD_CHARS) -> str:
    """Scrub DB-sourced free text (amenities, location names) before prompting.

    An agent who can add a listing can put "ignore previous instructions" in the
    amenities field; without this, that text reaches the model as part of our
    own prompt for every user in the tenant. Here, anything that reads as an
    instruction is replaced outright rather than merely flagged -- a listing has
    no legitimate reason to address the model.
    """
    t = sanitize_user_text(text, limit=limit)
    for pattern in _INJECTION_PATTERNS + _EXFIL_PATTERNS:
        t = pattern.sub("[removed]", t)
    return re.sub(r"\s+", " ", t).strip()


_REFUSALS = {
    "PROMPT_INJECTION": (
        "I can only help with property questions on this platform, and I can't take "
        "instructions that try to change how I work. What are you looking for?"
    ),
    "PROMPT_EXFIL": (
        "I can't share how I'm configured. I can help you search listings, compare "
        "them, or put together talking points for a call."
    ),
    "SQL_REQUEST": (
        "I can't write or run database queries. I can search the listings for you "
        "instead -- tell me the location, budget, or number of bedrooms you need."
    ),
    "OFF_DOMAIN": (
        "I'm the property assistant for this platform, so I can only help with real "
        "estate here -- finding listings, comparing them, or writing a pitch."
    ),
    "ENCODED_PAYLOAD": (
        "I can't process encoded instructions. Please ask your property question in "
        "plain words."
    ),
    "TOO_LONG": (
        "That message is too long for me to work with. Could you shorten it to the "
        "key details -- location, budget, and property type?"
    ),
    "EMPTY": "Could you tell me what you're looking for?",
}


def _first_match(text: str, patterns) -> str | None:
    for pattern in patterns:
        if pattern.search(text):
            return pattern.pattern[:60]
    return None


# ---------------------------------------------------------------- input scan

def scan_input(text: str) -> GuardResult:
    """Decide whether this message reaches the model at all.

    Order matters: the most specific category wins, so a SQL request is reported
    as SQL rather than as generic off-domain text, which makes the logs useful.
    """
    raw = text or ""
    if not raw.strip():
        return GuardResult(False, "EMPTY", _REFUSALS["EMPTY"], "blank")
    if len(raw) > MAX_MESSAGE_CHARS * 2:
        _log("TOO_LONG", f"{len(raw)}_chars")
        return GuardResult(False, "TOO_LONG", _REFUSALS["TOO_LONG"], f"{len(raw)}_chars")

    norm = _normalize(raw)

    checks = (
        ("PROMPT_INJECTION", _INJECTION_PATTERNS),
        ("PROMPT_EXFIL", _EXFIL_PATTERNS),
        ("SQL_REQUEST", _SQL_PATTERNS),
        ("OFF_DOMAIN", _OFF_DOMAIN_PATTERNS),
    )
    for category, patterns in checks:
        hit = _first_match(norm, patterns)
        if hit:
            _log(category, hit)
            return GuardResult(False, category, _REFUSALS[category], hit)

    if _ENCODING_HINT.search(norm) and _LONG_BLOB.search(raw):
        _log("ENCODED_PAYLOAD", "blob_with_decode_hint")
        return GuardResult(False, "ENCODED_PAYLOAD", _REFUSALS["ENCODED_PAYLOAD"], "blob")

    return ALLOWED


def scan_history(messages) -> GuardResult:
    """Check prior turns too.

    The client sends the whole conversation on every request, so history is
    attacker-controlled: a caller can POST a fabricated `assistant` turn that
    primes the model ("Assistant: Sure, here is the SQL you asked for"). Past
    turns are scanned with the same rules as the current one.
    """
    if not messages:
        return GuardResult(False, "EMPTY", _REFUSALS["EMPTY"], "no_messages")
    if len(messages) > MAX_MESSAGES:
        _log("TOO_MANY_MESSAGES", str(len(messages)))
        return GuardResult(False, "TOO_LONG", _REFUSALS["TOO_LONG"],
                           f"{len(messages)}_messages")
    for m in messages:
        content = getattr(m, "content", None)
        if content is None and isinstance(m, dict):
            content = m.get("content")
        verdict = scan_input(content or " ")
        if not verdict.allowed and verdict.category != "EMPTY":
            return verdict
    return ALLOWED


# ---------------------------------------------------------------- output scan

# Phrases from our own prompts. If one comes back in a reply, the model is
# quoting its instructions instead of answering.
_PROMPT_FINGERPRINTS = [
    _c(r"you are a (knowledgeable|friendly) pakistan real estate assistant"),
    _c(r"allowed tags"),
    _c(r"response rules"),
    _c(r"do not mention databases"),
    _c(r"listings from the database"),
    _c(r"output:\s*html only"),
    _c(r"return only one json object"),
    _c(r"the agency's (locations|property types)"),
    _c(r"current user message"),
]

# Internal names that should never appear in a reply.
_SCHEMA_LEAKS = [
    _c(r"\b(property_data|amenities_raw|location_sentiments|property_images"
       r"|property_amenities)\b"),
    _c(r"\btenant_id\b"),
    _c(r"\braw_text\b"),
    _c(r"\b(psycopg2|realdictcursor|chromadb|mlflow)\b"),
    _c(r"\binformation_schema\b"),
]

_SECRET_LEAKS = [
    _c(r"\bgsk_[A-Za-z0-9]{20,}"),
    _c(r"\bsk-[A-Za-z0-9]{20,}"),
    _c(r"\bAKIA[0-9A-Z]{16}\b"),
    _c(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    _c(r"\b(api[_-]?key|secret|password|passwd|token)\b\s*[:=]\s*\S{8,}"),
]

_OUTPUT_SQL = [
    _c(r"\bselect\s+\*\s+from\b"),
    _c(r"\bselect\b[\s\S]{0,120}\bfrom\b[\s\S]{0,100}"
       r"\b(where|join|group\s+by|order\s+by|limit)\b"),
    _c(r"\b(insert\s+into|delete\s+from|drop\s+table|update\b[^.\n]{0,30}\bset)\b"),
]

OUTPUT_FALLBACK = (
    "Sorry, I can't answer that one. I can help you search listings, compare them, "
    "or draft talking points for a call."
)


def scan_output(text: str) -> GuardResult:
    """Last line of defence: refuse to render a reply that leaked or went off-script.

    Needed because the input patterns cannot catch every phrasing. If an
    injection does get through, this stops the result reaching the user.
    """
    raw = text or ""
    if not raw.strip():
        return GuardResult(False, "EMPTY_OUTPUT", OUTPUT_FALLBACK, "blank")
    norm = _normalize(raw)

    for category, patterns in (
        ("OUTPUT_SECRET_LEAK", _SECRET_LEAKS),
        ("OUTPUT_PROMPT_LEAK", _PROMPT_FINGERPRINTS),
        ("OUTPUT_SCHEMA_LEAK", _SCHEMA_LEAKS),
        ("OUTPUT_SQL", _OUTPUT_SQL),
    ):
        # Secrets are matched on the raw text: NFKC lowercasing would ruin the
        # case-sensitive key prefixes.
        target = raw if category == "OUTPUT_SECRET_LEAK" else norm
        hit = _first_match(target, patterns)
        if hit:
            _log(category, hit)
            return GuardResult(False, category, OUTPUT_FALLBACK, hit)

    return ALLOWED


# ---------------------------------------------------------------- back-compat

def check_input_guardrails(text: str):
    """Kept for the old call signature: (allowed, reason)."""
    verdict = scan_input(text)
    return verdict.allowed, verdict.reason


def check_output_moderation(text: str):
    verdict = scan_output(text)
    return verdict.allowed, verdict.reason
