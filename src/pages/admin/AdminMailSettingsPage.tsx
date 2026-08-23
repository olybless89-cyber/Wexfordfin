import { useEffect, useState } from 'react';
import { getMailSettings, updateMailSettings, flushMailQueue } from '@/services/api';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { MailSettings } from '@/types/types';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

export default function AdminMailSettingsPage() {
  const [settings, setSettings] = useState<MailSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => { getMailSettings().then(setSettings); }, []);

  if (!settings) return <AdminLayout><div className="p-6">Loading…</div></AdminLayout>;

  const upd = (patch: Partial<MailSettings>) => setSettings(s => s ? { ...s, ...patch } : s);

  async function save() {
    if (!settings) return;
    setSaving(true);
    const { error } = await updateMailSettings({
      smtp_host: settings.smtp_host,
      smtp_port: settings.smtp_port,
      smtp_user: settings.smtp_user,
      smtp_pass: settings.smtp_pass ?? undefined,
      from_name: settings.from_name,
      from_email: settings.from_email,
      forward_enabled: settings.forward_enabled,
      forward_to: settings.forward_to,
      notifications_enabled: settings.notifications_enabled,
    });
    setSaving(false);
    if (error) toast.error(`Save failed: ${error.message}`);
    else toast.success('Mail settings saved');
  }

  async function flush() {
    setFlushing(true);
    const res = await flushMailQueue();
    setFlushing(false);
    if (res?.note) toast.warning(res.note);
    else toast.success(`Queue flushed — sent: ${res.sent}, failed: ${res.failed}, queued: ${res.queued}`);
  }

  const provider = (settings.smtp_host || '').toLowerCase().includes('brevo') ? 'brevo'
    : (settings.smtp_host || '').toLowerCase().includes('resend') ? 'resend'
    : (settings.smtp_host ? 'custom' : 'none');

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Mail Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure outbound email delivery for notifications, replies and optional forwarding to Gmail.
          </p>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Outbound Provider
              <Badge variant={provider === 'none' ? 'destructive' : 'outline'}>
                {provider === 'none' ? 'not configured' : provider}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={provider === 'none' ? '' : provider} onValueChange={v => upd({ smtp_host: v })}>
                <SelectTrigger><SelectValue placeholder="Choose provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="brevo">Brevo (free 300/day, REST API)</SelectItem>
                  <SelectItem value="resend">Resend (REST API)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                type="password"
                value={settings.smtp_pass || ''}
                onChange={e => upd({ smtp_pass: e.target.value })}
                placeholder="Paste provider API key (stored in admin-only table)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>From Name</Label>
                <Input value={settings.from_name} onChange={e => upd({ from_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>From Email</Label>
                <Input value={settings.from_email} onChange={e => upd({ from_email: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Brevo: brevo.com → SMTP &amp; API → API Keys. Resend: resend.com → API Keys.
              Free Brevo accounts can send from support@wexfordfin.com once your domain is verified there.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">External Mailbox Link</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Forward copies to external email</p>
                <p className="text-xs text-muted-foreground">e.g. your Gmail — every outgoing email is mirrored there</p>
              </div>
              <Switch checked={settings.forward_enabled} onCheckedChange={v => upd({ forward_enabled: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>External address (Gmail / any)</Label>
              <Input
                type="email"
                value={settings.forward_to || ''}
                onChange={e => upd({ forward_to: e.target.value })}
                placeholder="you@gmail.com"
                disabled={!settings.forward_enabled}
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium">Automatic email notifications</p>
                <p className="text-xs text-muted-foreground">Deposits, withdrawals, transfers, holds — emailed to users automatically</p>
              </div>
              <Switch checked={settings.notifications_enabled} onCheckedChange={v => upd({ notifications_enabled: v })} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
          <Button variant="outline" onClick={flush} disabled={flushing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${flushing ? 'animate-spin' : ''}`} />
            Flush Outbox
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
