/*
# 华为商城比价(本地解析版)
# 适用于华为商城App及网页版
# 无需依赖外部API服务

[rewrite_local]
http-request ^https?:\/\/(m|www)\.vmall\.com\/product\/(.*\.html|comdetail\/index\.html\?.*prdId=\d+) script-path=https://raw.githubusercontent.com/your-repo/huawei-price-local.js, timeout=60, tag=华为商城比价

[mitm]
hostname = m.vmall.com, www.vmall.com
*/

const consolelog = true; // 启用详细日志便于调试
const url = $request.url;
const $ = new Env("华为商城比价");

console.log(`🔔华为商城比价, 开始!`);
console.log(`[DEBUG] 请求URL: ${url}`);

// 提取产品ID
let productId = extractProductId(url);

if (productId) {
    console.log(`[DEBUG] 提取到产品ID: ${productId}`);
    
    // 设置通知，本地模式下告知用户比价功能已被触发
    let message = {
        title: "华为商城比价",
        subtitle: `已为您获取商品ID: ${productId}`,
        body: "正在为您收集价格信息...\n\n由于外部API无法访问，系统已启用本地解析模式。\n\n请前往商品详情页查看当前价格，或前往其他比价平台（如：什么值得买、淘宝）手动查询该商品历史价格。"
    };
    
    $notification.post(message.title, message.subtitle, message.body);
    
    // 直接从源页面获取产品信息
    getProductInfoFromPage(productId).then(productInfo => {
        if (productInfo) {
            displayLocalProductInfo(productInfo);
        }
        $done({});
    }).catch(err => {
        console.log(`[DEBUG] 获取产品信息失败: ${err}`);
        $done({});
    });
} else {
    console.log(`[DEBUG] 无法提取产品ID`);
    $.msg('华为商城比价', '无法识别商品ID', '请确认访问的是华为商城商品页面');
    $done({});
}

// 提取产品ID的方法
function extractProductId(url) {
    // 尝试多种提取方式
    let productId = null;
    
    // 方法1: 从URL参数提取prdId
    let prdIdMatch = url.match(/[?&]prdId=(\d+)/);
    if (prdIdMatch) {
        return prdIdMatch[1];
    }
    
    // 方法2: 从旧格式URL提取
    let oldFormatMatch = url.match(/product\/(\d+)\.html/);
    if (oldFormatMatch) {
        return oldFormatMatch[1];
    }
    
    // 方法3: 尝试从其他格式提取
    let alternativeMatch = url.match(/\/(\d{10,15})(?:\/|\.html|\?|$)/);
    if (alternativeMatch) {
        return alternativeMatch[1];
    }
    
    return null;
}

// 直接从页面源码获取产品信息
async function getProductInfoFromPage(productId) {
    return new Promise((resolve, reject) => {
        // 构建商品页面URL
        const pageUrl = `https://www.vmall.com/product/${productId}.html`;
        
        // 请求页面
        const options = {
            url: pageUrl,
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            }
        };
        
        console.log(`[DEBUG] 请求页面: ${pageUrl}`);
        
        $.get(options, (err, resp, body) => {
            if (err) {
                console.log(`[DEBUG] 请求页面出错: ${err}`);
                reject(err);
                return;
            }
            
            console.log(`[DEBUG] 页面请求状态码: ${resp?.statusCode}`);
            
            // 如果请求成功，从页面内容中提取信息
            if (resp.statusCode === 200 && body) {
                const productInfo = extractProductInfoFromHTML(body, productId);
                resolve(productInfo);
            } else {
                console.log(`[DEBUG] 请求页面失败: ${resp?.statusCode}`);
                reject(new Error(`请求页面失败: ${resp?.statusCode}`));
            }
        });
    });
}

// 从HTML中提取产品信息
function extractProductInfoFromHTML(html, productId) {
    console.log(`[DEBUG] 开始解析页面内容`);
    
    let productInfo = {
        id: productId,
        title: "",
        price: "",
        originalPrice: "",
        promotions: []
    };
    
    try {
        // 提取商品标题
        const titleMatch = html.match(/<h1[^>]*class="product-name[^"]*"[^>]*>(.*?)<\/h1>/i) || 
                          html.match(/<div[^>]*class="product-info[^"]*"[^>]*>[\s\S]*?<h1[^>]*>(.*?)<\/h1>/i) ||
                          html.match(/<title>(.*?)(?:\s*[-_]\s*华为商城)?<\/title>/i);
                          
        if (titleMatch && titleMatch[1]) {
            productInfo.title = titleMatch[1].trim().replace(/<[^>]+>/g, '');
        }
        
        // 提取价格信息
        const priceMatch = html.match(/\\"price\\":\\"([^"\\]+)\\"/i) || 
                          html.match(/\"price\":\"([^"]+)\"/i) ||
                          html.match(/data-price="([^"]+)"/i);
                          
        if (priceMatch && priceMatch[1]) {
            productInfo.price = priceMatch[1].trim();
        }
        
        // 提取原价信息
        const originalPriceMatch = html.match(/\\"originalPrice\\":\\"([^"\\]+)\\"/i) ||
                                 html.match(/\"originalPrice\":\"([^"]+)\"/i) ||
                                 html.match(/data-original-price="([^"]+)"/i);
                                 
        if (originalPriceMatch && originalPriceMatch[1]) {
            productInfo.originalPrice = originalPriceMatch[1].trim();
        }
        
        // 提取促销信息
        const promoMatches = html.matchAll(/<div[^>]*class="[^"]*promotion-tag[^"]*"[^>]*>(.*?)<\/div>/gi);
        if (promoMatches) {
            for (const match of promoMatches) {
                if (match[1]) {
                    const promoText = match[1].trim().replace(/<[^>]+>/g, '');
                    if (promoText) {
                        productInfo.promotions.push(promoText);
                    }
                }
            }
        }
        
        console.log(`[DEBUG] 提取到商品信息: ${JSON.stringify(productInfo)}`);
        return productInfo;
    } catch (e) {
        console.log(`[DEBUG] 解析页面出错: ${e.message}`);
        return {
            id: productId,
            title: `华为商品 ${productId}`,
            price: "获取失败",
            originalPrice: "",
            promotions: []
        };
    }
}

// 显示产品信息
function displayLocalProductInfo(productInfo) {
    const title = productInfo.title || `华为商品 ${productInfo.id}`;
    
    // 构建价格信息
    let priceInfo = "";
    if (productInfo.price) {
        priceInfo = `当前价格: ¥${productInfo.price}`;
        
        if (productInfo.originalPrice && productInfo.originalPrice !== productInfo.price) {
            const discount = parseFloat(productInfo.originalPrice) - parseFloat(productInfo.price);
            if (!isNaN(discount) && discount > 0) {
                priceInfo += `\n原价: ¥${productInfo.originalPrice} (降价¥${discount.toFixed(2)})`;
            }
        }
    } else {
        priceInfo = "无法获取当前价格";
    }
    
    // 构建促销信息
    let promoInfo = "";
    if (productInfo.promotions && productInfo.promotions.length > 0) {
        promoInfo = "\n\n促销活动:\n" + productInfo.promotions.join("\n");
    }
    
    // 构建比价建议
    const tips = "\n\n由于外部API无法访问，无法获取历史价格数据。建议使用以下方式查询历史价格:\n1. 什么值得买APP\n2. 淘宝比价信息\n3. 考拉历史价格查询";
    
    // 发送通知
    $.msg(title, priceInfo, promoInfo + tips);
}

// Env函数
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;"POST"===e&&(s=this.post);const i=new Promise(((e,i)=>{s.call(this,t,((t,s,o)=>{t?i(t):e(s)}))}));return t.timeout?((t,e=1e3)=>Promise.race([t,new Promise(((t,s)=>{setTimeout((()=>{s(new Error("请求超时"))}),e)}))]))(i,t.timeout):i}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.logLevels={debug:0,info:1,warn:2,error:3},this.logLevelPrefixs={debug:"[DEBUG] ",info:"[INFO] ",warn:"[WARN] ",error:"[ERROR] "},this.logLevel="info",this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null,...s){try{return JSON.stringify(t,...s)}catch{return e}}getjson(t,e){let s=e;if(this.getdata(t))try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise((e=>{this.get({url:t},((t,s,i)=>e(i)))}))}runScript(t,e){return new Promise((s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let o=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");o=o?1*o:20,o=e&&e.timeout?e.timeout:o;const[r,a]=i.split("@"),n={url:`http://${a}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:o},headers:{"X-Key":r,Accept:"*/*"},policy:"DIRECT",timeout:o};this.post(n,((t,e,i)=>s(i)))})).catch((t=>this.logErr(t)))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),o=JSON.stringify(this.data);s?this.fs.writeFileSync(t,o):i?this.fs.writeFileSync(e,o):this.fs.writeFileSync(t,o)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let o=t;for(const t of i)if(o=Object(o)[t],void 0===o)return s;return o}lodash_set(t,e,s){return Object(t)!==t||(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce(((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{}),t)[e[e.length-1]]=s),t}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),o=s?this.getval(s):"";if(o)try{const t=JSON.parse(o);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,o]=/^@(.*?)\.(.*?)$/.exec(e),r=this.getval(i),a=i?"null"===r?null:r||"{}":"{}";try{const e=JSON.parse(a);this.lodash_set(e,o,t),s=this.setval(JSON.stringify(e),i)}catch(e){const r={};this.lodash_set(r,o,t),s=this.setval(JSON.stringify(r),i)}}else s=this.setval(t,e);return s}getval(t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.read(t);case"Quantumult X":return $prefs.valueForKey(t);case"Node.js":return this.data=this.loaddata(),this.data[t];default:return this.data&&this.data[t]||null}}setval(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.write(t,e);case"Quantumult X":return $prefs.setValueForKey(t,e);case"Node.js":return this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0;default:return this.data&&this.data[e]||null}}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.cookie&&void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar)))}get(t,e=(()=>{})){switch(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"],delete t.headers["content-type"],delete t.headers["content-length"]),t.params&&(t.url+="?"+this.queryStr(t.params)),void 0===t.followRedirect||t.followRedirect||((this.isSurge()||this.isLoon())&&(t["auto-redirect"]=!1),this.isQuanX()&&(t.opts?t.opts.redirection=!1:t.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,((t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)}));break;case"Quantumult X":this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then((t=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=t;e(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(t=>e(t&&t.error||"UndefinedError")));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",((t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}})).then((t=>{const{statusCode:i,statusCode:o,headers:r,rawBody:a}=t,n=s.decode(a,this.encoding);e(null,{status:i,statusCode:o,headers:r,rawBody:a,body:n},n)}),(t=>{const{message:i,response:o}=t;e(i,o,o&&s.decode(o.rawBody,this.encoding))}));break}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";switch(t.body&&t.headers&&!t.headers["Content-Type"]&&!t.headers["content-type"]&&(t.headers["content-type"]="application/x-www-form-urlencoded"),t.headers&&(delete t.headers["Content-Length"],delete t.headers["content-length"]),void 0===t.followRedirect||t.followRedirect||((this.isSurge()||this.isLoon())&&(t["auto-redirect"]=!1),this.isQuanX()&&(t.opts?t.opts.redirection=!1:t.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,((t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)}));break;case"Quantumult X":t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then((t=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=t;e(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(t=>e(t&&t.error||"UndefinedError")));break;case"Node.js":let i=require("iconv-lite");this.initGotEnv(t);const{url:o,...r}=t;this.got[s](o,r).then((t=>{const{statusCode:s,statusCode:o,headers:r,rawBody:a}=t,n=i.decode(a,this.encoding);e(null,{status:s,statusCode:o,headers:r,rawBody:a,body:n},n)}),(t=>{const{message:s,response:o}=t;e(s,o,o&&i.decode(o.rawBody,this.encoding))}));break}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}queryStr(t){let e="";for(const s in t){let i=t[s];null!=i&&""!==i&&("object"==typeof i&&(i=JSON.stringify(i)),e+=`${s}=${i}&`)}return e=e.substring(0,e.length-1),e}msg(e=t,s="",i="",o={}){const r=t=>{const{$open:e,$copy:s,$media:i,$mediaMime:o}=t;switch(typeof t){case void 0:return t;case"string":switch(this.getEnv()){case"Surge":case"Stash":default:return{url:t};case"Loon":case"Shadowrocket":return t;case"Quantumult X":return{"open-url":t};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":default:{const r={};let a=t.openUrl||t.url||t["open-url"]||e;a&&Object.assign(r,{action:"open-url",url:a});let n=t["update-pasteboard"]||t.updatePasteboard||s;if(n&&Object.assign(r,{action:"clipboard",text:n}),i){let t,e,s;if(i.startsWith("http"))t=i;else if(i.startsWith("data:")){const[t]=i.split(";"),[,o]=i.split(",");e=o,s=t.replace("data:","")}else{e=i,s=(t=>{const e={JVBERi0:"application/pdf",R0lGODdh:"image/gif",R0lGODlh:"image/gif",iVBORw0KGgo:"image/png","/9j/":"image/jpg"};for(var s in e)if(0===t.indexOf(s))return e[s];return null})(i)}Object.assign(r,{"media-url":t,"media-base64":e,"media-base64-mime":o??s})}return Object.assign(r,{"auto-dismiss":t["auto-dismiss"],sound:t.sound}),r}case"Loon":{const s={};let o=t.openUrl||t.url||t["open-url"]||e;o&&Object.assign(s,{openUrl:o});let r=t.mediaUrl||t["media-url"];return i?.startsWith("http")&&(r=i),r&&Object.assign(s,{mediaUrl:r}),console.log(JSON.stringify(s)),s}case"Quantumult X":{const o={};let r=t["open-url"]||t.url||t.openUrl||e;r&&Object.assign(o,{"open-url":r});let a=t["media-url"]||t.mediaUrl;i?.startsWith("http")&&(a=i),a&&Object.assign(o,{"media-url":a});let n=t["update-pasteboard"]||t.updatePasteboard||s;return n&&Object.assign(o,{"update-pasteboard":n}),console.log(JSON.stringify(o)),o}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(e,s,i,r(o));break;case"Quantumult X":$notify(e,s,i,r(o));break;case"Node.js":break}if(!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}debug(...t){this.logLevels[this.logLevel]<=this.logLevels.debug&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.debug}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}info(...t){this.logLevels[this.logLevel]<=this.logLevels.info&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.info}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}warn(...t){this.logLevels[this.logLevel]<=this.logLevels.warn&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.warn}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}error(...t){this.logLevels[this.logLevel]<=this.logLevels.error&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.error}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.map((t=>t??String(t))).join(this.logSeparator))}logErr(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,e,t);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,e,void 0!==t.message?t.message:t,t.stack);break}}wait(t){return new Promise((e=>setTimeout(e,t)))}done(t={}){const e=((new Date).getTime()-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${e} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:$done(t);break;case"Node.js":process.exit(1)}}}(t,e)}