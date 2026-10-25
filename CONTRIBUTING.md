# Contributing

Thanks for trying **dsh-project-supervisor** (Beta). Issues and PRs are welcome.

## Development quick start

```bash
git clone https://github.com/Midnight-1991/dsh-project-supervisor.git
cd dsh-project-supervisor

# plugin offline checks (Node >= 18)
node scripts/smoke.mjs
node scripts/host-smoke.mjs
node scripts/compat-check.mjs

# kit installer dry-run
mkdir -p /tmp/ws
bash kit/install-supervisor.sh /tmp/ws --dry-run --with-research
node kit/install-supervisor.mjs /tmp/ws --dry-run --with-research
```

CI runs the same checks on every push (`.github/workflows/verify.yml`).

## Pull requests

- Keep changes small and describe the verification commands you ran.
- Docs/翻译 corrections are welcome.
- Do not include private data (local paths, tokens, workspace names) in issues or PRs.
- This project uses the MIT license; by contributing you agree your contributions
  are licensed under the same terms.
