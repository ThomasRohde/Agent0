package stdlib

import (
	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// contains { in: string|list|record, value: any } → bool
func stdlibContains(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	value, _ := args.Get("value")
	if input == nil {
		input = evaluator.NewNull()
	}
	if value == nil {
		value = evaluator.NewNull()
	}

	switch in_ := input.(type) {
	case evaluator.A0String:
		// Substring check
		valStr, ok := value.(evaluator.A0String)
		if !ok {
			return evaluator.NewBool(false), nil
		}
		return evaluator.NewBool(containsSubstring(in_.Value, valStr.Value)), nil

	case evaluator.A0List:
		// Deep element membership
		for _, item := range in_.Items {
			if evaluator.DeepEqual(item, value) {
				return evaluator.NewBool(true), nil
			}
		}
		return evaluator.NewBool(false), nil

	case evaluator.A0Record:
		// Key existence (value must be string)
		valStr, ok := value.(evaluator.A0String)
		if !ok {
			return evaluator.NewBool(false), nil
		}
		_, found := in_.Get(valStr.Value)
		return evaluator.NewBool(found), nil
	}

	return evaluator.NewBool(false), nil
}

func containsSubstring(s, substr string) bool {
	return len(substr) == 0 || len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// and { a, b } → bool
func stdlibAnd(args *evaluator.A0Record) (evaluator.A0Value, error) {
	a, _ := args.Get("a")
	b, _ := args.Get("b")
	if a == nil {
		a = evaluator.NewNull()
	}
	if b == nil {
		b = evaluator.NewNull()
	}
	return evaluator.NewBool(evaluator.Truthiness(a) && evaluator.Truthiness(b)), nil
}

// or { a, b } → bool
func stdlibOr(args *evaluator.A0Record) (evaluator.A0Value, error) {
	a, _ := args.Get("a")
	b, _ := args.Get("b")
	if a == nil {
		a = evaluator.NewNull()
	}
	if b == nil {
		b = evaluator.NewNull()
	}
	return evaluator.NewBool(evaluator.Truthiness(a) || evaluator.Truthiness(b)), nil
}

// coalesce { in, default } → any
// Returns `in` if not null (strict null-check, NOT truthiness), else `default`.
func stdlibCoalesce(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	fallback, _ := args.Get("default")
	if fallback == nil {
		fallback = evaluator.NewNull()
	}
	if input == nil {
		return fallback, nil
	}
	if _, isNull := input.(evaluator.A0Null); isNull {
		return fallback, nil
	}
	return input, nil
}

// typeof { in } → string
func stdlibTypeof(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	if input == nil {
		return evaluator.NewString("null"), nil
	}
	switch input.(type) {
	case evaluator.A0Null:
		return evaluator.NewString("null"), nil
	case evaluator.A0Bool:
		return evaluator.NewString("boolean"), nil
	case evaluator.A0Number:
		return evaluator.NewString("number"), nil
	case evaluator.A0String:
		return evaluator.NewString("string"), nil
	case evaluator.A0List:
		return evaluator.NewString("list"), nil
	case evaluator.A0Record:
		return evaluator.NewString("record"), nil
	}
	return evaluator.NewString("null"), nil
}
