package main

// Tools that run inside the app as WebAssembly (pandoc, pandoc.go): wazero,
// which is Go, so there's nothing more to install or sign, and a run sees one
// folder it's given and nothing else of the Mac (no network, no other files).
// Compiling a module to the Mac's own code takes seconds, so it's done the
// first time a tool is wanted and kept until hosting stops; the compiled code
// is also written to ~/Library/Caches/Mouse Party/wasm (the program alone,
// named by its hash: nothing of what it reads), so the next session starts it
// in under a second.

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/experimental"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
	"github.com/tetratelabs/wazero/sys"
)

const wasmMemoryPages = 32768 // 2 GB, at most, for any one run

// wasmCacheDir: where compiled modules are kept between sessions ("" for none)
var wasmCacheDir = func() string {
	d, err := os.UserCacheDir()
	if err != nil {
		return ""
	}
	return filepath.Join(d, "Mouse Party", "wasm")
}

// findWasm: a tool's module, in the app (Contents/Resources/wasm) or, building
// and testing, where its fetch script put it (build/<name>/<name>.wasm)
func findWasm(name string) string {
	for _, p := range []string{
		filepath.Join(bundledBin(), "..", "wasm", name+".wasm"),
		filepath.Join("build", name, name+".wasm"),
	} {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

type wasmTool struct {
	name, path string
	mu         sync.Mutex
	rt         wazero.Runtime
	mod        wazero.CompiledModule
}

func newWasmTool(name string) *wasmTool { return &wasmTool{name: name, path: findWasm(name)} }

func (t *wasmTool) ok() bool { return t != nil && t.path != "" }

// compiled: the module, compiled the first time it's asked for
func (t *wasmTool) compiled(ctx context.Context) (wazero.Runtime, wazero.CompiledModule, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.mod != nil {
		return t.rt, t.mod, nil
	}
	if t.path == "" {
		return nil, nil, fmt.Errorf("%s isn't in this build", t.name)
	}
	b, err := os.ReadFile(t.path)
	if err != nil {
		return nil, nil, err
	}
	cfg := wazero.NewRuntimeConfig().
		WithCoreFeatures(api.CoreFeaturesV2 | experimental.CoreFeaturesExceptionHandling). // pandoc's GHC uses exceptions
		WithMemoryLimitPages(wasmMemoryPages).
		WithCloseOnContextDone(true) // a run past its time is stopped
	if dir := wasmCacheDir(); dir != "" {
		if cache, err := wazero.NewCompilationCacheWithDir(dir); err == nil {
			cfg = cfg.WithCompilationCache(cache)
		}
	}
	rt := wazero.NewRuntimeWithConfig(context.Background(), cfg)
	wasi_snapshot_preview1.MustInstantiate(context.Background(), rt)
	mod, err := rt.CompileModule(ctx, b)
	if err != nil {
		rt.Close(context.Background())
		return nil, nil, err
	}
	t.rt, t.mod = rt, mod
	return rt, mod, nil
}

// run: the tool with these arguments, seeing dir as "/" and nothing else
func (t *wasmTool) run(ctx context.Context, dir string, stdout, stderr io.Writer, args ...string) error {
	rt, mod, err := t.compiled(ctx)
	if err != nil {
		return err
	}
	cfg := wazero.NewModuleConfig().
		WithName(""). // several at once, unnamed
		WithArgs(append([]string{t.name}, args...)...).
		WithStdout(stdout).
		WithStderr(stderr).
		WithFSConfig(wazero.NewFSConfig().WithDirMount(dir, "/"))
	m, err := rt.InstantiateModule(ctx, mod, cfg)
	if m != nil {
		m.Close(context.Background())
	}
	var exit *sys.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == 0 {
		return nil
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return err
}

// close lets go of the compiled module (it's compiled again when next wanted)
func (t *wasmTool) close() {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.rt != nil {
		t.rt.Close(context.Background())
	}
	t.rt, t.mod = nil, nil
}
