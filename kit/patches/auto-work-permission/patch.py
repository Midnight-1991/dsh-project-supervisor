#!/usr/bin/env python3
"""auto-work-permission: 给 DSH 新增「自动工作」权限预设（workspace-write 沙箱 + 审批 never）。

背景：DSH 0.2.0-rc.2 的用户权限预设表定义在
`@deepseek-ai/dsh-base/cordis.patch.yml` 的 `- id: permission`
（`@deepseek-ai/dsh-permission-presets`）里，内置三档：

    read-only            = read-only          + approval: ask
    workspace-write      = workspace-write    + approval: ask
    danger-full-access   = danger-full-access + approval: never

无人值守「自动工作」需要的组合是 **workspace-write + approval: never**（能写工作区、但不弹任何审批框，
需要授权的动作立即被拒），现有三档都不满足：workspace-write 会弹审批，danger-full-access 不限制文件范围。
本补丁在这张表里追加第四档：

    auto-work            = workspace-write    + approval: never

依据 `@deepseek-ai/dsh-permission-presets/README.zh.md`：预设表就是插件 config 的 `presets` 映射
（`sandbox` + `approval` 两个旋钮），`custom`/`auto` 是保留名，其余名字可自定义；新增一档属于纯配置变更
（不打 JS 补丁），并且 `permission` 行只在 dsh-base 这一个 bundle 层定义（本机已核实全文唯一）。
用户随后在 Web 会话里用 `/permission auto-work` 选用（选择器里显示为 Title Case 的 `Auto Work`，
中文界面不会本地化自定义预设名）；「通用设置 → 默认权限」里也能把它设为新会话默认值。

补丁只改**一个 YAML 文件里的一处 config 表**，带 marker、唯一性断言、`.bak.<时间戳>` 备份、
失败整体回滚、重复 apply 幂等、revert 逐字节还原。`selftest` 只在 mktemp 临时副本上演练，
**真实 DSH 安装零写入**。

用法（在本目录执行；python3 标准库，无第三方依赖、不联网）：
    python3 patch.py status                # 只读：本机是否已应用
    python3 patch.py apply --dry-run       # 只打印将改内容，不写盘
    python3 patch.py --dry-run apply       # 同上（--dry-run 也可放在子命令前）
    python3 patch.py apply                 # 真正打补丁（先备份）
    python3 patch.py revert [--dry-run]    # 从最近一次 .bak.<时间戳> 逐字节还原
    python3 patch.py selftest              # 临时副本上验证 apply/幂等/revert，真实文件 sha256 前后一致

退出码：0 成功；1 断言/版本/冲突等失败（未写坏文件）；2 找不到 DSH 安装或目标文件。

目标定位（不硬编码单一绝对路径）：
    1) --nm <path>            显式指定 node_modules
    2) DSH_NM 环境变量
    3) `command -v dsh` 的 realpath 向上找到 node_modules
    4) glob `~/.npm/_npx/*/node_modules`（要求同时存在 dsh 包与目标 YAML），取最近修改的
默认 /tmp 之外的任何路径只读；selftest/status 不写真实安装。
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
from pathlib import Path

MARK = "[auto-work-permission]"
PATCH_NAME = "auto-work-permission"
PATCH_VERSION = "1"
# 本补丁编写/验证时的 DSH 版本；其他版本结构可能不同，apply 默认拒绝（可 --force）。
TESTED_DSH_VERSION = "0.2.0-rc.2"

# 目标文件（相对 DSH node_modules 根）与用于版本探测的包相对路径。
TARGET_REL = "@deepseek-ai/dsh-base/cordis.patch.yml"
DSH_PKG_REL = "@deepseek-ai/dsh/package.json"
PRESET_ROW_ID = "permission"
# 若用户 patch 层按该 id 覆盖整行 config，会盖掉本补丁的效果，status 会提示。
OVERRIDE_ROW_IDS = (PRESET_ROW_ID,)

# 目标原版片段：dsh-base 里的 permission 行 + 内置三档预设（必须恰好出现一次）。
BEFORE = (
    "    - id: permission\n"
    "      name: '@deepseek-ai/dsh-permission-presets'\n"
    "      config:\n"
    "        presets:\n"
    "          read-only:\n"
    "            sandbox: read-only\n"
    "            approval: ask\n"
    "          workspace-write:\n"
    "            sandbox: workspace-write\n"
    "            approval: ask\n"
    "          danger-full-access:\n"
    "            sandbox: danger-full-access\n"
    "            approval: never\n"
)

# 追加的第四档预设（缩进与内置档一致：档名 10 空格、字段 12 空格）。
INSERT = (
    "          # " + MARK + " 自动工作：workspace-write 沙箱 + 审批 never（需要授权的动作立即被拒、不弹窗）\n"
    "          auto-work:\n"
    "            sandbox: workspace-write\n"
    "            approval: never\n"
)
AFTER = BEFORE + INSERT

BACKUP_RE = re.compile(r"\.bak\.\d{8}-\d{6}(?:-\d+)?$")


# --------------------------------------------------------------------------
# 异常与错误类型
# --------------------------------------------------------------------------


class TargetNotFound(Exception):
    """找不到 DSH node_modules 或目标文件（exit 2）。"""


class PatchError(Exception):
    """唯一性/结构断言失败或无法安全打补丁（exit 1，未写坏文件）。"""


class AlreadyApplied(Exception):
    """目标文件已是补丁后状态（重复 apply 幂等返回 0）。"""


# --------------------------------------------------------------------------
# 小工具
# --------------------------------------------------------------------------


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_text(path: Path) -> str:
    # newline="" 保留原始换行，避免读写往返改动字节。
    with open(str(path), "r", encoding="utf-8", newline="") as fh:
        return fh.read()


def write_text(path: Path, text: str) -> None:
    with open(str(path), "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def write_atomic(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp-" + str(os.getpid()))
    try:
        write_text(tmp, text)
        os.replace(str(tmp), str(path))
    finally:
        if tmp.exists():
            tmp.unlink()


def dsh_home(explicit: "str | None") -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    return Path(os.environ.get("DSH_HOME", "~/.dsh")).expanduser().resolve()


def read_dsh_version(nm: Path) -> "str | None":
    path = nm / DSH_PKG_REL
    if not path.is_file():
        return None
    try:
        data = json.loads(read_text(path))
    except (OSError, ValueError):
        return None
    version = data.get("version") if isinstance(data, dict) else None
    return version if isinstance(version, str) and version else None


# --------------------------------------------------------------------------
# 目标定位
# --------------------------------------------------------------------------


def find_target(nm: Path) -> "Path | None":
    target = nm / TARGET_REL
    return target if target.is_file() else None


def _npx_node_modules_candidates() -> "list[Path]":
    home = Path.home()
    candidates: "list[Path]" = []
    npx_root = home / ".npm" / "_npx"
    if npx_root.is_dir():
        for entry in sorted(npx_root.glob("*/node_modules")):
            candidates.append(entry)
    # 最近修改的优先（npx 新安装/升级后的目录通常 mtime 更新）。
    def mtime(nm: Path) -> float:
        pkg = nm / DSH_PKG_REL
        return pkg.stat().st_mtime if pkg.is_file() else 0.0

    candidates.sort(key=mtime, reverse=True)
    return candidates


def locate(explicit_nm: "str | None") -> "tuple[Path, str]":
    """返回 (node_modules 路径, 定位方式说明)。找不到时抛 TargetNotFound。"""
    tried: "list[str]" = []

    # 显式指定的路径是权威的：找不到就 exit 2，绝不静默回退到别的安装（避免误改其他 DSH）。
    explicit = None  # type: ignore[assignment]
    explicit_label = ""
    if explicit_nm:
        explicit, explicit_label = Path(explicit_nm).expanduser().resolve(), "--nm 指定"
    else:
        env_nm = os.environ.get("DSH_NM")
        if env_nm:
            explicit = Path(env_nm).expanduser().resolve()
            explicit_label = "DSH_NM 环境变量"
    if explicit is not None:
        if find_target(explicit) is not None:
            return explicit, explicit_label
        raise TargetNotFound(
            "ERROR: 显式指定的 node_modules 里没有目标文件：%s\n"
            "  期望存在：%s\n"
            "  提示：--nm / DSH_NM 必须指向 DSH 安装的 **node_modules 根目录**（其下有 @deepseek-ai/ 目录）。\n"
            "  本次不会回退到自动定位（避免误改其他 DSH 安装）；去掉 --nm 可让脚本自动定位。"
            % (explicit, explicit / TARGET_REL)
        )

    dsh = shutil.which("dsh")
    if dsh:
        resolved = Path(dsh).resolve()
        for parent in [resolved] + list(resolved.parents):
            if parent.name == "node_modules":
                if find_target(parent) is not None:
                    return parent, "command -v dsh → %s" % resolved
                tried.append("%s（command -v dsh，缺目标文件）" % parent)
                break

    for nm in _npx_node_modules_candidates():
        if find_target(nm) is not None:
            return nm, "npx glob → %s" % nm
        tried.append("%s（npx glob，缺目标文件）" % nm)

    lines = [
        "ERROR: 找不到 DSH 安装里的目标文件 %s" % TARGET_REL,
        "",
        "本补丁需要先在本机安装 DSH（0.2.0-rc.2 一类的 npm/npx 安装）。请按顺序排查：",
        "  1) 确认 dsh 在 PATH 中：command -v dsh     （应输出 .../node_modules/.bin/dsh）",
        "  2) 确认 npx 缓存里有 DSH：ls ~/.npm/_npx/*/node_modules/@deepseek-ai/dsh/package.json",
        "  3) 手动指定 node_modules 重试：",
        "       python3 patch.py status --nm /path/to/node_modules",
        "     （node_modules 下应存在 @deepseek-ai/dsh-base/cordis.patch.yml）",
        "  4) 若刚用 `npx @deepseek-ai/dsh` 升级过，旧目录可能已被替换，请按上面的命令重新定位。",
    ]
    if tried:
        lines.append("")
        lines.append("已尝试：")
        lines.extend("  - " + item for item in tried)
    raise TargetNotFound("\n".join(lines))


# --------------------------------------------------------------------------
# 文本变换：apply / revert
# --------------------------------------------------------------------------


def patch_text(text: str) -> str:
    """把原版文本变成补丁后文本；断言目标片段恰好一次且无冲突。"""
    if MARK in text:
        raise AlreadyApplied("目标文件已含 %s 标记，已是补丁后状态。" % MARK)

    count = text.count(BEFORE)
    if count != 1:
        raise PatchError(
            "目标片段未唯一匹配：期望恰好 1 处 permission 预设表（含内置三档），"
            "实际 %d 处。文件可能已被其他补丁/编辑器改过，未做任何修改。" % count
        )
    if text.count("- id: %s" % PRESET_ROW_ID) != 1:
        raise PatchError(
            "未找到唯一的 `- id: %s` 权限预设行，目标结构不符合本补丁预期。" % PRESET_ROW_ID
        )
    if "auto-work" in text:
        raise PatchError(
            "目标文件里已存在 `auto-work` 字样（可能已手动加过预设或旧版补丁），"
            "但缺少本补丁标记；拒绝重复添加。请先确认现有预设定���是否需要保留。"
        )

    idx = text.index(BEFORE)
    # 插入点必须位于 dsh-base 的 `- insert:` 列表内。
    head = text[:idx]
    if head.rfind("- insert:") < 0:
        raise PatchError("permission 行不在 `- insert:` 列表内，拒绝修改（结构校验失败）。")

    return text[:idx] + AFTER + text[idx + len(BEFORE):]


def unpatch_text(text: str) -> str:
    """把补丁后文本还原成原版文本；断言补丁后片段恰好一次。"""
    if MARK not in text:
        raise PatchError("目标文件不含 %s 标记，无法据此还原。" % MARK)
    count = text.count(AFTER)
    if count != 1:
        raise PatchError(
            "补丁后片段未唯一匹配（%d 处），文件在 apply 之后又被改动过；"
            "请优先用 revert 的备份还原，或手动处理。" % count
        )
    restored = text.replace(AFTER, BEFORE, 1)
    if MARK in restored:
        raise PatchError("还原后仍残留 %s 标记，拒绝写入。" % MARK)
    return restored


def validate_patched(text: str) -> None:
    """对补丁后文本做结构断言（不依赖 PyYAML；纯文本不变量 + 缩进检查）。"""
    if text.count(MARK) != 1:
        raise PatchError("补丁后文本中 marker 数量应为 1，实际 %d。" % text.count(MARK))
    if text.count(AFTER) != 1:
        raise PatchError("补丁后片段数量应为 1，实际 %d。" % text.count(AFTER))
    checks = (
        ("- id: permission", 1),
        ("name: '@deepseek-ai/dsh-permission-presets'", 1),
        ("          read-only:\n", 1),
        ("          workspace-write:\n", 1),
        ("          danger-full-access:\n", 1),
        ("          auto-work:\n", 1),
        ("            sandbox: workspace-write\n", 2),  # workspace-write 档 + auto-work 档
        ("            approval: ask\n", 2),              # read-only + workspace-write
        ("            approval: never\n", 2),            # danger-full-access + auto-work
    )
    for needle, want in checks:
        got = text.count(needle)
        if got != want:
            raise PatchError("补丁后结构断言失败：%r 期望 %d 处，实际 %d 处。" % (needle, want, got))
    if "\t" in text:
        raise PatchError("补丁后文本出现制表符（目标文件本应全为空格缩进），拒绝写入。")
    if not text.startswith("# The dsh-base bundle patch:"):
        raise PatchError("补丁后文件头异常（文件可能被替换），拒绝写入。")


# --------------------------------------------------------------------------
# 备份
# --------------------------------------------------------------------------


def backup_path(target: Path) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    candidate = target.with_name(target.name + ".bak." + stamp)
    n = 0
    while candidate.exists():
        n += 1
        candidate = target.with_name(target.name + ".bak." + stamp + "-" + str(n))
    return candidate


def find_backups(target: Path) -> "list[Path]":
    found = [
        path
        for path in target.parent.glob(target.name + ".bak.*")
        if path.is_file() and BACKUP_RE.search(path.name)
    ]
    found.sort(key=lambda p: (p.name, p.stat().st_mtime))
    return found


# --------------------------------------------------------------------------
# 用户 patch 层覆盖检测（只读提示，不阻断）
# --------------------------------------------------------------------------


def user_patch_layers(home: Path) -> "list[Path]":
    layers: "list[Path]" = []
    home_patch = home / "cordis.patch.yml"
    if home_patch.is_file():
        layers.append(home_patch)
    profiles = home / "profiles"
    if profiles.is_dir():
        for path in sorted(profiles.glob("*/cordis.patch.yml")):
            if path.is_file():
                layers.append(path)
    return layers


def find_override_layers(home: Path, row_ids: "tuple[str, ...]") -> "list[tuple[Path, str]]":
    hits: "list[tuple[Path, str]]" = []
    patterns = [
        (re.compile(r"(?m)^\s*-\s+id:\s*['\"]?%s['\"]?\s*$" % re.escape(rid)), rid)
        for rid in row_ids
    ]
    for layer in user_patch_layers(home):
        try:
            text = read_text(layer)
        except OSError:
            continue
        for pattern, rid in patterns:
            if pattern.search(text):
                hits.append((layer, rid))
    return hits


# --------------------------------------------------------------------------
# 命令实现
# --------------------------------------------------------------------------


def print_override_warnings(home: Path) -> None:
    hits = find_override_layers(home, OVERRIDE_ROW_IDS)
    for layer, rid in hits:
        print(
            "⚠ 用户 patch 层发现同 id 整行覆盖：%s 里的 `- id: %s`。\n"
            "  该层在 bundle 之后应用且替换整行 config，会盖掉本补丁新增的 auto-work 预设；"
            "  若确实需要在该层覆盖，请把 auto-work 档一并写进该层的 presets 表。" % (layer, rid)
        )


def status(target: Path, nm: Path, home: Path) -> int:
    print("补丁: %s v%s（DSH「自动工作」权限预设）" % (PATCH_NAME, PATCH_VERSION))
    print("目标文件: %s" % target)
    version = read_dsh_version(nm)
    if version is None:
        print("DSH 版本: 未知（未找到 %s）" % DSH_PKG_REL)
    elif version == TESTED_DSH_VERSION:
        print("DSH 版本: %s（与本补丁验证版本一致）" % version)
    else:
        print(
            "DSH 版本: %s（本补丁验证版本 %s，结构可能不同；apply 默认拒绝，可 --force）"
            % (version, TESTED_DSH_VERSION)
        )
    text = read_text(target)
    backups = find_backups(target)
    print("当前 sha256: %s" % sha256(target))
    if MARK in text:
        print("状态: APPLIED（已应用：auto-work = workspace-write + approval: never）")
        print("用法: 完整重启 DSH 后，在新会话里用 `/permission auto-work` 选用（选择器显示 Auto Work）。")
    else:
        print("状态: NOT APPLIED（未应用，权限预设仍是内置三档）")
        print("apply 后: 多出第四档「自动工作」= workspace-write 沙箱 + 审批 never（需要授权即拒绝、不弹窗）。")
    if backups:
        print("最近备份: %s" % backups[-1])
    else:
        print("备份: 无（尚未 apply 过）")
    print_override_warnings(home)
    return 0


def _precheck_apply(target: Path, nm: Path, force: bool) -> "int | None":
    """版本与可写性预检；返回非 None 表示应提前返回该退出码。"""
    version = read_dsh_version(nm)
    if version is None:
        print("警告: 无法读取 DSH 版本（未找到 %s），按未知版本继续。" % DSH_PKG_REL, file=sys.stderr)
    elif version != TESTED_DSH_VERSION and not force:
        print(
            "ERROR: 当前 DSH 版本 %s 与本补丁验证版本 %s 不一致。\n"
            "本补丁按该版本的文件布局编写；在其他版本上结构断言可能失败（失败会自动回滚，不会写坏文件）。\n"
            "确认仍要尝试请加 --force：python3 patch.py apply --force" % (version, TESTED_DSH_VERSION),
            file=sys.stderr,
        )
        return 1
    if not os.access(str(target), os.W_OK):
        print(
            "ERROR: 目标文件不可写：%s\n"
            "  npx/npm 缓存通常属于当前用户；若提示权限不足，请检查文件归属或用有权限的账号执行。\n"
            "  本脚本不会自动提权。" % target,
            file=sys.stderr,
        )
        return 1
    if not os.access(str(target.parent), os.W_OK):
        print("ERROR: 目标目录不可写（无法创建 .bak 备份）：%s" % target.parent, file=sys.stderr)
        return 1
    return None


def print_diff(old: str, new: str) -> None:
    diff = difflib.unified_diff(
        old.splitlines(True),
        new.splitlines(True),
        fromfile="原版 " + TARGET_REL,
        tofile="补丁后 " + TARGET_REL,
        n=3,
    )
    for line in diff:
        sys.stdout.write(line if line.endswith("\n") else line + "\n")


def apply_patch(target: Path, nm: Path, home: Path, dry_run: bool, force: bool) -> int:
    early = _precheck_apply(target, nm, force)
    if early is not None:
        return early

    before_sha = sha256(target)
    text = read_text(target)
    if MARK in text:
        print("已应用过，无改动（幂等）。目标文件: %s" % target)
        print("提示: 若本次是升级补丁后重跑，先 `revert` 再 `apply`。")
        return 0

    try:
        patched = patch_text(text)
        validate_patched(patched)
    except (PatchError, AlreadyApplied) as exc:
        print("ERROR: %s" % exc, file=sys.stderr)
        print("未做任何修改。", file=sys.stderr)
        return 1

    if dry_run:
        print("DRY-RUN: 将修改 %s（不写盘、不创建备份）" % target)
        print_diff(text, patched)
        print("DRY-RUN: 未写入任何文件。")
        print_override_warnings(home)
        return 0

    backup = backup_path(target)
    try:
        shutil.copy2(str(target), str(backup))
        if sha256(backup) != before_sha:
            raise PatchError("备份校验失败：备份 sha256 与原文件不一致。")
        print("备份: %s" % backup)
        write_atomic(target, patched)
        after_sha = sha256(target)
        if after_sha != sha256_text(patched):
            raise PatchError("写入后校验失败：目标文件内容与预期不一致。")
    except Exception as exc:  # noqa: BLE001 - 任何失败都整体回滚
        print("打补丁失败，正在回滚: %s" % exc, file=sys.stderr)
        try:
            if backup.is_file():
                shutil.copy2(str(backup), str(target))
            if sha256(target) != before_sha:
                raise PatchError("回滚校验失败：%s 的 sha256 与打补丁前不一致，请从备份手动恢复：%s"
                                 % (target, backup))
        except Exception as rollback_exc:  # noqa: BLE001
            print("回滚失败: %s" % rollback_exc, file=sys.stderr)
            return 1
        print("已回滚到原文件（sha256 %s）。" % before_sha, file=sys.stderr)
        return 1

    print("已应用: %s" % target)
    print("  - 新增预设: auto-work → sandbox: workspace-write, approval: never")
    print("  - 原文件 sha256: %s" % before_sha)
    print("  - 新文件 sha256: %s" % after_sha)
    print("生效条件: **完整重启 DSH** 后，在 Web 会话里用 `/permission auto-work` 选用；")
    print("          或「通用设置 → 默认权限」把它设为新会话默认值。已有会话不变。")
    print("回滚: python3 patch.py revert")
    print_override_warnings(home)
    return 0


def revert_patch(target: Path, dry_run: bool, force: bool) -> int:
    text = read_text(target)
    if MARK not in text:
        print("目标文件不含 %s 标记：本补丁未应用，无需回滚。" % MARK)
        return 0

    backups = find_backups(target)
    if not backups:
        print(
            "ERROR: 目标文件已应用补丁，但找不到 .bak.<YYYYMMDD-HHMMSS> 备份，无法安全回滚。\n"
            "  请手动删除 auto-work 预设块（含 %s 标记），或用 DSH 升级/重装覆盖目标文件。\n"
            "  目标文件: %s" % (MARK, target),
            file=sys.stderr,
        )
        return 1
    backup = backups[-1]
    backup_text = read_text(backup)

    if MARK in backup_text:
        print("ERROR: 最近的备份文件也含补丁标记（%s），不是原版文件，拒绝用它回滚。" % backup, file=sys.stderr)
        return 1
    try:
        expected_current = patch_text(backup_text)
        validate_patched(expected_current)
    except (PatchError, AlreadyApplied) as exc:
        print("ERROR: 备份文件不像本补丁应用前的原版文件，拒绝回滚: %s" % exc, file=sys.stderr)
        return 1

    if text != expected_current:
        msg = (
            "目标文件在 apply 之后又被改动过（当前内容 ≠ 备份+补丁的预期内容）。\n"
            "  为避免覆盖别人的改动，默认拒绝回滚。备份: %s\n"
            "  确认要用备份逐字节覆盖，请加 --force。" % backup
        )
        if not force:
            print("ERROR: %s" % msg, file=sys.stderr)
            return 1
        print("警告: %s（--force 已指定，继续）" % msg, file=sys.stderr)

    if dry_run:
        print("DRY-RUN: 将从备份还原 %s（不写盘）" % target)
        print("DRY-RUN: 备份: %s" % backup)
        print_diff(text, backup_text)
        print("DRY-RUN: 未写入任何文件。")
        return 0

    backup_sha = sha256(backup)
    shutil.copy2(str(backup), str(target))
    if sha256(target) != backup_sha:
        print("ERROR: 还原后 sha256 与备份不一致，请手动从 %s 恢复。" % backup, file=sys.stderr)
        return 1
    print("已回滚（逐字节还原）: %s" % target)
    print("  - 还原来源: %s" % backup)
    print("  - 文件 sha256: %s" % backup_sha)
    print("  - 备份保留: %s（确认无误后可自行删除）" % backup)
    print("生效条件: 完整重启 DSH 后，/permission 选择器不再提供 auto-work 档。")
    return 0


# --------------------------------------------------------------------------
# selftest：只在 mktemp 副本上演练，真实安装零写入
# --------------------------------------------------------------------------


def _silent(fn, *args, **kwargs):
    """调用某个 cmd 函数并吞掉它的 stdout（selftest 只保留断言结果）。"""
    import contextlib
    import io

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        code = fn(*args, **kwargs)
    return code, buf.getvalue()


def selftest(nm: Path, home: Path) -> int:
    target = find_target(nm)
    if target is None:
        raise TargetNotFound("目标文件不存在，无法自测：%s" % (nm / TARGET_REL))

    real_before = sha256(target)
    tmpdir = Path(tempfile.mkdtemp(prefix="auto-work-permission-selftest-"))
    results: "list[tuple[str, bool, str]]" = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, ok, detail))
        print("%s  %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else "  ← " + detail))

    try:
        tmp_target = tmpdir / target.name
        shutil.copy2(str(target), str(tmp_target))
        original = read_text(tmp_target)
        original_sha = sha256(tmp_target)

        # 1) 纯函数：apply 文本
        patched = patch_text(original)
        validate_patched(patched)
        check(
            "apply 文本: 生成 auto-work = workspace-write + approval: never",
            "          auto-work:\n            sandbox: workspace-write\n            approval: never\n" in patched
            and patched.count(MARK) == 1,
            "补丁后文本缺少 auto-work 预设",
        )
        check("apply 文本: 只改 permission 行（- id: permission 计数仍为 1）",
              patched.count("- id: permission") == 1)
        check("apply 文本: 内置三档原样保留",
              all(p in patched for p in ("          read-only:\n", "          workspace-write:\n",
                                         "          danger-full-access:\n")))

        # 2) 唯一性断言：重复片段必须被拒绝
        duplicated = original.replace(BEFORE, BEFORE + BEFORE, 1)
        try:
            patch_text(duplicated)
            dup_rejected = False
        except PatchError:
            dup_rejected = True
        check("唯一性断言: 目标片段出现 2 处时拒绝打补丁", dup_rejected)

        # 3) 冲突检测：已手动存在 auto-work（无标记）时必须拒绝
        conflicted = original.replace(
            BEFORE, BEFORE + "          auto-work:\n            sandbox: workspace-write\n", 1
        )
        try:
            patch_text(conflicted)
            conflict_rejected = False
        except PatchError:
            conflict_rejected = True
        check("冲突检测: 已存在 auto-work 时拒绝重复添加", conflict_rejected)

        # 4) 临时副本上走真实 apply 流程
        code, out = _silent(apply_patch, tmp_target, nm, home, False, True)
        check("apply: 临时副本写入成功 (exit 0)", code == 0, out.strip()[-400:])
        applied_bytes = tmp_target.read_bytes()
        check("apply: marker 已写入副本", MARK in read_text(tmp_target))
        backups = find_backups(tmp_target)
        check("apply: 生成 .bak.<YYYYMMDD-HHMMSS> 备份（1 个）", len(backups) == 1,
              "实际 %d 个" % len(backups))

        # 5) 幂等：重复 apply 逐字节无变化、备份不增加
        code, out = _silent(apply_patch, tmp_target, nm, home, False, True)
        check("幂等: 重复 apply 返回 0", code == 0, out.strip()[-400:])
        check("幂等: 重复 apply 后文件逐字节无变化", tmp_target.read_bytes() == applied_bytes)
        check("幂等: 重复 apply 不新增备份", len(find_backups(tmp_target)) == 1)

        # 6) revert --dry-run 不写盘
        code, out = _silent(revert_patch, tmp_target, True, True)
        check("revert --dry-run: 未写盘", code == 0 and tmp_target.read_bytes() == applied_bytes,
              out.strip()[-400:])

        # 7) revert 逐字节还原
        code, out = _silent(revert_patch, tmp_target, False, True)
        restored = tmp_target.read_bytes()
        check("revert: exit 0", code == 0, out.strip()[-400:])
        check("revert: 逐字节还原（sha256 == 原版）",
              sha256(tmp_target) == original_sha and restored == original.encode("utf-8"))
        check("revert: marker 已清除", MARK not in read_text(tmp_target))

        # 8) 原版副本上 dry-run 不写盘
        before_dry = tmp_target.read_bytes()
        code, out = _silent(apply_patch, tmp_target, nm, home, True, True)
        check("apply --dry-run: exit 0 且不写盘",
              code == 0 and tmp_target.read_bytes() == before_dry, out.strip()[-400:])
        check("apply --dry-run: 输出包含将改内容（diff 行）", "+" in out and "auto-work" in out)

        # 9) 定位失败路径：空 node_modules 必须返回 None（status/apply 走 exit 2）
        empty_nm = tmpdir / "empty-node_modules"
        empty_nm.mkdir()
        check("定位: 缺目标文件时 find_target 返回 None（status/apply 走 exit 2）",
              find_target(empty_nm) is None)
        # 10) 显式 --nm 指向空目录时必须报错，而不是回退到真实安装
        try:
            locate(str(empty_nm))
            explicit_rejected = False
        except TargetNotFound:
            explicit_rejected = True
        check("定位: 显式 --nm 缺目标时拒绝回退（不误改其他安装）", explicit_rejected)
    finally:
        shutil.rmtree(str(tmpdir), ignore_errors=True)

    real_after = sha256(target)
    print("")
    print("真实目标文件: %s" % target)
    print("真实文件 sha256（selftest 前）: %s" % real_before)
    print("真实文件 sha256（selftest 后）: %s" % real_after)
    check("真实 DSH 安装零写入（前后 sha256 一致）", real_before == real_after,
          "sha256 前后不一致！真实文件被改动。")

    failed = [item for item in results if not item[1]]
    print("")
    if failed:
        print("SELFTEST: FAIL（%d/%d 项失败）" % (len(failed), len(results)))
        for name, _ok, detail in failed:
            print("  - %s  %s" % (name, detail))
        return 1
    print("SELFTEST: PASS（%d/%d 项；真实 DSH 安装零写入）" % (len(results), len(results)))
    return 0


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="patch.py",
        description="DSH 可选补丁：%s —— 新增「自动工作」权限预设（workspace-write + 审批 never）。" % PATCH_NAME,
    )
    parser.add_argument("--nm", help="DSH 安装的 node_modules 路径（默认自动定位）")
    parser.add_argument("--dsh-home", dest="dsh_home", help="DSH_HOME（默认 $DSH_HOME 或 ~/.dsh，只用于覆盖提示）")
    parser.add_argument(
        "--dry-run", dest="dry_run", action="store_true",
        help="只打印将改内容，不写盘（也可放在子命令后）",
    )
    sub = parser.add_subparsers(dest="command")

    for name, help_text in (
        ("status", "只读：显示本机是否已应用（默认子命令）"),
        ("apply", "打补丁（先备份；失败整体回滚）"),
        ("revert", "从最近的 .bak 备份逐字节还原"),
        ("selftest", "在 mktemp 副本上验证 apply/幂等/revert；真实安装零写入"),
    ):
        sp = sub.add_parser(name, help=help_text)
        sp.add_argument("--nm", help=argparse.SUPPRESS)
        sp.add_argument("--dsh-home", dest="dsh_home", help=argparse.SUPPRESS)
        sp.add_argument("--force", action="store_true",
                        help="版本不一致（apply）或目标已被改动（revert）时仍然继续")
        sp.add_argument(
            "--dry-run", dest="dry_run", action="store_true", default=argparse.SUPPRESS,
            help="只打印将改内容，不写盘",
        )
    return parser


def main(argv: "list[str] | None" = None) -> int:
    args = build_parser().parse_args(argv)
    command = args.command or "status"
    dry_run = bool(getattr(args, "dry_run", False))
    force = bool(getattr(args, "force", False))
    home = dsh_home(getattr(args, "dsh_home", None))

    try:
        nm, how = locate(getattr(args, "nm", None))
    except TargetNotFound as exc:
        print(str(exc), file=sys.stderr)
        return 2

    target = find_target(nm)
    if target is None:  # locate 已保证存在，这里只防御
        print("ERROR: 目标文件不存在: %s" % (nm / TARGET_REL), file=sys.stderr)
        return 2

    print("目标定位: %s" % how)
    print("node_modules: %s" % nm)
    print("目标文件: %s" % target)
    print("")

    if command == "status":
        return status(target, nm, home)
    if command == "apply":
        return apply_patch(target, nm, home, dry_run, force)
    if command == "revert":
        return revert_patch(target, dry_run, force)
    if command == "selftest":
        return selftest(nm, home)
    print("ERROR: 未知子命令 %r" % command, file=sys.stderr)
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except TargetNotFound as exc:  # locate 之外的兜底
        print(str(exc), file=sys.stderr)
        raise SystemExit(2)
