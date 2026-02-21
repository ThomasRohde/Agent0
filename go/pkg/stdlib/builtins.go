package stdlib

import (
	"fmt"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// RegisterDefaults adds the minimum stdlib functions needed for Phase 1.
func RegisterDefaults(r *Registry) {
	r.Register(Fn{Name: "eq", Execute: stdlibEq})
	r.Register(Fn{Name: "not", Execute: stdlibNot})
	r.Register(Fn{Name: "range", Execute: stdlibRange})
	r.Register(Fn{Name: "len", Execute: stdlibLen})
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

// not { value } → negate truthiness → bool
func stdlibNot(args *evaluator.A0Record) (evaluator.A0Value, error) {
	val, _ := args.Get("value")
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

// len { list } → length of list or record
func stdlibLen(args *evaluator.A0Record) (evaluator.A0Value, error) {
	listVal, _ := args.Get("list")
	if listVal == nil {
		// Try first positional arg
		if len(args.Pairs) > 0 {
			listVal = args.Pairs[0].Value
		}
	}
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
