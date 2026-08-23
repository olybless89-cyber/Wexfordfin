import { useEffect, useState } from 'react';
import { getAllTransactions, updateTransaction, deleteTransaction, getAllAccounts, getAllProfiles } from '@/services/api';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Transaction, Account, Profile } from '@/types/types';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'outline', pending: 'secondary', failed: 'destructive', held: 'secondary',
};

const TX_TYPES = ['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'admin_credit', 'hold', 'release'];
const TX_STATUSES = ['pending', 'completed', 'failed', 'held'];

interface EditForm {
  transaction_type: string;
  amount: string;
  status: string;
  description: string;
  reference_number: string;
  from_account_id: string;
  to_account_id: string;
  user_id: string;
  created_at: string;
}

const NONE = '__none__';

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Edit state
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ transaction_type: '', amount: '', status: '', description: '', reference_number: '', from_account_id: '', to_account_id: '', user_id: '', created_at: '' });
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTxId, setDeleteTxId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getAllAccounts().then(setAccounts);
    getAllProfiles().then(setProfiles);
  }, []);

  useEffect(() => {
    setLoading(true);
    getAllTransactions(page, 50).then(data => {
      setTransactions(prev => page === 1 ? data : [...prev, ...data]);
    }).finally(() => setLoading(false));
  }, [page]);

  const filtered = typeFilter === 'all' ? transactions : transactions.filter(t => t.transaction_type === typeFilter);

  function openEdit(tx: Transaction) {
    setEditTx(tx);
    setEditForm({
      transaction_type: tx.transaction_type,
      amount: String(tx.amount),
      status: tx.status,
      description: tx.description ?? '',
      reference_number: tx.reference_number ?? '',
      from_account_id: tx.from_account_id ?? NONE,
      to_account_id: tx.to_account_id ?? NONE,
      user_id: tx.user_id,
      created_at: tx.created_at ? tx.created_at.slice(0, 16) : '',
    });
  }

  async function handleSave() {
    if (!editTx) return;
    setSaving(true);
    const { error } = await updateTransaction(editTx.id, {
      transaction_type: editForm.transaction_type,
      amount: parseFloat(editForm.amount),
      status: editForm.status,
      description: editForm.description,
      reference_number: editForm.reference_number,
      from_account_id: editForm.from_account_id === NONE ? editTx.from_account_id ?? undefined : editForm.from_account_id,
      to_account_id: editForm.to_account_id === NONE ? editTx.to_account_id ?? undefined : editForm.to_account_id,
      user_id: editForm.user_id,
      created_at: editForm.created_at ? new Date(editForm.created_at).toISOString() : undefined,
    });
    setSaving(false);
    if (error) { toast.error(`Failed to update: ${error}`); return; }
    setTransactions(prev => prev.map(t => t.id === editTx.id ? { ...t, ...transactions.find(x => x.id === editTx.id) } : t));
    // simplest correct refresh
    getAllTransactions(1, 50).then(setTransactions);
    toast.success('Transaction updated successfully');
    setEditTx(null);
  }

  async function handleDelete() {
    if (!deleteTxId) return;
    setDeleting(true);
    const { error } = await deleteTransaction(deleteTxId);
    setDeleting(false);
    if (error) { toast.error(`Failed to delete: ${error}`); return; }
    setTransactions(prev => prev.filter(t => t.id !== deleteTxId));
    toast.success('Transaction deleted');
    setDeleteTxId(null);
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>All Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">Platform-wide transaction history — click ✏️ to edit any field</p>
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Filter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TX_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>

        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-base">Transactions ({filtered.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Reference</th>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && transactions.length === 0
                    ? Array(5).fill(0).map((_, i) => (
                        <tr key={i} className="border-b border-border animate-pulse">
                          {Array(8).fill(0).map((__, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-muted rounded w-20" /></td>)}
                        </tr>
                      ))
                    : filtered.map(tx => (
                        <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">
                            {(tx.profile as { email?: string })?.email || tx.user_id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3 text-sm capitalize">{tx.transaction_type.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tx.reference_number}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">{tx.description || '—'}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium">{fmt(tx.amount)}</td>
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant[tx.status] || 'outline'} className="text-xs">{tx.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(tx)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTxId(tx.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {filtered.length >= 50 && (
              <div className="flex justify-center p-4">
                <button onClick={() => setPage(p => p + 1)} className="text-sm text-primary hover:underline">Load more →</button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTx} onOpenChange={open => !open && setEditTx(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={editForm.transaction_type} onValueChange={v => setEditForm(f => ({ ...f, transaction_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TX_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TX_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Amount (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.amount}
                  onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date / Time</Label>
                <Input
                  type="datetime-local"
                  value={editForm.created_at}
                  onChange={e => setEditForm(f => ({ ...f, created_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>User</Label>
              <Select value={editForm.user_id} onValueChange={v => setEditForm(f => ({ ...f, user_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>From Account</Label>
                <Select value={editForm.from_account_id} onValueChange={v => setEditForm(f => ({ ...f, from_account_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— none —</SelectItem>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.account_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>To Account</Label>
                <Select value={editForm.to_account_id} onValueChange={v => setEditForm(f => ({ ...f, to_account_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— none —</SelectItem>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.account_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reference Number</Label>
              <Input
                value={editForm.reference_number}
                onChange={e => setEditForm(f => ({ ...f, reference_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTx(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteTxId} onOpenChange={open => !open && setDeleteTxId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the transaction record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
