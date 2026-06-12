import re
import time
import mlflow

PHONE_RE = re.compile(r'(\+?\d[\d\-\s]{6,}\d)')
EMAIL_RE = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+')
INJECTION_PHRASES = ["ignore previous", "forget previous", "disregard earlier", "ignore instruction"]
TOXIC_WORDS = {"idiot", "stupid", "damn"}  # extend as needed

def _log_guardrail(event_type: str, detail: str):
    try:
        mlflow.log_metric("guardrail_violations", 1)
        mlflow.set_tag(f"guardrail_event_{int(time.time())}", f"{event_type}:{detail}")
    except Exception:
        pass

def check_input_guardrails(text: str):
    """Return (allowed: bool, reason: str|None)"""
    if EMAIL_RE.search(text) or PHONE_RE.search(text):
        _log_guardrail("PII_DETECTED", "email_or_phone")
        return False, "Input contains PII (email/phone). Remove sensitive info."
    lowered = text.lower()
    if any(p in lowered for p in INJECTION_PHRASES):
        _log_guardrail("PROMPT_INJECTION", "suspicious_phrase")
        return False, "Input contains suspicious instruction (possible prompt injection)."
    return True, None

def check_output_moderation(text: str):
    """Return (allowed: bool, reason: str|None)"""
    lowered = text.lower()
    if any(w in lowered for w in TOXIC_WORDS):
        _log_guardrail("TOXIC_OUTPUT", "profanity")
        return False, "Output flagged as toxic."
    return True, None