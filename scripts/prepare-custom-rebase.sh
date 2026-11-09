#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/prepare-custom-rebase.sh vX.Y.Z [update-branch] [worktree-directory]

Fetches upstream tags and origin/custom/production, then rebases a new worktree.
Conflicts remain in that worktree for review. The current checkout and service
are not switched. This does not build, push, or deploy the result.
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then usage; exit 0; fi
if [[ $# -lt 1 || $# -gt 3 ]]; then usage >&2; exit 2; fi
version=$1
if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'Use an explicit stable release tag, such as v0.1.150.' >&2
  exit 2
fi
repo=$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
branch=${2:-update/$version-$stamp}
worktree=${3:-$(dirname "$repo")/openmausbot-rebase-$version-$stamp}
git check-ref-format --branch "$branch" >/dev/null
if [[ -e "$worktree" ]]; then echo "Path already exists: $worktree" >&2; exit 2; fi
for remote in origin upstream; do git -C "$repo" remote get-url "$remote" >/dev/null; done
git -C "$repo" fetch upstream --tags
git -C "$repo" fetch origin refs/heads/custom/production:refs/remotes/origin/custom/production
source_ref=refs/remotes/origin/custom/production
oldbase=$(git -C "$repo" show "$source_ref:deploy/custom-fork/upstream-base")
git -C "$repo" rev-parse --verify "refs/tags/$version^{commit}" >/dev/null
git -C "$repo" merge-base --is-ancestor "$oldbase" "$source_ref"
git -C "$repo" merge-base --is-ancestor "$oldbase" "refs/tags/$version"
if [[ "$oldbase" == "$version" ]]; then
  echo "The production branch is already based on $version." >&2
  exit 2
fi
oldhead=$(git -C "$repo" rev-parse "$source_ref")
git -C "$repo" worktree add -b "$branch" "$worktree" "$source_ref"
if ! git -C "$worktree" rebase --onto "refs/tags/$version" "$oldbase"; then
  printf '\nResolve conflicts in %s, then run git rebase --continue.\n' "$worktree" >&2
  printf 'To abandon this candidate, run git -C %q rebase --abort.\n' "$worktree" >&2
  printf 'After resolution, set deploy/custom-fork/upstream-base to %s and commit it.\n' "$version" >&2
  exit 1
fi
printf '%s\n' "$version" > "$worktree/deploy/custom-fork/upstream-base"
git -C "$worktree" add deploy/custom-fork/upstream-base
git -C "$worktree" commit -m "Record upstream release base $version"
printf '\nCandidate: %s\nWorktree: %s\nPrevious production commit: %s\n' "$branch" "$worktree" "$oldhead"
printf 'Review with: git -C %q range-diff %q %q\n' "$worktree" "$oldbase..$oldhead" "$version..$branch"
printf 'Follow deploy/custom-fork/README.md before promoting this candidate.\n'
