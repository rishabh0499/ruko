#!/bin/bash
# Installs Ruko's git hooks: a secret check before every commit, and push-on-commit.
set -e
cd "$(dirname "$0")/.."
cat > .git/hooks/pre-commit <<'H'
#!/bin/bash
exec node scripts/git-hooks/pre-commit.mjs
H
cat > .git/hooks/post-commit <<'H'
#!/bin/bash
# Push every commit to GitHub in the background (log: .git/autopush.log).
if git remote get-url origin >/dev/null 2>&1; then
  ( echo "[$(date '+%F %T')] pushing $(git rev-parse --short HEAD)"; git push origin HEAD 2>&1 ) >> .git/autopush.log 2>&1 &
fi
H
chmod +x .git/hooks/pre-commit .git/hooks/post-commit
echo "Hooks installed: pre-commit (secret check), post-commit (auto-push)."
