# make build  -> build/kanji-server.mjs: single-file production server
#                (frontend embedded; needs only node >= 24 to run)
# make run    -> build and run it            [PORT=8033] [KANJI_ADMINS=name]
# make test   -> run the test suite
# make clean  -> remove build artifacts

OUT  := build/kanji-server.mjs
PORT ?= 8033

.PHONY: build run test clean docker

build:
	npm run bundle
	@echo "built $(OUT) ($$(du -h $(OUT) | cut -f1))"

docker:
	docker build -t kanji-flashcard .

run: build
	PORT=$(PORT) KANJI_ADMINS=$(KANJI_ADMINS) node $(OUT)

test:
	npm test

clean:
	rm -rf dist build
