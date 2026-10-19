# Project instructions for Codex

User-provided skills are installed in `.agents/skills/`. Read a matching skill's `SKILL.md` before applying it; discover names in `.agents/skills/catalog.json`. Treat these as Codex skills, including workflows originally written for Claude. Follow the Codex adaptation section in each skill. Apply only skills relevant to the current request.

Installed skills:
- `marketplace-api`: `.agents/skills/marketplace-api/SKILL.md`
- `accessibility-review`: `.agents/skills/accessibility-review/SKILL.md`
- `ui-ux-pro-max`: `.agents/skills/ui-ux-pro-max/SKILL.md`
- `frontend-design`: `.agents/skills/frontend-design/SKILL.md`
- `viewports`: `.agents/skills/viewports/SKILL.md`
- `spacing`: `.agents/skills/spacing/SKILL.md`
- `ux-audit`: `.agents/skills/ux-audit/SKILL.md`
- `brandos-new-source`: `.agents/skills/brandos-new-source/SKILL.md`
- `anti-slop`: `.agents/skills/anti-slop/SKILL.md`

The uploaded bundle contains SKILL.md files only. Companion scripts, datasets, and reference documents are not installed. Do not execute missing scripts or claim unavailable checks passed. Preserve the original uploads outside this checkout.

Use the existing checkout; each cloud task is already isolated. Do not create a Git worktree unless the user explicitly requests one.
