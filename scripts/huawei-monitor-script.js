// 华为商城商品状态监控脚本 - 最终版
// 支持多商品独立配置、价格变化通知、优惠价显示等增强功能
// 修复了促销判断和价格显示问题
// 重点关注¥符号价格提取，精确识别原价
// 更新日期: 2025-03-14

// 解析链接文本为结构化数据 (兼容旧版配置)
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

// 获取配置 - 支持新的BoxJS单独商品输入框
function getConfig() {
    // 尝试从新的单独输入框读取商品配置
    const productLinks = [];
    
    // 支持最多5个商品
    for (let i = 1; i <= 5; i++) {
        const urlKey = `product${i}Url`;
        const enabledKey = `product${i}Enabled`;
        
        // 尝试读取URL，同时支持带命名空间和不带命名空间的键名
        const url = $persistentStore.read(`vmall.${urlKey}`) || 
                    $persistentStore.read(urlKey);
        
        // 尝试读取启用状态，同时支持带命名空间和不带命名空间的键名
        let enabled = true; // 默认启用
        
        const enabledStr = $persistentStore.read(`vmall.${enabledKey}`) || 
                          $persistentStore.read(enabledKey);
        
        // 如果明确设置为false，则禁用
        if (enabledStr === "false") {
            enabled = false;
        }
        
        // 如果有URL，添加到商品链接列表
        if (url && url.trim()) {
            productLinks.push({
                url: url.trim(),
                enabled: enabled
            });
        }
    }
    
    // 如果没有读取到任何商品链接，尝试从旧的linksText配置读取
    if (productLinks.length === 0) {
        const linksText = $persistentStore.read("vmall.linksText") || 
                          $persistentStore.read("linksText") || 
                          "https://m.vmall.com/product/10086989076790.html [true]";
        
        console.log(`未从新配置读取到商品链接，尝试从旧配置读取: ${linksText ? '有内容' : '未找到'}`);
        
        // 使用旧的解析函数解析链接文本
        const oldLinks = parseLinksText(linksText);
        productLinks.push(...oldLinks);
    }
    
    console.log(`共读取到 ${productLinks.length} 个商品链接`);
    
    // 尝试读取其他配置
    const pushDeerUrl = $persistentStore.read("vmall.pushDeerUrl") || 
                        $persistentStore.read("pushDeerUrl") || 
                        "https://api2.pushdeer.com/message/push";
    
    const checkInterval = parseInt($persistentStore.read("vmall.checkInterval") || 
                                  $persistentStore.read("checkInterval") || 
                                  "5");
    
    const notifyOnlyOnChange = ($persistentStore.read("vmall.notifyOnlyOnChange") === "true") || 
                               ($persistentStore.read("notifyOnlyOnChange") === "true") || 
                               false;
    
    const debug = ($persistentStore.read("vmall.debug") === "true") || 
                  ($persistentStore.read("debug") === "true") || 
                  false;
    
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

// 提取页面信息 - 增加对非促销商品价格的处理
function extractPageInfo(html) {
    // 默认值
    let buttonName = "";
    let buttonText = "";
    let productName = "未知商品";
    let price = 0;           // 当前展示价格
    let originalPrice = 0;   // 原价
    let promoPrice = 0;      // 优惠价/促销价
    let isPromo = false;     // 是否在促销中

    try {
        // 尝试提取商品名称
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (titleMatch && titleMatch[1]) {
            productName = titleMatch[1].replace(/[\_\-\|].*$/, "").trim();
        }
        
        // ===== 首先提取¥符号价格 =====
        // 华为商城中，带¥符号的数字通常是原价
        const yenPriceMatches = html.match(/¥\s*(\d+(\.\d+)?)/g);
        
        if (yenPriceMatches && yenPriceMatches.length > 0) {
            // 提取所有带¥的价格并转换为数字
            const allPrices = yenPriceMatches.map(p => 
                parseFloat(p.replace(/¥\s*/, ""))
            );
            
            console.log(`找到所有带¥符号的价格: ${JSON.stringify(allPrices)}`);
            
            if (allPrices.length >= 1) {
                // 第一个带¥符号的价格通常是原价
                originalPrice = allPrices[0];
                console.log(`使用第一个带¥价格作为原价: ${originalPrice}`);
            }
            
            // 如果有多个价格，可能存在促销
            if (allPrices.length >= 2) {
                isPromo = true;
                
                // 如果还没设置促销价，使用第二个价格
                if (promoPrice === 0) {
                    promoPrice = allPrices[1];
                    console.log(`使用第二个带¥价格作为促销价: ${promoPrice}`);
                }
            }
        } else {
            console.log("未找到标准格式的¥符号价格，尝试查找分离的¥符号和价格");
            
            // 尝试处理¥符号和价格被HTML标签分隔的情况
            // 例如在非促销商品中，¥符号和价格可能被标签分开
            if (html.includes(">¥<")) {
                console.log("检测到带HTML标签分隔的¥符号");
                
                // 尝试从¥符号周围寻找价格
                // 这个正则表达式尝试匹配¥符号附近的数字
                const separatedPriceMatch = html.match(/>\s*¥\s*<\/[^>]+>[^<]*<[^>]+>\s*(\d+(\.\d+)?)\s*</);
                if (separatedPriceMatch && separatedPriceMatch[1]) {
                    const extractedPrice = parseFloat(separatedPriceMatch[1]);
                    console.log(`从分离的¥符号附近提取到价格: ${extractedPrice}`);
                    
                    // 对于非促销商品，这个价格即是原价也是当前价格
                    if (!isPromo) {
                        price = extractedPrice;
                        originalPrice = extractedPrice;
                        console.log(`非促销商品，设置当前价格和原价为: ${price}`);
                    }
                }
            }
        }
        
        // ===== 检测促销标识词 =====
        // 检查页面是否包含促销相关关键词
        const promoKeywords = ["促销", "直降", "优惠", "折扣", "减", "省", "特价", "秒杀", "限时", "立省", "立减", "低至"];
        for (const keyword of promoKeywords) {
            if (html.includes(keyword)) {
                console.log(`检测到促销关键词: ${keyword}`);
                isPromo = true;
                break;
            }
        }
        
        // ===== 提取JSON中的价格数据 =====
        
        // 1. 尝试匹配JSON中的promoPrice和促销信息
        const promoPriceMatch = html.match(/["']promoPrice["']\s*:\s*(\d+(\.\d+)?)/);
        const promoPriceLabelMatch = html.match(/["']promoLabel["']\s*:\s*["']([^"']+)["']/);
        
        if (promoPriceMatch && promoPriceMatch[1]) {
            promoPrice = parseFloat(promoPriceMatch[1]);
            console.log(`找到促销价格: ${promoPrice}`);
            isPromo = true;  // 如果有promoPrice字段，明确是促销
            
            // 设置当前价格为促销价
            price = promoPrice;
        }
        
        if (promoPriceLabelMatch && promoPriceLabelMatch[1]) {
            console.log(`找到促销标签: ${promoPriceLabelMatch[1]}`);
            isPromo = true;  // 如果有促销标签，明确是促销
        }
        
        // 2. 尝试匹配普通价格信息
        const priceMatches = html.match(/["']price["']\s*:\s*(\d+(\.\d+)?)/);
        const originalPriceMatches = html.match(/["']originPrice["']\s*:\s*(\d+(\.\d+)?)/);
        
        // 查找价格相关字段
        if (priceMatches && priceMatches[1]) {
            // 如果还没有设置价格，则设置
            if (price === 0) {
                price = parseFloat(priceMatches[1]);
                console.log(`找到price字段: ${price}`);
            }
        }
        
        // 如果JSON中明确有originPrice字段
        if (originalPriceMatches && originalPriceMatches[1]) {
            // 如果原价还没有设置，或者JSON中的原价更高，则使用JSON中的原价
            const jsonOriginalPrice = parseFloat(originalPriceMatches[1]);
            if (originalPrice === 0 || jsonOriginalPrice > originalPrice) {
                originalPrice = jsonOriginalPrice;
                console.log(`找到originPrice字段: ${originalPrice}`);
            }
            
            // 如果JSON中的原价与当前价格不同，则可能是促销
            if (originalPrice > 0 && price > 0 && originalPrice > price) {
                console.log(`originPrice(${originalPrice}) > price(${price})，判定为促销`);
                isPromo = true;
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
                        
                        // 提取价格信息 - 但优先使用¥符号提取的价格
                        if (price === 0 && product.price) {
                            price = parseFloat(product.price);
                            console.log(`从JSON中提取到price: ${price}`);
                        }
                        
                        if (originalPrice === 0 && product.originPrice) {
                            originalPrice = parseFloat(product.originPrice);
                            console.log(`从JSON中提取到originPrice: ${originalPrice}`);
                        }
                        
                        if (promoPrice === 0 && product.promoPrice) {
                            promoPrice = parseFloat(product.promoPrice);
                            console.log(`从JSON中提取到promoPrice: ${promoPrice}`);
                            
                            // 如果还没设置当前价格，用促销价
                            if (price === 0) {
                                price = promoPrice;
                            }
                            
                            isPromo = true;
                        }
                        
                        // 检查是否有促销标签或活动
                        if (product.promoTag || product.promoActivity) {
                            isPromo = true;
                            console.log("商品有促销标签或活动");
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
        
        // ===== 价格合理性校验和调整 =====
        
        // 如果没有设置当前价格但有促销价，使用促销价
        if (price === 0 && promoPrice > 0) {
            price = promoPrice;
        }
        
        // 如果没有设置当前价格但有原价，使用原价
        if (price === 0 && originalPrice > 0) {
            price = originalPrice;
        }
        
        // 如果原价没有设置但有当前价格，且没有促销迹象，将原价设为当前价格
        if (originalPrice === 0 && price > 0 && !isPromo) {
            originalPrice = price;
        }
        
        // 如果在促销但没有原价，将原价设为当前价格的105%（估算）
        if (isPromo && originalPrice === 0 && price > 0) {
            originalPrice = Math.round(price * 1.05 * 100) / 100;  // 四舍五入到两位小数
            console.log(`促销中但无原价，将原价估算为当前价格的105%: ${originalPrice}`);
        }
        
        // 如果原价低于当前价格，这可能是不合理的，调整原价
        if (originalPrice > 0 && price > 0 && originalPrice < price) {
            originalPrice = Math.round(price * 1.05 * 100) / 100;  // 设为当前价格的105%
            console.log(`原价(${originalPrice})低于当前价格(${price})，调整原价为当前价格的105%: ${originalPrice}`);
        }
        
        // 确保promoPrice已设置（仅对于促销商品）
        if (isPromo && promoPrice === 0) {
            promoPrice = price;
        }
        
        console.log(`最终价格信息 - 当前价格: ${price}, 原价: ${originalPrice}, 促销价: ${promoPrice}, 是否促销: ${isPromo}`);
        
    } catch (error) {
        console.log("提取页面信息失败: " + error);
    }
    
    return {
        buttonName: buttonName || "未知",
        buttonText: buttonText || "未知状态",
        productName: productName,
        price: price,
        originalPrice: originalPrice,
        promoPrice: promoPrice,
        isPromo: isPromo
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
            isPromo: false,
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
    let lastIsPromo = false;
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
            lastIsPromo = lastStateObj.isPromo || false;
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
            isPromo: lastIsPromo,
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
            console.log(`商品 ${extractedInfo.productName} 提取到信息: buttonName=${extractedInfo.buttonName}, buttonText=${extractedInfo.buttonText}, price=${extractedInfo.price}, originalPrice=${extractedInfo.originalPrice}, promoPrice=${extractedInfo.promoPrice}, isPromo=${extractedInfo.isPromo}`);
            
            result.buttonInfo = {
                buttonName: extractedInfo.buttonName,
                buttonText: extractedInfo.buttonText
            };
            result.productName = extractedInfo.productName;
            result.price = extractedInfo.price;
            result.originalPrice = extractedInfo.originalPrice;
            result.promoPrice = extractedInfo.promoPrice;
            result.isPromo = extractedInfo.isPromo;
            
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
            const nextProduct = getConfig