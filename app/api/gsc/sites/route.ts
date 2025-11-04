import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json();

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing access token' },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: accessToken
    });

    const searchconsole = google.searchconsole({
      version: 'v1',
      auth: oauth2Client
    });

    const response = await searchconsole.sites.list();

    const sites = (response.data.siteEntry || []).map((site: any) => ({
      siteUrl: site.siteUrl,
      permissionLevel: site.permissionLevel
    }));

    return NextResponse.json({ sites });

  } catch (error: any) {
    console.error('Error fetching GSC sites:', error);

    if (error.code === 401 || error.code === 403) {
      return NextResponse.json(
        { error: 'Authorization expired or invalid. Please reconnect.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch GSC sites', details: error.message },
      { status: 500 }
    );
  }
}
