const CHAPA_BASE = 'https://api.chapa.co/v1';
const SECRET_KEY = process.env.CHAPA_SECRET_KEY!;

export interface ChapaInitPayload {
  amount: string;
  currency: 'ETB';
  email: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  tx_ref: string;
  callback_url: string;
  return_url: string;
  'customization[title]': string;
  'customization[description]': string;
}

export interface ChapaInitResponse {
  status: string;
  message: string;
  data: { checkout_url: string };
}

export interface ChapaVerifyResponse {
  status: string;
  message: string;
  data: {
    status: string; // 'success' | 'failed' | 'pending'
    amount: number;
    currency: string;
    email: string;
    tx_ref: string;
    reference: string;
    created_at: string;
  };
}

export async function chapaInitialize(payload: ChapaInitPayload): Promise<ChapaInitResponse> {
  const res = await fetch(`${CHAPA_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chapa initialize failed: ${err}`);
  }
  return res.json();
}

export async function chapaVerify(txRef: string): Promise<ChapaVerifyResponse> {
  const res = await fetch(`${CHAPA_BASE}/transaction/verify/${encodeURIComponent(txRef)}`, {
    headers: { Authorization: `Bearer ${SECRET_KEY}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chapa verify failed: ${err}`);
  }
  return res.json();
}
