/*
# 华为Mate 70 Pro+预约监控(精简优化版)
# 解决超时问题，提高执行可靠性
# 使用方法：将脚本添加到定时任务

[Script]
华为预约监控 = type=cron,cronexp="*/5 * * * *",script-path=https://raw.githubusercontent.com/OMOCV/huawei/main/scripts/huawei-monitor-script.js,timeout=30,wake-system=1

[MITM]
hostname = m.vmall.com, www.vmall.com
*/

const $ = new Env("华为预约监控");

// 配置信息
const PRODUCT_ID = "10086989076790"; // 华为 Mate 70 Pro+ 的产品ID
const API_URL = `https://m.vmall.com/product/comdetail/getSkuInfo.json?prdId=${PRODUCT_ID}`;
const PRODUCT_URL = `https://m.vmall.com/product/comdetail/index.html?prdId=${PRODUCT_ID}`;
const STATUS_KEY = "huawei_mate70_status"; // 用于存储状态的键名
const REQUEST_TIMEOUT = 5000; // 5秒请求超时
const CONCURRENT_TIMEOUT = 15000; // 15秒并发超时

// PushDeer配置 - 替换为您的PushDeer Key
const PUSHDEER_KEY = "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV"; 
const PUSHDEER_URL = "https://api2.pushdeer.com/message/push";

// 基础请求头
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Accept": "application/json, text/plain, */*"
};

// 超时保护的Promise
const timeoutPromise = (promise, ms) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`请求超时(${ms}ms)`)), ms))
    ]);
};

// 主函数 - 由定时任务触发
(async () => {
    $.log(`🔔 华为预约监控开始执行 ${new Date().toLocaleString()}`);
    
    try {
        // 使用Promise.race确保总体执行不超时
        await timeoutPromise(checkAndNotify(), CONCURRENT_TIMEOUT);
    } catch (e) {
        $.logErr(`执行超时或出错: ${e.message || e}`);
        // 即使出错也尝试发送通知
        await sendSafeNotification('华为预约监控', `脚本执行出错`, `错误: ${e.message || e}`, true);
    } finally {
        $.log(`✅ 华为预约监控执行完成`);
        $.done();
    }
})();

// 安全发送通知，不抛出异常
async function sendSafeNotification(title, subtitle, message, forceNotify = false) {
    // 发送本地通知
    try {
        $.msg(title, subtitle, message);
        $.log(`本地通知发送成功`);
    } catch (e) {
        $.logErr(`本地通知发送失败: ${e.message}`);
    }
    
    // 只有状态变化或强制通知时才发送PushDeer
    if (forceNotify) {
        try {
            const pushDeerPayload = {
                url: PUSHDEER_URL,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    pushkey: PUSHDEER_KEY,
                    text: title + (subtitle ? ` - ${subtitle}` : ''),
                    desp: message
                }),
                timeout: REQUEST_TIMEOUT
            };
            
            const response = await timeoutPromise(
                new Promise((resolve, reject) => {
                    $.post(pushDeerPayload, (err, resp, data) => {
                        if (err) reject(err);
                        else resolve({resp, data});
                    });
                }),
                REQUEST_TIMEOUT
            );
            
            const result = JSON.parse(response.data);
            if (result.code === 0) {
                $.log(`PushDeer通知发送成功`);
            } else {
                $.log(`PushDeer返回异常: ${JSON.stringify(result)}`);
            }
        } catch (e) {
            $.logErr(`PushDeer通知发送失败: ${e.message}`);
        }
    }
}

// 检查并通知
async function checkAndNotify() {
    try {
        // 获取当前状态 - 只使用API方式，更快速可靠
        const currentStatus = await getProductStatus();
        $.log(`当前状态: ${JSON.stringify(currentStatus)}`);
        
        // 获取上次状态
        const lastStatus = getLastStatus();
        
        // 检查状态变化
        const {changed, details} = checkStatusChanges(currentStatus, lastStatus);
        
        if (changed) {
            $.log(`检测到状态变化: ${details.join(', ')}`);
            
            // 格式化通知消息
            const message = formatNotificationMessage(currentStatus, details);
            
            // 发送双渠道通知
            await sendSafeNotification(
                '华为Mate 70 Pro+预约状态变化', 
                `${details[0] || '状态已变化'}`, 
                message,
                true // 强制发送PushDeer
            );
            
            // 保存当前状态
            saveCurrentStatus(currentStatus);
        } else {
            $.log(`预约状态未发生变化`);
            
            // 首次检查，保存初始状态
            if (!lastStatus) {
                saveCurrentStatus(currentStatus);
                $.log(`首次检查，已保存初始状态`);
            }
        }
    } catch (e) {
        throw new Error(`检查状态失败: ${e.message}`);
    }
}

// 获取产品状态 - 精简版，只使用API接口
async function getProductStatus() {
    try {
        const options = {
            url: API_URL,
            headers: HEADERS,
            timeout: REQUEST_TIMEOUT
        };
        
        const response = await timeoutPromise(
            new Promise((resolve, reject) => {
                $.post(options, (err, resp, data) => {
                    if (err) reject(err);
                    else resolve({resp, data});
                });
            }),
            REQUEST_TIMEOUT
        );
        
        // 解析API数据
        const apiData = JSON.parse(response.data);
        const productInfo = apiData.skuInfo || {};
        
        return {
            product_name: productInfo.prdName || 'Mate 70 Pro+',
            button_mode: productInfo.buttonMode || '',
            stock_status: productInfo.stokStatus || '',
            price: productInfo.price || '',
            timestamp: new Date().toISOString()
        };
    } catch (e) {
        // 如果API失败，返回基本信息，避免脚本中断
        $.logErr(`API请求失败: ${e.message}`);
        return {
            product_name: 'Mate 70 Pro+',
            error: `获取失败: ${e.message}`,
            timestamp: new Date().toISOString()
        };
    }
}

// 获取上次保存的状态
function getLastStatus() {
    try {
        const savedStatus = $.getdata(STATUS_KEY);
        return savedStatus ? JSON.parse(savedStatus) : null;
    } catch (e) {
        $.logErr(`解析保存的状态出错: ${e.message}`);
        return null;
    }
}

// 保存当前状态
function saveCurrentStatus(status) {
    try {
        $.setdata(JSON.stringify(status), STATUS_KEY);
        return true;
    } catch (e) {
        $.logErr(`保存状态失败: ${e.message}`);
        return false;
    }
}

// 检查状态变化 - 精简高效版
function checkStatusChanges(current, last) {
    if (!last) {
        return {
            changed: false,
            details: ["首次检查"]
        };
    }
    
    const changes = [];
    let hasChanged = false;
    
    // 比较关键字段
    const fieldsToCheck = [
        ["button_mode", "按钮状态"],
        ["stock_status", "库存状态"],
        ["price", "价格"]
    ];
    
    for (const [field, label] of fieldsToCheck) {
        if (current[field] && last[field] && current[field] !== last[field]) {
            hasChanged = true;
            changes.push(`${label}: ${last[field]} → ${current[field]}`);
        }
    }
    
    return {
        changed: hasChanged,
        details: changes
    };
}

// 格式化通知消息 - 精简版
function formatNotificationMessage(status, changes) {
    const parts = [];
    
    // 产品名称
    parts.push(`${status.product_name || 'Mate 70 Pro+'} 状态变化!`);
    
    // 变化详情
    if (changes && changes.length) {
        parts.push(`\n\n变化详情:\n${changes.map(c => `• ${c}`).join('\n')}`);
    }
    
    // 当前状态
    if (status.button_mode) parts.push(`\n\n当前按钮: ${status.button_mode}`);
    if (status.stock_status) parts.push(`\n当前库存: ${status.stock_status}`);
    if (status.price) parts.push(`\n当前价格: ${status.price}`);
    
    // 时间和链接
    parts.push(`\n\n检查时间: ${new Date().toLocaleString('zh-CN')}`);
    parts.push(`\n链接: ${PRODUCT_URL}`);
    
    return parts.join('');
}

// Env函数 - 精简版
function Env(t,s){class e{constructor(t){this.env=t}send(t,s="GET"){t="string"==typeof t?{url:t}:t;let e=this.get;return"POST"===s&&(e=this.post),new Promise((s,i)=>{e.call(this,t,(t,e,r)=>{t?i(t):s(e)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,s){this.name=t,this.http=new e(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,s),this.log("",`🔔${this.name}, 开始!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}toObj(t,s=null){try{return JSON.parse(t)}catch{return s}}toStr(t,s=null){try{return JSON.stringify(t)}catch{return s}}getjson(t,s){let e=s;const i=this.getdata(t);if(i)try{e=JSON.parse(this.getdata(t))}catch{}return e}setjson(t,s){try{return this.setdata(JSON.stringify(t),s)}catch{return!1}}getScript(t){return new Promise(s=>{this.get({url:t},(t,e,i)=>s(i))})}runScript(t,s){return new Promise(e=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=s&&s.timeout?s.timeout:r;const[o,n]=i.split("@"),a={url:`http://${n}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(a,(t,s,i)=>e(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),s=this.path.resolve(process.cwd(),this.dataFile),e=this.fs.existsSync(t),i=!e&&this.fs.existsSync(s);if(!e&&!i)return{};{const i=e?t:s;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),s=this.path.resolve(process.cwd(),this.dataFile),e=this.fs.existsSync(t),i=!s&&this.fs.existsSync(s),r=JSON.stringify(this.data);e?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(s,r):this.fs.writeFileSync(t,r)}}lodash_get(t,s,e){const i=s.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return e;return r}lodash_set(t,s,e){return Object(t)!==t?t:(Array.isArray(s)||(s=s.toString().match(/[^.[\]]+/g)||[]),s.slice(0,-1).reduce((t,e,i)=>Object(t[e])===t[e]?t[e]:t[e]=Math.abs(s[i+1])>>0==+s[i+1]?[]:{},t)[s[s.length-1]]=e,t)}getdata(t){let s=this.getval(t);if(/^@/.test(t)){const[,e,i]=/^@(.*?)\.(.*?)$/.exec(t),r=e?this.getval(e):"";if(r)try{const t=JSON.parse(r);s=t?this.lodash_get(t,i,""):s}catch(t){s=""}}return s}setdata(t,s){let e=!1;if(/^@/.test(s)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(s),o=this.getval(i),n=i?"null"===o?null:o||"{}":"{}";try{const s=JSON.parse(n);this.lodash_set(s,r,t),e=this.setval(JSON.stringify(s),i)}catch(s){const o={};this.lodash_set(o,r,t),e=this.setval(JSON.stringify(o),i)}}else e=this.setval(t,s);return e}getval(t){return this.isSurge()||this.isShadowrocket()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,s){return this.isSurge()||this.isShadowrocket()||this.isLoon()?$persistentStore.write(t,s):this.isQuanX()?$prefs.setValueForKey(t,s):this.isNode()?(this.data=this.loaddata(),this.data[s]=t,this.writedata(),!0):this.data&&this.data[s]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,s=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isShadowrocket()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,e,i)=>{!t&&e&&(e.body=i,e.statusCode=e.status?e.status:e.statusCode,e.status=e.statusCode),s(t,e,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:e,statusCode:i,headers:r,body:o}=t;s(null,{status:e,statusCode:i,headers:r,body:o},o)},t=>s(t&&t.error||"UndefinedError"))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,s)=>{try{if(t.headers["set-cookie"]){const e=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();e&&this.ckjar.setCookieSync(e,null),s.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:e,statusCode:i,headers:r,body:o}=t;s(null,{status:e,statusCode:i,headers:r,body:o},o)},t=>s(t)))}post(t,s=(()=>{})){if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isShadowrocket()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.post(t,(t,e,i)=>{!t&&e&&(e.body=i,e.statusCode=e.status?e.status:e.statusCode,e.status=e.statusCode),s(t,e,i)});else if(this.isQuanX())t.method="POST",this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:e,statusCode:i,headers:r,body:o}=t;s(null,{status:e,statusCode:i,headers:r,body:o},o)},t=>s(t&&t.error||"UndefinedError"));else if(this.isNode()){this.initGotEnv(t);const{url:e,...i}=t;this.got.post(e,i).then(t=>{const{statusCode:e,statusCode:i,headers:r,body:o}=t;s(null,{status:e,statusCode:i,headers:r,body:o},o)},t=>s(t))}}msg(s=t,e="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()||this.isShadowrocket()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let s=t.openUrl||t.url||t["open-url"],e=t.mediaUrl||t["media-url"];return{openUrl:s,mediaUrl:e}}if(this.isQuanX()){let s=t["open-url"]||t.url||t.openUrl,e=t["media-url"]||t.mediaUrl,i=t["update-pasteboard"]||t.updatePasteboard;return{"open-url":s,"media-url":e,"update-pasteboard":i}}if(this.isSurge()||this.isShadowrocket()){let s=t.url||t.openUrl||t["open-url"];return{url:s}}}};if(this.isMute||(this.isSurge()||this.isShadowrocket()||this.isLoon()?$notification.post(s,e,i,o(r)):this.isQuanX()&&$notify(s,e,i,o(r))),!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(s),e&&t.push(e),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,s){const e=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();e?this.log("",`❗️${this.name}, 错误!`,t.stack):this.log("",`❗️${this.name}, 错误!`,t)}wait(t){return new Promise(s=>setTimeout(s,t))}done(t={}){const s=(new Date).getTime(),e=(s-this.startTime)/1e3;this.log("",`🔔${this.name}, 结束! 🕛 ${e} 秒`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon()||this.isShadowrocket())&&$done(t)}}(t,s)}