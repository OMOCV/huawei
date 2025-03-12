// 华为商城商品状态监控脚本 - 超简化版
// 放弃复杂的解析，只检查关键词存在性

// 脚本配置
const config = {
    // 监控商品配置
    productId: "10086989076790", // 商品ID
    productName: "华为 Mate 70 Pro+",
    
    // 直接访问的URL(不使用复杂的API)
    directUrl: "https://m.vmall.com/product/10086989076790.html",

    // PushDeer配置
    pushDeerKey: "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV", // 需要替换为自己的PushDeer Key
    pushDeerUrl: "https://api2.pushdeer.com/message/push"
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
    }
}

// 主函数 - 仅检查页面是否包含关键词
async function checkProductStatus() {
    try {
        console.log("开始简化版监控...");
        
        // 尝试直接获取页面，不做复杂解析
        const response = await $httpClient.get({
            url: config.directUrl,
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
                "Accept": "text/html",
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Cache-Control": "no-cache"
            }
        });
        
        // 检查是否获取到内容
        if (!response || !response.body) {
            throw new Error("无法获取页面内容");
        }
        
        const html = response.body;
        console.log(`成功获取HTML内容，长度: ${html.length}字符`);
        
        // 简单检查页面状态 - 不解析结构，只查找关键词
        const statusInfo = {
            available: html.includes("加入购物车") || html.includes("立即购买"),
            soldout: html.includes("已售罄") || html.includes("售罄"),
            appointment: html.includes("预约") || html.includes("申购"),
            comingSoon: html.includes("即将上市"),
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
        
        // 获取上次状态
        const lastStatus = $persistentStore.read("vmall_product_status") || "未知";
        const isFirstRun = $persistentStore.read("vmall_isFirstRun") === null;
        
        // 状态是否变化
        const hasChanged = lastStatus !== statusInfo.statusText;
        
        // 记录新状态
        $persistentStore.write(statusInfo.statusText, "vmall_product_status");
        
        // 构建消息
        const message = `**商品状态监控 (简化版)**\n\n- 商品：${config.productName}\n- 当前状态：${statusInfo.statusText}\n- 检查时间：${new Date().toLocaleString("zh-CN")}\n\n**状态详情**\n- 可购买迹象: ${statusInfo.available ? "✅有" : "❌无"}\n- 售罄迹象: ${statusInfo.soldout ? "✅有" : "❌无"}\n- 预约迹象: ${statusInfo.appointment ? "✅有" : "❌无"}\n- 即将上市迹象: ${statusInfo.comingSoon ? "✅有" : "❌无"}\n\n${isFirstRun ? "**首次运行，记录初始状态**" : `**上次状态**: ${lastStatus}\n**状态变化**: ${hasChanged ? "✅ 已变化" : "❌ 无变化"}`}`;
        
        // 发送通知
        await sendPushDeerNotification(
            hasChanged && !isFirstRun ? "⚠️ 商品状态已变化" : "✅ 商品状态检查",
            message
        );
        
        // 同步发送弹窗通知
        $notification.post(
            hasChanged && !isFirstRun ? "⚠️ 商品状态已变化" : "✅ 商品状态检查",
            `${config.productName}`,
            `状态: ${statusInfo.statusText}\n检查时间: ${new Date().toLocaleString("zh-CN")}`,
            { url: config.directUrl }
        );
        
        // 标记非首次运行
        if (isFirstRun) {
            $persistentStore.write("false", "vmall_isFirstRun");
        }
    } catch (error) {
        console.log("脚本执行出错：" + error);
        
        const errorMessage = `**监控错误**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 错误：${error}`;
        await sendPushDeerNotification("❌ 商品监控出错", errorMessage);
        
        $notification.post(
            "❌ 商品监控出错",
            `${config.productName}`,
            `错误: ${error}\n时间: ${new Date().toLocaleString("zh-CN")}`,
            { url: config.directUrl }
        );
    }
    
    $done();
}

// 执行主函数
checkProductStatus();