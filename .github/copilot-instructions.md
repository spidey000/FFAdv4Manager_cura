# GitHub Copilot instructions — AD4 Studio

Follow the repository-wide [AGENTS.md](../AGENTS.md) as the mandatory coding-agent contract. It describes source ownership, user-facing product scope, safety invariants, test commands, screenshots and PR/merge expectations.

Quick non-negotiables:

- Edit `overlays/mosaic/` for UI, **never** the generated/ignored `frontend/` or pinned `vendor/` submodules.
- Native CuraEngine runs **only on the Linux server**. GitHub Pages is a read-only/interactive editor preview; no real slicing or physical print calls.
- Protect the Adventurer 4 and its users: preserve thermal checks, upload/start distinction, validated files, confirmed hardware actions, loopback/auth defaults, and read-only model of the current job.
- M114 Z based layer identification is **an estimate**. M661 lists files; M662 gives thumbnails; neither is a verified full G-code downloader for stock Adventurer 4.
- Use real browser/integration tests, acknowledge mocked printer limitations, and update `README.md` and genuine Pages screenshots when behavior changes.
- Review the latest merged PRs and actual source before claiming a feature is implemented. See AGENTS.md for details.
