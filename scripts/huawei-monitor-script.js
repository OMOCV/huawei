// 华为商城商品状态监控脚本

// 脚本配置 - 使用前请修改以下配置
const config = {
    // 监控商品配置
    productUrl: "https://m.vmall.com/product/comdetail/index.html?prdId=10086989076790",
    productName: "华为 Mate 70 Pro+", // 根据截图修改为实际商品名称

    // PushDeer配置
    pushDeerKey: "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV", // 需要替换为用户自己的PushDeer Key
    pushDeerUrl: "https://api2.pushdeer.com/message/push",
    
    // 调试模式 - 设置为true时会输出更多日志
    debug: true
};

// 发送PushDeer通知的函数
async function sendPushDeerNotification(title, content) {
    if (!config.pushDeerKey || config.pushDeerKey === "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV") {
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
        // 使用正则表达式提取buttonName（更加宽松的匹配模式）
        const buttonNameRegex = /buttonName[\s]*:[\s]*(['"])(.*?)\1/i;
        const buttonNameMatch = html.match(buttonNameRegex);
        if (buttonNameMatch && buttonNameMatch[2]) {
            buttonInfo.buttonName = buttonNameMatch[2];
        }
        
        // 使用正则表达式提取buttonText（更加宽松的匹配模式）
        const buttonTextRegex = /buttonText[\s]*:[\s]*(['"])(.*?)\1/i;
        const buttonTextMatch = html.match(buttonTextRegex);
        if (buttonTextMatch && buttonTextMatch[2]) {
            buttonInfo.buttonText = buttonTextMatch[2];
        }
        
        // 如果第一种正则表达式没有匹配成功，尝试另一种可能的格式
        if (!buttonInfo.buttonName) {
            const altButtonNameRegex = /["']buttonName["'][\s]*:[\s]*["'](.*?)["']/i;
            const altButtonNameMatch = html.match(altButtonNameRegex);
            if (altButtonNameMatch && altButtonNameMatch[1]) {
                buttonInfo.buttonName = altButtonNameMatch[1];
            }
        }
        
        if (!buttonInfo.buttonText) {
            const altButtonTextRegex = /["']buttonText["'][\s]*:[\s]*["'](.*?)["']/i;
            const altButtonTextMatch = html.match(altButtonTextRegex);
            if (altButtonTextMatch && altButtonTextMatch[1]) {
                buttonInfo.buttonText = altButtonTextMatch[1];
            }
        }
    } catch (error) {
        console.log("提取按钮信息出错: " + error);
    }
    
    return buttonInfo;
}

// 主函数
async function checkProductStatus() {
    // 重试次数和间隔设置
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5秒
    let retryCount = 0;
    
    // 判断是否首次运行
    const isFirstRun = $persistentStore.read("vmall_isFirstRun") === null;
    
    // 记录开始时间
    const startTime = new Date().toLocaleString("zh-CN");
    
    // 发送工作流开始通知
    await sendPushDeerNotification(
        "🔍 商品监控运行",
        `**监控开始**\n- 商品：${config.productName}\n- 时间：${startTime}\n- 状态：开始检查\n- 链接：${config.productUrl}`
    );
    
    try {
        let response;
        let html;
        
        // 添加重试机制
        while (retryCount < MAX_RETRIES) {
            try {
                // 获取网页内容
                response = await $httpClient.get({
                    url: config.productUrl,
                    timeout: 30000 // 设置30秒超时
                });
                
                // 检查响应是否有效
                if (response && response.body) {
                    html = response.body;
                    break; // 成功获取数据，跳出重试循环
                } else {
                    throw new Error("响应为空");
                }
            } catch (fetchError) {
                retryCount++;
                console.log(`第${retryCount}次请求失败: ${fetchError}`);
                
                if (retryCount >= MAX_RETRIES) {
                    throw new Error(`请求失败，已重试${MAX_RETRIES}次: ${fetchError}`);
                }
                
                // 等待一段时间后重试
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
        }
        
        // 调试模式：输出HTML片段以便分析
        if (config.debug) {
            console.log("HTML片段预览（前1000字符）:");
            console.log(html.substring(0, 1000));
        }
        
        // 提取按钮信息
        const currentInfo = extractButtonInfo(html);
        console.log(`当前状态 - buttonName: ${currentInfo.buttonName}, buttonText: ${currentInfo.buttonText}`);
        
        // 如果提取失败，发送警告
        if (!currentInfo.buttonName && !currentInfo.buttonText) {
            await sendPushDeerNotification(
                "⚠️ 商品监控警告",
                `**提取失败**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 可能网页结构已变化，请检查脚本`
            );
            $notification.post("商品监控警告", "提取信息失败", "可能网页结构已变化，请检查脚本");
            $done();
            return;
        }
        
        // 从持久化存储中获取上一次的值
        const lastButtonName = $persistentStore.read("vmall_lastButtonName") || "";
        const lastButtonText = $persistentStore.read("vmall_lastButtonText") || "";
        
        // 判断是否发生变化
        const hasChanged = (currentInfo.buttonName !== lastButtonName || currentInfo.buttonText !== lastButtonText);
        
        // 构建状态消息
        let statusMessage = `**商品状态**\n- 商品名称：${config.productName}\n- 当前按钮名称：${currentInfo.buttonName}\n- 当前按钮文本：${currentInfo.buttonText}\n`;
        
        // 如果不是首次运行，添加对比信息
        if (!isFirstRun) {
            statusMessage += `- 上次按钮名称：${lastButtonName}\n- 上次按钮文本：${lastButtonText}\n`;
            statusMessage += `- 状态变化：${hasChanged ? '✅ 已变化' : '❌ 无变化'}\n`;
        } else {
            statusMessage += `- 首次运行，记录初始状态\n`;
            // 设置首次运行标志为false
            $persistentStore.write("false", "vmall_isFirstRun");
        }
        
        // 添加时间信息
        statusMessage += `- 检查时间：${new Date().toLocaleString("zh-CN")}`;
        
        // 更新持久化存储
        $persistentStore.write(currentInfo.buttonName, "vmall_lastButtonName");
        $persistentStore.write(currentInfo.buttonText, "vmall_lastButtonText");
        
        // 发送工作流完成通知
        await sendPushDeerNotification(
            hasChanged && !isFirstRun ? "⚠️ 商品状态已变化 ⚠️" : "✅ 商品状态检查完成",
            statusMessage
        );
        
        // 如果状态发生变化且不是首次运行，则发送弹窗通知
        if (hasChanged && !isFirstRun) {
            $notification.post(
                "⚠️ 商品状态变化提醒",
                `${config.productName} 状态已更新`,
                `按钮名称: ${currentInfo.buttonName}\n按钮文本: ${currentInfo.buttonText}`,
                {
                    url: config.productUrl
                }
            );
        }
        
        // 完成脚本执行
        $done();
        
    } catch (error) {
        // 发送错误通知
        const errorMessage = `**监控错误**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 错误详情：${error}`;
        await sendPushDeerNotification("❌ 商品监控出错", errorMessage);
        console.log("脚本执行出错：" + error);
        $notification.post("商品监控出错", "", error);
        $done();
    }
}

// 执行主函数
checkProductStatus();