package main

import (
	"bytes"
	"net/http"
	"strings"
	"sync"
	"time"
)

type cacheEntry struct {
	status  int
	header  http.Header
	body    []byte
	expires time.Time
}

type responseCache struct {
	mu      sync.Mutex
	entries map[string]cacheEntry
	ttl     time.Duration
}

func newResponseCache(ttl time.Duration) *responseCache {
	return &responseCache{
		entries: make(map[string]cacheEntry),
		ttl:     ttl,
	}
}

func (c *responseCache) get(key string) (cacheEntry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[key]
	if !ok {
		return cacheEntry{}, false
	}
	if time.Now().After(e.expires) {
		delete(c.entries, key)
		return cacheEntry{}, false
	}
	return e, true
}

func (c *responseCache) set(key string, e cacheEntry) {
	e.expires = time.Now().Add(c.ttl)
	c.mu.Lock()
	c.entries[key] = e
	c.mu.Unlock()
}

// cacheCapture tees a cacheable response into a buffer while passing it through
// to the client. Cacheability is decided on the first WriteHeader (200 +
// non-streaming Content-Type), so SSE responses are never buffered and flushes
// pass straight through — keeping the proxy's FlushInterval = -1 behaviour.
type cacheCapture struct {
	http.ResponseWriter
	buf       bytes.Buffer
	status    int
	cacheable bool
	decided   bool
}

func (c *cacheCapture) WriteHeader(code int) {
	if !c.decided {
		c.status = code
		ct := c.Header().Get("Content-Type")
		c.cacheable = code == http.StatusOK && !strings.HasPrefix(ct, "text/event-stream")
		c.decided = true
	}
	c.ResponseWriter.WriteHeader(code)
}

func (c *cacheCapture) Write(b []byte) (int, error) {
	if !c.decided {
		c.WriteHeader(http.StatusOK)
	}
	if c.cacheable {
		c.buf.Write(b)
	}
	return c.ResponseWriter.Write(b)
}

func (c *cacheCapture) Flush() {
	if f, ok := c.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// CacheMiddleware caches safe responses (GET/HEAD, status 200, non-streaming)
// for ttl. No-op when ttl <= 0.
func CacheMiddleware(ttl time.Duration) func(http.Handler) http.Handler {
	if ttl <= 0 {
		return func(next http.Handler) http.Handler { return next }
	}
	cache := newResponseCache(ttl)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				next.ServeHTTP(w, r)
				return
			}

			// /queue must always reflect live backend state (gate open/close
			// changes counts and distribution immediately) — never cache it,
			// regardless of GATEWAY_CACHE_TTL.
			if strings.HasSuffix(r.URL.Path, "/queue") {
				next.ServeHTTP(w, r)
				return
			}

			// Key on method + path + canonicalized query so requests that
			// differ only by query string don't collide.
			key := r.Method + " " + r.URL.Path + "?" + r.URL.Query().Encode()

			if e, ok := cache.get(key); ok {
				for k, vals := range e.header {
					for _, v := range vals {
						w.Header().Add(k, v)
					}
				}
				w.Header().Set("X-Cache", "HIT")
				w.WriteHeader(e.status)
				w.Write(e.body)
				return
			}

			cc := &cacheCapture{ResponseWriter: w}
			next.ServeHTTP(cc, r)

			if cc.cacheable {
				cache.set(key, cacheEntry{
					status: cc.status,
					header: w.Header().Clone(),
					body:   cc.buf.Bytes(),
				})
			}
		})
	}
}