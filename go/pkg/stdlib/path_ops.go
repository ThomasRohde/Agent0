package stdlib

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// parsePath splits "foo.bar[0].baz" into segments of string or int
type pathSegment struct {
	key   string
	index int
	isIdx bool
}

func parsePath(pathStr string) []pathSegment {
	if pathStr == "" {
		return nil
	}

	var segments []pathSegment
	// Split on dots first, then handle bracket notation
	parts := strings.Split(pathStr, ".")
	for _, part := range parts {
		if part == "" {
			continue
		}
		// Check for bracket notation: "foo[0]" or just "[0]"
		for len(part) > 0 {
			bracketIdx := strings.Index(part, "[")
			if bracketIdx < 0 {
				// No brackets, just a key
				segments = append(segments, pathSegment{key: part})
				break
			}
			if bracketIdx > 0 {
				// Key before bracket
				segments = append(segments, pathSegment{key: part[:bracketIdx]})
			}
			// Find closing bracket
			closeIdx := strings.Index(part[bracketIdx:], "]")
			if closeIdx < 0 {
				// No closing bracket, treat rest as key
				segments = append(segments, pathSegment{key: part[bracketIdx:]})
				part = ""
				break
			}
			indexStr := part[bracketIdx+1 : bracketIdx+closeIdx]
			if idx, err := strconv.Atoi(indexStr); err == nil {
				segments = append(segments, pathSegment{index: idx, isIdx: true})
			} else {
				segments = append(segments, pathSegment{key: indexStr})
			}
			part = part[bracketIdx+closeIdx+1:]
		}
	}
	return segments
}

func getByPath(obj evaluator.A0Value, segments []pathSegment) evaluator.A0Value {
	current := obj
	for _, seg := range segments {
		if current == nil {
			return evaluator.NewNull()
		}
		if _, isNull := current.(evaluator.A0Null); isNull {
			return evaluator.NewNull()
		}

		if seg.isIdx {
			list, ok := current.(evaluator.A0List)
			if !ok {
				return evaluator.NewNull()
			}
			if seg.index < 0 || seg.index >= len(list.Items) {
				return evaluator.NewNull()
			}
			current = list.Items[seg.index]
		} else {
			rec, ok := current.(evaluator.A0Record)
			if !ok {
				return evaluator.NewNull()
			}
			val, found := rec.Get(seg.key)
			if !found {
				return evaluator.NewNull()
			}
			current = val
		}
	}
	return current
}

func putByPath(obj evaluator.A0Value, segments []pathSegment, value evaluator.A0Value) evaluator.A0Value {
	if len(segments) == 0 {
		return value
	}

	seg := segments[0]
	rest := segments[1:]

	if seg.isIdx {
		var items []evaluator.A0Value
		if list, ok := obj.(evaluator.A0List); ok {
			items = make([]evaluator.A0Value, len(list.Items))
			copy(items, list.Items)
		}
		// Extend if needed
		for len(items) <= seg.index {
			items = append(items, evaluator.NewNull())
		}
		items[seg.index] = putByPath(items[seg.index], rest, value)
		return evaluator.NewList(items)
	}

	// Record path
	result := &evaluator.A0Record{}
	if rec, ok := obj.(evaluator.A0Record); ok {
		result.Pairs = make([]evaluator.KeyValue, len(rec.Pairs))
		copy(result.Pairs, rec.Pairs)
	}

	existing, found := result.Get(seg.key)
	if !found {
		existing = evaluator.NewNull()
	}
	result.Set(seg.key, putByPath(existing, rest, value))
	return *result
}

// get { in: any, path: string } → any
func stdlibGet(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	pathVal, _ := args.Get("path")

	pathStr, ok := pathVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("get requires 'path' to be a string")
	}

	if input == nil {
		input = evaluator.NewNull()
	}

	segments := parsePath(pathStr.Value)
	return getByPath(input, segments), nil
}

// put { in: any, path: string, value: any } → any
func stdlibPut(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	pathVal, _ := args.Get("path")
	value, _ := args.Get("value")

	pathStr, ok := pathVal.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("put requires 'path' to be a string")
	}

	if input == nil {
		input = evaluator.NewNull()
	}
	if value == nil {
		value = evaluator.NewNull()
	}

	segments := parsePath(pathStr.Value)
	return putByPath(input, segments, value), nil
}
