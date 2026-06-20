package main

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port string

	// Scalar service URLs — the first instance of each pool. Used by HealthHandler.
	AirportServiceURL   string
	HotelServiceURL     string
	BeachServiceURL     string
	BroadcastServiceURL string
	ParrotServiceURL    string

	// Service pools — each *_SERVICE_URL may be a comma-separated list of instances.
	// When a pool has more than one URL the gateway round-robins across it.
	AirportServicePool   []string
	HotelServicePool     []string
	BeachServicePool     []string
	BroadcastServicePool []string
	ParrotServicePool    []string

	CORSOrigins    []string
	InternalSecret string
	AdminPasscode  string
	JWTSecret      string

	// Optional cache and rate-limit settings. All disabled by their zero value.
	CacheTTL           time.Duration // GATEWAY_CACHE_TTL — response cache TTL (0 = off)
	RateLimitPerWindow int           // GATEWAY_RATE_LIMIT — requests per window per client (0 = off)
	RateLimitWindow    time.Duration // GATEWAY_RATE_WINDOW — rate-limit window (used only when limit > 0)
}

func LoadConfig() Config {
	airport := splitEnv("AIRPORT_SERVICE_URL", "http://localhost:3001")
	hotel := splitEnv("HOTEL_SERVICE_URL", "http://localhost:3000")
	beach := splitEnv("BEACH_SERVICE_URL", "")
	broadcast := splitEnv("BROADCAST_SERVICE_URL", "")
	parrot := splitEnv("PARROT_SERVICE_URL", "")

	return Config{
		Port: getEnv("PORT", "8000"),

		AirportServiceURL:   firstURL(airport),
		HotelServiceURL:     firstURL(hotel),
		BeachServiceURL:     firstURL(beach),
		BroadcastServiceURL: firstURL(broadcast),
		ParrotServiceURL:    firstURL(parrot),

		AirportServicePool:   airport,
		HotelServicePool:     hotel,
		BeachServicePool:     beach,
		BroadcastServicePool: broadcast,
		ParrotServicePool:    parrot,

		CORSOrigins:    splitEnv("CORS_ALLOWED_ORIGINS", ""),
		InternalSecret: getEnv("INTERNAL_SECRET", ""),
		AdminPasscode:  getEnv("ADMIN_PASSCODE", ""),
		JWTSecret:      getEnv("JWT_SECRET", getEnv("INTERNAL_SECRET", "dev-jwt-secret")),

		CacheTTL:           getDurationEnv("GATEWAY_CACHE_TTL", 0),
		RateLimitPerWindow: getIntEnv("GATEWAY_RATE_LIMIT", 0),
		RateLimitWindow:    getDurationEnv("GATEWAY_RATE_WINDOW", time.Minute),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func splitEnv(key, fallback string) []string {
	val := getEnv(key, fallback)
	parts := strings.Split(val, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func getDurationEnv(key string, fallback time.Duration) time.Duration {
	if val := os.Getenv(key); val != "" {
		if d, err := time.ParseDuration(val); err == nil {
			return d
		}
	}
	return fallback
}

func getIntEnv(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if n, err := strconv.Atoi(val); err == nil {
			return n
		}
	}
	return fallback
}

func firstURL(pool []string) string {
	if len(pool) > 0 {
		return pool[0]
	}
	return ""
}
