#!/usr/bin/env bash
# Install / uninstall dsh-project-supervisor into a DSH web profile.
#
# Usage:
#   bash install-plugin.sh                       # install into ${DSH_HOME:-~/.dsh}/profiles/${PROFILE:-web}
#   bash install-plugin.sh --uninstall           # remove dependency, bundle entry and node_modules entry
#   bash install-plugin.sh --dry-run             # preview only; writes nothing
#   PROFILE=other bash install-plugin.sh         # use another profile name
#   DSH_HOME=/tmp/dsh bash install-plugin.sh     # use another DSH home
#   bash install-plugin.sh --help
#
# Requirements: Node.js >= 18 (DSH itself needs Node). This script has NO
# python3 dependency and never shells out to python. POSIX only — on Windows
# use: node install-plugin.mjs
#
# The profile's package.json and cordis.patch.yml are backed up under
# <profile>/.backups/<timestamp>/ before every *changing* run (re-installing an
# up-to-date profile only refreshes the symlink and never duplicates backups).
# A state file <profile>/.dsh-project-supervisor.json records
# {version, installedAt, mode, pluginDir}.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="dsh-project-supervisor"
STATE_FILE=".dsh-project-supervisor.json"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="${PROFILE:-web}"
PROFILE_DIR="${PROFILE_DIR:-$DSH_HOME/profiles/$PROFILE}"
PROFILE_MANIFEST="$PROFILE_DIR/package.json"
ENTRY_PATH="$PROFILE_DIR/node_modules/$PLUGIN_NAME"
STATE_PATH="$PROFILE_DIR/$STATE_FILE"
MODE="install"
DRY_RUN=0
HELP=0
NODE_OUT=""
NODE_RC=0
PLUGIN_VERSION="unknown"
ENTRY_MODE="none"
REMOVED="none"
BACKUP_DIR=""

usage() {
  cat <<'TXT'
用法（Node.js >= 18；不依赖 python3）：
  bash install-plugin.sh                     # 安装到 ${DSH_HOME:-~/.dsh}/profiles/${PROFILE:-web}
  bash install-plugin.sh --uninstall         # 卸载（先备份配置，再删依赖/bundle 条目与 node_modules 条目）
  bash install-plugin.sh --dry-run           # 只预览，不写任何文件
  PROFILE=other bash install-plugin.sh       # 指定 profile 名
  DSH_HOME=/tmp/dsh bash install-plugin.sh   # 指定 DSH home
  bash install-plugin.sh --help

环境变量：DSH_HOME（默认 ~/.dsh）、PROFILE（默认 web）、PROFILE_DIR（默认 profile 目录）
状态文件：<profile>/.dsh-project-supervisor.json（记录 version / installedAt / mode / pluginDir）
重复运行只刷新链接，不会重复备份配置；配置变更前备份到 <profile>/.backups/<时间戳>/。
Windows 请用：node install-plugin.mjs（同样幂等，支持 --dry-run 与 --copy）。
TXT
}

# ---------------------------------------------------------------------------
# JSON helper: Node.js only (no python3). Exit-code contract:
#   0  = 已安装 / 需变更（调用方应继续执行）
#   10 = 未安装 / 已最新（调用方无需变更）
#   *  = 错误（stderr 已说明原因，调用方必须报错退出 1，不得静默成功）
# ---------------------------------------------------------------------------
node_helper() {
  local action="$1"
  ACTION="$action" STATE_MODE="${STATE_MODE:-}" node - \
    "$PROFILE_MANIFEST" "$PLUGIN_NAME" "$PLUGIN_DIR" "$PROFILE_DIR" <<'NODE'
'use strict';
const fs = require('fs');
const path = require('path');
const [manifestPath, name, pluginDir, profileDir] = process.argv.slice(2);
const STATE_NAME = '.dsh-project-supervisor.json';
const statePath = path.join(profileDir, STATE_NAME);
const entryPath = path.join(profileDir, 'node_modules', name);
const linkSpecOf = (dir) => 'link:' + dir.replace(/\\/g, '/');

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}
function pluginVersion() {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8'));
    return manifest.version || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}
function entryExists() {
  try {
    fs.lstatSync(entryPath);
    return true;
  } catch (error) {
    return false;
  }
}
function summarize() {
  const manifest = readManifest();
  const dependencies = manifest.dependencies || {};
  const profile = (manifest.dsh && manifest.dsh.profile) || {};
  const bundles = Array.isArray(profile.bundles) ? profile.bundles : [];
  const hasDep = Object.prototype.hasOwnProperty.call(dependencies, name);
  const inBundles = bundles.includes(name);
  const installed = hasDep || inBundles || entryExists();
  const upToDate = dependencies[name] === linkSpecOf(pluginDir) && inBundles;
  return { manifest, dependencies, profile, bundles, installed, upToDate };
}
function writeManifest(manifest) {
  const temp = manifestPath + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, manifestPath);
}

const action = process.env.ACTION || '';
try {
  if (action === 'validate') {
    readManifest();
  } else if (action === 'version') {
    process.stdout.write(pluginVersion() + '\n');
  } else if (action === 'query-install') {
    const summary = summarize();
    process.stdout.write('installed=' + summary.installed + '\n');
    process.stdout.write('upToDate=' + summary.upToDate + '\n');
    process.stdout.write('version=' + pluginVersion() + '\n');
    if (summary.upToDate) process.exit(10);
  } else if (action === 'query-uninstall') {
    const summary = summarize();
    process.stdout.write('installed=' + summary.installed + '\n');
    process.stdout.write('version=' + pluginVersion() + '\n');
    if (!summary.installed) process.exit(10);
  } else if (action === 'apply-install') {
    const summary = summarize();
    const manifest = summary.manifest;
    const dependencies = summary.dependencies;
    dependencies[name] = linkSpecOf(pluginDir);
    manifest.dependencies = dependencies;
    manifest.dsh = manifest.dsh || {};
    manifest.dsh.profile = manifest.dsh.profile || {};
    const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : [];
    if (!bundles.includes(name)) bundles.push(name);
    manifest.dsh.profile.bundles = bundles;
    writeManifest(manifest);
  } else if (action === 'apply-uninstall') {
    const summary = summarize();
    const manifest = summary.manifest;
    const dependencies = summary.dependencies;
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) delete dependencies[name];
    manifest.dependencies = dependencies;
    manifest.dsh = manifest.dsh || {};
    manifest.dsh.profile = manifest.dsh.profile || {};
    manifest.dsh.profile.bundles = summary.bundles.filter((item) => item !== name);
    writeManifest(manifest);
  } else if (action === 'write-state') {
    const now = new Date().toISOString();
    let previous = null;
    try {
      previous = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch (error) {
      previous = null;
    }
    const state = {
      version: pluginVersion(),
      installedAt: previous && previous.installedAt ? previous.installedAt : now,
      refreshedAt: now,
      mode: process.env.STATE_MODE || 'unknown',
      pluginDir,
      profile: profileDir,
      manager: 'install-plugin.sh',
    };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } else if (action === 'clean-state') {
    if (fs.existsSync(statePath)) fs.rmSync(statePath, { force: true });
  } else {
    process.stderr.write('错误：未知内部动作：' + action + '\n');
    process.exit(1);
  }
} catch (error) {
  process.stderr.write('错误：' + ((error && error.message) || String(error)) + '\n');
  process.exit(1);
}
NODE
}

detect_entry_mode() {
  if [ -L "$ENTRY_PATH" ]; then
    ENTRY_MODE="symlink"
  elif [ -d "$ENTRY_PATH" ]; then
    ENTRY_MODE="copy"
  elif [ -e "$ENTRY_PATH" ]; then
    ENTRY_MODE="file"
  else
    ENTRY_MODE="none"
  fi
}

# H5: only ever remove the exact node_modules/<name> path, never its contents
# through a followed symlink, and never create <name>/<name> nesting.
remove_entry() {
  if [ -L "$ENTRY_PATH" ]; then
    rm -f "$ENTRY_PATH"
    REMOVED="symlink"
  elif [ -d "$ENTRY_PATH" ]; then
    rm -rf "$ENTRY_PATH"
    REMOVED="copy"
  elif [ -e "$ENTRY_PATH" ]; then
    rm -f "$ENTRY_PATH"
    REMOVED="file"
  else
    REMOVED="none"
  fi
}

create_link() {
  mkdir -p "$PROFILE_DIR/node_modules"
  if ! ln -s "$PLUGIN_DIR" "$ENTRY_PATH" 2>/dev/null; then
    echo "错误：无法创建符号链接：$ENTRY_PATH -> ${PLUGIN_DIR}（文件系统限制？可改用 node install-plugin.mjs --copy）。" >&2
    return 1
  fi
}

backup_profile() {
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  BACKUP_DIR="$PROFILE_DIR/.backups/$stamp"
  if [ -e "$BACKUP_DIR" ]; then
    BACKUP_DIR="$PROFILE_DIR/.backups/$stamp-$$"
  fi
  mkdir -p "$BACKUP_DIR"
  cp "$PROFILE_MANIFEST" "$BACKUP_DIR/package.json"
  if [ -f "$PROFILE_DIR/cordis.patch.yml" ]; then
    cp "$PROFILE_DIR/cordis.patch.yml" "$BACKUP_DIR/cordis.patch.yml"
  fi
  echo "已备份 profile 配置到：$BACKUP_DIR"
}

fetch_version() {
  if NODE_OUT="$(node_helper version 2>/dev/null)"; then
    PLUGIN_VERSION="${NODE_OUT:-unknown}"
  else
    PLUGIN_VERSION="unknown"
  fi
}

next_steps() {
  echo ""
  echo "完成。下一步："
  echo "  1) 刷新 DSH 页面（或重启 dsh web），左侧栏出现「主管」入口即成功"
  echo "  2) 若没变化：确认 dsh web 使用的是 profile：$PROFILE_DIR"
  echo "  3) 卸载：bash \"$PLUGIN_DIR/install-plugin.sh\" --uninstall（自定义 DSH_HOME/PROFILE 时带上同样的环境变量）"
}

report_entry() {
  local label="$1"
  if [ "$ENTRY_MODE" = "none" ]; then
    echo "${label}：node_modules 条目不存在（${ENTRY_PATH}）"
  else
    echo "${label}：node_modules 条目（${ENTRY_MODE}）$ENTRY_PATH"
  fi
}

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --uninstall) MODE="uninstall" ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) HELP=1 ;;
    *) echo "未知参数：${arg}（可用：--uninstall、--dry-run、--help）" >&2; exit 1 ;;
  esac
done

if [ "$HELP" = "1" ]; then
  usage
  exit 0
fi

# Node >= 18 is the only runtime dependency (no python, no jq, no sed-based JSON).
if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 node。本脚本需要 Node.js >= 18（DSH 的运行前提），不再依赖 python3。" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
case "$NODE_MAJOR" in
  ''|*[!0-9]*) NODE_MAJOR=0 ;;
esac
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "错误：Node.js 版本过低（当前 $(node -v)，需要 >= 18）。" >&2
  exit 1
fi

if [ ! -f "$PROFILE_MANIFEST" ]; then
  echo "错误：找不到 profile：${PROFILE_DIR}（先运行过 dsh web？或设置 DSH_HOME/PROFILE 指定）" >&2
  exit 1
fi

# Parse errors must be loud: exit 1, never a silent "已最新/未安装".
if ! node_helper validate; then
  echo "错误：profile 的 package.json 不是合法 JSON：${PROFILE_MANIFEST}（未做任何修改）" >&2
  exit 1
fi
fetch_version
detect_entry_mode

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
if [ "$MODE" = "uninstall" ]; then
  if NODE_OUT="$(node_helper query-uninstall)"; then
    NODE_RC=0
  else
    NODE_RC=$?
  fi
  case "$NODE_RC" in
    0) : ;;  # installed -> continue
    10)
      if [ "$DRY_RUN" = "0" ]; then
        node_helper clean-state >/dev/null 2>&1 || true
      fi
      echo "未安装（无需卸载）：$PLUGIN_NAME"
      exit 0
      ;;
    *)
      echo "错误：读取 profile 的 package.json 失败（退出码 ${NODE_RC}）。" >&2
      exit 1
      ;;
  esac

  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] profile: $PROFILE_DIR"
    echo "[dry-run] 将从 dependencies 与 dsh.profile.bundles 移除：$PLUGIN_NAME"
    report_entry "[dry-run] 将删除"
    echo "[dry-run] 将删除状态文件：${STATE_PATH}；删除前备份配置到 .backups/<时间戳>/；未写入任何文件。"
    exit 0
  fi

  backup_profile
  if ! node_helper apply-uninstall; then
    echo "错误：写入 profile 的 package.json 失败（配置备份在 ${BACKUP_DIR}，可用于恢复）。" >&2
    exit 1
  fi
  remove_entry
  node_helper clean-state >/dev/null 2>&1 || true
  echo "已从 profile 依赖与 bundle 列表移除：$PLUGIN_NAME"
  if [ "$REMOVED" = "none" ]; then
    echo "node_modules 条目原本不存在：$ENTRY_PATH"
  else
    echo "已删除 node_modules 条目（${REMOVED}）：$ENTRY_PATH"
  fi
  echo "已删除安装状态文件：$STATE_PATH"
  echo "完成。刷新 DSH 页面（或重启 dsh web）后生效。"
  exit 0
fi

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
if NODE_OUT="$(node_helper query-install)"; then
  NODE_RC=0
else
  NODE_RC=$?
fi
case "$NODE_RC" in
  0) NEED_CHANGE=1 ;;
  10) NEED_CHANGE=0 ;;
  *)
    echo "错误：读取 profile 的 package.json 失败（退出码 ${NODE_RC}）。" >&2
    exit 1
    ;;
esac

if [ "$DRY_RUN" = "1" ]; then
  echo "[dry-run] profile: $PROFILE_DIR"
  echo "[dry-run] 插件源: ${PLUGIN_DIR}（v${PLUGIN_VERSION}）"
  report_entry "[dry-run] 当前"
  if [ "$NEED_CHANGE" = "0" ]; then
    echo "[dry-run] 配置已最新；将刷新链接并更新状态文件，未写入任何文件。"
  else
    echo "[dry-run] 将备份配置到 .backups/<时间戳>/，写入 dependencies[\"$PLUGIN_NAME\"]=link:... 与 dsh.profile.bundles，刷新 node_modules 条目并写状态文件；未写入任何文件。"
  fi
  exit 0
fi

if [ "$NEED_CHANGE" = "0" ]; then
  # H3: already installed + config up to date -> refresh the link only, no new backup.
  remove_entry
  if ! create_link; then
    exit 1
  fi
  ENTRY_MODE="symlink"
  STATE_MODE="symlink" node_helper write-state
  echo "已安装 v${PLUGIN_VERSION}（symlink）：配置最新，已刷新链接。"
  next_steps
  exit 0
fi

backup_profile
remove_entry
if ! create_link; then
  echo "错误：安装中止（profile 配置未改动；配置备份在 ${BACKUP_DIR}）。" >&2
  exit 1
fi
ENTRY_MODE="symlink"
if ! node_helper apply-install; then
  remove_entry
  echo "错误：写入 profile 的 package.json 失败，已回滚 node_modules 条目（配置备份在 ${BACKUP_DIR}）。" >&2
  exit 1
fi
STATE_MODE="symlink" node_helper write-state

echo "已链接：$ENTRY_PATH -> $PLUGIN_DIR"
echo "dependencies[\"$PLUGIN_NAME\"] = \"link:$PLUGIN_DIR\""
echo "dsh.profile.bundles 已包含 $PLUGIN_NAME"
if [ -f "$STATE_PATH" ]; then
  echo "安装状态已记录：$STATE_PATH"
fi
echo "安装完成：v${PLUGIN_VERSION}（symlink）"
next_steps
exit 0
