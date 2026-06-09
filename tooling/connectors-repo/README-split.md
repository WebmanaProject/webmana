# Splitting the connector SDK into `webmana-connectors`

The connector SDK (`@webmana/contracts`, `@webmana/connectors`) and the scaffold
CLI (`create-webmana-connector`) are **Apache-2.0**, deliberately separate from
the AGPL-3.0 application. This directory holds tooling to extract them into the
standalone public repo **`webmana-connectors`** so third parties can contribute
connectors without touching the AGPL app.

## What gets extracted

```
packages/contracts        → contracts/
packages/connectors       → connectors/
packages/create-connector → create-connector/
```

Plus the standalone repo root files in `files/` (README, LICENSE, NOTICE,
workspace + tsconfig, CI).

## Option A — snapshot (simple, recommended first)

Fresh history, one "extracted from webmana@<sha>" commit. Run from the repo root:

```bash
bash tooling/connectors-repo/split.sh /tmp/webmana-connectors
```

Then push to the empty GitHub repo you created:

```bash
cd /tmp/webmana-connectors
git remote add origin https://github.com/WebmanaProject/webmana-connectors.git
git push -u origin main
```

## Option B — preserve full git history (optional)

Requires `git filter-repo` (`pip install git-filter-repo`). For each package:

```bash
git clone . /tmp/wc-split && cd /tmp/wc-split
git filter-repo --path packages/contracts --path packages/connectors \
  --path packages/create-connector --path-rename packages/:
```

Then move `contracts/`, `connectors/`, `create-connector/` to the root layout
and add the `files/` root files. Option A is enough for a first public release;
Option B is worth it only if commit-by-commit history matters to you.

## After the split — wire the main repo to npm

Once the packages are published from `webmana-connectors`:

1. In `apps/*`, change `"@webmana/connectors": "workspace:*"` →
   `"^0.1.0"` (and same for `@webmana/contracts`).
2. Remove `packages/contracts` and `packages/connectors` from this repo (they
   now live upstream), or keep them as a git submodule for local dev.

⚠️ Before publishing: replace the stub `connectors/LICENSE` / `contracts/LICENSE`
and `files/LICENSE` with the **full** Apache-2.0 text from
<https://www.apache.org/licenses/LICENSE-2.0.txt> (it could not be fetched in
the offline build environment).
