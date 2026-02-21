.PHONY: build test lint bench conformance

build:
	go build ./cmd/a0

test:
	go test -race ./...

lint:
	go vet ./...

bench:
	go test -bench=. -benchmem ./...

conformance:
	go test -run TestConformance ./...
