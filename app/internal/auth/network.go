package auth

import (
	"net"
	"net/http"
	"strings"
)

func IsLoopbackRequest(r *http.Request) bool {
	host := remoteHost(r)
	return isLoopbackHost(host)
}

func isLoopbackHost(host string) bool {
	host = strings.Trim(strings.ToLower(host), "[]")
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
