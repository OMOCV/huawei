/*
# 2025-03-10
# 华为商品状态监控(弹窗通知版)
# 适用于Surge/Loon/QuantumultX等
# 脚本功能：监控华为商城商品(如Mate系列)的预约/开售状态

[rewrite_local]
^https:\/\/m\.vmall\.com\/product\/comdetail\/index\.html\?prdId=\d+ url script-response-body https://raw.githubusercontent.com/OMOCV/huawei/main/scripts/huawei-monitor-script.js

[mitm]
hostname = m.vmall.com

******************************************
* 修复说明: 解决脚本执行超时问题
* 优化点:
* 1. 简化请求处理
* 2. 优化异步操作
* 3. 添加超时处理
* 4. 减少不必要的运算
******************************************
*/

const consolelog = true; // 启用日志
const $ = new Env("华为商品监控");
const PUSH_KEY = "PDU7190TqnwsE41kjj5WQ93SqC696nYrNQx1LagV"; // PushDeer Key，可替换为您自己的
const STATUS_CACHE_KEY = "huawei_monitor_status";
const ENABLE_WORKFLOW_LOG = true; // 启用工作流程日志
const LOG_PREFIX = "🔄华为监控"; // 日志前缀

// 提取商品ID
const url = $request.url;
const prdIdMatch = url.match(/prdId=(\d+)/);
const productId = prdIdMatch ? prdIdMatch[1] : "10086989076790"; // 默认ID
const apiUrl = `https://m.vmall.com/product/comdetail/getSkuInfo.json?prdId=${productId}`;

// 发送工作流日志
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

// 主函数 - 备用方案增强版
async function checkProductStatus() {
    // 脚本启动通知
    await sendWorkflowLog('0', `脚本启动，检查商品ID: ${productId}`);
    
    // 设置超时处理，最多30秒
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            sendWorkflowLog('超时', '脚本执行超过30秒，强制终止', true);
            reject(new Error("操作超时"));
        }, 30000);
    });
    
    // 主要处理逻辑
    const processPromise = new Promise(async (resolve) => {
        try {
            // 步骤1: 获取上次状态
            await sendWorkflowLog('1', '正在读取上次保存的状态...');
            const lastStatus = getLastStatus();
            if (lastStatus) {
                await sendWorkflowLog('1.1', `成功读取上次状态，时间: ${lastStatus.timestamp || '未知'}`);
            } else {
                await sendWorkflowLog('1.2', '未找到上次状态记录，这可能是首次运行');
            }
            
            // 步骤2: 获取当前API状态
            await sendWorkflowLog('2', '正在从API获取当前商品状态...');
            const currentStatus = await fetchApiStatus();
            
            if (!currentStatus) {
                await sendWorkflowLog('2.1', '获取API状态失败，将尝试备用方案', true);
                
                // 尝试从商品详情页直接获取信息
                await sendWorkflowLog('2.2', '当前版本没有实现备用方案，执行结束', true);
                
                // 现在我们添加实现备用方案 - 直接请求商品页面
                const pageStatus = await fetchProductPage();
                if (pageStatus) {
                    await compareAndNotify(pageStatus, lastStatus);
                } else {
                    await sendWorkflowLog('页面备用', '无法从页面获取商品信息，所有方案都失败', true);
                }
                
                resolve();
                return;
            }
            
            await sendWorkflowLog('2.3', `成功获取商品状态: ${currentStatus.product_name}, 按钮: ${currentStatus.button_mode}, 库存: ${currentStatus.stock_status}`);
            
            // 进行状态比较和通知
            await compareAndNotify(currentStatus, lastStatus);
            
            // 处理完成
            await sendWorkflowLog('完成', '脚本执行完毕，无错误');
            resolve();
        } catch (error) {
            const errorMsg = `处理出错: ${error}`;
            consolelog && console.log(errorMsg);
            await sendWorkflowLog('错误', errorMsg, true);
            resolve(); // 即使出错也完成，避免阻塞
        }
    });
    
    // 用 Promise.race 竞争模式处理可能的超时情况
    Promise.race([processPromise, timeoutPromise])
        .catch(async error => {
            const errorMsg = `超时或出错: ${error}`;
            consolelog && console.log(errorMsg);
            await sendWorkflowLog('致命错误', errorMsg, true);
        })
        .finally(() => {
            // 尝试发送最终完成通知
            sendWorkflowLog('退出', '脚本退出').then(() => {
                setTimeout(() => $done({}), 1000); // 确保最后的日志有机会发送
            });
        });
}

// 从产品页面获取信息的备用方案
async function fetchProductPage() {
    await sendWorkflowLog('P1', `使用备用方案：直接抓取商品页面`);
    
    const productUrl = `https://m.vmall.com/product/${productId}.html`;
    
    try {
        // 使用GET请求获取商品页面
        const headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Connection": "keep-alive"
        };
        
        return new Promise((resolve) => {
            const options = {
                url: productUrl,
                headers: headers,
                timeout: 10000 // 给页面加载更多时间
            };
            
            await sendWorkflowLog('P2', `请求商品页面: ${productUrl}`);
            
            $.get(options, async (error, response, data) => {
                if (error) {
                    await sendWorkflowLog('P3', `页面请求出错: ${error}`, true);
                    resolve(null);
                    return;
                }
                
                if (!data || response.status !== 200) {
                    await sendWorkflowLog('P4', `页面响应无效: ${response?.status || '未知状态码'}`, true);
                    resolve(null);
                    return;
                }
                
                await sendWorkflowLog('P5', `成功获取页面，内容长度: ${data.length}`);
                
                // 从HTML提取信息
                const productInfo = await extractFromHtml(data);
                if (productInfo) {
                    await sendWorkflowLog('P6', `成功从页面提取商品信息: ${productInfo.product_name}`);
                    resolve(productInfo);
                } else {
                    await sendWorkflowLog('P7', `无法从页面提取有效信息`, true);
                    resolve(null);
                }
            });
        });
    } catch (e) {
        await sendWorkflowLog('P8', `页面备用方案失败: ${e}`, true);
        return null;
    }
}

// 比较状态并发送通知
async function compareAndNotify(currentStatus, lastStatus) {
    // 步骤3: 状态比较
    await sendWorkflowLog('3', '正在比较状态变化...');
    const [statusChanged, changeDetails] = await checkStatusChanges(currentStatus, lastStatus);
    
    if (statusChanged || !lastStatus) {
        await sendWorkflowLog('3.1', `检测到状态变化: ${changeDetails.join(', ') || '首次运行'}`);
        
        // 步骤4: 保存新状态
        await sendWorkflowLog('4', '正在保存新状态...');
        saveCurrentStatus(currentStatus);
        await sendWorkflowLog('4.1', '新状态已保存');
        
        // 步骤5: 发送状态变化通知
        await sendWorkflowLog('5', '正在发送状态变化通知...');
        
        // 简化消息生成
        const title = `${currentStatus.product_name || "华为商品"}状态更新`;
        const subtitle = changeDetails.length > 0 ? changeDetails[0] : "状态已更新";
        const message = await formatNotificationMessage(currentStatus, changeDetails);
        
        $.msg(title, subtitle, message);
        await sendWorkflowLog('5.1', '状态变化通知已发送');
    } else {
        await sendWorkflowLog('3.2', '商品状态未发生变化');
    }
}

// 从API获取商品状态 - 错误处理增强版
function fetchApiStatus() {
    return new Promise(async (resolve, reject) => {
        await sendWorkflowLog('2-1', `开始API请求: ${apiUrl}`);
        
        // 设置5秒超时
        const timeout = setTimeout(async () => {
            await sendWorkflowLog('2-2', "API请求超时(5秒)", true);
            resolve(null); // 超时时返回null而不是reject，避免中断主流程
        }, 5000);
        
        // 请求头 - 增强版，添加更多模拟真实浏览器的头信息
        const headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": $request.url,
            "X-Requested-With": "XMLHttpRequest",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        };
        
        const options = {
            url: apiUrl,
            headers: headers,
            timeout: 5000,
            body: ""
        };
        
        await sendWorkflowLog('2-3', `API请求已发送，等待响应...`);
        
        $.post(options, async (error, response, data) => {
            clearTimeout(timeout);
            
            if (error) {
                await sendWorkflowLog('2-4', `API请求出错: ${error}`, true);
                resolve(null);
                return;
            }
            
            try {
                await sendWorkflowLog('2-5', `API响应状态码: ${response?.status || '未知'}, 内容类型: ${response?.headers?.["Content-Type"] || '未知'}`);
                
                // 首先检查是否返回HTML而非JSON
                if (data && data.trim().startsWith('<!DOCTYPE html>')) {
                    await sendWorkflowLog('2-6', `返回了HTML而非JSON，尝试从HTML提取信息`, true);
                    
                    // 实现提取HTML信息的备用方案
                    const productStatus = await extractFromHtml(data);
                    if (productStatus) {
                        await sendWorkflowLog('2-7', `成功从HTML提取商品信息: ${productStatus.product_name || '未知商品'}`);
                        resolve(productStatus);
                        return;
                    } else {
                        await sendWorkflowLog('2-8', `无法从HTML提取有效信息`, true);
                        resolve(null);
                        return;
                    }
                }
                
                // 正常的JSON处理
                if (!data || response.status !== 200) {
                    await sendWorkflowLog('2-9', `无效响应: ${response?.status || '未知状态码'}, 内容长度: ${data?.length || 0}`, true);
                    resolve(null);
                    return;
                }
                
                await sendWorkflowLog('2-10', `API响应数据格式正确，长度: ${data.length}`);
                
                // 数据解析
                try {
                    const apiData = JSON.parse(data);
                    await sendWorkflowLog('2-11', `成功解析JSON响应`);
                    
                    const productInfo = apiData.skuInfo || {};
                    const timestamp = $.time('MM-dd HH:mm:ss');
                    
                    // 产品信息提取
                    const productStatus = {
                        "source": "api",
                        "product_name": productInfo.prdName || '未知产品',
                        "button_mode": productInfo.buttonMode || '',
                        "stock_status": productInfo.stokStatus || '',
                        "raw_status": JSON.stringify(productInfo).substring(0, 100) + '...', // 保存部分原始数据便于调试
                        "timestamp": timestamp
                    };
                    
                    await sendWorkflowLog('2-12', `成功提取商品信息: ${productStatus.product_name}`);
                    resolve(productStatus);
                } catch (parseError) {
                    // JSON解析错误
                    await sendWorkflowLog('2-13', `JSON解析出错: ${parseError}, 数据前100字符: ${data.substring(0, 100)}`, true);
                    
                    // 尝试备用的产品API
                    await sendWorkflowLog('2-14', `尝试使用备用API...`);
                    const backupStatus = await fetchBackupApiStatus();
                    if (backupStatus) {
                        resolve(backupStatus);
                    } else {
                        resolve(null);
                    }
                }
            } catch (e) {
                await sendWorkflowLog('2-15', `处理API响应时发生异常: ${e}`, true);
                resolve(null);
            }
        });
    });
}

// 从HTML页面提取商品信息的备用方案
async function extractFromHtml(htmlContent) {
    await sendWorkflowLog('2-H1', `开始从HTML提取商品信息...`);
    
    try {
        // 提取页面标题 (通常包含产品名)
        const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1].trim() : '未知产品';
        await sendWorkflowLog('2-H2', `提取到页面标题: ${pageTitle}`);
        
        // 提取按钮状态
        let buttonMode = '';
        const buttonPatterns = [
            /<span[^>]*class="button[^"]*"[^>]*>(.*?)<\/span>/i,
            /<a[^>]*class="[^"]*button[^"]*"[^>]*>(.*?)<\/a>/i,
            /<button[^>]*>(.*?)<\/button>/i
        ];
        
        for (const pattern of buttonPatterns) {
            const buttonMatch = htmlContent.match(pattern);
            if (buttonMatch) {
                buttonMode = buttonMatch[1].trim().replace(/<[^>]*>/g, '');
                await sendWorkflowLog('2-H3', `提取到按钮文本: ${buttonMode}`);
                break;
            }
        }
        
        // 提取库存状态
        let stockStatus = '';
        const stockPatterns = [
            /状态["\s:]+(.*?)["<]/i,
            /库存["\s:]+(.*?)["<]/i,
            /有货["\s:]+(.*?)["<]/i,
            /无货/i
        ];
        
        for (const pattern of stockPatterns) {
            const stockMatch = htmlContent.match(pattern);
            if (stockMatch) {
                stockStatus = stockMatch[0].includes('无货') ? '无货' : 
                              (stockMatch[1] ? stockMatch[1].trim() : '有货');
                await sendWorkflowLog('2-H4', `提取到库存状态: ${stockStatus}`);
                break;
            }
        }
        
        // 如果无法提取详细信息，至少根据某些关键词确定大致状态
        if (!buttonMode) {
            if (htmlContent.includes('预约') || htmlContent.includes('预定')) {
                buttonMode = '预约';
            } else if (htmlContent.includes('立即购买') || htmlContent.includes('购买')) {
                buttonMode = '立即购买';
            } else if (htmlContent.includes('到货通知') || htmlContent.includes('到货提醒')) {
                buttonMode = '到货通知';
            } else {
                buttonMode = '未知状态';
            }
            await sendWorkflowLog('2-H5', `通过关键词确定按钮状态: ${buttonMode}`);
        }
        
        if (!stockStatus) {
            if (htmlContent.includes('有货') || htmlContent.includes('现货')) {
                stockStatus = '有货';
            } else if (htmlContent.includes('无货') || htmlContent.includes('售罄')) {
                stockStatus = '无货';
            } else {
                stockStatus = '未知库存';
            }
            await sendWorkflowLog('2-H6', `通过关键词确定库存状态: ${stockStatus}`);
        }
        
        return {
            "source": "html",
            "product_name": pageTitle,
            "button_mode": buttonMode,
            "stock_status": stockStatus,
            "raw_html_sample": htmlContent.substring(0, 200).replace(/\n/g, ' ') + '...',
            "timestamp": $.time('MM-dd HH:mm:ss')
        };
    } catch (error) {
        await sendWorkflowLog('2-H7', `从HTML提取信息时出错: ${error}`, true);
        return null;
    }
}

// 备用API方法
async function fetchBackupApiStatus() {
    await sendWorkflowLog('2-B1', `尝试备用API...`);
    
    // 构建备用API URL - 使用不同端点或参数
    const backupApiUrl = `https://m.vmall.com/product/comdetail/getSkuInfo.json?prdId=${productId}&t=${new Date().getTime()}`;
    
    try {
        // 备用请求头
        const headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
            "Accept": "*/*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": `https://m.vmall.com/product/${productId}.html`
        };
        
        return new Promise((resolve) => {
            const options = {
                url: backupApiUrl,
                headers: headers,
                timeout: 5000
            };
            
            // 使用GET而不是POST
            await sendWorkflowLog('2-B2', `备用API请求已发送: ${backupApiUrl}`);
            
            $.get(options, async (error, response, data) => {
                if (error) {
                    await sendWorkflowLog('2-B3', `备用API请求出错: ${error}`, true);
                    resolve(null);
                    return;
                }
                
                try {
                    if (!data || response.status !== 200) {
                        await sendWorkflowLog('2-B4', `备用API响应无效`, true);
                        resolve(null);
                        return;
                    }
                    
                    // 尝试解析JSON
                    const backupData = JSON.parse(data);
                    await sendWorkflowLog('2-B5', `备用API返回数据解析成功`);
                    
                    const productInfo = backupData.skuInfo || {};
                    
                    resolve({
                        "source": "backup_api",
                        "product_name": productInfo.prdName || '未知产品',
                        "button_mode": productInfo.buttonMode || '',
                        "stock_status": productInfo.stokStatus || '',
                        "timestamp": $.time('MM-dd HH:mm:ss')
                    });
                } catch (e) {
                    await sendWorkflowLog('2-B6', `解析备用API响应出错: ${e}`, true);
                    resolve(null);
                }
            });
        });
    } catch (e) {
        await sendWorkflowLog('2-B7', `备用API尝试失败: ${e}`, true);
        return null;
    }
}

// 检查状态变化并生成变化详情 - 工作流增强版
async function checkStatusChanges(current, last) {
    // 无上次状态或上次状态格式不对
    if (!last || typeof last !== 'object') {
        await sendWorkflowLog('3-1', `没有有效的历史状态，视为首次检查`);
        return [true, ["首次检查"]];
    }
    
    await sendWorkflowLog('3-2', `开始比较状态: 上次[${last.button_mode || '无'}, ${last.stock_status || '无'}], 当前[${current.button_mode || '无'}, ${current.stock_status || '无'}]`);
    
    // 快速对比，避免深入比较
    if (current.button_mode === last.button_mode && 
        current.stock_status === last.stock_status) {
        await sendWorkflowLog('3-3', `状态未变化: 按钮和库存状态相同`);
        return [false, []];
    }
    
    let changeDetails = [];
    
    // 只关注核心状态变化
    if (current.button_mode !== last.button_mode) {
        const detail = `按钮状态: ${last.button_mode || '无'} → ${current.button_mode || '无'}`;
        changeDetails.push(detail);
        await sendWorkflowLog('3-4', `检测到按钮状态变化: ${detail}`);
    }
    
    if (current.stock_status !== last.stock_status) {
        const detail = `库存状态: ${last.stock_status || '无'} → ${current.stock_status || '无'}`;
        changeDetails.push(detail);
        await sendWorkflowLog('3-5', `检测到库存状态变化: ${detail}`);
    }
    
    await sendWorkflowLog('3-6', `状态比较完成，发现 ${changeDetails.length} 处变化`);
    return [true, changeDetails];
}

// 格式化通知消息 - 工作流增强版
async function formatNotificationMessage(currentStatus, changeDetails) {
    await sendWorkflowLog('5-1', `正在格式化通知消息...`);
    
    // 生成详细的通知消息
    const message = 
        `### ${currentStatus.product_name || '华为商品'} 状态报告\n\n` +
        `**检测时间**: ${currentStatus.timestamp}\n\n` +
        (changeDetails.length > 0 ? 
            `**变化详情**:\n${changeDetails.map(d => `- ${d}`).join('\n')}\n\n` : 
            '') +
        `**当前按钮状态**: ${currentStatus.button_mode || '未知'}\n\n` +
        `**当前库存状态**: ${currentStatus.stock_status || '未知'}\n\n` +
        `**数据来源**: ${currentStatus.source || 'API'}\n\n` +
        `---\n` +
        `*点击通知查看详情*`;
    
    await sendWorkflowLog('5-2', `通知消息已格式化，长度: ${message.length}字符`);
    return message;
}

// 获取上次保存的状态 - 工作流增强版
function getLastStatus() {
    try {
        const savedStatus = $.getdata(STATUS_CACHE_KEY);
        if (!savedStatus) {
            consolelog && console.log("没有找到缓存的状态");
            return null;
        }
        
        consolelog && console.log(`找到缓存的状态，长度: ${savedStatus.length}`);
        
        try {
            const parsedStatus = JSON.parse(savedStatus);
            consolelog && console.log(`成功解析缓存状态: ${parsedStatus.product_name || '未知产品'}`);
            return parsedStatus;
        } catch (parseError) {
            consolelog && console.log(`解析缓存状态出错: ${parseError}`);
            // 尝试再次写入一条日志通知
            sendWorkflowLog('1-错误', `解析缓存状态失败: ${parseError}，数据可能已损坏`, true);
            return null;
        }
    } catch (e) {
        consolelog && console.log(`读取缓存状态出错: ${e}`);
        // 尝试再次写入一条日志通知
        sendWorkflowLog('1-错误', `读取缓存状态时出错: ${e}`, true);
        return null;
    }
}

// 保存当前状态 - 工作流增强版
function saveCurrentStatus(status) {
    try {
        const jsonStatus = JSON.stringify(status);
        consolelog && console.log(`准备保存状态，数据长度: ${jsonStatus.length}`);
        
        const saveResult = $.setdata(jsonStatus, STATUS_CACHE_KEY);
        if (saveResult) {
            consolelog && console.log(`状态保存成功`);
        } else {
            consolelog && console.log(`状态保存失败`);
            // 尝试写入一条日志通知
            sendWorkflowLog('4-错误', `状态保存失败，可能存储空间不足`, true);
        }
    } catch (e) {
        consolelog && console.log(`保存状态出错: ${e}`);
        // 尝试写入一条日志通知
        sendWorkflowLog('4-错误', `保存状态时出错: ${e}`, true);
    }
}

// 发送PushDeer通知 - 工作流增强版
async function sendPushDeerNotification(text, desp) {
    return new Promise((resolve, reject) => {
        if (!PUSH_KEY) {
            consolelog && console.log("未配置PushDeer Key，跳过通知");
            resolve(false);
            return;
        }
        
        const timestamp = $.time('HH:mm:ss');
        consolelog && console.log(`[${timestamp}] 发送PushDeer通知: ${text}`);
        
        const options = {
            url: "https://api2.pushdeer.com/message/push",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                pushkey: PUSH_KEY,
                text: text,
                desp: desp,
                type: "markdown" // 使用markdown格式
            })
        };
        
        $.post(options, (error, response, data) => {
            if (error) {
                consolelog && console.log(`[${$.time('HH:mm:ss')}] PushDeer通知发送失败: ${error}`);
                resolve(false);
                return;
            }
            
            try {
                const res = JSON.parse(data);
                if (res.code === 0) {
                    consolelog && console.log(`[${$.time('HH:mm:ss')}] PushDeer通知发送成功`);
                    resolve(true);
                } else {
                    consolelog && console.log(`[${$.time('HH:mm:ss')}] PushDeer通知发送失败: ${JSON.stringify(res)}`);
                    resolve(false);
                }
            } catch (e) {
                consolelog && console.log(`[${$.time('HH:mm:ss')}] 解析PushDeer响应出错: ${e}, 响应数据: ${data}`);
                resolve(false);
            }
        });
    });
}

// 开始执行
checkProductStatus();

// 环境代码，兼容不同平台
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;"POST"===e&&(s=this.post);const i=new Promise(((e,i)=>{s.call(this,t,((t,s,o)=>{t?i(t):e(s)}))}));return t.timeout?((t,e=1e3)=>Promise.race([t,new Promise(((t,s)=>{setTimeout((()=>{s(new Error("请求超时"))}),e)}))]))(i,t.timeout):i}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.logLevels={debug:0,info:1,warn:2,error:3},this.logLevelPrefixs={debug:"[DEBUG] ",info:"[INFO] ",warn:"[WARN] ",error:"[ERROR] "},this.logLevel="info",this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null,...s){try{return JSON.stringify(t,...s)}catch{return e}}getjson(t,e){let s=e;if(this.getdata(t))try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise((e=>{this.get({url:t},((t,s,i)=>e(i)))}))}runScript(t,e){return new Promise((s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let o=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");o=o?1*o:20,o=e&&e.timeout?e.timeout:o;const[r,a]=i.split("@"),n={url:`http://${a}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:o},headers:{"X-Key":r,Accept:"*/*"},policy:"DIRECT",timeout:o};this.post(n,((t,e,i)=>s(i)))})).catch((t=>this.logErr(t)))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),o=JSON.stringify(this.data);s?this.fs.writeFileSync(t,o):i?this.fs.writeFileSync(e,o):this.fs.writeFileSync(t,o)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let o=t;for(const t of i)if(o=Object(o)[t],void 0===o)return s;return o}lodash_set(t,e,s){return Object(t)!==t||(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce(((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{}),t)[e[e.length-1]]=s),t}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),o=s?this.getval(s):"";if(o)try{const t=JSON.parse(o);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,o]=/^@(.*?)\.(.*?)$/.exec(e),r=this.getval(i),a=i?"null"===r?null:r||"{}":"{}";try{const e=JSON.parse(a);this.lodash_set(e,o,t),s=this.setval(JSON.stringify(e),i)}catch(e){const r={};this.lodash_set(r,o,t),s=this.setval(JSON.stringify(r),i)}}else s=this.setval(t,e);return s}getval(t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.read(t);case"Quantumult X":return $prefs.valueForKey(t);case"Node.js":return this.data=this.loaddata(),this.data[t];default:return this.data&&this.data[t]||null}}setval(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.write(t,e);case"Quantumult X":return $prefs.setValueForKey(t,e);case"Node.js":return this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0;default:return this.data&&this.data[e]||null}}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.cookie&&void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar)))}get(t,e=(()=>{})){switch(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"],delete t.headers["content-type"],delete t.headers["content-length"]),t.params&&(t.url+="?"+this.queryStr(t.params)),void 0===t.followRedirect||t.followRedirect||((this.isSurge()||this.isLoon())&&(t["auto-redirect"]=!1),this.isQuanX()&&(t.opts?t.opts.redirection=!1:t.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,((t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)}));break;case"Quantumult X":this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then((t=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=t;e(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(t=>e(t&&t.error||"UndefinedError")));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",((t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}})).then((t=>{const{statusCode:i,statusCode:o,headers:r,rawBody:a}=t,n=s.decode(a,this.encoding);e(null,{status:i,statusCode:o,headers:r,rawBody:a,body:n},n)}),(t=>{const{message:i,response:o}=t;e(i,o,o&&s.decode(o.rawBody,this.encoding))}));break}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";switch(t.body&&t.headers&&!t.headers["Content-Type"]&&!t.headers["content-type"]&&(t.headers["content-type"]="application/x-www-form-urlencoded"),t.headers&&(delete t.headers["Content-Length"],delete t.headers["content-length"]),void 0===t.followRedirect||t.followRedirect||((this.isSurge()||this.isLoon())&&(t["auto-redirect"]=!1),this.isQuanX()&&(t.opts?t.opts.redirection=!1:t.opts={redirection:!1})),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,((t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)}));break;case"Quantumult X":t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then((t=>{const{statusCode:s,statusCode:i,headers:o,body:r,bodyBytes:a}=t;e(null,{status:s,statusCode:i,headers:o,body:r,bodyBytes:a},r,a)}),(t=>e(t&&t.error||"UndefinedError")));break;case"Node.js":let i=require("iconv-lite");this.initGotEnv(t);const{url:o,...r}=t;this.got[s](o,r).then((t=>{const{statusCode:s,statusCode:o,headers:r,rawBody:a}=t,n=i.decode(a,this.encoding);e(null,{status:s,statusCode:o,headers:r,rawBody:a,body:n},n)}),(t=>{const{message:s,response:o}=t;e(s,o,o&&i.decode(o.rawBody,this.encoding))}));break}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}queryStr(t){let e="";for(const s in t){let i=t[s];null!=i&&""!==i&&("object"==typeof i&&(i=JSON.stringify(i)),e+=`${s}=${i}&`)}return e=e.substring(0,e.length-1),e}msg(e=t,s="",i="",o={}){const r=t=>{const{$open:e,$copy:s,$media:i,$mediaMime:o}=t;switch(typeof t){case void 0:return t;case"string":switch(this.getEnv()){case"Surge":case"Stash":default:return{url:t};case"Loon":case"Shadowrocket":return t;case"Quantumult X":return{"open-url":t};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":default:{const r={};let a=t.openUrl||t.url||t["open-url"]||e;a&&Object.assign(r,{action:"open-url",url:a});let n=t["update-pasteboard"]||t.updatePasteboard||s;if(n&&Object.assign(r,{action:"clipboard",text:n}),i){let t,e,s;if(i.startsWith("http"))t=i;else if(i.startsWith("data:")){const[t]=i.split(";"),[,o]=i.split(",");e=o,s=t.replace("data:","")}else{e=i,s=(t=>{const e={JVBERi0:"application/pdf",R0lGODdh:"image/gif",R0lGODlh:"image/gif",iVBORw0KGgo:"image/png","/9j/":"image/jpg"};for(var s in e)if(0===t.indexOf(s))return e[s];return null})(i)}Object.assign(r,{"media-url":t,"media-base64":e,"media-base64-mime":o??s})}return Object.assign(r,{"auto-dismiss":t["auto-dismiss"],sound:t.sound}),r}case"Loon":{const s={};let o=t.openUrl||t.url||t["open-url"]||e;o&&Object.assign(s,{openUrl:o});let r=t.mediaUrl||t["media-url"];return i?.startsWith("http")&&(r=i),r&&Object.assign(s,{mediaUrl:r}),console.log(JSON.stringify(s)),s}case"Quantumult X":{const o={};let r=t["open-url"]||t.url||t.openUrl||e;r&&Object.assign(o,{"open-url":r});let a=t["media-url"]||t.mediaUrl;i?.startsWith("http")&&(a=i),a&&Object.assign(o,{"media-url":a});let n=t["update-pasteboard"]||t.updatePasteboard||s;return n&&Object.assign(o,{"update-pasteboard":n}),console.log(JSON.stringify(o)),o}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(e,s,i,r(o));break;case"Quantumult X":$notify(e,s,i,r(o));break;case"Node.js":break}if(!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}debug(...t){this.logLevels[this.logLevel]<=this.logLevels.debug&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.debug}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}info(...t){this.logLevels[this.logLevel]<=this.logLevels.info&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.info}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}warn(...t){this.logLevels[this.logLevel]<=this.logLevels.warn&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.warn}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}error(...t){this.logLevels[this.logLevel]<=this.logLevels.error&&(t.length>0&&(this.logs=[...this.logs,...t]),console.log(`${this.logLevelPrefixs.error}${t.map((t=>t??String(t))).join(this.logSeparator)}`))}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.map((t=>t??String(t))).join(this.logSeparator))}logErr(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,e,t);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,e,void 0!==t.message?t.message:t,t.stack);break}}wait(t){return new Promise((e=>setTimeout(e,t)))}done(t={}){const e=((new Date).getTime()-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${e} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:$done(t);break;case"Node.js":process.exit(1)}}}(t,e)}