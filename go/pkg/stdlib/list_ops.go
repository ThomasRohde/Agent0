package stdlib

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// append { in: list, value: any } → list
func stdlibAppend(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	value, _ := args.Get("value")
	if value == nil {
		value = evaluator.NewNull()
	}
	list, ok := input.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("append: 'in' must be a list")
	}
	newItems := make([]evaluator.A0Value, len(list.Items)+1)
	copy(newItems, list.Items)
	newItems[len(list.Items)] = value
	return evaluator.NewList(newItems), nil
}

// concat { a: list, b: list } → list
func stdlibConcat(args *evaluator.A0Record) (evaluator.A0Value, error) {
	aVal, _ := args.Get("a")
	bVal, _ := args.Get("b")
	aList, aOk := aVal.(evaluator.A0List)
	bList, bOk := bVal.(evaluator.A0List)
	if !aOk || !bOk {
		return nil, fmt.Errorf("concat: 'a' and 'b' must be lists")
	}
	newItems := make([]evaluator.A0Value, 0, len(aList.Items)+len(bList.Items))
	newItems = append(newItems, aList.Items...)
	newItems = append(newItems, bList.Items...)
	return evaluator.NewList(newItems), nil
}

// sort { in: list, by?: string|list } → list
func stdlibSort(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	byVal, _ := args.Get("by")

	list, ok := input.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("sort: 'in' must be a list")
	}

	// Normalize by to []string or nil
	var keys []string
	if byVal != nil {
		switch bv := byVal.(type) {
		case evaluator.A0String:
			keys = []string{bv.Value}
		case evaluator.A0List:
			keys = make([]string, 0, len(bv.Items))
			for _, item := range bv.Items {
				s, ok := item.(evaluator.A0String)
				if !ok {
					return nil, fmt.Errorf("sort: 'by' array elements must be strings")
				}
				keys = append(keys, s.Value)
			}
		case evaluator.A0Null:
			// treat null by as no by
		default:
			return nil, fmt.Errorf("sort: 'by' must be a string or list of strings")
		}
	}

	sorted := make([]evaluator.A0Value, len(list.Items))
	copy(sorted, list.Items)

	sort.SliceStable(sorted, func(i, j int) bool {
		if keys == nil {
			return compareValues(sorted[i], sorted[j]) < 0
		}
		for _, key := range keys {
			a := getRecordField(sorted[i], key)
			b := getRecordField(sorted[j], key)
			cmp := compareValues(a, b)
			if cmp != 0 {
				return cmp < 0
			}
		}
		return false
	})

	return evaluator.NewList(sorted), nil
}

func getRecordField(v evaluator.A0Value, key string) evaluator.A0Value {
	if rec, ok := v.(evaluator.A0Record); ok {
		if val, found := rec.Get(key); found {
			return val
		}
	}
	return evaluator.NewNull()
}

func compareValues(a, b evaluator.A0Value) int {
	aNum, aIsNum := a.(evaluator.A0Number)
	bNum, bIsNum := b.(evaluator.A0Number)
	if aIsNum && bIsNum {
		if aNum.Value < bNum.Value {
			return -1
		}
		if aNum.Value > bNum.Value {
			return 1
		}
		return 0
	}

	aStr, aIsStr := a.(evaluator.A0String)
	bStr, bIsStr := b.(evaluator.A0String)
	if aIsStr && bIsStr {
		return strings.Compare(aStr.Value, bStr.Value)
	}

	// Fallback: compare JSON representation
	aJSON := valueToSortKey(a)
	bJSON := valueToSortKey(b)
	return strings.Compare(aJSON, bJSON)
}

func valueToSortKey(v evaluator.A0Value) string {
	b, err := evaluator.ValueToJSON(v)
	if err != nil {
		return ""
	}
	return string(b)
}

// filter { in: list, by: string } → list (stdlib version: filter by key truthiness)
func stdlibFilter(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	byVal, _ := args.Get("by")

	list, ok := input.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("filter: 'in' must be a list")
	}
	byStr, ok := byVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("filter: 'by' must be a string")
	}

	var results []evaluator.A0Value
	for _, item := range list.Items {
		rec, ok := item.(evaluator.A0Record)
		if !ok {
			continue
		}
		val, found := rec.Get(byStr.Value)
		if found && evaluator.Truthiness(val) {
			results = append(results, item)
		}
	}
	return evaluator.NewList(results), nil
}

// find { in: list, key: string, value: any } → any|null
func stdlibFind(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	keyVal, _ := args.Get("key")
	value, _ := args.Get("value")
	if value == nil {
		value = evaluator.NewNull()
	}

	list, ok := input.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("find: 'in' must be a list")
	}
	keyStr, ok := keyVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("find: 'key' must be a string")
	}

	for _, item := range list.Items {
		rec, ok := item.(evaluator.A0Record)
		if !ok {
			continue
		}
		val, found := rec.Get(keyStr.Value)
		if !found {
			val = evaluator.NewNull()
		}
		if evaluator.DeepEqual(val, value) {
			return item, nil
		}
	}
	return evaluator.NewNull(), nil
}

// join { in: list, sep?: string } → string
func stdlibJoin(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	sepVal, _ := args.Get("sep")

	list, ok := input.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("join: 'in' must be a list")
	}

	sep := ""
	if sepVal != nil {
		if s, ok := sepVal.(evaluator.A0String); ok {
			sep = s.Value
		} else if _, ok := sepVal.(evaluator.A0Null); !ok {
			return nil, fmt.Errorf("join: 'sep' must be a string")
		}
	}

	parts := make([]string, len(list.Items))
	for i, item := range list.Items {
		parts[i] = valueToString(item)
	}
	return evaluator.NewString(strings.Join(parts, sep)), nil
}

func valueToString(v evaluator.A0Value) string {
	switch val := v.(type) {
	case evaluator.A0Null:
		return "null"
	case evaluator.A0Bool:
		if val.Value {
			return "true"
		}
		return "false"
	case evaluator.A0Number:
		return evaluator.FormatNumber(val.Value)
	case evaluator.A0String:
		return val.Value
	default:
		b, _ := json.Marshal(evaluator.ValueToJSONString(v))
		// Strip quotes from the JSON-marshaled string
		var s string
		if err := json.Unmarshal(b, &s); err == nil {
			return s
		}
		return evaluator.ValueToJSONString(v)
	}
}

// unique { in: list } → list
func stdlibUnique(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	list, ok := input.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("unique: 'in' must be a list")
	}

	var result []evaluator.A0Value
	for _, item := range list.Items {
		found := false
		for _, existing := range result {
			if evaluator.DeepEqual(existing, item) {
				found = true
				break
			}
		}
		if !found {
			result = append(result, item)
		}
	}
	return evaluator.NewList(result), nil
}

// pluck { in: list, key: string } → list
func stdlibPluck(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	keyVal, _ := args.Get("key")

	list, ok := input.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("pluck: 'in' must be a list")
	}
	keyStr, ok := keyVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("pluck: 'key' must be a string")
	}

	result := make([]evaluator.A0Value, len(list.Items))
	for i, item := range list.Items {
		if rec, ok := item.(evaluator.A0Record); ok {
			val, found := rec.Get(keyStr.Value)
			if found {
				result[i] = val
			} else {
				result[i] = evaluator.NewNull()
			}
		} else {
			result[i] = evaluator.NewNull()
		}
	}
	return evaluator.NewList(result), nil
}

// flat { in: list } → list
func stdlibFlat(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	list, ok := input.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("flat: 'in' must be a list")
	}

	var result []evaluator.A0Value
	for _, item := range list.Items {
		if subList, ok := item.(evaluator.A0List); ok {
			result = append(result, subList.Items...)
		} else {
			result = append(result, item)
		}
	}
	return evaluator.NewList(result), nil
}
