# Lessons Log

Append-only. One bullet per mistake that cost time: what went wrong, and the rule that prevents it. Read this at the start of every session.

- (seed) Kroger public product API is rate-limited (~10k req/day) — always go through the price cache, never call collectors directly from route handlers.
- 2026-07-03: Codex background tasks failed instantly with "app-server SIGKILL" — the global `@openai/codex` install was corrupt (every invocation exit 137). Fix: `npm install -g @openai/codex@latest`. If a Codex task fails in ~3s, check `codex --version` first before blaming prompts or sandboxing.
