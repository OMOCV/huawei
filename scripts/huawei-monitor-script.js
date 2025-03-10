// 华为商城监控脚本 - 监控华为 Mate 70 Pro+ 预约/库存状态
// 重构自 Python 版本，适配 Surge 模块

// 配置信息
const PRODUCT_ID = "10086989076790"; // 华为 Mate 70 Pro+
const PRODUCT_URL = `https://m.vmall.com/product/comdetail/index.html?prdId=${PRODUCT_ID}`;
const API_URL = `https://m.vmall.com/product/comdetail/getSkuInfo.json?prdId=${PRODUCT_ID}`;
const PUSHDEER_KEY = "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV";
const PUSHDEER_URL = "https://api2.pushdeer.com/message/push";
const STATUS_KEY = "huawei_monitor_last_status"; // 持久化存储键名

// HTTP 请求头
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Referer": PRODUCT_URL,
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest"
};

// 主函数
async function run() {
  console.log("开始检查华为 Mate 70 Pro+ 预约状态");
  
  try {
    // 获取当前状态
    const currentStatus = await getReservationStatus();
    if (!currentStatus) {
      console.log("无法获取当前状态，任务终止");
      $done();
      return;
    }
    
    // 获取上次保存的状态
    const lastStatus = loadLastStatus();
    
    // 检查状态变化
    const [statusChanged, changeDetails] = checkStatusChanges(currentStatus, lastStatus);
    
    if (statusChanged) {
      // 格式化通知消息
      const message = formatNotificationMessage(currentStatus, changeDetails);
      
      // 发送通知
      await sendNotification(message);
      
      // 保存当前状态
      saveCurrentStatus(currentStatus);
      console.log(`状态变化通知已发送: ${changeDetails.join(', ')}`);
    } else {
      console.log("预约状态未发生变化");
    }
  } catch (error) {
    console.log(`运行过程中出错: ${error}`);
    // 使用 Surge 通知显示错误
    $notification.post("华为商城监控脚本错误", "", `运行过程中出错: ${error}`);
  }
  
  $done(); // 通知 Surge 任务完成
}

// 发送通知函数 (使用 PushDeer)
async function sendNotification(message) {
  try {
    const payload = {
      "pushkey": PUSHDEER_KEY,
      "text": "华为 Mate 70 Pro+ 预约通知",
      "desp": message
    };
    
    const request = {
      url: PUSHDEER_URL,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    };
    
    return new Promise((resolve, reject) => {
      $httpClient.post(request, (error, response, data) => {
        if (error) {
          console.log(`通知发送失败: ${error}`);
          reject(error);
          return;
        }
        
        if (response.status === 200) {
          const responseData = JSON.parse(data);
          if (responseData.code === 0) {
            console.log(`通知发送成功: ${message}`);
            
            // 同时发送 Surge 通知
            $notification.post(
              "华为 Mate 70 Pro+ 预约状态变化", 
              "", 
              "状态已变化，详细信息已通过 PushDeer 发送"
            );
            
            resolve(true);
          } else {
            console.log(`通知失败，PushDeer 返回: ${data}`);
            reject(new Error(`PushDeer 返回错误: ${responseData.message || "未知错误"}`));
          }
        } else {
          console.log(`通知发送失败。HTTP 状态码: ${response.status}`);
          reject(new Error(`HTTP 状态码错误: ${response.status}`));
        }
      });
    });
  } catch (error) {
    console.log(`发送通知时出错: ${error}`);
    throw error;
  }
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
  return {};
}

// 保存当前状态
function saveCurrentStatus(status) {
  try {
    $persistentStore.write(JSON.stringify(status), STATUS_KEY);
  } catch (error) {
    console.log(`保存状态数据时出错: ${error}`);
  }
}

// 使用 API 获取预约状态
async function fetchApiStatus() {
  try {
    const request = {
      url: API_URL,
      headers: HEADERS
    };
    
    return new Promise((resolve, reject) => {
      $httpClient.post(request, (error, response, data) => {
        if (error) {
          console.log(`API请求错误: ${error}`);
          resolve(null);
          return;
        }
        
        if (response.status === 200) {
          try {
            const apiData = JSON.parse(data);
            const productInfo = apiData.skuInfo || {};
            const productName = productInfo.prdName || '未知产品';
            const productStatus = productInfo.buttonMode || '';
            const productStock = productInfo.stokStatus || '';
            
            resolve({
              "source": "api",
              "product_name": productName,
              "button_mode": productStatus,
              "stock_status": productStock,
              "timestamp": new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
          } catch (e) {
            console.log(`解析API响应出错: ${e}`);
            resolve(null);
          }
        } else {
          console.log(`API请求失败，状态码: ${response.status}`);
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.log(`API请求过程中出错: ${error}`);
    return null;
  }
}

// 从页面提取JSON数据
function extractJsonFromPage(pageContent) {
  try {
    const jsonMatch = pageContent.match(/window\.skuInfo\s*=\s*(\{.*?\});/s);
    if (jsonMatch) {
      let skuInfoStr = jsonMatch[1];
      // 修复可能的JSON格式问题
      skuInfoStr = skuInfoStr.replace(/(\w+):/g, '"$1":');
      const skuInfo = JSON.parse(skuInfoStr);
      
      const productName = skuInfo.prdName || '未知产品';
      const productStatus = skuInfo.buttonMode || '';
      const productStock = skuInfo.stokStatus || '';
      
      return {
        "source": "page_json",
        "product_name": productName,
        "button_mode": productStatus,
        "stock_status": productStock,
        "timestamp": new Date().toISOString().replace('T', ' ').substring(0, 19)
      };
    }
  } catch (error) {
    console.log(`解析页面JSON失败: ${error}`);
  }
  return null;
}

// 解析HTML页面内容
function parsePageWithHtml(pageContent) {
  try {
    // 简单提取标题
    const titleMatch = pageContent.match(/<title>(.*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : "未知产品";
    
    // 查找预约相关的文本
    const reservationIndicators = [
      '预约', '申购', '抢购', '开售', '立即购买', '立即申购', '立即预约', 
      '预定', '售罄', '已售完', '等待开售', '即将开售', '暂停销售'
    ];
    
    const reservationTexts = [];
    for (const indicator of reservationIndicators) {
      const regex = new RegExp(`[^>]*${indicator}[^<]*`, 'g');
      const matches = pageContent.match(regex);
      if (matches) {
        for (const match of matches) {
          const trimmed = match.trim();
          if (trimmed && !reservationTexts.includes(trimmed)) {
            reservationTexts.push(trimmed);
          }
        }
      }
    }
    
    // 查找按钮文本
    const buttonRegex = /<(?:a|button)[^>]*class="[^"]*(?:button|btn)[^"]*"[^>]*>(.*?)<\/(?:a|button)>/g;
    const buttonTexts = [];
    let buttonMatch;
    while ((buttonMatch = buttonRegex.exec(pageContent)) !== null) {
      // 去除HTML标签，只保留文本
      const text = buttonMatch[1].replace(/<[^>]*>/g, '').trim();
      if (text && !buttonTexts.includes(text)) {
        buttonTexts.push(text);
      }
    }
    
    return {
      "source": "page_html",
      "page_title": title,
      "reservation_text": reservationTexts,
      "button_texts": buttonTexts,
      "timestamp": new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
  } catch (error) {
    console.log(`解析HTML页面失败: ${error}`);
    return null;
  }
}

// 从页面获取状态
async function fetchPageStatus() {
  try {
    const request = {
      url: PRODUCT_URL,
      headers: HEADERS
    };
    
    return new Promise((resolve, reject) => {
      $httpClient.get(request, (error, response, data) => {
        if (error) {
          console.log(`页面请求错误: ${error}`);
          resolve(null);
          return;
        }
        
        if (response.status === 200) {
          // 首先尝试从页面中提取JSON
          const jsonStatus = extractJsonFromPage(data);
          if (jsonStatus) {
            resolve(jsonStatus);
            return;
          }
          
          // 如果JSON提取失败，使用HTML解析
          const htmlStatus = parsePageWithHtml(data);
          resolve(htmlStatus);
        } else {
          console.log(`页面请求失败，状态码: ${response.status}`);
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.log(`页面请求过程中出错: ${error}`);
    return null;
  }
}

// 获取预约状态，优先使用API，失败时回退到网页抓取
async function getReservationStatus() {
  // 优先尝试API
  const apiStatus = await fetchApiStatus();
  if (apiStatus) {
    return apiStatus;
  }
  
  // API失败时回退到网页抓取
  console.log("API请求失败，尝试从页面获取状态");
  const pageStatus = await fetchPageStatus();
  
  if (!pageStatus) {
    console.log("无法获取预约状态，API和页面抓取均失败");
  }
  
  return pageStatus;
}

// 检查状态变化
function checkStatusChanges(current, last) {
  if (!last || Object.keys(last).length === 0) {
    return [false, []];
  }
  
  let statusChanged = false;
  const changeDetails = [];
  
  // 比较核心字段
  const fieldsToCompare = [
    ["button_mode", "按钮状态"],
    ["stock_status", "库存状态"]
  ];
  
  for (const [field, label] of fieldsToCompare) {
    if (current[field] !== undefined && last[field] !== undefined && current[field] !== last[field]) {
      statusChanged = true;
      changeDetails.push(`${label}从 '${last[field]}' 变为 '${current[field]}'`);
    }
  }
  
  // 比较预约相关文本
  if (current.reservation_text && last.reservation_text) {
    const currentSet = new Set(current.reservation_text);
    const lastSet = new Set(last.reservation_text);
    
    // 转换Set为数组进行比较
    const currentArray = Array.from(currentSet);
    const lastArray = Array.from(lastSet);
    
    // 比较数组是否相同
    if (JSON.stringify(currentArray.sort()) !== JSON.stringify(lastArray.sort())) {
      statusChanged = true;
      
      // 找出新增的文本
      const newTexts = currentArray.filter(text => !lastSet.has(text));
      // 找出移除的文本
      const removedTexts = lastArray.filter(text => !currentSet.has(text));
      
      if (newTexts.length > 0) {
        changeDetails.push(`新增预约相关文本: ${newTexts.join(', ')}`);
      }
      if (removedTexts.length > 0) {
        changeDetails.push(`移除预约相关文本: ${removedTexts.join(', ')}`);
      }
    }
  }
  
  // 比较按钮文本
  if (current.button_texts && last.button_texts) {
    const currentSet = new Set(current.button_texts);
    const lastSet = new Set(last.button_texts);
    
    const currentArray = Array.from(currentSet);
    const lastArray = Array.from(lastSet);
    
    if (JSON.stringify(currentArray.sort()) !== JSON.stringify(lastArray.sort())) {
      statusChanged = true;
      
      const newTexts = currentArray.filter(text => !lastSet.has(text));
      const removedTexts = lastArray.filter(text => !currentSet.has(text));
      
      if (newTexts.length > 0) {
        changeDetails.push(`新增按钮文本: ${newTexts.join(', ')}`);
      }
      if (removedTexts.length > 0) {
        changeDetails.push(`移除按钮文本: ${removedTexts.join(', ')}`);
      }
    }
  }
  
  return [statusChanged, changeDetails];
}

// 格式化通知消息
function formatNotificationMessage(currentStatus, changeDetails) {
  const messageParts = ["华为 Mate 70 Pro+ 预约状态变化!\n\n"];
  
  if (currentStatus.product_name) {
    messageParts.push(`产品名称: ${currentStatus.product_name}\n\n`);
  }
  
  if (changeDetails.length > 0) {
    messageParts.push(`变化详情:\n${changeDetails.map(detail => '- ' + detail).join('\n')}\n\n`);
  }
  
  if (currentStatus.button_mode) {
    messageParts.push(`当前按钮状态: ${currentStatus.button_mode}\n\n`);
  }
  
  if (currentStatus.stock_status) {
    messageParts.push(`当前库存状态: ${currentStatus.stock_status}\n\n`);
  }
  
  if (currentStatus.reservation_text && currentStatus.reservation_text.length > 0) {
    messageParts.push(`当前预约相关文本: ${currentStatus.reservation_text.join(', ')}\n\n`);
  }
  
  messageParts.push(`数据来源: ${currentStatus.source || '未知'}\n\n`);
  messageParts.push(`请立即访问: ${PRODUCT_URL}`);
  
  return messageParts.join('');
}

// 运行主函数
run();