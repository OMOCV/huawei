// 华为商城商品状态监控脚本 - 反防护版

// 脚本配置
const config = {
    // 监控商品配置
    productId: "10086989076790", // 商品ID
    productName: "华为 Mate 70 Pro+",

    // PushDeer配置
    pushDeerKey: "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV", // 需要替换为自己的PushDeer Key
    pushDeerUrl: "https://api2.pushdeer.com/message/push",
    
    // 调试模式
    debug: true
};

// 发送PushDeer通知函数
async function sendPushDeerNotification(title, content) {
    if (!config.pushDeerKey || config.pushDeerKey === "YOUR_PUSHDEER_KEY") {
        console.log("请先配置PushDeer Key");
        $notification.post("配置错误", "PushDeer Key未配置", "请在脚本中配置您的PushDeer Key");
        $done();
        return;
    }

    const postData = {
        "pushkey": config.pushDeerKey,
        "text": title,
        "desp": content,
        "type": "markdown"
    };
    
    try {
        const response = await $httpClient.post({
            url: config.pushDeerUrl,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(postData)
        });
        console.log("PushDeer通知已发送");
    } catch (error) {
        console.log("PushDeer通知发送失败：" + error);
        $notification.post("PushDeer通知失败", "", error);
    }
}

// 使用多种方法尝试获取商品信息
async function getProductInfo() {
    const methods = [
        fetchFromDirectUrl,
        fetchFromMobileApi,
        fetchFromDesktopUrl,
        fetchUsingAjaxApi
    ];
    
    let lastError = null;
    
    for (const method of methods) {
        try {
            console.log(`尝试使用 ${method.name} 获取商品信息...`);
            const result = await method();
            if (result) {
                console.log(`成功使用 ${method.name} 获取商品信息`);
                return result;
            }
        } catch (error) {
            console.log(`${method.name} 失败: ${error}`);
            lastError = error;
        }
    }
    
    throw new Error(`所有方法均失败，最后错误: ${lastError}`);
}

// 方法1: 直接访问商品URL
async function fetchFromDirectUrl() {
    const url = `https://m.vmall.com/product/${config.productId}.html`;
    console.log(`请求URL: ${url}`);
    
    const headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
    };
    
    const response = await $httpClient.get({ url, headers });
    
    if (response && response.status === 200 && response.body) {
        return extractInfoFromHtml(response.body);
    }
    
    return null;
}

// 方法2: 使用移动端API
async function fetchFromMobileApi() {
    // 华为商城移动端API
    const url = `https://m.vmall.com/product/getBasicInfo.json?productId=${config.productId}`;
    
    const headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Accept": "application/json",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Origin": "https://m.vmall.com",
        "Referer": `https://m.vmall.com/product/${config.productId}.html`,
        "X-Requested-With": "XMLHttpRequest"
    };
    
    const response = await $httpClient.get({ url, headers });
    
    if (response && response.status === 200 && response.body) {
        try {
            const data = JSON.parse(response.body);
            if (data && data.status === 0 && data.data) {
                return {
                    buttonName: data.data.buttonInfo?.buttonName || "",
                    buttonText: data.data.buttonInfo?.buttonText || "",
                    source: "mobile_api"
                };
            }
        } catch (e) {
            console.log("解析JSON失败: " + e);
        }
    }
    
    return null;
}

// 方法3: 使用PC端URL
async function fetchFromDesktopUrl() {
    const url = `https://www.vmall.com/product/${config.productId}.html`;
    
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Cache-Control": "no-cache"
    };
    
    const response = await $httpClient.get({ url, headers });
    
    if (response && response.status === 200 && response.body) {
        return extractInfoFromHtml(response.body);
    }
    
    return null;
}

// 方法4: 使用AJAX API
async function fetchUsingAjaxApi() {
    const url = `https://m.vmall.com/tmpl/product/comdetail/index.json?prdId=${config.productId}`;
    
    const headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `https://m.vmall.com/product/comdetail/index.html?prdId=${config.productId}`
    };
    
    const response = await $httpClient.get({ url, headers });
    
    if (response && response.status === 200 && response.body) {
        try {
            const data = JSON.parse(response.body);
            if (data && data.mainData && data.mainData.current && data.mainData.current.base) {
                const products = Object.values(data.mainData.current.base);
                if (products && products.length > 0) {
                    const product = products[0];
                    return {
                        buttonName: product.buttonInfo?.buttonName || "",
                        buttonText: product.buttonText || "",
                        source: "ajax_api"
                    };
                }
            }
        } catch (e) {
            console.log("解析AJAX响应失败: " + e);
        }
    }
    
    return null;
}

// 从HTML中提取信息
function extractInfoFromHtml(html) {
    if (!html) return null;
    
    try {
        // 尝试从NEXT_DATA脚本中提取
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
        if (nextDataMatch && nextDataMatch[1]) {
            try {
                const jsonData = JSON.parse(nextDataMatch[1]);
                const base = jsonData.props?.pageProps?.mainData?.current?.base;
                if (base) {
                    const product = Object.values(base)[0];
                    if (product && product.buttonInfo) {
                        return {
                            buttonName: product.buttonInfo.buttonName || "",
                            buttonText: product.buttonText || "",
                            source: "next_data"
                        };
                    }
                }
            } catch (e) {
                console.log("解析NEXT_DATA失败: " + e);
            }
        }
        
        // 尝试直接从HTML中匹配
        const buttonNameMatch = html.match(/"buttonName"[\s]*:[\s]*"([^"]+)"/);
        const buttonTextMatch = html.match(/"buttonText"[\s]*:[\s]*"([^"]+)"/);
        
        if (buttonNameMatch || buttonTextMatch) {
            return {
                buttonName: buttonNameMatch ? buttonNameMatch[1] : "",
                buttonText: buttonTextMatch ? buttonTextMatch[1] : "",
                source: "direct_match"
            };
        }
    } catch (error) {
        console.log("提取信息失败: " + error);
    }
    
    return null;
}

// 判断状态并发送通知
async function checkAndNotify(currentInfo) {
    // 从持久化存储中获取上一次的值
    const lastButtonName = $persistentStore.read("vmall_lastButtonName") || "";
    const lastButtonText = $persistentStore.read("vmall_lastButtonText") || "";
    
    // 判断是否首次运行
    const isFirstRun = $persistentStore.read("vmall_isFirstRun") === null;
    
    // 判断是否发生变化
    const hasChanged = (currentInfo.buttonName !== lastButtonName || currentInfo.buttonText !== lastButtonText);
    
    // 构建消息
    const message = `**商品状态监控**\n\n- 商品：${config.productName}\n- 检查时间：${new Date().toLocaleString("zh-CN")}\n- 数据来源：${currentInfo.source}\n- 按钮名称：${currentInfo.buttonName || "未获取"}\n- 按钮文本：${currentInfo.buttonText || "未获取"}\n\n${!isFirstRun ? `**上次状态**\n- 上次按钮名称：${lastButtonName || "未记录"}\n- 上次按钮文本：${lastButtonText || "未记录"}\n- 状态变化：${hasChanged ? '✅ 已变化' : '❌ 无变化'}` : "**首次运行，记录初始状态**"}`;
    
    // 发送通知
    await sendPushDeerNotification(
        hasChanged && !isFirstRun ? "⚠️ 商品状态已变化" : "✅ 商品状态检查",
        message
    );
    
    // 同步发送弹窗通知
    $notification.post(
        hasChanged && !isFirstRun ? "⚠️ 商品状态已变化" : "✅ 商品状态检查",
        `${config.productName}`,
        `按钮名称: ${currentInfo.buttonName || "未知"}\n按钮文本: ${currentInfo.buttonText || "未知"}\n数据来源: ${currentInfo.source}\n检查时间: ${new Date().toLocaleString("zh-CN")}`,
        { url: `https://m.vmall.com/product/${config.productId}.html` }
    );
    
    // 更新持久化存储
    if (currentInfo.buttonName || currentInfo.buttonText) {
        $persistentStore.write(currentInfo.buttonName, "vmall_lastButtonName");
        $persistentStore.write(currentInfo.buttonText, "vmall_lastButtonText");
    }
    
    // 首次运行标记
    if (isFirstRun) {
        $persistentStore.write("false", "vmall_isFirstRun");
    }
}

// 主函数
async function checkProductStatus() {
    try {
        // 尝试获取商品信息
        const productInfo = await getProductInfo();
        
        if (!productInfo) {
            throw new Error("无法获取商品信息");
        }
        
        // 通知状态
        await checkAndNotify(productInfo);
    } catch (error) {
        // 发送错误通知
        console.log("脚本执行出错：" + error);
        
        const errorMessage = `**监控错误**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 错误详情：${error}`;
        await sendPushDeerNotification("❌ 商品监控出错", errorMessage);
        
        $notification.post(
            "❌ 商品监控出错",
            `${config.productName}`,
            `错误: ${error}\n时间: ${new Date().toLocaleString("zh-CN")}`,
            { url: `https://m.vmall.com/product/${config.productId}.html` }
        );
    }
    
    $done();
}

// 执行主函数
checkProductStatus();