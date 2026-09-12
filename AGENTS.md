# Kanto Surfer KS - AI Agent Rules

## Purpose
Safely build and maintain the Kanto Surfer KS wave-information project while keeping GitHub as the project source of truth.

## Core rules
1. Follow the global rules in `oosaka0123-sudo/ai-master`.
2. Do not invent surf spots, forecast data, rankings, API results, deployment status, or external-service connections.
3. Never commit passwords, API keys, authentication secrets, private runtime data, logs, or personal information.
4. Treat Kansai Surfer KS as a reference project, not as an automatic copy source. Verify Kanto-specific requirements before reuse.
5. Prefer small, reviewable changes and avoid unrelated edits.
6. Work on a feature/fix branch, review the diff, check for accidental secrets, open a pull request, then merge after review.
7. Do not add automatic production deployment or paid external workflows without explicit approval.
8. One agent should own implementation for a task; other agents may review, test, research, or propose alternatives.
9. Completion claims require evidence appropriate to the task: implementation, test, review, PR/merge, deploy, and live verification when applicable.

## Project knowledge
- Confirmed durable specification belongs in the existing project source-of-truth files.
- Important long-lived design rationale may go in `DECISIONS.md` when such a decision actually exists.
- Reusable operational procedures may go in `RUNBOOK.md` when needed.
- Unfinished restart-critical state may go in `HANDOFF.md` when needed.
- Do not duplicate history that GitHub Issues, Pull Requests, Actions, or commits already preserve.
