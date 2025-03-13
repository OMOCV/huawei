// 华为商城商品状态监控脚本 - 增强通知版
// 支持通过简单文本配置多个商品监控：一行一个链接
// 增强通知显示，包含价格变化、状态变化等更丰富信息
// 优化价格提取逻辑，修复原价和优惠价显示问题

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

// 提取页面信息 - 重新优化版，修复价格提取问题
function extractPageInfo(html) {
    // 默认值
    let buttonName = "";
    let buttonText = "";
    let productName = "未知商品";
    let price = 0;           // 当前展示价格
    let originalPrice = 0;   // 原价
    let promoPrice = 0;      // 优惠价/促销价

    try {
        // 尝试提取商品名称
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (titleMatch && titleMatch[1]) {
            productName = titleMatch[1].replace(/[\_\-\|].*$/, "").trim();
        }
        
        // ===== 价格提取逻辑（完全重写）=====
        
        // 1. 尝试匹配JSON中的promoPrice和促销信息
        const promoPriceMatch = html.match(/["']promoPrice["']\s*:\s*(\d+(\.\d+)?)/);
        const promoPriceLabelMatch = html.match(/["']promoLabel["']\s*:\s*["']([^"']+)["']/);
        
        if (promoPriceMatch && promoPriceMatch[1]) {
            promoPrice = parseFloat(promoPriceMatch[1]);
            console.log(`找到促销价格: ${promoPrice}`);
        }
        
        // 2. 尝试匹配原价信息
        const priceMatches = html.match(/["']price["']\s*:\s*(\d+(\.\d+)?)/);
        const originalPriceMatches = html.match(/["']originPrice["']\s*:\s*(\d+(\.\d+)?)/);
        
        // 查找价格相关字段
        if (priceMatches && priceMatches[1]) {
            price = parseFloat(priceMatches[1]);
            console.log(`找到price字段: ${price}`);
        }
        
        if (originalPriceMatches && originalPriceMatches[1]) {
            originalPrice = parseFloat(originalPriceMatches[1]);
            console.log(`找到originPrice字段: ${originalPrice}`);
        }
        
        // 3. 尝试匹配带¥符号的价格
        // 通常HTML中会显示¥XXXX（原价，带删除线）和¥XXXX（当前售价）
        const yenPriceMatches = html.match(/¥\s*(\d+(\.\d+)?)/g);
        
        if (yenPriceMatches && yenPriceMatches.length > 0) {
            // 提取所有带¥的价格并转换为数字
            const allPrices = yenPriceMatches.map(p => 
                parseFloat(p.replace(/¥\s*/, ""))
            );
            
            console.log(`找到所有带¥符号的价格: ${JSON.stringify(allPrices)}`);
            
            // 找出最大值和最小值
            if (allPrices.length >= 2) {
                // 对价格进行排序
                allPrices.sort((a, b) => b - a);
                
                // 如果未设置原价，使用最大值作为原价
                if (originalPrice === 0) {
                    originalPrice = allPrices[0];
                    console.log(`使用最大的带¥价格作为原价: ${originalPrice}`);
                }
                
                // 如果未设置促销价，使用次大值作为促销价
                if (promoPrice === 0 && allPrices.length >= 2) {
                    promoPrice = allPrices[1];
                    console.log(`使用次大的带¥价格作为促销价: ${promoPrice}`);
                }
            } else if (allPrices.length === 1) {
                // 只有一个价格时，视情况设置
                if (price === 0) {
                    price = allPrices[0];
                    console.log(`仅有一个带¥价格，设为当前价格: ${price}`);
                }
            }
        }
        
        // 4. 尝试从NEXT_DATA脚本提取完整JSON数据
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
                        
                        // 提取按钮信息
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
                            price = parseFloat(product.price);
                            console.log(`从JSON中提取到price: ${price}`);
                        }
                        if (product.originPrice) {
                            originalPrice = parseFloat(product.originPrice);
                            console.log(`从JSON中提取到originPrice: ${originalPrice}`);
                        }
                        if (product.promoPrice) {
                            promoPrice = parseFloat(product.promoPrice);
                            console.log(`从JSON中提取到promoPrice: ${promoPrice}`);
                        }
                    }
                }
            } catch (e) {
                console.log("解析JSON失败: " + e);
            }
        }
        
        // 5. 如果上面的方法失败，尝试正则表达式直接匹配按钮信息
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
        
        // 6. 如果仍然无法获取按钮信息，检查页面中是否存在一些常见状态
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
        
        // ===== 价格合理性校验 =====
        
        // 设置当前价格的优先级：促销价 > 普通价格
        if (promoPrice > 0) {
            price = promoPrice;
        }
        
        // 确保原价不低于当前价格
        if (originalPrice > 0 && price > 0 && originalPrice < price) {
            console.log(`原价(${originalPrice})低于当前价格(${price})，不合理，调整原价为当前价格`);
            originalPrice = price;
        }
        
        // 如果还是没有原价，但有价格，则设置原价等于价格
        if (originalPrice === 0 && price > 0) {
            originalPrice = price;
        }
        
        console.log(`最终价格信息 - 当前价格: ${price}, 原价: ${originalPrice}, 促销价: ${promoPrice}`);
        
    } catch (error) {
        console.log("提取页面信息失败: " + error);
    }
    
    return {
        buttonName: buttonName || "未知",
        buttonText: buttonText || "未知状态",
        productName: productName,
        price: price,
        originalPrice: originalPrice,
        promoPrice: promoPrice
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
            price: 0,
            originalPrice: 0,
            promoPrice: 0,
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
    let lastPrice = 0;
    let lastOriginalPrice = 0;
    let lastPromoPrice = 0;
    let isFirstRun = true;
    
    if (lastState) {
        try {
            const lastStateObj = JSON.parse(lastState);
            lastButtonName = lastStateObj.buttonName || "";
            lastButtonText = lastStateObj.buttonText || "";
            lastProductName = lastStateObj.productName || "";
            lastPrice = lastStateObj.price || 0;
            lastOriginalPrice = lastStateObj.originalPrice || 0;
            lastPromoPrice = lastStateObj.promoPrice || 0;
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
            price: lastPrice,
            originalPrice: lastOriginalPrice,
            promoPrice: lastPromoPrice,
            lastButtonText: lastButtonText,
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
            console.log(`商品 ${extractedInfo.productName} 提取到信息: buttonName=${extractedInfo.buttonName}, buttonText=${extractedInfo.buttonText}, price=${extractedInfo.price}, originalPrice=${extractedInfo.originalPrice}, promoPrice=${extractedInfo.promoPrice}`);
            
            result.buttonInfo = {
                buttonName: extractedInfo.buttonName,
                buttonText: extractedInfo.buttonText
            };
            result.productName = extractedInfo.productName;
            result.price = extractedInfo.price;
            result.originalPrice = extractedInfo.originalPrice;
            result.promoPrice = extractedInfo.promoPrice;
            
            // 状态是否变化
            result.hasChanged = (extractedInfo.buttonName !== lastButtonName || 
                                extractedInfo.buttonText !== lastButtonText) && 
                                !isFirstRun;
            
            // 价格是否变化 - 现在主要比较当前展示价格
            if (lastPrice > 0 && extractedInfo.price > 0) {
                result.priceChanged = (lastPrice !== extractedInfo.price);
                result.priceDiff = extractedInfo.price - lastPrice;
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

// 发送汇总通知 - 增强版
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
                summaryContent += `- **当前价格**: ${formatPrice(result.price)}\n`;
                
                // 显示优惠价信息（如果有）
                if (result.promoPrice > 0 && result.promoPrice < result.originalPrice) {
                    summaryContent += `- **优惠价**: ${formatPrice(result.promoPrice)}\n`;
                }
                
                // 显示原价信息（如果有且不等于当前价格）
                if (result.originalPrice > 0 && result.originalPrice !== result.price) {
                    summaryContent += `- **原价**: ${formatPrice(result.originalPrice)}\n`;
                }
                
                summaryContent += `- **价格变化**: ${formatPriceChange(result.priceDiff)}\n`;
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
            summaryContent += `### ${index + 1}. ${result.productName}${result.hasChanged ? " ⚠️" : ""}\n\n`;
            
            // 树形结构显示详细信息
            summaryContent += `- **按钮状态**: ${result.buttonInfo.buttonText}\n`;
            
            // 价格信息，如果有价格则显示
            if (result.price > 0) {
                summaryContent += `- **商品价格**: ${formatPrice(result.price)}`;
                
                // 如果价格有变化，显示变化情况
                if (result.priceChanged) {
                    summaryContent += ` (${formatPriceChange(result.priceDiff)})`;
                }
                summaryContent += "\n";
                
                // 显示优惠价信息（如果有）
                if (result.promoPrice > 0 && result.promoPrice < result.originalPrice) {
                    summaryContent += `- **优惠价**: ${formatPrice(result.promoPrice)}\n`;
                }
                
                // 显示原价信息（如果有且不等于当前价格）
                if (result.originalPrice > 0 && result.originalPrice !== result.price) {
                    summaryContent += `- **原价**: ${formatPrice(result.originalPrice)}\n`;
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
                
                if (result.priceChanged) {
                    notificationBody += `\n价格: ${formatPrice(result.price)} (${formatPriceChange(result.priceDiff)})`;
                    
                    // 在弹窗通知中也添加优惠价和原价显示
                    if (result.promoPrice > 0 && result.promoPrice < result.originalPrice) {
                        notificationBody += `\n优惠价: ${formatPrice(result.promoPrice)}`;
                    }
                    
                    if (result.originalPrice > 0 && result.originalPrice !== result.price) {
                        notificationBody += `\n原价: ${formatPrice(result.originalPrice)}`;
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