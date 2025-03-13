// 提取页面信息 - 完整版，包含完整价格提取
function extractPageInfo(html) {
    // 默认值
    let buttonName = "";
    let buttonText = "";
    let productName = "未知商品";
    let currentPrice = 0;      // 当前价格(优惠价/实际售价)
    let originalPrice = 0;     // 原价/标价
    
    try {
        // 尝试提取商品名称
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (titleMatch && titleMatch[1]) {
            productName = titleMatch[1].replace(/[\_\-\|].*$/, "").trim();
        }
        
        // 尝试提取价格信息 - 从HTML中搜索价格相关信息
        // 查找价格信息的各种可能模式
        const patterns = [
            // 新增模式: promoPrice促销价模式（根据用户反馈添加）
            {
                currentRegex: /["']promoPrice["']\s*:\s*['"]*(\d+(\.\d+)?)['"]*\s*/,
                originalRegex: /["']originPrice["']\s*:\s*['"]*(\d+(\.\d+)?)['"]*\s*/
            },
            // 模式1: 常见的price和originPrice模式
            {
                currentRegex: /["']price["']\s*:\s*(\d+(\.\d+)?)/,
                originalRegex: /["']originPrice["']\s*:\s*(\d+(\.\d+)?)/
            },
            // 模式2: salePrice和标准price模式
            {
                currentRegex: /["']salePrice["']\s*:\s*(\d+(\.\d+)?)/,
                originalRegex: /["']price["']\s*:\s*(\d+(\.\d+)?)/
            },
            // 模式3: discountPrice和normalPrice模式
            {
                currentRegex: /["']discountPrice["']\s*:\s*(\d+(\.\d+)?)/,
                originalRegex: /["']normalPrice["']\s*:\s*(\d+(\.\d+)?)/
            },
            // 改进模式4: 数字模式(¥后面跟数字)，更精确地捕获价格
            {
                currentRegex: /(?:¥|价格|售价|优惠价)\s*(\d+(\.\d+)?)/,
                originalRegex: /(?:原价|标价)\D*(\d+(\.\d+)?)/
            }
        ];
        
        // 尝试所有模式
        for (const pattern of patterns) {
            const currentMatch = html.match(pattern.currentRegex);
            const originalMatch = html.match(pattern.originalRegex);
            
            if (currentMatch && currentMatch[1]) {
                currentPrice = parseFloat(currentMatch[1]);
                console.log(`找到当前价格: ${currentPrice}, 通过模式: ${pattern.currentRegex}`);
            }
            
            if (originalMatch && originalMatch[1]) {
                originalPrice = parseFloat(originalMatch[1]);
                console.log(`找到原价: ${originalPrice}, 通过模式: ${pattern.originalRegex}`);
            }
            
            // 如果两者都找到了，跳出循环
            if (currentPrice > 0 && originalPrice > 0) {
                break;
            }
        }
        
        // 处理特殊情况 - 如果只找到原价，将其设为当前价格
        if (originalPrice > 0 && currentPrice === 0) {
            currentPrice = originalPrice;
        }
        
        // 处理特殊情况 - 如果只找到当前价格，暂时将其设为原价(后面会处理)
        if (currentPrice > 0 && originalPrice === 0) {
            originalPrice = currentPrice; // 暂时设置，实际可能没有折扣
        }
        
        // 方法1: 尝试从NEXT_DATA脚本中提取JSON数据
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
        if (nextDataMatch && nextDataMatch[1]) {
            try {
                const jsonData = JSON.parse(nextDataMatch[1]);
                const mainData = jsonData.props?.pageProps?.mainData;
                if (mainData && mainData.current && mainData.current.base) {
                    // 尝试获取第一个产品对象
                    const products = Object.values(mainData.current.base);
                    if (products && products.length > 0) {
                        const product = products[0];
                        if (product.buttonInfo && product.buttonInfo.buttonName) {
                            buttonName = product.buttonInfo.buttonName;
                        }
                        if (product.buttonText) {
                            buttonText = product.buttonText;
                        }
                        if (product.name) {
                            productName = product.name;
                        } else if (product.sbomName) {
                            productName = product.sbomName;
                        }
                        
                        // 提取价格信息 - 增强版，优先尝试提取promoPrice
                        console.log("从JSON数据中提取价格信息:");
                        
                        // 调试: 输出所有可能与价格相关的字段
                        const priceFields = ['price', 'originPrice', 'promoPrice', 'discountPrice', 'salePrice', 'normalPrice'];
                        priceFields.forEach(field => {
                            if (product[field]) {
                                console.log(`找到价格字段 ${field}: ${product[field]}`);
                            }
                        });
                        
                        // 优惠价/当前价格的尝试顺序
                        if (product.promoPrice) {
                            // 优惠价/促销价
                            currentPrice = parseFloat(product.promoPrice);
                            console.log(`从JSON数据中获取到优惠价: ${currentPrice}`);
                        } else if (product.price) {
                            // 常规售价
                            currentPrice = parseFloat(product.price);
                            console.log(`从JSON数据中获取到售价: ${currentPrice}`);
                        } else if (product.discountPrice) {
                            // 折扣价
                            currentPrice = parseFloat(product.discountPrice);
                        } else if (product.salePrice) {
                            // 销售价
                            currentPrice = parseFloat(product.salePrice);
                        }
                        
                        // 原价/标准价格的尝试顺序
                        if (product.originPrice) {
                            // 原价
                            originalPrice = parseFloat(product.originPrice);
                            console.log(`从JSON数据中获取到原价: ${originalPrice}`);
                        } else if (product.normalPrice) {
                            // 标准价格作为原价
                            originalPrice = parseFloat(product.normalPrice);
                        } else if (product.price && currentPrice > 0 && product.price != currentPrice) {
                            // 如果有售价且与当前价格不同，则用售价作为原价
                            originalPrice = parseFloat(product.price);
                        }
                    }
                }
            } catch (e) {
                console.log("解析JSON失败: " + e);
            }
        }
        
        // 尝试直接搜索价格信息块
        if (currentPrice === 0 || originalPrice === 0) {
            console.log("尝试直接搜索价格信息块");
            
            // 搜索可能包含价格信息的块
            const priceBlockMatch = html.match(/(?:"price"|"promoPrice"|"originPrice").{1,200}?\d+\.\d+/g);
            if (priceBlockMatch) {
                console.log(`找到${priceBlockMatch.length}个可能包含价格信息的块`);
                
                for (const block of priceBlockMatch) {
                    // 尝试提取促销价
                    const promoMatch = block.match(/["']promoPrice["']\s*:\s*['"]*(\d+(\.\d+)?)['"]*\s*/);
                    if (promoMatch && promoMatch[1] && currentPrice === 0) {
                        currentPrice = parseFloat(promoMatch[1]);
                        console.log(`从块中提取到促销价: ${currentPrice}`);
                    }
                    
                    // 尝试提取原价
                    const origMatch = block.match(/["']originPrice["']\s*:\s*['"]*(\d+(\.\d+)?)['"]*\s*/);
                    if (origMatch && origMatch[1] && originalPrice === 0) {
                        originalPrice = parseFloat(origMatch[1]);
                        console.log(`从块中提取到原价: ${originalPrice}`);
                    }
                }
            }
        }
        
        // 如果上面的方法失败，尝试正则表达式直接匹配按钮信息
        if (!buttonName && !buttonText) {
            const buttonNameMatch = html.match(/"buttonName"[\s]*:[\s]*"([^"]+)"/);
            const buttonTextMatch = html.match(/"buttonText"[\s]*:[\s]*"([^"]+)"/);
            
            if (buttonNameMatch && buttonNameMatch[1]) {
                buttonName = buttonNameMatch[1];
            }
            
            if (buttonTextMatch && buttonTextMatch[1]) {
                buttonText = buttonTextMatch[1];
            }
        }
        
        // 如果仍然无法获取，检查页面中是否存在一些常见状态
        if (!buttonName && !buttonText) {
            if (html.includes("加入购物车")) {
                buttonText = "加入购物车";
                buttonName = "add_to_cart";
            } else if (html.includes("立即购买")) {
                buttonText = "立即购买";
                buttonName = "buy_now";
            } else if (html.includes("已售罄") || html.includes("售罄")) {
                buttonText = "已售罄";
                buttonName = "soldout";
            } else if (html.includes("预约申购已结束")) {
                buttonText = "预约申购已结束";
                buttonName = "appointment_ended";
            } else if (html.includes("立即预约") || html.includes("预约")) {
                buttonText = "立即预约";
                buttonName = "appointment";
            } else if (html.includes("即将上市")) {
                buttonText = "即将上市";
                buttonName = "coming_soon";
            }
        }
    } catch (error) {
        console.log("提取页面信息失败: " + error);
    }
    
    // 确定价格是否有优惠
    // 如果原价和当前价格一样，则认为没有优惠
    const hasDiscount = originalPrice > currentPrice && currentPrice > 0;
    
    return {
        buttonName: buttonName || "未知",
        buttonText: buttonText || "未知状态",
        productName: productName,
        currentPrice: currentPrice,
        originalPrice: hasDiscount ? originalPrice : currentPrice, // 如果没有优惠，原价等于当前价格
        hasDiscount: hasDiscount
    };
}