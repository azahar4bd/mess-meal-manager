#!/usr/bin/env bash
# =============================================================
#  Mess Meal Manager — Deploy স্ক্রিপ্ট
#  শুধু main branch-এ push করে → ১ change = ১ deployment
#  (আগে main + preview দুইটাতে push হতো = ২ deployment)
#
#  ব্যবহার:
#    GITHUB_PAT=ghp_xxx ./deploy.sh "commit message"
#  অথবা:
#    ./deploy.sh "commit message"          (PAT আগেই export করা থাকলে)
# =============================================================
set -euo pipefail

REPO="azahar4bd/mess-meal-manager"
BRANCH="main"

cd "$(dirname "$0")"

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "❌ কমিট মেসেজ দিন।  উদাহরণ:  ./deploy.sh \"রঙ ঠিক করলাম\""
  exit 1
fi

if [ -z "${GITHUB_PAT:-}" ]; then
  echo "❌ GITHUB_PAT সেট করা নেই।"
  echo "   export GITHUB_PAT=your_token  — তারপর আবার চালান।"
  exit 1
fi

echo "🔍 ১/৫  ডিপেন্ডেন্সি চেক..."
npm install --no-audit --no-fund >/dev/null 2>&1

echo "🔍 ২/৫  TypeScript টাইপ চেক..."
npx tsc --noEmit

echo "🏗️  ৩/৫  বিল্ড..."
npm run build >/tmp/build.log 2>&1 || { echo "❌ বিল্ড ফেইল — /tmp/build.log দেখুন"; tail -30 /tmp/build.log; exit 1; }
echo "      বিল্ড সফল ✅"

echo "📦 ৪/৫  কমিট..."
git add -A
if git diff --cached --quiet; then
  echo "      কোনো পরিবর্তন নেই — কমিট স্কিপ।"
else
  git -c user.name='Arena Agent' -c user.email='deploy@local' commit -q -m "$MSG"
  echo "      কমিট: $(git rev-parse --short HEAD)"
fi

echo "🚀 ৫/৫  main-এ push (preview নয়)..."
git push "https://azahar4bd:${GITHUB_PAT}@github.com/${REPO}.git" "$BRANCH" 2>&1 | sed "s/${GITHUB_PAT}/***/g"

echo ""
echo "✅ ডেপ্লয় শুরু। স্ট্যাটাস দেখতে:"
echo "   https://vercel.com/azahar4bd-5195/mess-meal-manager/deployments"
echo ""
echo "💡 পরের বার preview-সহ দরকার হলে:"
echo "   git push origin main:preview"
