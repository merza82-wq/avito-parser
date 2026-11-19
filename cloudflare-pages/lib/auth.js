const productionKey = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d';
const encode = new TextEncoder();

export function positiveId(value) {
  return /^[1-9]\d{0,15}$/.test(value ?? '') && Number.isSafeInteger(Number(value));
}

export async function validTelegramInitData(data, { botId, operatorId, now = Date.now(), publicKey = productionKey }) {
  if (!positiveId(botId) || !positiveId(operatorId) || !data || data.length > 8192) return false;
  const params = new URLSearchParams(data);
  if (new Set(params.keys()).size !== params.size) return false;
  const signature = params.get('signature');
  const rawDate = params.get('auth_date');
  if (!/^[A-Za-z0-9_-]{86}(?:==)?$/.test(signature ?? '') || !/^\d{10}$/.test(rawDate ?? '')) return false;
  const age = now / 1000 - Number(rawDate);
  if (age < -60 || age > 8 * 3600) return false;
  try {
    const user = JSON.parse(params.get('user'));
    if (user?.is_bot || String(user?.id) !== String(operatorId)) return false;
    params.delete('hash');
    params.delete('signature');
    params.sort();
    const text = `${botId}:WebAppData\n${[...params].map(([key, value]) => `${key}=${value}`).join('\n')}`;
    const bytes = Uint8Array.from(atob(signature.replaceAll('-', '+').replaceAll('_', '/').replace(/=+$/, '') + '=='),
      (character) => character.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(publicKey.match(/../g), (pair) => parseInt(pair, 16)),
      'Ed25519', false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, bytes, encode.encode(text));
  } catch {
    return false;
  }
}

export async function validSyncKey(provided, expected) {
  if (!/^[a-f0-9]{64}$/i.test(expected ?? '') || !/^[a-f0-9]{64}$/i.test(provided ?? '')) return false;
  const parts = await Promise.all([provided, expected].map((value) => crypto.subtle.digest('SHA-256', encode.encode(value))));
  const [left, right] = parts.map((part) => new Uint8Array(part));
  return left.reduce((difference, byte, index) => difference | (byte ^ right[index]), 0) === 0;
}
