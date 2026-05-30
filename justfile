# Default: lint, build, test
default: all

# Compile TypeScript
build:
    pnpm run build

# Run unit tests
test:
    pnpm test

# Run model smoke tests
test-models:
    pnpm run test:models

# Lint with oxlint + oxfmt
lint:
    pnpm run lint

# Auto-fix lint issues
fix:
    pnpm run lint:fix

# Format with oxfmt
format:
    pnpm run format

# Remove compiled output
clean:
    rm -rf dist

# Live OAuth refresh (rotates token, writes back)
validate-oauth: build
    pnpm run validate:oauth

# Dry-run OAuth refresh (no network request)
validate-oauth-dry: build
    pnpm run validate:oauth -- --dry-run

# Lint + build + test
all: lint build test
