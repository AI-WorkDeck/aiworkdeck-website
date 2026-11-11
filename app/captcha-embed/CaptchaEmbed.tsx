// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';

import { useEffect, useRef } from 'react';
import { Captcha, type CaptchaConfig, type CaptchaHandle } from '@/components/captcha/Captcha';

/**
 * 嵌入页的消息通道。形状见 doc/desktop-contract.md「/captcha-embed 嵌入契约」。
 *
 * 发往父窗口一律 `postMessage(msg, '*')`：父窗口是 `file://`，origin 是 `null`，
 * 没有别的目标 origin 可写。能这样做的前提是消息里除了 token 什么都没有——
 * token 只能配本站服务端 secret 核销、一次性、几分钟过期，被别的嵌入方拿到也换不来任何东西。
 */
const SOURCE = 'awd-captcha';

type Outgoing =
  | { type: 'ready'; provider: CaptchaConfig['provider'] }
  | { type: 'disabled' }
  | { type: 'token'; token: string }
  | { type: 'error'; code: string }
  | { type: 'size'; height: number };

function post(msg: Outgoing) {
  // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration -- Desktop file:// parent has an opaque origin; the scoped captcha protocol checks window.parent on incoming messages.
  window.parent.postMessage({ source: SOURCE, ...msg }, '*');
}

interface Props {
  /** null = 本站未启用人机验证 */
  config: CaptchaConfig | null;
  lang: 'zh' | 'en';
  theme: 'light' | 'dark';
}

export function CaptchaEmbed({ config, lang, theme }: Props) {
  const handleRef = useRef<CaptchaHandle | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // 父 → 页面：get-token / reset。只认父窗口发来的、带本契约 source 的消息——
  // 控件自己的子 iframe（Cloudflare / 阿里云）也会往这个 window 发消息，不能误吃。
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const data = e.data;
      if (!data || typeof data !== 'object' || data.source !== SOURCE) return;
      if (data.type === 'get-token') {
        const handle = handleRef.current;
        // 空串也回：父窗口据此知道「没通过 / 未就绪」，不必自己设超时猜
        if (!handle) { post({ type: 'token', token: '' }); return; }
        handle.getToken().then(token => post({ type: 'token', token }));
      } else if (data.type === 'reset') {
        handleRef.current?.reset();
      }
    };
    window.addEventListener('message', onMessage);
    // 监听挂上之后才报就绪，父窗口收到 ready 就可以发 get-token
    post(config ? { type: 'ready', provider: config.provider } : { type: 'disabled' });
    return () => window.removeEventListener('message', onMessage);
  }, [config]);

  // Turnstile 平时隐形（interaction-only），可疑时才弹出交互挑战、容器长高；
  // 父窗口据 size 调 iframe 高度，否则挑战会被裁掉。
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = -1;
    const ro = new ResizeObserver(() => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height !== last) { last = height; post({ type: 'size', height }); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!config) return null;
  return (
    <div ref={boxRef}>
      <Captcha
        config={config}
        handleRef={handleRef}
        theme={theme}
        lang={lang}
        onToken={token => post({ type: 'token', token })}
        onError={code => post({ type: 'error', code })}
      />
    </div>
  );
}
