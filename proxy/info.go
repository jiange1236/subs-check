package proxies

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"log/slog"

	"github.com/beck-8/subs-check/config"
	"github.com/metacubex/mihomo/common/convert"
)

func GetProxyCountry(httpClient *http.Client) (loc string, ip string) {
	for i := 0; i < config.GlobalConfig.SubUrlsReTry; i++ {
		// loc, ip = GetIPSB(httpClient)
		// if loc != "" && ip != "" {
		// 	return
		// }
		loc, ip = GetCFProxy(httpClient)
		if loc != "" && ip != "" {
			return
		}
		// 不准
		loc, ip = GetEdgeOneProxy(httpClient)
		if loc != "" && ip != "" {
			return
		}
	}
	return
}

func GetEdgeOneProxy(httpClient *http.Client) (loc string, ip string) {
	type GeoResponse struct {
		Eo struct {
			Geo struct {
				CountryCodeAlpha2 string `json:"countryCodeAlpha2"`
			} `json:"geo"`
			ClientIp string `json:"clientIp"`
		} `json:"eo"`
	}

	url := "https://functions-geolocation.edgeone.app/geo"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		slog.Debug(fmt.Sprintf("创建请求失败: %s", err))
		return
	}
	req.Header.Set("User-Agent", convert.RandUserAgent())
	resp, err := httpClient.Get(url)
	if err != nil {
		slog.Debug(fmt.Sprintf("edgeone获取节点位置失败: %s", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Debug(fmt.Sprintf("edgeone返回非200状态码: %v", resp.StatusCode))
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		slog.Debug(fmt.Sprintf("edgeone读取节点位置失败: %s", err))
		return
	}

	var eo GeoResponse
	err = json.Unmarshal(body, &eo)
	if err != nil {
		slog.Debug(fmt.Sprintf("解析edgeone JSON 失败: %v", err))
		return
	}

	return eo.Eo.Geo.CountryCodeAlpha2, eo.Eo.ClientIp
}

func GetCFProxy(httpClient *http.Client) (loc string, ip string) {
	url := "https://www.cloudflare.com/cdn-cgi/trace"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		slog.Debug(fmt.Sprintf("创建请求失败: %s", err))
		return
	}
	req.Header.Set("User-Agent", convert.RandUserAgent())
	resp, err := httpClient.Get(url)
	if err != nil {
		slog.Debug(fmt.Sprintf("cf获取节点位置失败: %s", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Debug(fmt.Sprintf("cf返回非200状态码: %v", resp.StatusCode))
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		slog.Debug(fmt.Sprintf("cf读取节点位置失败: %s", err))
		return
	}

	// Parse the response text to find loc=XX
	for _, line := range strings.Split(string(body), "\n") {
		if strings.HasPrefix(line, "loc=") {
			loc = strings.TrimPrefix(line, "loc=")
		}
		if strings.HasPrefix(line, "ip=") {
			ip = strings.TrimPrefix(line, "ip=")
		}
	}
	return
}

// 使用自定义httpClient请求有问题，不知道对方网站依据什么进行判断的
func GetIPSB(httpClient *http.Client) (loc string, ip string) {
	type GeoIPData struct {
		IP      string `json:"ip"`
		Country string `json:"continent_code"`
	}

	url := "https://api.ip.sb/geoip"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		slog.Debug(fmt.Sprintf("创建请求失败: %s", err))
		return
	}
	req.Header.Set("User-Agent", convert.RandUserAgent())
	resp, err := httpClient.Get(url)
	if err != nil {
		slog.Debug(fmt.Sprintf("ip.sb获取节点位置失败: %s", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Debug(fmt.Sprintf("ip.sb返回非200状态码: %v", resp.StatusCode))
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {

		slog.Debug(fmt.Sprintf("ip.sb读取节点位置失败: %s", err))
		return
	}

	var geo GeoIPData
	err = json.Unmarshal(body, &geo)
	if err != nil {
		slog.Debug(fmt.Sprintf("解析ip.sb JSON 失败: %v", err))
		return
	}

	return geo.Country, geo.IP
}
