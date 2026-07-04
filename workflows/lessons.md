# Lessons Log

Append-only. One bullet per mistake that cost time: what went wrong, and the rule that prevents it. Read this at the start of every session.

- (seed) Kroger public product API is rate-limited (~10k req/day) — always go through the price cache, never call collectors directly from route handlers.
