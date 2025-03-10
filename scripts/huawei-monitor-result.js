// 在 Surge 脚本编辑器中手动运行此脚本查看监控结果

// 读取存储的数据
const lastStatus = $persistentStore.read("huawei_monitor_last_status");
const lastMessage = $persistentStore.read("huawei_monitor_last_message");

// 格式化显示内容
let output = "===== 华为 Mate 70 Pro+ 监控状态 =====\n\n";

if (lastStatus) {
  try {
    const status = JSON.parse(lastStatus);
    output += `商品标题: ${status.title || "未知"}\n`;
    output += `按钮状态: ${status.button_status || "未知"}\n`;
    output += `库存状态: ${status.stock_status || "未知"}\n`;
    output += `最后检查: ${status.timestamp || "未知"}\n\n`;
  } catch (e) {
    output += "状态数据解析失败\n";
    output += `原始数据: ${lastStatus}\n\n`;
  }
} else {
  output += "暂无监控状态数据\n\n";
}

output += "===== 最近一次通知内容 =====\n\n";
if (lastMessage) {
  output += lastMessage + "\n\n";
} else {
  output += "暂无通知记录\n\n";
}

output += "===== 产品链接 =====\n";
output += "https://m.vmall.com/product/comdetail/index.html?prdId=10086989076790";

// 输出结果
console.log(output);

// 同时发送通知显示结果
$notification.post(
  "华为 Mate 70 Pro+ 监控状态", 
  "", 
  "查看日志获取完整信息"
);

$done();