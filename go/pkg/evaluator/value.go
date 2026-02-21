// Package evaluator implements the A0 runtime evaluator.
package evaluator

// A0Value is the interface for all A0 runtime values.
// Use the sealed marker method to restrict implementations to this package.
type A0Value interface {
	a0value() // sealed marker
}

// A0Null represents a null value.
type A0Null struct{}

func (A0Null) a0value() {}

// A0Bool represents a boolean value.
type A0Bool struct {
	Value bool
}

func (A0Bool) a0value() {}

// A0Number represents a numeric value (int or float).
type A0Number struct {
	Value float64
}

func (A0Number) a0value() {}

// A0String represents a string value.
type A0String struct {
	Value string
}

func (A0String) a0value() {}

// A0List represents an ordered list of values.
type A0List struct {
	Items []A0Value
}

func (A0List) a0value() {}

// KeyValue is a key-value pair in an ordered record.
type KeyValue struct {
	Key   string
	Value A0Value
}

// A0Record represents an ordered map of string keys to values.
// Insertion order is preserved via the Pairs slice.
type A0Record struct {
	Pairs []KeyValue
	index map[string]int // lazy index for lookups
}

func (A0Record) a0value() {}

// NewNull creates a null value.
func NewNull() A0Value {
	return A0Null{}
}

// NewBool creates a boolean value.
func NewBool(b bool) A0Value {
	return A0Bool{Value: b}
}

// NewNumber creates a numeric value.
func NewNumber(n float64) A0Value {
	return A0Number{Value: n}
}

// NewString creates a string value.
func NewString(s string) A0Value {
	return A0String{Value: s}
}

// NewList creates a list value.
func NewList(items []A0Value) A0Value {
	return A0List{Items: items}
}

// NewRecord creates a record value from key-value pairs.
func NewRecord(pairs []KeyValue) A0Value {
	idx := make(map[string]int, len(pairs))
	for i, kv := range pairs {
		idx[kv.Key] = i
	}
	return A0Record{Pairs: pairs, index: idx}
}

// Get retrieves a value by key from the record.
func (r *A0Record) Get(key string) (A0Value, bool) {
	if r.index == nil {
		r.index = make(map[string]int, len(r.Pairs))
		for i, kv := range r.Pairs {
			r.index[kv.Key] = i
		}
	}
	i, ok := r.index[key]
	if !ok {
		return nil, false
	}
	return r.Pairs[i].Value, true
}

// Set sets a value by key in the record, preserving insertion order.
func (r *A0Record) Set(key string, val A0Value) {
	if r.index == nil {
		r.index = make(map[string]int, len(r.Pairs))
		for i, kv := range r.Pairs {
			r.index[kv.Key] = i
		}
	}
	if i, ok := r.index[key]; ok {
		r.Pairs[i].Value = val
		return
	}
	r.index[key] = len(r.Pairs)
	r.Pairs = append(r.Pairs, KeyValue{Key: key, Value: val})
}

// Keys returns all keys in insertion order.
func (r *A0Record) Keys() []string {
	keys := make([]string, len(r.Pairs))
	for i, kv := range r.Pairs {
		keys[i] = kv.Key
	}
	return keys
}

// Truthiness returns the boolean interpretation of an A0 value.
// null, false, 0, and "" are falsy; everything else is truthy.
func Truthiness(v A0Value) bool {
	switch val := v.(type) {
	case A0Null:
		return false
	case A0Bool:
		return val.Value
	case A0Number:
		return val.Value != 0
	case A0String:
		return val.Value != ""
	default:
		return true
	}
}
