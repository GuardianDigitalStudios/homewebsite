# Guardian Digital Studios — company site task runner
#
# Static site, no build step: start a server and edit the files. Same shape and
# same recipe names as the commander-index repo, so the two do not need
# different muscle memory.

# List the available recipes
default:
    @just --list

# Serve the site at http://localhost:8000
start:
    python3 -m http.server 8000

# Pre-commit checks: JS parses, local links resolve, onclick targets exist
check:
    node scripts/sanity-check.mjs

# Point git at .githooks so `check` runs on every commit. Run once per clone.
hooks:
    git config core.hooksPath .githooks
