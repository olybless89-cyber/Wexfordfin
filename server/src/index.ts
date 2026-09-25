import express from 'express';
import cors from 'cors';
import { runMigrations } from './migrate.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import bankingOpsRoutes from './routes/banking-ops.js';
import adminUsersRoutes from './routes/admin-users.js';
import mailRoutes from './routes/mail.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use('/api', authRoutes);
app.use('/api', dataRoutes);
app.use('/api', bankingOpsRoutes);
app.use('/api', adminUsersRoutes);
app.use('/api', mailRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT) || 8080;

runMigrations()
  .catch((err) => {
    console.error('Migration failed — continuing anyway', err);
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`Wexfordfin API listening on port ${port}`);
    });
  });
