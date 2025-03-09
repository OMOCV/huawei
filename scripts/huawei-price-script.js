/*
# 华为商城比价(最终解决方案)
# 适用于华为商城App及网页版
# 无需依赖外部API，直接从价格元素和产品模块提取数据

[rewrite_local]
http-request ^https?:\/\/(m|www)\.vmall\.com\/product\/(.*\.html|comdetail\/index\.html\?.*prdId=\d+) script-path=https://raw.githubusercontent.com/OMOCV/huawei-price/main/scripts/huawei-price-script.js, timeout=60, tag=华为商城比价

[mitm]
hostname = m.vmall.com, www.vmall.com
*/

// 使用严格模式减少错误
'use strict';

const consolelog = true; // 启用详细日志
const url = $request.url;
const $ = new Env("华为商城比价");

console.log(`🔔华为商城比价, 开始!`);
console.log(`[DEBUG] 请求URL: ${url}`);

// 提取产品ID
let productId = extractProductId(url);

if (productId) {
    console.log(`[DEBUG] 提取到产品ID: ${productId}`);
    
    // 构建通知
    let initialMessage = {
        title: "华为商城比价",
        subtitle: `正在获取商品ID: ${productId} 的价格信息`,
        body: "正在分析页面中..."
    };
    
    // 发送初始通知以提供反馈
    $notification.post(initialMessage.title, initialMessage.subtitle, initialMessage.body);
    
    // 获取产品信息 - 使用多个来源
    getCompleteProductInfo(productId).then(productInfo => {
        if (productInfo) {
            console.log(`[DEBUG] 最终提取到商品信息: ${JSON.stringify(productInfo)}`);
            displayProductInfo(productInfo);
        } else {
            $.msg('华为商城比价', '获取产品信息失败', '无法解析产品数据');
        }
        $done({});
    }).catch(err => {
        console.log(`[DEBUG] 获取产品信息失败: ${err}`);
        $.msg('华为商城比价', '获取产品信息失败', err.message || '请求出错');
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

// 综合获取产品信息，使用多个来源
async function getCompleteProductInfo(productId) {
    let productInfo = {
        id: productId,
        title: "",
        price: "",
        originalPrice: "",
        promotions: [],
        possiblePrices: []  // 存储所有可能的价格值
    };
    
    try {
        // 1. 首先，尝试从页面获取信息
        const pageInfo = await getProductInfoFromPage(productId);
        if (pageInfo) {
            productInfo = mergeProductInfo(productInfo, pageInfo);
        }
        
        // 2. 如果价格仍然未获取，尝试从移动端API获取
        if (!productInfo.price || productInfo.price === "") {
            try {
                const apiInfo = await fetchPriceFromAPI(productId);
                if (apiInfo && apiInfo.price) {
                    productInfo.price = apiInfo.price;
                    if (apiInfo.originalPrice) {
                        productInfo.originalPrice = apiInfo.originalPrice;
                    }
                }
            } catch (apiErr) {
                console.log(`[DEBUG] API获取价格失败: ${apiErr}`);
            }
        }
        
        // 3. 如果仍然没有价格，但有可能的价格列表，使用最可能的价格
        if ((!productInfo.price || productInfo.price === "") && productInfo.possiblePrices.length > 0) {
            // 排序可能的价格（通常较高的数字更可能是价格）
            productInfo.possiblePrices.sort((a, b) => b - a);
            
            // 使用最可能的价格
            if (productInfo.possiblePrices.length >= 2) {
                // 通常最大的是原价，第二大的是当前价格
                productInfo.originalPrice = productInfo.possiblePrices[0].toString();
                productInfo.price = productInfo.possiblePrices[1].toString();
            } else if (productInfo.possiblePrices.length === 1) {
                productInfo.price = productInfo.possiblePrices[0].toString();
            }
            
            console.log(`[DEBUG] 使用推断价格：当前价格=${productInfo.price}，原价=${productInfo.originalPrice}`);
        }
        
        return productInfo;
    } catch (err) {
        console.log(`[DEBUG] 获取综合产品信息失败: ${err}`);
        throw err;
    }
}

// 合并产品信息，保留有效字段
function mergeProductInfo(target, source) {
    if (source.title && source.title !== "") target.title = source.title;
    if (source.price && source.price !== "") target.price = source.price;
    if (source.originalPrice && source.originalPrice !== "") target.originalPrice = source.originalPrice;
    
    // 合并促销信息
    if (source.promotions && source.promotions.length > 0) {
        source.promotions.forEach(promo => {
            if (!target.promotions.includes(promo)) {
                target.promotions.push(promo);
            }
        });
    }
    
    // 合并可能的价格
    if (source.possiblePrices && source.possiblePrices.length > 0) {
        source.possiblePrices.forEach(price => {
            if (!target.possiblePrices.includes(price)) {
                target.possiblePrices.push(price);
            }
        });
    }
    
    return target;
}

// 从页面获取产品信息
async function getProductInfoFromPage(productId) {
    return new Promise((resolve, reject) => {
        // 尝试多个URL
        const urls = [
            `https://m.vmall.com/product/comdetail/index.html?prdId=${productId}`, // 移动商详页
            `https://m.vmall.com/product/${productId}.html`,                      // 移动网页版
            `https://www.vmall.com/product/${productId}.html`                     // 标准PC网页版
        ];
        
        // 优先使用移动端URL
        const pageUrl = urls[0];
        
        // 请求页面
        const options = {
            url: pageUrl,
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh-Hans;q=0.9"
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
                try {
                    // 提取产品信息
                    const productInfo = extractProductInfoFromHTML(body, productId);
                    resolve(productInfo);
                } catch (parseErr) {
                    console.log(`[DEBUG] 解析页面内容失败: ${parseErr}`);
                    reject(parseErr);
                }
            } else {
                console.log(`[DEBUG] 请求页面失败: ${resp?.statusCode}`);
                reject(new Error(`请求页面失败: ${resp?.statusCode}`));
            }
        });
    });
}

// 从API获取价格信息
async function fetchPriceFromAPI(productId) {
    return new Promise((resolve, reject) => {
        // 尝试多个API端点
        const apiUrls = [
            `https://m.vmall.com/mst/price/querySbomPrice?portalId=10016&skuIds=${productId}`,
            `https://m.vmall.com/product/getPrice?skuId=${productId}`
        ];
        
        // 使用第一个API
        const apiUrl = apiUrls[0];
        
        const options = {
            url: apiUrl,
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                "Accept": "application/json"
            }
        };
        
        console.log(`[DEBUG] 请求价格API: ${apiUrl}`);
        
        $.get(options, (err, resp, data) => {
            if (err) {
                console.log(`[DEBUG] 价格API请求失败: ${err}`);
                reject(err);
                return;
            }
            
            try {
                console.log(`[DEBUG] 价格API响应: ${data}`);
                
                // 尝试解析JSON响应
                const jsonData = JSON.parse(data);
                if (jsonData && jsonData.data && jsonData.data.length > 0) {
                    const priceInfo = {
                        price: jsonData.data[0].price || jsonData.data[0].skuPrice || "",
                        originalPrice: jsonData.data[0].originPrice || jsonData.data[0].marketPrice || ""
                    };
                    resolve(priceInfo);
                } else {
                    reject(new Error("价格数据不存在"));
                }
            } catch (parseErr) {
                console.log(`[DEBUG] 解析价格API响应失败: ${parseErr}`);
                reject(parseErr);
            }
        });
    });
}

// 高级HTML分析提取产品信息
function extractProductInfoFromHTML(html, productId) {
    console.log(`[DEBUG] 开始解析页面内容`);
    
    let productInfo = {
        id: productId,
        title: "",
        price: "",
        originalPrice: "",
        promotions: [],
        possiblePrices: []
    };
    
    try {
        // 1. 提取标题 - 使用多种模式
        const titlePatterns = [
            /<h1[^>]*class="[^"]*product-name[^"]*"[^>]*>(.*?)<\/h1>/is,
            /<div[^>]*class="[^"]*product-info[^"]*"[^>]*>[\s\S]*?<h1[^>]*>(.*?)<\/h1>/is,
            /<title>(.*?)(?:\s*[-_]\s*华为商城)?<\/title>/is,
            /name:\s*['"]([^'"]+)['"]/is,
            /<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i
        ];
        
        for (const pattern of titlePatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                productInfo.title = match[1].trim().replace(/<[^>]+>/g, '');
                console.log(`[DEBUG] 找到标题: ${productInfo.title}`);
                break;
            }
        }
        
        // 2. 提取价格 - 使用多种模式
        const pricePatterns = [
            // 数据属性
            /data-price=['"]([^'"]+)['"]/i,
            /data-current-price=['"]([^'"]+)['"]/i,
            // JSON字符串内的价格
            /\\"price\\":\s*\\"([^"\\]+)\\"/i,
            /\"price\":\s*\"([^"]+)\"/i,
            /\"salePrice\":\s*\"([^"]+)\"/i,
            // 价格元素文本
            /<span[^>]*class="[^"]*price[^"]*"[^>]*>([\d\.]+)<\/span>/i,
            /<span[^>]*class="[^"]*current-price[^"]*"[^>]*>([\d\.]+)<\/span>/i,
            // JavaScript变量
            /var\s+price\s*=\s*["']([^"']+)["']/i,
            /price:\s*['"]([^'"]+)['"]/i,
            // 价格元素内容
            /<[^>]*class="[^"]*price[^"]*"[^>]*>([\d\.]+)<\/[^>]*>/i,
            // 模块价格
            /<div[^>]*id="pro-price-text"[^>]*>.*?([0-9]+(?:\.[0-9]+)?)/is
        ];
        
        for (const pattern of pricePatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                productInfo.price = match[1].trim();
                console.log(`[DEBUG] 找到价格: ${productInfo.price}`);
                break;
            }
        }
        
        // 3. 提取原价 - 使用多种模式
        const originalPricePatterns = [
            // 数据属性
            /data-original-price=['"]([^'"]+)['"]/i,
            /data-market-price=['"]([^'"]+)['"]/i,
            // JSON字符串内的原价
            /\\"originalPrice\\":\s*\\"([^"\\]+)\\"/i,
            /\"originalPrice\":\s*\"([^"]+)\"/i,
            /\"marketPrice\":\s*\"([^"]+)\"/i,
            // 原价元素内容
            /<[^>]+class="[^"]*original-price[^"]*"[^>]*>([\d\.]+)<\/[^>]+>/i,
            /<del[^>]*>([\d\.]+)<\/del>/i,
            // JavaScript变量
            /var\s+originalPrice\s*=\s*["']([^"']+)["']/i,
            /originalPrice:\s*['"]([^'"]+)['"]/i,
            /marketPrice:\s*['"]([^'"]+)['"]/i
        ];
        
        for (const pattern of originalPricePatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                productInfo.originalPrice = match[1].trim();
                console.log(`[DEBUG] 找到原价: ${productInfo.originalPrice}`);
                break;
            }
        }
        
        // 4. 提取所有可能的价格数字 (用于备用)
        // 提取所有¥符号附近的数字
        const allPriceMatches = html.match(/¥\s*([0-9]+(?:\.[0-9]+)?)/g);
        if (allPriceMatches) {
            allPriceMatches.forEach(match => {
                const price = match.replace(/¥\s*/, '');
                const numPrice = parseFloat(price);
                if (!isNaN(numPrice) && numPrice > 10) { // 过滤掉太小的数值
                    if (!productInfo.possiblePrices.includes(numPrice)) {
                        productInfo.possiblePrices.push(numPrice);
                        console.log(`[DEBUG] 找到可能的价格: ${numPrice}`);
                    }
                }
            });
        }
        
        // 提取所有class中包含price的元素中的纯数字
        const priceElementMatches = html.match(/<[^>]*class="[^"]*price[^"]*"[^>]*>([\d\.]+)<\/[^>]*>/g);
        if (priceElementMatches) {
            priceElementMatches.forEach(match => {
                const priceMatch = match.match(/>([0-9]+(?:\.[0-9]+)?)</);
                if (priceMatch && priceMatch[1]) {
                    const numPrice = parseFloat(priceMatch[1]);
                    if (!isNaN(numPrice) && numPrice > 10) {
                        if (!productInfo.possiblePrices.includes(numPrice)) {
                            productInfo.possiblePrices.push(numPrice);
                            console.log(`[DEBUG] 找到可能的价格元素: ${numPrice}`);
                        }
                    }
                }
            });
        }
        
        // 5. 提取促销信息
        const promotionPatterns = [
            /<div[^>]*class="[^"]*promotion-tag[^"]*"[^>]*>(.*?)<\/div>/ig,
            /<div[^>]*class="[^"]*promotion-item[^"]*"[^>]*>(.*?)<\/div>/ig,
            /<span[^>]*class="[^"]*activity-name[^"]*"[^>]*>(.*?)<\/span>/ig,
            /<li[^>]*class="[^"]*promotion[^"]*"[^>]*>(.*?)<\/li>/ig
        ];
        
        for (const pattern of promotionPatterns) {
            const matches = html.matchAll(pattern);
            for (const match of matches) {
                if (match[1]) {
                    const promoText = match[1].trim().replace(/<[^>]+>/g, '');
                    if (promoText && !productInfo.promotions.includes(promoText)) {
                        productInfo.promotions.push(promoText);
                        console.log(`[DEBUG] 找到促销信息: ${promoText}`);
                    }
                }
            }
        }
        
        console.log(`[DEBUG] 解析完成，提取到商品信息: ${JSON.stringify(productInfo)}`);
        return productInfo;
    } catch (e) {
        console.log(`[DEBUG] 解析页面出错: ${e.message}`);
        return {
            id: productId,
            title: `华为商品 ${productId}`,
            price: "",
            originalPrice: "",
            promotions: [],
            possiblePrices: []
        };
    }
}

// 显示产品信息
function displayProductInfo(productInfo) {
    const title = productInfo.title || `华为商品 ${productInfo.id}`;
    
    // 构建价格信息
    let priceInfo = "";
    if (productInfo.price && productInfo.price !== "") {
        priceInfo = `当前价格: ¥${productInfo.price}`;
        
        if (productInfo.originalPrice && productInfo.originalPrice !== productInfo.price && productInfo.originalPrice !== "") {
            try {
                const currentPrice = parseFloat(productInfo.price);
                const originalPrice = parseFloat(productInfo.originalPrice);
                
                if (!isNaN(currentPrice) && !isNaN(originalPrice) && originalPrice > currentPrice) {
                    const discount = originalPrice - currentPrice;
                    const discountPercent = Math.round((discount / originalPrice) * 100);
                    priceInfo += `\n原价: ¥${productInfo.originalPrice} (降价¥${discount.toFixed(2)}, 降幅${discountPercent}%)`;
                } else if (!isNaN(currentPrice) && !isNaN(originalPrice)) {
                    priceInfo += `\n参考价: ¥${productInfo.originalPrice}`;
                }
            } catch (e) {
                priceInfo += `\n参考价: ¥${productInfo.originalPrice}`;
            }
        }
        
        // 如果有多个可能的价格，显示最高3个
        if ((productInfo.price === "" || productInfo.originalPrice === "") && productInfo.possiblePrices.length > 0) {
            const topPrices = productInfo.possiblePrices.slice(0, 3).map(p => `¥${p}`).join(', ');
            priceInfo += `\n可能的其他价格点: ${topPrices}`;
        }
    } else if (productInfo.possiblePrices.length > 0) {
        // 使用可能的价格
        productInfo.possiblePrices.sort((a, b) => b - a); // 从高到低排序
        const highestPrice = productInfo.possiblePrices[0];
        let secondPrice = productInfo.possiblePrices.length > 1 ? productInfo.possiblePrices[1] : null;
        
        // 如果两个价格相差不大，可能是舍入导致的重复，取第三个
        if (secondPrice && (highestPrice - secondPrice) < 1) {
            secondPrice = productInfo.possiblePrices.length > 2 ? productInfo.possiblePrices[2] : null;
        }
        
        if (secondPrice) {
            const discount = highestPrice - secondPrice;
            const discountPercent = Math.round((discount / highestPrice) * 100);
            priceInfo = `推测价格: ¥${secondPrice}\n参考价: ¥${highestPrice} (差价¥${discount.toFixed(2)}, 约${discountPercent}%)`;
        } else {
            priceInfo = `推测价格: ¥${highestPrice}`;
        }
        
        priceInfo += `\n(注: 价格为系统推测，请以商品页面实际价格为准)`;
    } else {
        priceInfo = "无法获取价格信息，请直接前往商品页面查看";
    }
    
    // 构建促销信息
    let promoInfo = "";
    if (productInfo.promotions && productInfo.promotions.length > 0) {
        // 最多显示3条促销信息
        const topPromos = productInfo.promotions.slice(0, 3);
        promoInfo = "\n\n促销活动:\n" + topPromos.join("\n");
    }
    
    // 构建比价建议
    const tips = "\n\n由于外部API无法访问，无法获取完整历史价格数据。建议使用以下方式查询历史价格:\n1. 什么值得买APP\n2. 淘宝比价插件\n3. 百度/Google搜索商品型号+价格";
    
    // 使用华为商品完整名称查询
    const searchTips = `\n\n快捷搜索:\n百度搜索 "${title} 历史价格"`;
    
    // 结合所有信息发送通知
    $.msg(title, priceInfo, promoInfo + tips + searchTips);
}

// Env函数
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;"POST"===e&&(s=this.post);const i=new Promise(((e,i)=>{s.call(this,t,((t,s,o)=>{t?i(t):e(s)}))}));return t.timeout?((t,e=1e3)=>Promise.race([t,new Promise(((t,s)=>{setTimeout((()=>{s(new Error("请求超时"))}),e)}))]))(i,t.timeout):i}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.logLevels={debug:0,info:1,warn:2,error:3},this.logLevelPrefixs={debug:"[DEBUG] ",info:"[INFO] ",warn:"[WARN] ",error:"[ERROR] "},this.logLevel="info",this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null,...s){try{return JSON.stringify(t,...s)}catch{return e}}getjson(t,e){let s=e;if(this.getdata(t))try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise((e=>{this.get({url:t},((t,s,i)=>e(i)))}))}runScript(t,e){return new Promise((s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let o=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");o=o?1*o:20,o=e&&e.timeout?e.timeout:o;const[r,a]=i.split("@"),n={url:`http://${a}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:o},headers:{"X-Key":r,Accept:"*/*"},policy:"DIRECT",timeout:o};this.post(n,((t,e,i)=>s(i)))})).catch((t=>this.logErr(t)))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),o=JSON.stringify(this.data);s?this.fs.writeFileSync(t,o):i?this.fs.writeFileSync(e,o):this.fs.writeFileSync(t,o)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let o=t;for(const t of i)if(o=Object(o)[t],void 0===o)return s;return o}lodash_set(t,e,s){return Object(t)!==t||(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce(((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{}),t)[e[e.length-1]]=s),t}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),o=s?this.getval(s):"";if(o)try{const t=JSON.parse(o);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,o]=/^@(.*?)\.(.*?)$/.exec(e),r=this.getval(i),a=i?"null"===r?null:r||"{}":"{}";try{const e=JSON.parse(a);this.lodash_set(e,o,t),s=this.setval(JSON.stringify(e),i)}catch(e){const r={};this.lodash_set(r,o,t),s=this.setval(JSON.stringify(r),i)}}else s=this.setval(t,e);return s}getval(t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.read(t);case"Quantumult X":return $prefs.valueForKey(t);case"Node.js":return this.data=this.loaddata(),this.data[t];default:return this.data&&this.data[t]||null}}setval(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.write(t,e);case"Quantumult X":return $prefs.setValueForKey(t,e);case"Node.js":return this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0;default:return this.data&&this.data[e]||null}}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.cookie&&void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar)))}get(t,e=(()=>{})){switch(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"],delete t.headers["content-type"],delete t.headers["content-length"]),t.params&&(t.url+="?"+this.queryStr(t.params)),void 0===t.followRedirect||t.followRedirect||((this.isSurge()||this.isLoon())&&(t["auto-redirect"]=!1),this.isQuanX()&&(t.opts?t.opts.redirection=!1:t.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,((t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)}));break;case"Quantumult X":this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then((t=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=t;e(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(t=>e(t&&t.error||"UndefinedError")));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",((t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}})).then((t=>{const{statusCode:i,statusCode:o,headers:r,rawBody:a}=t,n=s.decode(a,this.encoding);e(null,{status:i,statusCode:o,headers:r,rawBody:a,body:n},n)}),(t=>{const{message:i,response:o}=t;e(i,o,o&&s.decode(o.rawBody,this.encoding))}));break}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";switch(t.body&&t.headers&&!t.headers["Content-Type"]&&!t.headers["content-type"]&&(t.headers["content-type"]="application/x-www-form-urlencoded"),t.headers&&(delete t.headers["Content-Length"],delete t.headers["content-length"]),void 0===t.followRedirect||t.followRedirect||((this.isSurge()||this.isLoon())&&(t["auto-redirect"]=!1),this.isQuanX()&&(t.opts?t.opts.redirection=!1:t.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,((t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)}));break;case"Quantumult X":t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then((t=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=t;e(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(t=>e(t&&t.error||"UndefinedError")));break;case"Node.js":let i=require("iconv-lite");this.initGotEnv(t);const{url:o,...r}=t;this.got[s](o,r).then((t=>{const{statusCode:s,statusCode:o,headers:r,rawBody:a}=t,n=i.decode(a,this.encoding);e(null,{status:s,statusCode:o,headers:r,rawBody:a,body:n},n)}),(t=>{const{message:s,response:o}=t;e(s,o,o&&i.decode(o.rawBody,this.encoding))}));break}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}queryStr(t){let e="";for(const s in t){let i=t[s];null!=i&&""!==i&&("object"==typeof i&&(i=JSON.stringify(i)),e+=`${s}=${i}&`)}return e=e.substring(0,e.length-1),e}msg(e=t,s="",i="",o={}){const r=t=>{const{$open:e,$copy:s,$media:i,$mediaMime:o}=t;switch(typeof t){case void 0:return t;case"string":switch(this.getEnv()){case"Surge":case"Stash":default:return{url:t};case"Loon":case"Shadowrocket":return t;case"Quantumult X":return{"open-url":t};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":default:{const r={};let a=t.openUrl||t.url||t["open-url"]||e;a&&Object.assign(r,{action:"open-url",url:a});let n=t["update-pasteboard"]||t.updatePasteboard||s;if(n&&Object.assign(r,{action:"clipboard",text:n}),i){let t,e,s;if(i.startsWith("http"))t=i;else if(i.startsWith("data:")){const[t]=i.split(";"),[,o]=i.split(",");e=o,s=t.replace("data:","")}else{e=i,s=(t=>{const e={JVBERi0:"application/pdf",R0lGODdh:"image/gif",R0lGODlh:"image/gif",iVBORw0KGgo:"image/png","/9j/":"image/jpg"};for(var s in e)if(0===t.indexOf(s))return e[s];return null})(i)}Object.assign(r,{"media-url":t,"media-base64":e,"media-base64-mime":o??s})}return Object.assign(r,{"auto-dismiss":t["auto-dismiss"],sound:t.sound}),r}case"Loon":{const s={};let o=t.openUrl||t.url||t["open-url"]||e;o&&Object.assign(s,{openUrl:o});let r=t.mediaUrl||t["media-url"];return i?.startsWith("http")&&(r=i),r&&Object.assign(s,{mediaUrl:r}),console.log(JSON.stringify(s)),s}case"Quantumult X":{const o={};let r=t["open-url"]||t.url||t.openUrl||e;r&&Object.assign(o,{"open-url":r});let a=t["media-url"]||t.mediaUrl;i?.startsWith("http")&&(a=i),a&&Object.assign(o,{"media-url":a});let n=t["update-pasteboard"]||t.updatePasteboard||s;return n&&Object.assign(o,{"update-pasteboard":n}),console.log(JSON.stringify(o)),o}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(e,s,i,r(o));break;case"Quantumult X":$notify(e,s,i,r(o));break;case"Node.js":break}if(!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}debug(...t){this.logLevels[this.logLevel]<=this.logLevels.debug&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.debug}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}info(...t){this.logLevels[this.logLevel]<=this.logLevels.info&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.info}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}warn(...t){this.logLevels[this.logLevel]<=this.logLevels.warn&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.warn}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}error(...t){this.logLevels[this.logLevel]<=this.logLevels.error&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.error}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.map((t=>t??String(t))).join(this.logSeparator))}logErr(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,e,t);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,e,void 0!==t.message?t.message:t,t.stack);break}}wait(t){return new Promise((e=>setTimeout(e,t)))}done(t={}){const e=((new Date).getTime()-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${e} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:$done(t);break;case"Node.js":process.exit(1)}}}(t,e)}