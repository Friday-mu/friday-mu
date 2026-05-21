'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_KNOWLEDGE_DIR = path.resolve(__dirname, '../../knowledge');

function truncateBlock(value, maxLength) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 24)).trimEnd()}\n[truncated for runtime prompt]`;
}

function loadJson(knowledgeDir, fileName) {
  try {
    const raw = fs.readFileSync(path.join(knowledgeDir, fileName), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function jsonSnippet(value, maxLength) {
  if (value == null) return '';
  return truncateBlock(JSON.stringify(value, null, 2), maxLength);
}

function addSection(parts, title, value, maxLength) {
  const body = typeof value === 'string' ? truncateBlock(value, maxLength) : jsonSnippet(value, maxLength);
  if (body) parts.push(`### ${title}\n${body}`);
}

function detectPlatform({ channel, contextText }) {
  const text = `${channel || ''}\n${contextText || ''}`.toLowerCase();
  if (text.includes('booking.com') || text.includes('bookingcom') || /\bbdc\b/.test(text)) return 'bookingCom';
  if (text.includes('airbnb')) return 'airbnb';
  if (text.includes('vrbo')) return 'vrbo';
  if (text.includes('whatsapp') || text.includes('direct') || text.includes('website') || text.includes('email')) return 'direct';
  return null;
}

function selectedTeamContext(team) {
  if (!team || typeof team !== 'object') return null;
  return {
    key_people: team.key_people || team.people || team.team || null,
    escalation: team.escalation || team.escalation_chains || team.escalationChains || null,
    support_rules: team.support_rules || team.supportRules || null,
  };
}

function buildRuntimeKnowledgeBlock({
  knowledgeDir = DEFAULT_KNOWLEDGE_DIR,
  channel,
  contextText,
} = {}) {
  const parts = [
    '[Runtime STR / Support / Sales / Ops Knowledge]\nUse this as binding runtime context with the composer output. Do not invent facts outside the thread, reservation context, property card, teachings, action feedback, or this runtime block.',
  ];

  const strEssentials = loadJson(knowledgeDir, 'str-essentials.json');
  const sales = loadJson(knowledgeDir, 'sales-knowledge.json');
  const ops = loadJson(knowledgeDir, 'ops-knowledge.json');
  const team = loadJson(knowledgeDir, 'team.json');
  const platformRules = loadJson(knowledgeDir, 'platform-rules.json');
  const platformKey = detectPlatform({ channel, contextText });

  if (strEssentials) {
    addSection(parts, 'STR essentials', {
      tone: strEssentials.tone,
      responseTiming: strEssentials.responseTiming,
      multilingual: strEssentials.multilingual,
      complaintHandling: strEssentials.complaintHandling,
      commonCorrections: strEssentials.commonCorrections,
      commonIssues: strEssentials.commonIssues,
    }, 5200);
  }
  if (sales) {
    addSection(parts, 'Sales knowledge', {
      follow_up_templates: sales.follow_up_templates,
      objection_handling: sales.objection_handling,
      general_selling_points: sales.general_selling_points,
    }, 3600);
  }
  if (ops) {
    addSection(parts, 'Support and ops knowledge', {
      slaTargets: ops.slaTargets,
      maintenanceWorkflow: ops.maintenanceWorkflow,
      checkoutCheckinWorkflow: ops.checkoutCheckinWorkflow,
      ownerCommunication: ops.ownerCommunication,
      cancellationFees: ops.cancellationFees,
    }, 4200);
  }
  if (platformRules) {
    const platform = platformKey && platformRules.platforms ? platformRules.platforms[platformKey] : null;
    if (platform) addSection(parts, `Platform rules: ${platformKey}`, platform, 4600);
    addSection(parts, 'Cross-platform rules', platformRules.crossPlatform || platformRules.complianceChecklist || null, 1800);
  }
  addSection(parts, 'Team and escalation context', selectedTeamContext(team), 2200);

  return parts.length > 1 ? `\n\n${parts.join('\n\n')}` : '';
}

module.exports = {
  buildRuntimeKnowledgeBlock,
  detectPlatform,
  truncateBlock,
  _test: {
    loadJson,
    selectedTeamContext,
  },
};
