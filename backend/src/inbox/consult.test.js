'use strict';

const {
  stripProtocolTags,
  parseDraftUpdate,
  parseConsultEnvelope,
  normalizeConsultDrafts,
  splitCombinedRecipientDraft,
  extractUntaggedDraftUpdate,
  instructionForbidsDraftUpdate,
  instructionRequestsDraftUpdate,
  shouldAllowDraftUpdatesForTurn,
  parseTeachingActions,
  filterDuplicateTaskSuggestions,
  formatExistingWorkForPrompt,
  extractPriorTaskSuggestionsFromHistory,
  selectConsultSurface,
  buildConsultUserMessage,
  buildCompactConsultUserMessage,
  compactConsultSystemPrompt,
  conversationIdForSession,
  websiteThreadIdForConversation,
  websiteEventBodyForConsult,
  websiteEventToConsultMessage,
  websiteConversationFromThread,
  isTransientConsultFailure,
  stripFullThreadEnvelope,
  sanitizeConsultHistory,
  CONSULT_FALLBACK_MODEL,
} = require('./consult')._test;

describe('FAD-native Consult helpers', () => {
  test('leaves compact fallback unpinned unless an explicit env model is configured', () => {
    expect(CONSULT_FALLBACK_MODEL).toBeNull();
  });

  test('extracts draft updates and strips protocol tags from visible response', () => {
    const raw = 'Done.\n[DRAFT_UPDATE]Hello guest\nThanks[/DRAFT_UPDATE]\n[TEACH]{"action":"create","instruction":"Keep it short"}[/TEACH]';
    expect(parseDraftUpdate(raw)).toBe('Hello guest\nThanks');
    expect(stripProtocolTags(raw)).toBe('Done.');
  });

  test('recovers untagged guest-facing drafts in draft contexts', () => {
    const raw = [
      'Sure, here is the email:',
      '',
      'hi Volodymyr,',
      '',
      'Thank you for your message. We will come back to you shortly.',
      '',
      'Best regards,',
      'Friday Retreats',
    ].join('\n');
    expect(extractUntaggedDraftUpdate(raw, 'compose')).toContain('Hi Volodymyr,');
    expect(extractUntaggedDraftUpdate(raw, 'message_review')).toBeNull();
  });

  test('blocks draft updates when an operator asks for review-only advice', () => {
    const reviewOnly = 'Review this conversation and tell me whether a reply is needed. Do not create or change any draft.';

    expect(instructionForbidsDraftUpdate(reviewOnly)).toBe(true);
    expect(shouldAllowDraftUpdatesForTurn('draft_review', reviewOnly)).toBe(false);
    expect(shouldAllowDraftUpdatesForTurn('compose', 'Do not create a reply draft; just tell me the risk.')).toBe(false);
  });

  test('allows draft updates for explicit revision requests in draft review', () => {
    expect(instructionRequestsDraftUpdate('Polish this and make it more formal.')).toBe(true);
    expect(shouldAllowDraftUpdatesForTurn('draft_review', 'Polish this and make it more formal.')).toBe(true);
    expect(shouldAllowDraftUpdatesForTurn('draft_review', 'What should I know before replying?')).toBe(false);
  });

  test('parses structured Consult envelopes with multiple separate drafts', () => {
    const envelope = JSON.stringify({
      response_text: 'I prepared two separate replies.',
      drafts: [
        {
          recipient_label: 'Maria',
          channel: 'email',
          body: 'hi Maria,\n\nThank you for your message.\n\nBest regards,\nFriday Retreats',
        },
        {
          recipient_label: 'Volodymyr',
          channel: 'email',
          body: 'Hello Volodymyr,\n\nThank you for the update.\n\nBest regards,\nFriday Retreats',
        },
      ],
      teaching_actions: [
        { action: 'create', instruction: 'Keep owner cc replies separate by recipient.', scope: 'global' },
      ],
      task_suggestions: [
        { title: 'Follow up with Maria about documents', department: 'office', priority: 'medium' },
      ],
    });

    const parsed = parseConsultEnvelope(envelope, 'compose');
    expect(parsed.responseText).toBe('I prepared two separate replies.');
    expect(parsed.drafts).toHaveLength(2);
    expect(parsed.drafts[0]).toMatchObject({
      recipientLabel: 'Maria',
      channel: 'email',
      body: expect.stringContaining('Hi Maria,'),
    });
    expect(parsed.drafts[1]).toMatchObject({
      recipientLabel: 'Volodymyr',
      body: expect.stringContaining('Hello Volodymyr,'),
    });
    expect(parsed.teachingActions).toHaveLength(1);
    expect(parsed.taskSuggestions).toHaveLength(1);
  });

  test('parses the first complete Consult envelope when provider JSON has a malformed tail', () => {
    const strayBrace = `{
  "response_text": "Review complete. No draft needed.",
  "drafts": [],
  "teaching_actions": [],
  "task_suggestions": []
}
}`;
    const malformedAppendix = '{"response_text":"Do nothing for now.","drafts":[],"teaching_actions":[],"task_suggestions":[]}\n[":null":[], "task_suggestions":[]}';

    const parsedStrayBrace = parseConsultEnvelope(strayBrace, 'message_review');
    const parsedMalformedAppendix = parseConsultEnvelope(malformedAppendix, 'message_review');

    expect(parsedStrayBrace.responseText).toBe('Review complete. No draft needed.');
    expect(parsedStrayBrace.drafts).toEqual([]);
    expect(parsedMalformedAppendix.responseText).toBe('Do nothing for now.');
    expect(parsedMalformedAppendix.drafts).toEqual([]);
  });

  test('normalizes draft_update compatibility into structured draft objects', () => {
    expect(normalizeConsultDrafts({ draft_update: 'hello Guest,\n\nThanks.' })).toEqual([
      { body: 'Hello Guest,\n\nThanks.', recipientLabel: null, channel: null, targetHint: null },
    ]);
  });

  test('recovers email-style draft text from response_text into a draft card', () => {
    const parsed = parseConsultEnvelope(
      JSON.stringify({
        response_text: 'Hello Maria,\n\nThank you for your message. We will confirm shortly.\n\nBest regards,\nFriday Retreats',
        drafts: [],
      }),
      'compose',
      {},
      { allowResponseTextDraftRecovery: true },
    );

    expect(parsed.responseText).toBe('Done — I prepared the draft.');
    expect(parsed.drafts).toEqual([
      {
        body: expect.stringContaining('Hello Maria,'),
        recipientLabel: null,
        channel: null,
        targetHint: null,
      },
    ]);
  });

  test('does not recover response_text drafts unless the turn allows draft updates', () => {
    const parsed = parseConsultEnvelope(JSON.stringify({
      response_text: 'Hello Maria,\n\nThank you for your message.\n\nBest regards,\nFriday Retreats',
      drafts: [],
    }), 'draft_review');

    expect(parsed.responseText).toContain('Hello Maria');
    expect(parsed.drafts).toEqual([]);
  });

  test('splits one combined multi-recipient draft into separate draft cards', () => {
    const drafts = normalizeConsultDrafts({
      drafts: [{
        channel: 'email',
        body: 'To Maria:\nhello Maria,\n\nWe will send the file shortly.\n\nTo Volodymyr:\nhello Volodymyr,\n\nWe waived the fee this time.',
      }],
    });

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      recipientLabel: 'Maria',
      channel: 'email',
      body: expect.stringContaining('Hello Maria,'),
    });
    expect(drafts[1]).toMatchObject({
      recipientLabel: 'Volodymyr',
      channel: 'email',
      body: expect.stringContaining('Hello Volodymyr,'),
    });
    expect(splitCombinedRecipientDraft({
      recipientLabel: 'Guest',
      body: 'To Maria:\nhello Maria.\n\nTo Volodymyr:\nhello Volodymyr.',
    }).map((draft) => draft.recipientLabel)).toEqual(['Maria', 'Volodymyr']);
    expect(splitCombinedRecipientDraft({ body: 'Hello guest', recipientLabel: null })).toHaveLength(1);
  });

  test('filters duplicate task suggestions against existing thread work', () => {
    const suggestions = [
      {
        title: 'Fix the toilet leak at GBH-C8',
        description: 'Guest reports flooding in the bathroom.',
      },
      {
        title: 'Restock coffee capsules at GBH-C8',
        description: 'Add capsules before arrival.',
      },
    ];
    const existingWork = [
      {
        kind: 'pending_action',
        action_text: 'Fix toilet leak at GBH-C8 after guest reported bathroom flooding',
        status: 'open',
      },
    ];

    const filtered = filterDuplicateTaskSuggestions(suggestions, existingWork);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toContain('Restock coffee');
  });

  test('extracts prior Consult task suggestions from history for duplicate suppression', () => {
    const prior = extractPriorTaskSuggestionsFromHistory([
      {
        role: 'assistant',
        content: JSON.stringify({
          response_text: 'Review below.',
          task_suggestions: [
            {
              title: 'Assess the water leak at BW-C4',
              description: 'Guest reports water leak and needs follow-up.',
              department: 'maintenance',
              priority: 'urgent',
            },
          ],
        }),
      },
    ]);
    expect(prior).toHaveLength(1);
    expect(prior[0]).toMatchObject({ kind: 'prior_task_suggestion', title: 'Assess the water leak at BW-C4' });

    const filtered = filterDuplicateTaskSuggestions([
      { title: 'Assess water leak at BW-C4', description: 'Follow up with the guest.' },
    ], prior);
    expect(filtered).toHaveLength(0);
  });

  test('parses teaching JSON and resolves T-number references to UUIDs', () => {
    const raw = '[TEACH]{"action":"flag_conflict","conflicting":"T2","instruction":"Mention pool hours","scope":"property","property_code":"BS-1","reason":"new operator rule"}[/TEACH]';
    const actions = parseTeachingActions(raw, { T2: '11111111-1111-4111-8111-111111111111' });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      action: 'flag_conflict',
      instruction: 'Mention pool hours',
      scope: 'property',
      propertyCode: 'BS-1',
      conflictingTeachingId: '11111111-1111-4111-8111-111111111111',
      conflictingTeachingIndex: 'T2',
    });
  });

  test('maps Consult contexts onto FAD knowledge surfaces', () => {
    expect(selectConsultSurface('compose')).toBe('inbox-drafts');
    expect(selectConsultSurface('draft_review')).toBe('inbox-drafts');
    expect(selectConsultSurface('pending_action')).toBe('pending-actions');
    expect(selectConsultSurface('message_review')).toBe('inbox-advisory');
    expect(selectConsultSurface('learning_candidate')).toBe('learning-analyzer');
  });

  test('only UUID conversation ids are persisted on consult sessions', () => {
    expect(conversationIdForSession('6844ad5c-1e74-45e1-95d0-f2ad4e290bca')).toBe('6844ad5c-1e74-45e1-95d0-f2ad4e290bca');
    expect(conversationIdForSession('web-a76f8a9d-fea8-4214-88ed-912dc91e6fb9')).toBeNull();
  });

  test('recognizes website inbox conversation ids without persisting them as UUID sessions', () => {
    expect(websiteThreadIdForConversation('web-a76f8a9d-fea8-4214-88ed-912dc91e6fb9')).toBe('a76f8a9d-fea8-4214-88ed-912dc91e6fb9');
    expect(websiteThreadIdForConversation('a76f8a9d-fea8-4214-88ed-912dc91e6fb9')).toBeNull();
    expect(websiteThreadIdForConversation('web-not-a-uuid')).toBeNull();
  });

  test('turns website AI handoff events into Consult-readable message context', () => {
    const event = {
      id: '22222222-2222-4222-8222-222222222222',
      event_type: 'website.ai_handoff',
      source: 'website_ai',
      created_at: '2026-05-22T08:00:00.000Z',
      payload: {
        visitorTurn: 'Can someone help me with check-in?',
        conversationSummary: 'Guest is confused about arrival logistics.',
        transcriptTail: [
          { role: 'assistant', content: 'How can I help?' },
          { role: 'user', content: 'Check-in please' },
        ],
        extracted: { property: 'GBH-1', eta: '18:00' },
        toolsUsed: ['policy'],
        confidence: 'medium',
        escalationReason: 'Needs operational confirmation',
      },
    };

    const body = websiteEventBodyForConsult(event);
    expect(body).toContain('Latest visitor turn');
    expect(body).toContain('Can someone help me with check-in?');
    expect(body).toContain('Website AI summary');
    expect(body).toContain('Visitor: Check-in please');
    expect(body).toContain('- property: GBH-1');
    expect(body).toContain('Escalation reason: Needs operational confirmation');

    const message = websiteEventToConsultMessage(event);
    expect(message).toMatchObject({
      direction: 'inbound',
      sender_name: 'Website AI handoff',
      module_type: 'website_inbox',
    });
  });

  test('builds website thread conversation context with property and summary signals', () => {
    const conversation = websiteConversationFromThread(
      {
        id: 'a76f8a9d-fea8-4214-88ed-912dc91e6fb9',
        guest_email: 'website-ai+session@friday.mu',
        guest_email_raw: 'website-ai+session@friday.mu',
        guest_name: 'Website AI · Guest',
        guest_phone: null,
        status: 'in_progress',
        notes: 'AI handoff (low) — human needed',
      },
      [{
        event_type: 'website.ai_handoff',
        payload: {
          conversationSummary: 'Owner asks if Friday can manage a villa.',
          extracted: { property: 'Tamarin Villa' },
        },
      }],
      'web-a76f8a9d-fea8-4214-88ed-912dc91e6fb9',
    );

    expect(conversation).toMatchObject({
      id: 'web-a76f8a9d-fea8-4214-88ed-912dc91e6fb9',
      source_thread_id: 'a76f8a9d-fea8-4214-88ed-912dc91e6fb9',
      channel: 'website',
      communication_channel: 'website',
      property_name: 'Tamarin Villa',
      conversation_summary: 'Owner asks if Friday can manage a villa.',
    });
  });

  test('builds a conversation-bound user prompt with draft and session context', () => {
    const message = buildConsultUserMessage({
      instruction: 'Make it shorter',
      context: 'revision',
      conversation: {
        id: 'c1',
        guest_name: 'Guest A',
        property_name: 'BS-1',
        channel: 'whatsapp',
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-08',
        num_guests: 2,
        status: 'active',
        reservation_context: {
          guesty_reservation_id: 'g-1',
          listing_name: 'BS-1',
          status: 'confirmed',
          channel: 'whatsapp',
          check_in: '2026-06-01',
          check_out: '2026-06-08',
          number_of_nights: 7,
          num_guests: 2,
          total_price: 1400,
          currency: 'EUR',
          availability_context: { status: 'missing', message: 'No cached rows' },
        },
      },
      messages: [],
      draftBody: 'Long draft',
      sessionHistory: [{ role: 'user', content: 'Earlier ask', sender: 'Ishant' }],
      currentSessionSummary: 'Prior decision',
      existingWork: [{
        kind: 'ops_task',
        title: 'Fix toilet leak at BS-1',
        status: 'scheduled',
        due_date: '2026-06-02',
      }],
    });
    expect(message).toContain('Guest: Guest A');
    expect(message).toContain('Reservation / Financial / Availability Context');
    expect(message).toContain('€1,400.00');
    expect(message).toContain('do not invent rates or open dates');
    expect(message).toContain('[Current working draft]');
    expect(message).toContain('Long draft');
    expect(message).toContain('Prior decision');
    expect(message).toContain('[Existing open work for this thread]');
    expect(message).toContain('Fix toilet leak at BS-1');
    expect(message).toContain('Do not propose a duplicate task');
    expect(message).toContain('Make it shorter');
  });

  test('formats existing work blocks for Consult prompt context', () => {
    const block = formatExistingWorkForPrompt([
      { kind: 'pending_action', action_text: 'Ask owner about late checkout', status: 'open', owner: 'Mary' },
      { kind: 'ops_task', title: 'Schedule inspection at MV-1', status: 'ready', due_date: '2026-06-01' },
    ]);
    expect(block).toContain('Pending action: Ask owner about late checkout');
    expect(block).toContain('Ops task: Schedule inspection at MV-1');
    expect(block).toContain('suggest updating the existing item');
  });

  test('adds the latest status update guard to Consult prompts for incident update requests', () => {
    const message = buildConsultUserMessage({
      instruction: 'Rewrite the draft',
      context: 'compose',
      conversation: {
        id: 'c1',
        guest_name: 'Floriane Huc',
        property_name: 'RC-15',
        channel: 'airbnb',
        check_in_date: '2026-05-20',
        check_out_date: '2026-05-24',
        num_guests: 2,
        status: 'active',
        notes: null,
      },
      messages: [
        {
          direction: 'inbound',
          sender_name: 'Floriane Huc',
          body: "Bonjour. Nous sommes a l'appartement et il n'y a pas d'eau",
          translated_body: 'Hello. We are at the apartment and there is no water.',
          created_at: '2026-05-20T12:00:00Z',
        },
        {
          direction: 'inbound',
          sender_name: 'Floriane Huc',
          body: 'Bonjour avez vous du nouveau a nous communiquer ?',
          translated_body: 'Hello, do you have any news to communicate to us?',
          created_at: '2026-05-21T12:00:00Z',
        },
      ],
      draftBody: '',
      sessionHistory: [],
      currentSessionSummary: null,
    });

    expect(message).toContain('Latest status update guard');
    expect(message).toContain('Latest guest turn');
    expect(message).toContain('No staff note with a confirmed new status');
  });

  test('classifies Kimi timeouts and temporary upstream failures as transient', () => {
    expect(isTransientConsultFailure({ ok: false, error: 'timeout of 45000ms exceeded' })).toBe(true);
    expect(isTransientConsultFailure({ ok: false, error: 'empty response (finish_reason=length)', finishReason: 'length' })).toBe(true);
    expect(isTransientConsultFailure({ ok: false, status: 429, error: 'Too Many Requests' })).toBe(true);
    expect(isTransientConsultFailure({ ok: false, status: 503, error: 'upstream unavailable' })).toBe(true);
    expect(isTransientConsultFailure({ ok: false, status: 401, error: 'invalid api key' })).toBe(false);
    expect(isTransientConsultFailure({ ok: true })).toBe(false);
  });

  test('builds a compact fallback prompt with bounded thread and session context', () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({
      created_at: '2026-06-01T10:00:00Z',
      sender_name: i % 2 ? 'Friday' : 'Guest',
      direction: i % 2 ? 'outbound' : 'inbound',
      body: `Message ${i + 1}`,
    }));
    const sessionHistory = Array.from({ length: 7 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `Consult turn ${i + 1}`,
      sender: 'Ishant',
    }));

    const message = buildCompactConsultUserMessage({
      instruction: 'Please make the draft warmer',
      context: 'compose',
      conversation: {
        id: 'c1',
        guest_name: 'Guest A',
        property_name: 'BS-1',
        channel: 'whatsapp',
        check_in_date: '2026-06-01',
        check_out_date: '2026-06-08',
        num_guests: 2,
        status: 'active',
      },
      messages,
      draftBody: 'Current draft',
      sessionHistory,
      currentSessionSummary: 'Earlier decision',
    });

    expect(message).toContain('[Compact Consult context]');
    expect(message).toContain('Guest: Guest A');
    expect(message).not.toContain('Message 4');
    expect(message).toContain('Message 5');
    expect(message).toContain('Message 12');
    expect(message).toContain('Latest guest turn');
    expect(message).not.toContain('Consult turn 1');
    expect(message).toContain('Consult turn 4');
    expect(message).toContain('Consult turn 7');
    expect(message).toContain('Please make the draft warmer');
  });

  test('sanitizes legacy full-thread envelopes before reusing Consult history', () => {
    const bloated = [
      '[Operator requested FULL conversation context — 41 messages]',
      '[20/05/2026, 16:42:53] Friday: Thanks for confirming.',
      '[21/05/2026, 17:55:33] Guest: Please make me a realistic offer.',
      '',
      'My question: the cleaner did not come earlier than agreed',
    ].join('\n');

    expect(stripFullThreadEnvelope(bloated)).toBe('the cleaner did not come earlier than agreed');

    const sanitized = sanitizeConsultHistory([
      { role: 'user', content: bloated, sender: 'Ishant' },
      { role: 'assistant', content: 'Noted.' },
    ]);
    expect(sanitized[0].content).toBe('the cleaner did not come earlier than agreed');
    expect(JSON.stringify(sanitized)).not.toContain('41 messages');
    expect(JSON.stringify(sanitized)).not.toContain('Please make me a realistic offer');
  });

  test('compacts structured JSON envelopes before reusing Consult history', () => {
    const envelope = JSON.stringify({
      response_text: 'Prepared two separate drafts.',
      drafts: [
        { recipient_label: 'Maria', body: 'Hello Maria,\n\nFirst draft body.' },
        { recipient_label: 'Volodymyr', body: 'Hello Volodymyr,\n\nSecond draft body.' },
      ],
    });

    const sanitized = sanitizeConsultHistory([{ role: 'assistant', content: envelope }]);
    expect(sanitized[0].content).toContain('Prepared two separate drafts.');
    expect(sanitized[0].content).toContain('Draft 1 for Maria');
    expect(sanitized[0].content).toContain('Draft 2 for Volodymyr');
    expect(sanitized[0].content).not.toContain('response_text');
  });

  test('compact fallback system prompt preserves Consult draft protocol', () => {
    const prompt = compactConsultSystemPrompt({
      context: 'compose',
      propertyCode: 'BS-1',
      compactKnowledgeAppendix: '\n\n[Compact KB + Learning Context]\nT1: Keep operational promises verified.',
    });
    expect(prompt).toContain('Respond in English');
    expect(prompt).toContain('Return only valid JSON');
    expect(prompt).toContain('drafts[].body');
    expect(prompt).toContain('Use confidence gates');
    expect(prompt).toContain('Property code: BS-1');
    expect(prompt).toContain('Compact KB + Learning Context');
    expect(prompt).toContain('Keep operational promises verified');
  });
});
