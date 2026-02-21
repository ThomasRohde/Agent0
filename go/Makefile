.PHONY: build install test lint bench conformance

build:
	go build ./cmd/a0

install:
	go build -o $(shell go env GOPATH)/bin/a0go$(shell go env GOEXE) ./cmd/a0

test:
	go test -race ./...

lint:
	go vet ./...

bench:
	go test -bench=. -benchmem ./...

conformance:
	go test -run TestConformance ./...
