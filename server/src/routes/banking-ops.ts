import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthedRequest } from '../auth.js';

const router = Router();

const USER_ACTIONS = ['internal_transfer', 'external_transfer'];
const ADMIN_ACTIONS = ['admin_fund', 'place_hold', 'release_hold', 'approve_deposit', 'approve_withdrawal'];

function genRef(prefix: string) {
  return prefix + '-' + Math.random().toString(36).slice(2, 14).toUpperCase();
}

router.post('/banking-ops', requireAuth, async (req: AuthedRequest, res) => {
  const isAdmin = req.userRole === 'admin';
  const body = req.body || {};
  const { action } = body;

  if (USER_ACTIONS.includes(action)) {
    if (!body.user_id || body.user_id !== req.userId) {
      return res.status(403).json({ error: 'Forbidden: not your account' });
    }
  } else if (ADMIN_ACTIONS.includes(action)) {
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden: admin only' });
  } else {
    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (action === 'internal_transfer') {
      const { from_account_id, to_account_id, amount, user_id } = body;
      if (!from_account_id || !to_account_id || !amount || !user_id) throw new Error('Missing fields');

      const fromRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [from_account_id]);
      const fromAcct = fromRes.rows[0];
      if (!fromAcct) throw new Error('Source account not found');
      if (Number(fromAcct.available_balance) < Number(amount)) throw new Error('Insufficient funds');
      if (!fromAcct.is_active) throw new Error('Account is inactive');

      const toRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [to_account_id]);
      const toAcct = toRes.rows[0];
      if (!toAcct) throw new Error('Destination account not found');

      await client.query(
        'UPDATE accounts SET balance = balance - $1, available_balance = available_balance - $1, updated_at = now() WHERE id = $2',
        [amount, from_account_id]
      );
      await client.query(
        'UPDATE accounts SET balance = balance + $1, available_balance = available_balance + $1, updated_at = now() WHERE id = $2',
        [amount, to_account_id]
      );

      const ref = genRef('TXN');
      await client.query(
        `INSERT INTO transactions (from_account_id, to_account_id, user_id, transaction_type, amount, status, reference_number, description)
         VALUES ($1,$2,$3,'transfer_out',$4,'completed',$5,'Internal transfer out'),
                ($1,$2,$3,'transfer_in',$4,'completed',$6,'Internal transfer in')`,
        [from_account_id, to_account_id, user_id, amount, ref + '-OUT', ref + '-IN']
      );

      await client.query('COMMIT');
      return res.json({ success: true });
    }

    if (action === 'external_transfer') {
      const { from_account_id, recipient_account_number, amount, user_id,
        bank_name, routing_number, swift_code, bank_address, transfer_purpose, memo } = body;
      if (!from_account_id || !recipient_account_number || !amount || !user_id) throw new Error('Missing fields');

      const fromRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [from_account_id]);
      const fromAcct = fromRes.rows[0];
      if (!fromAcct) throw new Error('Source account not found');
      if (!fromAcct.is_active) throw new Error('Your account is inactive');
      if (Number(fromAcct.available_balance) < Number(amount)) throw new Error('Insufficient funds');
      if (fromAcct.user_id !== user_id) throw new Error('Unauthorized');

      const toRes = await client.query('SELECT * FROM accounts WHERE account_number = $1', [String(recipient_account_number).trim()]);
      const toAcct = toRes.rows[0];

      const details: string[] = [`External transfer to ${recipient_account_number}`];
      if (bank_name) details.push(`Bank: ${bank_name}`);
      if (routing_number) details.push(`Routing: ${routing_number}`);
      if (swift_code) details.push(`SWIFT: ${swift_code}`);
      if (bank_address) details.push(`Address: ${bank_address}`);
      if (transfer_purpose) details.push(`Purpose: ${transfer_purpose}`);
      if (memo) details.push(`Memo: ${memo}`);
      const outDesc = details.join(' | ');

      if (toAcct) {
        if (!toAcct.is_active) throw new Error('Recipient account is inactive');
        if (toAcct.user_id === user_id) throw new Error('Cannot transfer to your own account via external transfer');
      }

      await client.query(
        'UPDATE accounts SET balance = balance - $1, available_balance = available_balance - $1, updated_at = now() WHERE id = $2',
        [amount, from_account_id]
      );

      const ref = genRef('TXN');

      if (toAcct) {
        const inDesc = `External transfer received from ${fromAcct.account_number}${memo ? ' | Memo: ' + memo : ''}`;
        await client.query(
          'UPDATE accounts SET balance = balance + $1, available_balance = available_balance + $1, updated_at = now() WHERE id = $2',
          [amount, toAcct.id]
        );
        await client.query(
          `INSERT INTO transactions (from_account_id, to_account_id, user_id, transaction_type, amount, status, reference_number, description)
           VALUES ($1,$2,$3,'transfer_out',$4,'completed',$5,$6),
                  ($1,$2,$7,'transfer_in',$4,'completed',$8,$9)`,
          [from_account_id, toAcct.id, user_id, amount, ref + '-OUT', outDesc, toAcct.user_id, ref + '-IN', inDesc]
        );
        await client.query('COMMIT');
        return res.json({ success: true, reference: ref + '-OUT' });
      } else {
        await client.query(
          `INSERT INTO transactions (from_account_id, user_id, transaction_type, amount, status, reference_number, description)
           VALUES ($1,$2,'transfer_out',$3,'completed',$4,$5)`,
          [from_account_id, user_id, amount, ref + '-OUT', outDesc]
        );
        await client.query('COMMIT');
        return res.json({ success: true, reference: ref + '-OUT' });
      }
    }

    if (action === 'admin_fund') {
      const { account_id, amount, user_id } = body;
      const admin_id = req.userId;
      if (!account_id || !amount || !user_id) throw new Error('Missing fields');

      const acctRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [account_id]);
      if (!acctRes.rows[0]) throw new Error('Account not found');

      await client.query(
        'UPDATE accounts SET balance = balance + $1, available_balance = available_balance + $1, updated_at = now() WHERE id = $2',
        [amount, account_id]
      );
      await client.query(
        `INSERT INTO transactions (to_account_id, user_id, transaction_type, amount, status, reference_number, performed_by_admin, description)
         VALUES ($1,$2,'admin_credit',$3,'completed',$4,$5,'Admin credit to account')`,
        [account_id, user_id, amount, genRef('ADM'), admin_id]
      );
      await client.query('COMMIT');
      return res.json({ success: true });
    }

    if (action === 'place_hold') {
      const { account_id, amount, reason, user_id } = body;
      const admin_id = req.userId;
      if (!account_id || !amount || !reason || !user_id) throw new Error('Missing fields');

      const acctRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [account_id]);
      const acct = acctRes.rows[0];
      if (!acct) throw new Error('Account not found');
      if (Number(acct.available_balance) < Number(amount)) throw new Error('Insufficient available balance to hold');

      await client.query(
        'UPDATE accounts SET available_balance = available_balance - $1, updated_at = now() WHERE id = $2',
        [amount, account_id]
      );
      await client.query(
        'INSERT INTO holds (account_id, user_id, amount, reason, placed_by_admin) VALUES ($1,$2,$3,$4,$5)',
        [account_id, user_id, amount, reason, admin_id]
      );
      await client.query(
        `INSERT INTO transactions (from_account_id, user_id, transaction_type, amount, status, reference_number, performed_by_admin, description)
         VALUES ($1,$2,'hold',$3,'held',$4,$5,$6)`,
        [account_id, user_id, amount, genRef('HLD'), admin_id, `Hold placed: ${reason}`]
      );
      await client.query('COMMIT');
      return res.json({ success: true });
    }

    if (action === 'release_hold') {
      const { hold_id, user_id } = body;
      const admin_id = req.userId;
      if (!hold_id) throw new Error('Missing fields');

      const holdRes = await client.query('SELECT * FROM holds WHERE id = $1 FOR UPDATE', [hold_id]);
      const hold = holdRes.rows[0];
      if (!hold) throw new Error('Hold not found');
      if (hold.is_released) throw new Error('Hold already released');

      await client.query(
        'UPDATE accounts SET available_balance = available_balance + $1, updated_at = now() WHERE id = $2',
        [hold.amount, hold.account_id]
      );
      await client.query(
        'UPDATE holds SET is_released = true, released_by_admin = $1, released_at = now() WHERE id = $2',
        [admin_id, hold_id]
      );
      const targetUserId = user_id || hold.user_id;
      await client.query(
        `INSERT INTO transactions (to_account_id, user_id, transaction_type, amount, status, reference_number, performed_by_admin, description)
         VALUES ($1,$2,'release',$3,'completed',$4,$5,'Hold released')`,
        [hold.account_id, targetUserId, hold.amount, genRef('RLS'), admin_id]
      );
      await client.query('COMMIT');
      return res.json({ success: true });
    }

    if (action === 'approve_deposit') {
      const { deposit_request_id, account_id, amount, user_id } = body;
      const admin_id = req.userId;
      if (!deposit_request_id || !account_id || !amount || !user_id) throw new Error('Missing fields');

      const acctRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [account_id]);
      if (!acctRes.rows[0]) throw new Error('Account not found');

      await client.query(
        'UPDATE accounts SET balance = balance + $1, available_balance = available_balance + $1, updated_at = now() WHERE id = $2',
        [amount, account_id]
      );
      await client.query(
        "UPDATE deposit_requests SET status = 'approved', reviewed_by = $1, updated_at = now() WHERE id = $2",
        [admin_id, deposit_request_id]
      );
      await client.query(
        `INSERT INTO transactions (to_account_id, user_id, transaction_type, amount, status, reference_number, performed_by_admin, description)
         VALUES ($1,$2,'deposit',$3,'completed',$4,$5,'Deposit approved')`,
        [account_id, user_id, amount, genRef('DEP'), admin_id]
      );
      await client.query('COMMIT');
      return res.json({ success: true });
    }

    if (action === 'approve_withdrawal') {
      const { withdrawal_request_id, account_id, amount, user_id } = body;
      const admin_id = req.userId;
      if (!withdrawal_request_id || !account_id || !amount || !user_id) throw new Error('Missing fields');

      const acctRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [account_id]);
      const acct = acctRes.rows[0];
      if (!acct) throw new Error('Account not found');
      if (Number(acct.available_balance) < Number(amount)) throw new Error('Insufficient funds for withdrawal');

      await client.query(
        'UPDATE accounts SET balance = balance - $1, available_balance = available_balance - $1, updated_at = now() WHERE id = $2',
        [amount, account_id]
      );
      await client.query(
        "UPDATE withdrawal_requests SET status = 'approved', reviewed_by = $1, updated_at = now() WHERE id = $2",
        [admin_id, withdrawal_request_id]
      );
      await client.query(
        `INSERT INTO transactions (from_account_id, user_id, transaction_type, amount, status, reference_number, performed_by_admin, description)
         VALUES ($1,$2,'withdrawal',$3,'completed',$4,$5,'Withdrawal approved')`,
        [account_id, user_id, amount, genRef('WDR'), admin_id]
      );
      await client.query('COMMIT');
      return res.json({ success: true });
    }

    await client.query('ROLLBACK');
    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(400).json({ error: message });
  } finally {
    client.release();
  }
});

export default router;
