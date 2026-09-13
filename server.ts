import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import type { Lead, Batch, OverallStats, AgentPerformance, LeadStatus } from './src/types.js';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Normalize Vercel serverless request URLs if stripped by routing
app.use((req, res, next) => {
  if (req.url && !req.url.startsWith('/api') && (
    req.url.startsWith('/auth') ||
    req.url.startsWith('/leads') ||
    req.url.startsWith('/batches') ||
    req.url.startsWith('/stats') ||
    req.url.startsWith('/agents') ||
    req.url.startsWith('/health') ||
    req.url.startsWith('/clear-history') ||
    req.url.startsWith('/reset')
  )) {
    req.url = '/api' + req.url;
  }
  next();
});

// Persistence directory (uses /tmp on Vercel serverless due to read-only root)
const isVercel = Boolean(process.env.VERCEL);
const DATA_DIR = isVercel ? path.join('/tmp', 'data') : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'leads_db.json');

export interface StoredUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
}

interface DatabaseSchema {
  leads: Lead[];
  batches: Batch[];
  users: StoredUser[];
}

const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

const defaultUsers: StoredUser[] = [
  {
    id: 'user-admin-root',
    username: 'admin',
    password: adminPassword,
    name: 'System Admin',
    role: 'admin',
    createdAt: new Date().toISOString(),
  },
];

// Initial customer-ready batch and leads with 0 call history
const defaultBatches: Batch[] = [
  {
    id: 'batch-campaign-1',
    name: 'Customer Outreach Campaign',
    fileName: 'WhatsApp_Outreach_Contacts.xlsx',
    totalLeads: 5,
    createdAt: new Date().toISOString(),
    uploadedBy: 'System Admin',
    stats: {
      pending: 5,
      answered: 0,
      not_answered: 0,
      interested: 0,
      callback: 0,
      wrong_number: 0,
      withScreenshot: 0,
    },
  },
];

const defaultLeads: Lead[] = [
  {
    id: 'lead-1',
    batchId: 'batch-campaign-1',
    batchName: 'Customer Outreach Campaign',
    phoneNumber: '+1 (555) 234-5678',
    customerName: 'Johnathan Davis',
    category: 'Product Demo Inquiry',
    notes: '',
    status: 'pending',
    callAttempts: 0,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'lead-2',
    batchId: 'batch-campaign-1',
    batchName: 'Customer Outreach Campaign',
    phoneNumber: '+1 (555) 345-6789',
    customerName: 'Robert Martinez',
    category: 'Customer Support',
    notes: '',
    status: 'pending',
    callAttempts: 0,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'lead-3',
    batchId: 'batch-campaign-1',
    batchName: 'Customer Outreach Campaign',
    phoneNumber: '+1 (555) 456-7890',
    customerName: 'Emily Clark',
    category: 'VIP Membership',
    notes: '',
    status: 'pending',
    callAttempts: 0,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'lead-4',
    batchId: 'batch-campaign-1',
    batchName: 'Customer Outreach Campaign',
    phoneNumber: '+1 (555) 567-8901',
    customerName: 'David Kim',
    category: 'Service Contract',
    notes: '',
    status: 'pending',
    callAttempts: 0,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'lead-5',
    batchId: 'batch-campaign-1',
    batchName: 'Customer Outreach Campaign',
    phoneNumber: '+1 (555) 678-9012',
    customerName: 'Sophia Lin',
    category: 'Consultation Booking',
    notes: '',
    status: 'pending',
    callAttempts: 0,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let db: DatabaseSchema = {
  batches: defaultBatches,
  leads: defaultLeads,
  users: defaultUsers,
};

// Ensure data dir exists and load persistence
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.leads) && Array.isArray(parsed.batches)) {
      // Clean out sample users, keeping only admin and registered users
      const sampleNames = ['sarah', 'alex', 'lisa', 'mark'];
      if (Array.isArray(parsed.users)) {
        parsed.users = parsed.users.filter(
          (u: any) => !sampleNames.includes(String(u.username || '').toLowerCase())
        );
      } else {
        parsed.users = [];
      }

      // Ensure system admin account is present
      const hasAdmin = parsed.users.some(
        (u: any) => String(u.username || '').toLowerCase() === 'admin'
      );
      if (!hasAdmin) {
        parsed.users.unshift(defaultUsers[0]);
      } else {
        const adm = parsed.users.find(
          (u: any) => String(u.username || '').toLowerCase() === 'admin'
        );
        if (adm) {
          if (process.env.ADMIN_PASSWORD) {
            adm.password = process.env.ADMIN_PASSWORD;
          } else if (!adm.password) {
            adm.password = 'admin123';
          }
          adm.role = 'admin';
        }
      }

      db = parsed;
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    }
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  }
} catch (e) {
  console.error('Failed reading initial DB file, using clean defaults:', e);
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed saving DB file:', e);
  }
}

// SSE Clients for instant real-time pushes
type SSEClient = { id: string; res: express.Response };
let sseClients: SSEClient[] = [];

function broadcastChange(event: string, payload: any) {
  const data = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  sseClients.forEach((client) => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch {
      // client disconnected
    }
  });
}

function recalculateBatchStats(batchId: string) {
  const batch = db.batches.find((b) => b.id === batchId);
  if (!batch) return;
  const batchLeads = db.leads.filter((l) => l.batchId === batchId);
  batch.totalLeads = batchLeads.length;
  batch.stats = {
    pending: batchLeads.filter((l) => l.status === 'pending').length,
    answered: batchLeads.filter((l) => l.status === 'answered').length,
    not_answered: batchLeads.filter((l) => l.status === 'not_answered').length,
    interested: batchLeads.filter((l) => l.status === 'interested' || (l.status as string) === 'will_pay').length,
    callback: batchLeads.filter((l) => l.status === 'callback').length,
    wrong_number: batchLeads.filter((l) => l.status === 'wrong_number').length,
    withScreenshot: batchLeads.filter((l) => !!l.screenshotUrl).length,
  };
}

function computeOverallStats(): OverallStats {
  const totalLeads = db.leads.length;
  const pending = db.leads.filter((l) => l.status === 'pending').length;
  const answered = db.leads.filter((l) => l.status === 'answered').length;
  const notAnswered = db.leads.filter((l) => l.status === 'not_answered').length;
  const interested = db.leads.filter((l) => l.status === 'interested' || (l.status as string) === 'will_pay').length;
  const callback = db.leads.filter((l) => l.status === 'callback').length;
  const wrongNumber = db.leads.filter((l) => l.status === 'wrong_number').length;
  const screenshotsUploaded = db.leads.filter((l) => !!l.screenshotUrl).length;
  const completionRate = totalLeads > 0 ? Math.round(((totalLeads - pending) / totalLeads) * 100) : 0;

  return {
    totalLeads,
    pending,
    answered,
    notAnswered,
    interested,
    callback,
    wrongNumber,
    screenshotsUploaded,
    completionRate,
  };
}

function computeAgentPerformance(): AgentPerformance[] {
  const agentMap: Record<string, AgentPerformance> = {};

  // Pre-populate with all registered call agents
  if (db.users && Array.isArray(db.users)) {
    db.users
      .filter((u) => u.role === 'user')
      .forEach((u) => {
        agentMap[u.name] = {
          agentName: u.name,
          totalCalls: 0,
          answered: 0,
          notAnswered: 0,
          interested: 0,
          callback: 0,
          wrongNumber: 0,
          screenshotsUploaded: 0,
          lastActive: '',
        };
      });
  }

  // Check assigned agents on leads
  db.leads.forEach((lead) => {
    if (lead.assignedAgent && !agentMap[lead.assignedAgent]) {
      agentMap[lead.assignedAgent] = {
        agentName: lead.assignedAgent,
        totalCalls: 0,
        answered: 0,
        notAnswered: 0,
        interested: 0,
        callback: 0,
        wrongNumber: 0,
        screenshotsUploaded: 0,
        lastActive: '',
      };
    }
  });

  // Aggregate call actions from lead history
  db.leads.forEach((lead) => {
    lead.history.forEach((hist) => {
      const name = hist.agentName || 'Unassigned';
      if (!agentMap[name]) {
        agentMap[name] = {
          agentName: name,
          totalCalls: 0,
          answered: 0,
          notAnswered: 0,
          interested: 0,
          callback: 0,
          wrongNumber: 0,
          screenshotsUploaded: 0,
          lastActive: hist.timestamp,
        };
      }
      const p = agentMap[name];
      p.totalCalls += 1;
      if (hist.status === 'answered') p.answered += 1;
      if (hist.status === 'not_answered') p.notAnswered += 1;
      if (hist.status === 'interested' || (hist.status as string) === 'will_pay') {
        p.interested += 1;
      }
      if (hist.status === 'callback') p.callback += 1;
      if (hist.status === 'wrong_number') p.wrongNumber += 1;
      if (hist.screenshotUrl) p.screenshotsUploaded += 1;
      if (!p.lastActive || new Date(hist.timestamp) > new Date(p.lastActive)) {
        p.lastActive = hist.timestamp;
      }
    });

    // Fallback if lead status changed directly
    if (lead.status !== 'pending' && (!lead.history || lead.history.length === 0) && (lead.agentName || lead.assignedAgent)) {
      const name = lead.agentName || lead.assignedAgent || 'Agent';
      if (!agentMap[name]) {
        agentMap[name] = {
          agentName: name,
          totalCalls: 0,
          answered: 0,
          notAnswered: 0,
          interested: 0,
          callback: 0,
          wrongNumber: 0,
          screenshotsUploaded: 0,
          lastActive: lead.updatedAt,
        };
      }
      const p = agentMap[name];
      p.totalCalls += 1;
      if (lead.status === 'answered') p.answered += 1;
      if (lead.status === 'not_answered') p.notAnswered += 1;
      if (lead.status === 'interested' || (lead.status as string) === 'will_pay') p.interested += 1;
      if (lead.status === 'callback') p.callback += 1;
      if (lead.status === 'wrong_number') p.wrongNumber += 1;
      if (lead.screenshotUrl) p.screenshotsUploaded += 1;
      if (!p.lastActive || new Date(lead.updatedAt) > new Date(p.lastActive)) {
        p.lastActive = lead.updatedAt;
      }
    }
  });

  return Object.values(agentMap).sort((a, b) => b.totalCalls - a.totalCalls);
}

// ----------------- API ROUTES ----------------- //

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Authentication: Login (Admin or User/Agent)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const cleanUsername = String(username).trim().toLowerCase();
  const user = db.users.find(
    (u) => u.username.toLowerCase() === cleanUsername || (u.name && u.name.toLowerCase() === cleanUsername)
  );

  if (!user || user.password !== password) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const { password: _, ...safeUser } = user;
  res.json({
    success: true,
    user: safeUser,
    token: `token-${user.id}-${Date.now()}`,
    message: `Logged in successfully as ${safeUser.name} (${safeUser.role.toUpperCase()})`,
  });
});

// Authentication: Register New User / Agent (Strictly creates 'user' role)
app.post('/api/auth/register', (req, res) => {
  const { name, username, password } = req.body;
  const cleanName = String(name || '').trim();
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanPassword = String(password || '').trim();

  if (!cleanName || cleanName.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters' });
    return;
  }
  if (!cleanUsername || cleanUsername.length < 3) {
    res.status(400).json({ error: 'Username must be at least 3 characters' });
    return;
  }
  if (!cleanPassword || cleanPassword.length < 4) {
    res.status(400).json({ error: 'Password must be at least 4 characters' });
    return;
  }

  // Prevent duplicate usernames
  const existing = db.users.find((u) => u.username.toLowerCase() === cleanUsername);
  if (existing) {
    res.status(400).json({
      error: `Username "${cleanUsername}" is already taken. Please choose another username or sign in.`,
    });
    return;
  }

  // Self-registered accounts are always 'user' role (Call Center Agents)
  // Per requirement: "user register user cant uplaod excels admin only can"
  const newUser: StoredUser = {
    id: `user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    username: cleanUsername,
    password: cleanPassword,
    name: cleanName,
    role: 'user', // strictly call center user/agent
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  saveDb();

  const { password: _, ...safeUser } = newUser;
  broadcastChange('user_registered', { user: safeUser });

  res.json({
    success: true,
    user: safeUser,
    token: `token-${newUser.id}-${Date.now()}`,
    message: `Account created! Logged in as Call Center Agent: ${safeUser.name}`,
  });
});

// Authentication: List Registered Users (no passwords)
app.get('/api/auth/users', (req, res) => {
  const safeUsers = db.users.map(({ password, ...rest }) => rest);
  res.json({ users: safeUsers });
});

// Authentication: Current active user profile check
app.get('/api/auth/me', (req, res) => {
  const safeUsers = db.users.map(({ password, ...rest }) => rest);
  res.json({ users: safeUsers });
});

// Authentication: Change Password
app.post('/api/auth/change-password', (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanCurrentPassword = String(currentPassword || '').trim();
  const cleanNewPassword = String(newPassword || '').trim();

  if (!cleanUsername || !cleanCurrentPassword || !cleanNewPassword) {
    res.status(400).json({ error: 'Username, current password, and new password are required' });
    return;
  }

  if (cleanNewPassword.length < 4) {
    res.status(400).json({ error: 'New password must be at least 4 characters long' });
    return;
  }

  const user = db.users.find(
    (u) => u.username.toLowerCase() === cleanUsername
  );

  if (!user || user.password !== cleanCurrentPassword) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  user.password = cleanNewPassword;
  saveDb();

  res.json({
    success: true,
    message: 'Password updated successfully! Please use your new password next time you sign in.',
  });
});

// Admin User Management: List registered users with counts
app.get('/api/admin/users', (req, res) => {
  const userRole = (req.headers['x-user-role'] || req.query.userRole || '').toString().toLowerCase();
  if (userRole !== 'admin') {
    res.status(403).json({ error: 'Access denied: Admin role required' });
    return;
  }

  // Return user accounts with credentials to admin for management and multi-device sync
  const safeUsers = db.users.map((u) => ({ ...u }));
  const totalCount = safeUsers.length;
  const adminCount = safeUsers.filter((u) => u.role === 'admin').length;
  const agentCount = safeUsers.filter((u) => u.role === 'user').length;

  res.json({
    users: safeUsers,
    counts: {
      total: totalCount,
      admin: adminCount,
      agent: agentCount,
    },
  });
});

// Admin User Management: Edit user name, username, or reset password
app.patch('/api/admin/users/:id', (req, res) => {
  const userRole = (req.headers['x-user-role'] || req.body.userRole || '').toString().toLowerCase();
  if (userRole !== 'admin') {
    res.status(403).json({ error: 'Access denied: Admin role required' });
    return;
  }

  const { id } = req.params;
  const { name, username, newPassword } = req.body;

  const targetIndex = db.users.findIndex((u) => u.id === id);
  if (targetIndex === -1) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const target = db.users[targetIndex];

  if (username) {
    const cleanUsername = String(username).trim().toLowerCase();
    if (cleanUsername.length < 3) {
      res.status(400).json({ error: 'Username must be at least 3 characters' });
      return;
    }
    const duplicate = db.users.find((u) => u.id !== id && u.username.toLowerCase() === cleanUsername);
    if (duplicate) {
      res.status(400).json({ error: `Username "${cleanUsername}" is already in use by another user` });
      return;
    }
    target.username = cleanUsername;
  }

  if (name) {
    const cleanName = String(name).trim();
    if (cleanName.length < 2) {
      res.status(400).json({ error: 'Name must be at least 2 characters' });
      return;
    }
    const oldName = target.name;
    target.name = cleanName;

    // Sync agent name on assigned leads and call histories if name changed
    if (oldName !== cleanName) {
      db.leads.forEach((lead) => {
        if (lead.assignedAgent === oldName) lead.assignedAgent = cleanName;
        if (lead.agentName === oldName) lead.agentName = cleanName;
        lead.history.forEach((h) => {
          if (h.agentName === oldName) h.agentName = cleanName;
        });
      });
    }
  }

  if (newPassword && String(newPassword).trim().length >= 4) {
    target.password = String(newPassword).trim();
  }

  saveDb();

  const userWithCredentials = { ...target };
  const { password: _, ...safeUser } = target;
  broadcastChange('user_updated', { user: safeUser });

  res.json({
    success: true,
    user: userWithCredentials,
    message: `User ${safeUser.name} updated successfully.`,
  });
});

// Admin User Management: Delete user (Strictly prevents deleting system admin)
app.delete('/api/admin/users/:id', (req, res) => {
  const userRole = (req.headers['x-user-role'] || req.query.userRole || '').toString().toLowerCase();
  if (userRole !== 'admin') {
    res.status(403).json({ error: 'Access denied: Admin role required' });
    return;
  }

  const { id } = req.params;
  const target = db.users.find((u) => u.id === id);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (target.role === 'admin' || target.username.toLowerCase() === 'admin') {
    res.status(400).json({ error: 'Cannot delete the system Administrator account' });
    return;
  }

  db.users = db.users.filter((u) => u.id !== id);
  saveDb();

  broadcastChange('user_deleted', { userId: id, username: target.username, name: target.name });

  res.json({
    success: true,
    message: `User "${target.name}" (${target.username}) has been deleted successfully.`,
  });
});

// SSE Stream for live updates
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Math.random().toString(36).substring(7);
  const client: SSEClient = { id: clientId, res };
  sseClients.push(client);

  // Send initial ping
  res.write(`data: ${JSON.stringify({ event: 'connected', clientId })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
});

// Get Leads with filtering
app.get('/api/leads', (req, res) => {
  const { batchId, status, agent, search } = req.query;
  let result = [...db.leads];

  if (batchId && typeof batchId === 'string' && batchId !== 'all') {
    result = result.filter((l) => l.batchId === batchId);
  }
  if (status && typeof status === 'string' && status !== 'all') {
    result = result.filter((l) => l.status === status);
  }
  if (agent && typeof agent === 'string' && agent !== 'all') {
    result = result.filter((l) => l.assignedAgent === agent || l.agentName === agent);
  }
  if (search && typeof search === 'string') {
    const q = search.toLowerCase().trim();
    result = result.filter(
      (l) =>
        l.customerName.toLowerCase().includes(q) ||
        l.phoneNumber.toLowerCase().includes(q) ||
        (l.notes && l.notes.toLowerCase().includes(q))
    );
  }

  // Sort: pending first or by updatedAt desc
  result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  res.json({ leads: result, total: result.length });
});

// Get batches
app.get('/api/batches', (req, res) => {
  db.batches.forEach((b) => recalculateBatchStats(b.id));
  res.json({ batches: db.batches });
});

// Get Stats
app.get('/api/stats', (req, res) => {
  db.batches.forEach((b) => recalculateBatchStats(b.id));
  const overall = computeOverallStats();
  const agents = computeAgentPerformance();
  res.json({ overall, agents });
});

// Batch Import from Excel / CSV (Admin Only)
app.post('/api/leads/batch-import', (req, res) => {
  const userRole = (req.headers['x-user-role'] || req.body.userRole || '').toString().toLowerCase();

  // Strict enforcement: Only admin can upload Excel files
  if (userRole !== 'admin') {
    res.status(403).json({
      error: 'Access Denied: Only administrators can upload Excel sheets. Registered users/call agents are not authorized to upload files.',
    });
    return;
  }

  const { batchName, fileName, leads, uploadedBy = 'Admin' } = req.body;

  if (!Array.isArray(leads) || leads.length === 0) {
    res.status(400).json({ error: 'No leads provided for import' });
    return;
  }

  const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const now = new Date().toISOString();

  const formattedLeads: Lead[] = leads.map((item: any, idx: number) => ({
    id: `lead-${Date.now()}-${idx}-${Math.random().toString(36).substring(7)}`,
    batchId,
    batchName: batchName || `Batch ${new Date().toLocaleDateString()}`,
    phoneNumber: String(item.phoneNumber || item.phone || item.mobile || item.number || '').trim(),
    customerName: String(item.customerName || item.name || item.contact || `Lead #${idx + 1}`).trim(),
    category: String(item.category || item.topic || item.service || item.purpose || item.notes || '').trim(),
    notes: item.notes || item.remarks || '',
    customFields: item.customFields || {},
    status: 'pending' as LeadStatus,
    assignedAgent: item.assignedAgent || '',
    callAttempts: 0,
    history: [],
    createdAt: now,
    updatedAt: now,
  }));

  const newBatch: Batch = {
    id: batchId,
    name: batchName || `Batch ${new Date().toLocaleDateString()}`,
    fileName: fileName || 'Imported_Leads.xlsx',
    totalLeads: formattedLeads.length,
    createdAt: now,
    uploadedBy,
    stats: {
      pending: formattedLeads.length,
      answered: 0,
      not_answered: 0,
      interested: 0,
      callback: 0,
      wrong_number: 0,
      withScreenshot: 0,
    },
  };

  db.batches.unshift(newBatch);
  db.leads.unshift(...formattedLeads);
  saveDb();

  broadcastChange('batch_imported', { batch: newBatch, count: formattedLeads.length });

  res.json({
    success: true,
    batch: newBatch,
    leads: formattedLeads,
    leadsCount: formattedLeads.length,
  });
});

// Two-Way Sync / Auto-Restore from Client Persistent Vault (handles container restarts)
app.post('/api/sync-restore', (req, res) => {
  const { batches, leads, users } = req.body;
  let changed = false;

  if (Array.isArray(batches) && batches.length > 0) {
    batches.forEach((b: any) => {
      if (!b.id) return;
      const existingIdx = db.batches.findIndex((eb) => eb.id === b.id);
      if (existingIdx === -1) {
        db.batches.unshift(b);
        changed = true;
      } else {
        // preserve stats if incoming has more info
        db.batches[existingIdx] = { ...db.batches[existingIdx], ...b };
      }
    });
  }

  if (Array.isArray(leads) && leads.length > 0) {
    leads.forEach((l: any) => {
      if (!l.id) return;
      const existingIdx = db.leads.findIndex((el) => el.id === l.id);
      if (existingIdx === -1) {
        db.leads.push(l);
        changed = true;
      } else {
        // merge call history and status if incoming lead has more call attempts or answered status
        const existing = db.leads[existingIdx];
        const existingCalls = existing.history ? existing.history.length : 0;
        const incomingCalls = l.history ? l.history.length : 0;
        if (incomingCalls >= existingCalls && (l.status !== 'pending' || existing.status === 'pending')) {
          db.leads[existingIdx] = { ...existing, ...l };
          changed = true;
        }
      }
    });
  }

  if (Array.isArray(users) && users.length > 0) {
    users.forEach((u: any) => {
      if (!u.id || !u.username) return;
      const existingIdx = db.users.findIndex((eu) => eu.id === u.id || eu.username.toLowerCase() === u.username.toLowerCase());
      if (existingIdx === -1) {
        db.users.push(u);
        changed = true;
      }
    });
  }

  if (changed) {
    db.batches.forEach((b) => recalculateBatchStats(b.id));
    saveDb();
    broadcastChange('data_synced', {
      batchesCount: db.batches.length,
      leadsCount: db.leads.length,
    });
  }

  res.json({
    success: true,
    batches: db.batches,
    leadsCount: db.leads.length,
    usersCount: db.users.length,
    restored: changed,
  });
});

// Full Database Backup Export
app.get('/api/database/backup', (req, res) => {
  db.batches.forEach((b) => recalculateBatchStats(b.id));
  const safeUsers = db.users.map(({ password: _, ...u }) => u);
  res.setHeader('Content-Disposition', `attachment; filename=call_center_backup_${new Date().toISOString().split('T')[0]}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.json({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    batches: db.batches,
    leads: db.leads,
    users: safeUsers,
  });
});

// Full Database Backup Restore (Admin Only)
app.post('/api/database/restore', (req, res) => {
  const userRole = (req.headers['x-user-role'] || req.body.userRole || '').toString().toLowerCase();
  if (userRole !== 'admin') {
    res.status(403).json({ error: 'Access Denied: Only administrators can restore database backups.' });
    return;
  }

  const { batches, leads } = req.body;
  if (!Array.isArray(batches) || !Array.isArray(leads)) {
    res.status(400).json({ error: 'Invalid backup file structure: batches and leads arrays are required.' });
    return;
  }

  db.batches = batches;
  db.leads = leads;
  db.batches.forEach((b) => recalculateBatchStats(b.id));
  saveDb();
  broadcastChange('data_synced', { batchesCount: db.batches.length, leadsCount: db.leads.length });

  res.json({
    success: true,
    message: `Database restored successfully! Loaded ${batches.length} batch(es) and ${leads.length} lead(s).`,
    batches: db.batches,
    leadsCount: db.leads.length,
  });
});

// Update Lead Status, Notes, and Call details
app.patch('/api/leads/:id/call-update', (req, res) => {
  const { id } = req.params;
  const {
    status,
    agentName = 'Agent',
    notes = '',
    screenshotUrl,
    callDurationSeconds = 0,
    followUpDate,
    callType = 'whatsapp_call',
  } = req.body;

  const leadIndex = db.leads.findIndex((l) => l.id === id);
  if (leadIndex === -1) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }

  const lead = db.leads[leadIndex];
  const now = new Date().toISOString();

  lead.status = status;
  lead.agentName = agentName;
  lead.callAttempts += 1;
  lead.lastCallTimestamp = now;
  lead.updatedAt = now;

  if (notes) {
    lead.notes = notes;
  }
  if (callDurationSeconds) {
    lead.callDurationSeconds = callDurationSeconds;
  }
  if (screenshotUrl) {
    lead.screenshotUrl = screenshotUrl;
    lead.screenshotTimestamp = now;
  }
  if (followUpDate) {
    lead.followUpDate = followUpDate;
  }

  // Create history log entry
  const historyEntry: Lead['history'][0] = {
    id: `hist-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    timestamp: now,
    agentName,
    status,
    notes,
    screenshotUrl: screenshotUrl || undefined,
    callDurationSeconds: callDurationSeconds || undefined,
    followUpDate: followUpDate || undefined,
    callType: callType || 'whatsapp_call',
  };

  lead.history.unshift(historyEntry);

  recalculateBatchStats(lead.batchId);
  saveDb();

  broadcastChange('lead_updated', { lead });

  res.json({ success: true, lead });
});

// Upload or update screenshot for a lead
app.post('/api/leads/:id/screenshot', (req, res) => {
  const { id } = req.params;
  const { screenshotUrl, agentName = 'Agent' } = req.body;

  if (!screenshotUrl) {
    res.status(400).json({ error: 'Missing screenshot image data' });
    return;
  }

  const lead = db.leads.find((l) => l.id === id);
  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }

  const now = new Date().toISOString();
  lead.screenshotUrl = screenshotUrl;
  lead.screenshotTimestamp = now;
  lead.updatedAt = now;

  // Add history event for screenshot verification
  lead.history.unshift({
    id: `hist-${Date.now()}`,
    timestamp: now,
    agentName,
    status: lead.status,
    notes: 'Uploaded call screenshot proof',
    screenshotUrl,
  });

  recalculateBatchStats(lead.batchId);
  saveDb();

  broadcastChange('screenshot_uploaded', { leadId: id, screenshotUrl });

  res.json({ success: true, lead });
});

// Update Lead Details (Admin or Agent)
app.patch('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  const leadIndex = db.leads.findIndex((l) => l.id === id);
  if (leadIndex === -1) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }

  const lead = db.leads[leadIndex];
  const { customerName, phoneNumber, category, notes, assignedAgent, status } = req.body;

  if (customerName) lead.customerName = String(customerName).trim();
  if (phoneNumber) lead.phoneNumber = String(phoneNumber).trim();
  if (category !== undefined) lead.category = String(category).trim();
  if (notes !== undefined) lead.notes = String(notes);
  if (assignedAgent !== undefined) lead.assignedAgent = String(assignedAgent);
  if (status) lead.status = status;
  lead.updatedAt = new Date().toISOString();

  recalculateBatchStats(lead.batchId);
  saveDb();
  broadcastChange('lead_updated', { lead });

  res.json({ success: true, lead });
});

// Delete Batch (Admin Only)
app.delete('/api/batches/:id', (req, res) => {
  const userRole = (req.headers['x-user-role'] || req.query.role || '').toString().toLowerCase();
  if (userRole !== 'admin') {
    res.status(403).json({
      error: 'Access Denied: Only administrators can delete batches.',
    });
    return;
  }

  const { id } = req.params;
  db.batches = db.batches.filter((b) => b.id !== id);
  db.leads = db.leads.filter((l) => l.batchId !== id);
  saveDb();

  broadcastChange('batch_deleted', { batchId: id });
  res.json({ success: true, message: `Batch ${id} and all associated leads deleted.` });
});

// Delete Call Log Entry or Reset Contact History (Admin Only)
app.delete('/api/leads/:id/call-log/:logId?', (req, res) => {
  const userRole = (req.headers['x-user-role'] || req.query.role || '').toString().toLowerCase();
  if (userRole !== 'admin') {
    res.status(403).json({
      error: 'Access Denied: Only administrators can delete call logs.',
    });
    return;
  }

  const { id, logId } = req.params;
  const leadIndex = db.leads.findIndex((l) => l.id === id);
  if (leadIndex === -1) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }

  const lead = db.leads[leadIndex];
  const now = new Date().toISOString();

  if (!logId || logId === 'all') {
    lead.history = [];
    lead.status = 'pending';
    lead.callAttempts = 0;
    lead.notes = '';
    delete lead.lastCallTimestamp;
    delete lead.callDurationSeconds;
    delete lead.screenshotUrl;
    delete lead.screenshotTimestamp;
    delete lead.followUpDate;
    delete lead.agentName;
    lead.updatedAt = now;
  } else {
    lead.history = (lead.history || []).filter((h) => h.id !== logId);
    lead.callAttempts = Math.max(0, lead.history.length);
    if (lead.history.length === 0) {
      lead.status = 'pending';
      lead.notes = '';
      delete lead.lastCallTimestamp;
      delete lead.callDurationSeconds;
      delete lead.screenshotUrl;
      delete lead.screenshotTimestamp;
      delete lead.followUpDate;
      delete lead.agentName;
    } else {
      const latest = lead.history[0];
      lead.status = latest.status;
      lead.notes = latest.notes || '';
      lead.lastCallTimestamp = latest.timestamp;
      lead.callDurationSeconds = latest.callDurationSeconds;
      lead.screenshotUrl = latest.screenshotUrl;
      lead.followUpDate = latest.followUpDate;
      lead.agentName = latest.agentName;
    }
    lead.updatedAt = now;
  }

  recalculateBatchStats(lead.batchId);
  saveDb();
  broadcastChange('lead_updated', { lead });
  res.json({ success: true, lead });
});

// Clear All Call History & Reset Queue to Clean State (Admin Only)
app.post('/api/admin/clear-all-call-history', (req, res) => {
  const userRole = (req.headers['x-user-role'] || req.body.userRole || '').toString().toLowerCase();
  if (userRole !== 'admin') {
    res.status(403).json({
      error: 'Access Denied: Only administrators can clear call history.',
    });
    return;
  }

  db.leads.forEach((l) => {
    l.status = 'pending';
    l.callAttempts = 0;
    l.history = [];
    l.notes = '';
    delete l.lastCallTimestamp;
    delete l.callDurationSeconds;
    delete l.screenshotUrl;
    delete l.screenshotTimestamp;
    delete l.followUpDate;
    delete l.agentName;
  });

  db.batches.forEach((b) => {
    b.stats = {
      pending: b.totalLeads,
      answered: 0,
      not_answered: 0,
      interested: 0,
      callback: 0,
      wrong_number: 0,
      withScreenshot: 0,
    };
  });

  saveDb();
  broadcastChange('call_history_cleared', { timestamp: new Date().toISOString() });
  res.json({
    success: true,
    message: 'All call history and agent logs cleared. All leads are reset to pending with 0 calls.',
  });
});

// Reset demo leads
app.post('/api/reset-demo', (req, res) => {
  db = {
    batches: [...defaultBatches],
    leads: [...defaultLeads],
    users: db.users && db.users.length > 0 ? db.users : [...defaultUsers],
  };
  saveDb();
  broadcastChange('data_reset', {});
  res.json({ success: true, message: 'Reset to demo leads successfully' });
});

// Vite Middleware for SPA Frontend
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

// In local or traditional container environments, start server immediately.
// In Vercel serverless runtime, Vercel mounts the exported app.
if (!process.env.VERCEL) {
  startServer();
}

export default app;
export { app };
