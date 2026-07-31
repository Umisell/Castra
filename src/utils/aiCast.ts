type GenerateCastDraftParams = {
  draft: string;
  channel: string;
  visibility: string;
};

const localCastDraft = ({ draft, channel, visibility }: GenerateCastDraftParams) => {
  const cleanDraft = draft.trim().replace(/\s+/g, ' ');
  const topic = cleanDraft || `shipping a ${visibility} cast on ${channel}`;
  const variants = [
    `${topic}. Testing the flow end to end: wallet, storage, and feed sync in one clean pass.`,
    `${topic}. Keeping it simple today: publish, verify, and make sure the next viewer can read it without friction.`,
    `${topic}. Small update from Castra: the cast is stored, synced, and ready to be checked from another wallet.`,
  ];
  const seed = [...topic].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return variants[seed % variants.length].slice(0, 320);
};

const shouldUseLocalFallback = (status: number, message: string) => {
  const normalized = message.toLowerCase();
  return (
    status === 404 ||
    status === 501 ||
    status === 429 ||
    normalized.includes('openai_api_key') ||
    normalized.includes('quota') ||
    normalized.includes('billing') ||
    normalized.includes('not found')
  );
};

export const generateCastDraft = async ({ draft, channel, visibility }: GenerateCastDraftParams) => {
  const params = { draft, channel, visibility };
  try {
    const response = await fetch('/api/ai/cast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error || 'AI generator failed';
      if (shouldUseLocalFallback(response.status, message)) return localCastDraft(params);
      throw new Error(message);
    }

    if (!data?.text || typeof data.text !== 'string') {
      return localCastDraft(params);
    }

    return data.text.trim().slice(0, 320);
  } catch (error: any) {
    if (error?.message?.toLowerCase?.().includes('failed to fetch')) {
      return localCastDraft(params);
    }
    throw error;
  }
};
