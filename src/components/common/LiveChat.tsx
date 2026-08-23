import { useEffect, useState } from 'react';
import { sendContactMessage } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MessageCircle, X, Send, CheckCircle2 } from 'lucide-react';

// Optional Smartsupp integration — set your key to use Smartsupp instead of the built-in form
const SMARTUPP_KEY = 'YOUR_SMARTUPP_KEY';

export function LiveChat() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (SMARTUPP_KEY === 'YOUR_SMARTUPP_KEY') return; // use built-in support form

    const w = window as unknown as Record<string, unknown>;
    w._smartsupp = w._smartsupp || {};
    (w._smartsupp as Record<string, unknown>).key = SMARTUPP_KEY;
    w.smartsupp || (w.smartsupp = function (...args: unknown[]) {
      ((w.smartsupp as unknown as { _: unknown[] })._ = (w.smartsupp as unknown as { _: unknown[] })._ || []).push(args);
    });

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.charset = 'utf-8';
    script.async = true;
    script.src = 'https://www.smartsuppchat.com/loader.js?';
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  if (SMARTUPP_KEY !== 'YOUR_SMARTUPP_KEY') return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const { error } = await sendContactMessage(name, email, subject || 'Website enquiry', message);
    setSending(false);
    if (!error) {
      setSent(true);
      setName(''); setEmail(''); setSubject(''); setMessage('');
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full bg-[#0a1628] text-white shadow-lg flex items-center justify-center hover:bg-[#12233f] transition-colors"
          aria-label="Contact support"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between bg-[#0a1628] px-4 py-3">
            <div>
              <p className="text-white text-sm font-semibold">Wexford<span className="text-[#c9a227]">fin</span> Support</p>
              <p className="text-slate-300 text-xs">We reply by email, usually within 24h</p>
            </div>
            <button onClick={() => { setOpen(false); setSent(false); }} className="text-slate-300 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {sent ? (
            <div className="p-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-slate-800 font-medium text-sm">Message sent!</p>
              <p className="text-slate-500 text-xs mt-1">Our team will reply to your email shortly.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setSent(false)}>Send another</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="p-4 space-y-2.5">
              <Input required placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
              <Input required type="email" placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} />
              <Input placeholder="Subject (optional)" value={subject} onChange={e => setSubject(e.target.value)} />
              <Textarea required placeholder="How can we help?" value={message} onChange={e => setMessage(e.target.value)} rows={3} />
              <Button type="submit" disabled={sending} className="w-full gap-2 bg-[#0a1628] hover:bg-[#12233f]">
                <Send className="h-4 w-4" />
                {sending ? 'Sending…' : 'Send message'}
              </Button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
