#!/usr/bin/env bash
# =============================================================================
# sync-kit.sh — 把工作区源文件同步为可移植安装包 setup/ 内的 kit 模板副本
#
# 这是**唯一同步入口**：手工改动 kit 副本会被 --check 判为漂移；改完源文件重跑本脚本。
# 脚本按自身位置定位工作区根，可在任意目录执行（bash setup/sync-kit.sh）。
#
# 用法：
#   bash setup/sync-kit.sh               # 同步：写 kit 副本（幂等，第二次应全部 unchanged）
#   bash setup/sync-kit.sh --check       # 只比对不写盘：有漂移打印 unified diff 并 exit 1
#   bash setup/sync-kit.sh --global      # 同步 + 更新 ~/.dsh 全局技能（覆盖前备份 .bak.<时间戳>）
#   bash setup/sync-kit.sh --check --global
#
# 同步映射与转换规则（源 → kit，全部在下面内嵌 python 的 transform_* 里）：
#   AGENTS.md                               → setup/AGENTS.supervisor.md
#       · `setup/patches/team-permissions` → `patches/team-permissions`
#       · 末节「## 工作区文件」整体替换为通用文件地图（4 行，见 AGENTS_TAIL）
#   主管手册.md                             → setup/主管手册.md
#       · `KIT=/绝对路径/setup` → `KIT=<解压后的 project-supervisor-kit 目录>`
#       · `setup/patches/team-permissions` → `patches/team-permissions`
#       · 删除「分享给朋友」工作区专属行
#       · 工程化维护里的 `cd setup ...` → `cd "$(dirname "$0")"   # 解压根目录`
#   .dsh/skills/project-supervisor/           → setup/skill/
#       · SKILL.md 转换 metadata.workspace → "*"（技能元数据指向任意工作区）
#       · templates/ 逐字节复制（plan / task-brief / ledger / review-gate 四个模板）
#       · --check 逐文件比对，并检测 kit 中多余文件（正常同步会删除）
#   .dsh/skills/improving-prompts/          → setup/skill-improving-prompts/
#       · SKILL.md 逐字节复制（技能本体，无工作区元数据）
#       · LICENSE、references/（14 个 .md）、templates/（2 个 .md）逐字节复制
#       · --check 逐文件比对，并检测 kit 中多余文件（正常同步会删除）
#   research/*.md（DECISIONS.md、INCIDENT-* 除外） → setup/research/ 同名逐字节复制
#
# --global 还会把两个完整技能目录同步到 $DSH_HOME/skills/{project-supervisor,improving-prompts}/；
# 每个被覆盖的旧文件先备份为 <文件名>.bak.<时间戳>（同一轮共用一个时间戳）。
#
# 环境变量：DSH_HOME  --global 的目标根目录（默认 ~/.dsh）
# 退出码：0 = 一致 / 同步成功；1 = --check 发现漂移；2 = 参数或源文件错误
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE=sync
GLOBAL=0
for arg in "$@"; do
  case "$arg" in
    --check)  MODE=check ;;
    --global) GLOBAL=1 ;;
    -h|--help)
      sed -n '/^# 用法：/,/^# 环境变量/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "错误：未知参数 ${arg}（可用：--check / --global / -h）" >&2
      exit 2 ;;
  esac
done

exec python3 - "$ROOT" "$MODE" "$GLOBAL" <<'PY'
import difflib
import os
import re
import shutil
import sys
import time
from pathlib import Path

root = Path(sys.argv[1])
setup = root / "setup"
mode = sys.argv[2]                 # sync | check
do_global = sys.argv[3] == "1"
ds_home = Path(os.environ.get("DSH_HOME") or (Path.home() / ".dsh"))

STATS = {"changed": 0, "same": 0, "drift": 0, "removed": 0}

# ---- 各文件的 kit 版固定片段 -------------------------------------------------
# AGENTS.md 的「## 工作区文件」节：kit 版换成通用文件地图（不含本工作区专有文件）。
AGENTS_TAIL = (
    "- `.dsh/skills/project-supervisor/SKILL.md`：主管技能的完整流程与模板（本规则详细版）。\n"
    "- `主管手册.md`：给用户的使用说明；`research/DECISIONS.md`：关键决策记录（如没有就新建）。\n"
    "- `patches/team-permissions/`：可选补丁（若随包安装，见该目录 README）。\n"
    "- 项目自身文件：按项目需要补充（源码、文档、测试）；主管开工时先摸清现状。\n"
)
# 主管手册.md：安装包位置、维护脚本的进入方式（解压根目录）替换为通用写法。
KIT_LINE = "KIT=<解压后的 project-supervisor-kit 目录>"
MANUAL_CD = 'cd "$(dirname "$0")"   # 解压根目录'

# 主管技能：源目录与 kit 副本都是完整技能目录（SKILL.md + templates/ 四个工作流模板）
SUPERVISOR_SRC_REL = ".dsh/skills/project-supervisor"
SUPERVISOR_KIT_REL = "setup/skill"
SUPERVISOR_TEMPLATES = ("plan.md", "task-brief.md", "ledger.md", "review-gate.md")

# 提示词润色技能：源目录与 kit 副本都是完整技能目录（SKILL.md + LICENSE + references/ + templates/）
POLISH_SRC_REL = ".dsh/skills/improving-prompts"
POLISH_KIT_REL = "setup/skill-improving-prompts"
POLISH_REF_COUNT = 14
POLISH_TPL_COUNT = 2
POLISH_REQUIRED_FILES = (
    "LICENSE",
    "references/diagnosis.md",
    "references/model-family-notes.md",
    "references/worked-examples.md",
    "templates/prompt-skeleton.md",
    "templates/improvement-report.md",
)


def die(msg):
    print("错误: " + msg, file=sys.stderr)
    raise SystemExit(2)


def unified(src_rel, dst_rel, old, new):
    return "".join(difflib.unified_diff(
        old.splitlines(True), new.splitlines(True),
        fromfile="a/" + src_rel, tofile="b/" + dst_rel, n=3))


# ---- 转换函数（每个都带断言，源文件结构变了会立即报错而不是静默漏转） --------
def transform_agents(text):
    out = text.replace("setup/patches/team-permissions", "patches/team-permissions")
    heading = "## 工作区文件\n"
    idx = out.rfind(heading)
    if idx == -1:
        die("AGENTS.md 缺少末节「## 工作区文件」")
    after = idx + len(heading)
    if not out.startswith("\n", after):
        die("AGENTS.md 的「## 工作区文件」标题后应有一个空行")
    out = out[:after] + "\n" + AGENTS_TAIL
    assert "setup/patches/team-permissions" not in out, "AGENTS kit 版残留 setup/patches 路径"
    assert "patches/team-permissions" in out, "AGENTS kit 版缺少 patches/team-permissions"
    assert "<HOME>/" not in out, "AGENTS kit 版含本机绝对路径"
    assert out.rstrip("\n").endswith("主管开工时先摸清现状。"), "AGENTS kit 版末行未收敛"
    return out


def transform_manual(text):
    lines = []
    n_share = n_kit = n_cd = 0
    for line in text.split("\n"):
        if line.startswith("- **分享给朋友**"):          # 工作区专属：分享包构建说明
            n_share += 1
            continue
        if re.match(r"^KIT=/", line):                    # 源工作区绝对路径 → 通用占位
            n_kit += 1
            lines.append(KIT_LINE)
            continue
        if re.match(r"^cd setup\b", line):               # 维护命令入口 → 解压根目录
            n_cd += 1
            lines.append(MANUAL_CD)
            continue
        lines.append(line.replace("setup/patches/team-permissions", "patches/team-permissions"))
    assert n_share == 1, "主管手册应恰好 1 行「分享给朋友」工作区专属行，实际 %d" % n_share
    assert n_kit == 1, "主管手册 KIT= 绝对路径行应恰好 1 行，实际 %d" % n_kit
    assert n_cd == 1, "主管手册「cd setup」维护行应恰好 1 行，实际 %d" % n_cd
    out = "\n".join(lines)
    assert "<HOME>/" not in out, "主管手册 kit 版含本机绝对路径"
    assert "setup/patches/team-permissions" not in out, "主管手册 kit 版残留 setup/patches 路径"
    assert "patches/team-permissions" in out, "主管手册 kit 版缺少 patches/team-permissions"
    assert KIT_LINE in out and MANUAL_CD in out
    return out


def transform_skill(text):
    pattern = re.compile(r'(?m)^(\s*workspace:\s*)".*"$')
    out, n = pattern.subn(r'\1"*"', text)
    assert n == 1, "SKILL.md 的 metadata workspace 行应恰好 1 处，实际 %d" % n
    assert "<HOME>/" not in out, "SKILL kit 版含本机绝对路径"
    return out


def transform_polish_skill(text):
    assert "promptPolish" in text, "improving-prompts SKILL 应说明与主管 promptPolish 开关联动"
    assert "<HOME>/" not in text, "improving-prompts SKILL 含本机绝对路径"
    return text


def polish_payloads():
    """返回 {相对路径: 目标字节}；SKILL.md 走转换，其余文件逐字节复制。"""
    src = root / POLISH_SRC_REL
    if not src.is_dir():
        die("找不到完整技能目录: " + POLISH_SRC_REL)
    lic = src / "LICENSE"
    if not lic.is_file():
        die("技能目录缺少 LICENSE: " + POLISH_SRC_REL + "/LICENSE")
    lic_text = lic.read_text(encoding="utf-8")
    assert "MIT License" in lic_text and "Igor Wnek" in lic_text, \
        "improving-prompts LICENSE 应为含 Copyright (c) 2026 Igor Wnek 的 MIT 原文"
    refs = sorted(p for p in (src / "references").glob("*.md") if p.is_file())
    tpls = sorted(p for p in (src / "templates").glob("*.md") if p.is_file())
    assert len(refs) == POLISH_REF_COUNT, \
        "improving-prompts references 应为 %d 个 .md，实际 %d 个" % (POLISH_REF_COUNT, len(refs))
    assert len(tpls) == POLISH_TPL_COUNT, \
        "improving-prompts templates 应为 %d 个 .md，实际 %d 个" % (POLISH_TPL_COUNT, len(tpls))

    payloads = {}
    for p in sorted(x for x in src.rglob("*") if x.is_file()):
        rel = p.relative_to(src).as_posix()
        data = p.read_bytes()
        if rel == "SKILL.md":
            data = transform_polish_skill(data.decode("utf-8")).encode("utf-8")
        elif rel.endswith((".md", ".txt")):
            assert b"<HOME>/" not in data, "improving-prompts 文件含本机绝对路径: " + rel
        payloads[rel] = data
    missing = [rel for rel in POLISH_REQUIRED_FILES if rel not in payloads]
    assert not missing, "improving-prompts 缺少必需文件: " + ", ".join(missing)
    return payloads


def sync_polish_tree():
    """同步完整技能目录到 kit；--check 逐文件比对并报告多余文件。"""
    payloads = polish_payloads()
    dst_dir = setup / "skill-improving-prompts"
    same = changed = drift = removed = 0
    dst_files = {}
    if dst_dir.is_dir():
        dst_files = {p.relative_to(dst_dir).as_posix(): p
                     for p in dst_dir.rglob("*") if p.is_file()}

    for rel in sorted(payloads):
        data = payloads[rel]
        dst = dst_dir / rel
        old = dst.read_bytes() if dst.is_file() else None
        if old == data:
            same += 1
            continue
        if mode == "check":
            print("漂移    " + POLISH_KIT_REL + "/" + rel)
            if old is not None:
                try:
                    sys.stdout.write(unified(POLISH_SRC_REL + "/" + rel,
                                             POLISH_KIT_REL + "/" + rel,
                                             old.decode("utf-8"), data.decode("utf-8")))
                except UnicodeDecodeError:
                    print("  （二进制文件，逐字节不一致）")
            drift += 1
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
        changed += 1

    for rel in sorted(set(dst_files) - set(payloads)):
        if mode == "check":
            print("漂移    " + POLISH_KIT_REL + "/" + rel + "（kit 中多余文件，应删除）")
            drift += 1
        else:
            dst_files[rel].unlink()
            print("已删除  " + POLISH_KIT_REL + "/" + rel + "（kit 中多余文件）")
            removed += 1

    STATS["same"] += same
    STATS["changed"] += changed
    STATS["drift"] += drift
    STATS["removed"] += removed

    if mode == "check":
        if drift:
            print("漂移    " + POLISH_KIT_REL + "/（%d 个文件漂移或多余）" % drift)
        else:
            print("一致    " + POLISH_KIT_REL + "/（%d 个文件）" % same)
        return

    if changed or removed:
        extra = "，删除 %d 个多余文件" % removed if removed else ""
        print("已同步  " + POLISH_KIT_REL + "/（%d 个文件更新，%d 个未变%s）"
              % (changed, same, extra))
    else:
        print("未变    " + POLISH_KIT_REL + "/（%d 个文件）" % same)


def sync_global_polish():
    """把完整技能目录同步到 $DSH_HOME/skills/improving-prompts/，逐文件备份旧版本。"""
    payloads = polish_payloads()
    dst_dir = ds_home / "skills/improving-prompts"
    stamp = time.strftime("%Y%m%d-%H%M%S")
    same = changed = drift = backed = 0

    for rel in sorted(payloads):
        data = payloads[rel]
        dst = dst_dir / rel
        old = dst.read_bytes() if dst.is_file() else None
        if old == data:
            same += 1
            continue
        if mode == "check":
            print("漂移    " + str(dst) + "（全局技能）")
            if old is not None:
                try:
                    sys.stdout.write(unified("全局技能 " + POLISH_SRC_REL + "/" + rel,
                                             str(dst), old.decode("utf-8"), data.decode("utf-8")))
                except UnicodeDecodeError:
                    print("  （二进制文件，逐字节不一致）")
            drift += 1
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if old is not None:
            backup = dst.with_name(dst.name + ".bak." + stamp)
            shutil.copy2(str(dst), str(backup))
            backed += 1
        dst.write_bytes(data)
        changed += 1

    STATS["same"] += same
    STATS["changed"] += changed
    STATS["drift"] += drift

    if mode == "check":
        if drift:
            print("漂移    " + str(dst_dir) + "（全局技能，%d 个文件；运行 bash setup/sync-kit.sh --global 更新）"
                  % drift)
        else:
            print("一致    " + str(dst_dir) + "（全局技能，%d 个文件）" % same)
    elif changed:
        print("已同步  " + str(dst_dir) + "（全局技能，%d 个文件更新，%d 个文件已备份）"
              % (changed, backed))
    else:
        print("未变    " + str(dst_dir) + "（全局技能，%d 个文件）" % same)


def supervisor_payloads():
    """返回主管技能目录的 {相对路径: 目标字节}：SKILL.md 走转换，templates/ 逐字节复制。"""
    src = root / SUPERVISOR_SRC_REL
    if not src.is_dir():
        die("找不到主管技能目录: " + SUPERVISOR_SRC_REL)
    skill = src / "SKILL.md"
    if not skill.is_file():
        die("主管技能目录缺少 SKILL.md: " + SUPERVISOR_SRC_REL)
    tpl_dir = src / "templates"
    if not tpl_dir.is_dir():
        die("找不到主管技能模板目录: " + SUPERVISOR_SRC_REL + "/templates（应由工作流硬化任务生成）")
    tpls = sorted(p for p in tpl_dir.rglob("*") if p.is_file())
    names = [p.relative_to(tpl_dir).as_posix() for p in tpls]
    missing = [name for name in SUPERVISOR_TEMPLATES if name not in names]
    if missing:
        die("templates 缺少必需模板: " + ", ".join(missing))
    payloads = {"SKILL.md": transform_skill(skill.read_text(encoding="utf-8")).encode("utf-8")}
    for p in tpls:
        rel = "templates/" + p.relative_to(tpl_dir).as_posix()
        data = p.read_bytes()
        assert data.strip(), "主管技能模板为空: " + rel
        payloads[rel] = data
    return payloads


def sync_supervisor_tree():
    """同步主管技能目录到 kit；--check 逐文件比对并报告多余文件。"""
    payloads = supervisor_payloads()
    dst_dir = setup / "skill"
    same = changed = drift = removed = 0
    dst_files = {}
    if dst_dir.is_dir():
        dst_files = {p.relative_to(dst_dir).as_posix(): p
                     for p in dst_dir.rglob("*") if p.is_file()}

    for rel in sorted(payloads):
        data = payloads[rel]
        dst = dst_dir / rel
        old = dst.read_bytes() if dst.is_file() else None
        if old == data:
            same += 1
            continue
        if mode == "check":
            print("漂移    " + SUPERVISOR_KIT_REL + "/" + rel)
            if old is not None:
                try:
                    sys.stdout.write(unified(SUPERVISOR_SRC_REL + "/" + rel,
                                             SUPERVISOR_KIT_REL + "/" + rel,
                                             old.decode("utf-8"), data.decode("utf-8")))
                except UnicodeDecodeError:
                    print("  （二进制文件，逐字节不一致）")
            drift += 1
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
        changed += 1

    for rel in sorted(set(dst_files) - set(payloads)):
        if mode == "check":
            print("漂移    " + SUPERVISOR_KIT_REL + "/" + rel + "（kit 中多余文件，应删除）")
            drift += 1
        else:
            dst_files[rel].unlink()
            print("已删除  " + SUPERVISOR_KIT_REL + "/" + rel + "（kit 中多余文件）")
            removed += 1

    STATS["same"] += same
    STATS["changed"] += changed
    STATS["drift"] += drift
    STATS["removed"] += removed

    if mode == "check":
        if drift:
            print("漂移    " + SUPERVISOR_KIT_REL + "/（%d 个文件漂移或多余）" % drift)
        else:
            print("一致    " + SUPERVISOR_KIT_REL + "/（%d 个文件）" % same)
        return
    if changed or removed:
        extra = "，删除 %d 个多余文件" % removed if removed else ""
        print("已同步  " + SUPERVISOR_KIT_REL + "/（%d 个文件更新，%d 个未变%s）"
              % (changed, same, extra))
    else:
        print("未变    " + SUPERVISOR_KIT_REL + "/（%d 个文件）" % same)


def sync_global_supervisor():
    """把主管技能目录（SKILL.md + templates/）同步到 $DSH_HOME/skills/project-supervisor/，逐文件备份。"""
    payloads = supervisor_payloads()
    dst_dir = ds_home / "skills/project-supervisor"
    stamp = time.strftime("%Y%m%d-%H%M%S")
    same = changed = drift = backed = 0

    for rel in sorted(payloads):
        data = payloads[rel]
        dst = dst_dir / rel
        old = dst.read_bytes() if dst.is_file() else None
        if old == data:
            same += 1
            continue
        if mode == "check":
            print("漂移    " + str(dst) + "（全局技能）")
            if old is not None:
                try:
                    sys.stdout.write(unified("全局技能 " + SUPERVISOR_SRC_REL + "/" + rel,
                                             str(dst), old.decode("utf-8"), data.decode("utf-8")))
                except UnicodeDecodeError:
                    print("  （二进制文件，逐字节不一致）")
            drift += 1
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if old is not None:
            backup = dst.with_name(dst.name + ".bak." + stamp)
            shutil.copy2(str(dst), str(backup))
            backed += 1
        dst.write_bytes(data)
        changed += 1

    STATS["same"] += same
    STATS["changed"] += changed
    STATS["drift"] += drift

    if mode == "check":
        if drift:
            print("漂移    " + str(dst_dir) + "（全局技能，%d 个文件；运行 bash setup/sync-kit.sh --global 更新）"
                  % drift)
        else:
            print("一致    " + str(dst_dir) + "（全局技能，%d 个文件）" % same)
    elif changed:
        print("已同步  " + str(dst_dir) + "（全局技能，%d 个文件更新，%d 个文件已备份）"
              % (changed, backed))
    else:
        print("未变    " + str(dst_dir) + "（全局技能，%d 个文件）" % same)


TRANSFORMS = [
    ("AGENTS.md", "setup/AGENTS.supervisor.md", transform_agents),
    ("主管手册.md", "setup/主管手册.md", transform_manual),
]


def research_names():
    src = root / "research"
    # INCIDENT-*.md 是内部事故报告，不进 kit（不外发）；其余 research/*.md 逐字节同步
    names = sorted(
        p.name
        for p in src.glob("*.md")
        if p.name != "DECISIONS.md" and not p.name.startswith("INCIDENT-")
    )
    if "README.md" not in names:
        die("research/README.md 不存在")
    numbered = [n for n in names if re.match(r"^\d\d-", n)]
    if len(numbered) < 4:
        die("research/ 分报告数量异常（%d 份，应至少 4 份）" % len(numbered))
    return names


def process(dst_rel, new_text, src_rel):
    """写盘或比对单个 kit 副本，并打印一行结果。"""
    dst = root / dst_rel
    old = dst.read_text(encoding="utf-8") if dst.is_file() else None
    if old == new_text:
        print(("未变    " if mode == "sync" else "一致    ") + dst_rel)
        STATS["same"] += 1
        return
    if mode == "check":
        print("漂移    " + dst_rel)
        if old is None:
            print("  （kit 副本不存在：" + dst_rel + "）")
        else:
            sys.stdout.write(unified(src_rel, dst_rel, old, new_text))
        STATS["drift"] += 1
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(new_text, encoding="utf-8")
    print("已同步  " + dst_rel)
    STATS["changed"] += 1


def sync_global():
    # 两个完整技能目录：主管技能（SKILL.md + templates/）+ 提示词润色技能，逐文件 .bak 备份
    sync_global_supervisor()
    sync_global_polish()


def main():
    if not (root / "setup").is_dir():
        die("找不到 setup 目录，脚本应位于工作区的 setup/ 内: " + str(root))
    print("工作区: " + str(root))
    print()

    for src_rel, dst_rel, fn in TRANSFORMS:
        src = root / src_rel
        if not src.is_file():
            die("源文件缺失: " + src_rel)
        process(dst_rel, fn(src.read_text(encoding="utf-8")), src_rel)

    # 主管技能：整目录（SKILL.md 转换 workspace + templates/ 四个模板逐字节复制）
    sync_supervisor_tree()

    # 提示词润色技能：整目录（SKILL.md + LICENSE + references/ + templates/）
    sync_polish_tree()

    names = research_names()
    for name in names:
        process("setup/research/" + name,
                (root / "research" / name).read_text(encoding="utf-8"),
                "research/" + name)

    kit_research = setup / "research"
    if kit_research.is_dir():
        stale = sorted(p.name for p in kit_research.glob("*.md") if p.name not in names)
        for name in stale:
            rel = "setup/research/" + name
            if mode == "check":
                print("漂移    " + rel + "（kit 中多余副本，应删除）")
                STATS["drift"] += 1
            else:
                (kit_research / name).unlink()
                print("已删除  " + rel + "（kit 中多余副本）")
                STATS["removed"] += 1

    if do_global:
        sync_global()

    print()
    if mode == "check":
        if STATS["drift"]:
            print("结果: %d 个文件漂移（%d 个一致）—— 运行 bash setup/sync-kit.sh 同步"
                  % (STATS["drift"], STATS["same"]))
            raise SystemExit(1)
        print("结果: 全部一致（%d 个文件）" % STATS["same"])
    else:
        extra = "，删除 %d 个多余副本" % STATS["removed"] if STATS["removed"] else ""
        print("结果: %d 个更新，%d 个未变%s"
              % (STATS["changed"], STATS["same"], extra))


try:
    main()
except AssertionError as exc:
    print("断言失败: " + str(exc), file=sys.stderr)
    raise SystemExit(2)
PY
