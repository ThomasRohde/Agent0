package tools

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/thomasrohde/agent0/go/pkg/evaluator"
)

func httpGetTool() Def {
	return Def{
		Name:         "http.get",
		Mode:         "read",
		CapabilityID: "http.get",
		Execute: func(ctx context.Context, args *evaluator.A0Record) (evaluator.A0Value, error) {
			urlVal, _ := args.Get("url")
			urlStr, ok := urlVal.(evaluator.A0String)
			if !ok {
				return nil, fmt.Errorf("http.get requires a 'url' argument of type string")
			}

			// Handle data: URLs
			if strings.HasPrefix(urlStr.Value, "data:") {
				return handleDataURL(urlStr.Value)
			}

			// Build headers
			headers := make(map[string]string)
			if hdrsVal, found := args.Get("headers"); found {
				if hdrsRec, ok := hdrsVal.(evaluator.A0Record); ok {
					for _, kv := range hdrsRec.Pairs {
						if s, ok := kv.Value.(evaluator.A0String); ok {
							headers[kv.Key] = s.Value
						}
					}
				}
			}

			req, err := http.NewRequestWithContext(ctx, "GET", urlStr.Value, nil)
			if err != nil {
				return nil, fmt.Errorf("http.get: %s", err)
			}

			for k, v := range headers {
				req.Header.Set(k, v)
			}

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return nil, fmt.Errorf("http.get: %s", err)
			}
			defer resp.Body.Close()

			body, err := io.ReadAll(resp.Body)
			if err != nil {
				return nil, fmt.Errorf("http.get: %s", err)
			}

			// Build response headers record
			respHeaders := make([]evaluator.KeyValue, 0)
			for k, vs := range resp.Header {
				respHeaders = append(respHeaders, evaluator.KeyValue{
					Key:   strings.ToLower(k),
					Value: evaluator.NewString(strings.Join(vs, ", ")),
				})
			}

			return evaluator.NewRecord([]evaluator.KeyValue{
				{Key: "status", Value: evaluator.NewNumber(float64(resp.StatusCode))},
				{Key: "headers", Value: evaluator.NewRecord(respHeaders)},
				{Key: "body", Value: evaluator.NewString(string(body))},
			}), nil
		},
	}
}

func handleDataURL(dataURL string) (evaluator.A0Value, error) {
	// Parse data:text/plain;charset=utf-8,Hello%20World
	// or data:application/json,{"key":"value"}
	rest := dataURL[5:] // skip "data:"

	commaIdx := strings.Index(rest, ",")
	if commaIdx < 0 {
		return nil, fmt.Errorf("http.get: invalid data URL")
	}

	body := rest[commaIdx+1:]
	// URL-decode
	decoded, err := url.PathUnescape(body)
	if err != nil {
		decoded = body
	}

	return evaluator.NewRecord([]evaluator.KeyValue{
		{Key: "status", Value: evaluator.NewNumber(200)},
		{Key: "headers", Value: evaluator.NewRecord(nil)},
		{Key: "body", Value: evaluator.NewString(decoded)},
	}), nil
}
