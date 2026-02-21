//go:build windows

package evaluator

import (
	"syscall"
	"unsafe"
)

var (
	kernel32DLL = syscall.NewLazyDLL("kernel32.dll")
	qpcProc     = kernel32DLL.NewProc("QueryPerformanceCounter")
	qpfProc     = kernel32DLL.NewProc("QueryPerformanceFrequency")
	qpcFreq     int64
)

func init() {
	qpfProc.Call(uintptr(unsafe.Pointer(&qpcFreq)))
}

// hiresNow returns a high-resolution monotonic timestamp (QPC count).
func hiresNow() int64 {
	var count int64
	qpcProc.Call(uintptr(unsafe.Pointer(&count)))
	return count
}

// hiresSinceMs returns the elapsed milliseconds since startCount using QPC.
func hiresSinceMs(startCount int64) int64 {
	var count int64
	qpcProc.Call(uintptr(unsafe.Pointer(&count)))
	return (count - startCount) * 1000 / qpcFreq
}
