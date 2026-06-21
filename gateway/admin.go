package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// AdminLoginHandler validates the passcode and returns a success response.
func AdminLoginHandler(passcode string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if passcode == "" {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"error": "Admin login is not configured for this environment."}`))
			return
		}

		var body struct {
			Passcode string `json:"passcode"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Passcode == "" {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "passcode is required"}`))
			return
		}

		if body.Passcode != passcode {
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"error": "invalid passcode"}`))
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}
}

// PasscodeMiddleware protects admin routes.
func PasscodeMiddleware(passcode string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if passcode == "" {
				next.ServeHTTP(w, r)
				return
			}

			provided := r.Header.Get("X-Admin-Passcode")
			if provided == "" {
				auth := r.Header.Get("Authorization")
				if len(auth) > 7 && auth[:7] == "Bearer " {
					provided = auth[7:]
				}
			}

			if provided != passcode {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"error": "unauthorized"}`))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

type rateLimitUpdate struct {
	Limit  *int    `json:"limit"`
	Window *string `json:"window"`
}

// AdminRateLimitHandler updates the live rate limiter at runtime.
func AdminRateLimitHandler(rl *RateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var body rateLimitUpdate
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"error": "invalid body"}`))
			return
		}

		limit := rl.Limit()
		if body.Limit != nil {
			limit = *body.Limit
		}
		per := rl.Window()
		if body.Window != nil {
			d, err := time.ParseDuration(*body.Window)
			if err != nil {
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"error": "invalid window"}`))
				return
			}
			per = d
		}

		rl.SetLimits(limit, per)

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]any{
			"limit":  rl.Limit(),
			"window": rl.Window().String(),
		})
	}
}

// AdminProxyHandler forwards a fixed-path admin request to the backend.
func AdminProxyHandler(backendBase, path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		target := strings.TrimRight(backendBase, "/") + path
		proxyAdminRequest(w, r, target)
	}
}

// AdminProxyHandlerWithParam forwards an admin request with a chi URL param.
func AdminProxyHandlerWithParam(backendBase, pathPrefix, paramName string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		param := chi.URLParam(r, paramName)
		target := fmt.Sprintf("%s%s/%s", strings.TrimRight(backendBase, "/"), pathPrefix, param)
		proxyAdminRequest(w, r, target)
	}
}

func proxyAdminRequest(w http.ResponseWriter, r *http.Request, target string) {
	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte(`{"error":"failed to build upstream request"}`))
		return
	}

	req.Header.Set("Content-Type", r.Header.Get("Content-Type"))
	if secret := r.Header.Get("X-Internal-Secret"); secret != "" {
		req.Header.Set("X-Internal-Secret", secret)
	}

	resp, err := client.Do(req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte(`{"error":"upstream request failed"}`))
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}