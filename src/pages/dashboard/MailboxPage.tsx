import { useEffect, useMemo, useState } from 'react';
import { getMyEmails, markEmailRead, sendUserSupportMessage } from '@/services/api';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { MailOutbox } from '@/types/types';
import { Mail, MailOpen, Reply, Inbox } from 'lucide-react';
import { toast } from 'sonner';

// Render the plain-text version; fall back to stripped HTML for older mails
function bodyOf(mail: MailOutbox): string {
  if (mail.body_text) return mail.body_text;
  return mail.body_html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export default function MailboxPage() {
  const [emails, setEmails] = useState<MailOutbox[]>([]);
  const [selected, setSelected] = useState<MailOutbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const reload = () => getMyEmails().then(setEmails).finally(() => setLoading(false));
  useEffect(() => { reload(); }, []);

  const unread = useMemo(() => emails.filter(e => !e.is_read).length, [emails]);

  const open = async (mail: MailOutbox) => {
    setSelected(mail);
    setReplyText('');
    if (!mail.is_read) { await markEmailRead(mail.id); reload(); }
  };

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    const { error } = await sendUserSupportMessage(`Re: ${selected.subject.replace(/^Re:\s*/i, '')}`, replyText.trim());
    setSending(false);
    if (error) { toast.error(`Reply failed: ${error.message}`); return; }
    toast.success('Reply sent to Wexfordfin Support');
    setReplyText('');
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Mailbox</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {unread} unread · official emails from Wexfordfin, delivered in-app
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="h-4 w-4" /> Inbox ({emails.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {loading ? Array(3).fill(0).map((_, i) => (
                <div key={i} className="p-4 animate-pulse space-y-2">
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-2.5 bg-muted rounded w-3/4" />
                </div>
              )) : emails.length === 0 ? (
                <div className="p-8 text-center">
                  <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">No emails yet</p>
                </div>
              ) : emails.map(mail => (
                <button key={mail.id} onClick={() => open(mail)}
                  className={`w-full text-left p-4 hover:bg-muted/30 transition-colors ${selected?.id === mail.id ? 'bg-primary/5' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {mail.is_read
                        ? <MailOpen className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        : <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${!mail.is_read ? 'font-semibold' : ''}`}>{mail.subject}</p>
                        <p className="text-xs text-muted-foreground truncate">Wexfordfin Support</p>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <p className="text-xs text-muted-foreground">{new Date(mail.created_at).toLocaleDateString()}</p>
                      {!mail.is_read && <Badge variant="secondary" className="text-xs text-primary border-primary/20 bg-primary/10">New</Badge>}
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Message</CardTitle></CardHeader>
            <CardContent>
              {!selected ? (
                <div className="text-center py-12">
                  <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-muted-foreground">Select an email to read</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex justify-between items-baseline mb-2 gap-2">
                      <p className="text-sm font-semibold truncate">{selected.subject}</p>
                      <p className="text-xs text-muted-foreground shrink-0">{new Date(selected.created_at).toLocaleString()}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">From: Wexfordfin Support &lt;support@wexfordfin.com&gt;</p>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{bodyOf(selected)}</p>
                  </div>

                  <div className="pt-2 space-y-2">
                    <Textarea
                      placeholder="Reply to Wexfordfin Support…"
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={4}
                    />
                    <div className="flex justify-end">
                      <Button onClick={sendReply} disabled={sending || !replyText.trim()} className="gap-2">
                        <Reply className="h-4 w-4" />
                        {sending ? 'Sending…' : 'Reply to Support'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
