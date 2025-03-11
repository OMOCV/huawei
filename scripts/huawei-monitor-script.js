// 华为商城商品状态监控脚本

// 脚本配置 - 使用前请修改以下配置
const config = {
    // 监控商品配置
    productUrl: "https://m.vmall.com/product/comdetail/index.html?prdId=10086989076790",
    productName: "华为 Mate 70 Pro+", // 根据截图修改为实际商品名称
    
    // 备用商品URL
    backupUrl: "https://m.vmall.com/product/10086989076790.html",

    // PushDeer配置
    pushDeerKey: "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV", // 需要替换为用户自己的PushDeer Key
    pushDeerUrl: "https://api2.pushdeer.com/message/push",
    
    // 调试模式 - 设置为true时会输出更多日志
    debug: true,
    
    // 是否发送HTML片段到通知
    sendHtmlInNotification: true,
    
    // 在无法获取正常状态时是否使用估算状态
    useEstimatedState: true
};

// 发送PushDeer通知的函数
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

// 提取按钮信息 - 专为华为商城JSON结构设计
function extractButtonInfo(html) {
    const buttonInfo = {
        buttonName: "",
        buttonText: ""
    };
    
    if (!html || html.length < 100) {
        console.log("HTML内容为空或太短，无法提取信息");
        return buttonInfo;
    }
    
    try {
        console.log("使用针对华为商城的JSON提取逻辑...");
        
        // 1. 尝试提取NEXT_DATA脚本内容
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
        if (nextDataMatch && nextDataMatch[1]) {
            console.log("找到NEXT_DATA脚本内容");
            const jsonContent = nextDataMatch[1];
            
            // 2. 直接提取buttonName和buttonText
            const buttonNameMatch = jsonContent.match(/"buttonName"\s*:\s*"([^"]+)"/);
            const buttonTextMatch = jsonContent.match(/"buttonText"\s*:\s*"([^"]+)"/);
            
            if (buttonNameMatch && buttonNameMatch[1]) {
                buttonInfo.buttonName = buttonNameMatch[1];
                console.log(`从JSON中提取到buttonName: ${buttonInfo.buttonName}`);
            }
            
            if (buttonTextMatch && buttonTextMatch[1]) {
                buttonInfo.buttonText = buttonTextMatch[1];
                console.log(`从JSON中提取到buttonText: ${buttonInfo.buttonText}`);
            }
            
            // 如果找到了其中任何一个值，就认为提取成功
            if (buttonInfo.buttonName || buttonInfo.buttonText) {
                return buttonInfo;
            }
        } else {
            console.log("未找到NEXT_DATA脚本内容");
        }
        
        // 备用方法：直接在整个HTML中搜索
        console.log("尝试在整个HTML中搜索...");
        const directButtonNameMatch = html.match(/"buttonName"\s*:\s*"([^"]+)"/);
        const directButtonTextMatch = html.match(/"buttonText"\s*:\s*"([^"]+)"/);
        
        if (directButtonNameMatch && directButtonNameMatch[1]) {
            buttonInfo.buttonName = directButtonNameMatch[1];
            console.log(`直接从HTML中提取到buttonName: ${buttonInfo.buttonName}`);
        }
        
        if (directButtonTextMatch && directButtonTextMatch[1]) {
            buttonInfo.buttonText = directButtonTextMatch[1];
            console.log(`直接从HTML中提取到buttonText: ${buttonInfo.buttonText}`);
        }
        
        // 如果仍然没有找到，尝试识别常见状态
        if (!buttonInfo.buttonName && !buttonInfo.buttonText) {
            console.log("尝试识别常见状态...");
            if (html.includes("加入购物车")) {
                buttonInfo.buttonName = "add_to_cart";
                buttonInfo.buttonText = "加入购物车";
            } else if (html.includes("立即购买")) {
                buttonInfo.buttonName = "buy_now";
                buttonInfo.buttonText = "立即购买";
            } else if (html.includes("已售罄") || html.includes("售罄")) {
                buttonInfo.buttonName = "soldout";
                buttonInfo.buttonText = "已售罄";
            } else if (html.includes("预约申购已结束")) {
                buttonInfo.buttonName = "appointment_ended";
                buttonInfo.buttonText = "预约申购已结束";
            } else if (html.includes("立即预约") || html.includes("预约")) {
                buttonInfo.buttonName = "appointment";
                buttonInfo.buttonText = "立即预约";
            } else if (html.includes("即将上市")) {
                buttonInfo.buttonName = "coming_soon";
                buttonInfo.buttonText = "即将上市";
            }
        }
        
        return buttonInfo;
    } catch (error) {
        console.log("提取按钮信息出错: " + error);
        return {
            buttonName: "error",
            buttonText: "提取错误: " + error
        };
    }
}

// 主函数
async function checkProductStatus() {
    // 重试次数和间隔设置
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5秒
    let retryCount = 0;
    
    // 判断是否首次运行
    const isFirstRun = $persistentStore.read("vmall_isFirstRun") === null;
    
    // 开始检查的状态通知，在获取按钮信息后再发送
    let startMessage = `**监控开始**\n- 商品：${config.productName}\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 状态：开始检查\n- 链接：${config.productUrl}\n`;
    
    try {
        let html = "";
        let fetchSuccess = false;
        
        // 完全模拟浏览器的请求头
        const fullHeaders = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Cache-Control": "max-age=0",
            "Referer": "https://www.vmall.com/",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1",
            "Pragma": "no-cache"
        };
        
        console.log("直接访问URL: " + config.productUrl);
        
        // 定义一个更强健的请求函数
        const fetchWithMethod = async (method) => {
            try {
                const options = {
                    url: config.productUrl,
                    headers: fullHeaders
                };
                
                if (method === 'post') {
                    options.body = ""; // 空body
                }
                
                const response = await $httpClient[method](options);
                
                if (response && response.status === 200 && response.body) {
                    console.log(`${method.toUpperCase()}请求成功，状态码: ${response.status}`);
                    console.log(`响应头: ${JSON.stringify(response.headers)}`);
                    return response.body;
                } else {
                    console.log(`${method.toUpperCase()}请求异常，状态码: ${response?.status || '未知'}`);
                    return null;
                }
            } catch (error) {
                console.log(`${method.toUpperCase()}请求出错: ${error}`);
                return null;
            }
        };
        
        // 尝试使用不同的方法获取HTML
        const methods = ['get', 'post']; // 先GET后POST
        
        for (const method of methods) {
            console.log(`尝试使用${method.toUpperCase()}方法请求...`);
            const result = await fetchWithMethod(method);
            
            if (result) {
                html = result;
                fetchSuccess = true;
                console.log(`${method.toUpperCase()}请求成功获取HTML内容，长度: ${html.length}`);
                break;
            }
        }
        
        // 如果以上方法都失败，尝试直接请求移动端URL
        if (!fetchSuccess) {
            console.log("常规请求失败，尝试访问备用URL...");
            
            // 尝试使用完全不同的URL格式
            const backupUrl = `https://m.vmall.com/product/10086989076790.html`;
            
            for (const method of methods) {
                try {
                    const options = {
                        url: backupUrl,
                        headers: fullHeaders
                    };
                    
                    const response = await $httpClient[method](options);
                    
                    if (response && response.status === 200 && response.body) {
                        html = response.body;
                        fetchSuccess = true;
                        console.log(`备用URL ${method.toUpperCase()}请求成功，长度: ${html.length}`);
                        break;
                    }
                } catch (error) {
                    console.log(`备用URL ${method.toUpperCase()}请求失败: ${error}`);
                }
            }
        }
        
        if (!fetchSuccess || !html) {
            throw new Error("无法获取HTML内容，请求结果为空");
        }
        
        // 提取按钮信息
        const currentInfo = extractButtonInfo(html);
        console.log(`当前状态 - buttonName: ${currentInfo.buttonName}, buttonText: ${currentInfo.buttonText}`);
        
        // 将按钮信息添加到开始通知中
        startMessage += `- 按钮名称: ${currentInfo.buttonName || "未提取到"}\n- 按钮文本: ${currentInfo.buttonText || "未提取到"}\n- HTML长度: ${html.length}字节`;
        
        // 发送更新后的通知
        await sendPushDeerNotification(
            "🔍 商品监控运行",
            startMessage
        );
        
        // 在Surge通知中也显示按钮状态
        $notification.post(
            "📢 商品监控运行",
            `${config.productName}`,
            `状态: 开始检查\n按钮名称: ${currentInfo.buttonName || "未提取到"}\n按钮文本: ${currentInfo.buttonText || "未提取到"}\n时间: ${new Date().toLocaleString("zh-CN")}`,
            { url: config.productUrl }
        );
        
        // 如果提取失败，发送警告
        if (!currentInfo.buttonName && !currentInfo.buttonText) {
            const warningMsg = `**提取警告**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- HTML获取: ${fetchSuccess ? "成功" : "失败"}\n- 可能网页结构已变化，请检查脚本`;
            
            // 在调试模式下添加HTML片段
            if (config.debug && config.sendHtmlInNotification) {
                warningMsg += `\n\n**HTML片段**\n\`\`\`\n${html.substring(0, 200)}...\n\`\`\``;
            }
            
            await sendPushDeerNotification("⚠️ 商品监控警告", warningMsg);
            
            // 即使提取失败也更新状态中的按钮信息为"未能提取"
            // 不需要额外操作，因为已经在startMessage中添加了这些信息
            
            // 由于已经发送了按钮状态，不需要在这里停止脚本
            // 继续执行，尝试对比之前的状态
        }
        
        // 从持久化存储中获取上一次的值
        const lastButtonName = $persistentStore.read("vmall_lastButtonName") || "";
        const lastButtonText = $persistentStore.read("vmall_lastButtonText") || "";
        
        // 判断是否发生变化
        const hasChanged = (currentInfo.buttonName !== lastButtonName || currentInfo.buttonText !== lastButtonText);
        
        // 解析当前商品状态含义
        let statusExplanation = "";
        if (currentInfo.buttonName === "add_to_cart" && currentInfo.buttonText === "加入购物车") {
            statusExplanation = "✅ 可以购买";
        } else if (currentInfo.buttonName === "appointment" || currentInfo.buttonText.includes("预约")) {
            statusExplanation = "🕒 仅可预约";
        } else if (currentInfo.buttonName === "soldout" || currentInfo.buttonText.includes("售罄")) {
            statusExplanation = "❌ 已售罄";
        } else if (currentInfo.buttonName === "coming_soon" || currentInfo.buttonText.includes("即将")) {
            statusExplanation = "🔜 即将上市";
        } else {
            statusExplanation = "⚠️ 未知状态";
        }
        
        // 构建状态消息
        let statusMessage = `**商品状态监控通知**\n`;
        statusMessage += `\n### 基本信息\n`;
        statusMessage += `- 商品名称：${config.productName}\n`;
        statusMessage += `- 检查时间：${new Date().toLocaleString("zh-CN")}\n`;
        
        statusMessage += `\n### 当前状态\n`;
        statusMessage += `- 状态含义：${statusExplanation}\n`;
        statusMessage += `- 按钮名称：${currentInfo.buttonName || "未获取到"}\n`;
        statusMessage += `- 按钮文本：${currentInfo.buttonText || "未获取到"}\n`;
        
        // 如果不是首次运行，添加对比信息
        if (!isFirstRun) {
            statusMessage += `\n### 对比信息\n`;
            statusMessage += `- 上次按钮名称：${lastButtonName || "未获取到"}\n`;
            statusMessage += `- 上次按钮文本：${lastButtonText || "未获取到"}\n`;
            statusMessage += `- 状态变化：${hasChanged ? '✅ 已变化' : '❌ 无变化'}\n`;
        } else {
            statusMessage += `\n### 初始化信息\n`;
            statusMessage += `- 首次运行，记录初始状态\n`;
            // 设置首次运行标志为false
            $persistentStore.write("false", "vmall_isFirstRun");
        }
        
        statusMessage += `\n### 链接信息\n`;
        statusMessage += `- 商品链接：${config.productUrl}`;
        
        // 更新持久化存储
        $persistentStore.write(currentInfo.buttonName, "vmall_lastButtonName");
        $persistentStore.write(currentInfo.buttonText, "vmall_lastButtonText");
        
        // 构建通知标题
        let notificationTitle = "";
        if (hasChanged && !isFirstRun) {
            notificationTitle = `⚠️ ${config.productName} 状态变化 ⚠️ (${statusExplanation})`;
        } else {
            notificationTitle = `✅ ${config.productName} 状态检查 (${statusExplanation})`;
        }
        
        // 发送工作流完成通知
        await sendPushDeerNotification(notificationTitle, statusMessage);
        
        // 如果状态发生变化且不是首次运行，则发送弹窗通知
        if (hasChanged && !isFirstRun) {
            $notification.post(
                "⚠️ 商品状态变化提醒",
                `${config.productName}: ${statusExplanation}`,
                `按钮名称: ${currentInfo.buttonName}\n按钮文本: ${currentInfo.buttonText}\n检查时间: ${new Date().toLocaleString("zh-CN")}`,
                {
                    url: config.productUrl
                }
            );
        }
        
    } catch (error) {
        // 发送错误通知
        const errorMessage = `**监控错误**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 错误详情：${error}`;
        await sendPushDeerNotification("❌ 商品监控出错", errorMessage);
        console.log("脚本执行出错：" + error);
        
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