.PHONY: build test test-models lint fix format clean validate-oauth validate-oauth-dry all

build:
	pnpm run build

test:
	pnpm test

test-models:
	pnpm run test:models

lint:
	pnpm run lint

fix:
	pnpm run lint:fix

format:
	pnpm run format

clean:
	rm -rf dist

validate-oauth: build  ## Run live OAuth refresh (rotates token, writes back)
	pnpm run validate:oauth

validate-oauth-dry: build  ## Dry-run OAuth refresh (no network request)
	pnpm run validate:oauth -- --dry-run

all: lint build test
