import crypto from 'node:crypto';
import type { AzuraResponse } from 'azurajs/types';
import { Controller, Get, Query, Res } from 'azurajs/decorators';
import { HttpError } from 'azurajs/utils';
import { client } from '#base';
import config from '#nori/config/default.config.js';

const FLUXER_API = config.links.fluxer.api;
const STATE_TTL_MS = 10 * 60_000;

type TokenResponse = {
  access_token: string;
  scope: string;
};

type OAuth2Error = {
  error?: string;
  error_description?: string;
};

type UserInfo = {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
};

const settings = () => {
  const { clientSecret, redirectUri, scopes } = config.api.oauth2;
  const clientId = client.user?.id;

  if (!clientId || !clientSecret || !redirectUri) throw new HttpError(500, 'OAuth2 is not configured');

  return { clientId, redirectUri: new URL(redirectUri).toString(), scopes, secret: clientSecret };
};

const sign = (payload: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(payload).digest('base64url');

const createState = (secret: string) => {
  const payload = `${Date.now()}.${crypto.randomBytes(8).toString('hex')}`;

  return `${payload}.${sign(payload, secret)}`;
};

const verifyState = (state: string, secret: string) => {
  const parts = state.split('.');

  if (parts.length !== 3) return false;

  const received = Buffer.from(parts[2] as string);
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret));

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return false;

  return Date.now() - Number(parts[0]) <= STATE_TTL_MS;
};

@Controller('/fluxer/oauth2')
export class OAuth2Controller {
  @Get('/login')
  login(@Res() res: AzuraResponse) {
    const { clientId, redirectUri, scopes, secret } = settings();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state: createState(secret),
    });

    res.json({ url: `${FLUXER_API}/oauth2/authorize?${params.toString()}` });
  }

  @Get('/callback')
  async callback(
    @Res() res: AzuraResponse,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    if (error) throw HttpError.badRequest(error);

    const { clientId, redirectUri, secret } = settings();

    if (!code || !state || !verifyState(state, secret)) throw HttpError.badRequest('Invalid or expired state');

    const tokenResponse = await fetch(`${FLUXER_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: secret,
      }),
    });

    if (!tokenResponse.ok) {
      const failure = (await tokenResponse.json().catch(() => ({}))) as OAuth2Error;

      throw HttpError.badRequest(failure.error_description ?? failure.error ?? 'Token exchange failed');
    }

    const token = (await tokenResponse.json()) as TokenResponse;

    const userResponse = await fetch(`${FLUXER_API}/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    if (!userResponse.ok) throw HttpError.badRequest('Could not read the user information');

    const user = (await userResponse.json()) as UserInfo;

    res.json({
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        globalName: user.global_name,
        avatar: user.avatar,
      },
      scopes: token.scope.split(' '),
    });
  }
}
