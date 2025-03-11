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
    debug: true,
    
    // 是否发送HTML片段到通知
    sendHtmlInNotification: true
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
        console.log("开始尝试提取按钮信息...");
        
        // 首先保存HTML内容到文件用于调试（仅调试模式）
        if (config.debug) {
            console.log("HTML内容长度：" + html.length);
            console.log("HTML内容前200字符：" + html.substring(0, 200));
            
            // 检查HTML中是否包含特定关键词
            const keywords = ["buttonName", "buttonText", "加入购物车", "button"];
            for (const keyword of keywords) {
                console.log(`HTML中${html.includes(keyword) ? '包含' : '不包含'}关键词：${keyword}`);
            }
        }
        
        // 直接在HTML中搜索商品状态的关键信息
        if (html.includes("加入购物车")) {
            buttonInfo.buttonName = "add_to_cart";
            buttonInfo.buttonText = "加入购物车";
            return buttonInfo;
        } else if (html.includes("已售罄") || html.includes("售罄")) {
            buttonInfo.buttonName = "soldout";
            buttonInfo.buttonText = "已售罄";
            return buttonInfo;
        } else if (html.includes("立即预约") || html.includes("预约")) {
            buttonInfo.buttonName = "appointment";
            buttonInfo.buttonText = "立即预约";
            return buttonInfo;
        } else if (html.includes("即将上市") || html.includes("coming_soon")) {
            buttonInfo.buttonName = "coming_soon";
            buttonInfo.buttonText = "即将上市";
            return buttonInfo;
        }
        
        // 如果关键词搜索失败，尝试使用正则表达式
        console.log("关键词搜索失败，尝试使用正则表达式...");
        
        // 以下是可能的几种提取模式
        const patterns = [
            // 模式1: 标准格式 buttonName: 'xxx'
            {
                nameRegex: /buttonName[\s]*:[\s]*(['"])(.*?)\1/i,
                textRegex: /buttonText[\s]*:[\s]*(['"])(.*?)\1/i
            },
            // 模式2: JSON格式 "buttonName": "xxx"
            {
                nameRegex: /["']buttonName["'][\s]*:[\s]*["'](.*?)["']/i,
                textRegex: /["']buttonText["'][\s]*:[\s]*["'](.*?)["']/i
            },
            // 模式3: 变量赋值格式 var buttonName = 'xxx'
            {
                nameRegex: /var[\s]+buttonName[\s]*=[\s]*["'](.*?)["']/i,
                textRegex: /var[\s]+buttonText[\s]*=[\s]*["'](.*?)["']/i
            }
        ];
        
        // 尝试所有可能的模式
        for (const pattern of patterns) {
            const nameMatch = html.match(pattern.nameRegex);
            if (nameMatch && nameMatch.length > 1) {
                buttonInfo.buttonName = nameMatch[nameMatch.length - 1];
                console.log(`找到buttonName: ${buttonInfo.buttonName}, 使用模式: ${pattern.nameRegex}`);
            }
            
            const textMatch = html.match(pattern.textRegex);
            if (textMatch && textMatch.length > 1) {
                buttonInfo.buttonText = textMatch[textMatch.length - 1];
                console.log(`找到buttonText: ${buttonInfo.buttonText}, 使用模式: ${pattern.textRegex}`);
            }
            
            // 如果两个值都找到了，就停止搜索
            if (buttonInfo.buttonName && buttonInfo.buttonText) {
                break;
            }
        }
        
        // 如果仍然未找到任何值，尝试查找任何按钮相关信息
        if (!buttonInfo.buttonName && !buttonInfo.buttonText) {
            console.log("标准提取方法均失败，尝试查找任何按钮相关信息...");
            
            // 尝试找到所有包含button或btn的标签
            const buttonRegex = /<button[^>]*>(.*?)<\/button>/gi;
            const buttonMatches = html.match(buttonRegex);
            
            if (buttonMatches && buttonMatches.length > 0) {
                console.log("找到按钮元素：" + buttonMatches[0]);
                // 分析第一个按钮
                const firstButton = buttonMatches[0];
                
                // 提取按钮文本
                const textMatch = firstButton.match(/>([^<]+)</);
                if (textMatch && textMatch[1]) {
                    buttonInfo.buttonText = textMatch[1].trim();
                }
                
                // 提取按钮类型/名称 (从class或id属性)
                const classMatch = firstButton.match(/class=["']([^"']*?)["']/i);
                if (classMatch && classMatch[1]) {
                    buttonInfo.buttonName = classMatch[1].includes("disabled") ? "soldout" : "unknown_" + classMatch[1];
                }
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
    
    // 开始检查的状态通知，在获取按钮信息后再发送
    let startMessage = `**监控开始**\n- 商品：${config.productName}\n- 时间：${new Date().toLocaleString("zh-CN")}\n- 状态：开始检查\n- 链接：${config.productUrl}\n`;
    
    try {
        let html = "";
        let fetchSuccess = false;
        
        // 尝试POST请求
        console.log("尝试使用POST方法请求...");
        try {
            const postResponse = await $httpClient.post({
                url: config.productUrl,
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Connection": "keep-alive",
                    "Referer": "https://m.vmall.com/"
                },
                timeout: 30000 // 设置30秒超时
            });
            
            if (postResponse && postResponse.body) {
                html = postResponse.body;
                fetchSuccess = true;
                console.log("POST请求成功获取HTML内容");
            }
        } catch (postError) {
            console.log("POST请求失败: " + postError);
        }
        
        // 如果POST失败，尝试GET请求
        if (!fetchSuccess) {
            console.log("尝试使用GET方法请求...");
            try {
                const getResponse = await $httpClient.get({
                    url: config.productUrl,
                    headers: {
                        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
                        "Connection": "keep-alive",
                        "Referer": "https://m.vmall.com/"
                    },
                    timeout: 30000 // 设置30秒超时
                });
                
                if (getResponse && getResponse.body) {
                    html = getResponse.body;
                    fetchSuccess = true;
                    console.log("GET请求成功获取HTML内容");
                }
            } catch (getError) {
                console.log("GET请求失败: " + getError);
                throw new Error("GET和POST请求均失败: " + getError);
            }
        }
        
        if (!fetchSuccess || !html) {
            throw new Error("无法获取HTML内容，请求结果为空");
        }
        
        // 提取按钮信息
        const currentInfo = extractButtonInfo(html);
        console.log(`当前状态 - buttonName: ${currentInfo.buttonName}, buttonText: ${currentInfo.buttonText}`);
        
        // 将按钮信息添加到开始通知中
        startMessage += `- 按钮名称: ${currentInfo.buttonName || "未提取到"}\n- 按钮文本: ${currentInfo.buttonText || "未提取到"}`;
        
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