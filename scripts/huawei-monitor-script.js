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
            },
            // 模式4: 使用双引号 buttonName: "xxx"
            {
                nameRegex: /buttonName[\s]*:[\s]*"(.*?)"/i,
                textRegex: /buttonText[\s]*:[\s]*"(.*?)"/i
            },
            // 模式5: 使用双引号 'buttonName': "xxx"
            {
                nameRegex: /'buttonName'[\s]*:[\s]*["'](.*?)["']/i,
                textRegex: /'buttonText'[\s]*:[\s]*["'](.*?)["']/i
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
        
        // 如果未找到任何值，尝试找出所有可能的buttonName和buttonText
        if (!buttonInfo.buttonName && !buttonInfo.buttonText) {
            console.log("未通过模式匹配找到按钮信息，尝试查找所有包含button的文本...");
            
            // 尝试找出所有包含button的行
            const buttonLines = html.split('\n')
                .filter(line => line.includes('button') || line.includes('Button'))
                .slice(0, 10);  // 只取前10行
                
            if (buttonLines.length > 0) {
                console.log("找到可能相关的按钮文本行:");
                buttonLines.forEach((line, i) => console.log(`${i+1}: ${line.trim()}`));
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
        let html = "";
        let fetchSuccess = false;
        
        // 添加重试机制
        while (retryCount < MAX_RETRIES) {
            try {
                // 获取网页内容
                response = await $httpClient.get({
                    url: config.productUrl,
                    headers: {
                        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "zh-CN,zh-Hans;q=0.9"
                    },
                    timeout: 30000 // 设置30秒超时
                });
                
                // 检查响应是否有效
                if (response && response.body) {
                    html = response.body;
                    fetchSuccess = true;
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
            
            // 输出到通知
            await sendPushDeerNotification(
                "🔍 HTML调试信息",
                `**HTML片段预览**\n\`\`\`\n${html.substring(0, 300)}\n...\n\`\`\``
            );
        }
        
        // 提取按钮信息
        const currentInfo = extractButtonInfo(html);
        console.log(`当前状态 - buttonName: ${currentInfo.buttonName}, buttonText: ${currentInfo.buttonText}`);
        
        // 立即通知当前提取到的值（无论是否提取成功）
        const extractionStatus = `**当前提取结果**\n- 成功获取HTML: ${fetchSuccess ? '✅' : '❌'}\n- 提取到的buttonName: ${currentInfo.buttonName || "未提取到"}\n- 提取到的buttonText: ${currentInfo.buttonText || "未提取到"}\n- 提取时间: ${new Date().toLocaleString("zh-CN")}`;
        
        await sendPushDeerNotification(
            "🔄 商品监控提取结果",
            extractionStatus
        );
        
        // 如果提取失败，发送警告
        if (!currentInfo.buttonName && !currentInfo.buttonText) {
            await sendPushDeerNotification(
                "⚠️ 商品监控警告",
                `**提取失败**\n- 时间：${new Date().toLocaleString("zh-CN")}\n- HTML获取: ${fetchSuccess ? "成功" : "失败"}\n- 可能网页结构已变化，请检查脚本\n\n**HTML片段**\n\`\`\`\n${html.substring(0, 200)}...\n\`\`\``
            );
            
            // 即使提取失败也发送弹窗通知
            $notification.post(
                "⚠️ 商品监控提取失败",
                `${config.productName}: 无法提取按钮信息`,
                `请检查脚本或网页结构是否变化\n检查时间: ${new Date().toLocaleString("zh-CN")}`,
                { url: config.productUrl }
            );
            
            $done();
            return;
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
        
        // 即使状态没有变化，也立即发送当前状态弹窗通知
        $notification.post(
            "📢 商品当前状态",
            `${config.productName}`,
            `按钮名称: ${currentInfo.buttonName || "未知"}\n按钮文本: ${currentInfo.buttonText || "未知"}\n检查时间: ${new Date().toLocaleString("zh-CN")}`,
            {
                url: config.productUrl
            }
        );
        
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