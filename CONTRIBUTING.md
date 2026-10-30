# Contributing

Thanks for taking an interest in Tarang FM. The code is source-available under an all-rights-reserved [LICENSE](./LICENSE), so please read this first.

## What is welcome

- **Bug reports** with the station, what you heard or saw, and your browser. Use the issue template.
- **Ideas** for stations, languages, shows and ads. Open an issue before writing code.
- **Small fixes** (typos, docs, accessibility) as pull requests.

For anything bigger, open an issue first so we agree on the approach. By sending a pull request you agree that the maintainer may use it under the project's license.

## Ground rules

- Be kind: see the [code of conduct](./CODE_OF_CONDUCT.md).
- Report security problems privately: [SECURITY.md](./SECURITY.md).
- Don't point scripts or load tests at the live site; it spends real Sarvam credits.
- Every script that airs must pass the code checks in `worker/checks/`; don't loosen them to make a test pass.

## Pull requests

1. Branch from `main`; keep the change focused.
2. Add or update tests next to the code (`*.test.ts`). CI runs typecheck, unit tests, the production build, browser tests, docs diagrams and a dependency audit on every pull request.
3. Update the docs and [CHANGELOG](./CHANGELOG.md) when behavior changes.
4. Describe what changed and why. Screenshots help for UI changes.

Maintainer setup notes: [docs/MAINTAINING.md](./docs/MAINTAINING.md). How the system works: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
