// 华为商城商品状态监控脚本 - 回调版
// 使用与测试工具完全相同的请求方式

// 脚本配置
const config = {
    // 监控商品配置
    productUrl: "https://m.vmall.com/product/10086989076790.html",
    productName: "华为 Mate 70 Pro+",

    // PushDeer配置
    pushDeerKey: "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV", // 需要替换为自己的PushDeer Key
    pushDeerUrl: "https://api2.pushdeer.com/message/push"
};

// 发送PushDeer通知函数 - 使用回调方式
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

// 主函数 - 使用回调
function checkProductStatus() {
    console.log("开始监控商品状态...");
    
    // 获取上次状态和首次运行标记
    const lastStatus = $persistentStore.read("vmall_product_status") || "未知";
    const isFirstRun = $persistentStore.read("vmall_isFirstRun") === null;
    
    // 使用完全相同的请求方式
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
                $notification.post(
                    "❌ 商品监控出错",
                    `${config.productName}`,
                    `错误: ${error}\n时间: ${new Date().toLocaleString("zh-CN")}`,
                    { url: config.productUrl }
                );
                $done();
            });
            return;
        }
        
        // 检查是否获取到内容
        if (!data) {
            const errorMessage = `**监控错误**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 错误：返回内容为空`;
            sendPushDeerNotification("❌ 商品监控出错", errorMessage, function() {
                $notification.post(
                    "❌ 商品监控出错",
                    `${config.productName}`,
                    `错误: 返回内容为空\n时间: ${new Date().toLocaleString("zh-CN")}`,
                    { url: config.productUrl }
                );
                $done();
            });
            return;
        }
        
        console.log(`成功获取HTML内容，长度: ${data.length}字符`);
        
        // 简单检查页面状态 - 不解析结构，只查找关键词
        const statusInfo = {
            available: data.includes("加入购物车") || data.includes("立即购买"),
            soldout: data.includes("已售罄") || data.includes("售罄"),
            appointment: data.includes("预约") || data.includes("申购"),
            comingSoon: data.includes("即将上市"),
            statusText: "未知状态"
        };
        
        // 确定状态文本
        if (statusInfo.available) {
            statusInfo.statusText = "可购买";
        } else if (statusInfo.soldout) {
            statusInfo.statusText = "已售罄";
        } else if (statusInfo.appointment) {
            statusInfo.statusText = "预约/申购阶段";
        } else if (statusInfo.comingSoon) {
            statusInfo.statusText = "即将上市";
        }
        
        // 状态是否变化
        const hasChanged = lastStatus !== statusInfo.statusText && !isFirstRun;
        
        // 记录新状态
        $persistentStore.write(statusInfo.statusText, "vmall_product_status");
        
        // 构建消息
        const message = `**商品状态监控**\n\n- 商品：${config.productName}\n- 当前状态：${statusInfo.statusText}\n- 检查时间：${new Date().toLocaleString("zh-CN")}\n\n**状态详情**\n- 可购买迹象: ${statusInfo.available ? "✅有" : "❌无"}\n- 售罄迹象: ${statusInfo.soldout ? "✅有" : "❌无"}\n- 预约迹象: ${statusInfo.appointment ? "✅有" : "❌无"}\n- 即将上市迹象: ${statusInfo.comingSoon ? "✅有" : "❌无"}\n\n${isFirstRun ? "**首次运行，记录初始状态**" : `**上次状态**: ${lastStatus}\n**状态变化**: ${hasChanged ? "✅ 已变化" : "❌ 无变化"}`}`;
        
        // 发送通知
        sendPushDeerNotification(
            hasChanged ? "⚠️ 商品状态已变化" : "✅ 商品状态检查",
            message,
            function() {
                // 同步发送弹窗通知
                $notification.post(
                    hasChanged ? "⚠️ 商品状态已变化" : "✅ 商品状态检查",
                    `${config.productName}`,
                    `状态: ${statusInfo.statusText}\n检查时间: ${new Date().toLocaleString("zh-CN")}`,
                    { url: config.productUrl }
                );
                
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