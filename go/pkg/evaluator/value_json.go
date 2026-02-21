package evaluator

import (
	"encoding/json"
	"math"
	"strconv"
)

// ValueToJSON marshals an A0Value to JSON bytes.
// Records preserve key order. Numbers output integers without decimal point.
func ValueToJSON(v A0Value) ([]byte, error) {
	raw := valueToRaw(v)
	return json.Marshal(raw)
}

func valueToRaw(v A0Value) any {
	if v == nil {
		return nil
	}

	switch val := v.(type) {
	case A0Null:
		return nil

	case A0Bool:
		return val.Value

	case A0Number:
		// Output integers without decimal point
		if val.Value == math.Trunc(val.Value) && !math.IsInf(val.Value, 0) && !math.IsNaN(val.Value) {
			if val.Value >= math.MinInt64 && val.Value <= math.MaxInt64 {
				return int64(val.Value)
			}
		}
		return val.Value

	case A0String:
		return val.Value

	case A0List:
		items := make([]any, len(val.Items))
		for i, item := range val.Items {
			items[i] = valueToRaw(item)
		}
		return items

	case A0Record:
		return &orderedRecord{pairs: val.Pairs}
	}

	return nil
}

// orderedRecord preserves key order in JSON output.
type orderedRecord struct {
	pairs []KeyValue
}

func (o *orderedRecord) MarshalJSON() ([]byte, error) {
	if len(o.pairs) == 0 {
		return []byte("{}"), nil
	}

	buf := []byte{'{'}
	for i, kv := range o.pairs {
		if i > 0 {
			buf = append(buf, ',')
		}
		// Key
		keyBytes, err := json.Marshal(kv.Key)
		if err != nil {
			return nil, err
		}
		buf = append(buf, keyBytes...)
		buf = append(buf, ':')

		// Value
		raw := valueToRaw(kv.Value)
		valBytes, err := json.Marshal(raw)
		if err != nil {
			return nil, err
		}
		buf = append(buf, valBytes...)
	}
	buf = append(buf, '}')
	return buf, nil
}

// ValueToJSONString is a convenience that returns a string.
func ValueToJSONString(v A0Value) string {
	b, err := ValueToJSON(v)
	if err != nil {
		return "null"
	}
	return string(b)
}

type evidenceSpanJSON struct {
	File      string `json:"file"`
	StartLine int    `json:"startLine"`
	StartCol  int    `json:"startCol"`
	EndLine   int    `json:"endLine"`
	EndCol    int    `json:"endCol"`
}

type evidenceJSON struct {
	Kind string            `json:"kind"`
	OK   bool              `json:"ok"`
	Msg  string            `json:"msg"`
	Span *evidenceSpanJSON `json:"span,omitempty"`
}

// EvidenceToJSON marshals a slice of Evidence to JSON bytes.
func EvidenceToJSON(evidence []Evidence) ([]byte, error) {
	items := make([]evidenceJSON, len(evidence))
	for i, ev := range evidence {
		item := evidenceJSON{
			Kind: ev.Kind,
			OK:   ev.OK,
			Msg:  ev.Msg,
		}
		if ev.Span != nil {
			item.Span = &evidenceSpanJSON{
				File:      ev.Span.File,
				StartLine: ev.Span.StartLine,
				StartCol:  ev.Span.StartCol,
				EndLine:   ev.Span.EndLine,
				EndCol:    ev.Span.EndCol,
			}
		}
		items[i] = item
	}
	return json.Marshal(items)
}

// ParseJSONToValue converts a JSON value to an A0Value.
func ParseJSONToValue(data json.RawMessage) (A0Value, error) {
	var raw any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	return anyToValue(raw), nil
}

func anyToValue(v any) A0Value {
	if v == nil {
		return NewNull()
	}
	switch val := v.(type) {
	case bool:
		return NewBool(val)
	case float64:
		return NewNumber(val)
	case string:
		return NewString(val)
	case json.Number:
		if f, err := val.Float64(); err == nil {
			return NewNumber(f)
		}
		return NewNull()
	case []any:
		items := make([]A0Value, len(val))
		for i, item := range val {
			items[i] = anyToValue(item)
		}
		return NewList(items)
	case map[string]any:
		pairs := make([]KeyValue, 0, len(val))
		for k, v := range val {
			pairs = append(pairs, KeyValue{Key: k, Value: anyToValue(v)})
		}
		return NewRecord(pairs)
	}
	return NewNull()
}

// FormatNumber formats a float64 as an integer string if it's a whole number.
func FormatNumber(n float64) string {
	if n == math.Trunc(n) && !math.IsInf(n, 0) && !math.IsNaN(n) {
		return strconv.FormatInt(int64(n), 10)
	}
	return strconv.FormatFloat(n, 'f', -1, 64)
}
