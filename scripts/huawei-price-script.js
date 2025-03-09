/*
# 华为商城比价(弹窗通知版)
# 适用于华为商城App及网页版

# 功能：
# 1. 监控华为商城商品页面
# 2. 获取商品历史价格数据
# 3. 弹窗展示历史最低价及各时间段最低价格
# 4. 支持显示双11、618等活动价格对比

[rewrite_local]
http-request ^https?:\/\/(m|www)\.vmall\.com\/product\/(.*\.html|comdetail\/index\.html\?.*prdId=\d+) script-path=https://raw.githubusercontent.com/OMOCV/huawei-price/main/scripts/huawei-price-script.js, timeout=60, tag=华为商城比价

[mitm]
hostname = m.vmall.com, www.vmall.com
*/

const consolelog = true; // Changed to true for debugging
const url = $request.url;
const $ = new Env("华为商城比价");

// Add debug logging
console.log(`[DEBUG] 请求URL: ${url}`);

// 检查是否包含prdId参数
var prdIdMatch = url.match(/[?&]prdId=(\d+)/);
console.log(`[DEBUG] prdId匹配结果: ${JSON.stringify(prdIdMatch)}`);

if (prdIdMatch) {
    // 从URL参数中提取ID
    let productId = prdIdMatch[1];
    let shareUrl = "https://www.vmall.com/product/" + productId + '.html';
    console.log(`[DEBUG] 使用prdId参数提取: ${productId}, 共享URL: ${shareUrl}`);
    
    request_history_price(shareUrl).then(data => {
        console.log(`[DEBUG] API响应: ${JSON.stringify(data)}`);
        if (data) {
            if (data.ok === 1 && data.single) {
                const lower = lowerMsgs(data.single);
                const detail = priceSummary(data);
                const tip = data.PriceRemark?.Tip ? data.PriceRemark.Tip + "(仅供参考)" : "价格数据仅供参考";
                const message = `${lower} ${tip}`;
                $.msg(data.single.title, message, detail);
            } else if (data.ok === 0 && data.msg?.length > 0) {
                const message = "慢慢买提示您：" + data.msg;
                $.msg('比价结果', '', message);
                console.log(`[DEBUG] API返回信息: ${data.msg}`);
            } else {
                $.msg('比价结果', '', '未获取到价格数据');
                console.log(`[DEBUG] 未获取到价格数据: ${JSON.stringify(data)}`);
            }
            $done({});
        } else {
            $.msg('比价失败', '', '请求价格数据失败，请稍后再试');
            console.log(`[DEBUG] 请求价格数据失败，空响应`);
            $done({});
        }
    }).catch(error => {
        console.log(`[DEBUG] 详细错误: ${error.message}, ${error.stack}`);
        $.msg('比价失败', '', '请求价格数据出错，请稍后再试');
        $done({});
    });
} else {
    // 尝试旧格式URL
    var oldFormatMatch = url.match(/product\/(\d+)\.html/);
    console.log(`[DEBUG] 旧格式URL匹配结果: ${JSON.stringify(oldFormatMatch)}`);
    
    if (oldFormatMatch) {
        let productId = oldFormatMatch[1];
        let shareUrl = "https://www.vmall.com/product/" + productId + '.html';
        console.log(`[DEBUG] 使用旧格式提取: ${productId}, 共享URL: ${shareUrl}`);
        
        request_history_price(shareUrl).then(data => {
            console.log(`[DEBUG] API响应: ${JSON.stringify(data)}`);
            if (data) {
                if (data.ok === 1 && data.single) {
                    const lower = lowerMsgs(data.single);
                    const detail = priceSummary(data);
                    const tip = data.PriceRemark?.Tip ? data.PriceRemark.Tip + "(仅供参考)" : "价格数据仅供参考";
                    const message = `${lower} ${tip}`;
                    $.msg(data.single.title, message, detail);
                } else if (data.ok === 0 && data.msg?.length > 0) {
                    const message = "慢慢买提示您：" + data.msg;
                    $.msg('比价结果', '', message);
                    console.log(`[DEBUG] API返回信息: ${data.msg}`);
                } else {
                    $.msg('比价结果', '', '未获取到价格数据');
                    console.log(`[DEBUG] 未获取到价格数据: ${JSON.stringify(data)}`);
                }
                $done({});
            } else {
                $.msg('比价失败', '', '请求价格数据失败，请稍后再试');
                console.log(`[DEBUG] 请求价格数据失败，空响应`);
                $done({});
            }
        }).catch(error => {
            console.log(`[DEBUG] 详细错误: ${error.message}, ${error.stack}`);
            $.msg('比价失败', '', '请求价格数据出错，请稍后再试');
            $done({});
        });
    } else {
        console.log(`[DEBUG] 未能匹配产品ID，URL不符合任何已知格式`);
        $.msg('华为商城比价', '无法识别商品ID', '请确认访问的是华为商城商品页面');
        $done({});
    }
}

function lowerMsgs(single) {
    if (!single.lowerPriceyh) return "暂无历史最低价格数据 ";
    
    const lower = single.lowerPriceyh;
    const timestamp = parseInt(single.lowerDateyh.match(/\d+/), 10);
    const lowerDate = $.time('yyyy-MM-dd', timestamp);
    const lowerMsg = "历史最低:¥" + String(lower) + `(${lowerDate}) `;
    return lowerMsg;
}

function priceSummary(data) {
    let summary = "";
    if (!data.PriceRemark || !data.PriceRemark.ListPriceDetail) {
        return "暂无详细价格数据";
    }
    
    let listPriceDetail = data.PriceRemark.ListPriceDetail.slice(0, 4);
    let list = listPriceDetail.concat(historySummary(data.single));
    
    // 找出价格字段的最大宽度，用于对齐
    const maxWidth = list.reduce((max, item) => Math.max(max, item.Price?.length || 0), 0);
    
    list.forEach(item => {
        // 处理特殊名称
        const nameMap = {
            "双11价格": "双十一价格",
            "618价格": "六一八价格"
        };
        
        if (!item.Name || !item.Price || item.Price === '-') return;
        
        item.Name = nameMap[item.Name] || item.Name;
        Delimiter = '  ';
        
        // 格式化价格，使其宽度一致
        let len = item.Price.length;
        if (len < maxWidth) {
            item.Price = item.Price.includes('.') || (len + 1 == maxWidth) ? item.Price : `${item.Price}.`;
            let flag = item.Price.includes('.') ? '0' : ' ';
            item.Price = item.Price.padEnd(maxWidth, flag);        
        }
        
        summary += `${item.Name}${Delimiter}${item.Price}${Delimiter}${item.Date}${Delimiter}${item.Difference === '-' ? '' : item.Difference}\n`;
    });
    
    // 删除最后一个换行
    summary = summary.replace(/\n$/, "");
    return summary || "暂无价格历史数据";
}

function historySummary(single) {
    if (!single || !single.jiagequshiyh) {
        return [];
    }
    
    let currentPrice, lowest30, lowest90, lowest180, lowest360;
    let singleArray;
    
    try {
        singleArray = JSON.parse(`[${single.jiagequshiyh}]`);
    } catch (e) {
        console.log(`[DEBUG] 解析价格历史数据失败: ${e.message}`);
        return [];
    }
    
    const singleFormatted = singleArray.map(item => ({
        Date: item[0],
        Price: item[1],
        Name: item[2]
    }));
    
    let list = singleFormatted.reverse().slice(0, 360); // 取最近 360 天数据
    if (list.length === 0) return [];

    const createLowest = (name, price, date) => ({
        Name: name,
        Price: `¥${price}`,
        Date: date,
        Difference: difference(currentPrice, price),
        price
    });
    
    list.forEach((item, index) => {
        const date = $.time('yyyy-MM-dd', item.Date);
        let price = item.Price;
        
        if (index === 0) {
            currentPrice = price;
            lowest30 = createLowest("三十天最低", price, date);
            lowest90 = createLowest("九十天最低", price, date);
            lowest180 = createLowest("一百八最低", price, date);
            lowest360 = createLowest("三百六最低", price, date);
        }
        
        const updateLowest = (lowest, days) => {
            if (index < days && price < lowest.price) {
                lowest.price = price;
                lowest.Price = `¥${price}`;
                lowest.Date = date;
                lowest.Difference = difference(currentPrice, price);
            }
        };
        
        updateLowest(lowest30, 30);
        updateLowest(lowest90, 90);
        updateLowest(lowest180, 180);
        updateLowest(lowest360, 360);
    });
    
    return [lowest30, lowest90, lowest180, lowest360];
}

function difference(currentPrice, price, precision = 2) {
    if (!currentPrice || !price) return "-";
    
    const current = parseFloat(currentPrice);
    const compared = parseFloat(price);
    
    if (isNaN(current) || isNaN(compared)) return "-";
    
    const diff = (current - compared).toFixed(precision);
    return diff == 0 ? "-" : `${diff > 0 ? "↑" : "↓"}${Math.abs(diff)}`;
}

function request_history_price(share_url) {
    return new Promise((resolve, reject) => {
        console.log(`[DEBUG] 请求价格历史数据，URL: ${share_url}`);
        const options = {
            url: "https://apapia-history.manmanbuy.com/ChromeWidgetServices/WidgetServices.ashx",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
            },
            body: 'methodName=getHistoryTrend&p_url=' + encodeURIComponent(share_url)
        };
        
        console.log(`[DEBUG] 请求选项: ${JSON.stringify(options)}`);
        $.post(options, (error, response, data) => {
            if (error) {
                console.log(`[DEBUG] 请求错误: ${JSON.stringify(error)}`);
                reject(error);
            } else {
                console.log(`[DEBUG] 价格API响应状态码: ${response?.statusCode}`);
                console.log(`[DEBUG] 价格API响应数据: ${data?.substring(0, 200)}...`);
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (e) {
                    console.log(`[DEBUG] JSON解析错误: ${e.message}`);
                    reject(e);
                }
            }
        });
    });
}

function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;"POST"===e&&(s=this.post);const i=new Promise(((e,i)=>{s.call(this,t,((t,s,o)=>{t?i(t):e(s)}))}));return t.timeout?((t,e=1e3)=>Promise.race([t,new Promise(((t,s)=>{setTimeout((()=>{s(new Error("请求超时"))}),e)}))]))(i,t.timeout):i}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.logLevels={debug:0,info:1,warn:2,error:3},this.logLevelPrefixs={debug:"[DEBUG] ",info:"[INFO] ",warn:"[WARN] ",error:"[ERROR] "},this.logLevel="info",this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null,...s){try{return JSON.stringify(t,...s)}catch{return e}}getjson(t,e){let s=e;if(this.getdata(t))try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise((e=>{this.get({url:t},((t,s,i)=>e(i)))}))}runScript(t,e){return new Promise((s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let o=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");o=o?1*o:20,o=e&&e.timeout?e.timeout:o;const[r,a]=i.split("@"),n={url:`http://${a}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:o},headers:{"X-Key":r,Accept:"*/*"},policy:"DIRECT",timeout:o};this.post(n,((t,e,i)=>s(i)))})).catch((t=>this.logErr(t)))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),o=JSON.stringify(this.data);s?this.fs.writeFileSync(t,o):i?this.fs.writeFileSync(e,o):this.fs.writeFileSync(t,o)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let o=t;for(const t of i)if(o=Object(o)[t],void 0===o)return s;return o}lodash_set(t,e,s){return Object(t)!==t||(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce(((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{}),t)[e[e.length-1]]=s),t}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),o=s?this.getval(s):"";if(o)try{const t=JSON.parse(o);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,o]=/^@(.*?)\.(.*?)$/.exec(e),r=this.getval(i),a=i?"null"===r?null:r||"{}":"{}";try{const e=JSON.parse(a);this.lodash_set(e,o,t),s=this.setval(JSON.stringify(e),i)}catch(e){const r={};this.lodash_set(r,o,t),s=this.setval(JSON.stringify(r),i)}}else s=this.setval(t,e);return s}getval(t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.read(t);case"Quantumult X":return $prefs.valueForKey(t);case"Node.js":return this.data=this.loaddata(),this.data[t];default:return this.data&&this.data[t]||null}}setval(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.write(t,e);case"Quantumult X":return $prefs.setValueForKey(t,e);case"Node.js":return this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0;default:return this.data&&this.data[e]||null}}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.cookie&&void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar)))}get(t,e=(()=>{})){switch(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"],delete t.headers["content-type"],delete t.headers["content-length"]),t.params&&(t.url+="?"+this.queryStr(t.params)),void 0===t.followRedirect||t.followRedirect||((this.isSurge()||this.isLoon())&&(t["auto-redirect"]=!1),this.isQuanX()&&(t.opts?t.opts.redirection=!1:t.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,((t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)}));break;case"Quantumult X":this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then((t=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=t;e(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(t=>e(t&&t.error||"UndefinedError")));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",((t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}})).then((t=>{const{statusCode:i,statusCode:o,headers:r,rawBody:a}=t,n=s.decode(a,this.encoding);e(null,{status:i,statusCode:o,headers:r,rawBody:a,body:n},n)}),(t=>{const{message:i,response:o}=t;e(i,o,o&&s.decode(o.rawBody,this.encoding))}));break}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";switch(t.body&&t.headers&&!t.headers["Content-Type"]&&!t.headers["content-type"]&&(t.headers["content-type"]="application/x-www-form-urlencoded"),t.headers&&(delete t.headers["Content-Length"],delete t.headers["content-length"]),void 0===t.followRedirect||t.followRedirect||((this.isSurge()||this.isLoon())&&(t["auto-redirect"]=!1),this.isQuanX()&&(t.opts?t.opts.redirection=!1:t.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,((t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)}));break;case"Quantumult X":t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then((t=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=t;e(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(t=>e(t&&t.error||"UndefinedError")));break;case"Node.js":let i=require("iconv-lite");this.initGotEnv(t);const{url:o,...r}=t;this.got[s](o,r).then((t=>{const{statusCode:s,statusCode:o,headers:r,rawBody:a}=t,n=i.decode(a,this.encoding);e(null,{status:s,statusCode:o,headers:r,rawBody:a,body:n},n)}),(t=>{const{message:s,response:o}=t;e(s,o,o&&i.decode(o.rawBody,this.encoding))}));break}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}queryStr(t){let e="";for(const s in t){let i=t[s];null!=i&&""!==i&&("object"==typeof i&&(i=JSON.stringify(i)),e+=`${s}=${i}&`)}return e=e.substring(0,e.length-1),e}msg(e=t,s="",i="",o={}){const r=t=>{const{$open:e,$copy:s,$media:i,$mediaMime:o}=t;switch(typeof t){case void 0:return t;case"string":switch(this.getEnv()){case"Surge":case"Stash":default:return{url:t};case"Loon":case"Shadowrocket":return t;case"Quantumult X":return{"open-url":t};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":default:{const r={};let a=t.openUrl||t.url||t["open-url"]||e;a&&Object.assign(r,{action:"open-url",url:a});let n=t["update-pasteboard"]||t.updatePasteboard||s;if(n&&Object.assign(r,{action:"clipboard",text:n}),i){let t,e,s;if(i.startsWith("http"))t=i;else if(i.startsWith("data:")){const[t]=i.split(";"),[,o]=i.split(",");e=o,s=t.replace("data:","")}else{e=i,s=(t=>{const e={JVBERi0:"application/pdf",R0lGODdh:"image/gif",R0lGODlh:"image/gif",iVBORw0KGgo:"image/png","/9j/":"image/jpg"};for(var s in e)if(0===t.indexOf(s))return e[s];return null})(i)}Object.assign(r,{"media-url":t,"media-base64":e,"media-base64-mime":o??s})}return Object.assign(r,{"auto-dismiss":t["auto-dismiss"],sound:t.sound}),r}case"Loon":{const s={};let o=t.openUrl||t.url||t["open-url"]||e;o&&Object.assign(s,{openUrl:o});let r=t.mediaUrl||t["media-url"];return i?.startsWith("http")&&(r=i),r&&Object.assign(s,{mediaUrl:r}),console.log(JSON.stringify(s)),s}case"Quantumult X":{const o={};let r=t["open-url"]||t.url||t.openUrl||e;r&&Object.assign(o,{"open-url":r});let a=t["media-url"]||t.mediaUrl;i?.startsWith("http")&&(a=i),a&&Object.assign(o,{"media-url":a});let n=t["update-pasteboard"]||t.updatePasteboard||s;return n&&Object.assign(o,{"update-pasteboard":n}),console.log(JSON.stringify(o)),o}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(e,s,i,r(o));break;case"Quantumult X":$notify(e,s,i,r(o));break;case"Node.js":break}if(!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}debug(...t){this.logLevels[this.logLevel]<=this.logLevels.debug&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.debug}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}info(...t){this.logLevels[this.logLevel]<=this.logLevels.info&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.info}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}warn(...t){this.logLevels[this.logLevel]<=this.logLevels.warn&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.warn}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}error(...t){this.logLevels[this.logLevel]<=this.logLevels.error&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.error}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.map((t=>t??String(t))).join(this.logSeparator))}logErr(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,e,t);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,e,void 0!==t.message?t.message:t,t.stack);break}}wait(t){return new Promise((e=>setTimeout(e,t)))}done(t={}){const e=((new Date).getTime()-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${e} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:$done(t);break;case"Node.js":process.exit(1)}}}(t,e)}