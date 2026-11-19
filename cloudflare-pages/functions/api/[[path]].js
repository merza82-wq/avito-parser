import { handleApi } from '../../lib/api.js';

export function onRequest({ request, env }) {
  return handleApi(request, env);
}
