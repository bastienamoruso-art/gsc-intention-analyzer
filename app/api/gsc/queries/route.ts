import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
  try {
    const { accessToken, siteUrl, startDate, endDate } = await request.json();

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing access token' },
        { status: 400 }
      );
    }

    if (!siteUrl || typeof siteUrl !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing site URL' },
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

    const response = await searchconsole.searchanalytics.query({
      siteUrl: siteUrl,
      requestBody: {
        startDate: startDate,
        endDate: endDate,
        dimensions: ['query'],
        rowLimit: 25000,
        dataState: 'final'
      }
    });

    const queries = (response.data.rows || []).map((row: any) => ({
      query: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0
    }));

    return NextResponse.json({
      queries,
      totalQueries: queries.length
    });

  } catch (error: any) {
    console.error('Error fetching GSC data:', error);

    if (error.code === 401 || error.code === 403) {
      return NextResponse.json(
        { error: 'Authorization expired or invalid. Please reconnect.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch GSC data', details: error.message },
      { status: 500 }
    );
  }
}
