'use client';

import { useEffect, useId, useRef } from 'react';

/**
 * 人机验证控件。两站两家（intl → Cloudflare Turnstile，cn → 阿里云验证码 2.0），
 * 分叉理由见 `lib/captcha-config.ts`。
 *
 * ## 用法
 * 父组件在**发验证码之前**调 `ref.current.getToken()` 拿一枚 token 塞进请求体。
 * 拿不到（用户没通过 / 控件没就绪）就不要发请求。
 *
 * ## 为什么是命令式 ref 而不是 onChange 回调
 * 两家的交互形态不同：Turnstile 是加载完就自动产出 token（隐形/勾选），
 * 阿里云是**点了按钮才弹出拼图**、拖完才回调。用 `onChange` 的话父组件要为两家写
 * 两套时序；用 `getToken()` 把差异关在这里，父组件只有一句 `await getToken()`。
 *
 * ## token 是一次性的
 * 两家都是核销即失效，所以每次 `getToken()` 前先 reset。不 reset 的话第二次点
 * 「重发验证码」会带上一枚已用过的 token，服务端拒绝，用户看到「验证失败」却不知为何。
 */

export interface CaptchaHandle {
  /** 取一枚新 token；用户未完成或控件未就绪时返回空串。 */
  getToken: () => Promise<string>;
  /** 丢掉当前 token、控件回到初始态（嵌入页的父窗口要求重来时用）。 */
  reset: () => void;
}

export type CaptchaConfig =
  | { provider: 'turnstile'; siteKey: string }
  | { provider: 'aliyun'; sceneId: string; prefix: string };

declare global {
  interface Window {
    turnstile?: any;
    initAliyunCaptcha?: (opts: any) => void;
    /**
     * 阿里云 V2 架构要求 `prefix` 与 `region` 挂在**全局配置**上，且必须在
     * 脚本加载**之前**设好——传进 `initAliyunCaptcha` 是不生效的。
     * 2026-08-18 实测：只传给 init 时 `window.AliyunCaptchaConfig` 恒为 undefined，
     * 控件起不来。文档：help.aliyun.com/zh/captcha/web-and-h5-client-v2-architecture-access
     */
    AliyunCaptchaConfig?: { region: string; prefix: string };
  }
}

/** 同一个脚本只加载一次；多处渲染控件时不该重复注入。 */
const loaded = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  const hit = loaded.get(src);
  if (hit) return hit;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    const fail = () => { clearTimeout(timer); loaded.delete(src); el.remove(); reject(new Error('Security check could not load')); };
    const timer = setTimeout(fail, 15_000);
    el.onload = () => { clearTimeout(timer); resolve(); };
    el.onerror = fail;
    document.head.appendChild(el);
  });
  loaded.set(src, p);
  return p;
}

interface CaptchaProps {
  config: CaptchaConfig;
  /** 父组件用它调 getToken() */
  handleRef: React.MutableRefObject<CaptchaHandle | null>;
  /** 以下均可选，站内表单不传、行为不变；`/captcha-embed` 用它们把状态转给桌面端父窗口。 */
  theme?: 'light' | 'dark';
  /** 控件语言；不传时 Turnstile 跟随浏览器、阿里云用中文（与从前一致）。 */
  lang?: 'zh' | 'en';
  /** 控件自己产出 token 时回调（Turnstile 加载完自动产出；阿里云拖完拼图）。 */
  onToken?: (token: string) => void;
  /** 控件报错（Turnstile 的错误码如 110200；阿里云/脚本加载失败给描述串）。 */
  onError?: (code: string) => void;
}

export function Captcha({ config, handleRef, theme, lang, onToken, onError }: CaptchaProps) {
  const holderId = useId().replace(/:/g, '_');
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  /** 阿里云是「拖完才回调」，所以要把 resolve 存下来等它 */
  const pendingRef = useRef<((token: string) => void) | null>(null);
  // 回调放进 ref：父组件每次渲染都给新函数，放进 effect 依赖会让控件反复重建
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;

    if (config.provider === 'turnstile') {
      loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
        .then(() => {
          if (cancelled || !boxRef.current || !window.turnstile) return;
          widgetRef.current = window.turnstile.render(boxRef.current, {
            sitekey: config.siteKey,
            // 隐形/托管模式下多数用户看不到挑战，可疑时才弹
            appearance: 'interaction-only',
            ...(theme ? { theme } : {}),
            ...(lang ? { language: lang === 'zh' ? 'zh-cn' : 'en' } : {}),
            callback: (token: string) => onTokenRef.current?.(token),
            'error-callback': (code: string | number) => { onErrorRef.current?.(String(code)); },
          });
        })
        .catch(e => {
          console.warn('[captcha] Turnstile script load failed:', e);
          onErrorRef.current?.('script-load-failed');
        });
    } else {
      // 必须在 loadScript 之前：脚本读的是加载那一刻的全局配置
      window.AliyunCaptchaConfig = { region: 'cn', prefix: config.prefix };
      loadScript('https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js')
        .then(() => {
          if (cancelled || !window.initAliyunCaptcha) return;
          window.initAliyunCaptcha({
            SceneId: config.sceneId,
            mode: 'popup',
            element: `#${holderId}`,
            // 这个按钮由本组件渲染；SDK 要一个选择器来挂点击事件
            button: `#${holderId}-trigger`,
            captchaVerifyCallback: async (captchaVerifyParam: string) => {
              pendingRef.current?.(captchaVerifyParam);
              pendingRef.current = null;
              onTokenRef.current?.(captchaVerifyParam);
              // 告诉 SDK「业务侧成功了」，好让弹窗关掉。**这里返回 true 不等于放行**——
              // 真正的校验在我们服务端拿这个 param 再向阿里云核一次。
              return { captchaResult: true, bizResult: true };
            },
            // V2 要求必填，即使我们不在这里做业务处理
            onBizResultCallback: () => { /* 业务结果由父组件的请求流程处理 */ },
            getInstance: (instance: any) => { widgetRef.current = instance; },
            slideStyle: { width: 320, height: 40 },
            language: lang === 'en' ? 'en' : 'cn',
            onError: (e: unknown) => {
              console.warn('[captcha] Aliyun captcha init failed:', e);
              const code = (e as { code?: unknown } | null)?.code;
              onErrorRef.current?.(code != null ? String(code) : typeof e === 'string' ? e : 'init-failed');
            },
          });
        })
        .catch(e => {
          console.warn('[captcha] Aliyun script load failed:', e);
          onErrorRef.current?.('script-load-failed');
        });
    }

    return () => { cancelled = true; };
  }, [config, holderId, theme, lang]);

  handleRef.current = {
    getToken: () => new Promise<string>(resolve => {
      if (config.provider === 'turnstile') {
        const t = window.turnstile;
        if (!t || widgetRef.current == null) return resolve('');
        // 一次性：先 reset 再取，否则重发时会带上已核销的那枚
        try { t.reset(widgetRef.current); } catch { /* 未就绪时忽略 */ }
        t.execute?.(widgetRef.current);
        // 轮询等 token（Turnstile 的 getResponse 在挑战完成前返回空）
        const started = Date.now();
        const tick = () => {
          const token = t.getResponse?.(widgetRef.current) || '';
          if (token) return resolve(token);
          if (Date.now() - started > 60_000) return resolve('');
          setTimeout(tick, 200);
        };
        tick();
      } else {
        if (!widgetRef.current) return resolve('');
        // 阿里云：点按钮 → 弹拼图 → 拖完回调。这里把 resolve 挂起等回调。
        // **取之前先 refresh**：校验参数是一次性的，不刷新的话第二次拿到的还是
        // 上一枚已核销的，服务端判重复提交（2026-08-18 真机：第一次成功、之后每次都失败）。
        try { widgetRef.current?.refresh?.(); } catch { /* 未就绪时忽略 */ }
        pendingRef.current = resolve;
        document.getElementById(`${holderId}-trigger`)?.click();
        setTimeout(() => {
          if (pendingRef.current === resolve) { pendingRef.current = null; resolve(''); }
        }, 120_000);
      }
    }),
    reset: () => {
      try {
        if (config.provider === 'turnstile') {
          if (widgetRef.current != null) window.turnstile?.reset(widgetRef.current);
        } else {
          widgetRef.current?.refresh?.();
        }
      } catch { /* 未就绪时忽略 */ }
    },
  };

  return (
    /*
      单个包裹元素，且阿里云那侧**脱离文档流**。
      两条理由都来自 2026-08-30 的线上实测：阿里云验证码 2.0 的拼图是挂在 body 上的
      浮层，内联挂载点恒为 0×0；但它在 `flex gap-5` 的表单里仍算两个 flex 子项，
      白吃掉 40px 间距——登录弹窗两个页签 52px 的高度差里，40px 就是这个幽灵间距。
      Turnstile 不同，它是内联可见控件（勾选框），必须留在文档流里正常占位。
    */
    <div className={config.provider === 'aliyun' ? 'absolute' : undefined}>
      <div ref={boxRef} id={holderId} />
      {/* 阿里云 SDK 要一个它能挂点击事件的元素；Turnstile 不需要，但留着无害 */}
      <button id={`${holderId}-trigger`} type="button" className="hidden" aria-hidden="true" />
    </div>
  );
}
