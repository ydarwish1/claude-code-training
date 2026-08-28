#!/bin/bash
#
# PreToolUse hook on Bash. Guards pushes.
#
# When the Bash command is a git push, this runs the merchant console's tests
# and its production build. Either one failing blocks the push and says which
# failed and where to read the output. Both passing lets the push through
# untouched.
#
# Anything that is not a push exits 0 immediately and costs nothing.
#
# Input:  the hook payload as JSON on stdin.
# Output: nothing when allowing; a PreToolUse deny decision as JSON when
#         blocking. Command output never goes to stdout, because stdout is
#         the decision channel.

set -uo pipefail

# The app is found relative to this script, never relative to the caller's cwd:
# a hook can fire from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_DIR="$REPO_ROOT/build-battle/merchant-console"

LOG_DIR="$HOME/.claude/pre-push-logs/claude-code-training"
TEST_LOG="$LOG_DIR/test.log"
BUILD_LOG="$LOG_DIR/build.log"

# Emit a PreToolUse deny decision and stop.
deny() {
  reason="$1"
  printf '%s' "$reason" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: .
    }
  }'
  exit 0
}

payload="$(cat)"
command_text="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')"

# Is "push" the git subcommand? Only flags may sit between "git" and "push",
# so `git -C /path push` and `RUBRIC_GIT_OK=1 git push` both count, while
# `git commit -m "add push button"` does not. Matching the bare word anywhere
# would run the whole suite on a commit and then blame the push.
PUSH_RE='\bgit\b([[:space:]]+(-[cC][[:space:]]+[^[:space:]]+|--[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+push\b'

# Not a push: allow, silently, without running anything.
if ! printf '%s' "$command_text" | /usr/bin/grep -Eq "$PUSH_RE"; then
  exit 0
fi

if [ ! -d "$APP_DIR" ]; then
  deny "pre-push-check could not find the app at $APP_DIR, so it could not verify this push. Fix the path in $SCRIPT_DIR/pre-push-check.sh, or remove the hook."
fi

mkdir -p "$LOG_DIR"

# Tests first: they are the fast one, so a broken test reports in about a second.
npm --prefix "$APP_DIR" test > "$TEST_LOG" 2>&1
test_status=$?

if [ $test_status -ne 0 ]; then
  summary="$(/usr/bin/grep -E '^ *(Test Files|Tests) ' "$TEST_LOG" | tr -s ' \n' ' ')"
  deny "Push blocked: the TESTS failed (npm test, exit $test_status). ${summary}
Read the full output:  cat $TEST_LOG
Re-run it yourself:    npm --prefix $APP_DIR test
The build was not run. Fix the tests, then push again."
fi

npm --prefix "$APP_DIR" run build > "$BUILD_LOG" 2>&1
build_status=$?

if [ $build_status -ne 0 ]; then
  deny "Push blocked: the tests passed but the BUILD failed (npm run build, exit $build_status).
Read the full output:  cat $BUILD_LOG
Re-run it yourself:    npm --prefix $APP_DIR run build
Fix the build, then push again."
fi

# Both passed. Say nothing and let the push proceed through the normal
# permission flow.
exit 0
