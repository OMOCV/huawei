// 华为商城手动测试工具
// 用于手动测试商品状态检查和通知配置
// 在浏览器中访问商品页面时添加 "test" 参数即可触发测试
// 更新日期: 2025-03-15
// 修复了ES6兼容性问题

// ======== 配置读取功能 ========

// 获取配置 - 支持新的BoxJS单独商品输入框
function getConfig() {
  // 尝试读取通知渠道设置
  const notifyChannel = $persistentStore.read("vmall.notifyChannel") || 
                        $persistentStore.read("notifyChannel") || 
                        "pushDeer";
  
  // 尝试读取调试模式
  const debug = ($persistentStore.read("vmall.debug") === "true") || 
                ($persistentStore.read("debug") === "true") || 
                false;
  
  return {
    notifyChannel: notifyChannel,
    debug: debug
  };
}

// 读取PushDeer Key - 兼容多种键名
function getPushDeerKey() {
  // 尝试多种可能的键名
  const possibleKeys = [
    "vmall.notification.pushDeerKey", // 新增：子应用中的键名
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
  
  const [fromEmail, password, smtpServer, smtpPort, toEmail] = configArray;
  
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

// ======== 商品信息提取功能 ========

// 提取页面信息 - 增加对非促销商品价格的处理，修复ES6兼容性问题
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
        const mainData = jsonData.props?.pageProps?.mainData;
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

// ======== 测试功能实现 ========

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

// 从URL中提取商品ID
function extractProductId(url) {
  if (url.includes("prdId=")) {
    const match = url.match(/prdId=([0-9]+)/);
    if (match && match[1]) {
      return match[1];
    }
  } else if (url.includes("/product/")) {
    const match = url.match(/\/product\/([0-9]+)\.html/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return "";
}

// 测试商品状态 - 手动调用版本
function testProductStatus(url) {
  // 使用与主脚本相同的请求方式
  $httpClient.get({
    url: url,
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
      "Accept": "text/html",
      "Accept-Language": "zh-CN,zh;q=0.9"
    }
  }, function(error, response, data) {
    if (error) {
      $notification.post("测试失败", `请求错误: ${error}`, "");
      $done();
      return;
    }
    
    if (!data) {
      $notification.post("测试失败", "返回内容为空", "");
      $done();
      return;
    }
    
    // 提取页面信息
    const extractedInfo = extractPageInfo(data);
    
    // 构建通知内容
    let notificationTitle = `测试结果: ${extractedInfo.productName}`;
    let notificationBody = `按钮状态: ${extractedInfo.buttonText}\n`;
    
    if (extractedInfo.price > 0) {
      notificationBody += `当前价格: ${formatPrice(extractedInfo.price)}\n`;
      
      if (extractedInfo.isPromo) {
        // 只有在促销时才显示原价和促销相关信息
        if (extractedInfo.originalPrice > 0 && extractedInfo.originalPrice > extractedInfo.price) {
          notificationBody += `原价: ${formatPrice(extractedInfo.originalPrice)}\n`;
          
          // 计算降价额度
          const priceDrop = extractedInfo.originalPrice - extractedInfo.price;
          if (priceDrop > 0) {
            notificationBody += `降价: ↓降价${priceDrop.toFixed(2)}元\n`;
          }
        }
        
        notificationBody += `促销: ✅ 此商品正在促销\n`;
      }
      
      // 显示是否为预约申购状态
      if (extractedInfo.isAppointment) {
        notificationBody += `预约申购: ✅ 此商品为预约申购状态\n`;
      }
    }
    
    // 提取商品ID
    const productId = extractProductId(url);
    if (productId) {
      notificationBody += `商品ID: ${productId}\n`;
      notificationBody += `可使用命令查看价格历史: showHistory id=${productId}\n`;
    }
    
    // 显示检测结果
    $notification.post(
      notificationTitle,
      "",
      notificationBody,
      { url: url }
    );
    
    // 同时发送通知
    const markdownContent = `## 🔍 手动测试结果\n\n` +
                          `### ${extractedInfo.productName}\n\n` +
                          `- **按钮状态**: ${extractedInfo.buttonText}\n`;
    
    let additionalInfo = "";
    
    if (extractedInfo.price > 0) {
      additionalInfo += `- **当前价格**: ${formatPrice(extractedInfo.price)}\n`;
      
      if (extractedInfo.isPromo) {
        // 只有在促销时才显示原价和促销相关信息
        if (extractedInfo.originalPrice > 0 && extractedInfo.originalPrice > extractedInfo.price) {
          additionalInfo += `- **原价**: ${formatPrice(extractedInfo.originalPrice)}\n`;
          
          // 计算降价额度
          const priceDrop = extractedInfo.originalPrice - extractedInfo.price;
          if (priceDrop > 0) {
            additionalInfo += `- **降价**: ↓降价${priceDrop.toFixed(2)}元\n`;
          }
        }
        
        additionalInfo += `- **促销**: ✅ 此商品正在促销\n`;
      }
      
      // 显示是否为预约申购状态
      if (extractedInfo.isAppointment) {
        additionalInfo += `- **预约申购**: ✅ 此商品为预约申购状态\n`;
      }
    }
    
    // 添加商品ID信息
    if (productId) {
      additionalInfo += `- **商品ID**: ${productId}\n`;
    }
    
    // 添加详细的提取信息，帮助调试
    additionalInfo += `\n## 📊 详细提取信息\n\n` +
                    `- **原价**: ${formatPrice(extractedInfo.originalPrice)}\n` +
                    `- **当前价格**: ${formatPrice(extractedInfo.price)}\n` +
                    `- **促销价**: ${formatPrice(extractedInfo.promoPrice)}\n` +
                    `- **是否促销**: ${extractedInfo.isPromo ? '是' : '否'}\n` +
                    `- **是否预约申购**: ${extractedInfo.isAppointment ? '是' : '否'}\n` +
                    `- **按钮名称**: ${extractedInfo.buttonName}\n` +
                    `- **按钮文本**: ${extractedInfo.buttonText}\n` +
                    `- **测试时间**: ${new Date().toLocaleString("zh-CN")}\n`;
    
    sendNotification(
      `测试: ${extractedInfo.productName}`,
      markdownContent + additionalInfo,
      function() {
        $done();
      }
    );
  });
}

// 测试通知配置
function testNotifyConfig() {
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

// 主函数 - 根据URL参数决定执行何种测试
function main() {
  // 获取完整URL
  const fullUrl = $request.url;
  console.log(`收到测试请求: ${fullUrl}`);
  
  // 如果URL包含 "test" 但不包含特定的商品URL，测试通知配置
  if (fullUrl.includes("test") && !fullUrl.includes("product/")) {
    console.log("执行通知配置测试");
    testNotifyConfig();
  } else {
    // 否则，测试商品状态
    // 移除URL中的test参数
    const cleanUrl = fullUrl.replace(/\?test.*$/, "").replace(/\&test.*$/, "");
    console.log(`执行商品状态测试，清理后的URL: ${cleanUrl}`);
    testProductStatus(cleanUrl);
  }
}

// 执行主函数
main();