import { formatSiteAmount } from './site-config';

/**
 * 价格显示格式化。放在 lib 而非组件文件里：服务端组件（plugins/skills 详情页）
 * 与客户端组件（BuyButton）都要用——从 'use client' 模块导入函数到服务端组件
 * 只能拿到 client reference，一调用就是整页 500。
 */

/**
 * 价格格式化的唯一出口。`cents` 是**本站币种**的最小单位
 * （国内站人民币分，国际站美元 cent），符号由 siteConfig 决定。
 */
export function formatPrice(cents: number): string {
  return formatSiteAmount(cents);
}

// formatPriceYuan 已全部迁到 formatPrice 并删除。
// 不留 @deprecated 别名：双站下「写死人民币符号」的函数只要还在，
// 下一个人就会顺手 import 它，而错误的表现是国际站把 $9.90 显示成 ¥9.90——
// 页面不报错、类型也不报错，只有用户看得见。
