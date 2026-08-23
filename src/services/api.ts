import { supabase } from '@/db/supabase';
import type {
  Profile, Account, Transaction, Hold,
  DepositRequest, WithdrawalRequest, Notification, AdminMessage,
  SecurityCode, SecurityCodeType
} from '@/types/types';

// ─── Profiles ─────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle();
  return data;
}

export async function updateProfile(userId: string, updates: Partial<Pick<Profile, 'full_name' | 'phone'>>) {
  return supabase.from('profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', userId);
}

export async function getAllProfiles(): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles').select('*').order('created_at', { ascending: false }).limit(500);
  return Array.isArray(data) ? data : [];
}

// ─── Admin User Management ─────────────────────────────────────────────────────

type AdminManageResult = { success: boolean; error?: string };

async function invokeManage(body: Record<string, unknown>): Promise<AdminManageResult> {
  const { data, error } = await supabase.functions.invoke('admin-manage-user', { body });
  if (error) return { success: false, error: error.message };
  if (data?.error) return { success: false, error: data.error };
  return { success: true };
}

export async function adminUpdateCredentials(user_id: string, updates: { email?: string; password?: string }): Promise<AdminManageResult> {
  return invokeManage({ action: 'update_credentials', user_id, ...updates });
}

export async function adminSetActive(user_id: string, is_active: boolean): Promise<AdminManageResult> {
  return invokeManage({ action: 'set_active', user_id, is_active });
}

export async function adminSetRole(user_id: string, role: 'user' | 'admin'): Promise<AdminManageResult> {
  return invokeManage({ action: 'set_role', user_id, role });
}

export async function adminDeleteUser(user_id: string): Promise<AdminManageResult> {
  return invokeManage({ action: 'delete_user', user_id });
}

export async function adminUpdateProfile(user_id: string, updates: { full_name?: string; phone?: string }): Promise<AdminManageResult> {
  const { error } = await supabase.from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', user_id);
  return { success: !error, error: error?.message };
}

export async function adminUpdateAccount(account_id: string, updates: { balance?: number; available_balance?: number; is_active?: boolean; account_type?: string }): Promise<AdminManageResult> {
  const { error } = await supabase.from('accounts')
    .update({ ...updates }).eq('id', account_id);
  return { success: !error, error: error?.message };
}

export async function adminCreateUser(params: {
  email: string;
  password: string;
  full_name?: string;
  phone?: string;
  role?: 'user' | 'admin';
}): Promise<{ success: boolean; user_id?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body: params });
  if (error) return { success: false, error: error.message };
  if (data?.error) return { success: false, error: data.error };
  return { success: true, user_id: data.user_id };
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function getUserAccounts(userId: string): Promise<Account[]> {
  const { data } = await supabase
    .from('accounts').select('*').eq('user_id', userId).order('account_type');
  return Array.isArray(data) ? data : [];
}

export async function getAccountByNumber(accountNumber: string): Promise<Account | null> {
  const { data } = await supabase
    .from('accounts').select('*').eq('account_number', accountNumber).maybeSingle();
  return data;
}

export async function getAllAccounts(): Promise<Account[]> {
  const { data } = await supabase
    .from('accounts').select('*').order('created_at', { ascending: false }).limit(1000);
  return Array.isArray(data) ? data : [];
}

// ─── Transactions ──────────────────────────────────────────────────────────────

export async function getUserTransactions(userId: string, page = 1, pageSize = 20): Promise<Transaction[]> {
  const from = (page - 1) * pageSize;
  const { data } = await supabase
    .from('transactions').select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);
  return Array.isArray(data) ? data : [];
}

export async function getAllTransactions(page = 1, pageSize = 50): Promise<Transaction[]> {
  const from = (page - 1) * pageSize;
  const { data } = await supabase
    .from('transactions').select('*, profiles!transactions_user_id_fkey(email, full_name)')
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);
  return Array.isArray(data) ? data : [];
}

export interface TransactionEdit {
  transaction_type?: string;
  amount?: number;
  status?: string;
  description?: string;
  reference_number?: string;
  from_account_id?: string;
  to_account_id?: string;
  user_id?: string;
  created_at?: string;
  performed_by_admin?: string;
}

// Full A-Z edit via admin RPC (transaction_type, amount, status, description,
// reference_number, from/to accounts, user, performed_by, created_at)
export async function updateTransaction(id: string, updates: TransactionEdit): Promise<{ error: string | null }> {
  const toP = (t?: string) => (t ?? null);
  const { error } = await supabase.rpc('admin_edit_transaction', {
    p_id: id,
    p_transaction_type: toP(updates.transaction_type),
    p_amount: updates.amount ?? null,
    p_status: toP(updates.status),
    p_description: toP(updates.description),
    p_reference_number: toP(updates.reference_number),
    p_from_account_id: toP(updates.from_account_id),
    p_to_account_id: toP(updates.to_account_id),
    p_user_id: toP(updates.user_id),
    p_created_at: toP(updates.created_at),
    p_performed_by_admin: toP(updates.performed_by_admin),
  });
  return { error: error?.message ?? null };
}

export async function deleteTransaction(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);
  return { error: error?.message ?? null };
}

// ─── Holds ─────────────────────────────────────────────────────────────────────

export async function getUserHolds(userId: string): Promise<Hold[]> {
  const { data } = await supabase
    .from('holds').select('*, accounts(account_type, account_number)')
    .eq('user_id', userId).eq('is_released', false)
    .order('placed_at', { ascending: false });
  return Array.isArray(data) ? data : [];
}

export async function getAllHolds(): Promise<Hold[]> {
  const { data } = await supabase
    .from('holds').select('*, accounts(account_type, account_number), profiles!holds_user_id_fkey(email, full_name)')
    .order('placed_at', { ascending: false }).limit(500);
  return Array.isArray(data) ? data : [];
}

// ─── Deposit Requests ──────────────────────────────────────────────────────────

export async function getUserDepositRequests(userId: string): Promise<DepositRequest[]> {
  const { data } = await supabase
    .from('deposit_requests').select('*, accounts(account_type, account_number)')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  return Array.isArray(data) ? data : [];
}

export async function submitDepositRequest(userId: string, accountId: string, amount: number) {
  return supabase.from('deposit_requests').insert({ user_id: userId, account_id: accountId, amount });
}

export async function getAllDepositRequests(): Promise<DepositRequest[]> {
  const { data } = await supabase
    .from('deposit_requests')
    .select('*, accounts(account_type, account_number), profiles!deposit_requests_user_id_fkey(email, full_name)')
    .order('created_at', { ascending: false }).limit(200);
  return Array.isArray(data) ? data : [];
}

// ─── Withdrawal Requests ───────────────────────────────────────────────────────

export async function getUserWithdrawalRequests(userId: string): Promise<WithdrawalRequest[]> {
  const { data } = await supabase
    .from('withdrawal_requests').select('*, accounts(account_type, account_number)')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  return Array.isArray(data) ? data : [];
}

export async function submitWithdrawalRequest(userId: string, accountId: string, amount: number) {
  return supabase.from('withdrawal_requests').insert({ user_id: userId, account_id: accountId, amount });
}

export async function getAllWithdrawalRequests(): Promise<WithdrawalRequest[]> {
  const { data } = await supabase
    .from('withdrawal_requests')
    .select('*, accounts(account_type, account_number), profiles!withdrawal_requests_user_id_fkey(email, full_name)')
    .order('created_at', { ascending: false }).limit(200);
  return Array.isArray(data) ? data : [];
}

// ─── Notifications ─────────────────────────────────────────────────────────────

export async function getUserNotifications(userId: string): Promise<Notification[]> {
  const { data } = await supabase
    .from('notifications').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(50);
  return Array.isArray(data) ? data : [];
}

export async function markNotificationRead(id: string) {
  return supabase.from('notifications').update({ is_read: true }).eq('id', id);
}

export async function createNotification(userId: string, title: string, message: string) {
  return supabase.from('notifications').insert({ user_id: userId, title, message });
}

// ─── Admin Messages ────────────────────────────────────────────────────────────

export async function getAdminMessages(): Promise<AdminMessage[]> {
  const { data } = await supabase
    .from('admin_messages').select('*').order('created_at', { ascending: false }).limit(100);
  return Array.isArray(data) ? data : [];
}

export async function sendContactMessage(fromName: string, fromEmail: string, subject: string, message: string) {
  return supabase.from('admin_messages').insert({ from_name: fromName, from_email: fromEmail, subject, message });
}

// Post a message as the current logged-in user (support ticket from dashboard)
export async function sendUserSupportMessage(subject: string, message: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single();
  return supabase.from('admin_messages').insert({
    from_user_id: user.id,
    from_name: profile?.full_name || user.email,
    from_email: profile?.email || user.email,
    subject, message,
  });
}

// Admin reply: stores in mailbox (thread via parent_id) and queues a real email
export async function adminReplyMessage(parent: AdminMessage, replyText: string) {
  const toEmail = parent.from_email;
  if (!toEmail) return { error: 'Original sender has no email address' };

  const { error } = await supabase.from('admin_messages').insert({
    direction: 'outbound',
    to_email: toEmail,
    to_name: parent.from_name,
    parent_id: parent.id,
    subject: `Re: ${parent.subject.replace(/^Re:\s*/i, '')}`,
    message: replyText,
    is_read: true,
    delivery_status: 'queued',
  });
  if (error) return { error: error.message };

  // queue the actual email to the visitor
  const { data: settings } = await supabase.from('mail_settings').select('from_name,from_email').eq('id', 1).single();
  await supabase.from('mail_outbox').insert({
    to_email: toEmail,
    subject: `Re: ${parent.subject.replace(/^Re:\s*/i, '')}`,
    body_html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#0a1628;padding:20px 24px"><span style="color:#fff;font-size:20px;font-weight:bold">Wexford</span><span style="color:#c9a227;font-size:20px;font-weight:bold">fin</span></div>
      <div style="padding:24px"><p style="color:#4b5563;font-size:14px;line-height:1.7;white-space:pre-wrap">${replyText.replace(/</g, '&lt;')}</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px">— ${settings?.from_name || 'Wexfordfin Support'} · ${settings?.from_email || 'support@wexfordfin.com'}</p></div></div>`,
    body_text: replyText,
  });

  // flush queue best-effort (works only when provider is configured)
  await supabase.functions.invoke('send-email').catch(() => ({}));
  return { error: null };
}

export async function markMessageRead(id: string) {
  return supabase.from('admin_messages').update({ is_read: true }).eq('id', id);
}

// ─── Mail Settings (admin) ─────────────────────────────────────────────────────

export async function getMailSettings(): Promise<MailSettings | null> {
  const { data } = await supabase.from('mail_settings').select('*').eq('id', 1).single();
  return data;
}

export async function updateMailSettings(updates: Partial<Omit<MailSettings, 'id'>>) {
  return supabase.from('mail_settings').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', 1);
}

export async function flushMailQueue(): Promise<{ sent: number; failed: number; queued: number; note?: string }> {
  const { data } = await supabase.functions.invoke('send-email');
  return data as { sent: number; failed: number; queued: number; note?: string };
}

// ─── Security Codes ────────────────────────────────────────────────────────────

export async function getUserSecurityCodes(userId: string): Promise<SecurityCode[]> {
  const { data } = await supabase
    .from('security_codes').select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return Array.isArray(data) ? data : [];
}

export async function adminIssueSecurityCode(
  userId: string,
  codeType: SecurityCodeType,
  code: string,
  issuedBy: string,
  expiresAt?: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('security_codes').insert({
    user_id: userId,
    code_type: codeType,
    code,
    issued_by: issuedBy,
    expires_at: expiresAt || null,
  });
  return { success: !error, error: error?.message };
}

export async function validateSecurityCode(
  userId: string,
  codeType: SecurityCodeType,
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('security_codes')
    .select('*')
    .eq('user_id', userId)
    .eq('code_type', codeType)
    .eq('code', code)
    .eq('is_used', false)
    .maybeSingle();

  if (error) return { valid: false, error: error.message };
  if (!data) return { valid: false, error: 'Invalid or already used code' };

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, error: 'Code has expired' };
  }

  // Mark as used
  await supabase.from('security_codes')
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq('id', data.id);

  return { valid: true };
}

export async function adminDeleteSecurityCode(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('security_codes').delete().eq('id', id);
  return { error: error?.message ?? null };
}
