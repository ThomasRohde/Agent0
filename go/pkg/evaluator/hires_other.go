//go:build !windows

package evaluator

import "time"

var hiresEpoch = time.Now()

// hiresNow returns a high-resolution monotonic timestamp in nanoseconds.
func hiresNow() int64 {
	return time.Since(hiresEpoch).Nanoseconds()
}

// hiresSinceMs returns the elapsed milliseconds since startNano.
func hiresSinceMs(startNano int64) int64 {
	return (hiresNow() - startNano) / 1_000_000
}
