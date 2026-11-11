'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { Avatar } from '@/components/user/Avatar';

/**
 * 编辑个人资料：头像、昵称、简介。
 *
 * 头像与文本走两条独立请求：头像是 multipart 且改完立刻可见（服务端已重编码，
 * 拿回来的是最终结果），文本是 PATCH JSON。合成一个 multipart 只会让两种失败
 * 混在一起——图片格式不对不该把改了一半的昵称一起打回。
 */

const DISPLAY_NAME_MAX = 24;
const BIO_MAX = 160;

interface ProfileDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dict: any;
    user: {
        id: string;
        displayName: string;
        bio?: string;
        avatarUpdatedAt?: string;
    };
}

export function ProfileDialog({ open, onOpenChange, dict, user }: ProfileDialogProps) {
    const t = dict.accountPage;
    const router = useRouter();
    const fileInput = useRef<HTMLInputElement>(null);

    const [displayName, setDisplayName] = useState(user.displayName);
    const [bio, setBio] = useState(user.bio ?? '');
    const [avatarStamp, setAvatarStamp] = useState(user.avatarUpdatedAt);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    const fail = (code: string | undefined) =>
        setMessage(t.profileErrors[code ?? ''] ?? t.profileFailed);

    const pickAvatar = async (file: File) => {
        setMessage('');
        setUploading(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/account/avatar', { method: 'POST', body: form });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                fail(d.error);
                return;
            }
            setAvatarStamp(d.avatarUpdatedAt);
            router.refresh();
        } catch {
            setMessage(t.profileFailed);
        } finally {
            setUploading(false);
            // 清掉 input 的值，否则连着选同一个文件不会再触发 change
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    const removeAvatar = async () => {
        setMessage('');
        setUploading(true);
        try {
            const res = await fetch('/api/account/avatar', { method: 'DELETE' });
            if (!res.ok) {
                setMessage(t.profileFailed);
                return;
            }
            setAvatarStamp(undefined);
            router.refresh();
        } catch {
            setMessage(t.profileFailed);
        } finally {
            setUploading(false);
        }
    };

    const save = async () => {
        setMessage('');
        setSaving(true);
        try {
            const res = await fetch('/api/account/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName, bio }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                fail(d.error);
                return;
            }
            setMessage(t.profileSaved);
            router.refresh();
            onOpenChange(false);
        } catch {
            setMessage(t.profileFailed);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t.profileTitle}</DialogTitle>
                </DialogHeader>

                <div className="space-y-5 pt-2">
                    <div>
                        <Label className="text-neutral-gray-dark">{t.profileAvatar}</Label>
                        <div className="mt-2 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                            <Avatar
                                userId={user.id}
                                displayName={displayName || user.displayName}
                                avatarUpdatedAt={avatarStamp}
                                size={64}
                            />
                            <div className="flex min-w-0 flex-col gap-2">
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={uploading}
                                        onClick={() => fileInput.current?.click()}
                                        className="border-king-forest text-king-forest gap-1.5"
                                    >
                                        {uploading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Upload className="w-4 h-4" strokeWidth={1.75} />
                                        )}
                                        {uploading ? t.profileUploading : t.profileAvatarPick}
                                    </Button>
                                    {avatarStamp && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={uploading}
                                            onClick={removeAvatar}
                                            className="gap-1.5 text-neutral-gray-medium"
                                        >
                                            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                                            {t.profileAvatarRemove}
                                        </Button>
                                    )}
                                </div>
                                <p className="text-[11px] text-neutral-gray-medium">{t.profileAvatarHint}</p>
                            </div>
                        </div>
                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) pickAvatar(file);
                            }}
                        />
                    </div>

                    <div>
                        <Label htmlFor="profile-name" className="text-neutral-gray-dark">
                            {t.profileDisplayName}
                        </Label>
                        <Input
                            id="profile-name"
                            value={displayName}
                            maxLength={Math.max(DISPLAY_NAME_MAX, user.displayName.length + 16)}
                            onChange={e => setDisplayName(e.target.value)}
                            className="mt-1.5"
                        />
                    </div>

                    <div>
                        <div className="flex items-baseline justify-between">
                            <Label htmlFor="profile-bio" className="text-neutral-gray-dark">
                                {t.profileBio}
                            </Label>
                            <span className="text-[11px] font-mono text-neutral-gray-medium tabular-nums">
                                {bio.length} / {BIO_MAX}
                            </span>
                        </div>
                        <Textarea
                            id="profile-bio"
                            value={bio}
                            maxLength={BIO_MAX}
                            rows={3}
                            placeholder={t.profileBioPlaceholder}
                            onChange={e => setBio(e.target.value)}
                            className="mt-1.5 resize-none"
                        />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3">
                        {message && <span className="text-sm text-neutral-gray-dark">{message}</span>}
                        <Button
                            onClick={save}
                            disabled={saving || uploading || !displayName.trim()}
                            className="bg-king-forest hover:bg-king-forest/90 font-bold"
                        >
                            {saving ? t.profileSaving : t.profileSave}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
