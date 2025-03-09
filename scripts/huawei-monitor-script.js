/*
# 华为Mate 70 Pro+预约监控(定时检查+双通道通知版)
# 适用于Surge、Shadowrocket、Loon等支持cron定时任务的代理软件
# 定时检查预约状态并通过PushDeer+本地通知双渠道提醒

[Script]
华为预约监控 = type=cron,cronexp="*/5 * * * *",script-path=https://raw.githubusercontent.com/OMOCV/huawei/main/scripts/huawei-monitor-script.js,timeout=60,wake-system=1

[MITM]
hostname = m.vmall.com, www.vmall.com
*/

const $ = new Env("华为预约监控");

// 配置信息
const PRODUCT_ID = "10086989076790"; // 华为 Mate 70 Pro+ 的产品ID
const PRODUCT_URL = `https://m.vmall.com/product/comdetail/index.html?prdId=${PRODUCT_ID}`;
const API_URL = `https://m.vmall.com/product/comdetail/getSkuInfo.json?prdId=${PRODUCT_ID}`;
const STATUS_KEY = "huawei_mate70_status"; // 用于存储状态的键名
const CHECK_INTERVAL_MINUTES = 5; // 每5分钟检查一次（由cron任务控制，这里仅作为说明）

// PushDeer配置
const PUSHDEER_KEY = "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV"; // 替换为您的PushDeer Key
const PUSHDEER_URL = "https://api2.pushdeer.com/message/push";

// 设置浏览器标头
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": PRODUCT_URL,
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest"
};

$.log(`🔔华为预约监控, 开始定时检查!`);

// 主函数 - 由定时任务触发
(async () => {
    try {
        await checkAndNotify();
        $.done();
    } catch (e) {
        $.logErr(e);
        $.msg('华为预约监控', '执行出错', `错误信息: ${e.message || e}`);
        await sendPushDeerNotification('华为预约监控执行出错', `错误信息: ${e.message || e}`);
        $.done();
    }
})();

// 获取上次保存的状态
function getLastStatus() {
    let savedStatus = $.getdata(STATUS_KEY);
    if (savedStatus) {
        try {
            return JSON.parse(savedStatus);
        } catch (e) {
            $.log(`解析保存的状态出错: ${e.message}`);
        }
    }
    return null;
}

// 保存当前状态
function saveCurrentStatus(status) {
    $.setdata(JSON.stringify(status), STATUS_KEY);
    $.log(`保存当前状态成功`);
}

// 发送PushDeer通知
async function sendPushDeerNotification(title, message) {
    return new Promise((resolve, reject) => {
        const options = {
            url: PUSHDEER_URL,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pushkey: PUSHDEER_KEY,
                text: title,
                desp: message
            })
        };
        
        $.log(`正在发送PushDeer通知...`);
        
        $.post(options, (err, resp, data) => {
            if (err) {
                $.log(`PushDeer通知发送失败: ${JSON.stringify(err)}`);
                reject(err);
                return;
            }
            
            try {
                const result = JSON.parse(data);
                if (result.code === 0) {
                    $.log(`PushDeer通知发送成功`);
                    resolve(true);
                } else {
                    $.log(`PushDeer服务返回错误: ${JSON.stringify(result)}`);
                    reject(new Error(`PushDeer服务返回错误: ${JSON.stringify(result)}`));
                }
            } catch (e) {
                $.log(`解析PushDeer响应出错: ${e.message}`);
                reject(e);
            }
        });
    });
}

// 使用API获取预约状态
async function fetchApiStatus() {
    return new Promise((resolve, reject) => {
        const options = {
            url: API_URL,
            headers: HEADERS,
            timeout: 10000
        };
        
        $.log(`正在通过API获取预约状态...`);
        
        $.post(options, (error, response, data) => {
            if (error) {
                $.log(`API请求错误: ${JSON.stringify(error)}`);
                reject(error);
                return;
            }
            
            try {
                if (response.statusCode === 200) {
                    const apiData = JSON.parse(data);
                    
                    // 提取相关信息
                    const productInfo = apiData.skuInfo || {};
                    const productName = productInfo.prdName || '未知产品';
                    const productStatus = productInfo.buttonMode || '';
                    const productStock = productInfo.stokStatus || '';
                    
                    $.log(`获取产品状态成功: ${productName}, 按钮状态: ${productStatus}, 库存状态: ${productStock}`);
                    
                    resolve({
                        source: "api",
                        product_name: productName,
                        button_mode: productStatus,
                        stock_status: productStock,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    $.log(`API响应状态码异常: ${response.statusCode}`);
                    reject(new Error(`API请求失败，状态码: ${response.statusCode}`));
                }
            } catch (e) {
                $.log(`解析API响应出错: ${e.message}`);
                reject(e);
            }
        });
    });
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
            
            return {
                source: "page_json",
                product_name: skuInfo.prdName || '未知产品',
                button_mode: skuInfo.buttonMode || '',
                stock_status: skuInfo.stokStatus || '',
                timestamp: new Date().toISOString()
            };
        }
    } catch (e) {
        $.log(`解析页面JSON失败: ${e.message}`);
    }
    return null;
}

// 尝试从页面获取预约状态
async function fetchPageStatus() {
    return new Promise((resolve, reject) => {
        const options = {
            url: PRODUCT_URL,
            headers: HEADERS,
            timeout: 30000
        };
        
        $.log(`正在从页面获取预约状态...`);
        
        $.get(options, (error, response, data) => {
            if (error) {
                $.log(`页面请求错误: ${JSON.stringify(error)}`);
                reject(error);
                return;
            }
            
            try {
                if (response.statusCode === 200) {
                    // 首先尝试从页面中提取JSON
                    const jsonStatus = extractJsonFromPage(data);
                    if (jsonStatus) {
                        $.log(`从页面JSON获取状态成功`);
                        resolve(jsonStatus);
                        return;
                    }
                    
                    // 如果无法提取JSON，尝试搜索页面中的关键文本
                    const reservationIndicators = [
                        '预约', '申购', '抢购', '开售', '立即购买', '立即申购', '立即预约', 
                        '预定', '售罄', '已售完', '等待开售', '即将开售', '暂停销售'
                    ];
                    
                    let reservationTexts = [];
                    for (const indicator of reservationIndicators) {
                        if (data.includes(indicator)) {
                            reservationTexts.push(indicator);
                        }
                    }
                    
                    // 提取页面标题
                    const titleMatch = data.match(/<title>(.*?)<\/title>/);
                    const title = titleMatch ? titleMatch[1].trim() : "未知产品";
                    
                    $.log(`从页面HTML提取状态成功`);
                    resolve({
                        source: "page_html",
                        page_title: title,
                        reservation_text: reservationTexts,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    $.log(`页面请求失败，状态码: ${response.statusCode}`);
                    reject(new Error(`页面请求失败，状态码: ${response.statusCode}`));
                }
            } catch (e) {
                $.log(`解析页面出错: ${e.message}`);
                reject(e);
            }
        });
    });
}

// 获取预约状态，优先使用API，失败时回退到网页抓取
async function getReservationStatus() {
    try {
        // 优先尝试API
        return await fetchApiStatus();
    } catch (error) {
        $.log(`API请求失败，尝试从页面获取状态: ${error.message}`);
        try {
            // API失败时回退到网页抓取
            return await fetchPageStatus();
        } catch (pageError) {
            $.log(`页面抓取也失败了: ${pageError.message}`);
            throw new Error("无法获取预约状态，API和页面抓取均失败");
        }
    }
}

// 检查状态变化
function checkStatusChanges(current, last) {
    if (!last) {
        $.log(`没有保存的上次状态，这是首次检查`);
        return {
            changed: false,
            details: ["首次检查，没有变化记录"]
        };
    }
        
    let statusChanged = false;
    let changeDetails = [];
    
    // 比较核心字段
    const fieldsToCompare = [
        ["button_mode", "按钮状态"],
        ["stock_status", "库存状态"]
    ];
    
    for (const [field, label] of fieldsToCompare) {
        if (field in current && field in last && current[field] !== last[field]) {
            statusChanged = true;
            changeDetails.push(`${label}从 '${last[field]}' 变为 '${current[field]}'`);
        }
    }
    
    // 比较预约相关文本
    if ("reservation_text" in current && "reservation_text" in last) {
        const currentSet = new Set(current.reservation_text);
        const lastSet = new Set(last.reservation_text);
        
        const currentArray = [...currentSet].sort();
        const lastArray = [...lastSet].sort();
        
        if (JSON.stringify(currentArray) !== JSON.stringify(lastArray)) {
            statusChanged = true;
            
            const newTexts = currentArray.filter(text => !lastSet.has(text));
            const removedTexts = lastArray.filter(text => !currentSet.has(text));
            
            if (newTexts.length > 0) {
                changeDetails.push(`新增预约相关文本: ${newTexts.join(', ')}`);
            }
            if (removedTexts.length > 0) {
                changeDetails.push(`移除预约相关文本: ${removedTexts.join(', ')}`);
            }
        }
    }
    
    return {
        changed: statusChanged,
        details: changeDetails
    };
}

// 格式化通知消息
function formatNotificationMessage(currentStatus, changeDetails) {
    let messageParts = [`华为 Mate 70 Pro+ 预约状态变化!\n\n`];
    
    if (currentStatus.product_name) {
        messageParts.push(`产品名称: ${currentStatus.product_name}\n\n`);
    }
    
    if (changeDetails && changeDetails.length > 0) {
        messageParts.push(`变化详情:\n${changeDetails.map(detail => `- ${detail}`).join('\n')}\n\n`);
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
    messageParts.push(`检查时间: ${new Date().toLocaleString('zh-CN')}\n\n`);
    messageParts.push(`产品链接: ${PRODUCT_URL}`);
    
    return messageParts.join("");
}

// 检查预约状态并在变化时发送通知
async function checkAndNotify() {
    try {
        // 获取当前状态
        const currentStatus = await getReservationStatus();
        $.log(`成功获取当前状态`);
        
        // 获取上次状态
        const lastStatus = getLastStatus();
        
        // 检查状态变化
        const {changed, details} = checkStatusChanges(currentStatus, lastStatus);
        
        if (changed) {
            $.log(`检测到状态变化: ${details.join(', ')}`);
            
            // 格式化通知消息
            const message = formatNotificationMessage(currentStatus, details);
            
            // 双渠道通知
            // 1. 发送本地弹窗通知
            $.msg('华为 Mate 70 Pro+ 预约通知', `状态已变化`, message);
            $.log(`已发送本地弹窗通知`);
            
            // 2. 发送PushDeer通知
            try {
                await sendPushDeerNotification('华为 Mate 70 Pro+ 预约通知', message);
                $.log(`已发送PushDeer通知`);
            } catch (pushError) {
                $.logErr(pushError);
                $.log(`PushDeer通知发送失败，但本地通知已发送`);
            }
            
            // 保存当前状态
            saveCurrentStatus(currentStatus);
        } else {
            $.log(`预约状态未发生变化`);
            
            // 仍然更新保存状态（更新时间戳）
            if (!lastStatus) {
                saveCurrentStatus(currentStatus);
                $.log(`首次检查，已保存初始状态`);
            }
        }
    } catch (error) {
        $.logErr(error);
        $.msg('华为预约监控', '检查失败', `获取预约状态时出错: ${error.message}`);
        throw error; // 重新抛出错误，让外层捕获并处理
    }
}

// 以下是Env函数，与原JavaScript脚本相同
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;"POST"===e&&(s=this.post);return new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),n={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(n,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.post(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method="POST",this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:s,...i}=t;this.got.post(s,i).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`❗️${this.name}, 错误!`,t.stack):this.log("",`❗️${this.name}, 错误!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}