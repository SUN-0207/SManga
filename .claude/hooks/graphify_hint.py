#!/usr/bin/env python3
"""PreToolUse hook: nudge toward the graphify knowledge graph before raw
exploration (grep / file reads / globs), when a graph exists for this project.

Why a script instead of the inline shell command graphify's installer writes:
the generated hook used `python3` + POSIX `case...esac`, which on Windows hits
the broken Microsoft Store `python3` alias and silently becomes a no-op. This is
run in EXEC form (settings -> command + args), so no shell is involved at all and
no `python3` is required — Claude Code launches the interpreter directly.

Contract (Claude Code hooks): read the tool-call JSON from stdin, optionally
print {"hookSpecificOutput": {...}} to stdout, always exit 0. We never block a
tool — this only injects a reminder. A reminder fires only when
graphify-out/graph.json exists, so it's inert until a graph has been built.

Covers the tools actually used to explore in this harness:
  - Grep            (dedicated search tool — always a search)
  - Glob / Read     (file pattern / file read of source or docs)
  - Bash / PowerShell when the command contains a search verb
"""
import json
import os
import sys

# Search verbs for shell tools (Bash + PowerShell). Substring match, lowercased.
SHELL_SEARCH_TERMS = (
    "grep", "rg ", "ripgrep", "find ", "fd ", "ack ", "ag ",
    "select-string", "findstr", "get-childitem", "gci ", "sls ",
)

# Source / doc extensions worth steering toward the graph instead of reading raw.
CODE_DOC_EXTS = (
    ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".rb",
    ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".kt", ".swift", ".php",
    ".scala", ".lua", ".sh", ".md", ".rst", ".txt", ".mdx",
)

SEARCH_HINT = (
    "graphify: a knowledge graph exists at graphify-out/. For a focused question, "
    "run `graphify query \"<question>\"` (a scoped subgraph, usually far smaller "
    "than raw search output) instead of grepping the tree. Read GRAPH_REPORT.md "
    "only for broad architecture context."
)
READ_HINT = (
    "graphify: a knowledge graph exists at graphify-out/. For codebase questions, "
    "prefer `graphify query \"<question>\"`, `graphify explain \"<concept>\"`, or "
    "`graphify path \"<A>\" \"<B>\"` over reading source files one by one. Keep "
    "reading raw files to modify or debug specific code, or when the graph lacks detail."
)


def emit(context):
    sys.stdout.write(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": context,
        }
    }))


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0  # malformed/empty stdin -> stay silent, never block

    tool = data.get("tool_name", "")
    tin = data.get("tool_input") or {}

    # Resolve project root; require an existing graph or do nothing.
    root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()
    if not os.path.isfile(os.path.join(root, "graphify-out", "graph.json")):
        return 0

    if tool == "Grep":
        emit(SEARCH_HINT)
        return 0

    if tool in ("Bash", "PowerShell"):
        cmd = str(tin.get("command", "")).lower()
        if any(term in cmd for term in SHELL_SEARCH_TERMS):
            emit(SEARCH_HINT)
        return 0

    if tool in ("Read", "Glob"):
        for raw in (tin.get("file_path"), tin.get("pattern"), tin.get("path")):
            if not raw:
                continue
            cand = str(raw).replace("\\", "/").lower()
            if "graphify-out/" in cand:
                continue
            # Match the real trailing extension, not a substring — otherwise
            # "package.json" matches ".js" and "style.css" matches ".c".
            if os.path.splitext(cand)[1] in CODE_DOC_EXTS:
                emit(READ_HINT)
                return 0
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
