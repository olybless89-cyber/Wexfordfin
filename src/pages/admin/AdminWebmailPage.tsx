import { useEffect, useMemo, useState } from 'react';
import {
  getAdminMessages, markMessageRead, adminReplyMessage, adminComposeMessage, getAllProfiles,
} from '@/services/api';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AdminMessage, Profile } from '@/types/types';
import { Mail, MailOpen, Send, Reply, Inbox, ArrowUpRight, PenSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminWebmailPage() {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [selected, setSelected] = useState<AdminMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');

  const reload = () => getAdminMessages().then(setMessages).finally(() => setLoading(false));
  useEffect(() => { reload(); getAllProfiles().then(setUsers).catch(() => ({})); }, []);

  const inbox = useMemo(() => messages.filter(m => m.direction === 'inbound'), [messages]);
  const sent = useMemo(() => messages.filter(m => m.direction === 'outbound'), [messages]);
  const list = folder === 'inbox' ? inbox : sent;
  const unread = inbox.filter(m => !m.is_read).length;

  const open = async (msg: AdminMessage) => {
    setSelected(msg);
    setReplyText('');
    if (msg.direction === 'inbound' && !msg.is_read) { await markMessageRead(msg.id); reload(); }
  };

  // thread: original + replies
  const thread = useMemo(() => {
    if (!selected) return [];
    const rootId = selected.parent_id || selected.id;
    return messages
      .filter(m => m.id === rootId || m.parent_id === rootId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, selected]);

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    const root = selected.direction === 'inbound' ? selected : messages.find(m => m.id === (selected.parent_id || selected.id));
    if (!root) return;
    setSending(true);
    const { error } = await adminReplyMessage(root, replyText.trim());
    setSending(false);
    if (error) { toast.error(`Reply failed: ${error}`); return; }
    toast.success('Reply stored & queued for email delivery');
    setReplyText('');
    reload();
  }

  async function sendCompose() {
    if (!composeTo || !composeSubject.trim() || !composeBody.trim()) return;
    setSending(true);
    const recipient = users.find(u => u.email === composeTo);
    const { error } = await adminComposeMessage(composeTo, recipient?.full_name || '', composeSubject.trim(), composeBody.trim());
    setSending(false);
    if (error) { toast.error(`Send failed: ${error}`); return; }
    toast.success(recipient ? 'Email delivered to user Mailbox' : 'Email queued for external delivery');
    setComposeOpen(false);
    setComposeTo(''); setComposeSubject(''); setComposeBody('');
    setFolder('sent');
    reload();
  }

  const personLine = (m: AdminMessage) =>
    m.direction === 'inbound'
      ? (m.from_name || m.from_email || 'Unknown')
      : `→ ${m.to_name || m.to_email || 'Unknown'}`;

  return (
    <AdminLayout unreadMail={unread}>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Webmail</h1>
            <p className="text-muted-foreground text-sm mt-1">{unread} unread messages</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setComposeOpen(true)} className="gap-2">
              <PenSquare className="h-4 w-4" /> Compose
            </Button>
            <Tabs value={folder} onValueChange={v => setFolder(v as 'inbox' | 'sent')}>
              <TabsList>
                <TabsTrigger value="inbox" className="gap-2"><Inbox className="h-3.5 w-3.5" />Inbox ({inbox.length})</TabsTrigger>
                <TabsTrigger value="sent" className="gap-2"><ArrowUpRight className="h-3.5 w-3.5" />Sent ({sent.length})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>New Email</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">To</p>
                <Select value={composeTo} onValueChange={setComposeTo}>
                  <SelectTrigger><SelectValue placeholder="Select a user…" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.email}>{u.full_name || u.email} — {u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="…or type any email address"
                  value={composeTo}
                  onChange={e => setComposeTo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Subject</p>
                <Input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} placeholder="Subject" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Message</p>
                <Textarea rows={6} value={composeBody} onChange={e => setComposeBody(e.target.value)} placeholder="Write your message…" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
                <Button onClick={sendCompose} disabled={sending || !composeTo || !composeSubject.trim() || !composeBody.trim()} className="gap-2">
                  <Send className="h-4 w-4" /> {sending ? 'Sending…' : 'Send Email'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Registered users receive the email instantly in their dashboard Mailbox. External addresses are queued for provider delivery.
              </p>
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">{folder === 'inbox' ? 'Inbox' : 'Sent'} ({list.length})</CardTitle></CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {loading ? Array(3).fill(0).map((_, i) => (
                <div key={i} className="p-4 animate-pulse space-y-2">
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-2.5 bg-muted rounded w-3/4" />
                </div>
              )) : list.length === 0 ? (
                <div className="p-8 text-center">
                  <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">No messages yet</p>
                </div>
              ) : list.map(msg => (
                <button key={msg.id} onClick={() => open(msg)}
                  className={`w-full text-left p-4 hover:bg-muted/30 transition-colors ${selected?.id === msg.id ? 'bg-primary/5' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {msg.direction === 'inbound'
                        ? (msg.is_read
                            ? <MailOpen className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                            : <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />)
                        : <Send className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${msg.direction === 'inbound' && !msg.is_read ? 'font-semibold' : ''}`}>{msg.subject}</p>
                        <p className="text-xs text-muted-foreground truncate">{personLine(msg)}</p>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <p className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleDateString()}</p>
                      {msg.direction === 'inbound' && !msg.is_read && <Badge variant="secondary" className="text-xs text-primary border-primary/20 bg-primary/10">New</Badge>}
                      {msg.direction === 'outbound' && <Badge variant="outline" className="text-xs">{msg.delivery_status}</Badge>}
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Conversation</CardTitle></CardHeader>
            <CardContent>
              {!selected ? (
                <div className="text-center py-12">
                  <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-muted-foreground">Select a message to read</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {thread.map(m => (
                    <div key={m.id} className={`rounded-lg border p-3 ${m.direction === 'outbound' ? 'border-primary/30 bg-primary/5 ml-6' : 'border-border'}`}>
                      <div className="flex justify-between items-baseline mb-2">
                        <p className="text-sm font-semibold">{m.direction === 'inbound' ? (m.from_name || m.from_email) : 'You'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">{m.message}</p>
                    </div>
                  ))}

                  <div className="pt-2 space-y-2">
                    <Textarea
                      placeholder="Type your reply… (also emailed to the sender)"
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={4}
                    />
                    <div className="flex justify-end">
                      <Button onClick={sendReply} disabled={sending || !replyText.trim()} className="gap-2">
                        <Reply className="h-4 w-4" />
                        {sending ? 'Sending…' : 'Reply'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
