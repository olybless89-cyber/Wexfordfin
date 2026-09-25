import { apiClient } from '@/lib/apiClient';
import type {
  Profile, Account, Transaction, Hold,
  DepositRequest, WithdrawalRequest, Notification, AdminMessage,
  SecurityCode, SecurityCodeType, MailSettings, MailOutbox
} from '@/types/types';

function toError(err: unknown, fallback: string): Error {
  return err instanceof Error ? err : new Error(fallback);
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  return apiClient.get<Profile | null>(`/profiles/${userId}`).catch(() => null);
}

// userId is accepted for signature compatibility with the old Supabase-backed
// version, but every caller only ever updates their own profile — the backend
// derives "who" from the JWT, so it's ignored here.
export async function updateProfile(_userId: string, updates: Partial<Pick<Profile, 'full_name' | 'phone'>>): Promise<{ error: Error | null }> {
  try {
    await apiClient.patch(`/profiles/me`, updates);
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to update profile') };
  }
}

// The transaction PIN column isn't in the shared Profile type (it's sensitive
// and normally omitted from the UI), so it's fetched/set through its own
// small helpers rather than widening Profile everywhere.
export async function getOwnTransactionPin(): Promise<string | null> {
  const data = await apiClient.get<{ transaction_pin?: string | null }>('/profiles/me').catch(() => null);
  return data?.transaction_pin ?? null;
}

export async function updateTransactionPin(pin: string): Promise<{ error: Error | null }> {
  try {
    await apiClient.patch('/profiles/me', { transaction_pin: pin });
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to set PIN') };
  }
}

export async function getAllProfiles(): Promise<Profile[]> {
  const data = await apiClient.get<Profile[]>('/profiles').catch(() => []);
  return Array.isArray(data) ? data : [];
}

// ─── Admin User Management ─────────────────────────────────────────────────────

type AdminManageResult = { success: boolean; error?: string };

async function invokeManage(body: Record<string, unknown>): Promise<AdminManageResult> {
  try {
    await apiClient.post('/admin/users/manage', body);
    return { success: true };
  } catch (err) {
    return { success: false, error: toError(err, 'Action failed').message };
  }
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
  try {
    await apiClient.patch(`/profiles/${user_id}`, updates);
    return { success: true };
  } catch (err) {
    return { success: false, error: toError(err, 'Failed to update profile').message };
  }
}

export async function adminUpdateAccount(account_id: string, updates: { balance?: number; available_balance?: number; is_active?: boolean; account_type?: string }): Promise<AdminManageResult> {
  try {
    await apiClient.patch(`/admin/accounts/${account_id}`, updates);
    return { success: true };
  } catch (err) {
    return { success: false, error: toError(err, 'Failed to update account').message };
  }
}

export async function adminCreateUser(params: {
  email: string;
  password: string;
  full_name?: string;
  phone?: string;
  role?: 'user' | 'admin';
}): Promise<{ success: boolean; user_id?: string; error?: string }> {
  try {
    const data = await apiClient.post<{ success: boolean; user_id: string }>('/admin/users', params);
    return { success: true, user_id: data.user_id };
  } catch (err) {
    return { success: false, error: toError(err, 'Failed to create user').message };
  }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function getUserAccounts(userId: string): Promise<Account[]> {
  const data = await apiClient.get<Account[]>(`/accounts/user/${userId}`).catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function getAccountByNumber(accountNumber: string): Promise<Account | null> {
  return apiClient.get<Account | null>(`/accounts/by-number/${encodeURIComponent(accountNumber)}`).catch(() => null);
}

export async function getAllAccounts(): Promise<Account[]> {
  const data = await apiClient.get<Account[]>('/admin/accounts').catch(() => []);
  return Array.isArray(data) ? data : [];
}

// ─── Transactions ──────────────────────────────────────────────────────────────

export async function getUserTransactions(userId: string, page = 1, pageSize = 20): Promise<Transaction[]> {
  const data = await apiClient
    .get<Transaction[]>(`/transactions/user/${userId}?page=${page}&pageSize=${pageSize}`)
    .catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function getAllTransactions(page = 1, pageSize = 50): Promise<Transaction[]> {
  const data = await apiClient
    .get<Transaction[]>(`/admin/transactions?page=${page}&pageSize=${pageSize}`)
    .catch(() => []);
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

// Full A-Z edit via admin route (transaction_type, amount, status, description,
// reference_number, from/to accounts, user, performed_by, created_at)
export async function updateTransaction(id: string, updates: TransactionEdit): Promise<{ error: string | null }> {
  try {
    await apiClient.patch(`/admin/transactions/${id}`, updates);
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to update transaction').message };
  }
}

// Single entry point for the banking-ops backend route (internal/external
// transfers, admin funding, holds, deposit/withdrawal approval). Mirrors the
// old `supabase.functions.invoke('banking-ops', { body })` call shape.
export async function bankingOps<T = { success: boolean; reference?: string }>(body: Record<string, unknown>): Promise<T> {
  return apiClient.post<T>('/banking-ops', body);
}

export async function deleteTransaction(id: string): Promise<{ error: string | null }> {
  try {
    await apiClient.delete(`/admin/transactions/${id}`);
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to delete transaction').message };
  }
}

// ─── Holds ─────────────────────────────────────────────────────────────────────

export async function getUserHolds(userId: string): Promise<Hold[]> {
  const data = await apiClient.get<Hold[]>(`/holds/user/${userId}`).catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function getAllHolds(): Promise<Hold[]> {
  const data = await apiClient.get<Hold[]>('/admin/holds').catch(() => []);
  return Array.isArray(data) ? data : [];
}

// ─── Deposit Requests ──────────────────────────────────────────────────────────

// userId is accepted for signature compatibility; every caller only ever asks
// for their own requests, which the backend derives from the JWT.
export async function getUserDepositRequests(_userId: string): Promise<DepositRequest[]> {
  const data = await apiClient.get<DepositRequest[]>('/deposit-requests').catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function submitDepositRequest(_userId: string, accountId: string, amount: number): Promise<{ error: Error | null }> {
  try {
    await apiClient.post('/deposit-requests', { account_id: accountId, amount });
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to submit deposit request') };
  }
}

export async function getAllDepositRequests(): Promise<DepositRequest[]> {
  const data = await apiClient.get<DepositRequest[]>('/admin/deposit-requests').catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function adminUpdateDepositRequestStatus(id: string, status: 'approved' | 'rejected') {
  return apiClient.patch(`/admin/deposit-requests/${id}`, { status });
}

// ─── Withdrawal Requests ───────────────────────────────────────────────────────

export async function getUserWithdrawalRequests(_userId: string): Promise<WithdrawalRequest[]> {
  const data = await apiClient.get<WithdrawalRequest[]>('/withdrawal-requests').catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function submitWithdrawalRequest(_userId: string, accountId: string, amount: number): Promise<{ error: Error | null }> {
  try {
    await apiClient.post('/withdrawal-requests', { account_id: accountId, amount });
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to submit withdrawal request') };
  }
}

export async function getAllWithdrawalRequests(): Promise<WithdrawalRequest[]> {
  const data = await apiClient.get<WithdrawalRequest[]>('/admin/withdrawal-requests').catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function adminUpdateWithdrawalRequestStatus(id: string, status: 'approved' | 'rejected') {
  return apiClient.patch(`/admin/withdrawal-requests/${id}`, { status });
}

// ─── Notifications ─────────────────────────────────────────────────────────────

export async function getUserNotifications(_userId: string): Promise<Notification[]> {
  const data = await apiClient.get<Notification[]>('/notifications').catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function markNotificationRead(id: string) {
  return apiClient.patch(`/notifications/${id}/read`).catch(() => null);
}

// Admin sends a notification to a customer.
export async function createNotification(userId: string, title: string, message: string) {
  return apiClient.post('/admin/notifications', { user_id: userId, title, message });
}

// ─── Admin Messages ────────────────────────────────────────────────────────────

export async function getAdminMessages(): Promise<AdminMessage[]> {
  const data = await apiClient.get<AdminMessage[]>('/admin/messages').catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function sendContactMessage(fromName: string, fromEmail: string, subject: string, message: string): Promise<{ error: Error | null }> {
  try {
    await apiClient.post('/messages/contact', { from_name: fromName, from_email: fromEmail, subject, message });
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to send message') };
  }
}

// Post a message as the current logged-in user (support ticket from dashboard)
export async function sendUserSupportMessage(subject: string, message: string): Promise<{ error: Error | null }> {
  try {
    await apiClient.post('/messages/support', { subject, message });
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to send message') };
  }
}

// Admin reply: stores in mailbox (thread via parent_id) and delivers an email
export async function adminReplyMessage(parent: AdminMessage, replyText: string): Promise<{ error: string | null }> {
  try {
    await apiClient.post(`/admin/messages/${parent.id}/reply`, { reply: replyText });
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to send reply').message };
  }
}

// Admin compose: brand-new email to any address (user or external)
export async function adminComposeMessage(toEmail: string, toName: string, subject: string, message: string): Promise<{ error: string | null }> {
  try {
    await apiClient.post('/admin/messages/compose', { to_email: toEmail, to_name: toName, subject, message });
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to send message').message };
  }
}

// ─── User Mailbox (default in-app webmail) ───────────────────────────────────

export async function getMyEmails(): Promise<MailOutbox[]> {
  const data = await apiClient.get<MailOutbox[]>('/mail/inbox').catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function getMyUnreadMailCount(): Promise<number> {
  const data = await apiClient.get<{ count: number }>('/mail/unread-count').catch(() => ({ count: 0 }));
  return data?.count ?? 0;
}

export async function markEmailRead(id: string) {
  return apiClient.patch(`/mail/inbox/${id}/read`).catch(() => null);
}

export async function markMessageRead(id: string) {
  return apiClient.patch(`/admin/messages/${id}/read`).catch(() => null);
}

// ─── Mail Settings (admin) ─────────────────────────────────────────────────────

export async function getMailSettings(): Promise<MailSettings | null> {
  return apiClient.get<MailSettings | null>('/admin/mail-settings').catch(() => null);
}

export async function updateMailSettings(updates: Partial<Omit<MailSettings, 'id'>>): Promise<{ error: Error | null }> {
  try {
    await apiClient.patch('/admin/mail-settings', updates);
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to update mail settings') };
  }
}

export async function flushMailQueue(): Promise<{ delivered_internal: number; sent_external: number; failed: number; awaiting_provider: number }> {
  return apiClient.post('/admin/mail/flush');
}

// ─── Security Codes ────────────────────────────────────────────────────────────

export async function getUserSecurityCodes(userId: string): Promise<SecurityCode[]> {
  const data = await apiClient.get<SecurityCode[]>(`/security-codes/user/${userId}`).catch(() => []);
  return Array.isArray(data) ? data : [];
}

export async function adminIssueSecurityCode(
  userId: string,
  codeType: SecurityCodeType,
  code: string,
  _issuedBy: string,
  expiresAt?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiClient.post('/admin/security-codes', {
      user_id: userId,
      code_type: codeType,
      code,
      expires_at: expiresAt || null,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: toError(err, 'Failed to issue code').message };
  }
}

export async function validateSecurityCode(
  _userId: string,
  codeType: SecurityCodeType,
  code: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const data = await apiClient.post<{ valid: boolean; error?: string }>('/security-codes/validate', {
      code_type: codeType,
      code,
    });
    return data;
  } catch (err) {
    return { valid: false, error: toError(err, 'Validation failed').message };
  }
}

export async function adminDeleteSecurityCode(id: string): Promise<{ error: string | null }> {
  try {
    await apiClient.delete(`/admin/security-codes/${id}`);
    return { error: null };
  } catch (err) {
    return { error: toError(err, 'Failed to delete code').message };
  }
}
