// 华为商城商品状态监控脚本 - 修复版

// 脚本配置
const config = {
    // 监控商品配置
    productUrl: "https://m.vmall.com/product/10086989076790.html", // 更简单的直接URL
    productName: "华为 Mate 70 Pro+",

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
        $notification.post("PushDeer通知失败", "", error);
    }
}

// 提取按钮信息
function extractButtonInfo(html) {
    const buttonInfo = {
        buttonName: "",
        buttonText: ""
    };
    
    if (!html) {
        console.log("HTML内容为空，无法提取信息");
        return buttonInfo;
    }

    try {
        // 直接在HTML中寻找关键信息
        const nameMatch = html.match(/"buttonName"[\s]*:[\s]*"([^"]+)"/);
        const textMatch = html.match(/"buttonText"[\s]*:[\s]*"([^"]+)"/);
        
        if (nameMatch && nameMatch[1]) {
            buttonInfo.buttonName = nameMatch[1];
        }
        
        if (textMatch && textMatch[1]) {
            buttonInfo.buttonText = textMatch[1];
        }
    } catch (error) {
        console.log("提取按钮信息出错: " + error);
    }
    
    return buttonInfo;
}

// 主函数
async function checkProductStatus() {
    // 判断是否首次运行
    const isFirstRun = $persistentStore.read("vmall_isFirstRun") === null;
    
    // 开始检查的消息
    let startMessage = `**监控开始**\n- 商品：${config.productName}\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 状态：开始检查\n- 链接：${config.productUrl}\n`;
    
    try {
        // 简化网络请求，直接使用用户成功过的方式
        console.log("获取商品信息...");
        const response = await $httpClient.get({
            url: config.productUrl,
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
            }
        });
        
        if (!response || !response.body) {
            throw new Error("网络请求返回为空");
        }
        
        const html = response.body;
        console.log(`成功获取HTML内容，长度: ${html.length}`);
        
        // 提取按钮信息
        const currentInfo = extractButtonInfo(html);
        console.log(`当前状态 - buttonName: ${currentInfo.buttonName}, buttonText: ${currentInfo.buttonText}`);
        
        // 将提取结果添加到通知中
        startMessage += `- 按钮名称: ${currentInfo.buttonName || "未提取到"}\n- 按钮文本: ${currentInfo.buttonText || "未提取到"}`;
        
        // 从持久化存储中获取上一次的值
        const lastButtonName = $persistentStore.read("vmall_lastButtonName") || "";
        const lastButtonText = $persistentStore.read("vmall_lastButtonText") || "";
        
        // 判断是否发生变化
        const hasChanged = (currentInfo.buttonName !== lastButtonName || currentInfo.buttonText !== lastButtonText) &&
                          (currentInfo.buttonName || currentInfo.buttonText);
        
        // 发送监控通知
        await sendPushDeerNotification(
            hasChanged ? "⚠️ 商品状态已变化" : "✅ 商品状态检查",
            startMessage
        );
        
        // 同步发送弹窗通知显示当前状态
        $notification.post(
            "📢 商品状态通知",
            `${config.productName}`,
            `按钮名称: ${currentInfo.buttonName || "未知"}\n按钮文本: ${currentInfo.buttonText || "未知"}\n检查时间: ${new Date().toLocaleString("zh-CN")}`,
            { url: config.productUrl }
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
    } catch (error) {
        // 发送错误通知
        console.log("脚本执行出错：" + error);
        
        const errorMessage = `**监控错误**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 错误详情：${error}`;
        await sendPushDeerNotification("❌ 商品监控出错", errorMessage);
        
        $notification.post(
            "❌ 商品监控出错",
            `${config.productName}`,
            `错误: ${error}\n时间: ${new Date().toLocaleString("zh-CN")}`,
            { url: config.productUrl }
        );
    }
    
    $done();
}

// 执行主函数
checkProductStatus();