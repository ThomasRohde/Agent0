package stdlib

import (
	"encoding/json"
	"fmt"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

// parse.json { in: string } → any
func stdlibParseJSON(args *evaluator.A0Record) (evaluator.A0Value, error) {
	input, _ := args.Get("in")
	inStr, ok := input.(evaluator.A0String)
	if !ok {
		return nil, fmt.Errorf("parse.json requires 'in' to be a string")
	}

	result, err := evaluator.ParseJSONToValue(json.RawMessage(inStr.Value))
	if err != nil {
		return nil, fmt.Errorf("%s", err.Error())
	}
	return result, nil
}
