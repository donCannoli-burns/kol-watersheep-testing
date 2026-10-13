from __future__ import annotations

import json
import os
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class WaterGoatBlocked(RuntimeError):
    pass


def validated_endpoint(
    raw: str = "http://127.0.0.1:8766/v1/decisions",
) -> str:
    parsed = urlparse(raw)
    if parsed.scheme != "http":
        raise WaterGoatBlocked("WaterGoat endpoint must use plain HTTP inside the local lab.")

    configured = {
        item.strip()
        for item in os.environ.get(
            "KOL_FOUNDRY_ALLOWED_MODEL_HOSTS", "127.0.0.1,localhost,::1"
        ).split(",")
        if item.strip()
    }
    if parsed.hostname not in configured:
        raise WaterGoatBlocked(
            f"model host {parsed.hostname!r} is outside the foundry allow-list"
        )

    value = raw.rstrip("/")
    if value.endswith("/v1/decisions") or value.endswith("/v1/systemone"):
        return value
    return value + "/v1/decisions"


def build_request(
    state_frame: dict[str, Any], candidates: tuple[str, ...]
) -> dict[str, Any]:
    if len(candidates) < 2:
        raise WaterGoatBlocked("at least two candidate actions are required")

    criteria = {candidate: candidate for candidate in candidates}
    return {
        "state": state_frame,
        "questions": {
            "next_task": {
                "type": "choice",
                "instructions": (
                    "Given this bounded KoLmafia state, which candidate should be "
                    "prioritized next? This is advisory inference only."
                ),
                "criteria": criteria,
            }
        },
    }


def query(
    state_frame: dict[str, Any],
    candidates: tuple[str, ...],
    endpoint: str,
    timeout_seconds: float = 30.0,
) -> dict[str, Any]:
    target = validated_endpoint(endpoint)
    payload = json.dumps(build_request(state_frame, candidates)).encode("utf-8")
    request = Request(
        target,
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        body = json.loads(response.read().decode("utf-8"))
        return {
            "status": "ok",
            "endpoint": target,
            "httpStatus": int(response.status),
            "result": body,
            "authority": {
                "grantsAuthority": False,
                "grantsExecutionPermission": False,
                "grantsConfirmation": False,
                "mayCreateCommitPermit": False,
            },
        }
