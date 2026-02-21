package stdlib

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// patch { in: any, ops: list } → any (RFC 6902 JSON Patch)
func stdlibPatch(args *evaluator.A0Record) (evaluator.A0Value, error) {
	doc, _ := args.Get("in")
	opsVal, _ := args.Get("ops")
	if doc == nil {
		doc = evaluator.NewNull()
	}

	opsList, ok := opsVal.(evaluator.A0List)
	if !ok {
		return nil, fmt.Errorf("patch requires 'ops' to be a list")
	}

	var err error
	for i, opItem := range opsList.Items {
		opRec, ok := opItem.(evaluator.A0Record)
		if !ok {
			return nil, fmt.Errorf("invalid op at index %d", i)
		}
		doc, err = applyPatchOp(doc, &opRec)
		if err != nil {
			return nil, err
		}
	}
	return doc, nil
}

func applyPatchOp(doc evaluator.A0Value, op *evaluator.A0Record) (evaluator.A0Value, error) {
	opVal, _ := op.Get("op")
	pathVal, _ := op.Get("path")

	opStr, ok := opVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("patch op requires an 'op' string")
	}
	pathStr, ok := pathVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("patch op requires a 'path' string")
	}

	segments := parseJSONPointer(pathStr.Value)

	switch opStr.Value {
	case "add":
		value, _ := op.Get("value")
		if value == nil {
			value = evaluator.NewNull()
		}
		return setAtPointer(doc, segments, value, "add", pathStr.Value)

	case "remove":
		return removeAtPointer(doc, segments, pathStr.Value)

	case "replace":
		value, _ := op.Get("value")
		if value == nil {
			value = evaluator.NewNull()
		}
		return setAtPointer(doc, segments, value, "replace", pathStr.Value)

	case "move":
		fromVal, _ := op.Get("from")
		fromStr, ok := fromVal.(evaluator.A0String)
		if !ok {
			return nil, fmt.Errorf("move op requires a 'from' string")
		}
		fromSegs := parseJSONPointer(fromStr.Value)
		val, found := getAtPointer(doc, fromSegs)
		if !found {
			return nil, fmt.Errorf("Path '%s' does not exist for op 'move'.", fromStr.Value)
		}
		doc, err := removeAtPointer(doc, fromSegs, fromStr.Value)
		if err != nil {
			return nil, err
		}
		return setAtPointer(doc, segments, cloneValue(val), "add", pathStr.Value)

	case "copy":
		fromVal, _ := op.Get("from")
		fromStr, ok := fromVal.(evaluator.A0String)
		if !ok {
			return nil, fmt.Errorf("copy op requires a 'from' string")
		}
		fromSegs := parseJSONPointer(fromStr.Value)
		val, found := getAtPointer(doc, fromSegs)
		if !found {
			return nil, fmt.Errorf("Path '%s' does not exist for op 'copy'.", fromStr.Value)
		}
		return setAtPointer(doc, segments, cloneValue(val), "add", pathStr.Value)

	case "test":
		value, _ := op.Get("value")
		if value == nil {
			value = evaluator.NewNull()
		}
		actual, found := getAtPointer(doc, segments)
		if !found {
			return nil, fmt.Errorf("Test failed at '%s': path does not exist.", pathStr.Value)
		}
		if !evaluator.DeepEqual(actual, value) {
			return nil, fmt.Errorf("Test failed at '%s': expected %s, got %s",
				pathStr.Value,
				evaluator.ValueToJSONString(value),
				evaluator.ValueToJSONString(actual))
		}
		return doc, nil

	default:
		return nil, fmt.Errorf("Unknown patch op '%s'.", opStr.Value)
	}
}

func parseJSONPointer(pointer string) []string {
	if pointer == "" {
		return nil
	}
	if !strings.HasPrefix(pointer, "/") {
		return []string{pointer}
	}
	parts := strings.Split(pointer[1:], "/")
	for i, p := range parts {
		p = strings.ReplaceAll(p, "~1", "/")
		p = strings.ReplaceAll(p, "~0", "~")
		parts[i] = p
	}
	return parts
}

func getAtPointer(doc evaluator.A0Value, segments []string) (evaluator.A0Value, bool) {
	current := doc
	for _, seg := range segments {
		if current == nil {
			return nil, false
		}
		if _, isNull := current.(evaluator.A0Null); isNull {
			return nil, false
		}

		switch v := current.(type) {
		case evaluator.A0List:
			idx, err := strconv.Atoi(seg)
			if err != nil || idx < 0 || idx >= len(v.Items) {
				return nil, false
			}
			current = v.Items[idx]
		case evaluator.A0Record:
			val, found := v.Get(seg)
			if !found {
				return nil, false
			}
			current = val
		default:
			return nil, false
		}
	}
	return current, true
}

func setAtPointer(doc evaluator.A0Value, segments []string, value evaluator.A0Value, mode string, pointer string) (evaluator.A0Value, error) {
	if len(segments) == 0 {
		return value, nil
	}

	head := segments[0]
	rest := segments[1:]

	switch v := doc.(type) {
	case evaluator.A0List:
		items := make([]evaluator.A0Value, len(v.Items))
		copy(items, v.Items)

		if len(rest) == 0 {
			idx, err := parseArrayIdx(head, len(items), mode == "add", pointer, mode)
			if err != nil {
				return nil, err
			}
			if mode == "replace" {
				items[idx] = value
			} else {
				// Insert at index
				items = append(items, evaluator.NewNull())
				copy(items[idx+1:], items[idx:])
				items[idx] = value
			}
		} else {
			idx, err := parseArrayIdx(head, len(items), false, pointer, mode)
			if err != nil {
				return nil, err
			}
			items[idx], err = setAtPointer(items[idx], rest, value, mode, pointer)
			if err != nil {
				return nil, err
			}
		}
		return evaluator.NewList(items), nil

	case evaluator.A0Record:
		result := &evaluator.A0Record{Pairs: make([]evaluator.KeyValue, len(v.Pairs))}
		copy(result.Pairs, v.Pairs)

		if len(rest) == 0 {
			if mode == "replace" {
				_, found := result.Get(head)
				if !found {
					return nil, fmt.Errorf("Path '%s' does not exist for op 'replace'.", pointer)
				}
			}
			result.Set(head, value)
		} else {
			existing, found := result.Get(head)
			if !found {
				return nil, fmt.Errorf("Path '%s' does not exist for op '%s'.", pointer, mode)
			}
			newVal, err := setAtPointer(existing, rest, value, mode, pointer)
			if err != nil {
				return nil, err
			}
			result.Set(head, newVal)
		}
		return *result, nil
	}

	return nil, fmt.Errorf("Path '%s' does not exist for op '%s'.", pointer, mode)
}

func removeAtPointer(doc evaluator.A0Value, segments []string, pointer string) (evaluator.A0Value, error) {
	if len(segments) == 0 {
		return evaluator.NewNull(), nil
	}

	head := segments[0]
	rest := segments[1:]

	if len(rest) == 0 {
		switch v := doc.(type) {
		case evaluator.A0List:
			idx, err := parseArrayIdx(head, len(v.Items), false, pointer, "remove")
			if err != nil {
				return nil, err
			}
			items := make([]evaluator.A0Value, 0, len(v.Items)-1)
			items = append(items, v.Items[:idx]...)
			items = append(items, v.Items[idx+1:]...)
			return evaluator.NewList(items), nil

		case evaluator.A0Record:
			_, found := v.Get(head)
			if !found {
				return nil, fmt.Errorf("Path '%s' does not exist for op 'remove'.", pointer)
			}
			result := &evaluator.A0Record{}
			for _, kv := range v.Pairs {
				if kv.Key != head {
					result.Pairs = append(result.Pairs, kv)
				}
			}
			return *result, nil
		}
		return nil, fmt.Errorf("Path '%s' does not exist for op 'remove'.", pointer)
	}

	switch v := doc.(type) {
	case evaluator.A0List:
		idx, err := parseArrayIdx(head, len(v.Items), false, pointer, "remove")
		if err != nil {
			return nil, err
		}
		items := make([]evaluator.A0Value, len(v.Items))
		copy(items, v.Items)
		items[idx], err = removeAtPointer(items[idx], rest, pointer)
		if err != nil {
			return nil, err
		}
		return evaluator.NewList(items), nil

	case evaluator.A0Record:
		_, found := v.Get(head)
		if !found {
			return nil, fmt.Errorf("Path '%s' does not exist for op 'remove'.", pointer)
		}
		result := &evaluator.A0Record{Pairs: make([]evaluator.KeyValue, len(v.Pairs))}
		copy(result.Pairs, v.Pairs)
		existing, _ := result.Get(head)
		newVal, err := removeAtPointer(existing, rest, pointer)
		if err != nil {
			return nil, err
		}
		result.Set(head, newVal)
		return *result, nil
	}

	return nil, fmt.Errorf("Path '%s' does not exist for op 'remove'.", pointer)
}

func parseArrayIdx(segment string, length int, allowAppend bool, pointer string, op string) (int, error) {
	if segment == "-" {
		if allowAppend {
			return length, nil
		}
		return 0, fmt.Errorf("Invalid array index '-' at '%s' for op '%s'.", pointer, op)
	}

	idx, err := strconv.Atoi(segment)
	if err != nil {
		return 0, fmt.Errorf("Invalid array index '%s' at '%s' for op '%s'.", segment, pointer, op)
	}

	if allowAppend {
		if idx < 0 || idx > length {
			return 0, fmt.Errorf("Array index '%s' out of bounds at '%s' for op '%s'.", segment, pointer, op)
		}
	} else {
		if idx < 0 || idx >= length {
			return 0, fmt.Errorf("Array index '%s' out of bounds at '%s' for op '%s'.", segment, pointer, op)
		}
	}
	return idx, nil
}

func cloneValue(v evaluator.A0Value) evaluator.A0Value {
	if v == nil {
		return evaluator.NewNull()
	}
	switch val := v.(type) {
	case evaluator.A0List:
		items := make([]evaluator.A0Value, len(val.Items))
		for i, item := range val.Items {
			items[i] = cloneValue(item)
		}
		return evaluator.NewList(items)
	case evaluator.A0Record:
		pairs := make([]evaluator.KeyValue, len(val.Pairs))
		for i, kv := range val.Pairs {
			pairs[i] = evaluator.KeyValue{Key: kv.Key, Value: cloneValue(kv.Value)}
		}
		return evaluator.NewRecord(pairs)
	default:
		return v // primitives are immutable
	}
}
