/*
# 2025-03-11
# 华为商品状态监控(自动化定时版-优化版)
# 适用于Surge/Loon/QuantumultX等
# 脚本功能：自动监控华为商城商品(如Mate系列)的预约/开售状态

[task_local]
# 每5分钟运行一次 (可根据需要调整)
*/5 * * * * https://raw.githubusercontent.com/OMOCV/huawei/main/scripts/huawei-monitor-script.js

[mitm]
hostname = m.vmall.com

******************************************
* 优化说明:
* 1. 强制开启工作流日志，实时监控脚本执行情况
* 2. 添加心跳通知，即使状态未变化也会通知用户脚本正在运行
* 3. 精简请求处理流程，解决超时问题
* 4. 优化错误处理和重试机制
* 5. 增加脚本健康检查功能
******************************************
*/

const consolelog = true; // 启用日志
const $ = new Env("华为商品监控");
const PUSH_KEY = "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV"; // PushDeer Key，可替换为您自己的
const STATUS_CACHE_KEY = "huawei_monitor_status";
const LOG_PREFIX = "🔄华为监控"; // 日志前缀
const ENABLE_WORKFLOW_LOG = true; // 强制启用详细工作流日志
const HEARTBEAT_INTERVAL = 2; // 心跳间隔，默认每2次执行发送一次心跳通知
const HEARTBEAT_KEY = "huawei_monitor_heartbeat_counter";
const PRODUCTS_CACHE_KEY = "huawei_products_list";
const MAX_RETRY_COUNT = 2; // 最大重试次数
const REQUEST_TIMEOUT = 5000; // 请求超时时间(ms)
const SCRIPT_VERSION = "1.3.0"; // 脚本版本

// 商品配置 - 可添加多个商品ID进行监控
const DEFAULT_PRODUCTS = [
  {
    id: "10086989076790", // 华为产品ID
    name: "Mate 60 Pro" // 自定义名称（可选）
  },
  // 可以按需添加更多商品
  // { id: "10086796965079", name: "P60 Pro" }
];

// 存储需要监控的商品列表
let productsToMonitor = [];
let heartbeatCounter = 0;
let scriptStartTime = new Date().getTime();

// 脚本入口函数
async function start() {
  // 开始计时
  scriptStartTime = new Date().getTime();
  
  // 脚本信息
  $.log(`
============= 华为商品监控 =============
运行时间: ${$.time('MM-dd HH:mm:ss')}
脚本版本: ${SCRIPT_VERSION} (优化版)
工作流日志: ${ENABLE_WORKFLOW_LOG ? '已开启' : '已关闭'}
====================================
  `);
  
  // 发送脚本启动通知
  await sendWorkflowLog('启动', `华为商品监控脚本已启动，版本: ${SCRIPT_VERSION}`, false);
  
  try {
    // 读取心跳计数器
    heartbeatCounter = parseInt($.getdata(HEARTBEAT_KEY) || '0');
    heartbeatCounter++;
    $.setdata(heartbeatCounter.toString(), HEARTBEAT_KEY);
    
    // 初始化产品列表（首次运行或从缓存恢复）
    await initProductsList();
    
    // 检查是否需要发送心跳通知
    const needHeartbeat = (heartbeatCounter % HEARTBEAT_INTERVAL === 0);
    if (needHeartbeat) {
      await sendHeartbeatNotification();
    }
    
    // 开始监控每个商品
    for (let i = 0; i < productsToMonitor.length; i++) {
      const product = productsToMonitor[i];
      await sendWorkflowLog('进度', `开始监控商品 [${i+1}/${productsToMonitor.length}]: ${product.name || product.id}`, false);
      
      try {
        await monitorProduct(product);
        
        // 如果有多个商品，添加间隔以避免请求过于频繁
        if (i < productsToMonitor.length - 1) {
          await sendWorkflowLog('等待', '等待3秒后监控下一个商品...', false);
          await $.wait(3000);
        }
      } catch (e) {
        await sendWorkflowLog('错误', `监控商品出错: ${e}`, true);
      }
    }
    
    // 计算执行时间
    const executionTime = ((new Date().getTime() - scriptStartTime) / 1000).toFixed(2);
    await sendWorkflowLog('完成', `所有商品监控完成，耗时: ${executionTime}秒`, false);
  } catch (e) {
    await sendWorkflowLog('致命错误', `脚本执行出错: ${e}`, true);
  } finally {
    // 确保所有请求都已完成
    await $.wait(1000);
    $.done();
  }
}

// 发送心跳通知
async function sendHeartbeatNotification() {
  const currentTime = $.time('MM-dd HH:mm:ss');
  
  await sendWorkflowLog('心跳', `发送心跳通知 #${heartbeatCounter}`, false);
  
  const title = `${LOG_PREFIX} 心跳通知 #${heartbeatCounter}`;
  const message = 
    `**脚本运行状态报告**\n\n` +
    `- **当前时间**: ${currentTime}\n` +
    `- **脚本版本**: ${SCRIPT_VERSION}\n` +
    `- **监控商品数**: ${productsToMonitor.length}个\n` +
    `- **工作流日志**: ${ENABLE_WORKFLOW_LOG ? '已开启' : '已关闭'}\n\n` +
    `脚本正常运行中，此为定期状态报告。如需调整心跳频率，请修改脚本中的\`HEARTBEAT_INTERVAL\`值。`;
  
  if (PUSH_KEY) {
    await sendPushDeerNotification(title, message);
  }
  
  // 同时通过系统通知发送简化版心跳
  $.msg(title, `脚本正常运行中 - ${currentTime}`, '点击查看详情');
}

// 初始化产品列表
async function initProductsList() {
  try {
    // 尝试从BoxJs或缓存获取
    let cachedList = $.getdata(PRODUCTS_CACHE_KEY);
    
    if (cachedList) {
      try {
        productsToMonitor = JSON.parse(cachedList);
        await sendWorkflowLog('初始化', `从缓存加载了 ${productsToMonitor.length} 个商品配置`, false);
      } catch (e) {
        await sendWorkflowLog('初始化', `解析缓存商品列表失败: ${e}，将使用默认配置`, true);
        productsToMonitor = DEFAULT_PRODUCTS;
      }
    } else {
      // 首次运行，使用默认值并保存
      productsToMonitor = DEFAULT_PRODUCTS;
      $.setdata(JSON.stringify(productsToMonitor), PRODUCTS_CACHE_KEY);
      await sendWorkflowLog('初始化', `初始化了 ${productsToMonitor.length} 个默认商品配置`, false);
    }
    
    // 确保至少有一个商品可监控
    if (!productsToMonitor || productsToMonitor.length === 0) {
      await sendWorkflowLog('初始化', '未找到有效的商品配置，将使用默认配置', true);
      productsToMonitor = DEFAULT_PRODUCTS;
    }
    
    // 打印将要监控的商品
    await sendWorkflowLog('初始化', `将监控以下商品:\n${productsToMonitor.map((p, i) => `${i+1}. ${p.name || 'ID:'+p.id}`).join('\n')}`, false);
  } catch (e) {
    await sendWorkflowLog('初始化', `初始化商品列表出错: ${e}，将使用默认配置`, true);
    productsToMonitor = DEFAULT_PRODUCTS;
  }
}

// 监控单个商品
async function monitorProduct(product) {
  const productId = product.id;
  const productName = product.name || `ID:${productId}`;
  const productUrl = `https://m.vmall.com/product/comdetail/index.html?prdId=${productId}`;
  const cacheKey = `${STATUS_CACHE_KEY}_${productId}`;
  
  await sendWorkflowLog('检查', `开始检查: ${productName} (ID:${productId})`, false);
  
  try {
    // 获取上次的状态
    const lastStatus = getProductStatus(cacheKey);
    
    if (lastStatus) {
      await sendWorkflowLog('历史', `上次检查: ${lastStatus.timestamp}, 按钮: ${lastStatus.button_mode || '未知'}, 库存: ${lastStatus.stock_status || '未知'}`, false);
    } else {
      await sendWorkflowLog('历史', '首次检查此商品', false);
    }
    
    // 获取当前状态 (包含重试机制)
    let currentStatus = null;
    let retryCount = 0;
    
    while (!currentStatus && retryCount <= MAX_RETRY_COUNT) {
      if (retryCount > 0) {
        await sendWorkflowLog('重试', `第${retryCount}次重试获取商品状态...`, false);
        await $.wait(1000); // 重试前等待1秒
      }
      
      try {
        // 先尝试API方式获取
        currentStatus = await fetchProductStatus(productId, productName, productUrl);
        
        // 如果API方式失败，尝试网页方式
        if (!currentStatus && retryCount < MAX_RETRY_COUNT) {
          await sendWorkflowLog('备用', `API获取失败，尝试从网页获取...`, false);
          currentStatus = await fetchProductPage(productId, productUrl);
        }
      } catch (e) {
        await sendWorkflowLog('请求错误', `获取状态时发生错误: ${e}`, true);
      }
      
      retryCount++;
    }
    
    // 如果获取状态失败
    if (!currentStatus) {
      await sendWorkflowLog('失败', `获取 ${productName} 状态失败，已尝试 ${retryCount} 次`, true);
      
      // 发送失败通知（每天最多一次）
      const lastFailureKey = `${STATUS_CACHE_KEY}_${productId}_last_failure`;
      const lastFailureTime = $.getdata(lastFailureKey) || '0';
      const currentTime = new Date().getTime();
      const oneDayInMs = 24 * 60 * 60 * 1000;
      
      if (currentTime - parseInt(lastFailureTime) > oneDayInMs) {
        $.setdata(currentTime.toString(), lastFailureKey);
        
        // 通过系统通知发送
        const title = `${productName} 监控异常`;
        const subtitle = `无法获取商品状态`;
        const message = `已尝试${retryCount}次获取商品状态但均失败\n请检查网络或脚本配置\n商品链接: ${productUrl}`;
        
        $.msg(title, subtitle, message);
        
        // 通过PushDeer发送详细错误
        if (PUSH_KEY) {
          const pushMessage = 
            `## ${title} - ${subtitle}\n\n` +
            `**商品**: ${productName}\n` +
            `**ID**: ${productId}\n` +
            `**时间**: ${$.time('MM-dd HH:mm:ss')}\n` +
            `**尝试次数**: ${retryCount}\n` +
            `**商品链接**: ${productUrl}\n\n` +
            `请检查网络连接或脚本配置是否正确。此类错误通知每24小时最多发送一次。`;
          
          await sendPushDeerNotification(title, pushMessage);
        }
      }
      
      return;
    }
    
    await sendWorkflowLog('状态', `成功获取状态: 按钮[${currentStatus.button_mode || '未知'}], 库存[${currentStatus.stock_status || '未知'}]`, false);
    
    // 检查状态变化
    const statusChanged = checkStatusChanged(currentStatus, lastStatus);
    
    // 保存新状态（无论是否变化都保存，以便后续比较）
    saveProductStatus(cacheKey, currentStatus);
    
    if (statusChanged.changed) {
      await sendWorkflowLog('变化', `检测到状态变化: ${statusChanged.primary}`, false);
      
      // 发送状态变化通知
      const title = `${productName} 状态更新`;
      const subtitle = statusChanged.primary || "状态已更新";
      const message = formatNotificationMessage(currentStatus, statusChanged.details, productUrl);
      
      // 通过系统通知发送
      $.msg(title, subtitle, message);
      
      // 通过PushDeer发送详细通知
      if (PUSH_KEY) {
        const pushMessage = 
          `## ${title}\n\n` +
          `**检测时间**: ${currentStatus.timestamp}\n\n` +
          `**变化详情**:\n${statusChanged.details.map(d => `- ${d}`).join('\n')}\n\n` +
          `**当前按钮状态**: ${currentStatus.button_mode || '未知'}\n\n` +
          `**当前库存状态**: ${currentStatus.stock_status || '未知'}\n\n` +
          (currentStatus.price ? `**当前价格**: ${currentStatus.price}\n\n` : '') +
          `**数据来源**: ${currentStatus.source || 'API'}\n\n` +
          `**商品链接**: ${productUrl}`;
        
        await sendPushDeerNotification(title, pushMessage);
      }
      
      await sendWorkflowLog('通知', '状态变化通知已发送', false);
    } else {
      await sendWorkflowLog('无变化', `状态未变化: ${currentStatus.button_mode || '未知'}`, false);
    }
  } catch (e) {
    await sendWorkflowLog('错误', `监控商品时发生异常: ${e}`, true);
  }
}

// 从API获取商品状态 (简化版，减少超时风险)
async function fetchProductStatus(productId, productName, productUrl) {
  await sendWorkflowLog('API', `开始从API获取商品状态...`, false);
  
  const apiUrl = `https://m.vmall.com/product/comdetail/getSkuInfo.json?prdId=${productId}`;
  
  return new Promise((resolve) => {
    // 使用更短的超时时间
    const options = {
      url: apiUrl,
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": productUrl,
        "Accept": "application/json, text/javascript, */*; q=0.01"
      },
      timeout: REQUEST_TIMEOUT
    };
    
    $.get(options, async (error, response, data) => {
      if (error) {
        await sendWorkflowLog('API', `请求出错: ${error}`, true);
        resolve(null);
        return;
      }
      
      try {
        // 检查响应状态
        if (!data || response.status !== 200) {
          await sendWorkflowLog('API', `无效响应: ${response?.status || '未知状态码'}`, true);
          resolve(null);
          return;
        }
        
        // 尝试解析JSON
        try {
          const apiData = JSON.parse(data);
          
          if (apiData.code === 0 && apiData.skuInfo) {
            const productInfo = apiData.skuInfo;
            const timestamp = $.time('MM-dd HH:mm:ss');