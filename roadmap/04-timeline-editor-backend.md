# Timeline editor + protected backend

**Status:** Planned

## Goal

A password-protected way to add, remove, and edit nodes/links on the timeline and flowchart, instead of hand-editing the giant embedded JSON blob in `index.html`.

## Why this needs *some* form of backend

GitHub Pages (and GitHub in general) only serves **static files** — there's no server-side code execution on the pages themselves. So the write/auth logic has to happen somewhere else. The good news: given the actual constraints here (fewer than 10 editors, all provisioned by hand rather than through open signup), that "somewhere else" can be **GitHub itself**, via its API — no third-party service required.

## Chosen approach: GitHub-native, no external service

- **Access control = the repo's collaborator list.** You already decide who can be an editor by adding them as a GitHub collaborator on this repo. Nothing extra to manage.
- Each editor generates their own **fine-grained Personal Access Token (PAT)**, scoped to *only this repository* with "Contents: Read and write" permission (nothing else), from their own GitHub account settings.
- They paste that token into the site's "Edit mode" login once; it's kept in that browser's `localStorage`.
- All edits (add/remove/edit a node, add/remove a link) call the **GitHub Contents API** directly from the browser using that token, which commits the change straight to the repo. GitHub Pages then redeploys automatically (typically within about a minute) and the live site reflects it.
- The canonical `nodes`/`edges` data moves out of the inline `<script>` blob in `index.html` into its own `data.json` file, so an edit is a small, clean commit rather than touching the whole page.
- Bonus: since the token identifies the GitHub user making the request, the site can attribute each change ("last edited by @username") for free.

### Security notes

- A PAT scoped to just this one repo's contents can't touch anything else in the editor's GitHub account — limited blast radius if it ever leaked.
- The token goes straight from the editor's browser to `api.github.com` over HTTPS — no third party ever sees it.
- Removing someone as a collaborator immediately blocks their token from writing, regardless of whether they still have it saved somewhere.
- Same caveat as any client-side-only credential: anyone with access to the *browser* it's saved in could use it. Editors should revoke/regenerate their token if they ever use a shared or public machine.

### Trade-off to accept

Every edit becomes a git commit. At 10 editors that's a feature more than a problem (full audit trail of who changed what), but the repo's commit history will accumulate small data-edit commits over time.

## Open questions (need your input before building)

1. OK with edits showing up as individual commits in the repo's history?
2. Should the "Edit mode" login live inline on the same site (a hidden toggle), or as a separate small admin page?
3. Fine-grained PATs are a relatively new GitHub feature aimed at exactly this kind of narrow, per-repo scoping — comfortable asking each editor to set one up (a few clicks in their GitHub settings), or would you rather I look at alternatives?
