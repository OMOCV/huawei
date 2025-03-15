// 华为商城商品状态监控脚本 - 增强版
// 支持多商品独立配置、价格变化通知、优惠价显示等增强功能
// 新增功能：多渠道推送、价格历史记录、批量导入商品
// 修复了预约申购状态商品被误判为促销商品的问题
// 修复了价格历史记录相关功能的兼容性问题
// 更新日期: 2025-03-15

// ======== 基础配置功能 ========

// 解析链接文本为结构化数据 - 加强版，支持额外格式 (已修复兼容性)
function parseLinksText(text) {
  if (!text) return [];
  
  // 分割文本为行
  const lines = text.split('\n').filter(function(line) { return line.trim(); });
  const result = [];
  
  // 处理每一行 - 替换 forEach 为普通 for 循环
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // 检查是否包含启用/禁用标记
    let url = line.trim();
    let enabled = true;
    let name = ""; // 可选的商品名称
    
    // 匹配 [true] 或 [false] 标记
    const enabledMatches = url.match(/\[(true|false)\]$/i);
    if (enabledMatches) {
      enabled = enabledMatches[1].toLowerCase() === 'true';
      url = url.replace(/\[(true|false)\]$/i, '').trim();
    }
    
    // 匹配可能的商品名称 "商品名称 url"
    if (url.includes(" http")) {
      const parts = url.split(/\s+(https?:\/\/)/);
      if (parts.length >= 2) {
        name = parts[0].trim();
        url = (parts[1] + (parts[2] || "")).trim();
      }
    }
    
    // 添加到结果
    if (url && url.includes("http")) {
      result.push({
        url: url,
        enabled: enabled,
        name: name // 可选字段
      });
    }
  }
  
  return result;
}

// 读取PushDeer Key - 兼容多种键名 (已修复兼容性)
function getPushDeerKey() {
  // 尝试多种可能的键名
  const possibleKeys = [
    "vmall.notification.pushDeerKey", // 新增：子应用中的键名
    "vmall.pushDeerKey",  // 带命名空间前缀
    "pushDeerKey",        // 不带前缀
    "vmall.pushkey",      // 可能的其他写法
    "pushkey"             // 可能的其他写法
  ];
  
  // 替换 for...of 循环为普通 for 循环
  for (let i = 0; i < possibleKeys.length; i++) {
    const key = possibleKeys[i];
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
    
    // 使用解析函数解析链接文本
    const oldLinks = parseLinksText(linksText);
    for (let i = 0; i < oldLinks.length; i++) {
      productLinks.push(oldLinks[i]);
    }
  }
  
  console.log(`共读取到 ${productLinks.length} 个商品链接`);
  
  // 读取通知渠道设置
  const notifyChannel = $persistentStore.read("vmall.notifyChannel") || 
                        $persistentStore.read("notifyChannel") || 
                        "pushDeer";
  
  // 读取是否保存历史记录
  const saveHistory = ($persistentStore.read("vmall.saveHistory") === "true") || 
                      ($persistentStore.read("saveHistory") === "true") || 
                      true;
  
  // 读取历史记录保存天数
  const historyDays = parseInt($persistentStore.read("vmall.historyDays") || 
                               $persistentStore.read("historyDays") || 
                               "30");
  
  // 尝试读取其他配置
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
    notifyChannel: notifyChannel,
    saveHistory: saveHistory,
    historyDays: historyDays,
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

// ======== 多渠道推送功能 ========

// 通用发送通知函数 - 支持多渠道
function sendNotification(title, content, callback) {
  const config = getConfig();
  const notifyChannel = config.notifyChannel;
  
  console.log(`使用 ${notifyChannel} 发送通知`);
  
  // 根据配置的通知渠道选择对应的发送函数
  switch (notifyChannel) {
    case "pushDeer":
      sendPushDeerNotification(title, content, callback);
      break;
    case "bark":
      sendBarkNotification(title, content, callback);
      break;
    case "telegram":
      sendTelegramNotification(title, content, callback);
      break;
    case "serverChan":
      sendServerChanNotification(title, content, callback);
      break;
    case "pushPlus":
      sendPushPlusNotification(title, content, callback);
      break;
    case "wework":
      sendWeworkNotification(title, content, callback);
      break;
    case "email":
      sendEmailNotification(title, content, callback);
      break;
    default:
      // 默认使用PushDeer
      sendPushDeerNotification(title, content, callback);
  }
}

// 发送PushDeer通知函数
function sendPushDeerNotification(title, content, callback) {
  // 尝试读取PushDeer配置
  const pushDeerKey = getPushDeerKey();
  const pushDeerUrl = $persistentStore.read("vmall.notification.pushDeerUrl") || 
                      $persistentStore.read("vmall.pushDeerUrl") || 
                      $persistentStore.read("pushDeerUrl") || 
                      "https://api2.pushdeer.com/message/push";
  
  // 检查PushDeer配置
  if (!pushDeerKey) {
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
    "pushkey": pushDeerKey,
    "text": title,
    "desp": content,
    "type": "markdown"
  };
  
  $httpClient.post({
    url: pushDeerUrl,
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

// 发送Bark通知函数
function sendBarkNotification(title, content, callback) {
  // 读取Bark配置
  const barkKey = $persistentStore.read("vmall.notification.barkKey") || 
                  $persistentStore.read("vmall.barkKey") || 
                  $persistentStore.read("barkKey");
  const barkUrl = $persistentStore.read("vmall.notification.barkUrl") || 
                  $persistentStore.read("vmall.barkUrl") || 
                  $persistentStore.read("barkUrl") || 
                  "https://api.day.app";
  
  // 检查Bark配置
  if (!barkKey) {
    console.log("Bark Key未配置，无法发送通知");
    $notification.post(
      "配置错误", 
      "Bark Key未配置", 
      "请在BoxJS中配置您的Bark Key"
    );
    
    callback && callback();
    return;
  }
  
  // 构建Bark URL
  let url = `${barkUrl}/${barkKey}/${encodeURIComponent(title)}/${encodeURIComponent(content)}`;
  
  // 添加参数
  url += "?isArchive=1&sound=bell";
  
  $httpClient.get({
    url: url
  }, function(error, response, data) {
    if (error) {
      console.log("Bark通知发送失败：" + error);
      $notification.post("Bark通知失败", "", error);
    } else {
      console.log("Bark通知已发送");
    }
    callback && callback();
  });
}

// 发送Telegram通知函数
function sendTelegramNotification(title, content, callback) {
  // 读取Telegram配置
  const telegramBotToken = $persistentStore.read("vmall.notification.telegramBotToken") || 
                           $persistentStore.read("vmall.telegramBotToken") || 
                           $persistentStore.read("telegramBotToken");
  const telegramChatId = $persistentStore.read("vmall.notification.telegramChatId") || 
                         $persistentStore.read("vmall.telegramChatId") || 
                         $persistentStore.read("telegramChatId");
  
  // 检查Telegram配置
  if (!telegramBotToken || !telegramChatId) {
    console.log("Telegram配置不完整，无法发送通知");
    $notification.post(
      "配置错误", 
      "Telegram配置不完整", 
      "请在BoxJS中配置您的Telegram Bot Token和Chat ID"
    );
    
    callback && callback();
    return;
  }
  
  // 组合标题和内容
  const text = `*${title}*\n\n${content}`;
  
  // 构建请求
  const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
  const postData = {
    "chat_id": telegramChatId,
    "text": text,
    "parse_mode": "Markdown",
    "disable_web_page_preview": true
  };
  
  $httpClient.post({
    url: url,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(postData)
  }, function(error, response, data) {
    if (error) {
      console.log("Telegram通知发送失败：" + error);
      $notification.post("Telegram通知失败", "", error);
    } else {
      console.log("Telegram通知已发送");
    }
    callback && callback();
  });
}

// 发送Server酱通知函数
function sendServerChanNotification(title, content, callback) {
  // 读取Server酱配置
  const serverChanKey = $persistentStore.read("vmall.notification.serverChanKey") || 
                       $persistentStore.read("vmall.serverChanKey") || 
                       $persistentStore.read("serverChanKey");
  
  // 检查Server酱配置
  if (!serverChanKey) {
    console.log("Server酱Key未配置，无法发送通知");
    $notification.post(
      "配置错误", 
      "Server酱Key未配置", 
      "请在BoxJS中配置您的Server酱SendKey"
    );
    
    callback && callback();
    return;
  }
  
  // 构建请求
  const url = `https://sctapi.ftqq.com/${serverChanKey}.send`;
  const body = `title=${encodeURIComponent(title)}&desp=${encodeURIComponent(content)}`;
  
  $httpClient.post({
    url: url,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body
  }, function(error, response, data) {
    if (error) {
      console.log("Server酱通知发送失败：" + error);
      $notification.post("Server酱通知失败", "", error);
    } else {
      console.log("Server酱通知已发送");
    }
    callback && callback();
  });
}

// 发送PushPlus通知函数
function sendPushPlusNotification(title, content, callback) {
  // 读取PushPlus配置
  const pushPlusToken = $persistentStore.read("vmall.notification.pushPlusToken") || 
                       $persistentStore.read("vmall.pushPlusToken") || 
                       $persistentStore.read("pushPlusToken");
  
  // 检查PushPlus配置
  if (!pushPlusToken) {
    console.log("PushPlus Token未配置，无法发送通知");
    $notification.post(
      "配置错误", 
      "PushPlus Token未配置", 
      "请在BoxJS中配置您的PushPlus Token"
    );
    
    callback && callback();
    return;
  }
  
  // 构建请求
  const url = "https://www.pushplus.plus/send";
  const postData = {
    "token": pushPlusToken,
    "title": title,
    "content": content,
    "template": "markdown"
  };
  
  $httpClient.post({
    url: url,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(postData)
  }, function(error, response, data) {
    if (error) {
      console.log("PushPlus通知发送失败：" + error);
      $notification.post("PushPlus通知失败", "", error);
    } else {
      console.log("PushPlus通知已发送");
    }
    callback && callback();
  });
}

// 发送企业微信通知函数
function sendWeworkNotification(title, content, callback) {
  // 读取企业微信配置
  const weworkKey = $persistentStore.read("vmall.notification.weworkKey") || 
                   $persistentStore.read("vmall.weworkKey") || 
                   $persistentStore.read("weworkKey");
  
  // 检查企业微信配置
  if (!weworkKey) {
    console.log("企业微信WebHook未配置，无法发送通知");
    $notification.post(
      "配置错误", 
      "企业微信WebHook未配置", 
      "请在BoxJS中配置您的企业微信机器人WebHook URL"
    );
    
    callback && callback();
    return;
  }
  
  // 构建请求
  const url = weworkKey;
  const postData = {
    "msgtype": "markdown",
    "markdown": {
      "content": `# ${title}\n${content}`
    }
  };
  
  $httpClient.post({
    url: url,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(postData)
  }, function(error, response, data) {
    if (error) {
      console.log("企业微信通知发送失败：" + error);
      $notification.post("企业微信通知失败", "", error);
    } else {
      console.log("企业微信通知已发送");
    }
    callback && callback();
  });
}

// 发送邮件通知函数 (简化版，需要使用第三方SMTP服务)
function sendEmailNotification(title, content, callback) {
  // 读取邮件配置
  const emailConfig = $persistentStore.read("vmall.notification.emailConfig") || 
                     $persistentStore.read("vmall.emailConfig") || 
                     $persistentStore.read("emailConfig");
  
  // 检查邮件配置
  if (!emailConfig) {
    console.log("邮件配置未设置，无法发送通知");
    $notification.post(
      "配置错误", 
      "邮件配置未设置", 
      "请在BoxJS中配置您的邮件信息"
    );
    
    callback && callback();
    return;
  }
  
  // 解析邮件配置 (格式: 发件人邮箱,SMTP密码,SMTP服务器,SMTP端口,收件人邮箱)
  const configArray = emailConfig.split(",");
  if (configArray.length < 5) {
    console.log("邮件配置格式不正确，无法发送通知");
    $notification.post(
      "配置错误", 
      "邮件配置格式不正确", 
      "格式应为: 发件人邮箱,SMTP密码,SMTP服务器,SMTP端口,收件人邮箱"
    );
    
    callback && callback();
    return;
  }
  
  const fromEmail = configArray[0];
  const password = configArray[1];
  const smtpServer = configArray[2];
  const smtpPort = configArray[3]; 
  const toEmail = configArray[4];
  
  // 由于Surge等环境通常不支持直接发送邮件，这里我们使用一个假设的第三方API
  // 实际场景中，您可能需要使用支持SMTP的第三方服务
  console.log("邮件发送功能需要第三方服务支持，请使用其他通知渠道");
  $notification.post(
    "邮件发送提示", 
    "邮件发送需要第三方服务", 
    "Surge等环境不支持直接发送邮件，请使用其他通知渠道"
  );
  
  // 这里可以根据需要调用第三方的邮件发送API
  
  callback && callback();
}

// ======== 历史价格记录功能 - 修复版 ========

// 保存商品价格历史记录 - 修复版
function savePriceHistory(productId, productName, price, originalPrice) {
  // 检查是否启用价格历史记录功能
  const config = getConfig();
  if (!config.saveHistory) {
    console.log("价格历史记录功能未启用，跳过保存");
    return;
  }
  
  // 仅当价格大于0时才保存
  if (!price || price <= 0) {
    console.log(`商品 ${productId} 价格为0或无效，不保存历史记录`);
    return;
  }
  
  // 读取现有历史记录
  const historyKey = `vmall_history_${productId}`;
  let historyData = $persistentStore.read(historyKey);
  let history = [];
  
  if (historyData) {
    try {
      history = JSON.parse(historyData);
    } catch (e) {
      console.log(`解析历史记录失败: ${e}，重新创建历史记录`);
      history = [];
    }
  }
  
  // 获取当前时间
  const now = new Date();
  const timestamp = now.getTime();
  const dateString = now.toISOString().split('T')[0]; // 格式: YYYY-MM-DD
  
  // 检查今天是否已经有记录 - 修复：不使用find方法，改用循环
  let todayRecord = null;
  for (let i = 0; i < history.length; i++) {
    if (history[i].date === dateString) {
      todayRecord = history[i];
      break;
    }
  }
  
  if (todayRecord) {
    // 如果价格有变化，更新今天的记录
    if (todayRecord.price !== price) {
      console.log(`商品 ${productId} 今日价格有变化，更新记录`);
      todayRecord.price = price;
      todayRecord.originalPrice = originalPrice;
      todayRecord.timestamp = timestamp;
    } else {
      console.log(`商品 ${productId} 今日价格无变化，跳过更新`);
    }
  } else {
    // 添加新记录
    console.log(`商品 ${productId} 添加新的价格记录`);
    history.push({
      date: dateString,
      price: price,
      originalPrice: originalPrice,
      timestamp: timestamp
    });
  }
  
  // 计算最低价和最高价 - 不使用Math.min/max与map的组合，改用循环
  let lowestPrice = Number.MAX_VALUE;
  let highestPrice = 0;
  
  for (let i = 0; i < history.length; i++) {
    if (history[i].price < lowestPrice) {
      lowestPrice = history[i].price;
    }
    if (history[i].price > highestPrice) {
      highestPrice = history[i].price;
    }
  }
  
  // 如果没有找到有效数据，使用当前价格
  if (lowestPrice === Number.MAX_VALUE) {
    lowestPrice = price;
  }
  
  // 保留指定天数的历史记录
  const maxDays = config.historyDays;
  if (history.length > maxDays) {
    // 按时间戳排序，保留最新的记录（手动排序方法）
    history.sort(function(a, b) {
      return b.timestamp - a.timestamp;
    });
    history = history.slice(0, maxDays);
  }
  
  // 构建完整的历史记录对象
  const historyObject = {
    productId: productId,
    productName: productName,
    history: history,
    lowestPrice: lowestPrice,
    highestPrice: highestPrice,
    lastUpdated: timestamp
  };
  
  // 保存历史记录
  $persistentStore.write(JSON.stringify(historyObject), historyKey);
  console.log(`已保存商品 ${productId} 的价格历史记录，共 ${history.length} 条`);
}

// 获取商品价格历史记录
function getPriceHistory(productId) {
  const historyKey = `vmall_history_${productId}`;
  const historyData = $persistentStore.read(historyKey);
  
  if (!historyData) {
    console.log(`未找到商品 ${productId} 的价格历史记录`);
    return null;
  }
  
  try {
    return JSON.parse(historyData);
  } catch (e) {
    console.log(`解析商品 ${productId} 的价格历史记录失败: ${e}`);
    return null;
  }
}

// 生成价格历史ASCII图表 - 修复版
function generatePriceHistoryChart(history, width = 30, height = 10) {
  if (!history || history.length === 0) {
    return "无价格历史数据";
  }
  
  // 按日期排序 - 修复：不使用sort方法，使用简单排序
  const sortedHistory = [];
  for (let i = 0; i < history.length; i++) {
    sortedHistory.push(history[i]);
  }
  
  // 冒泡排序，按日期从早到晚
  for (let i = 0; i < sortedHistory.length; i++) {
    for (let j = 0; j < sortedHistory.length - i - 1; j++) {
      const date1 = new Date(sortedHistory[j].date);
      const date2 = new Date(sortedHistory[j + 1].date);
      if (date1 > date2) {
        const temp = sortedHistory[j];
        sortedHistory[j] = sortedHistory[j + 1];
        sortedHistory[j + 1] = temp;
      }
    }
  }
  
  // 获取价格范围 - 修复：不使用Math.min/max，手动找最小最大值
  let minPrice = Number.MAX_VALUE;
  let maxPrice = 0;
  
  for (let i = 0; i < sortedHistory.length; i++) {
    if (sortedHistory[i].price < minPrice) {
      minPrice = sortedHistory[i].price;
    }
    if (sortedHistory[i].price > maxPrice) {
      maxPrice = sortedHistory[i].price;
    }
  }
  
  // 如果最大值和最小值相同，添加一点范围
  if (minPrice === maxPrice) {
    minPrice = minPrice * 0.95;
    maxPrice = maxPrice * 1.05;
  }
  
  // 初始化图表
  const chart = [];
  for (let i = 0; i < height; i++) {
    chart.push(new Array(width).fill(" "));
  }
  
  // 计算数据点位置
  const dataPoints = [];
  
  // 如果数据点少于宽度，则直接映射
  if (sortedHistory.length <= width) {
    for (let i = 0; i < sortedHistory.length; i++) {
      const x = i;
      const y = Math.round((height - 1) * (1 - (sortedHistory[i].price - minPrice) / (maxPrice - minPrice)));
      dataPoints.push({ x, y, price: sortedHistory[i].price, date: sortedHistory[i].date });
    }
  } else {
    // 如果数据点过多，需要进行抽样
    const step = sortedHistory.length / width;
    for (let i = 0; i < width; i++) {
      const index = Math.min(Math.floor(i * step), sortedHistory.length - 1);
      const item = sortedHistory[index];
      const x = i;
      const y = Math.round((height - 1) * (1 - (item.price - minPrice) / (maxPrice - minPrice)));
      dataPoints.push({ x, y, price: item.price, date: item.date });
    }
  }
  
  // 绘制数据点和连线
  for (let i = 0; i < dataPoints.length; i++) {
    const point = dataPoints[i];
    
    // 绘制数据点
    chart[point.y][point.x] = "●";
    
    // 绘制连线
    if (i > 0) {
      const prevPoint = dataPoints[i - 1];
      
      // 简单的线段绘制
      const dx = point.x - prevPoint.x;
      const dy = point.y - prevPoint.y;
      
      if (dx > 0 && dy !== 0) {
        const steps = dx;
        for (let step = 1; step < steps; step++) {
          const x = prevPoint.x + step;
          const y = Math.round(prevPoint.y + (dy * step) / steps);
          if (y >= 0 && y < height && x >= 0 && x < width) {
            if (chart[y][x] === " ") {
              chart[y][x] = "·";
            }
          }
        }
      }
    }
  }
  
  // 转换成字符串
  let chartString = "";
  for (let y = 0; y < height; y++) {
    // 添加价格标签 (只在开始、中间和结尾添加)
    if (y === 0) {
      chartString += `${maxPrice.toFixed(2)}元 `;
    } else if (y === Math.floor(height / 2)) {
      const midPrice = (maxPrice + minPrice) / 2;
      chartString += `${midPrice.toFixed(2)}元 `;
    } else if (y === height - 1) {
      chartString += `${minPrice.toFixed(2)}元 `;
    } else {
      chartString += "       ";
    }
    
    chartString += chart[y].join("") + "\n";
  }
  
  // 添加日期标签 (只在开始、中间和结尾添加)
  let dateLabels = "";
  if (dataPoints.length > 0) {
    dateLabels += "       " + " ".repeat(dataPoints[0].x) + dataPoints[0].date;
    
    if (dataPoints.length > 2) {
      const midIndex = Math.floor(dataPoints.length / 2);
      const midPoint = dataPoints[midIndex];
      const spaces = midPoint.x - dataPoints[0].date.length - dataPoints[0].x;
      dateLabels += " ".repeat(spaces > 0 ? spaces : 1) + midPoint.date;
    }
    
    if (dataPoints.length > 1) {
      const lastPoint = dataPoints[dataPoints.length - 1];
      const spaces = lastPoint.x - dateLabels.length + 7; // +7 for the initial spaces
      dateLabels += " ".repeat(spaces > 0 ? spaces : 1) + lastPoint.date;
    }
  }
  
  chartString += dateLabels;
  
  return chartString;
}

// 显示价格历史记录 - 修复版
function showPriceHistory(productId) {
  const history = getPriceHistory(productId);
  
  if (!history) {
    $notification.post(
      "价格历史记录",
      "无数据",
      `未找到商品 ID ${productId} 的价格历史记录`
    );
    return;
  }
  
  // 生成ASCII图表
  const chart = generatePriceHistoryChart(history.history);
  
  // 计算价格统计 - 修复：不使用sort方法，手动找最新记录
  let currentPrice = 0;
  if (history.history.length > 0) {
    // 找到时间戳最大的记录
    let latestRecord = history.history[0];
    for (let i = 1; i < history.history.length; i++) {
      if (history.history[i].timestamp > latestRecord.timestamp) {
        latestRecord = history.history[i];
      }
    }
    currentPrice = latestRecord.price;
  }
  
  const lowestPrice = history.lowestPrice;
  const highestPrice = history.highestPrice;
  const priceRange = highestPrice - lowestPrice;
  
  // 构建通知内容
  let content = `## 📊 ${history.productName} 价格历史\n\n`;
  content += "```\n" + chart + "\n```\n\n";
  content += `- **当前价格**: ${formatPrice(currentPrice)}\n`;
  content += `- **历史最低**: ${formatPrice(lowestPrice)}\n`;
  content += `- **历史最高**: ${formatPrice(highestPrice)}\n`;
  content += `- **价格波动**: ${formatPrice(priceRange)}\n`;
  content += `- **记录天数**: ${history.history.length}天\n`;
  content += `- **最后更新**: ${new Date(history.lastUpdated).toLocaleString("zh-CN")}\n`;
  
  // 发送通知
  sendNotification(
    `📈 ${history.productName} 价格历史`,
    content,
    function() {
      // 在通知中心也显示提示
      $notification.post(
        `📈 ${history.productName} 价格历史`,
        `最低: ${formatPrice(lowestPrice)} / 最高: ${formatPrice(highestPrice)}`,
        `当前: ${formatPrice(currentPrice)} / 波动: ${formatPrice(priceRange)}`
      );
      $done();
    }
  );
}

// 显示所有商品的价格历史汇总 - 修复版
function showAllPriceHistory() {
  // 获取所有商品链接
  const config = getConfig();
  const productLinks = config.productLinks;
  
  if (!productLinks || productLinks.length === 0) {
    $notification.post(
      "价格历史记录",
      "无数据",
      "未配置任何商品，无法显示价格历史"
    );
    $done();
    return;
  }
  
  // 收集所有商品的历史记录
  const allProductHistories = [];
  
  // 替换 forEach 为普通 for 循环
  for (let i = 0; i < productLinks.length; i++) {
    const productLink = productLinks[i];
    if (!productLink.enabled) continue;
    
    // 获取商品ID
    const productInfo = processProductLink(productLink.url);
    const id = productInfo.id;
    
    // 获取历史记录
    const history = getPriceHistory(id);
    if (history) {
      allProductHistories.push(history);
    }
  }
  
  if (allProductHistories.length === 0) {
    $notification.post(
      "价格历史记录",
      "无数据",
      "未找到任何商品的价格历史记录"
    );
    $done();
    return;
  }
  
  // 构建汇总内容
  let content = "## 📊 所有商品价格历史汇总\n\n";
  
  for (let index = 0; index < allProductHistories.length; index++) {
    const history = allProductHistories[index];
    content += `### ${index + 1}. ${history.productName}\n\n`;
    
    // 当前价格和历史价格 - 修复：手动找最新记录
    let currentPrice = 0;
    if (history.history.length > 0) {
      // 找到时间戳最大的记录
      let latestRecord = history.history[0];
      for (let i = 1; i < history.history.length; i++) {
        if (history.history[i].timestamp > latestRecord.timestamp) {
          latestRecord = history.history[i];
        }
      }
      currentPrice = latestRecord.price;
    }
    
    content += `- **当前价格**: ${formatPrice(currentPrice)}\n`;
    content += `- **历史最低**: ${formatPrice(history.lowestPrice)}\n`;
    content += `- **历史最高**: ${formatPrice(history.highestPrice)}\n`;
    
    // 计算价格波动
    const priceRange = history.highestPrice - history.lowestPrice;
    content += `- **价格波动**: ${formatPrice(priceRange)} (${(priceRange / history.highestPrice * 100).toFixed(2)}%)\n`;
    
    // 计算当前相对于历史最低的情况
    if (currentPrice > history.lowestPrice) {
      const diffFromLowest = currentPrice - history.lowestPrice;
      const percentFromLowest = (diffFromLowest / history.lowestPrice * 100).toFixed(2);
      content += `- **距历史最低**: 高出 ${formatPrice(diffFromLowest)} (${percentFromLowest}%)\n`;
    } else if (currentPrice < history.lowestPrice) {
      // 当前是新低价
      content += `- **新低价记录**: ✅ 创造历史新低\n`;
    } else {
      content += `- **历史最低价**: ✅ 当前为历史最低价\n`;
    }
    
    content += `- **记录天数**: ${history.history.length}天\n\n`;
    
    // 添加简易图表表示最近的价格趋势 (仅显示简单的上升/下降) - 修复：手动排序
    if (history.history.length >= 2) {
      // 复制并按日期排序，从新到旧
      const sortedHistory = [];
      for (let i = 0; i < history.history.length; i++) {
        sortedHistory.push(history.history[i]);
      }
      
      // 冒泡排序，按时间戳从大到小
      for (let i = 0; i < sortedHistory.length; i++) {
        for (let j = 0; j < sortedHistory.length - i - 1; j++) {
          if (sortedHistory[j].timestamp < sortedHistory[j + 1].timestamp) {
            const temp = sortedHistory[j];
            sortedHistory[j] = sortedHistory[j + 1];
            sortedHistory[j + 1] = temp;
          }
        }
      }
      
      // 取最近5个价格点
      const recentPrices = sortedHistory.slice(0, Math.min(5, sortedHistory.length));
      
      content += "**最近趋势**: ";
      
      // 判断整体趋势
      const firstPrice = recentPrices[recentPrices.length - 1].price;
      const lastPrice = recentPrices[0].price;
      
      if (lastPrice > firstPrice) {
        content += "📈 上升 ";
      } else if (lastPrice < firstPrice) {
        content += "📉 下降 ";
      } else {
        content += "➖ 平稳 ";
      }
      
      // 展示简易趋势符号
      content += "[ ";
      for (let i = recentPrices.length - 1; i > 0; i--) {
        const curr = recentPrices[i].price;
        const next = recentPrices[i - 1].price;
        
        if (next > curr) {
          content += "↗️ ";
        } else if (next < curr) {
          content += "↘️ ";
        } else {
          content += "→ ";
        }
      }
      content += "]\n\n";
    }
  }
  
  // 添加查看详情的提示
  content += "## 💡 查看详情\n\n";
  content += "可前往BoxJS执行 **查看价格历史** 脚本，查看单个商品的详细价格图表。\n";
  
  // 发送通知
  sendNotification(
    "📊 商品价格历史汇总",
    content,
    function() {
      $notification.post(
        "商品价格历史汇总",
        `共 ${allProductHistories.length} 个商品`,
        "查看详情以了解各商品价格走势"
      );
      $done();
    }
  );
}

// ======== 批量导入商品功能 ========

// 批量导入商品链接 - 修复版
function importBatchProducts() {
  // 读取批量导入文本
  const batchText = $persistentStore.read("vmall.batchImportText") || 
                   $persistentStore.read("batchImportText");
  
  if (!batchText || batchText.trim() === "") {
    $notification.post(
      "批量导入失败", 
      "无数据", 
      "请在BoxJS中填写批量商品链接"
    );
    $done();
    return;
  }
  
  // 解析批量文本
  const products = parseLinksText(batchText);
  
  if (products.length === 0) {
    $notification.post(
      "批量导入失败", 
      "解析错误", 
      "未能从输入文本中解析出有效的商品链接"
    );
    $done();
    return;
  }
  
  // 获取当前已配置的商品
  const config = getConfig();
  const existingProducts = new Set();
  
  // 收集当前配置的商品URL - 替换 forEach 为 for 循环
  for (let i = 0; i < config.productLinks.length; i++) {
    const product = config.productLinks[i];
    existingProducts.add(product.url);
  }
  
  // 计数器
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  
  // 已有商品槽位的最大序号
  let maxExistingIndex = 0;
  for (let i = 1; i <= 5; i++) {
    const urlKey = `product${i}Url`;
    const url = $persistentStore.read(`vmall.${urlKey}`) || 
                $persistentStore.read(urlKey);
    
    if (url && url.trim()) {
      maxExistingIndex = i;
    }
  }
  
  // 处理每个解析出的商品
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    
    // 商品链接标准化处理
    const productInfo = processProductLink(product.url);
    const standardUrl = productInfo.url;
    
    // 检查是否已存在
    if (existingProducts.has(standardUrl)) {
      console.log(`商品链接 ${standardUrl} 已存在，跳过导入`);
      skippedCount++;
      continue;
    }
    
    // 计算新的槽位索引
    const newIndex = maxExistingIndex + importedCount + 1;
    
    // 检查是否超出最大槽位限制
    if (newIndex > 5) {
      console.log(`超出最大槽位限制，剩余商品无法导入`);
      break;
    }
    
    // 保存到配置
    const urlKey = `product${newIndex}Url`;
    const enabledKey = `product${newIndex}Enabled`;
    
    $persistentStore.write(standardUrl, `vmall.${urlKey}`);
    $persistentStore.write(product.enabled.toString(), `vmall.${enabledKey}`);
    
    console.log(`成功导入商品到槽位${newIndex}: ${standardUrl}, 启用状态: ${product.enabled}`);
    importedCount++;
  }
  
  // 清空批量导入文本，避免重复导入
  $persistentStore.write("", "vmall.batchImportText");
  
  // 发送通知
  const resultTitle = `批量导入完成`;
  const resultSubtitle = `成功: ${importedCount}, 跳过: ${skippedCount}`;
  let resultBody = `已导入 ${importedCount} 个新商品，`;
  
  if (updatedCount > 0) {
    resultBody += `更新 ${updatedCount} 个已有商品，`;
  }
  
  if (skippedCount > 0) {
    resultBody += `跳过 ${skippedCount} 个已存在商品。`;
  }
  
  if (importedCount === 0 && updatedCount === 0) {
    resultBody = "未导入任何新商品，可能是所有商品已存在或名额已满。";
  }
  
  $notification.post(resultTitle, resultSubtitle, resultBody);
  $done();
}

// 简易的批量检查商品状态功能，按ID查询
function batchCheckProductsById(idList) {
  if (!idList || idList.length === 0) {
    console.log("商品ID列表为空，无法执行批量检查");
    return;
  }
  
  // 构建临时商品链接列表
  const tempProductLinks = [];
  for (let i = 0; i < idList.length; i++) {
    tempProductLinks.push({
      url: `https://m.vmall.com/product/${idList[i]}.html`,
      enabled: true
    });
  }
  
  // 检查第一个商品，递归检查所有商品
  const results = [];
  checkSingleProduct(tempProductLinks[0], results, 0, tempProductLinks.length, function(allResults) {
    // 所有商品检查完毕，发送通知
    sendSummaryNotification(allResults);
  });
}

// ======== 核心商品检测功能 ========

// 提取页面信息 - 增加对非促销商品价格的处理, 修复ES6兼容性问题
function extractPageInfo(html) {
  // 默认值
  let buttonName = "";
  let buttonText = "";
  let productName = "未知商品";
  let price = 0;           // 当前展示价格
  let originalPrice = 0;   // 原价
  let promoPrice = 0;      // 优惠价/促销价
  let isPromo = false;     // 是否在促销中
  let isAppointment = false; // 是否为预约申购状态

  try {
    // 尝试提取商品名称
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      productName = titleMatch[1].replace(/[\_\-\|].*$/, "").trim();
    }
    
    // ===== 首先检查是否为预约申购状态 =====
    // 检查页面是否包含预约申购相关关键词
    const appointmentKeywords = ["预约", "申购", "本场预约申购已结束", "即将上市", "预售"];
    for (let i = 0; i < appointmentKeywords.length; i++) {
      const keyword = appointmentKeywords[i];
      if (html.includes(keyword)) {
        console.log(`检测到预约关键词: ${keyword}`);
        isAppointment = true;
        break;
      }
    }
    
    // ===== 提取¥符号价格 =====
    // 华为商城中，带¥符号的数字通常是原价
    const yenPriceMatches = html.match(/¥\s*(\d+(\.\d+)?)/g);
    
    if (yenPriceMatches && yenPriceMatches.length > 0) {
      // 提取所有带¥的价格并转换为数字
      const allPrices = [];
      for (let i = 0; i < yenPriceMatches.length; i++) {
        allPrices.push(parseFloat(yenPriceMatches[i].replace(/¥\s*/, "")));
      }
      
      console.log(`找到所有带¥符号的价格: ${JSON.stringify(allPrices)}`);
      
      if (allPrices.length >= 1) {
        // 第一个带¥符号的价格通常是原价
        originalPrice = allPrices[0];
        console.log(`使用第一个带¥价格作为原价: ${originalPrice}`);
      }
      
      // 修改: 如果有多个价格且不是预约状态，才可能是促销
      if (allPrices.length >= 2 && !isAppointment) {
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
    // 检查页面是否包含促销相关关键词，但预约申购状态的商品除外
    if (!isAppointment) {
      const promoKeywords = ["促销", "直降", "优惠", "折扣", "减", "省", "特价", "秒杀", "限时", "立省", "立减", "低至"];
      for (let i = 0; i < promoKeywords.length; i++) {
        const keyword = promoKeywords[i];
        if (html.includes(keyword)) {
          console.log(`检测到促销关键词: ${keyword}`);
          isPromo = true;
          break;
        }
      }
    }
    
    // ===== 提取JSON中的价格数据 =====
    
    // 1. 尝试匹配JSON中的promoPrice和促销信息
    const promoPriceMatch = html.match(/["']promoPrice["']\s*:\s*(\d+(\.\d+)?)/);
    const promoPriceLabelMatch = html.match(/["']promoLabel["']\s*:\s*["']([^"']+)["']/);
    
    if (promoPriceMatch && promoPriceMatch[1] && !isAppointment) {
      promoPrice = parseFloat(promoPriceMatch[1]);
      console.log(`找到促销价格: ${promoPrice}`);
      isPromo = true;  // 如果有promoPrice字段，明确是促销
      
      // 设置当前价格为促销价
      price = promoPrice;
    }
    
    if (promoPriceLabelMatch && promoPriceLabelMatch[1] && !isAppointment) {
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
      
      // 修改: 如果JSON中的原价与当前价格不同，且不是预约申购状态，则可能是促销
      if (originalPrice > 0 && price > 0 && originalPrice > price && !isAppointment) {
        console.log(`originPrice(${originalPrice}) > price(${price})，判定为促销`);
        isPromo = true;
      }
    }
    
    // 4. 尝试从NEXT_DATA脚本提取完整JSON数据
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (nextDataMatch && nextDataMatch[1]) {
      try {
        const jsonData = JSON.parse(nextDataMatch[1]);
        // 修复可选链使用
        const mainData = jsonData.props && jsonData.props.pageProps && jsonData.props.pageProps.mainData;
        if (mainData && mainData.current && mainData.current.base) {
          // 尝试获取第一个产品对象
          const products = Object.values(mainData.current.base);
          if (products && products.length > 0) {
            const product = products[0];
            
            // 提取按钮信息
            if (product.buttonInfo && product.buttonInfo.buttonName) {
              buttonName = product.buttonInfo.buttonName;
              
              // 检查按钮名称是否包含预约相关字段
              if (buttonName.includes("appointment") || 
                  buttonName.includes("yuyue") || 
                  buttonName.includes("预约")) {
                isAppointment = true;
                console.log("从按钮名称判断为预约状态商品");
              }
            }
            
            if (product.buttonText) {
              buttonText = product.buttonText;
              
              // 检查按钮文本是否包含预约相关内容
              if (buttonText.includes("预约") || 
                  buttonText.includes("申购") || 
                  buttonText.includes("即将上市")) {
                isAppointment = true;
                console.log("从按钮文本判断为预约状态商品");
              }
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
            
            if (promoPrice === 0 && product.promoPrice && !isAppointment) {
              promoPrice = parseFloat(product.promoPrice);
              console.log(`从JSON中提取到promoPrice: ${promoPrice}`);
              
              // 如果还没设置当前价格，用促销价
              if (price === 0) {
                price = promoPrice;
              }
              
              isPromo = true;
            }
            
            // 检查是否有促销标签或活动，但预约申购状态的商品除外
            if ((product.promoTag || product.promoActivity) && !isAppointment) {
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
        
        // 检查按钮名称是否包含预约相关字段
        if (buttonName.includes("appointment") || 
            buttonName.includes("yuyue") || 
            buttonName.includes("预约")) {
          isAppointment = true;
          console.log("从按钮名称判断为预约状态商品");
        }
      }
      
      if (buttonTextMatch && buttonTextMatch[1]) {
        buttonText = buttonTextMatch[1];
        
        // 检查按钮文本是否包含预约相关内容
        if (buttonText.includes("预约") || 
            buttonText.includes("申购") || 
            buttonText.includes("即将上市")) {
          isAppointment = true;
          console.log("从按钮文本判断为预约状态商品");
        }
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
        isAppointment = true;  // 明确设置为预约状态
      } else if (html.includes("立即预约") || html.includes("预约")) {
        buttonText = "立即预约";
        buttonName = "appointment";
        isAppointment = true;  // 明确设置为预约状态
      } else if (html.includes("即将上市")) {
        buttonText = "即将上市";
        buttonName = "coming_soon";
        isAppointment = true;  // 明确设置为预约状态
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
    
    // 确保promoPrice已设置（仅对促销商品）
    if (isPromo && promoPrice === 0) {
      promoPrice = price;
    }
    
    // 最重要的修复：预约申购状态的商品，强制设置isPromo为false
    if (isAppointment) {
      isPromo = false;
      console.log("商品为预约申购状态，设置为非促销商品");
    }
    
    console.log(`最终价格信息 - 当前价格: ${price}, 原价: ${originalPrice}, 促销价: ${promoPrice}, 是否促销: ${isPromo}, 是否预约: ${isAppointment}`);
    
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
    isPromo: isPromo,
    isAppointment: isAppointment  // 新增字段，标记是否为预约申购状态
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
      
      // 保存价格历史记录
      if (extractedInfo.price > 0) {
        savePriceHistory(id, extractedInfo.productName, extractedInfo.price, extractedInfo.originalPrice);
      }
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

// 发送汇总通知 - 增强版 (修改使用新的通用通知函数)
function sendSummaryNotification(results) {
  const config = getConfig();
  
  // 检查是否有状态或价格变化的商品
  const changedProducts = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].success && (results[i].hasChanged || results[i].priceChanged)) {
      changedProducts.push(results[i]);
    }
  }
  
  // 构建汇总消息
  let summaryTitle = "";
  let summaryContent = "";
  
  if (changedProducts.length > 0) {
    summaryTitle = `⚠️ 检测到${changedProducts.length}个商品变化`;
    summaryContent = "## 🔔 商品变化通知\n\n";
    
    // 添加变化的商品信息
    for (let index = 0; index < changedProducts.length; index++) {
      const result = changedProducts[index];
      summaryContent += `### ${index + 1}. ${result.productName}\n\n`;
      
      if (result.hasChanged) {
        summaryContent += `- **按钮状态**: ${result.buttonInfo.buttonText}\n`;
        summaryContent += `- **状态变化**: ✅ 已变化，原状态: ${result.lastButtonText || "未知"}\n`;
      }
      
      if (result.priceChanged) {
        summaryContent += `- **当前价格**: ${formatPrice(result.price)}\n`;
        
        // 显示原价信息（除非原价等于当前价格）
        if (result.originalPrice > 0 && Math.abs(result.originalPrice - result.price) > 1) {
          summaryContent += `- **原价**: ${formatPrice(result.originalPrice)}\n`;
          // 计算降价额度
          const priceDrop = result.originalPrice - result.price;
          if (priceDrop > 0) {
            summaryContent += `- **降价**: ↓降价${priceDrop.toFixed(2)}元\n`;
          }
        }
        
        summaryContent += `- **价格变化**: ${formatPriceChange(result.priceDiff)}\n`;
      }
      
      summaryContent += `- **检查时间**: ${new Date().toLocaleString("zh-CN")}\n\n`;
    }
  } else {
    summaryTitle = "✅ 商品状态检查完成";
    summaryContent = "## 📊 商品状态检查汇总\n\n";
  }
  
  // 添加所有商品的当前状态 - 使用树状结构改进排版
  summaryContent += "## 📋 所有商品当前状态\n\n";
  
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.success && result.buttonInfo) {
      // 显示序号和商品名，状态变化时添加标记
      summaryContent += `### ${index + 1}. ${result.productName}${result.hasChanged || result.priceChanged ? " ⚠️" : ""}\n\n`;
      
      // 树形结构显示详细信息
      summaryContent += `- **按钮状态**: ${result.buttonInfo.buttonText}\n`;
      
      // 价格信息，如果有价格则显示
      if (result.price > 0) {
        // 显示当前价格
        summaryContent += `- **商品价格**: ${formatPrice(result.price)}`;
        
        // 如果价格有变化，显示变化情况
        if (result.priceChanged) {
          summaryContent += ` (${formatPriceChange(result.priceDiff)})`;
        }
        summaryContent += "\n";
        
        // 如果华为商城商品，几乎都在促销，只要原价与当前价格有差异就显示
        const isPriceReduced = result.originalPrice > 0 && Math.abs(result.originalPrice - result.price) > 1;
        
        // 显示原价信息（除非原价等于当前价格）
        if (isPriceReduced) {
          summaryContent += `- **原价**: ${formatPrice(result.originalPrice)}\n`;
          
          // 计算降价额度
          const priceDrop = result.originalPrice - result.price;
          if (priceDrop > 0) {
            summaryContent += `- **降价**: ↓降价${priceDrop.toFixed(2)}元\n`;
          }
        }
        
        // 对于明确的促销标识，显示促销标记
        if (result.isPromo) {
          summaryContent += `- **促销**: ✅ 此商品正在促销\n`;
        }
      }
      
      // 添加空行分隔不同商品
      summaryContent += "\n";
    } else {
      summaryContent += `### ${index + 1}. ${result.productName || result.url}\n\n`;
      summaryContent += `- **状态**: 检查失败 - ${result.message}\n\n`;
    }
  }
  
  // 使用通用通知函数发送通知
  sendNotification(summaryTitle, summaryContent, function() {
    // 对于变化的商品，发送弹窗通知 - 无论是状态变化还是价格变化
    if (changedProducts.length > 0) {
      for (let i = 0; i < changedProducts.length; i++) {
        const result = changedProducts[i];
        // 准备弹窗通知内容
        let title = "";
        let notificationBody = "";
        
        // 根据变化类型设置不同的标题
        if (result.hasChanged && result.priceChanged) {
          title = "⚠️ 商品状态和价格已变化";
        } else if (result.hasChanged) {
          title = "⚠️ 商品状态已变化";
        } else if (result.priceChanged) {
          title = "💰 商品价格已变化";
        }
        
        // 添加按钮状态信息
        if (result.hasChanged) {
          notificationBody = `按钮状态: ${result.buttonInfo.buttonText}\n`;
        }
        
        // 添加价格信息
        if (result.priceChanged || result.price > 0) {
          notificationBody += `当前价格: ${formatPrice(result.price)}`;
          
          // 如果价格有变化，显示变化情况
          if (result.priceChanged) {
            notificationBody += ` ${formatPriceChange(result.priceDiff)}`;
          }
          notificationBody += "\n";
          
          // 显示原价和降价额度（除非原价等于当前价格）
          if (result.originalPrice > 0 && Math.abs(result.originalPrice - result.price) > 1) {
            notificationBody += `原价: ${formatPrice(result.originalPrice)}\n`;
            
            // 计算降价额度
            const priceDrop = result.originalPrice - result.price;
            if (priceDrop > 0) {
              notificationBody += `降价: ↓降价${priceDrop.toFixed(2)}元\n`;
            }
          }
        }
        
        notificationBody += `检查时间: ${new Date().toLocaleString("zh-CN")}`;
        
        $notification.post(
          title,
          `${result.productName}`,
          notificationBody,
          { url: result.url }
        );
      }
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

// 测试函数 - 仅用于测试通知配置
function testPushDeer() {
  const config = getConfig();
  console.log("测试通知配置...");
  
  // 通知渠道名称映射
  const channelNames = {
    "pushDeer": "PushDeer",
    "bark": "Bark",
    "telegram": "Telegram",
    "serverChan": "Server酱",
    "pushPlus": "PushPlus",
    "wework": "企业微信",
    "email": "邮件"
  };
  
  // 获取当前通知渠道名称
  const channelName = channelNames[config.notifyChannel] || config.notifyChannel;
  
  sendNotification(
    `${channelName}配置测试`, 
    `如果您看到此消息，说明${channelName}配置正确！\n\n这是从测试工具发送的测试消息。\n\n发送时间: ${new Date().toLocaleString("zh-CN")}`, 
    function() {
      $notification.post("测试完成", `已尝试使用${channelName}发送测试消息`, "请检查您的设备是否收到通知");
      $done();
    }
  );
}

// ======== 主入口函数 ========

// 主函数 - 根据参数决定执行哪个功能
function handleArguments() {
  const args = typeof $argument !== 'undefined' ? $argument : '';
  
  if (args.includes('test')) {
    // 执行通知测试
    testPushDeer();
  } else if (args.includes('importBatch')) {
    // 执行批量导入
    importBatchProducts();
  } else if (args.includes('showHistory')) {
    // 显示价格历史
    if (args.includes('id=')) {
      // 提取商品ID
      const idMatch = args.match(/id=([0-9]+)/);
      if (idMatch && idMatch[1]) {
        const productId = idMatch[1];
        showPriceHistory(productId);
      } else {
        $notification.post(
          "查看历史失败", 
          "ID无效", 
          "请提供有效的商品ID"
        );
        $done();
      }
    } else {
      // 显示所有商品的历史汇总
      showAllPriceHistory();
    }
  } else {
    // 执行主函数 - 检查商品状态
    checkAllProducts();
  }
}

// 检查命令行参数，决定执行哪个功能
handleArguments();