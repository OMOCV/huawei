// 华为商城商品状态监控脚本 - 完整版
// 支持通过简单文本配置多个商品监控，显示完整价格信息
// 作者: Claude

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

// 读取PushDeer Key - 兼容多种键名
function getPushDeerKey() {
    // 尝试多种可能的键名
    const possibleKeys = [
        "vmall.pushDeerKey",  // 带命名空间前缀
        "pushDeerKey",        // 不带前缀
        "vmall.pushkey",      // 可能的其他写法
        "pushkey"             // 可能的其他写法
    ];
    
    // 尝试所有可能的键名
    for (const key of possibleKeys) {
        const value = $persistentStore.read(key);
        console.log(`尝试读取键名 ${key}: "${value ? '有值' : '未找到'}"`);
        
        if (value && value.length > 5) {
            console.log(`成功从 ${key} 读取到PushDeer Key`);
            return value;
        }
    }
    
    // 如果找不到，提供直接设置的方法
    console.log("无法从任何键名读取PushDeer Key，检查是否有直接设置...");
    
    // 这里可以直接硬编码您的PushDeer Key作为备用
    // const directKey = "您的实际PushDeer Key";
    const directKey = "";
    
    if (directKey && directKey !== "您的实际PushDeer Key" && directKey.length > 5) {
        // 尝试保存到多个位置
        $persistentStore.write(directKey, "vmall.pushDeerKey");
        $persistentStore.write(directKey, "pushDeerKey");
        console.log("已使用直接设置的PushDeer Key");
        return directKey;
    }
    
    return "";
}

// 获取配置
function getConfig() {
    // 尝试读取链接文本
    const linksText = $persistentStore.read("vmall.linksText") || 
                      $persistentStore.read("linksText") || 
                      "https://m.vmall.com/product/10086989076790.html [true]";
    
    console.log(`读取到的链接文本: ${linksText ? '有内容' : '未找到'}`);
    
    // 尝试读取其他配置
    const pushDeerUrl = $persistentStore.read("vmall.pushDeerUrl") || 
                        $persistentStore.read("pushDeerUrl") || 
                        "https://api2.pushdeer.com/message/push";
    
    const checkInterval = parseInt($persistentStore.read("vmall.checkInterval") || 
                                  $persistentStore.read("checkInterval") || 
                                  "5");
    
    const notifyOnlyOnChange = ($persistentStore.read("vmall.notifyOnlyOnChange") === "true") || 
                               ($persistentStore.read("notifyOnlyOnChange") === "true") || 
                               true;
    
    const debug = ($persistentStore.read("vmall.debug") === "true") || 
                  ($persistentStore.read("debug") === "true") || 
                  false;
    
    // 解析链接文本
    const productLinks = parseLinksText(linksText);
    console.log(`解析出 ${productLinks.length} 个商品链接`);
    
    return {
        productLinks: productLinks,
        pushDeerKey: getPushDeerKey(),
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
    
    // 检查PushDeer配置
    if (!config.pushDeerKey) {
        console.log("PushDeer Key未配置，无法发送通知");
        
        // 尝试直接读取键值，用于调试
        const directKey = $persistentStore.read("pushDeerKey");
        console.log(`直接读取pushDeerKey: "${directKey ? directKey : '未找到'}"`);
        
        // 使用备用消息通知渠道
        $notification.post(
            "配置错误", 
            "PushDeer Key未配置", 
            "请在BoxJS中配置您的PushDeer Key，或直接修改脚本中的备用Key"
        );
        
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
            $notification.post("PushDeer通知失败", "", error);
        } else {
            console.log("PushDeer通知已发送");
        }
        callback && callback();
    });
}

// 提取页面信息 - 完整版，包含完整价格提取
function extractPageInfo(html) {
    // 默认值
    let buttonName = "";
    let buttonText = "";
    let productName = "未知商品";
    let currentPrice = 0;      // 当前价格(优惠价/实际售价)
    let originalPrice = 0;     // 原价/标价
    
    try {
        // 尝试提取商品名称
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (titleMatch && titleMatch[1]) {
            productName = titleMatch[1].replace(/[\_\-\|].*$/, "").trim();
        }
        
        // 尝试提取价格信息 - 从HTML中搜索价格相关信息
        // 查找价格信息的各种可能模式
        const patterns = [
            // 模式1: 常见的price和originPrice模式
            {
                currentRegex: /["']price["']\s*:\s*(\d+(\.\d+)?)/,
                originalRegex: /["']originPrice["']\s*:\s*(\d+(\.\d+)?)/
            },
            // 模式2: salePrice和标准price模式
            {
                currentRegex: /["']salePrice["']\s*:\s*(\d+(\.\d+)?)/,
                originalRegex: /["']price["']\s*:\s*(\d+(\.\d+)?)/
            },
            // 模式3: discountPrice和normalPrice模式
            {
                currentRegex: /["']discountPrice["']\s*:\s*(\d+(\.\d+)?)/,
                originalRegex: /["']normalPrice["']\s*:\s*(\d+(\.\d+)?)/
            },
            // 模式4: 数字模式(¥后面跟数字)
            {
                currentRegex: /¥\s*(\d+(\.\d+)?)/,
                originalRegex: /原价\D*(\d+(\.\d+)?)/
            }
        ];
        
        // 尝试所有模式
        for (const pattern of patterns) {
            const currentMatch = html.match(pattern.currentRegex);
            const originalMatch = html.match(pattern.originalRegex);
            
            if (currentMatch && currentMatch[1]) {
                currentPrice = parseFloat(currentMatch[1]);
            }
            
            if (originalMatch && originalMatch[1]) {
                originalPrice = parseFloat(originalMatch[1]);
            }
            
            // 如果两者都找到了，跳出循环
            if (currentPrice > 0 && originalPrice > 0) {
                break;
            }
        }
        
        // 处理特殊情况 - 如果只找到原价，将其设为当前价格
        if (originalPrice > 0 && currentPrice === 0) {
            currentPrice = originalPrice;
        }
        
        // 处理特殊情况 - 如果只找到当前价格，暂时将其设为原价(后面会处理)
        if (currentPrice > 0 && originalPrice === 0) {
            originalPrice = currentPrice; // 暂时设置，实际可能没有折扣
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
                        
                        // 提取价格信息
                        if (product.price) {
                            // 当前销售价格
                            currentPrice = parseFloat(product.price);
                        }
                        if (product.originPrice) {
                            // 原价
                            originalPrice = parseFloat(product.originPrice);
                        } else if (product.normalPrice) {
                            // 标准价格作为原价
                            originalPrice = parseFloat(product.normalPrice);
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
        console.log("提取页面信息失败: " + error);
    }
    
    // 确定价格是否有优惠
    // 如果原价和当前价格一样，则认为没有优惠
    const hasDiscount = originalPrice > currentPrice && currentPrice > 0;
    
    return {
        buttonName: buttonName || "未知",
        buttonText: buttonText || "未知状态",
        productName: productName,
        currentPrice: currentPrice,
        originalPrice: hasDiscount ? originalPrice : currentPrice, // 如果没有优惠，原价等于当前价格
        hasDiscount: hasDiscount
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
            buttonInfo: { buttonName: "已禁用", buttonText: "已禁用" },
            currentPrice: 0,
            originalPrice: 0,
            hasDiscount: false,
            priceChanged: false,
            priceDiff: 0
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
    
    // 获取上次状态 - 使用不带前缀的键名，提高兼容性
    const stateKey = `vmall_product_${id}`;
    const lastState = $persistentStore.read(stateKey);
    let lastButtonName = "";
    let lastButtonText = "";
    let lastProductName = "";
    let lastCurrentPrice = 0;
    let lastOriginalPrice = 0;
    let lastHasDiscount = false;
    let isFirstRun = true;
    
    if (lastState) {
        try {
            const lastStateObj = JSON.parse(lastState);
            lastButtonName = lastStateObj.buttonName || "";
            lastButtonText = lastStateObj.buttonText || "";
            lastProductName = lastStateObj.productName || "";
            lastCurrentPrice = lastStateObj.currentPrice || 0;
            lastOriginalPrice = lastStateObj.originalPrice || 0;
            lastHasDiscount = lastStateObj.hasDiscount || false;
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
            currentPrice: lastCurrentPrice,
            originalPrice: lastOriginalPrice,
            hasDiscount: lastHasDiscount,
            hasChanged: false,
            priceChanged: false,
            priceDiff: 0,
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
            
            // 提取页面信息 - 包含价格
            const extractedInfo = extractPageInfo(data);
            console.log(`商品 ${extractedInfo.productName} 提取到信息: buttonName=${extractedInfo.buttonName}, buttonText=${extractedInfo.buttonText}, currentPrice=${extractedInfo.currentPrice}, originalPrice=${extractedInfo.originalPrice}, hasDiscount=${extractedInfo.hasDiscount}`);
            
            result.buttonInfo = {
                buttonName: extractedInfo.buttonName,
                buttonText: extractedInfo.buttonText
            };
            result.productName = extractedInfo.productName;
            result.currentPrice = extractedInfo.currentPrice;
            result.originalPrice = extractedInfo.originalPrice;
            result.hasDiscount = extractedInfo.hasDiscount;
            
            // 状态是否变化
            result.hasChanged = (extractedInfo.buttonName !== lastButtonName || 
                                extractedInfo.buttonText !== lastButtonText) && 
                                !isFirstRun;
            
            // 价格是否变化
            if (lastCurrentPrice > 0 && extractedInfo.currentPrice > 0) {
                result.priceChanged = (lastCurrentPrice !== extractedInfo.currentPrice);
                result.priceDiff = extractedInfo.currentPrice - lastCurrentPrice;
            }
            
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

// 格式化价格显示
function formatPrice(price) {
    if (!price || price === 0) return "未知";
    return price.toFixed(2) + "元";
}

// 格式化价格变化
function formatPriceChange(diff) {
    if (diff === 0) return "无变化";
    return diff > 0 ? `↑涨价${diff.toFixed(2)}元` : `↓降价${Math.abs(diff).toFixed(2)}元`;
}

// 计算折扣率
function calculateDiscount(originalPrice, currentPrice) {
    if (originalPrice <= 0 || currentPrice <= 0 || originalPrice <= currentPrice) {
        return 0;
    }
    return ((originalPrice - currentPrice) / originalPrice * 100).toFixed(1);
}

// 发送汇总通知 - 完整价格显示版
function sendSummaryNotification(results) {
    const config = getConfig();
    
    // 检查是否有状态或价格变化的商品
    const changedProducts = results.filter(r => r.success && (r.hasChanged || r.priceChanged));
    
    // 构建汇总消息
    let summaryTitle = "";
    let summaryContent = "";
    
    if (changedProducts.length > 0) {
        summaryTitle = `⚠️ 检测到${changedProducts.length}个商品变化`;
        summaryContent = "## 🔔 商品变化通知\n\n";
        
        // 添加变化的商品信息
        changedProducts.forEach((result, index) => {
            summaryContent += `### ${index + 1}. ${result.productName}\n\n`;
            
            if (result.hasChanged) {
                summaryContent += `- **按钮状态**: ${result.buttonInfo.buttonText}\n`;
                summaryContent += `- **状态变化**: ✅ 已变化，原状态: ${result.lastButtonText || "未知"}\n`;
            }
            
            if (result.priceChanged) {
                // 显示更详细的价格信息
                summaryContent += `- **价格变化**: ${formatPriceChange(result.priceDiff)}\n`;
            }
            
            // 添加当前价格信息 - 区分是否有折扣
            if (result.currentPrice > 0) {
                if (result.hasDiscount) {
                    const discountRate = calculateDiscount(result.originalPrice, result.currentPrice);
                    summaryContent += `- **当前价格**: ${formatPrice(result.currentPrice)} (原价: ${formatPrice(result.originalPrice)}, 优惠: ${discountRate}%)\n`;
                } else {
                    summaryContent += `- **当前价格**: ${formatPrice(result.currentPrice)}\n`;
                }
            }
            
            summaryContent += `- **检查时间**: ${new Date().toLocaleString("zh-CN")}\n\n`;
        });
    } else {
        summaryTitle = "✅ 商品状态检查完成";
        summaryContent = "## 📊 商品状态检查汇总\n\n";
    }
    
    // 添加所有商品的当前状态 - 使用树状结构改进排版
    summaryContent += "## 📋 所有商品当前状态\n\n";
    
    results.forEach((result, index) => {
        if (result.success && result.buttonInfo) {
            // 显示序号和商品名，状态变化时添加标记
            summaryContent += `### ${index + 1}. ${result.productName}${result.hasChanged || result.priceChanged ? " ⚠️" : ""}\n\n`;
            
            // 树形结构显示详细信息
            summaryContent += `- **按钮状态**: ${result.buttonInfo.buttonText}\n`;
            
            // 价格信息，根据是否有折扣显示不同内容
            if (result.currentPrice > 0) {
                if (result.hasDiscount) {
                    const discountRate = calculateDiscount(result.originalPrice, result.currentPrice);
                    const discountAmount = result.originalPrice - result.currentPrice;
                    summaryContent += `- **当前价格**: ${formatPrice(result.currentPrice)}\n`;
                    summaryContent += `- **原价**: ${formatPrice(result.originalPrice)}\n`;
                    summaryContent += `- **优惠**: 🔻${formatPrice(discountAmount)} (${discountRate}%)\n`;
                } else {
                    summaryContent += `- **价格**: ${formatPrice(result.currentPrice)}\n`;
                }
                
                // 如果价格有变化，显示变化情况
                if (result.priceChanged) {
                    summaryContent += `- **价格变动**: ${formatPriceChange(result.priceDiff)}\n`;
                }
            }
            
            // 添加空行分隔不同商品
            summaryContent += "\n";
        } else {
            summaryContent += `### ${index + 1}. ${result.productName || result.url}\n\n`;
            summaryContent += `- **状态**: 检查失败 - ${result.message}\n\n`;
        }
    });
    
    // 发送PushDeer通知
    sendPushDeerNotification(summaryTitle, summaryContent, function() {
        // 对于变化的商品，发送弹窗通知
        if (changedProducts.length > 0) {
            changedProducts.forEach(result => {
                let notificationBody = `按钮文本: ${result.buttonInfo.buttonText}`;
                
                // 添加价格信息到通知
                if (result.currentPrice > 0) {
                    if (result.hasDiscount) {
                        const discountRate = calculateDiscount(result.originalPrice, result.currentPrice);
                        notificationBody += `\n价格: ${formatPrice(result.currentPrice)} (原价${formatPrice(result.originalPrice)}, 优惠${discountRate}%)`;
                    } else {
                        notificationBody += `\n价格: ${formatPrice(result.currentPrice)}`;
                    }
                    
                    if (result.priceChanged) {
                        notificationBody += `\n${formatPriceChange(result.priceDiff)}`;
                    }
                }
                
                notificationBody += `\n检查时间: ${new Date().toLocaleString("zh-CN")}`;
                
                $notification.post(
                    "⚠️ 商品状态已变化",
                    `${result.productName}`,
                    notificationBody,
                    { url: result.url }
                );
            });
        }
        
        $done();
    });
}

// 测试函数 - 仅用于测试PushDeer配置
function testPushDeer() {
    const config = getConfig();
    console.log("测试PushDeer配置...");
    console.log(`读取到的PushDeer Key: ${config.pushDeerKey ? "已配置" : "未配置"}`);
    
    sendPushDeerNotification(
        "PushDeer配置测试", 
        "如果您看到此消息，说明PushDeer配置正确！", 
        function() {
            $notification.post("测试完成", "已尝试发送PushDeer测试消息", "请检查您的PushDeer应用是否收到消息");
            $done();
        }
    );
}

// 检查命令行参数，决定执行哪个功能
const args = typeof $argument !== 'undefined' ? $argument : '';
if (args.includes('test')) {
    testPushDeer();
} else {
    // 执行主函数
    checkAllProducts();
}