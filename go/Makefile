.PHONY: build test lint wasm wasip1 bench conformance

build:
	go build ./cmd/a0

test:
	go test -race ./...

lint:
	go vet ./...

wasm:
	GOOS=js GOARCH=wasm go build -o a0.wasm ./cmd/a0-wasm

wasip1:
	GOOS=wasip1 GOARCH=wasm go build -o a0-wasi.wasm ./cmd/a0

bench:
	go test -bench=. -benchmem ./...

conformance:
	go test -run TestConformance ./...
