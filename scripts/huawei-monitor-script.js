// 华为商城商品状态监控脚本 - 最终版
// 直接提取按钮实际文本内容

// 脚本配置
const config = {
    // 监控商品配置
    productUrl: "https://m.vmall.com/product/10086989076790.html",
    productName: "华为 Mate 70 Pro+",

    // PushDeer配置
    pushDeerKey: "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV", // 需要替换为自己的PushDeer Key
    pushDeerUrl: "https://api2.pushdeer.com/message/push"
};

// 发送PushDeer通知函数
function sendPushDeerNotification(title, content, callback) {
    if (!config.pushDeerKey || config.pushDeerKey === "YOUR_PUSHDEER_KEY") {
        console.log("请先配置PushDeer Key");
        $notification.post("配置错误", "PushDeer Key未配置", "请在脚本中配置您的PushDeer Key");
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
    
    try {
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
        buttonText: buttonText || "未知状态"
    };
}

// 主函数
function checkProductStatus() {
    console.log("开始监控商品状态...");
    
    // 获取上次状态
    const lastButtonName = $persistentStore.read("vmall_lastButtonName") || "";
    const lastButtonText = $persistentStore.read("vmall_lastButtonText") || "";
    const isFirstRun = $persistentStore.read("vmall_isFirstRun") === null;
    
    // 使用测试工具相同的请求方式
    $httpClient.get({
        url: config.productUrl,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
            "Accept": "text/html",
            "Accept-Language": "zh-CN,zh;q=0.9"
        }
    }, function(error, response, data) {
        // 处理错误
        if (error) {
            const errorMessage = `**监控错误**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 错误：${error}`;
            sendPushDeerNotification("❌ 商品监控出错", errorMessage, function() {
                $done();
            });
            return;
        }
        
        // 检查是否获取到内容
        if (!data) {
            const errorMessage = `**监控错误**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 错误：返回内容为空`;
            sendPushDeerNotification("❌ 商品监控出错", errorMessage, function() {
                $done();
            });
            return;
        }
        
        console.log(`成功获取HTML内容，长度: ${data.length}字符`);
        
        // 提取按钮实际文本内容
        const buttonInfo = extractButtonInfo(data);
        console.log(`提取到按钮信息: buttonName=${buttonInfo.buttonName}, buttonText=${buttonInfo.buttonText}`);
        
        // 状态是否变化
        const hasChanged = (buttonInfo.buttonName !== lastButtonName || buttonInfo.buttonText !== lastButtonText) && !isFirstRun;
        
        // 构建消息
        const message = `**商品状态监控**\n\n- 商品：${config.productName}\n- 按钮名称：${buttonInfo.buttonName}\n- 按钮文本：${buttonInfo.buttonText}\n- 检查时间：${new Date().toLocaleString("zh-CN")}\n\n${isFirstRun ? "**首次运行，记录初始状态**" : `**上次状态**\n- 上次按钮名称：${lastButtonName || "未记录"}\n- 上次按钮文本：${lastButtonText || "未记录"}\n- 状态变化：${hasChanged ? '✅ 已变化' : '❌ 无变化'}`}`;
        
        // 发送PushDeer通知(每次都发送)
        sendPushDeerNotification(
            hasChanged ? "⚠️ 商品状态已变化" : "✅ 商品状态检查",
            message,
            function() {
                // 只在状态变化时发送弹窗通知
                if (hasChanged) {
                    $notification.post(
                        "⚠️ 商品状态已变化",
                        `${config.productName}`,
                        `按钮名称: ${buttonInfo.buttonName}\n按钮文本: ${buttonInfo.buttonText}\n检查时间: ${new Date().toLocaleString("zh-CN")}`,
                        { url: config.productUrl }
                    );
                }
                
                // 更新存储的状态
                $persistentStore.write(buttonInfo.buttonName, "vmall_lastButtonName");
                $persistentStore.write(buttonInfo.buttonText, "vmall_lastButtonText");
                
                // 标记非首次运行
                if (isFirstRun) {
                    $persistentStore.write("false", "vmall_isFirstRun");
                }
                
                $done();
            }
        );
    });
}

// 执行主函数
checkProductStatus();