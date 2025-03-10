// 华为商城监控结果查看脚本
// 用于查看历史监控状态和最后一次通知内容

function showLastMessage() {
  const lastMessage = $persistentStore.read("huawei_monitor_last_message");
  const lastStatus = $persistentStore.read("huawei_monitor_last_status");
  
  let responseBody = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>华为 Mate 70 Pro+ 监控结果</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 20px;
      line-height: 1.6;
      color: #333;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
    }
    .card {
      background: #fff;
      border-radius: 10px;
      padding: 15px;
      margin-bottom: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      font-size: 24px;
      margin-bottom: 20px;
      color: #007aff;
    }
    h2 {
      font-size: 20px;
      margin-top: 25px;
      margin-bottom: 15px;
      color: #333;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      background: #f8f8f8;
      padding: 15px;
      border-radius: 5px;
      font-family: monospace;
      font-size: 14px;
    }
    .timestamp {
      color: #8e8e93;
      font-size: 14px;
      margin-bottom: 10px;
    }
    .info {
      color: #34c759;
      font-weight: bold;
    }
    .error {
      color: #ff3b30;
      font-weight: bold;
    }
    .button {
      display: inline-block;
      background: #007aff;
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      text-decoration: none;
      margin-top: 10px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>华为 Mate 70 Pro+ 监控结果</h1>
    
    <div class="card">
      <h2>最近一次通知</h2>
      ${lastMessage ? `<pre>${lastMessage}</pre>` : '<p class="error">暂无通知记录</p>'}
    </div>
    
    <div class="card">
      <h2>最近一次状态</h2>
      ${lastStatus ? `<pre>${formatJsonForDisplay(lastStatus)}</pre>` : '<p class="error">暂无状态记录</p>'}
    </div>
    
    <div class="card">
      <h2>快捷操作</h2>
      <a href="https://m.vmall.com/product/comdetail/index.html?prdId=10086989076790" class="button">访问产品页面</a>
    </div>
    
    <div class="timestamp">
      页面生成时间: ${new Date().toLocaleString()}
    </div>
  </div>
</body>
</html>`;

  $done({
    response: {
      status: 200,
      headers: {
        "Content-Type": "text/html;charset=utf-8"
      },
      body: responseBody
    }
  });
}

function formatJsonForDisplay(jsonStr) {
  try {
    const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return String(jsonStr);
  }
}

// 执行主函数
showLastMessage();