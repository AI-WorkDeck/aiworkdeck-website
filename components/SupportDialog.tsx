'use client';

import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { formatSiteAmount, siteConfig } from '@/lib/site-config';
import type { getDictionary } from '@/get-dictionary';

interface SupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: Awaited<ReturnType<typeof getDictionary>>['supportDialog'];
}

type Status = 'idle' | 'pending' | 'confirming' | 'success' | 'error' | 'canceled';

export function SupportDialog({ open, onOpenChange, t }: SupportDialogProps) {
  const defaultAmount = siteConfig.currency === 'USD' ? '10' : '20';
  const presets = siteConfig.currency === 'USD' ? [5, 10, 20, 50, 100] : [10, 20, 50, 100, 200];
  const [amount, setAmount] = useState(defaultAmount);
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [outTradeNo, setOutTradeNo] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const attemptKey = useRef('');
  const activeRequest = useRef(0);
  const stripe = siteConfig.paymentChannel === 'stripe';

  // The return URL only identifies the order; payment is confirmed by the server.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('donation');
    const order = params.get('order');
    if (!order || (result !== 'success' && result !== 'cancel')) return;
    params.delete('donation');
    params.delete('order');
    window.history.replaceState(null, '', window.location.pathname + (params.size ? `?${params}` : '') + window.location.hash);
    setOutTradeNo(order);
    setStatus(result === 'cancel' ? 'canceled' : 'confirming');
    onOpenChange(true);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open || !outTradeNo || (status !== 'pending' && status !== 'confirming')) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    const check = async () => {
      try {
        const response = await fetch(`/api/payment/query?outTradeNo=${encodeURIComponent(outTradeNo)}`);
        const data = await response.json();
        if (stopped) return;
        if (response.status === 404) {
          setErrorMsg(t.orderUnavailable);
          setStatus('error');
          return;
        }
        if (response.ok && data.order?.kind === 'support' && data.order.status === 'paid') {
          setStatus('success');
          return;
        }
      } catch { /* A temporary connection failure is not a failed payment. */ }
      if (stopped) return;
      if (++count >= 60) {
        setErrorMsg(t.confirmationPending);
        setStatus('error');
        return;
      }
      timer = setTimeout(check, 2000);
    };
    void check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [open, outTradeNo, status, t.confirmationPending, t.orderUnavailable]);

  const handleClose = () => {
    activeRequest.current++;
    setStatus('idle');
    setLoading(false);
    setQrCode('');
    setCheckoutUrl('');
    setOutTradeNo('');
    setErrorMsg('');
    setAmount(defaultAmount);
    attemptKey.current = '';
    onOpenChange(false);
  };

  const handleCreateOrder = async () => {
    const value = Number(amount);
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || !Number.isFinite(value) || value < 1) {
      setErrorMsg(t.invalidAmount.replace('{min}', formatSiteAmount(100)));
      return;
    }
    const amountNum = Math.round(value * 100);
    const requestId = ++activeRequest.current;
    attemptKey.current ||= crypto.randomUUID();
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, kind: 'support', anonymous: stripe, description: t.orderDescription, idempotencyKey: attemptKey.current }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || t.createFailed);
      if (requestId !== activeRequest.current) return;
      if (data.present === 'redirect') {
        const url = new URL(data.redirectUrl);
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error(t.createFailed);
        const code = await QRCode.toDataURL(url.href, { width: 320, margin: 2 });
        if (requestId !== activeRequest.current) return;
        setCheckoutUrl(url.href);
        setQrCode(code);
      } else if (data.present === 'qrcode') {
        setQrCode(data.qrCode);
      } else if (data.status !== 'paid') {
        throw new Error(t.createFailed);
      }
      setOutTradeNo(data.outTradeNo);
      setStatus(data.status === 'paid' ? 'confirming' : 'pending');
    } catch (error) {
      if (requestId !== activeRequest.current) return;
      setErrorMsg(error instanceof Error ? error.message : t.networkError);
    } finally {
      if (requestId === activeRequest.current) setLoading(false);
    }
  };

  return <Dialog open={open} onOpenChange={handleClose}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle className="pr-6 text-center text-xl">{status === 'success' ? t.titleSuccess : t.title}</DialogTitle></DialogHeader>
      {status === 'idle' && <div className="space-y-6 py-4">
        <div className="text-center text-neutral-gray-medium"><p>{t.motto}</p><p className="mt-2 text-sm">{t.anonymousHint}</p></div>
        <div className="space-y-2"><Label htmlFor="support-amount">{t.amountLabel}</Label><div className="flex items-center gap-2">
          <Input id="support-amount" type="number" value={amount} onChange={e => { setAmount(e.target.value); attemptKey.current = ''; }} placeholder={t.amountPlaceholder.replace('{currency}', t.currencyNames[siteConfig.currency])} inputMode="decimal" min="1" step="0.01" disabled={loading} className="min-w-0 flex-1" />
        </div>{errorMsg && <p role="alert" className="text-sm text-red-600">{errorMsg}</p>}</div>
        <div className="flex flex-wrap justify-center gap-2">{presets.map(preset => <Button key={preset} variant={Number(amount) === preset ? 'default' : 'outline'} size="sm" disabled={loading} onClick={() => { setAmount(String(preset)); attemptKey.current = ''; }}>{siteConfig.currencySymbol}{preset}</Button>)}</div>
        <Button onClick={handleCreateOrder} disabled={loading} className="w-full">{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.creating}</> : stripe ? t.continueStripe : t.submit}</Button>
      </div>}
      {status === 'pending' && <div className="space-y-5 py-4 text-center">
        <div><p className="text-lg font-medium">{stripe ? t.stripeScanTitle : t.scanTitle}</p><p className="mt-2 text-sm text-neutral-gray-medium">{t.orderAmountPrefix}{formatSiteAmount(Math.round(Number(amount) * 100))}</p></div>
        {qrCode && <img src={qrCode} alt={stripe ? t.stripeQrAlt : t.qrAlt} className="mx-auto h-48 w-48 max-w-full rounded-lg border border-neutral-gray-light" />}
        {checkoutUrl && <Button asChild className="w-full"><a href={checkoutUrl}>{t.openCheckout}</a></Button>}
        <p className="text-sm text-neutral-gray-medium">{stripe ? t.stripeMethods : t.qrValid}</p>
        <p role="status" className="flex items-center justify-center gap-2 text-sm text-neutral-gray-medium"><Loader2 className="h-4 w-4 animate-spin" />{t.waitingPayment}</p>
      </div>}
      {status === 'confirming' && <div role="status" className="space-y-4 py-10 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-king-forest" /><p>{t.confirming}</p></div>}
      {status === 'success' && <div role="status" className="space-y-6 py-6 text-center"><CheckCircle className="mx-auto h-14 w-14 text-king-forest" /><div><p className="text-lg font-medium">{t.paySuccess}</p><p className="mt-2 text-sm text-neutral-gray-medium">{t.thanks}</p></div><Button onClick={handleClose}>{t.close}</Button></div>}
      {(status === 'error' || status === 'canceled') && <div className="space-y-6 py-6 text-center"><XCircle className="mx-auto h-12 w-12 text-neutral-gray-medium" /><p role="status" className="text-sm text-neutral-gray-medium">{status === 'canceled' ? t.canceled : errorMsg}</p><div className="flex flex-wrap justify-center gap-2">{status === 'error' && outTradeNo && <Button variant="outline" onClick={() => setStatus('confirming')}>{t.recheck}</Button>}<Button onClick={handleClose}>{t.close}</Button></div></div>}
    </DialogContent>
  </Dialog>;
}
