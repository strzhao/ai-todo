#!/usr/bin/env bash
# 从 .env.local 派生 .env.production(容器内连 PG,跨 little-bee-net 网络)。
# POSTGRES_URL 改指 little-bee-pg:5432/ai_todo;AUTH_DEV_BYPASS=false。
# 密码不从脚本硬编码,实时从 .env.local 的 VPS_PG_SUPERUSER_PASSWORD 读取。
# 参照 HANDOFF-VPS-MIGRATION.md 步骤 4.1
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "[gen-env-production] 错误: .env.local 不存在" >&2
  exit 1
fi

if ! grep -q "^VPS_PG_SUPERUSER_PASSWORD=" .env.local; then
  echo "[gen-env-production] 错误: .env.local 缺少 VPS_PG_SUPERUSER_PASSWORD" >&2
  exit 1
fi

VPS_PWD=$(grep "^VPS_PG_SUPERUSER_PASSWORD=" .env.local | sed 's|.*=||' | tr -d "'\"")
if [ -z "$VPS_PWD" ]; then
  echo "[gen-env-production] 错误: VPS_PG_SUPERUSER_PASSWORD 为空" >&2
  exit 1
fi

sed \
  -e "s|^POSTGRES_URL=.*|POSTGRES_URL=postgresql://littlebee:${VPS_PWD}@little-bee-pg:5432/ai_todo|" \
  -e "s|^AUTH_DEV_BYPASS=.*|AUTH_DEV_BYPASS=false|" \
  .env.local > .env.production

echo "[gen-env-production] 已生成 .env.production(POSTGRES_URL → little-bee-pg:5432/ai_todo, AUTH_DEV_BYPASS=false)"
