/**
 * Community module — create/join study communities, propose standards, majority vote.
 *
 * Rules:
 * - A community has an invite_code; members join via it.
 * - Any member can propose a study standard (target daily minutes).
 * - A proposal passes when >50% of members vote "for" (majority).
 * - Proposals expire after 7 days; expired proposals with majority are auto-passed.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

function now() { return new Date().toISOString(); }
function randomInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars
}

// ---- Create community ----
router.post('/', async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    let code;
    // Ensure unique invite code
    for (let i = 0; i < 5; i++) {
      code = randomInviteCode();
      const exists = await db.get('SELECT id FROM communities WHERE invite_code = ?', [code]);
      if (!exists) break;
    }
    const result = await db.run(
      'INSERT INTO communities (name, description, created_by, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
      [name, description || '', req.user.id, code, now()]
    );
    const communityId = result.lastInsertRowid;
    await db.run(
      'INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [communityId, req.user.id, 'owner', now()]
    );
    res.json({ id: communityId, name, description, invite_code: code, role: 'owner' });
  } catch (e) {
    console.error('Create community error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Join community by invite code ----
router.post('/join', async (req, res) => {
  const { invite_code } = req.body || {};
  if (!invite_code) return res.status(400).json({ error: 'Invite code required' });
  try {
    const community = await db.get('SELECT * FROM communities WHERE invite_code = ?', [invite_code.trim()]);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const member = await db.get(
      'SELECT * FROM community_members WHERE community_id = ? AND user_id = ?',
      [community.id, req.user.id]
    );
    if (member) return res.status(409).json({ error: 'Already a member' });

    await db.run(
      'INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [community.id, req.user.id, 'member', now()]
    );
    res.json({ id: community.id, name: community.name, role: 'member' });
  } catch (e) {
    console.error('Join community error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- List my communities ----
router.get('/', async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT c.id, c.name, c.description, c.invite_code, c.created_at, cm.role,
              (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) AS member_count
       FROM communities c
       JOIN community_members cm ON cm.community_id = c.id
       WHERE cm.user_id = ?
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    res.json({ communities: rows });
  } catch (e) {
    console.error('List communities error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Community detail + members ----
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const membership = await db.get(
      'SELECT * FROM community_members WHERE community_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (!membership) return res.status(403).json({ error: 'Not a member' });

    const community = await db.get('SELECT * FROM communities WHERE id = ?', [id]);
    const members = await db.query(
      `SELECT u.id, u.username, cm.role, cm.joined_at
       FROM community_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.community_id = ? ORDER BY cm.joined_at`,
      [id]
    );
    // Current active standard: latest passed proposal
    const standard = await db.get(
      `SELECT * FROM proposals WHERE community_id = ? AND status = 'passed' ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    res.json({ community, members, standard });
  } catch (e) {
    console.error('Community detail error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Create proposal ----
router.post('/:id/proposals', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, description, target_minutes } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title required' });
  try {
    const membership = await db.get(
      'SELECT * FROM community_members WHERE community_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (!membership) return res.status(403).json({ error: 'Not a member' });

    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await db.run(
      `INSERT INTO proposals (community_id, proposer_id, title, description, target_minutes, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [id, req.user.id, title, description || '', target_minutes || 0, now(), expires]
    );
    res.json({ id: result.lastInsertRowid, title, status: 'active', expires_at: expires });
  } catch (e) {
    console.error('Create proposal error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- List proposals for a community (with vote counts) ----
router.get('/:id/proposals', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const membership = await db.get(
      'SELECT * FROM community_members WHERE community_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (!membership) return res.status(403).json({ error: 'Not a member' });

    const memberCount = await db.get(
      'SELECT COUNT(*) AS c FROM community_members WHERE community_id = ?', [id]
    );
    const total = memberCount.c;

    const proposals = await db.query(
      `SELECT p.*, u.username AS proposer_name,
              (SELECT COUNT(*) FROM proposal_votes WHERE proposal_id = p.id AND vote = 1) AS votes_for,
              (SELECT COUNT(*) FROM proposal_votes WHERE proposal_id = p.id AND vote = 0) AS votes_against,
              (SELECT vote FROM proposal_votes WHERE proposal_id = p.id AND user_id = ?) AS my_vote
       FROM proposals p JOIN users u ON u.id = p.proposer_id
       WHERE p.community_id = ? ORDER BY p.created_at DESC`,
      [req.user.id, id]
    );
    res.json({ proposals, total_members: total });
  } catch (e) {
    console.error('List proposals error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Vote on a proposal ----
router.post('/proposals/:proposalId/vote', async (req, res) => {
  const proposalId = parseInt(req.params.proposalId, 10);
  const { vote } = req.body || {};
  const voteVal = vote ? 1 : 0;
  try {
    const proposal = await db.get('SELECT * FROM proposals WHERE id = ?', [proposalId]);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'active') return res.status(409).json({ error: 'Proposal not active' });

    const membership = await db.get(
      'SELECT * FROM community_members WHERE community_id = ? AND user_id = ?',
      [proposal.community_id, req.user.id]
    );
    if (!membership) return res.status(403).json({ error: 'Not a member' });

    // Upsert vote
    await db.run(
      `INSERT INTO proposal_votes (proposal_id, user_id, vote, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(proposal_id, user_id) DO UPDATE SET vote = excluded.vote, created_at = excluded.created_at`,
      [proposalId, req.user.id, voteVal, now()]
    );

    // Check if passed (>50% of members voted for)
    const memberCountRow = await db.get(
      'SELECT COUNT(*) AS c FROM community_members WHERE community_id = ?', [proposal.community_id]
    );
    const total = memberCountRow.c;
    const votesForRow = await db.get(
      'SELECT COUNT(*) AS c FROM proposal_votes WHERE proposal_id = ? AND vote = 1', [proposalId]
    );
    const votesFor = votesForRow.c;
    if (votesFor > total / 2) {
      await db.run("UPDATE proposals SET status = 'passed' WHERE id = ?", [proposalId]);
      return res.json({ voted: voteVal, status: 'passed', votes_for: votesFor, total_members: total });
    }
    res.json({ voted: voteVal, status: 'active', votes_for: votesFor, total_members: total });
  } catch (e) {
    console.error('Vote error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
