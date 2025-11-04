import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      const html = '<html><body><script>window.opener.postMessage({ error: "' + error + '" }, "*"); window.close();</script></body></html>';
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    }

    if (!code) {
      return NextResponse.json(
        { error: 'No authorization code received' },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + '/api/auth/callback'
    );

    const { tokens } = await oauth2Client.getToken(code);

    const expiresAt = tokens.expiry_date || 0;
    const accessToken = tokens.access_token || '';
    const refreshToken = tokens.refresh_token || '';

    const html = '<html><body><script>window.opener.postMessage({accessToken:"' + accessToken + '",refreshToken:"' + refreshToken + '",expiresAt:' + expiresAt + '},"*");window.close();</script></body></html>';

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    console.error('Error in OAuth callback:', error);
    const html = '<html><body><script>window.opener.postMessage({ error: "Authentication failed" }, "*"); window.close();</script></body></html>';
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
  }
}
