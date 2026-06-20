package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const authTokenLifetime = 12 * time.Hour

type accessLevel int

const (
	accessPublic accessLevel = iota
	accessGuest
	accessAdmin
)

type guestCheckKind int

const (
	guestCheckNone guestCheckKind = iota
	guestCheckPathGuestID
	guestCheckBodyGuestID
	guestCheckBodyGuestIDFieldID
	guestCheckHotelReservationID
)

type authClaims struct {
	Role     string `json:"role"`
	GuestID  string `json:"guest_id,omitempty"`
	IssuedAt int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
	Issuer   string `json:"iss"`
}

type authTokenResponse struct {
	Token string `json:"token"`
}

type authMeResponse struct {
	Role    string `json:"role"`
	GuestID string `json:"guest_id,omitempty"`
}

type authLoginRequest struct {
	GuestID  string `json:"guest_id"`
	Passcode string `json:"passcode"`
}

type routeRequirement struct {
	level      accessLevel
	guestCheck guestCheckKind
	bodyField  string
}

func AuthMiddleware(cfg Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if key := strings.TrimSpace(r.Header.Get("X-Internal-Key")); key != "" && key == cfg.InternalSecret {
				next.ServeHTTP(w, r)
				return
			}

			requirement := routeRequirementForRequest(r)

			token, hasToken, err := bearerToken(r.Header.Get("Authorization"))
			if err != nil {
				writeAuthError(w, http.StatusUnauthorized, "Unauthorized")
				return
			}

			if !hasToken {
				if requirement.level == accessPublic {
					next.ServeHTTP(w, r)
					return
				}

				writeAuthError(w, http.StatusUnauthorized, "Unauthorized")
				return
			}

			claims, err := parseToken(cfg, token)
			if err != nil {
				writeAuthError(w, http.StatusUnauthorized, "Unauthorized")
				return
			}

			if requirement.level == accessPublic {
				next.ServeHTTP(w, r)
				return
			}

			if requirement.level == accessAdmin && claims.Role != "admin" {
				writeAuthError(w, http.StatusForbidden, "Forbidden")
				return
			}

			if requirement.level == accessGuest && claims.Role != "admin" {
				if err := enforceGuestIdentity(cfg, r, claims, requirement); err != nil {
					status := http.StatusForbidden
					if errors.Is(err, errMissingGuestIdentity) {
						status = http.StatusBadRequest
					}
					if errors.Is(err, errReservationOwnershipLookup) {
						status = http.StatusBadGateway
					}
					writeAuthError(w, status, err.Error())
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

func GuestAuthHandler(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body authLoginRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeAuthError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if strings.TrimSpace(body.GuestID) == "" {
			writeAuthError(w, http.StatusBadRequest, "guest_id is required")
			return
		}

		token, err := issueToken(cfg, "guest", body.GuestID)
		if err != nil {
			writeAuthError(w, http.StatusInternalServerError, "failed to issue token")
			return
		}

		writeJSON(w, http.StatusOK, authTokenResponse{Token: token})
	}
}

func AdminAuthHandler(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body authLoginRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeAuthError(w, http.StatusBadRequest, "invalid body")
			return
		}

		if cfg.AdminPasscode == "" {
			writeAuthError(w, http.StatusServiceUnavailable, "admin login not configured")
			return
		}

		if body.Passcode != cfg.AdminPasscode {
			writeAuthError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}

		token, err := issueToken(cfg, "admin", "")
		if err != nil {
			writeAuthError(w, http.StatusInternalServerError, "failed to issue token")
			return
		}

		writeJSON(w, http.StatusOK, authTokenResponse{Token: token})
	}
}

func MeAuthHandler(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, hasToken, err := bearerToken(r.Header.Get("Authorization"))
		if err != nil || !hasToken {
			writeAuthError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}

		claims, err := parseToken(cfg, token)
		if err != nil {
			writeAuthError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}

		response := authMeResponse{Role: claims.Role}
		if claims.Role == "guest" {
			response.GuestID = claims.GuestID
		}

		writeJSON(w, http.StatusOK, response)
	}
}

func issueToken(cfg Config, role, guestID string) (string, error) {
	header := map[string]string{
		"alg": "HS256",
		"typ": "JWT",
	}
	payload := authClaims{
		Role:     role,
		GuestID:  guestID,
		IssuedAt: time.Now().UTC().Unix(),
		ExpiresAt: time.Now().UTC().Add(authTokenLifetime).Unix(),
		Issuer:   "gateway",
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	encodedHeader := base64.RawURLEncoding.EncodeToString(headerJSON)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadJSON)
	signingInput := encodedHeader + "." + encodedPayload

	mac := hmac.New(sha256.New, []byte(cfg.JWTSecret))
	_, _ = mac.Write([]byte(signingInput))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return signingInput + "." + signature, nil
}

func parseToken(cfg Config, token string) (*authClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid token")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, err
	}
	var header map[string]string
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, err
	}
	if header["alg"] != "HS256" {
		return nil, errors.New("invalid token")
	}

	claimsBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var claims authClaims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return nil, err
	}

	mac := hmac.New(sha256.New, []byte(cfg.JWTSecret))
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	expected := mac.Sum(nil)
	actual, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, err
	}
	if !hmac.Equal(expected, actual) {
		return nil, errors.New("invalid token")
	}
	if claims.Issuer != "gateway" {
		return nil, errors.New("invalid token")
	}
	if time.Now().UTC().Unix() >= claims.ExpiresAt {
		return nil, errors.New("token expired")
	}
	if claims.Role != "guest" && claims.Role != "admin" {
		return nil, errors.New("invalid token")
	}
	if claims.Role == "guest" && strings.TrimSpace(claims.GuestID) == "" {
		return nil, errors.New("invalid token")
	}

	return &claims, nil
}

func bearerToken(value string) (token string, present bool, err error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", false, nil
	}

	parts := strings.Fields(value)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", true, errors.New("invalid authorization header")
	}

	return parts[1], true, nil
}

func routeRequirementForRequest(r *http.Request) routeRequirement {
	path := r.URL.Path
	method := r.Method

	switch {
	case path == "/health":
		return routeRequirement{level: accessPublic}
	case path == "/auth/guest" || path == "/auth/admin":
		return routeRequirement{level: accessPublic}
	case path == "/auth/me":
		return routeRequirement{level: accessGuest}
	case path == "/api/airport/stats":
		return routeRequirement{level: accessPublic}
	case path == "/api/airport/health":
		return routeRequirement{level: accessPublic}
	case path == "/api/airport/queue":
		return routeRequirement{level: accessAdmin}
	case path == "/api/airport/arrivals" && method == http.MethodGet:
		return routeRequirement{level: accessGuest}
	case path == "/api/airport/arrivals" && method == http.MethodPost:
		return routeRequirement{level: accessGuest, guestCheck: guestCheckBodyGuestID, bodyField: "guest_id"}
	case strings.HasPrefix(path, "/api/airport/arrivals/"):
		return routeRequirement{level: accessGuest, guestCheck: guestCheckPathGuestID}
	case path == "/api/hotel/health":
		return routeRequirement{level: accessPublic}
	case path == "/api/hotel/rooms":
		return routeRequirement{level: accessPublic}
	case path == "/api/hotel/reservation" && method == http.MethodPost:
		return routeRequirement{level: accessGuest, guestCheck: guestCheckBodyGuestID, bodyField: "guest_id"}
	case strings.HasPrefix(path, "/api/hotel/reservation/by-guest/"):
		return routeRequirement{level: accessGuest, guestCheck: guestCheckPathGuestID}
	case strings.HasPrefix(path, "/api/hotel/reservation/") && (method == http.MethodGet || method == http.MethodDelete):
		return routeRequirement{level: accessGuest, guestCheck: guestCheckHotelReservationID}
	case path == "/api/beach/health":
		return routeRequirement{level: accessPublic}
	case path == "/api/beach/activities":
		return routeRequirement{level: accessPublic}
	case strings.HasPrefix(path, "/api/beach/activity/book/") && method == http.MethodPost:
		return routeRequirement{level: accessGuest, guestCheck: guestCheckBodyGuestIDFieldID, bodyField: "id"}
	case strings.HasPrefix(path, "/api/beach/activity/cancel/") && method == http.MethodPost:
		return routeRequirement{level: accessGuest, guestCheck: guestCheckBodyGuestIDFieldID, bodyField: "id"}
	case strings.HasPrefix(path, "/api/beach/activity/"):
		return routeRequirement{level: accessPublic}
	case path == "/api/broadcast/health" || path == "/api/broadcast/events":
		return routeRequirement{level: accessPublic}
	case path == "/api/parrot/health":
		return routeRequirement{level: accessPublic}
	case strings.HasPrefix(path, "/api/parrot/admin/"):
		return routeRequirement{level: accessAdmin}
	case strings.HasPrefix(path, "/api/parrot/history/"):
		return routeRequirement{level: accessGuest, guestCheck: guestCheckPathGuestID}
	case path == "/api/parrot/chat" && method == http.MethodPost:
		return routeRequirement{level: accessGuest, guestCheck: guestCheckBodyGuestID, bodyField: "guest_id"}
	case path == "/api/parrot/chat/stream" && method == http.MethodPost:
		return routeRequirement{level: accessGuest, guestCheck: guestCheckBodyGuestID, bodyField: "guest_id"}
	case strings.HasPrefix(path, "/api/"):
		return routeRequirement{level: accessGuest}
	default:
		return routeRequirement{level: accessPublic}
	}
}

var (
	errMissingGuestIdentity    = errors.New("guest identity missing")
	errReservationOwnershipLookup = errors.New("reservation ownership lookup failed")
)

func enforceGuestIdentity(cfg Config, r *http.Request, claims *authClaims, requirement routeRequirement) error {
	if claims.Role == "admin" || requirement.guestCheck == guestCheckNone {
		return nil
	}

	switch requirement.guestCheck {
	case guestCheckPathGuestID:
		guestID := guestIDFromPath(r.URL.Path)
		if guestID == "" {
			return errMissingGuestIdentity
		}
		if guestID != claims.GuestID {
			return errors.New("forbidden")
		}
	case guestCheckBodyGuestID, guestCheckBodyGuestIDFieldID:
		body, err := io.ReadAll(r.Body)
		if err != nil {
			return errMissingGuestIdentity
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		guestID, ok := stringFieldFromJSON(body, requirement.bodyField)
		if !ok || strings.TrimSpace(guestID) == "" {
			return errMissingGuestIdentity
		}
		if guestID != claims.GuestID {
			return errors.New("forbidden")
		}
	case guestCheckHotelReservationID:
		reservationID := reservationIDFromPath(r.URL.Path)
		if reservationID == "" {
			return errMissingGuestIdentity
		}
		owner, found, err := hotelReservationOwner(cfg, reservationID)
		if err != nil {
			return errReservationOwnershipLookup
		}
		if found && owner != claims.GuestID {
			return errors.New("forbidden")
		}
	}

	return nil
}

func guestIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 {
		return ""
	}
	return parts[len(parts)-1]
}

func reservationIDFromPath(path string) string {
	return guestIDFromPath(path)
}

func stringFieldFromJSON(body []byte, field string) (string, bool) {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", false
	}
	value, ok := payload[field]
	if !ok {
		return "", false
	}
	var text string
	if err := json.Unmarshal(value, &text); err != nil {
		return "", false
	}
	return text, true
}

func hotelReservationOwner(cfg Config, reservationID string) (guestID string, found bool, err error) {
	base := strings.TrimRight(cfg.HotelServiceURL, "/")
	if base == "" {
		return "", false, fmt.Errorf("hotel service not configured")
	}

	client := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/reservation/%s", base, url.PathEscape(reservationID)), nil)
	if err != nil {
		return "", false, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", false, nil
	}
	if resp.StatusCode != http.StatusOK {
		return "", false, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	var payload struct {
		GuestID string `json:"guest_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", false, err
	}
	return payload.GuestID, true, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeAuthError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
