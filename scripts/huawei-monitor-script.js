/*
# 2025-03-11
# 华为商品状态监控(自动化定时版)
# 适用于Surge/Loon/QuantumultX等
# 脚本功能：自动监控华为商城商品(如Mate系列)的预约/开售状态
# BoxJs订阅：https://raw.githubusercontent.com/OMOCV/huawei/main/json/huawei-monitor.json

[task_local]
# 每5分钟运行一次 (可根据需要调整)
*/5 * * * * https://raw.githubusercontent.com/OMOCV/huawei/main/scripts/huawei-monitor-script.js

[mitm]
hostname = m.vmall.com

******************************************
* 优化说明:
* 1. 添加自动访问功能，无需手动访问页面触发
* 2. 修复JSON解析错误，增加HTML响应处理能力
* 3. 优化异步操作和超时处理
* 4. 支持监控多个商品ID
* 5. 完全兼容BoxJs配置管理
******************************************
*/

const consolelog = true; // 启用日志
const $ = new Env("华为商品监控");

// BoxJs相关配置
const BOXJS_PREFIX = "huawei_"; // BoxJs前缀
const BOXJS_PRODUCTS_KEY = BOXJS_PREFIX + "products_list"; // 商品列表键名
const BOXJS_PUSH_KEY_NAME = BOXJS_PREFIX + "push_key"; // PushDeer Key键名
const BOXJS_WORKFLOW_LOG_KEY = BOXJS_PREFIX + "enable_workflow_log"; // 工作流日志开关键名

// 通用配置
const STATUS_CACHE_KEY = "huawei_monitor_status";
const LOG_PREFIX = "🔄华为监控"; // 日志前缀
const PRODUCTS_CACHE_KEY = "huawei_products_list";

// 从BoxJs读取配置
const PUSH_KEY = $.getdata(BOXJS_PUSH_KEY_NAME) || "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV"; // 优先使用BoxJs中的值
const ENABLE_WORKFLOW_LOG = $.getdata(BOXJS_WORKFLOW_LOG_KEY) === "true"; // 从BoxJs读取日志开关

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

// 脚本入口函数
async function start() {
  // 脚本信息
  $.log(`
============= 华为商品监控 =============
运行时间: ${$.time('MM-dd HH:mm:ss')}
脚本版本: 1.2.0 (自动化BoxJs兼容版)
====================================
  `);
  
  // 初始化产品列表（首次运行或从缓存恢复）
  await initProductsList();
  
  // 开始监控每个商品
  for (let i = 0; i < productsToMonitor.length; i++) {
    const product = productsToMonitor[i];
    $.log(`开始监控商品 [${i+1}/${productsToMonitor.length}]: ${product.name || product.id}`);
    
    try {
      await monitorProduct(product);
      
      // 如果有多个商品，添加间隔以避免请求过于频繁
      if (i < productsToMonitor.length - 1) {
        $.log('等待5秒后监控下一个商品...');
        await $.wait(5000);
      }
    } catch (e) {
      $.log(`监控商品出错: ${e}`);
    }
  }
  
  // 监控完成
  $.log('所有商品监控完成');
  $.done();
}

// 初始化产品列表 - BoxJs兼容版
async function initProductsList() {
  try {
    // 尝试从BoxJs获取
    const boxJsList = $.getdata(BOXJS_PRODUCTS_KEY);
    const cachedList = $.getdata(PRODUCTS_CACHE_KEY);
    
    if (boxJsList) {
      try {
        // 优先使用BoxJs中的配置
        productsToMonitor = JSON.parse(boxJsList);
        $.log(`从BoxJs加载了 ${productsToMonitor.length} 个商品配置`);
        
        // 同步到原缓存以保持一致性
        $.setdata(boxJsList, PRODUCTS_CACHE_KEY);
      } catch (e) {
        $.log(`BoxJs商品列表解析出错: ${e}，尝试使用原缓存`);
        if (cachedList) {
          productsToMonitor = JSON.parse(cachedList);
          $.log(`从原缓存加载了 ${productsToMonitor.length} 个商品配置`);
        } else {
          productsToMonitor = DEFAULT_PRODUCTS;
          $.log(`使用默认商品配置`);
        }
      }
    } else if (cachedList) {
      // 如果BoxJs中没有，但原缓存有
      productsToMonitor = JSON.parse(cachedList);
      $.log(`从原缓存加载了 ${productsToMonitor.length} 个商品配置`);
      
      // 同步到BoxJs以保持一致性
      $.setdata(cachedList, BOXJS_PRODUCTS_KEY);
    } else {
      // 首次运行，使用默认值并保存到两处
      productsToMonitor = DEFAULT_PRODUCTS;
      const defaultJson = JSON.stringify(DEFAULT_PRODUCTS);
      
      $.setdata(defaultJson, PRODUCTS_CACHE_KEY);
      $.setdata(defaultJson, BOXJS_PRODUCTS_KEY);
      
      $.log(`初始化了 ${productsToMonitor.length} 个默认商品配置`);
    }
  } catch (e) {
    // 出错时使用默认配置
    $.log(`初始化商品列表出错: ${e}，将使用默认配置`);
    productsToMonitor = DEFAULT_PRODUCTS;
  }
}

// 监控单个商品
async function monitorProduct(product) {
  const productId = product.id;
  const productName = product.name || `ID:${productId}`;
  const apiUrl = `https://m.vmall.com/product/comdetail/getSkuInfo.json?prdId=${productId}`;
  const productUrl = `https://m.vmall.com/product/comdetail/index.html?prdId=${productId}`;
  
  $.log(`
--------------------------------
开始检查: ${productName}
商品ID: ${productId}
商品链接: ${productUrl}
--------------------------------
  `);
  
  // 设置超时处理
  let isTimedOut = false;
  const timeout = setTimeout(() => {
    isTimedOut = true;
    $.log(`监控商品 ${productName} 超时（15秒）`);
  }, 15000);
  
  try {
    // 获取上次的状态 - BoxJs兼容版
    const lastStatus = getProductStatus(productId);
    
    if (lastStatus) {
      $.log(`上次检查时间: ${lastStatus.timestamp}`);
      $.log(`上次按钮状态: ${lastStatus.button_mode || '未知'}`);
      $.log(`上次库存状态: ${lastStatus.stock_status || '未知'}`);
    } else {
      $.log('首次检查此商品');
    }
    
    // 获取当前状态
    const currentStatus = await fetchProductStatus(productId, productName, productUrl);
    
    // 如果已超时，跳过后续处理
    if (isTimedOut) return;
    
    // 如果获取状态失败
    if (!currentStatus) {
      $.log(`获取 ${productName} 状态失败`);
      
      // 可选：添加失败通知
      if (!lastStatus || lastStatus.timestamp < ($.time('MM-dd HH:mm:ss') - 86400)) {
        // 只有首次失败或超过一天未收到通知时才发送
        $.msg(
          `${productName} 监控异常`, 
          `无法获取商品状态`, 
          `请检查网络或脚本配置\n商品链接: ${productUrl}`
        );
      }
      
      return;
    }
    
    // 检查状态变化
    const statusChanged = checkStatusChanged(currentStatus, lastStatus);
    
    if (statusChanged.changed) {
      // 保存新状态 - BoxJs兼容版
      saveProductStatus(productId, currentStatus);
      
      // 发送状态变化通知
      const title = `${productName} 状态更新`;
      const subtitle = statusChanged.primary || "状态已更新";
      const message = formatNotificationMessage(currentStatus, statusChanged.details, productUrl);
      
      $.msg(title, subtitle, message);
      
      // 可选：发送更详细的PushDeer通知
      if (PUSH_KEY) {
        await sendPushDeerNotification(
          title,
          `## ${subtitle}\n\n${message}`
        );
      }
      
      $.log(`状态变化已通知: ${subtitle}`);
    } else {
      $.log(`状态未变化: ${currentStatus.button_mode || '未知'}`);
    }
  } catch (e) {
    $.log(`监控出错: ${e}`);
  } finally {
    // 清除超时定时器
    clearTimeout(timeout);
  }
}

// 获取商品状态
async function fetchProductStatus(productId, productName, productUrl) {
  $.log(`正在获取 ${productName} 的状态...`);
  
  const apiUrl = `https://m.vmall.com/product/comdetail/getSkuInfo.json?prdId=${productId}`;
  
  return new Promise((resolve) => {
    // 设置请求超时
    const timeout = setTimeout(() => {
      $.log(`API请求超时（5秒）`);
      resolve(null);
    }, 5000);
    
    // 构建Headers
    const headers = {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": productUrl,
      "Accept": "application/json, text/javascript, */*; q=0.01"
    };
    
    const options = {
      url: apiUrl,
      headers: headers,
      timeout: 5000
    };
    
    // 发送请求
    $.get(options, async (error, response, data) => {
      clearTimeout(timeout);
      
      if (error) {
        $.log(`请求出错: ${error}`);
        resolve(null);
        return;
      }
      
      try {
        // 检查响应状态
        if (!data || response.status !== 200) {
          $.log(`无效响应: ${response?.status || '未知状态码'}`);
          
          // API请求失败后，尝试直接获取页面
          const pageStatus = await fetchProductPage(productId, productUrl);
          if (pageStatus) {
            resolve(pageStatus);
          } else {
            resolve(null);
          }
          return;
        }
        
        // 尝试解析JSON
        try {
          const apiData = JSON.parse(data);
          
          if (apiData.code === 0 && apiData.skuInfo) {
            const productInfo = apiData.skuInfo;
            const timestamp = $.time('MM-dd HH:mm:ss');
            
            // 提取产品信息
            const productStatus = {
              "source": "api",
              "product_id": productId,
              "product_name": productInfo.prdName || productName,
              "button_mode": productInfo.buttonMode || '',
              "stock_status": productInfo.stokStatus || '',
              "price": productInfo.price || '',
              "timestamp": timestamp
            };
            
            $.log(`成功获取状态: ${productStatus.button_mode}`);
            resolve(productStatus);
          } else {
            $.log(`API返回错误: ${apiData.code || '未知错误'}`);
            
            // 尝试备用方案
            const pageStatus = await fetchProductPage(productId, productUrl);
            resolve(pageStatus);
          }
        } catch (parseError) {
          $.log(`JSON解析错误: ${parseError}`);
          
          // JSON解析失败，可能是返回了HTML，尝试备用方案
          const pageStatus = await fetchProductPage(productId, productUrl);
          resolve(pageStatus);
        }
      } catch (e) {
        $.log(`处理响应出错: ${e}`);
        resolve(null);
      }
    });
  });
}

// 备用方案：直接获取商品页面
async function fetchProductPage(productId, productUrl) {
  $.log(`尝试从页面获取商品信息...`);
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      $.log(`页面请求超时（5秒）`);
      resolve(null);
    }, 5000);
    
    const headers = {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml"
    };
    
    const options = {
      url: productUrl,
      headers: headers,
      timeout: 5000
    };
    
    $.get(options, (error, response, data) => {
      clearTimeout(timeout);
      
      if (error || !data) {
        $.log(`获取页面出错: ${error || '无数据'}`);
        resolve(null);
        return;
      }
      
      try {
        // 简单解析HTML
        const timestamp = $.time('MM-dd HH:mm:ss');
        
        // 提取产品名称
        const nameMatch = data.match(/<h1[^>]*class="product-name"[^>]*>(.*?)<\/h1>/i) || 
                         data.match(/<title>(.*?)(?:\s*[-_|]\s*华为商城)?<\/title>/i);
        const productName = nameMatch ? nameMatch[1].trim() : `商品${productId}`;
        
        // 提取按钮状态
        const buttonTextMatch = data.match(/class="button-primary[^"]*"[^>]*>([^<]+)</i) || 
                              data.match(/id="pro-operation"[^>]*>[\s\S]*?<a[^>]*>([^<]+)</i);
        const buttonMode = buttonTextMatch ? buttonTextMatch[1].trim() : '未知';
        
        // 提取库存状态
        const stockMatch = data.match(/(?:库存|商品|销售)[^<]*?(?:紧张|充足|缺货|售完|售罄|暂停|火爆)/i);
        const stockStatus = stockMatch ? stockMatch[0].trim() : '未知';
        
        // 提取价格
        const priceMatch = data.match(/class="product-price[^"]*"[^>]*>.*?([¥￥]?\s*\d+,?\d+\.?\d*)/i) ||
                         data.match(/(?:价格|售价)\D*([¥￥]?\s*\d+,?\d+\.?\d*)/i);
        const price = priceMatch ? priceMatch[1].trim() : '';
        
        const productStatus = {
          "source": "page",
          "product_id": productId,
          "product_name": productName,
          "button_mode": buttonMode,
          "stock_status": stockStatus,
          "price": price,
          "timestamp": timestamp
        };
        
        $.log(`从页面提取状态: ${buttonMode}`);
        resolve(productStatus);
      } catch (e) {
        $.log(`解析页面出错: ${e}`);
        resolve(null);
      }
    });
  });
}

// 检查状态变化
function checkStatusChanged(current, last) {
  if (!last) {
    return {
      changed: true,
      primary: "首次检查",
      details: ["首次获取商品状态"]
    };
  }
  
  // 检查核心变化
  const buttonChanged = current.button_mode !== last.button_mode;
  const stockChanged = current.stock_status !== last.stock_status;
  const priceChanged = current.price && last.price && current.price !== last.price;
  
  // 如果没有变化
  if (!buttonChanged && !stockChanged && !priceChanged) {
    return { changed: false };
  }
  
  // 收集变化详情
  const details = [];
  let primary = "";
  
  if (buttonChanged) {
    const detail = `按钮: ${last.button_mode || '未知'} → ${current.button_mode || '未知'}`;
    details.push(detail);
    primary = detail;
  }
  
  if (stockChanged) {
    const detail = `库存: ${last.stock_status || '未知'} → ${current.stock_status || '未知'}`;
    details.push(detail);
    if (!primary) primary = detail;
  }
  
  if (priceChanged) {
    const detail = `价格: ${last.price || '未知'} → ${current.price || '未知'}`;
    details.push(detail);
    if (!primary) primary = detail;
  }
  
  return {
    changed: true,
    primary: primary,
    details: details
  };
}

// 格式化通知消息
function formatNotificationMessage(status, details, productUrl) {
  const message = 
    `• 商品名称: ${status.product_name}\n` +
    `• 检测时间: ${status.timestamp}\n` +
    `• 当前按钮: ${status.button_mode || '未知'}\n` +
    `• 库存状态: ${status.stock_status || '未知'}\n` +
    (status.price ? `• 商品价格: ${status.price}\n` : '') +
    (details && details.length > 0 ? 
      `\n【变化详情】\n${details.map(d => `• ${d}`).join('\n')}\n` : '') +
    `\n点击查看商品详情`;
  
  return message;
}

// 获取商品历史状态 - BoxJs兼容版
function getProductStatus(productId) {
  try {
    // 兼容BoxJs的键名格式
    const boxjsKey = `${BOXJS_PREFIX}monitor_status_${productId}`;
    const originalKey = `${STATUS_CACHE_KEY}_${productId}`;
    
    // 优先尝试读取BoxJs格式的键
    let savedStatus = $.getdata(boxjsKey);
    if (!savedStatus) {
      // 如果BoxJs格式不存在，尝试读取原格式
      savedStatus = $.getdata(originalKey);
    }
    
    if (!savedStatus) return null;
    
    return JSON.parse(savedStatus);
  } catch (e) {
    $.log(`读取状态出错: ${e}`);
    return null;
  }
}

// 保存商品状态 - BoxJs兼容版
function saveProductStatus(productId, status) {
  try {
    const jsonStatus = JSON.stringify(status);
    
    // 兼容BoxJs的键名格式
    const boxjsKey = `${BOXJS_PREFIX}monitor_status_${productId}`;
    const originalKey = `${STATUS_CACHE_KEY}_${productId}`;
    
    // 同时保存到两种格式
    const saveResult1 = $.setdata(jsonStatus, originalKey);
    const saveResult2 = $.setdata(jsonStatus, boxjsKey);
    
    $.log(`状态保存${(saveResult1 && saveResult2) ? '成功' : '部分失败'}`);
  } catch (e) {
    $.log(`保存状态出错: ${e}`);
  }
}

// 发送PushDeer通知
async function sendPushDeerNotification(text, desp) {
  return new Promise((resolve) => {
    if (!PUSH_KEY) {
      resolve(false);
      return;
    }
    
    const options = {
      url: "https://api2.pushdeer.com/message/push",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pushkey: PUSH_KEY,
        text: text,
        desp: desp,
        type: "markdown"
      })
    };
    
    $.post(options, (error, response, data) => {
      if (error) {
        $.log(`PushDeer通知发送失败: ${error}`);
        resolve(false);
        return;
      }
      
      try {
        const res = JSON.parse(data);
        resolve(res.code === 0);
      } catch (e) {
        resolve(false);
      }
    });
  });
}

// 发送工作流日志（有条件执行）
async function sendWorkflowLog(step, message, isError = false) {
  if (!ENABLE_WORKFLOW_LOG) return;
  
  const timestamp = $.time('HH:mm:ss.SSS');
  const logTitle = `${LOG_PREFIX} ${isError ? '❌' : '✅'} 步骤${step}`;
  const logMessage = `[${timestamp}] ${message}`;
  
  consolelog && console.log(logMessage);
  
  try {
    await sendPushDeerNotification(logTitle, logMessage);
  } catch (e) {
    consolelog && console.log(`发送日志失败: ${e}`);
  }
}

// 开始执行脚本
start();

// Env函数 - 适配不同平台
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;"POST"===e&&(s=this.post);const i=new Promise(((e,i)=>{s.call(this,t,((t,s,o)=>{t?i(t):e(s)}))}));return t.timeout?((t,e=1e3)=>Promise.race([t,new Promise(((t,s)=>{setTimeout((()=>{s(new Error("请求超时"))}),e)}))]))(i,t.timeout):i}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.logLevels={debug:0,info:1,warn:2,error:3},this.logLevelPrefixs={debug:"[DEBUG] ",info:"[INFO] ",warn:"[WARN] ",error:"[ERROR] "},this.logLevel="info",this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null,...s){try{return JSON.stringify(t,...s)}catch{return e}}getjson(t,e){let s=e;if(this.getdata(t))try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise((e=>{this.get({url:t},((t,s,i)=>e(i)))}))}runScript(t,e){return new Promise((s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let o=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");o=o?1*o:20,o=e&&e.timeout?e.timeout:o;const[r,a]=i.split("@"),n={url:`http://${a}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:o},headers:{"X-Key":r,Accept:"*/*"},policy:"DIRECT",timeout:o};this.post(n,((t,e,i)=>s(i)))})).catch((t=>this.logErr(t)))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),o=JSON.stringify(this.data);s?this.fs.writeFileSync(t,o):i?this.fs.writeFileSync(e,o):this.fs.writeFileSync(t,o)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let o=t;for(const t of i)if(o=Object(o)[t],void 0===o)return s;return o}lodash_set(t,e,s){return Object(t)!==t||(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce(((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{}),t)[e[e.length-1]]=s),t}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),o=s?this.getval(s):"";if(o)try{const t=JSON.parse(o);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,o]=/^@(.*?)\.(.*?)$/.exec(e),r=this.getval(i),a=i?"null"===r?null:r||"{}":"{}";try{const e=JSON.parse(a);this.lodash_set(e,o,t),s=this.setval(JSON.stringify(e),i)}catch(e){const r={};this.lodash_set(r,o,t),s=this.setval(JSON.stringify(r),i)}}else s=this.setval(t,e);return s}getval(t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.read(t);case"Quantumult X":return $prefs.valueForKey(t);case"Node.js":return this.data=this.loaddata(),this.data[t];default:return this.data&&this.data[t]||null}}setval(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.write(t,e);case"Quantumult X":return $prefs.setValueForKey(t,e);case"Node.js":return this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0;default:return this.data&&this.data[e]||null}}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.cookie&&void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar)))}get(t,e=(()=>{})){switch(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"],delete t.headers["content-type"],delete t.headers["content-length"]),t.params&&(t.url+="?"+this.queryStr(t.params)),void 0===t.followRedirect||t.followRedirect||((this.isSurge()||this.isLoon())&&(t["auto-redirect"]=!1),this.isQuanX()&&(t.opts?t.opts.redirection=!1:t.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,((t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)}));break;case"Quantumult X":this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then((t=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=t;e(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(t=>e(t&&t.error||"UndefinedError")));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",((t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}})).then((t=>{const{statusCode:i,statusCode:o,headers:r,rawBody:a}=t,n=s.decode(a,this.encoding);e(null,{status:i,statusCode:o,headers:r,rawBody:a,body:n},n)}),(t=>{const{message:i,response:o}=t;e(i,o,o&&s.decode(o.rawBody,this.encoding))}));break}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";switch(t.body&&t.headers&&!t.headers["Content-Type"]&&!t.headers["content-type"]&&(t.headers["content-type"]="application/x-www-form-urlencoded"),t.headers&&(delete t.headers["Content-Length"],delete t.headers["content-length"]),void 0===t.followRedirect||t.followRedirect||((this.isSurge()||this.isLoon())&&(t["auto-redirect"]=!1),this.isQuanX()&&(t.opts?t.opts.redirection=!1:t.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,((t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)}));break;case"Quantumult X":t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then((t=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=t;e(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(t=>e(t&&t.error||"UndefinedError")));break;case"Node.js":let i=require("iconv-lite");this.initGotEnv(t);const{url:o,...r}=t;this.got[s](o,r).then((t=>{const{statusCode:s,statusCode:o,headers:r,rawBody:a}=t,n=i.decode(a,this.encoding);e(null,{status:s,statusCode:o,headers:r,rawBody:a,body:n},n)}),(t=>{const{message:s,response:o}=t;e(s,o,o&&i.decode(o.rawBody,this.encoding))}));break}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}queryStr(t){let e="";for(const s in t){let i=t[s];null!=i&&""!==i&&("object"==typeof i&&(i=JSON.stringify(i)),e+=`${s}=${i}&`)}return e=e.substring(0,e.length-1),e}msg(e=t,s="",i="",o={}){const r=t=>{const{$open:e,$copy:s,$media:i,$mediaMime:o}=t;switch(typeof t){case void 0:return t;case"string":switch(this.getEnv()){case"Surge":case"Stash":default:return{url:t};case"Loon":case"Shadowrocket":return t;case"Quantumult X":return{"open-url":t};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":default:{const r={};let a=t.openUrl||t.url||t["open-url"]||e;a&&Object.assign(r,{action:"open-url",url:a});let n=t["update-pasteboard"]||t.updatePasteboard||s;if(n&&Object.assign(r,{action:"clipboard",text:n}),i){let t,e,s;if(i.startsWith("http"))t=i;else if(i.startsWith("data:")){const[t]=i.split(";"),[,o]=i.split(",");e=o,s=t.replace("data:","")}else{e=i,s=(t=>{const e={JVBERi0:"application/pdf",R0lGODdh:"image/gif",R0lGODlh:"image/gif",iVBORw0KGgo:"image/png","/9j/":"image/jpg"};for(var s in e)if(0===t.indexOf(s))return e[s];return null})(i)}Object.assign(r,{"media-url":t,"media-base64":e,"media-base64-mime":o??s})}return Object.assign(r,{"auto-dismiss":t["auto-dismiss"],sound:t.sound}),r}case"Loon":{const s={};let o=t.openUrl||t.url||t["open-url"]||e;o&&Object.assign(s,{openUrl:o});let r=t.mediaUrl||t["media-url"];return i?.startsWith("http")&&(r=i),r&&Object.assign(s,{mediaUrl:r}),console.log(JSON.stringify(s)),s}case"Quantumult X":{const o={};let r=t["open-url"]||t.url||t.openUrl||e;r&&Object.assign(o,{"open-url":r});let a=t["media-url"]||t.mediaUrl;i?.startsWith("http")&&(a=i),a&&Object.assign(o,{"media-url":a});let n=t["update-pasteboard"]||t.updatePasteboard||s;return n&&Object.assign(o,{"update-pasteboard":n}),console.log(JSON.stringify(o)),o}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(e,s,i,r(o));break;case"Quantumult X":$notify(e,s,i,r(o));break;case"Node.js":break}if(!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}debug(...t){this.logLevels[this.logLevel]<=this.logLevels.debug&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.debug}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}info(...t){this.logLevels[this.logLevel]<=this.logLevels.info&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.info}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}warn(...t){this.logLevels[this.logLevel]<=this.logLevels.warn&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.warn}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}error(...t){this.logLevels[this.logLevel]<=this.logLevels.error&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.error}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.map((t=>t??String(t))).join(this.logSeparator))}logErr(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,e,t);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,e,void 0!==t.message?t.message:t,t.stack);break}}wait(t){return new Promise((e=>setTimeout(e,t)))}done(t={}){const e=((new Date).getTime()-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${e} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:$done(t);break;case"Node.js":process.exit(1)}}}(t,e)}