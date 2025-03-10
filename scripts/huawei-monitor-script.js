// 华为商城监控脚本 - 极简优化版
// 简化网络请求和处理逻辑，避免超时

// 配置信息
const PRODUCT_ID = "10086989076790"; // 华为 Mate 70 Pro+
const PRODUCT_URL = `https://m.vmall.com/product/comdetail/index.html?prdId=${PRODUCT_ID}`;
const STATUS_KEY = "huawei_monitor_last_status"; // 持久化存储键名
const MESSAGE_KEY = "huawei_monitor_last_message"; // 最后一次消息
const MAX_TIMEOUT = 10; // 设置最大超时时间（秒）

// HTTP 请求头
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Connection": "keep-alive"
};

// 主函数 - 简化版
async function run() {
  console.log("开始检查华为 Mate 70 Pro+ 预约状态");
  
  try {
    // 直接只获取产品页面
    const currentStatus = await fetchProductPageStatus();
    
    if (!currentStatus) {
      console.log("无法获取页面状态，终止检查");
      $done();
      return;
    }
    
    // 加载上次状态
    const lastStatus = loadLastStatus();
    
    // 检查状态变化
    const [statusChanged, changeDetails] = checkStatusChanges(currentStatus, lastStatus);
    
    // 保存当前状态（无论是否变化）
    saveCurrentStatus(currentStatus);
    
    if (statusChanged) {
      // 格式化通知消息
      const message = formatNotificationMessage(currentStatus, changeDetails);
      
      // 保存消息并发送通知
      $persistentStore.write(message, MESSAGE_KEY);
      $notification.post(
        "华为 Mate 70 Pro+ 预约状态变化", 
        currentStatus.button_status || "状态已更新", 
        changeDetails.join("; ")
      );
      
      console.log(`状态变化通知已发送: ${changeDetails.join(', ')}`);
    } else {
      console.log("预约状态未发生变化");
    }
  } catch (error) {
    console.log(`运行过程中出错: ${error}`);
    $notification.post("华为商城监控脚本错误", "", `运行出错: ${error.message || error}`);
  }
  
  $done();
}

// 加载上次状态
function loadLastStatus() {
  try {
    const savedData = $persistentStore.read(STATUS_KEY);
    if (savedData) {
      return JSON.parse(savedData);
    }
  } catch (error) {
    console.log(`读取状态数据时出错: ${error}`);
  }
  return null;
}

// 保存当前状态
function saveCurrentStatus(status) {
  try {
    $persistentStore.write(JSON.stringify(status), STATUS_KEY);
  } catch (error) {
    console.log(`保存状态数据时出错: ${error}`);
  }
}

// 简化版：直接从产品页面获取状态
async function fetchProductPageStatus() {
  try {
    console.log(`开始获取产品页面: ${PRODUCT_URL}`);
    
    const request = {
      url: PRODUCT_URL,
      headers: HEADERS,
      timeout: MAX_TIMEOUT * 1000 // 设置超时时间（毫秒）
    };
    
    return new Promise((resolve, reject) => {
      $httpClient.get(request, (error, response, data) => {
        if (error) {
          console.log(`页面请求错误: ${error}`);
          resolve(null);
          return;
        }
        
        if (!response || !response.status) {
          console.log("页面响应异常");
          resolve(null);
          return;
        }
        
        if (response.status !== 200 || !data) {
          console.log(`页面请求失败，状态码: ${response.status}`);
          resolve(null);
          return;
        }
        
        try {
          // 提取商品信息
          const title = extractText(data, /<title[^>]*>(.*?)<\/title>/i) || "华为 Mate 70 Pro+";
          
          // 查找预约和购买相关的文本
          const buttonStatus = findButtonStatus(data);
          const stockStatus = findStockStatus(data);
          
          const status = {
            "source": "webpage",
            "title": title,
            "button_status": buttonStatus,
            "stock_status": stockStatus,
            "timestamp": new Date().toISOString().replace('T', ' ').substring(0, 19)
          };
          
          console.log(`成功提取页面信息: ${buttonStatus || "未知状态"}`);
          resolve(status);
        } catch (e) {
          console.log(`解析页面内容时出错: ${e}`);
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.log(`获取产品页面过程中出错: ${error}`);
    return null;
  }
}

// 简单的文本提取辅助函数
function extractText(html, regex) {
  const match = html.match(regex);
  return match && match[1] ? match[1].trim() : null;
}

// 查找按钮状态
function findButtonStatus(html) {
  // 预约相关关键字
  const keywords = [
    '立即预约', '立即购买', '立即申购', '申购', '预约', '预定', 
    '抢购', '开售', '暂停销售', '售罄', '已售完', '等待开售'
  ];
  
  // 查找包含这些关键字的文本
  for (const keyword of keywords) {
    const regex = new RegExp(`[^>]*${keyword}[^<]*`, 'gi');
    const matches = html.match(regex);
    if (matches && matches.length > 0) {
      return matches[0].trim();
    }
  }
  
  // 查找按钮元素中的文本
  const buttonRegex = /<(?:a|button)[^>]*class="[^"]*(?:button|btn)[^"]*"[^>]*>(.*?)<\/(?:a|button)>/gi;
  let buttonMatch;
  while ((buttonMatch = buttonRegex.exec(html)) !== null) {
    const text = buttonMatch[1].replace(/<[^>]*>/g, '').trim();
    if (text) {
      return text;
    }
  }
  
  return "未检测到按钮状态";
}

// 查找库存状态
function findStockStatus(html) {
  // 常见的库存状态关键字
  const stockKeywords = ['有货', '无货', '缺货', '库存', '现货', '在售', '售罄', '已售完'];
  
  for (const keyword of stockKeywords) {
    const regex = new RegExp(`[^>]*${keyword}[^<]*`, 'gi');
    const matches = html.match(regex);
    if (matches && matches.length > 0) {
      return matches[0].trim();
    }
  }
  
  return "未检测到库存状态";
}

// 检查状态变化 - 简化版
function checkStatusChanges(current, last) {
  if (!last) {
    return [true, ["首次检查，无历史数据"]];
  }
  
  let statusChanged = false;
  const changeDetails = [];
  
  // 比较按钮状态
  if (current.button_status !== last.button_status) {
    statusChanged = true;
    changeDetails.push(`按钮状态: "${last.button_status || '未知'}" → "${current.button_status || '未知'}"`);
  }
  
  // 比较库存状态
  if (current.stock_status !== last.stock_status) {
    statusChanged = true;
    changeDetails.push(`库存状态: "${last.stock_status || '未知'}" → "${current.stock_status || '未知'}"`);
  }
  
  return [statusChanged, changeDetails];
}

// 格式化通知消息 - 简化版
function formatNotificationMessage(currentStatus, changeDetails) {
  const lines = [
    `华为 Mate 70 Pro+ 预约状态变化!`,
    ``,
    `商品: ${currentStatus.title || "华为 Mate 70 Pro+"}`,
    ``,
    `变化详情:`,
    ...changeDetails.map(detail => `- ${detail}`),
    ``,
    `当前按钮状态: ${currentStatus.button_status || "未知"}`,
    `当前库存状态: ${currentStatus.stock_status || "未知"}`,
    ``,
    `检查时间: ${currentStatus.timestamp || new Date().toLocaleString()}`,
    ``,
    `访问链接: ${PRODUCT_URL}`
  ];
  
  return lines.join("\n");
}

// 设置统一的超时处理
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error("任务执行超时")), MAX_TIMEOUT * 1000);
});

// 带超时保护的运行主函数
Promise.race([run(), timeoutPromise])
  .catch(error => {
    console.log(`脚本执行错误: ${error}`);
    $notification.post("华为 Mate 70 Pro+ 监控", "脚本执行错误", error.message || String(error));
    $done();
  });