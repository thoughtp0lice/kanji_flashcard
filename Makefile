# make build  -> build/kanji-server.mjs: single-file production server
#                (frontend embedded; needs only node >= 24 to run)
# make run    -> build and run it            [PORT=8033] [KANJI_ADMINS=name]
# make test   -> run the test suite
# make clean  -> remove build artifacts

ESBUILD := node_modules/.bin/esbuild
OUT     := build/kanji-server.mjs
PORT    ?= 8033

.PHONY: build run test clean

build:
	npm run build
	node scripts/embed-assets.mjs
	$(ESBUILD) server/prod.js --bundle --platform=node --format=esm \
		--outfile=$(OUT) --log-level=error \
		--banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
	@echo "built $(OUT) ($$(du -h $(OUT) | cut -f1))"

run: build
	PORT=$(PORT) KANJI_ADMINS=$(KANJI_ADMINS) node $(OUT)

test:
	npm test

clean:
	rm -rf dist build
