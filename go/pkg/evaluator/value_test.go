package evaluator_test

import (
	"testing"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

func TestNewValues(t *testing.T) {
	// Ensure all constructors return valid A0Value implementations
	values := []evaluator.A0Value{
		evaluator.NewNull(),
		evaluator.NewBool(true),
		evaluator.NewBool(false),
		evaluator.NewNumber(42),
		evaluator.NewNumber(3.14),
		evaluator.NewString("hello"),
		evaluator.NewList(nil),
		evaluator.NewRecord(nil),
	}

	for i, v := range values {
		if v == nil {
			t.Errorf("value %d: got nil", i)
		}
	}
}

func TestTruthiness(t *testing.T) {
	tests := []struct {
		value    evaluator.A0Value
		expected bool
	}{
		{evaluator.NewNull(), false},
		{evaluator.NewBool(false), false},
		{evaluator.NewBool(true), true},
		{evaluator.NewNumber(0), false},
		{evaluator.NewNumber(1), true},
		{evaluator.NewNumber(-1), true},
		{evaluator.NewString(""), false},
		{evaluator.NewString("hello"), true},
		{evaluator.NewList(nil), true},
		{evaluator.NewRecord(nil), true},
	}

	for i, tt := range tests {
		got := evaluator.Truthiness(tt.value)
		if got != tt.expected {
			t.Errorf("test %d: Truthiness(%v) = %v, want %v", i, tt.value, got, tt.expected)
		}
	}
}

func TestRecordOrderPreserved(t *testing.T) {
	pairs := []evaluator.KeyValue{
		{Key: "b", Value: evaluator.NewNumber(2)},
		{Key: "a", Value: evaluator.NewNumber(1)},
		{Key: "c", Value: evaluator.NewNumber(3)},
	}
	rec := evaluator.NewRecord(pairs).(evaluator.A0Record)

	keys := rec.Keys()
	expected := []string{"b", "a", "c"}
	for i, k := range keys {
		if k != expected[i] {
			t.Errorf("key %d: got %q, want %q", i, k, expected[i])
		}
	}
}

func TestRecordGetSet(t *testing.T) {
	rec := evaluator.NewRecord([]evaluator.KeyValue{
		{Key: "x", Value: evaluator.NewNumber(10)},
	}).(evaluator.A0Record)

	val, ok := rec.Get("x")
	if !ok {
		t.Fatal("expected key 'x' to exist")
	}
	if n, isNum := val.(evaluator.A0Number); !isNum || n.Value != 10 {
		t.Errorf("got %v, want A0Number{10}", val)
	}

	_, ok = rec.Get("missing")
	if ok {
		t.Error("expected key 'missing' to not exist")
	}

	rec.Set("y", evaluator.NewString("hello"))
	val, ok = rec.Get("y")
	if !ok {
		t.Fatal("expected key 'y' to exist after Set")
	}
	if s, isStr := val.(evaluator.A0String); !isStr || s.Value != "hello" {
		t.Errorf("got %v, want A0String{hello}", val)
	}
}
