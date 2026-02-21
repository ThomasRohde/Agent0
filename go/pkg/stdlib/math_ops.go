package stdlib

import (
	"fmt"
	"math"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// math.max { in: list } → number
func stdlibMathMax(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	list, ok := input.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("math.max: 'in' must be a list")
	}
	if len(list.Items) == 0 {
		return nil, fmt.Errorf("math.max: list must not be empty")
	}

	max := math.Inf(-1)
	for _, item := range list.Items {
		num, ok := item.(evaluator.A0Number)
		if !ok {
			return nil, fmt.Errorf("math.max: all elements must be numbers")
		}
		if num.Value > max {
			max = num.Value
		}
	}
	return evaluator.NewNumber(max), nil
}

// math.min { in: list } → number
func stdlibMathMin(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	list, ok := input.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("math.min: 'in' must be a list")
	}
	if len(list.Items) == 0 {
		return nil, fmt.Errorf("math.min: list must not be empty")
	}

	min := math.Inf(1)
	for _, item := range list.Items {
		num, ok := item.(evaluator.A0Number)
		if !ok {
			return nil, fmt.Errorf("math.min: all elements must be numbers")
		}
		if num.Value < min {
			min = num.Value
		}
	}
	return evaluator.NewNumber(min), nil
}
