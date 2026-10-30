package main

// Ask the home router to forward ports to this Mac, and to say our public IP.
//
// Hosting from home means friends' browsers have to reach this machine, and the
// router drops connections nobody asked for. Most home routers will open a port
// on request: NAT-PMP (Apple's, also Ubiquiti, OpenWrt, pfSense) or UPnP IGD (most
// of the rest). No outside server is involved; the router also tells us our
// public address.

import (
	"context"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/huin/goupnp"
	"github.com/huin/goupnp/dcps/internetgateway2"
	"github.com/huin/goupnp/ssdp"
	"github.com/jackpal/gateway"
	natpmp "github.com/jackpal/go-nat-pmp"
)

const (
	lease       = 600 // seconds; renewed well before it runs out, so after a crash they lapse within ten minutes
	description = "Mouse Party"
)

// defaultGateway: the router's LAN address
func defaultGateway() net.IP {
	ip, err := gateway.DiscoverGateway()
	if err != nil {
		return nil
	}
	return ip
}

// localIP: our LAN address on the interface that reaches toward (nothing is sent)
func localIP(toward net.IP) net.IP {
	c, err := net.Dial("udp4", net.JoinHostPort(toward.String(), "9"))
	if err != nil {
		return nil
	}
	defer c.Close()
	return c.LocalAddr().(*net.UDPAddr).IP
}

// Addresses that aren't on the internet: private, CGNAT (100.64/10), loopback,
// documentation and the like
var notPublic = func() []netip.Prefix {
	var p []netip.Prefix
	for _, s := range []string{"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
		"192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/3"} {
		p = append(p, netip.MustParsePrefix(s))
	}
	return p
}()

func isPublic(ip string) bool {
	a, err := netip.ParseAddr(ip)
	if err != nil || !a.Is4() {
		return err == nil && a.IsGlobalUnicast() && !a.IsPrivate()
	}
	for _, p := range notPublic {
		if p.Contains(a) {
			return false
		}
	}
	return true
}

// igd is what Mouse Party uses of a UPnP router's WAN connection service; goupnp's
// WANIPConnection1/2 and WANPPPConnection1 clients all have it.
type igd interface {
	GetExternalIPAddress() (string, error)
	AddPortMapping(remoteHost string, externalPort uint16, protocol string, internalPort uint16,
		internalClient string, enabled bool, description string, leaseDuration uint32) error
	DeletePortMapping(remoteHost string, externalPort uint16, protocol string) error
}

// igdOf: the first WAN connection service a router offers, newest first
func igdOf(root *goupnp.RootDevice, loc *url.URL) igd {
	if c, err := internetgateway2.NewWANIPConnection2ClientsFromRootDevice(root, loc); err == nil && len(c) > 0 {
		return c[0]
	}
	if c, err := internetgateway2.NewWANIPConnection1ClientsFromRootDevice(root, loc); err == nil && len(c) > 0 {
		return c[0]
	}
	if c, err := internetgateway2.NewWANPPPConnection1ClientsFromRootDevice(root, loc); err == nil && len(c) > 0 {
		return c[0]
	}
	return nil
}

// discoverIGD: a UPnP router on this network, by SSDP
func discoverIGD(timeout time.Duration) igd {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	devices, err := goupnp.DiscoverDevicesCtx(ctx, ssdp.UPNPRootDevice)
	if err != nil {
		return nil
	}
	for _, d := range devices {
		if d.Err == nil {
			if c := igdOf(d.Root, d.Location); c != nil {
				return c
			}
		}
	}
	return nil
}

// igdAt: the router whose device description is at location
func igdAt(location string) igd {
	loc, err := url.Parse(location)
	if err != nil {
		return nil
	}
	root, err := goupnp.DeviceByURLCtx(context.Background(), loc)
	if err != nil {
		return nil
	}
	return igdOf(root, loc)
}

type mapping struct {
	port  int
	proto string // "TCP" or "UDP"
}

// PortMapper opens ports on the router with whichever protocol it speaks, keeps
// them open, and closes them.
type PortMapper struct {
	Log      func(string)
	Gateway  net.IP
	Local    net.IP
	Method   string // "NAT-PMP" or "UPnP" once one has answered
	PublicIP string

	pmp      *natpmp.Client
	upnp     igd
	mappings []mapping
	tried    bool
	mu       sync.Mutex
	stop     chan struct{}
}

func NewPortMapper(log func(string), gw net.IP) *PortMapper {
	if gw == nil {
		gw = defaultGateway()
	}
	m := &PortMapper{Log: log, Gateway: gw, stop: make(chan struct{})}
	if gw != nil {
		m.Local = localIP(gw)
	}
	return m
}

func (m *PortMapper) connected() bool { return m.pmp != nil || m.upnp != nil }

func (m *PortMapper) connect() bool {
	if m.connected() || m.tried || m.Gateway == nil {
		return m.connected()
	}
	m.tried = true // a router that didn't answer won't for the next port either
	pmp := natpmp.NewClientWithTimeout(m.Gateway, 4*time.Second)
	if r, err := pmp.GetExternalAddress(); err == nil {
		m.pmp, m.Method = pmp, "NAT-PMP"
		m.PublicIP = net.IP(r.ExternalIPAddress[:]).String()
		return true
	}
	if c := discoverIGD(3 * time.Second); c != nil {
		m.upnp, m.Method = c, "UPnP"
		if ip, err := c.GetExternalIPAddress(); err == nil && ip != "" {
			m.PublicIP = ip
		}
		return true
	}
	return false
}

// forward asks for port on the router for lifetime seconds (0 removes it).
// UPnP forwards are timed only: some routers accept nothing but permanent ones,
// which would outlive a crash, so those don't get one.
func (m *PortMapper) forward(mp mapping, lifetime int) bool {
	if m.pmp != nil {
		r, err := m.pmp.AddPortMapping(strings.ToLower(mp.proto), mp.port, mp.port, lifetime)
		return err == nil && (lifetime == 0 || r.MappedExternalPort == uint16(mp.port))
	}
	if m.upnp != nil {
		if lifetime == 0 {
			return m.upnp.DeletePortMapping("", uint16(mp.port), mp.proto) == nil
		}
		return m.upnp.AddPortMapping("", uint16(mp.port), mp.proto, uint16(mp.port), m.Local.String(), true,
			description, uint32(lifetime)) == nil
	}
	return false
}

// Map opens port (proto "TCP" or "UDP"); false if the router wouldn't
func (m *PortMapper) Map(port int, proto string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.connect() {
		return false
	}
	mp := mapping{port, proto}
	if !m.forward(mp, lease) {
		m.Log(fmt.Sprintf("The router (%s) refused to forward %s %d.", m.Method, proto, port))
		return false
	}
	m.mappings = append(m.mappings, mp)
	if len(m.mappings) == 1 {
		go m.renew()
	}
	return true
}

func (m *PortMapper) renew() {
	t := time.NewTicker(lease / 3 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-m.stop:
			return
		case <-t.C:
			m.mu.Lock()
			for _, mp := range m.mappings {
				m.forward(mp, lease)
			}
			m.mu.Unlock()
		}
	}
}

// Close removes every forward this made
func (m *PortMapper) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	select {
	case <-m.stop:
	default:
		close(m.stop)
	}
	for _, mp := range m.mappings {
		m.forward(mp, 0)
	}
	m.mappings = nil
}

// Describe: one line for the log: what happened, and what to do if it didn't work
func (m *PortMapper) Describe() string {
	switch {
	case m.Gateway == nil:
		return "No router found (is this Mac online?)."
	case !m.connected():
		return "The router answered neither NAT-PMP nor UPnP, so friends outside can't reach this Mac directly. " +
			"Turn on UPnP on the router, or forward the ports by hand."
	case m.PublicIP != "" && !isPublic(m.PublicIP):
		return fmt.Sprintf("The router's outside address is %s, which is not public: your ISP (or another router) sits "+
			"in front of it (CGNAT or double NAT). Friends outside can't reach you directly.", m.PublicIP)
	}
	ip := m.PublicIP
	if ip == "" {
		ip = "unknown"
	}
	return fmt.Sprintf("Ports open via %s; public address %s.", m.Method, ip)
}
