#!/bin/bash
# SubsTracker 飞牛 fpk 一键打包脚本
# 前置条件：已安装飞牛官方 fnpack CLI（https://developer.fnnas.com/docs/cli/fnpack）
# 用法：在仓库根目录执行  bash fpk/build-fpk.sh
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${REPO_ROOT}/fpk-template"
APP_DIR="${TEMPLATE}/app"

# 1. 将应用文件同步进 fpk 模板的 app/ 目录（对应安装后的 target）
mkdir -p "${APP_DIR}"
cp -f "${REPO_ROOT}/index.js" "${REPO_ROOT}/package.json" "${APP_DIR}/"
rm -rf "${APP_DIR}/src" "${APP_DIR}/public"
cp -r "${REPO_ROOT}/src" "${APP_DIR}/src"
cp -r "${REPO_ROOT}/public" "${APP_DIR}/public"

# 2. 统一转换为 LF 行尾 + 赋予脚本执行权限（Windows 编辑常见坑）
find "${TEMPLATE}/cmd" -type f -exec sed -i 's/\r$//' {} \;
find "${TEMPLATE}/cmd" -type f -exec chmod +x {} \;
[ -f "${TEMPLATE}/manifest" ] && sed -i 's/\r$//' "${TEMPLATE}/manifest"

# 3. 打包
cd "${TEMPLATE}"
if command -v fnpack >/dev/null 2>&1; then
    fnpack build -d .
    echo "打包完成，产物："
    ls -1 "${TEMPLATE}"/*.fpk 2>/dev/null || echo "  请查看 fnpack 输出路径"
else
    echo "[!] 未检测到 fnpack CLI。"
    echo "    请到 https://developer.fnnas.com/docs/cli/fnpack 下载安装后，手动执行："
    echo "    cd ${TEMPLATE} && fnpack build -d ."
fi
