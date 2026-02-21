package stdlib

import (
	"fmt"
	"strings"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// str.concat { parts: list } → string
func stdlibStrConcat(args *evaluator.A0Record) (evaluator.A0Value, error) {
	partsVal, _ := args.Get("parts")
	list, ok := partsVal.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("str.concat: 'parts' must be a list")
	}

	var sb strings.Builder
	for _, item := range list.Items {
		sb.WriteString(valueToString(item))
	}
	return evaluator.NewString(sb.String()), nil
}

// str.split { in: string, sep: string } → list
func stdlibStrSplit(args *evaluator.A0Record) (evaluator.A0Value, error) {
	inVal, _ := args.Get("in")
	sepVal, _ := args.Get("sep")

	inStr, ok := inVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("str.split: 'in' must be a string")
	}
	sepStr, ok := sepVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("str.split: 'sep' must be a string")
	}

	parts := strings.Split(inStr.Value, sepStr.Value)
	items := make([]evaluator.A0Value, len(parts))
	for i, p := range parts {
		items[i] = evaluator.NewString(p)
	}
	return evaluator.NewList(items), nil
}

// str.starts { in: string, value: string } → bool
func stdlibStrStarts(args *evaluator.A0Record) (evaluator.A0Value, error) {
	inVal, _ := args.Get("in")
	valVal, _ := args.Get("value")

	inStr, ok := inVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("str.starts: 'in' must be a string")
	}
	valStr, ok := valVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("str.starts: 'value' must be a string")
	}

	return evaluator.NewBool(strings.HasPrefix(inStr.Value, valStr.Value)), nil
}

// str.ends { in: string, value: string } → bool
func stdlibStrEnds(args *evaluator.A0Record) (evaluator.A0Value, error) {
	inVal, _ := args.Get("in")
	valVal, _ := args.Get("value")

	inStr, ok := inVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("str.ends: 'in' must be a string")
	}
	valStr, ok := valVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("str.ends: 'value' must be a string")
	}

	return evaluator.NewBool(strings.HasSuffix(inStr.Value, valStr.Value)), nil
}

// str.replace { in: string, from: string, to: string } → string
func stdlibStrReplace(args *evaluator.A0Record) (evaluator.A0Value, error) {
	inVal, _ := args.Get("in")
	fromVal, _ := args.Get("from")
	toVal, _ := args.Get("to")

	inStr, ok := inVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("str.replace: 'in' must be a string")
	}
	fromStr, ok := fromVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("str.replace: 'from' must be a string")
	}
	toString, ok := toVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("str.replace: 'to' must be a string")
	}

	return evaluator.NewString(strings.ReplaceAll(inStr.Value, fromStr.Value, toString.Value)), nil
}

// str.template { in: string, vars: record } → string
func stdlibStrTemplate(args *evaluator.A0Record) (evaluator.A0Value, error) {
	inVal, _ := args.Get("in")
	varsVal, _ := args.Get("vars")

	inStr, ok := inVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("str.template: 'in' must be a string")
	}
	varsRec, ok := varsVal.(evaluator.A0Record)
	if !ok {
		return nil, fmt.Errorf("str.template: 'vars' must be a record")
	}

	result := inStr.Value
	// Replace {key} placeholders
	for _, kv := range varsRec.Pairs {
		placeholder := "{" + kv.Key + "}"
		if kv.Value == nil {
			continue
		}
		if _, isNull := kv.Value.(evaluator.A0Null); isNull {
			continue
		}
		result = strings.ReplaceAll(result, placeholder, valueToString(kv.Value))
	}

	return evaluator.NewString(result), nil
}
