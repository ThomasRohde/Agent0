package stdlib

import (
	"fmt"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// keys { in: record } → list of strings
func stdlibKeys(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	rec, ok := input.(evaluator.A0Record)
	if !ok {
		return nil, fmt.Errorf("keys: 'in' must be a record")
	}
	items := make([]evaluator.A0Value, len(rec.Pairs))
	for i, kv := range rec.Pairs {
		items[i] = evaluator.NewString(kv.Key)
	}
	return evaluator.NewList(items), nil
}

// values { in: record } → list
func stdlibValues(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	rec, ok := input.(evaluator.A0Record)
	if !ok {
		return nil, fmt.Errorf("values: 'in' must be a record")
	}
	items := make([]evaluator.A0Value, len(rec.Pairs))
	for i, kv := range rec.Pairs {
		items[i] = kv.Value
	}
	return evaluator.NewList(items), nil
}

// merge { a: record, b: record } → record (b wins on conflicts)
func stdlibMerge(args *evaluator.A0Record) (evaluator.A0Value, error) {
	aVal, _ := args.Get("a")
	bVal, _ := args.Get("b")

	aRec, aOk := aVal.(evaluator.A0Record)
	bRec, bOk := bVal.(evaluator.A0Record)
	if !aOk || !bOk {
		return nil, fmt.Errorf("merge: 'a' and 'b' must be records")
	}

	// Start with a copy of a
	result := &evaluator.A0Record{Pairs: make([]evaluator.KeyValue, len(aRec.Pairs))}
	copy(result.Pairs, aRec.Pairs)

	// Merge b on top (b wins)
	for _, kv := range bRec.Pairs {
		result.Set(kv.Key, kv.Value)
	}

	return *result, nil
}

// entries { in: record } → list of { key, value } records
func stdlibEntries(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	rec, ok := input.(evaluator.A0Record)
	if !ok {
		return nil, fmt.Errorf("entries: 'in' must be a record")
	}
	items := make([]evaluator.A0Value, len(rec.Pairs))
	for i, kv := range rec.Pairs {
		items[i] = evaluator.NewRecord([]evaluator.KeyValue{
			{Key: "key", Value: evaluator.NewString(kv.Key)},
			{Key: "value", Value: kv.Value},
		})
	}
	return evaluator.NewList(items), nil
}
