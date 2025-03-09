/*
# 华为商城产品状态实时监控(弹窗通知版)
# 适用于华为商城App及网页版

[rewrite_local]
http-request ^https?:\/\/(m|www)\.vmall\.com\/product\/(.*\.html|comdetail\/index\.html\?.*prdId=\d+) script-path=https://raw.githubusercontent.com/OMOCV/huawei/main/scripts/huawei-monitor-script.js, timeout=60, tag=华为商城产品状态监控

[mitm]
hostname = m.vmall.com, www.vmall.com
*/

const $ = new Env("华为商城产品状态监控");

// 指定监控的商品链接
const targetUrl = "https://www.vmall.com/product/10086996512478.html";
const productId = targetIdFromUrl(targetUrl);

console.log(`🔔华为商城产品状态监控, 开始监控商品ID: ${productId}!`);

checkProductStatus(productId);

function targetIdFromUrl(url) {
    return url.match(/[?&]prdId=(\d+)/)?.[1] || url.match(/product\/(\d+)\.html/)?.[1];
}

async function checkProductStatus(productId) {
    const apiOptions = {
        url: `https://m.vmall.com/mst/price/queryBomPrice?portalId=10016&skuIds=${productId}`,
        headers: {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
        }
    };

    $.get(apiOptions, (error, response, data) => {
        if (error) {
            $.msg('产品状态监控', '', 'API请求错误');
            $done({});
        } else {
            try {
                const jsonData = JSON.parse(data);
                const skuInfo = jsonData.skuInfos?.[0];
                if (!skuInfo) {
                    $.msg('产品状态监控', '', '未能获取产品状态数据');
                    $done({});
                }

                const status = skuInfo.status || "未知状态";
                const title = `华为商品 ${productId}`;

                $.msg(title, '商品状态更新', `当前售卖状态: ${status}`);
                $done({});
            } catch (e) {
                $.msg('产品状态监控', '', '数据解析错误');
                $done({});
            }
        }
    }
}

// Env函数，保持原脚本内容不变
function Env(name) {
    this.msg = (title, subtitle, message) => {
        $notification.post(title, subtitle, message);
    };
    this.get = (options, callback) => {
        $httpClient.get(options, callback);
    };
}
