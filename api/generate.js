/** Vercel function for /api/generate. All the logic lives in server/server.js. */

import { handleApi } from '../server/server.js';

export default function handler(req, res) {
  return handleApi(req, res, '/api/generate');
}
