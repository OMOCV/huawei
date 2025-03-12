// 华为商城商品状态监控脚本 - 最终版
// 支持通过简单文本配置多个商品监控：一行一个链接

// 读取BoxJS配置
const boxjsConfig = {
    // 脚本标识
    scriptId: 'vmall',
    
    // 获取BoxJS数据
    read: function(key, defaultValue) {
        const fullKey = `${this.scriptId}.${key}`;
        const data = $persistentStore.read(fullKey);
        if (data) {
            try {
                return JSON.parse(data);
            } catch (e) {
                return data;
            }
        }
        return defaultValue;
    },
    
    // 写入BoxJS数据
    write: function(key, value) {
        const fullKey = `${this.scriptId}.${key}`;
        if (typeof value === 'object') {
            $persistentStore.write(JSON.stringify(value), fullKey);
        } else {
            $persistentStore.write(value, fullKey);
        }
    }
};

// 解析链接文本为结构化数据
function parseLinksText(text) {
    if (!text) return [];
    
    // 分割文本为行
    const lines = text.split('\n').filter(line => line.trim());
    const result = [];
    
    // 处理每一行
    lines.forEach(line => {
        // 检查是否包含启用/禁用标记
        let url = line.trim();
        let enabled = true;
        
        // 匹配 [true] 或 [false] 标记
        const matches = url.match(/\[(true|false)\]$/i);
        if (matches) {
            enabled = matches[1].toLowerCase() === 'true';
            url = url.replace(/\[(true|false)\]$/i, '').trim();
        }
        
        // 添加到结果
        if (url) {
            result.push({
                url: url,
                enabled: enabled
            });
        }
    });
    
    return result;
}

// 获取配置
function getConfig() {
    // 默认配置
    const defaultConfig = {
        linksText: "https://m.vmall.com/product/10086989076790.html [true]",
        pushDeerKey: "",
        pushDeerUrl: "https://api2.pushdeer.com/message/push",
        checkInterval: 5,
        notifyOnlyOnChange: true,
        debug: false
    };
    
    // 读取BoxJS配置
    const linksText = boxjsConfig.read('linksText', defaultConfig.linksText);
    const pushDeerKey = boxjsConfig.read('pushDeerKey', defaultConfig.pushDeerKey);
    const pushDeerUrl = boxjsConfig.read('pushDeerUrl', defaultConfig.pushDeerUrl);
    const checkInterval = boxjsConfig.read('checkInterval', defaultConfig.checkInterval);
    const notifyOnlyOnChange = boxjsConfig.read('notifyOnlyOnChange', defaultConfig.notifyOnlyOnChange);
    const debug = boxjsConfig.read('debug', defaultConfig.debug);
    
    // 解析链接文本
    const productLinks = parseLinksText(linksText);
    
    return {
        productLinks: productLinks,
        pushDeerKey: pushDeerKey,
        pushDeerUrl: pushDeerUrl,
        checkInterval: checkInterval,
        notifyOnlyOnChange: notifyOnlyOnChange,
        debug: debug
    };
}

// 从链接中提取商品ID和标准化URL
function processProductLink(link) {
    let productId = "";
    let standardUrl = "";
    
    // 提取商品ID
    if (link.includes("prdId=")) {
        // 链接格式: https://m.vmall.com/product/comdetail/index.html?prdId=10086989076790
        const match = link.match(/prdId=([0-9]+)/);
        if (match && match[1]) {
            productId = match[1];
            // 转换为标准格式URL
            standardUrl = `https://m.vmall.com/product/${productId}.html`;
        }
    } else if (link.includes("/product/")) {
        // 链接格式: https://m.vmall.com/product/10086989076790.html
        const match = link.match(/\/product\/([0-9]+)\.html/);
        if (match && match[1]) {
            productId = match[1];
            standardUrl = link;
        }
    }
    
    return {
        id: productId,
        url: standardUrl || link
    };
}

// 发送PushDeer通知函数
function sendPushDeerNotification(title, content, callback) {
    const config = getConfig();
    
    if (!config.pushDeerKey) {
        console.log("请先配置PushDeer Key");
        $notification.post("配置错误", "PushDeer Key未配置", "请在BoxJS中配置您的PushDeer Key");
        callback && callback();
        return;
    }

    const postData = {
        "pushkey": config.pushDeerKey,
        "text": title,
        "desp": content,
        "type": "markdown"
    };
    
    $httpClient.post({
        url: config.pushDeerUrl,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(postData)
    }, function(error, response, data) {
        if (error) {
            console.log("PushDeer通知发送失败：" + error);
        } else {
            console.log("PushDeer通知已发送");
        }
        callback && callback();
    });
}

// 提取按钮实际文本内容
function extractButtonInfo(html) {
    // 默认值
    let buttonName = "";
    let buttonText = "";
    let productName = "未知商品";
    
    try {
        // 尝试提取商品名称
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (titleMatch && titleMatch[1]) {
            productName = titleMatch[1].replace(/[\_\-\|].*$/, "").trim();
        }
        
        // 方法1: 尝试从NEXT_DATA脚本中提取JSON数据
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
        if (nextDataMatch && nextDataMatch[1]) {
            try {
                const jsonData = JSON.parse(nextDataMatch[1]);
                const mainData = jsonData.props?.pageProps?.mainData;
                if (mainData && mainData.current && mainData.current.base) {
                    // 尝试获取第一个产品对象
                    const products = Object.values(mainData.current.base);
                    if (products && products.length > 0) {
                        const product = products[0];
                        if (product.buttonInfo && product.buttonInfo.buttonName) {
                            buttonName = product.buttonInfo.buttonName;
                        }
                        if (product.buttonText) {
                            buttonText = product.buttonText;
                        }
                        if (product.name) {
                            productName = product.name;
                        } else if (product.sbomName) {
                            productName = product.sbomName;
                        }
                    }
                }
            } catch (e) {
                console.log("解析JSON失败: " + e);
            }
        }
        
        // 如果上面的方法失败，尝试正则表达式直接匹配
        if (!buttonName && !buttonText) {
            const buttonNameMatch = html.match(/"buttonName"[\s]*:[\s]*"([^"]+)"/);
            const buttonTextMatch = html.match(/"buttonText"[\s]*:[\s]*"([^"]+)"/);
            
            if (buttonNameMatch && buttonNameMatch[1]) {
                buttonName = buttonNameMatch[1];
            }
            
            if (buttonTextMatch && buttonTextMatch[1]) {
                buttonText = buttonTextMatch[1];
            }
        }
        
        // 如果仍然无法获取，检查页面中是否存在一些常见状态
        if (!buttonName && !buttonText) {
            if (html.includes("加入购物车")) {
                buttonText = "加入购物车";
                buttonName = "add_to_cart";
            } else if (html.includes("立即购买")) {
                buttonText = "立即购买";
                buttonName = "buy_now";
            } else if (html.includes("已售罄") || html.includes("售罄")) {
                buttonText = "已售罄";
                buttonName = "soldout";
            } else if (html.includes("预约申购已结束")) {
                buttonText = "预约申购已结束";
                buttonName = "appointment_ended";
            } else if (html.includes("立即预约") || html.includes("预约")) {
                buttonText = "立即预约";
                buttonName = "appointment";
            } else if (html.includes("即将上市")) {
                buttonText = "即将上市";
                buttonName = "coming_soon";
            }
        }
    } catch (error) {
        console.log("提取按钮信息失败: " + error);
    }
    
    return {
        buttonName: buttonName || "未知",
        buttonText: buttonText || "未知状态",
        productName: productName
    };
}

// 检查单个商品
function checkSingleProduct(productLink, allResults, index, totalCount, finalCallback) {
    if (!productLink.enabled) {
        console.log(`商品链接 ${productLink.url} 已禁用，跳过检查`);
        
        // 更新结果
        allResults.push({
            url: productLink.url,
            success: false,
            message: "已禁用",
            productName: "已禁用",
            buttonInfo: { buttonName: "已禁用", buttonText: "已禁用" }
        });
        
        // 检查是否完成所有商品
        if (index === totalCount - 1) {
            // 所有商品检查完毕
            finalCallback(allResults);
        } else {
            // 继续检查下一个商品
            const nextProduct = getConfig().productLinks[index + 1];
            checkSingleProduct(nextProduct, allResults, index + 1, totalCount, finalCallback);
        }
        
        return;
    }
    
    // 处理链接，获取标准化URL
    const productInfo = processProductLink(productLink.url);
    const url = productInfo.url;
    const id = productInfo.id;
    
    console.log(`开始检查商品链接: ${url}`);
    
    // 获取上次状态
    const stateKey = `vmall.product.${id}`;
    const lastState = $persistentStore.read(stateKey);
    let lastButtonName = "";
    let lastButtonText = "";
    let lastProductName = "";
    let isFirstRun = true;
    
    if (lastState) {
        try {
            const lastStateObj = JSON.parse(lastState);
            lastButtonName = lastStateObj.buttonName || "";
            lastButtonText = lastStateObj.buttonText || "";
            lastProductName = lastStateObj.productName || "";
            isFirstRun = false;
        } catch (e) {
            console.log(`解析上次状态失败: ${e}`);
        }
    }
    
    // 使用与测试工具相同的请求方式
    $httpClient.get({
        url: url,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
            "Accept": "text/html",
            "Accept-Language": "zh-CN,zh;q=0.9"
        }
    }, function(error, response, data) {
        let result = {
            url: url,
            success: false,
            message: "",
            productName: lastProductName || "未知商品",
            buttonInfo: null,
            hasChanged: false,
            isFirstRun: isFirstRun
        };
        
        // 处理错误
        if (error) {
            result.message = `请求错误: ${error}`;
            console.log(`商品链接 ${url} ${result.message}`);
        } else if (!data) {
            result.message = "返回内容为空";
            console.log(`商品链接 ${url} ${result.message}`);
        } else {
            // 成功获取内容
            console.log(`商品链接 ${url} 成功获取HTML内容，长度: ${data.length}字符`);
            result.success = true;
            
            // 提取按钮实际文本内容和商品名称
            const extractedInfo = extractButtonInfo(data);
            console.log(`商品 ${extractedInfo.productName} 提取到按钮信息: buttonName=${extractedInfo.buttonName}, buttonText=${extractedInfo.buttonText}`);
            
            result.buttonInfo = {
                buttonName: extractedInfo.buttonName,
                buttonText: extractedInfo.buttonText
            };
            result.productName = extractedInfo.productName;
            
            // 状态是否变化
            result.hasChanged = (extractedInfo.buttonName !== lastButtonName || 
                                extractedInfo.buttonText !== lastButtonText) && 
                                !isFirstRun;
            
            // 保存当前状态
            $persistentStore.write(JSON.stringify(extractedInfo), stateKey);
        }
        
        // 添加结果
        allResults.push(result);
        
        // 检查是否完成所有商品
        if (index === totalCount - 1) {
            // 所有商品检查完毕
            finalCallback(allResults);
        } else {
            // 继续检查下一个商品
            const nextProduct = getConfig().productLinks[index + 1];
            checkSingleProduct(nextProduct, allResults, index + 1, totalCount, finalCallback);
        }
    });
}

// 主函数 - 检查所有商品
function checkAllProducts() {
    const config = getConfig();
    console.log(`开始检查所有商品，共 ${config.productLinks.length} 个商品链接`);
    
    // 如果没有配置商品，显示提示
    if (!config.productLinks || config.productLinks.length === 0) {
        console.log("未配置任何商品链接");
        $notification.post("配置错误", "未配置任何商品链接", "请在BoxJS中配置至少一个商品链接");
        $done();
        return;
    }
    
    // 检查第一个商品，递归检查所有商品
    const results = [];
    checkSingleProduct(config.productLinks[0], results, 0, config.productLinks.length, function(allResults) {
        // 所有商品检查完毕，发送通知
        sendSummaryNotification(allResults);
    });
}

// 发送汇总通知
function sendSummaryNotification(results) {
    const config = getConfig();
    
    // 检查是否有状态变化的商品
    const changedProducts = results.filter(r => r.success && r.buttonInfo && r.hasChanged);
    
    // 构建汇总消息
    let summaryTitle = "";
    let summaryContent = "";
    
    if (changedProducts.length > 0) {
        summaryTitle = `⚠️ 检测到${changedProducts.length}个商品状态变化`;
        summaryContent = "**商品状态变化通知**\n\n";
        
        // 添加变化的商品信息
        changedProducts.forEach((result, index) => {
            summaryContent += `### ${index + 1}. ${result.productName}\n`;
            summaryContent += `- 当前按钮: ${result.buttonInfo.buttonText}\n`;
            summaryContent += `- 检查时间: ${new Date().toLocaleString("zh-CN")}\n\n`;
        });
    } else {
        summaryTitle = "✅ 商品状态检查完成";
        summaryContent = "**商品状态检查汇总**\n\n";
    }
    
    // 添加所有商品的当前状态
    summaryContent += "**所有商品当前状态**\n\n";
    results.forEach((result, index) => {
        if (result.success && result.buttonInfo) {
            summaryContent += `${index + 1}. ${result.productName}: ${result.buttonInfo.buttonText}${result.hasChanged ? " (已变化)" : ""}\n`;
        } else {
            summaryContent += `${index + 1}. ${result.productName || result.url}: 检查失败 - ${result.message}\n`;
        }
    });
    
    // 发送PushDeer通知
    sendPushDeerNotification(summaryTitle, summaryContent, function() {
        // 对于变化的商品，发送弹窗通知
        if (changedProducts.length > 0) {
            changedProducts.forEach(result => {
                $notification.post(
                    "⚠️ 商品状态已变化",
                    `${result.productName}`,
                    `按钮文本: ${result.buttonInfo.buttonText}\n检查时间: ${new Date().toLocaleString("zh-CN")}`,
                    { url: result.url }
                );
            });
        }
        
        $done();
    });
}

// 执行主函数
checkAllProducts();