#!/usr/bin/env bash
# Install / uninstall dsh-project-supervisor into a DSH web profile.
#
# Usage:
#   bash install-plugin.sh                 # install into $DSH_HOME/profiles/web
#   bash install-plugin.sh --uninstall     # remove dependency, bundle entry and symlink
#   PROFILE=auto bash install-plugin.sh    # use another profile name
#
# The profile's package.json and cordis.patch.yml are backed up under
# <profile>/.backups/<timestamp>/ before every *changing* run.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="dsh-project-supervisor"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="${PROFILE:-web}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
MODE="install"

for arg in "$@"; do
  case "$arg" in
    --uninstall) MODE="uninstall" ;;
    -h|--help) MODE="help" ;;
    *) echo "未知参数：$arg（可用：--uninstall）" >&2; exit 2 ;;
  esac
done

if [ "$MODE" = "help" ]; then
  sed -n '2,16p' "$0"
  exit 0
fi

if [ ! -f "$PROFILE_DIR/package.json" ]; then
  echo "错误：找不到 profile：$PROFILE_DIR（先运行过 dsh web？或用 PROFILE=<name> 指定）" >&2
  exit 1
fi

if [ "$MODE" = "uninstall" ]; then
  if ! python3 - "$PROFILE_DIR/package.json" "$PLUGIN_NAME" <<'PY'
import json, sys
path, name = sys.argv[1], sys.argv[2]
with open(path, encoding='utf-8') as fh:
    data = json.load(fh)
deps = data.get('dependencies') or {}
profile = (data.get('dsh') or {}).get('profile') or {}
bundles = profile.get('bundles')
installed = name in deps or (isinstance(bundles, list) and name in bundles)
sys.exit(0 if installed else 10)
PY
  then
    echo "未安装（无需卸载）：$PLUGIN_NAME"
    exit 0
  fi
  python3 - "$PROFILE_DIR/package.json" "$PLUGIN_NAME" <<'PY'
import json, sys
path, name = sys.argv[1], sys.argv[2]
with open(path, encoding='utf-8') as fh:
    data = json.load(fh)
deps = data.get('dependencies') or {}
deps.pop(name, None)
data['dependencies'] = deps
profile = (data.get('dsh') or {}).get('profile') or {}
bundles = profile.get('bundles')
if isinstance(bundles, list):
    profile['bundles'] = [item for item in bundles if item != name]
data.setdefault('dsh', {})['profile'] = profile
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write('\n')
print('已从 profile 依赖与 bundle 列表移除：' + name)
PY
  rm -f "$PROFILE_DIR/node_modules/$PLUGIN_NAME"
  echo "已删除符号链接：$PROFILE_DIR/node_modules/$PLUGIN_NAME"
  echo "完成。刷新 DSH 页面（或重启 dsh web）后生效。"
  exit 0
fi

# Dry-run: is the profile manifest already up to date?
if ! python3 - "$PROFILE_DIR/package.json" "$PLUGIN_NAME" "$PLUGIN_DIR" <<'PY'
import json, sys
path, name, plugin_dir = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, encoding='utf-8') as fh:
    data = json.load(fh)
deps = data.get('dependencies') or {}
profile = (data.get('dsh') or {}).get('profile') or {}
bundles = profile.get('bundles')
needs_change = deps.get(name) != 'link:' + plugin_dir or not isinstance(bundles, list) or name not in bundles
sys.exit(0 if needs_change else 10)
PY
then
  ln -sfn "$PLUGIN_DIR" "$PROFILE_DIR/node_modules/$PLUGIN_NAME"
  echo "已安装且配置最新（无需改动）：$PLUGIN_DIR"
  echo "刷新 DSH 页面即可看到侧栏「主管」入口。"
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$PROFILE_DIR/.backups/$STAMP"
mkdir -p "$BACKUP_DIR" "$PROFILE_DIR/node_modules"
cp "$PROFILE_DIR/package.json" "$BACKUP_DIR/package.json"
if [ -f "$PROFILE_DIR/cordis.patch.yml" ]; then
  cp "$PROFILE_DIR/cordis.patch.yml" "$BACKUP_DIR/cordis.patch.yml"
fi
echo "已备份 profile 配置到：$BACKUP_DIR"

ln -sfn "$PLUGIN_DIR" "$PROFILE_DIR/node_modules/$PLUGIN_NAME"
echo "已链接：$PROFILE_DIR/node_modules/$PLUGIN_NAME -> $PLUGIN_DIR"

python3 - "$PROFILE_DIR/package.json" "$PLUGIN_NAME" "$PLUGIN_DIR" <<'PY'
import json, sys
path, name, plugin_dir = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, encoding='utf-8') as fh:
    data = json.load(fh)
deps = data.get('dependencies') or {}
already_dep = deps.get(name) == 'link:' + plugin_dir
deps[name] = 'link:' + plugin_dir
data['dependencies'] = deps
dsh = data.setdefault('dsh', {})
profile = dsh.setdefault('profile', {})
bundles = profile.get('bundles')
if not isinstance(bundles, list):
    bundles = []
already_bundle = name in bundles
if not already_bundle:
    bundles.append(name)
profile['bundles'] = bundles
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write('\n')
print('dependencies["%s"]: %s' % (name, '已存在（未变）' if already_dep else '已写入 link:' + plugin_dir))
print('dsh.profile.bundles: %s' % ('已包含（未变）' if already_bundle else '已加入 ' + name))
PY

echo
echo "安装完成。接下来："
echo "  1) 刷新 DSH 页面（或重启 dsh web）"
echo "  2) 左侧栏应出现「主管」入口；点开可见自检面板"
echo "  3) 卸载：bash \"$PLUGIN_DIR/install-plugin.sh\" --uninstall"
