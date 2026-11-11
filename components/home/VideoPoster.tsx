'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Loader2, Play, RotateCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface VideoPosterCopy {
    closeLabel: string;
    /** 缓冲中的提示，如「正在加载视频…」 */
    loading: string;
    /** 加载失败的说明 */
    error: string;
    retry: string;
}

interface VideoPosterProps {
    /** /api/video?id=… —— 点播放时才请求，服务端现签 CDN 链接 */
    src: string;
    /** 播放按钮文字，如「观看宣传片」 */
    label: string;
    /** 时长，如 2:13 */
    duration: string;
    videoLabel: string;
    copy: VideoPosterCopy;
    /** 未播放时的画面（截图或封面） */
    children: ReactNode;
    className?: string;
    /** 播放按钮样式：hero 大按钮，card 小圆钮 */
    variant?: 'hero' | 'card';
}

type Status = 'idle' | 'loading' | 'playing' | 'error';

/** 同页只播一个：开始播放时广播，其他播放器收起 */
const START_EVENT = 'awd-video-start';

/**
 * 点击才加载的视频：不预载、不自动播放，未点击前只是一张图，不占首屏流量。
 * 播放后原地换成 <video controls>；缓冲时有加载提示，失败时持续显示原因与重试（DESIGN.md §九）。
 * Escape（焦点在播放器内时）或关闭按钮回到封面，焦点还给播放按钮。
 */
export function VideoPoster({ src, label, duration, videoLabel, copy, children, className, variant = 'hero' }: VideoPosterProps) {
    const [status, setStatus] = useState<Status>('idle');
    const [attempt, setAttempt] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const instanceId = useId();
    const open = status !== 'idle';

    const close = () => {
        setStatus('idle');
        requestAnimationFrame(() => buttonRef.current?.focus());
    };

    const start = () => {
        setStatus('loading');
        window.dispatchEvent(new CustomEvent(START_EVENT, { detail: instanceId }));
    };

    useEffect(() => {
        const onOtherStart = (e: Event) => {
            if ((e as CustomEvent<string>).detail !== instanceId) setStatus('idle');
        };
        window.addEventListener(START_EVENT, onOtherStart);
        return () => window.removeEventListener(START_EVENT, onOtherStart);
    }, [instanceId]);

    // 新挂载的 <video> 上 autoPlay 在 iOS Safari 不一定生效，显式 play() 更可靠；被拒就停在控件上等用户点
    useEffect(() => {
        if (status !== 'loading') return;
        const v = videoRef.current;
        if (!v) return;
        v.focus();
        v.play().catch(() => undefined);
    }, [status, attempt]);

    return (
        <div
            className={cn('ide-video', open && 'is-playing', className)}
            onKeyDown={e => {
                if (open && e.key === 'Escape' && !e.defaultPrevented) {
                    e.preventDefault();
                    close();
                }
            }}
        >
            {open ? (
                <>
                    <video
                        key={attempt}
                        ref={videoRef}
                        src={src}
                        controls
                        playsInline
                        tabIndex={-1}
                        aria-label={videoLabel}
                        className="ide-video-el"
                        onPlaying={() => setStatus('playing')}
                        onError={() => setStatus('error')}
                    />
                    <div className="ide-video-status" aria-live="polite">
                        {status === 'loading' && (
                            <span className="ide-video-loading"><Loader2 aria-hidden size={18} className="animate-spin motion-reduce:animate-none" />{copy.loading}</span>
                        )}
                        {status === 'error' && (
                            <span className="ide-video-error" role="alert">
                                {copy.error}
                                <button type="button" onClick={() => { setAttempt(a => a + 1); setStatus('loading'); }}>
                                    <RotateCw aria-hidden size={15} />{copy.retry}
                                </button>
                            </span>
                        )}
                    </div>
                    <button type="button" className="ide-video-close" aria-label={copy.closeLabel} onClick={close}>
                        <X aria-hidden size={18} />
                    </button>
                </>
            ) : (
                <>
                    {children}
                    <button ref={buttonRef} type="button" className={cn('ide-play', variant === 'card' && 'ide-play-card')} onClick={start}>
                        <span className="ide-play-icon"><Play aria-hidden size={variant === 'card' ? 14 : 16} fill="currentColor" /></span>
                        {variant === 'hero' ? <span>{label}<span className="ide-play-time">{duration}</span></span> : <span className="sr-only">{label}</span>}
                    </button>
                </>
            )}
        </div>
    );
}
