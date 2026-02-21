package tools

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

func fsReadTool() Def {
	return Def{
		Name:         "fs.read",
		Mode:         "read",
		CapabilityID: "fs.read",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			pathVal, _ := args.Get("path")
			pathStr, ok := pathVal.(evaluator.A0String)
			if !ok {
				return nil, fmt.Errorf("fs.read requires a 'path' argument of type string")
			}

			resolved, err := filepath.Abs(pathStr.Value)
			if err != nil {
				return nil, fmt.Errorf("fs.read: invalid path: %s", err)
			}

			data, err := os.ReadFile(resolved)
			if err != nil {
				return nil, fmt.Errorf("fs.read: %s", err)
			}

			return evaluator.NewString(string(data)), nil
		},
	}
}

func fsWriteTool() Def {
	return Def{
		Name:         "fs.write",
		Mode:         "effect",
		CapabilityID: "fs.write",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			pathVal, _ := args.Get("path")
			pathStr, ok := pathVal.(evaluator.A0String)
			if !ok {
				return nil, fmt.Errorf("fs.write requires a 'path' argument of type string")
			}

			formatVal, _ := args.Get("format")
			format := "raw"
			if fs, ok := formatVal.(evaluator.A0String); ok {
				format = fs.Value
			}

			dataVal, _ := args.Get("data")
			if dataVal == nil {
				dataVal = evaluator.NewNull()
			}

			var content string
			if format == "json" {
				// Pretty print JSON with 2-space indent
				jsonBytes, err := evaluator.ValueToJSON(dataVal)
				if err != nil {
					return nil, fmt.Errorf("fs.write: failed to serialize data: %s", err)
				}
				// Re-format with indentation
				var raw any
				if err := json.Unmarshal(jsonBytes, &raw); err != nil {
					content = string(jsonBytes)
				} else {
					pretty, err := json.MarshalIndent(raw, "", "  ")
					if err != nil {
						content = string(jsonBytes)
					} else {
						content = string(pretty)
					}
				}
			} else if str, ok := dataVal.(evaluator.A0String); ok {
				content = str.Value
			} else {
				jsonBytes, err := evaluator.ValueToJSON(dataVal)
				if err != nil {
					return nil, fmt.Errorf("fs.write: failed to serialize data: %s", err)
				}
				content = string(jsonBytes)
			}

			resolved, err := filepath.Abs(pathStr.Value)
			if err != nil {
				return nil, fmt.Errorf("fs.write: invalid path: %s", err)
			}

			// Create parent directories
			dir := filepath.Dir(resolved)
			if err := os.MkdirAll(dir, 0755); err != nil {
				return nil, fmt.Errorf("fs.write: cannot create directory: %s", err)
			}

			if err := os.WriteFile(resolved, []byte(content), 0644); err != nil {
				return nil, fmt.Errorf("fs.write: %s", err)
			}

			// Compute SHA256
			hash := sha256.Sum256([]byte(content))
			sha256Hex := fmt.Sprintf("%x", hash)

			return evaluator.NewRecord([]evaluator.KeyValue{
				{Key: "kind", Value: evaluator.NewString("file")},
				{Key: "path", Value: evaluator.NewString(resolved)},
				{Key: "bytes", Value: evaluator.NewNumber(float64(len([]byte(content))))},
				{Key: "sha256", Value: evaluator.NewString(sha256Hex)},
			}), nil
		},
	}
}

func fsListTool() Def {
	return Def{
		Name:         "fs.list",
		Mode:         "read",
		CapabilityID: "fs.read",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			pathVal, _ := args.Get("path")
			pathStr, ok := pathVal.(evaluator.A0String)
			if !ok {
				return nil, fmt.Errorf("fs.list requires a 'path' argument of type string")
			}

			resolved, err := filepath.Abs(pathStr.Value)
			if err != nil {
				return nil, fmt.Errorf("fs.list: invalid path: %s", err)
			}

			entries, err := os.ReadDir(resolved)
			if err != nil {
				return nil, fmt.Errorf("fs.list: %s", err)
			}

			items := make([]evaluator.A0Value, len(entries))
			for i, entry := range entries {
				entryType := "other"
				if entry.IsDir() {
					entryType = "directory"
				} else if entry.Type().IsRegular() {
					entryType = "file"
				}
				items[i] = evaluator.NewRecord([]evaluator.KeyValue{
					{Key: "name", Value: evaluator.NewString(entry.Name())},
					{Key: "type", Value: evaluator.NewString(entryType)},
				})
			}
			return evaluator.NewList(items), nil
		},
	}
}

func fsExistsTool() Def {
	return Def{
		Name:         "fs.exists",
		Mode:         "read",
		CapabilityID: "fs.read",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			pathVal, _ := args.Get("path")
			pathStr, ok := pathVal.(evaluator.A0String)
			if !ok {
				return nil, fmt.Errorf("fs.exists requires a 'path' argument of type string")
			}

			resolved, err := filepath.Abs(pathStr.Value)
			if err != nil {
				return evaluator.NewBool(false), nil
			}

			_, err = os.Stat(resolved)
			return evaluator.NewBool(err == nil), nil
		},
	}
}
