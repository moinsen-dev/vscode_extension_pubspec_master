# Example Baseline - Dogfooding Workspace

This folder contains the **baseline pubspec.yaml files** for testing the Moinsen Pubspec Master extension. These files have **intentional issues** that the extension should detect and help fix.

## Architecture

```
vscode_extension_pubspec_master/
├── example-baseline/     <- You are here (Git-tracked)
│   ├── pubspec.yaml      <- Root workspace config
│   ├── .pubspec-master.json
│   ├── apps/
│   │   ├── shop_app/pubspec.yaml
│   │   └── admin_app/pubspec.yaml
│   └── packages/
│       ├── core/pubspec.yaml
│       ├── ui_kit/pubspec.yaml
│       ├── api_client/pubspec.yaml
│       └── shared_models/pubspec.yaml
│
├── example/              <- Generated working copy (.gitignored)
│   └── (Real Flutter project with baseline issues)
│
└── scripts/
    ├── example-setup.sh   <- Creates example/ from baseline
    ├── example-reset.sh   <- Resets example/ to baseline
    ├── example-compare.sh <- Shows changes vs baseline
    └── example-verify.sh  <- Verifies fixes worked
```

## Intentional Issues

| Package | Issue Type | Details | Severity |
|---------|------------|---------|----------|
| shop_app | Version conflict | `http: ^1.0.0` | Warning |
| admin_app | Version conflict | `http: ^1.2.0` (conflicts with shop_app) | Warning |
| api_client | **MAJOR conflict** | `http: ^0.13.0` (breaking version!) | Critical |
| core | SDK mismatch | `sdk: '>=3.4.0'` (root requires `>=3.6.0`) | Error |
| shared_models | Outdated dep | `json_annotation: ^4.7.0` (latest is 4.9.0) | Warning |

## Workflow

### 1. Initial Setup (Once)

```bash
./scripts/example-setup.sh
```

This creates the `example/` folder by:
1. Running `flutter create` for each app and package
2. Copying the baseline pubspec.yaml files (with issues)

### 2. Test the Extension

1. Open the `example/` folder in VS Code
2. The Pubspec Master extension should activate
3. Check the dashboard for detected issues
4. Use the extension to fix conflicts

### 3. Compare Changes

```bash
./scripts/example-compare.sh
```

Shows a diff of what changed in `example/` compared to baseline.

### 4. Verify Fixes

```bash
./scripts/example-verify.sh
```

Runs automated checks to see if:
- Version conflicts are resolved
- SDK constraints are consistent
- Dependencies can be resolved

### 5. Reset for Another Test

```bash
./scripts/example-reset.sh
```

Restores the baseline pubspec files so you can test again.

## Expected Extension Behavior

When working correctly, the extension should:

1. **Detect Issues in Dashboard**
   - Show 3+ version conflicts for `http`
   - Show SDK mismatch for `core` package
   - Show outdated warning for `json_annotation`

2. **Offer Fixes**
   - "Sync All Versions" should unify `http` to `^1.2.0`
   - "Fix SDK Mismatch" should update `core` to `>=3.6.0`
   - "Check Updates" should flag `json_annotation` as outdated

3. **After Fixes**
   - `flutter pub get` should succeed
   - All version conflicts should be resolved
   - `./scripts/example-verify.sh` should pass

## Modifying the Baseline

If you want to add new test cases:

1. Edit files in `example-baseline/`
2. Commit changes to git
3. Run `./scripts/example-reset.sh` to apply to `example/`

The baseline should always contain intentional issues. Don't "fix" the baseline!
