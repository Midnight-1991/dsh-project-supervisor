#!/usr/bin/env python3
"""team-permissions: opt-in per-dialog sandbox scope and tool surface for DSH `spawn_teammate`.

Upstream DSH 0.2.0-rc.2 fixes a teammate's permission state at creation time:
the child inherits the Lead session's explicit sandbox override and the approval
policy is pinned to `never`. This patch adds two optional flat parameters to the
model-facing `spawn_teammate` tool and threads them through the Team roster into
the subagent delegation seed:

  sandbox: "read-only" | "workspace-write" | "danger-full-access"
      per-dialog sandbox scope (filesystem / bash sandbox level).
  tools: "read-only" | "full"
      per-dialog tool surface: "read-only" restricts the child to a read/query
      allowlist (write, edit, bash, subagent and workflow tools disappear);
      "full" keeps the native tool set. Omitted = native behavior.

The tool allowlist is the documented `ToolRestriction.allow` composition input
already supported by `subagents.startContinuable()`; it is persisted in the
child's `subagent/descriptor`, so a cold-resumed teammate keeps its surface.

Approval stays pinned to `never` on purpose (nobody answers approval prompts in
a background dialog). The patch is intentionally small, idempotent and fully
reversible: every file is backed up before the edit and `revert` restores the
exact original bytes.

Target: DSH 0.2.0-rc.2 only. `status` prints the detected version; `apply`
refuses a different version unless `--force` is passed.

Usage:
    python3 patch.py status|apply|revert|selftest [--nm PATH] [--dsh-home PATH] [--force]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

MARK = "[team-permissions-patch]"

TOOL_FILE = "@deepseek-ai/dsh-experimental-tool-agent-team/lib/index.js"
TEAM_FILE = "@deepseek-ai/dsh-experimental-agent-team/lib/index.js"
ROSTER_FILE = "@deepseek-ai/dsh-experimental-agent-team/lib/types/roster.js"
SUB_FILE = "@deepseek-ai/dsh-subagent/lib/index.js"
TARGET_FILES = [TOOL_FILE, TEAM_FILE, ROSTER_FILE, SUB_FILE]

DSH_PACKAGE_JSON = "@deepseek-ai/dsh/package.json"
EXPECTED_DSH_VERSION = "0.2.0-rc.2"
PATCH_VERSION = "2"

SANDBOX_MODES = ["read-only", "workspace-write", "danger-full-access"]
TOOL_SCOPES = ["read-only", "full"]

# Tools a `tools: "read-only"` child keeps. These are inherited "agent plane"
# tools from the DSH 0.2.0-rc.2 standard agent preset (see README for the exact
# source locations); they are pure read/query/coordination surface.
#
# The Team collaboration tools (spawn_teammate, send_message, list_agents,
# wait_agent, interrupt_agent, team_task_*) are deliberately NOT listed here:
# the Team tool package registers them into each member's OWN scope after this
# filter is installed, and `tools.restrict()` only accepts inherited names
# (naming an own-scope name fails loudly with "unknown global tool"). They stay
# visible anyway, which is exactly what lets a read-only teammate report back.
READ_ONLY_TOOLS = [
    "read",
    "grep",
    "glob",
    "skill",
    "todo_write",
    "web_search",
    "web_fetch",
]


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def die(message: str) -> "None":
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_node() -> str:
    node = shutil.which("node")
    if node is None:
        die("node 未找到；请先安装 Node.js（语法校验需要 node --check）。")
    return node


def syntax_check(node: str, path: Path, text: str) -> None:
    """Parse `text` as an ES module through a .mjs temp copy (independent of package.json)."""
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False, encoding="utf-8") as fh:
        fh.write(text)
        tmp = Path(fh.name)
    try:
        result = subprocess.run([node, "--check", str(tmp)], capture_output=True, text=True)
    finally:
        tmp.unlink(missing_ok=True)
    if result.returncode != 0:
        raise RuntimeError(f"语法校验失败 {path}:\n{result.stderr.strip()}")


# --------------------------------------------------------------------------
# the three edits
# --------------------------------------------------------------------------

def patch_tool(text: str) -> str:
    """Add optional `sandbox` and `tools` parameters, forward both as `permission`."""
    start = text.index('name: "spawn_teammate"')
    end = text.index("output: jsonOutput(SPAWN_VALUE_SCHEMA)", start)
    seg = text[start:end]

    closer = "\n\t\t\t},\n"
    pos = seg.rfind(closer)
    if pos < 0:
        raise RuntimeError("spawn_teammate 参数块结束位置未找到")
    block = (
        f"\t\t\t\t// {MARK} optional per-dialog sandbox scope\n"
        "\t\t\t\tsandbox: {\n"
        '\t\t\t\t\ttype: "string",\n'
        f'\t\t\t\t\tenum: [{", ".join(json.dumps(mode) for mode in SANDBOX_MODES)}],\n'
        '\t\t\t\t\tdescription: "Optional per-dialog sandbox scope: read-only blocks all writes, workspace-write limits writes to the workspace, danger-full-access is unrestricted. Defaults to inheriting the Lead session\'s scope."\n'
        "\t\t\t\t},\n"
        f"\t\t\t\t// {MARK} optional read-only tool surface\n"
        "\t\t\t\ttools: {\n"
        '\t\t\t\t\ttype: "string",\n'
        f'\t\t\t\t\tenum: [{", ".join(json.dumps(mode) for mode in TOOL_SCOPES)}],\n'
        '\t\t\t\t\tdescription: "Optional per-dialog tool surface: read-only keeps only read/query tools (read, grep, glob, skill, todo_write, web_search, web_fetch) and hides write, edit, bash, subagent and workflow tools while keeping Team collaboration tools; full keeps the normal tool set. Defaults to the normal tool set."\n'
        "\t\t\t\t}"
    )
    seg = seg[:pos] + ",\n" + block + seg[pos:]
    text = text[:start] + seg + text[end:]

    provider = 'provider: context === "fork" ? config.forkProvider : config.freshProvider,'
    if text.count(provider) != 1:
        raise RuntimeError("spawn_teammate execute 的 provider 行未唯一匹配")
    i = text.index(provider)
    line_start = text.rfind("\n", 0, i) + 1
    indent = text[line_start:i]
    if indent.strip():
        raise RuntimeError("provider 行缩进解析异常")
    injected = (
        f"{indent}// {MARK} per-dialog sandbox scope and read-only tool surface\n"
        f"{indent}...((args.sandbox === void 0 && args.tools === void 0) ? {{}} : {{\n"
        f"{indent}\tpermission: {{\n"
        f"{indent}\t\t...(args.sandbox === void 0 ? {{}} : {{ sandbox: args.sandbox }}),\n"
        f"{indent}\t\t...(args.tools === void 0 ? {{}} : {{ tools: args.tools }})\n"
        f"{indent}\t}}\n"
        f"{indent}}}),\n"
    )
    line_end = text.index("\n", i) + 1
    text = text[:line_end] + injected + text[line_end:]
    return text


def patch_roster(text: str) -> str:
    """Forward `request.permission` (sandbox + tools) into the continuable start spec."""
    anchor = "started = await this.ctx.subagents.startContinuable({"
    if text.count(anchor) != 1:
        raise RuntimeError(f"startContinuable 调用点未唯一匹配（{text.count(anchor)} 处）")

    # 1) sandbox: the permission object the subagent runtime consumes.
    start = text.index(anchor)
    signal_pos = text.index("signal", start)
    seg = text[start:signal_pos]
    match = re.search(r"(?m)^([ \t]*)label: description,\n", seg)
    if match is None:
        raise RuntimeError("startContinuable 调用中的 label 行未找到")
    indent = match.group(1)
    pos = start + match.end()
    injected = (
        f"{indent}// {MARK} per-dialog sandbox scope\n"
        f"{indent}permission: request.permission,\n"
    )
    text = text[:pos] + injected + text[pos:]

    # 2) tools: a read-only allowlist as the child's own tool restriction.
    start = text.index(anchor)
    signal_pos = text.index("signal", start)
    seg = text[start:signal_pos]
    match = re.search(r"(?m)^([ \t]*)prompt: request\.prompt,\n", seg)
    if match is None:
        raise RuntimeError("startContinuable 调用中的 prompt 行未找到")
    indent = match.group(1)
    pos = start + match.end()
    allowed = json.dumps(READ_ONLY_TOOLS)
    injected = (
        f"{indent}// {MARK} tools=\"read-only\": restrict the child to the read/query allowlist\n"
        f"{indent}...(request.permission?.tools === \"read-only\" ? {{ toolFilter: {{ allow: {allowed} }} }} : {{}}),\n"
    )
    return text[:pos] + injected + text[pos:]


def patch_subagent(text: str) -> str:
    """Let captureDelegatedPolicyOverrides honor a requested sandbox override."""
    old_sig = "function captureDelegatedPolicyOverrides(parent) {"
    if text.count(old_sig) != 1:
        raise RuntimeError("captureDelegatedPolicyOverrides 函数签名未唯一匹配")
    text = text.replace(
        old_sig,
        f"function captureDelegatedPolicyOverrides(parent, permission) {{ // {MARK}",
    )

    old = '\t\tsandboxMode: parent.ctx.get("sandboxPolicy")?.overrideOf(parent.session),'
    if text.count(old) != 1:
        raise RuntimeError("captureDelegatedPolicyOverrides 的 sandboxMode 行未唯一匹配")
    text = text.replace(
        old,
        '\t\tsandboxMode: permission?.sandbox ?? parent.ctx.get("sandboxPolicy")?.overrideOf(parent.session),',
    )

    old = '\t\tpermissionPreset: preset === "auto" || preset === "danger-full-access" ? preset : void 0,'
    if text.count(old) != 1:
        raise RuntimeError("captureDelegatedPolicyOverrides 的 permissionPreset 行未唯一匹配")
    text = text.replace(
        old,
        '\t\tpermissionPreset: permission?.sandbox !== void 0 ? void 0 : (preset === "auto" || preset === "danger-full-access" ? preset : void 0),',
    )

    old = "const delegatedPolicies = captureDelegatedPolicyOverrides(parent);"
    if text.count(old) != 1:
        raise RuntimeError("captureDelegatedPolicyOverrides 调用点未唯一匹配")
    text = text.replace(
        old,
        "const delegatedPolicies = captureDelegatedPolicyOverrides(parent, spec.permission);",
    )
    return text


PATCHERS = {
    TOOL_FILE: patch_tool,
    TEAM_FILE: patch_roster,
    ROSTER_FILE: patch_roster,
    SUB_FILE: patch_subagent,
}

# Needles every patched output must contain (selftest guard against a patcher
# that silently stops injecting one of the two new behaviors).
EXPECTED_MARKERS = {
    TOOL_FILE: ["tools: {", "args.tools === void 0", "permission: {"],
    TEAM_FILE: ['permission: request.permission,', 'request.permission?.tools === "read-only"', "toolFilter: { allow:"],
    ROSTER_FILE: ['permission: request.permission,', 'request.permission?.tools === "read-only"', "toolFilter: { allow:"],
    SUB_FILE: ["(parent, permission) {", "permission?.sandbox ??"],
}


# --------------------------------------------------------------------------
# discovery / backups
# --------------------------------------------------------------------------

def detect_node_modules(explicit: str | None) -> Path:
    if explicit:
        nm = Path(explicit).expanduser().resolve()
    elif os.environ.get("DSH_NM"):
        nm = Path(os.environ["DSH_NM"]).expanduser().resolve()
    else:
        dsh = shutil.which("dsh")
        if dsh is None:
            die("未找到 dsh 命令；请用 --nm 指定 DSH 的 node_modules 目录。")
        nm = None
        for parent in [Path(dsh).resolve()] + list(Path(dsh).resolve().parents):
            if parent.name == "node_modules":
                nm = parent
                break
        if nm is None:
            die("无法从 dsh 命令推断 node_modules；请用 --nm 指定。")
    if not nm.is_dir():
        die(f"--nm 不是目录：{nm}")
    missing = [rel for rel in TARGET_FILES if not (nm / rel).is_file()]
    if missing:
        die(
            f"{nm} 下缺少目标文件（预期 DSH 0.2.0-rc.2 安装）: {', '.join(missing)}\n"
            "请确认 dsh 版本与安装位置，或用 --nm 指向正确的 node_modules。"
        )
    return nm


def read_dsh_version(nm: Path) -> str | None:
    """Read the DSH package version, or None when it cannot be determined."""
    path = nm / DSH_PACKAGE_JSON
    if not path.is_file():
        return None
    try:
        data = json.loads(read(path))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    version = data.get("version")
    return version if isinstance(version, str) and version else None


def dsh_home(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    return Path(os.environ.get("DSH_HOME", "~/.dsh")).expanduser().resolve()


def backup_root(home: Path) -> Path:
    return home / "patches" / "team-permissions"


def backup_dir(home: Path) -> Path:
    root = backup_root(home)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    candidate = root / f"backup-{stamp}"
    i = 0
    while candidate.exists():
        i += 1
        candidate = root / f"backup-{stamp}-{i}"
    candidate.mkdir(parents=True)
    return candidate


def manifests(home: Path) -> list[Path]:
    """Backup manifests, newest first."""
    root = backup_root(home)
    if not root.is_dir():
        return []
    found = [path for path in root.glob("backup-*/manifest.json") if path.is_file()]
    found.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return found


def load_manifest(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def latest_manifest(home: Path) -> Path | None:
    found = manifests(home)
    return found[0] if found else None


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------

def status(nm: Path, home: Path) -> int:
    print(f"DSH node_modules: {nm}")
    version = read_dsh_version(nm)
    if version is None:
        print(f"DSH 版本: 未知（未找到 {DSH_PACKAGE_JSON}）")
    elif version == EXPECTED_DSH_VERSION:
        print(f"DSH 版本: {version}（匹配本补丁目标版本 {EXPECTED_DSH_VERSION}）")
    else:
        print(f"DSH 版本: {version}（不匹配：本补丁只针对 {EXPECTED_DSH_VERSION}，apply 会拒绝，除非 --force）")

    patched = 0
    for rel in TARGET_FILES:
        path = nm / rel
        text = read(path)
        has = MARK in text
        patched += has
        print(f"  {'PATCHED  ' if has else 'unpatched'}  {rel}")
    if patched == len(TARGET_FILES):
        print("状态: 已应用（重启 DSH 后生效）")
    elif patched == 0:
        print("状态: 未应用（原生行为）")
    else:
        print("状态: 部分应用（异常，建议 revert 后重跑 apply）")

    manifest_path = latest_manifest(home)
    if manifest_path is not None:
        manifest = load_manifest(manifest_path) or {}
        applied_version = manifest.get("version")
        detail = f"最近备份清单: {manifest_path}（补丁 v{applied_version if applied_version is not None else '?'}"
        if manifest.get("appliedAt"):
            detail += f"，applied {manifest['appliedAt']}"
        if manifest.get("revertedAt"):
            detail += f"，已于 {manifest['revertedAt']} 回滚"
        if manifest.get("dshVersion"):
            detail += f"，dsh {manifest['dshVersion']}"
        detail += "）"
        print(detail)
        if patched == len(TARGET_FILES) and not manifest.get("revertedAt"):
            if applied_version is not None and str(applied_version) != PATCH_VERSION:
                print(f"提示: 已应用的是 v{applied_version}，本脚本是 v{PATCH_VERSION}；升级方式：先 revert 再 apply。")
    return 0


def apply_patch(nm: Path, home: Path, force: bool) -> int:
    version = read_dsh_version(nm)
    if version is None:
        print(f"警告: 未找到 {DSH_PACKAGE_JSON}，无法确认 DSH 版本；按未知版本继续。", file=sys.stderr)
    elif version != EXPECTED_DSH_VERSION and not force:
        print(f"ERROR: 当前 DSH 版本 {version} 与本补丁目标版本 {EXPECTED_DSH_VERSION} 不一致。", file=sys.stderr)
        print("本补丁按该版本的文件内容与布局编写；在其他版本上断言可能失败（失败会自动整体回滚，不会写坏文件）。", file=sys.stderr)
        print("确认仍要在当前版本上尝试，请加 --force：python3 patch.py apply --force", file=sys.stderr)
        return 1

    patched_now = []
    already = []
    for rel in TARGET_FILES:
        path = nm / rel
        text = read(path)
        if MARK in text:
            already.append(rel)
        else:
            patched_now.append(rel)

    if not patched_now:
        print("已应用过，无改动（幂等）。重启 DSH 后生效。")
        manifest_path = latest_manifest(home)
        if manifest_path is not None:
            manifest = load_manifest(manifest_path) or {}
            applied_version = manifest.get("version")
            if applied_version is not None and str(applied_version) != PATCH_VERSION:
                print(f"注意: 已应用的是 v{applied_version}，本脚本是 v{PATCH_VERSION}。升级方式：先 `revert` 再 `apply`。")
        return 0
    if already:
        print(
            "ERROR: 部分文件已打补丁、部分未打（状态不一致）。请先 `revert` 回到原始文件，再重新 `apply`。",
            file=sys.stderr,
        )
        return 1

    node = require_node()
    bdir = backup_dir(home)
    manifest = {
        "version": PATCH_VERSION,
        "dshVersion": version,
        "appliedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "nodeModules": str(nm),
        "files": [],
    }

    try:
        for rel in patched_now:
            path = nm / rel
            before = sha256(path)
            backup = bdir / rel.replace("/", "__")
            shutil.copy2(path, backup)
            new_text = PATCHERS[rel](read(path))
            syntax_check(node, path, new_text)  # validate before writing
            write(path, new_text)
            manifest["files"].append({
                "rel": rel,
                "backup": str(backup),
                "sha256Before": before,
                "sha256After": sha256(path),
            })
            print(f"  patched  {rel}")
    except Exception as exc:  # noqa: BLE001 - always restore on any failure
        print(f"打补丁失败，正在回滚: {exc}", file=sys.stderr)
        for entry in manifest["files"]:
            path = nm / entry["rel"]
            shutil.copy2(Path(entry["backup"]), path)
        print("已回滚到原始文件。", file=sys.stderr)
        return 1

    for rel in already:
        print(f"  skip     {rel}（已有标记）")

    (bdir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\n完成。备份与清单: {bdir}")
    print("注意: 当前 DSH 进程已加载旧模块，必须完整重启 DSH 才会生效。")
    print("回滚: python3 patch.py revert")
    return 0


def revert(nm: Path, home: Path) -> int:
    manifest_path = latest_manifest(home)
    if manifest_path is None:
        die("没有找到补丁备份清单；无需回滚。")
    manifest = load_manifest(manifest_path)
    if manifest is None:
        die(f"备份清单无法解析: {manifest_path}")
    print(f"使用备份清单: {manifest_path}（补丁 v{manifest.get('version', '?')}）")
    if manifest.get("revertedAt"):
        print(f"最新备份已回滚过（{manifest['revertedAt']}），不重复操作。")
        return 0
    for entry in manifest["files"]:
        target = nm / entry["rel"]
        backup = Path(entry["backup"])
        if not backup.is_file():
            die(f"备份缺失: {backup}")
        shutil.copy2(backup, target)
        current = sha256(target)
        if current != entry["sha256Before"]:
            die(f"回滚后校验失败 {entry['rel']}: {current} != {entry['sha256Before']}")
        print(f"  restored {entry['rel']}")
    manifest["revertedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n已回滚（清单: {manifest_path}）。重启 DSH 后恢复原生行为。")
    return 0


# --------------------------------------------------------------------------
# selftest: prove the edits + syntax + restore round-trip on a temp copy
# --------------------------------------------------------------------------

def original_sources(nm: Path, home: Path) -> tuple[dict[str, Path], list[str], list[str], dict[str, Path]]:
    """Pick the pre-patch bytes for every target file.

    Preference order per file: the latest verified backup original from a
    manifest (a patched install cannot supply its own originals), then the
    current file when it is unpatched. A patched file with no verified backup is
    reported as unresolvable instead of being tested against itself.
    """
    backed_up: dict[str, Path] = {}
    source_manifests: dict[str, Path] = {}
    for manifest_path in manifests(home):
        manifest = load_manifest(manifest_path)
        if manifest is None:
            continue
        for entry in manifest.get("files", []) or []:
            if not isinstance(entry, dict):
                continue
            rel = entry.get("rel")
            backup = entry.get("backup")
            expected = entry.get("sha256Before")
            if rel not in TARGET_FILES or rel in backed_up or not isinstance(backup, str):
                continue
            backup_path = Path(backup)
            if not backup_path.is_file():
                continue
            if isinstance(expected, str) and sha256(backup_path) != expected:
                continue  # tampered/mismatched backup: never test against it
            backed_up[rel] = backup_path
            source_manifests[rel] = manifest_path

    sources: dict[str, Path] = {}
    used_backup: list[str] = []
    unresolved: list[str] = []
    for rel in TARGET_FILES:
        current = nm / rel
        if rel in backed_up:
            sources[rel] = backed_up[rel]
            used_backup.append(rel)
        elif MARK not in read(current):
            sources[rel] = current
        else:
            unresolved.append(rel)
    return sources, used_backup, unresolved, source_manifests


def selftest(nm: Path, home: Path) -> int:
    node = require_node()
    sources, used_backup, unresolved, source_manifests = original_sources(nm, home)

    if unresolved:
        print("SELFTEST FAILED")
        for rel in unresolved:
            print(f"  - {rel}: 已打补丁但没有可验证的备份原件，无法确定原始内容")
        print("  请先 `revert`（备份可用时）或重新安装 DSH 后再测。")
        return 1

    if used_backup:
        shown = sorted({str(path) for path in source_manifests.values()})
        print(f"selftest 输入: 使用备份原件 {len(used_backup)}/{len(TARGET_FILES)}（备份清单: {', '.join(shown)}）")
        for manifest_path in {path for path in source_manifests.values()}:
            manifest = load_manifest(manifest_path) or {}
            recorded = manifest.get("nodeModules")
            if isinstance(recorded, str) and recorded != str(nm):
                print(f"警告: 备份记录的目标安装为 {recorded}，当前 --nm 是 {nm}；若失败请对原安装重跑 selftest。")
    else:
        print("selftest 输入: 当前安装文件（无可用备份；按未打补丁的原始文件处理）")

    with tempfile.TemporaryDirectory(prefix="team-permissions-selftest-") as tmp:
        tmp_nm = Path(tmp) / "node_modules"
        for rel in TARGET_FILES:
            dst = tmp_nm / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(sources[rel], dst)
            pkg_json = nm / rel
            pkg_json = pkg_json.parents[1] / "package.json"  # <nm>/@deepseek-ai/<pkg>/package.json
            if pkg_json.is_file():
                shutil.copy2(pkg_json, dst.parents[1] / "package.json")

        before = {rel: sha256(tmp_nm / rel) for rel in TARGET_FILES}
        failures = []

        for rel in TARGET_FILES:
            try:
                new_text = PATCHERS[rel](read(tmp_nm / rel))
                syntax_check(node, tmp_nm / rel, new_text)
                write(tmp_nm / rel, new_text)
                patched_text = read(tmp_nm / rel)
                if MARK not in patched_text:
                    failures.append(f"{rel}: 标记缺失")
                    continue
                for needle in EXPECTED_MARKERS[rel]:
                    if needle not in patched_text:
                        failures.append(f"{rel}: 补丁输出缺少预期片段 {needle!r}")
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{rel}: {exc}")

        for rel in TARGET_FILES:
            shutil.copy2(sources[rel], tmp_nm / rel)  # restore from the selected originals
            if sha256(tmp_nm / rel) != before[rel]:
                failures.append(f"{rel}: 回滚后哈希不一致")

        if failures:
            print("SELFTEST FAILED")
            for item in failures:
                print(f"  - {item}")
            return 1
        print("SELFTEST PASS: 4 个文件补丁可应用、语法通过、可完整回滚。")
        print(f"（基于真实安装: {nm}；原始文件来源: {'备份原件' if used_backup else '当前未打补丁文件'}）")
        return 0


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="team-permissions patch for DSH Agent Teams")
    parser.add_argument("command", choices=["status", "apply", "revert", "selftest"])
    parser.add_argument("--nm", help="DSH node_modules 目录（默认从 `dsh` 命令推断，或读 DSH_NM）")
    parser.add_argument("--dsh-home", help="DSH_HOME（备份位置，默认 ~/.dsh）")
    parser.add_argument("--force", action="store_true", help="apply 时允许 DSH 版本不匹配（默认拒绝）")
    args = parser.parse_args(argv)

    nm = detect_node_modules(args.nm)
    home = dsh_home(args.dsh_home)
    if args.command == "status":
        return status(nm, home)
    if args.command == "apply":
        return apply_patch(nm, home, args.force)
    if args.command == "revert":
        return revert(nm, home)
    return selftest(nm, home)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
