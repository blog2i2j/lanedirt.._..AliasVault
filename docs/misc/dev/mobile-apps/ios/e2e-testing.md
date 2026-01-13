# iOS E2E Testing with Maestro

This guide explains how to set up and run end-to-end tests for the AliasVault iOS mobile app using [Maestro](https://maestro.mobile.dev/).

## Prerequisites

- macOS (required for iOS simulator)
- Xcode installed with iOS Simulator
- Node.js 20+
- The AliasVault mobile app built and ready to run

## Installing Maestro

Install Maestro CLI:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

After installation, restart your terminal or run:

```bash
export PATH="$PATH":"$HOME/.maestro/bin"
```

Verify the installation:

```bash
maestro --version
```

## Building the App for Testing

Before running E2E tests, you need to build the app:

```bash
cd apps/mobile-app

# Install dependencies
npm install

# Build and run on iOS simulator
npm run ios
```

Wait for the app to fully launch in the simulator before running tests.

## Running E2E Tests

### Run All Tests

```bash
cd apps/mobile-app

# Run all E2E tests on iOS
npm run test:e2e:ios
```

### Run a Specific Test

```bash
# Run a single test file
$HOME/.maestro/bin/maestro test .maestro/flows/01-app-launch.yaml --platform ios
```

### Run Tests with Environment Variables

Some tests require credentials to log in:

```bash
TEST_USERNAME="your-test-user" TEST_PASSWORD="your-test-password" npm run test:e2e:ios
```

Or pass them directly to Maestro:

```bash
$HOME/.maestro/bin/maestro test .maestro/flows/03-successful-login.yaml \
  --platform ios \
  --env TEST_USERNAME="your-test-user" \
  --env TEST_PASSWORD="your-test-password"
```

## Test Structure

Tests are located in `apps/mobile-app/.maestro/`:

```
.maestro/
├── config.yaml           # Maestro configuration
├── flows/                # Test flows (run in order)
│   ├── 01-app-launch.yaml
│   ├── 02-login-validation.yaml
│   ├── 03-successful-login.yaml
│   ├── 04-create-item.yaml
│   └── ...
└── utils/                # Reusable flows
    └── go-back.yaml
```

## Debugging Failed Tests

### View Screenshots

Maestro saves screenshots and debug output to `~/.maestro/tests/`. After a test run, check this directory for:
- Screenshots at failure points
- JSON files with element hierarchy
- HTML reports

### Run in Debug Mode

```bash
maestro test .maestro/flows/01-app-launch.yaml --debug-output ./debug
```

### Interactive Studio

Launch Maestro Studio to interactively build and debug tests:

```bash
maestro studio
```

This opens a web UI where you can:
- See the current screen elements
- Record actions
- Test selectors

## CI/CD Integration

E2E tests are configured to run in GitHub Actions:

- **Android tests**: Run on every PR (Linux runner)
- **iOS tests**: Run on schedule/manual dispatch (macOS runner - higher cost)

See `.github/workflows/mobile-e2e-tests.yml` for the CI configuration.
