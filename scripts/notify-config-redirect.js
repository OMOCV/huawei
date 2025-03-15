/**
 * 华为商城监控 - 通知配置重定向脚本
 * 根据当前选择的通知渠道重定向到对应的配置页面
 * 用于BoxJS配置界面
 */

// 读取当前选择的通知渠道
function getCurrentNotifyChannel() {
  // 尝试多种可能的键名
  const notifyChannel = $persistentStore.read("vmall.notifyChannel") || 
                        $persistentStore.read("notifyChannel");
  
  // 如果未找到配置，默认使用PushDeer
  return notifyChannel || "pushDeer";
}

function run() {
  try {
    // 获取当前选择的通知渠道
    const notifyChannel = getCurrentNotifyChannel();
    console.log(`当前选择的通知渠道: ${notifyChannel}`);
    
    // 根据通知渠道构建跳转URL
    const configUrl = `http://boxjs.com/#/app/vmall.notification.${notifyChannel}`;
    console.log(`准备跳转到: ${configUrl}`);
    
    // 显示通知并跳转
    $notification.post(
      "通知配置",
      `正在打开 ${getChannelName(notifyChannel)} 配置页面`,
      "配置完成后请返回主页面"
    );
    
    // 执行跳转
    $done({
      title: "正在跳转...", 
      url: configUrl
    });
  } catch (e) {
    // 错误处理
    console.log(`重定向出错: ${e.message}`);
    $notification.post(
      "配置跳转失败",
      "无法打开配置页面",
      `错误信息: ${e.message}`
    );
    $done();
  }
}

// 获取通知渠道的中文名称
function getChannelName(channelKey) {
  const channelNames = {
    "pushDeer": "PushDeer",
    "bark": "Bark",
    "telegram": "Telegram",
    "serverChan": "Server酱",
    "pushPlus": "PushPlus",
    "wework": "企业微信",
    "email": "邮件"
  };
  
  return channelNames[channelKey] || channelKey;
}

// 执行主函数
run();