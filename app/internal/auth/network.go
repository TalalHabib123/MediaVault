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
	return ip != nil && (ip.IsLoopback() || isLocalInterfaceIP(ip))
}

func isLocalInterfaceIP(ip net.IP) bool {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return false
	}
	for _, addr := range addrs {
		var interfaceIP net.IP
		switch value := addr.(type) {
		case *net.IPNet:
			interfaceIP = value.IP
		case *net.IPAddr:
			interfaceIP = value.IP
		}
		if interfaceIP != nil && interfaceIP.Equal(ip) {
			return true
		}
	}
	return false
}
