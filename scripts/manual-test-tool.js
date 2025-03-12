// 华为商城手动测试工具
// 用于测试网页访问，可帮助排查问题

const url = "https://m.vmall.com/product/10086989076790.html";

// 直接获取HTML内容
function testDirectAccess() {
    $httpClient.get({
        url: url,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
            "Accept": "text/html",
            "Accept-Language": "zh-CN,zh;q=0.9"
        }
    }, function(error, response, data) {
        if (error) {
            $notification.post("测试失败", "", "请求出错: " + error);
            $done();
            return;
        }
        
        if (!data) {
            $notification.post("测试失败", "", "返回数据为空");
            $done();
            return;
        }
        
        // 保存响应状态
        const status = {
            statusCode: response.status,
            headers: JSON.stringify(response.headers),
            contentLength: data.length,
            containsHtml: data.includes("<html"),
            containsButton: data.includes("button") || data.includes("Button"),
            containsKeywords: {
                "加入购物车": data.includes("加入购物车"),
                "立即购买": data.includes("立即购买"),
                "已售罄": data.includes("已售罄"),
                "预约": data.includes("预约"),
                "申购": data.includes("申购"),
                "即将上市": data.includes("即将上市")
            }
        };
        
        // 保存HTML片段供分析
        $persistentStore.write(data.substring(0, 4000), "vmall_html_start");
        $persistentStore.write(data.substring(Math.max(0, data.length - 4000)), "vmall_html_end");
        $persistentStore.write(JSON.stringify(status), "vmall_access_status");
        
        const summary = `状态码: ${status.statusCode}
内容长度: ${status.contentLength}字符
包含HTML标签: ${status.containsHtml ? "是" : "否"}
包含按钮相关内容: ${status.containsButton ? "是" : "否"}

关键词检测:
- 包含"加入购物车": ${status.containsKeywords["加入购物车"] ? "是" : "否"}
- 包含"立即购买": ${status.containsKeywords["立即购买"] ? "是" : "否"}
- 包含"已售罄": ${status.containsKeywords["已售罄"] ? "是" : "否"}
- 包含"预约": ${status.containsKeywords["预约"] ? "是" : "否"}
- 包含"申购": ${status.containsKeywords["申购"] ? "是" : "否"}
- 包含"即将上市": ${status.containsKeywords["即将上市"] ? "是" : "否"}

HTML开头和结尾已保存，请通过持久化存储查看完整内容`;
        
        $notification.post(
            "测试成功 ✅", 
            `成功获取页面内容 (${status.contentLength}字符)`,
            summary
        );
        
        $done();
    });
}

// 执行测试
testDirectAccess();