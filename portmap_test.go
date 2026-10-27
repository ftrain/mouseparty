package main

// PortMapper against a fake NAT-PMP router and a fake UPnP router, both on loopback

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// natpmpRouter answers NAT-PMP on 127.0.0.1:5351; the map is what it granted
func natpmpRouter(t *testing.T) (map[string]uint32, *sync.Mutex) {
	conn, err := net.ListenPacket("udp4", "127.0.0.1:5351")
	if err != nil {
		t.Skip("port 5351 is taken:", err)
	}
	t.Cleanup(func() { conn.Close() })
	table, mu := map[string]uint32{}, &sync.Mutex{}
	go func() {
		buf := make([]byte, 64)
		for {
			n, addr, err := conn.ReadFrom(buf)
			if err != nil {
				return
			}
			req := buf[:n]
			if req[1] == 0 { // external address
				conn.WriteTo([]byte{0, 128, 0, 0, 0, 0, 0, 1, 198, 51, 100, 7}, addr)
				continue
			}
			op := req[1]
			port := binary.BigEndian.Uint16(req[4:6])
			life := binary.BigEndian.Uint32(req[8:12])
			key := fmt.Sprintf("%d/%s", port, map[byte]string{1: "UDP", 2: "TCP"}[op])
			mu.Lock()
			if life > 0 {
				table[key] = life
			} else {
				delete(table, key)
			}
			mu.Unlock()
			reply := make([]byte, 16)
			reply[1] = 128 + op
			binary.BigEndian.PutUint32(reply[4:8], 1)
			copy(reply[8:12], req[4:8]) // internal and external port
			binary.BigEndian.PutUint32(reply[12:16], life)
			conn.WriteTo(reply, addr)
		}
	}()
	return table, mu
}

func TestNatPmpOpensTimedForwardsAndRemovesThem(t *testing.T) {
	table, mu := natpmpRouter(t)
	m := NewPortMapper(func(string) {}, net.ParseIP("127.0.0.1"))
	if !m.Map(8765, "TCP") || !m.Map(8189, "UDP") {
		t.Fatal("refused")
	}
	if m.Method != "NAT-PMP" || m.PublicIP != "198.51.100.7" {
		t.Fatal(m.Method, m.PublicIP)
	}
	mu.Lock()
	if len(table) != 2 || table["8765/TCP"] != lease || table["8189/UDP"] != lease || lease > 600 {
		t.Fatal(table) // a crashed session's forwards lapse soon
	}
	mu.Unlock()
	m.Close()
	mu.Lock()
	defer mu.Unlock()
	if len(table) != 0 {
		t.Fatal(table)
	}
}

// upnpRouter: a device description and a SOAP control URL; records the actions it was sent
func upnpRouter(t *testing.T, permanentOnly bool) (*httptest.Server, *[][2]string) {
	var calls [][2]string
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			fmt.Fprint(w, `<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><specVersion><major>1</major><minor>0</minor></specVersion>
			<device><deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:1</deviceType><deviceList>
			<device><deviceType>urn:schemas-upnp-org:device:WANConnectionDevice:1</deviceType><serviceList><service>
			<serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><serviceId>urn:upnp-org:serviceId:WANIPConn1</serviceId>
			<controlURL>/ctl/IPConn</controlURL><eventSubURL>/evt/IPConn</eventSubURL><SCPDURL>/WANIPCn.xml</SCPDURL>
			</service></serviceList></device></deviceList></device></root>`)
			return
		}
		body, _ := io.ReadAll(r.Body)
		action := strings.Trim(strings.SplitN(r.Header.Get("SOAPAction"), "#", 2)[1], `"`)
		mu.Lock()
		calls = append(calls, [2]string{action, string(body)})
		mu.Unlock()
		if action == "AddPortMapping" && permanentOnly && !strings.Contains(string(body), "<NewLeaseDuration>0<") {
			w.WriteHeader(500) // error 725, OnlyPermanentLeasesSupported
			return
		}
		reply := ""
		if action == "GetExternalIPAddress" {
			reply = "<NewExternalIPAddress>198.51.100.4</NewExternalIPAddress>"
		}
		fmt.Fprintf(w, `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>`+
			`<u:%sResponse xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">%s</u:%sResponse></s:Body></s:Envelope>`,
			action, reply, action)
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func TestUpnpExternalIPAddAndDelete(t *testing.T) {
	srv, calls := upnpRouter(t, false)
	c := igdAt(srv.URL + "/rootDesc.xml")
	if c == nil {
		t.Fatal("no WAN connection service found")
	}
	m := &PortMapper{Log: func(string) {}, Local: net.ParseIP("192.168.1.20"), upnp: c, Method: "UPnP", stop: make(chan struct{})}
	if ip, _ := c.GetExternalIPAddress(); ip != "198.51.100.4" {
		t.Fatal(ip)
	}
	if !m.forward(mapping{8765, "TCP"}, lease) {
		t.Fatal("refused")
	}
	var add string
	for _, call := range *calls {
		if call[0] == "AddPortMapping" {
			add = call[1]
		}
	}
	for _, field := range []string{"<NewExternalPort>8765<", "<NewInternalClient>192.168.1.20<", fmt.Sprintf("<NewLeaseDuration>%d<", lease)} {
		if !strings.Contains(add, field) {
			t.Errorf("no %s in %s", field, add)
		}
	}
	if !m.forward(mapping{8765, "TCP"}, 0) || (*calls)[len(*calls)-1][0] != "DeletePortMapping" {
		t.Fatal(*calls)
	}
}

func TestUpnpNeverFallsBackToAPermanentForward(t *testing.T) {
	srv, calls := upnpRouter(t, true)
	c := igdAt(srv.URL + "/rootDesc.xml")
	m := &PortMapper{Log: func(string) {}, Local: net.ParseIP("192.168.1.20"), upnp: c, stop: make(chan struct{})}
	if m.forward(mapping{8765, "TCP"}, lease) {
		t.Fatal("a router that only takes permanent forwards said yes")
	}
	for _, call := range *calls {
		if strings.Contains(call[1], "<NewLeaseDuration>0<") {
			t.Fatal("asked for a permanent forward")
		}
	}
}

func TestCGNATAndPrivateAddressesAreNotPublic(t *testing.T) {
	if isPublic("100.72.1.9") || isPublic("192.168.1.1") || !isPublic("8.8.8.8") {
		t.Fatal()
	}
	m := &PortMapper{Gateway: net.ParseIP("192.0.2.1"), Method: "NAT-PMP", PublicIP: "100.72.1.9", upnp: igd(nil)}
	m.pmp = nil
	m.upnp = fakeIGD{}
	if !strings.Contains(m.Describe(), "CGNAT") {
		t.Fatal(m.Describe())
	}
}

type fakeIGD struct{}

func (fakeIGD) GetExternalIPAddress() (string, error) { return "", nil }
func (fakeIGD) AddPortMapping(string, uint16, string, uint16, string, bool, string, uint32) error {
	return nil
}
func (fakeIGD) DeletePortMapping(string, uint16, string) error { return nil }
