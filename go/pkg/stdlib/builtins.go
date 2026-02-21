package stdlib

import (
	"fmt"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// RegisterDefaults adds all stdlib functions.
func RegisterDefaults(r *Registry) {
	// Predicates
	r.Register(Fn{Name: "eq", Execute: stdlibEq})
	r.Register(Fn{Name: "not", Execute: stdlibNot})
	r.Register(Fn{Name: "contains", Execute: stdlibContains})
	r.Register(Fn{Name: "and", Execute: stdlibAnd})
	r.Register(Fn{Name: "or", Execute: stdlibOr})
	r.Register(Fn{Name: "coalesce", Execute: stdlibCoalesce})
	r.Register(Fn{Name: "typeof", Execute: stdlibTypeof})

	// List ops
	r.Register(Fn{Name: "len", Execute: stdlibLen})
	r.Register(Fn{Name: "append", Execute: stdlibAppend})
	r.Register(Fn{Name: "concat", Execute: stdlibConcat})
	r.Register(Fn{Name: "sort", Execute: stdlibSort})
	r.Register(Fn{Name: "filter", Execute: stdlibFilter})
	r.Register(Fn{Name: "find", Execute: stdlibFind})
	r.Register(Fn{Name: "range", Execute: stdlibRange})
	r.Register(Fn{Name: "join", Execute: stdlibJoin})
	r.Register(Fn{Name: "unique", Execute: stdlibUnique})
	r.Register(Fn{Name: "pluck", Execute: stdlibPluck})
	r.Register(Fn{Name: "flat", Execute: stdlibFlat})

	// String ops
	r.Register(Fn{Name: "str.concat", Execute: stdlibStrConcat})
	r.Register(Fn{Name: "str.split", Execute: stdlibStrSplit})
	r.Register(Fn{Name: "str.starts", Execute: stdlibStrStarts})
	r.Register(Fn{Name: "str.ends", Execute: stdlibStrEnds})
	r.Register(Fn{Name: "str.replace", Execute: stdlibStrReplace})
	r.Register(Fn{Name: "str.template", Execute: stdlibStrTemplate})

	// Record ops
	r.Register(Fn{Name: "keys", Execute: stdlibKeys})
	r.Register(Fn{Name: "values", Execute: stdlibValues})
	r.Register(Fn{Name: "merge", Execute: stdlibMerge})
	r.Register(Fn{Name: "entries", Execute: stdlibEntries})

	// Path ops
	r.Register(Fn{Name: "get", Execute: stdlibGet})
	r.Register(Fn{Name: "put", Execute: stdlibPut})

	// Parse
	r.Register(Fn{Name: "parse.json", Execute: stdlibParseJSON})

	// Math
	r.Register(Fn{Name: "math.max", Execute: stdlibMathMax})
	r.Register(Fn{Name: "math.min", Execute: stdlibMathMin})

	// Patch
	r.Register(Fn{Name: "patch", Execute: stdlibPatch})

	// Map & reduce are registered but handled specially by the evaluator
	r.Register(Fn{Name: "map", Execute: stdlibMapStub})
	r.Register(Fn{Name: "reduce", Execute: stdlibReduceStub})
}

// map and reduce stubs — the evaluator intercepts these for special handling
func stdlibMapStub(args *evaluator.A0Record) (evaluator.A0Value, error) {
	return nil, fmt.Errorf("map must be called through evaluator")
}

func stdlibReduceStub(args *evaluator.A0Record) (evaluator.A0Value, error) {
	return nil, fmt.Errorf("reduce must be called through evaluator")
}

// eq { a, b } → deep equality → bool
func stdlibEq(args *evaluator.A0Record) (evaluator.A0Value, error) {
	a, _ := args.Get("a")
	b, _ := args.Get("b")
	if a == nil {
		a = evaluator.NewNull()
	}
	if b == nil {
		b = evaluator.NewNull()
	}
	return evaluator.NewBool(evaluator.DeepEqual(a, b)), nil
}

// not { in } → negate truthiness → bool
func stdlibNot(args *evaluator.A0Record) (evaluator.A0Value, error) {
	val, _ := args.Get("in")
	if val == nil {
		val = evaluator.NewNull()
	}
	return evaluator.NewBool(!evaluator.Truthiness(val)), nil
}

// range { from, to } → list of numbers
func stdlibRange(args *evaluator.A0Record) (evaluator.A0Value, error) {
	fromVal, _ := args.Get("from")
	toVal, _ := args.Get("to")

	from := 0.0
	to := 0.0

	if num, ok := fromVal.(evaluator.A0Number); ok {
		from = num.Value
	}
	if num, ok := toVal.(evaluator.A0Number); ok {
		to = num.Value
	}

	if to < from {
		return evaluator.NewList(nil), nil
	}

	count := int(to - from)
	if count > 1000000 {
		return nil, fmt.Errorf("range too large: %d items", count)
	}

	items := make([]evaluator.A0Value, 0, count)
	for i := from; i < to; i++ {
		items = append(items, evaluator.NewNumber(i))
	}
	return evaluator.NewList(items), nil
}

// len { in } → length of list, record, or string
func stdlibLen(args *evaluator.A0Record) (evaluator.A0Value, error) {
	listVal, _ := args.Get("in")
	if listVal == nil {
		return evaluator.NewNumber(0), nil
	}

	switch v := listVal.(type) {
	case evaluator.A0List:
		return evaluator.NewNumber(float64(len(v.Items))), nil
	case evaluator.A0Record:
		return evaluator.NewNumber(float64(len(v.Pairs))), nil
	case evaluator.A0String:
		return evaluator.NewNumber(float64(len(v.Value))), nil
	default:
		return evaluator.NewNumber(0), nil
	}
}
