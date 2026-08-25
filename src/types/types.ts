export type UserRole = 'user' | 'admin';
export type AccountType = 'checking' | 'savings' | 'business';
export type TransactionType = 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'hold' | 'release' | 'admin_credit';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'held';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  account_type: AccountType;
  account_number: string;
  balance: number;
  available_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  user_id: string;
  transaction_type: TransactionType;
  amount: number;
  status: TransactionStatus;
  description: string | null;
  reference_number: string;
  performed_by_admin: string | null;
  created_at: string;
  from_account?: Account;
  to_account?: Account;
  profile?: Profile;
}

export interface Hold {
  id: string;
  account_id: string;
  user_id: string;
  amount: number;
  reason: string;
  is_released: boolean;
  placed_by_admin: string;
  released_by_admin: string | null;
  placed_at: string;
  released_at: string | null;
  account?: Account;
  profile?: Profile;
}

export interface DepositRequest {
  id: string;
  user_id: string;
  account_id: string;
  amount: number;
  status: RequestStatus;
  notes: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  account?: Account;
  profile?: Profile;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  account_id: string;
  amount: number;
  status: RequestStatus;
  notes: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  account?: Account;
  profile?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export type SecurityCodeType = 'PIN' | 'IMF' | 'COT' | 'TAC';

export interface SecurityCode {
  id: string;
  user_id: string;
  code_type: SecurityCodeType;
  code: string;
  is_used: boolean;
  issued_by: string | null;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
}

export interface AdminMessage {
  id: string;
  from_user_id: string | null;
  from_name: string | null;
  from_email: string | null;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
  direction: 'inbound' | 'outbound';
  to_email: string | null;
  to_name: string | null;
  parent_id: string | null;
  delivery_status: string;
  sent_at: string | null;
}

export interface MailSettings {
  id: number;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  from_name: string;
  from_email: string;
  forward_enabled: boolean;
  forward_to: string | null;
  notifications_enabled: boolean;
}

export interface MailOutbox {
  id: string;
  user_id: string | null;
  to_email: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  status: string;
  error: string | null;
  attempts: number;
  is_read: boolean;
  created_at: string;
  sent_at: string | null;
}
