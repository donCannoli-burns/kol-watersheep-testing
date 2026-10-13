from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
from typing import Any


class ContextPlaneError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    h = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_tsv_map(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        key, sep, value = raw.partition("\t")
        if not sep:
            raise ContextPlaneError(f"invalid map TSV row in {path}: {raw!r}")
        values[key] = value
    return values


def load_goblin_runtime(path: Path | None) -> dict[str, Any]:
    """Load a redacted read-only witness from kol-goblin-docs/runtime.tsv.

    The complete file is hashed, but player identity and lifecycle hook contents are
    deliberately not copied into foundry evidence by default.
    """
    if path is None:
        return {"status": "NOT_PROVIDED", "authority": "context-only"}
    if not path.is_file():
        return {
            "status": "MISSING",
            "authority": "context-only",
            "path": str(path),
        }

    raw = _read_tsv_map(path)
    safe_keys = (
        "generated_at",
        "reason",
        "kolmafia_version",
        "kolmafia_revision",
        "gameday",
        "goblin_docs_git_installed",
        "html_matrix_installed",
        "html_matrix_git_path",
        "html_matrix_ui_path",
        "html_matrix_agent_plane",
        "authority_note",
    )
    exposed = {key: raw[key] for key in safe_keys if key in raw}

    return {
        "status": "LOADED",
        "schema": "kol-foundry/goblin-runtime-witness-v0.1",
        "source": "kol-goblin-docs/runtime.tsv",
        "path": str(path),
        "sha256": _sha256(path),
        "fields": exposed,
        "redactedKeys": sorted(
            key
            for key in ("player", "player_id", "loginScript", "logoutScript")
            if key in raw
        ),
        "authority": "context-only",
        "mayAuthorizeExecution": False,
    }


def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ContextPlaneError(f"invalid JSON context plane {path}: {exc}") from exc


def load_html_matrix(root: Path | None) -> dict[str, Any]:
    """Load a compact integrity-checked witness from kol-html-matrix's agent plane."""
    if root is None:
        return {"status": "NOT_PROVIDED", "authority": "reference-only"}

    manifest_path = root / "source-manifest.json"
    master_path = root / "agent-master-index.json"
    hyper_path = root / "hyper-data.json"

    missing = [
        str(path)
        for path in (manifest_path, master_path, hyper_path)
        if not path.is_file()
    ]
    if missing:
        return {
            "status": "MISSING",
            "authority": "reference-only",
            "root": str(root),
            "missing": missing,
        }

    manifest = _load_json(manifest_path)
    master = _load_json(master_path)
    hyper = _load_json(hyper_path)

    expected_master = (
        manifest.get("agent_plane", {})
        .get("agent_master_index", {})
        .get("sha256")
    )
    expected_hyper = (
        manifest.get("agent_plane", {})
        .get("hyper_data", {})
        .get("sha256")
    )
    actual_master = _sha256(master_path)
    actual_hyper = _sha256(hyper_path)

    if expected_master and expected_master != actual_master:
        raise ContextPlaneError(
            "kol-html-matrix agent-master-index hash does not match source-manifest"
        )
    if expected_hyper and expected_hyper != actual_hyper:
        raise ContextPlaneError(
            "kol-html-matrix hyper-data hash does not match source-manifest"
        )

    runtime_ids = {
        "runtime:vector",
        "runtime:graph",
        "runtime:nanoclock",
        "runtime:learning",
    }
    runtime_nodes = []
    for node in hyper.get("nodes", []):
        if node.get("id") not in runtime_ids:
            continue
        runtime_nodes.append(
            {
                "id": node.get("id"),
                "name": node.get("name"),
                "authority": node.get("authority"),
                "tier": node.get("tier"),
                "effect": node.get("effect"),
                "pointer": node.get("pointer"),
                "provenance": node.get("provenance"),
            }
        )
    runtime_nodes.sort(key=lambda item: str(item["id"]))

    wanted_workflows = {"wf-state", "wf-pymafia", "wf-verify"}
    workflows = [
        {
            "id": workflow.get("id"),
            "name": workflow.get("name"),
            "steps": workflow.get("steps", []),
            "note": workflow.get("note", ""),
        }
        for workflow in master.get("workflows", [])
        if workflow.get("id") in wanted_workflows
    ]

    return {
        "status": "LOADED",
        "schema": "kol-foundry/html-matrix-witness-v0.1",
        "root": str(root),
        "matrix": {
            "schema": master.get("schema"),
            "workspaceId": master.get("workspace_id"),
            "generatedAt": master.get("generated_at"),
            "manifestSha256": _sha256(manifest_path),
            "masterIndexSha256": actual_master,
            "hyperDataSha256": actual_hyper,
        },
        "agentStart": master.get("agent_start"),
        "authorityInvariants": master.get("authority_invariants", []),
        "runtimeNodes": runtime_nodes,
        "workflows": workflows,
        "authority": "reference-only",
        "mayAuthorizeExecution": False,
    }


def load_context_planes(
    goblin_runtime: Path | None,
    html_matrix_root: Path | None,
) -> dict[str, Any]:
    return {
        "schema": "kol-foundry/context-planes-v0.1",
        "goblinDocs": load_goblin_runtime(goblin_runtime),
        "htmlMatrix": load_html_matrix(html_matrix_root),
    }
